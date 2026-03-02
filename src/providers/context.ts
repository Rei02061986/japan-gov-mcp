/**
 * context — 文脈付与・サジェストプロバイダ
 *
 * データの「意味」を付与する。
 * - percentile: 過去N年の分布における位置
 * - peers: 同カテゴリ内での順位・偏差値
 * - trend_context: トレンドの位置（山/谷/加速）
 * - annotate: join結果に一括文脈付与
 * - suggest: 次に調べるべきことを提案
 */

import { createError } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';
import * as estat from './estat.js';
import type { EStatConfig } from './estat.js';
import { getDashboardData } from './misc.js';
import * as boj from './boj.js';
import { codeLookup, areaBridge, timeBridge } from './resolve.js';
import {
  computePercentile,
  computeDistribution,
  findClosestPoints,
  deviationScore,
  rankItems,
  rankDescription,
} from '../lib/percentile.js';
import type { TimeSeriesPoint, Distribution } from '../lib/percentile.js';
import { analyzeTrend, findPeak, findTrough, findSimilarPatterns } from '../lib/trend-analyzer.js';
import { generateSuggestions, findRelatedIndicators } from '../lib/suggest-rules.js';
import type { SuggestContext, Suggestion } from '../lib/suggest-rules.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const historicalEvents = require('../data/historical-events.json') as HistoricalEventsData;
const areaData = require('../data/area-mapping.json') as AreaMapping;

// ── Types ──

interface HistoricalEvent {
  period: string;
  name: string;
  affects: string[];
}

interface HistoricalEventsData {
  events: HistoricalEvent[];
  indicator_keywords: Record<string, string[]>;
}

interface AreaMapping {
  prefectures: Record<string, { name: string; estatCode: string }>;
}

export interface ContextConfig {
  estat: EStatConfig;
}

// ── Internal helpers ──

/** 指標ラベルに関連する歴史イベントを検索 */
function findRelevantEvents(indicatorLabel: string): HistoricalEvent[] {
  const label = indicatorLabel.toLowerCase();
  const matchedCategories: string[] = [];

  for (const [cat, keywords] of Object.entries(historicalEvents.indicator_keywords)) {
    if (keywords.some(kw => label.includes(kw.toLowerCase()) || kw.toLowerCase().includes(label))) {
      matchedCategories.push(cat);
    }
  }

  if (matchedCategories.length === 0) return [];

  return historicalEvents.events.filter(ev =>
    ev.affects.some(a => matchedCategories.some(cat =>
      historicalEvents.indicator_keywords[cat]?.some(kw => a.includes(kw) || kw.includes(a)),
    )),
  );
}

/** 歴史イベントで注釈を付ける */
function annotateWithEvents(
  points: TimeSeriesPoint[],
  indicatorLabel: string,
): Array<{ period: string; value: number; note?: string }> {
  const events = findRelevantEvents(indicatorLabel);
  return points.map(p => {
    const ev = events.find(e => p.period.startsWith(e.period) || e.period.startsWith(p.period));
    return ev ? { ...p, note: ev.name } : p;
  });
}

/**
 * e-Statレスポンスから時系列データを抽出する。
 * e-Stat の VALUE 配列は [{@time, @area, @cat01..., $}, ...] 形式。
 */
function extractEstatTimeSeries(data: unknown, areaFilter?: string): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const root = (data as any)?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE;
  if (!Array.isArray(root)) return points;

  for (const row of root) {
    if (areaFilter && row['@area'] && !row['@area'].startsWith(areaFilter)) continue;
    const time = row['@time'] as string;
    const val = parseFloat(row['$']);
    if (!time || isNaN(val)) continue;

    // e-Stat time code → readable year: "2023000000" → "2023"
    const year = time.slice(0, 4);
    points.push({ period: year, value: val });
  }

  // Deduplicate by period (take first occurrence)
  const seen = new Set<string>();
  return points.filter(p => {
    if (seen.has(p.period)) return false;
    seen.add(p.period);
    return true;
  });
}

/** ダッシュボードレスポンスから時系列を抽出 */
function extractDashboardTimeSeries(data: unknown): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const records = (data as any)?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE
    ?? (data as any)?.data ?? (data as any);
  if (!Array.isArray(records)) return points;

  for (const rec of records) {
    const time = rec['@time'] ?? rec.time ?? rec.timeCd;
    const val = parseFloat(rec['$'] ?? rec.value ?? rec.data);
    if (!time || isNaN(val)) continue;
    points.push({ period: String(time).slice(0, 4), value: val });
  }
  return points;
}

/** BOJレスポンスから時系列を抽出 */
function extractBojTimeSeries(data: unknown): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const records = (data as any)?.data ?? (data as any);
  if (!Array.isArray(records)) return points;

  for (const rec of records) {
    const time = rec.date ?? rec.period;
    const val = parseFloat(rec.value ?? rec.obs_value);
    if (!time || isNaN(val)) continue;
    points.push({ period: String(time).slice(0, 4), value: val });
  }
  return points;
}

/**
 * 時系列データを内部的に取得する。
 * source/id/query から適切なプロバイダを呼び出し、TimeSeriesPoint[] を返す。
 */
async function fetchTimeSeries(
  source: string,
  id: string | undefined,
  query: string | undefined,
  area: string | undefined,
  windowYears: number,
  config: ContextConfig,
): Promise<{ points: TimeSeriesPoint[]; indicator: string; unit: string }> {
  // Resolve id from query if needed
  let resolvedId = id;
  let indicatorLabel = query || id || '不明';
  if (!resolvedId && query) {
    const lookup = codeLookup({ query, source: source === 'boj' ? 'boj' : source as any });
    if (lookup.success && lookup.data?.topic?.tools?.[0]?.params?.code) {
      resolvedId = lookup.data.topic.tools[0].params.code;
    }
    if (lookup.success && lookup.data?.topic?.name) {
      indicatorLabel = lookup.data.topic.name;
    }
  }

  // Resolve time range
  const currentYear = new Date().getFullYear();
  const fromYear = currentYear - windowYears;
  const tb = timeBridge({ from: String(fromYear), to: String(currentYear), freq: 'A' });
  const timeInfo = tb.success ? tb.data : undefined;

  // Resolve area code
  let areaCode: string | undefined;
  if (area) {
    const ab = areaBridge({ name: area, prefCode: area });
    if (ab.success) areaCode = ab.data?.estatCode;
  }

  switch (source) {
    case 'estat': {
      if (!config.estat.appId || !resolvedId) {
        return { points: [], indicator: indicatorLabel, unit: '' };
      }
      const r = await estat.getStatsData(config.estat, {
        statsDataId: resolvedId,
        cdTime: (timeInfo as any)?.estatCdTime,
        cdArea: areaCode,
        limit: 500,
      });
      return {
        points: r.success ? extractEstatTimeSeries(r.data, areaCode) : [],
        indicator: indicatorLabel,
        unit: '',
      };
    }

    case 'stats': {
      if (!resolvedId) return { points: [], indicator: indicatorLabel, unit: '' };
      const r = await getDashboardData({
        indicatorCode: resolvedId,
        regionCode: area,
        timeCdFrom: (timeInfo as any)?.bojPeriod?.from,
        timeCdTo: (timeInfo as any)?.bojPeriod?.to,
      });
      return {
        points: r.success ? extractDashboardTimeSeries(r.data) : [],
        indicator: indicatorLabel,
        unit: '',
      };
    }

    case 'boj': {
      if (!resolvedId) return { points: [], indicator: indicatorLabel, unit: '' };
      const r = await boj.getTimeSeriesData({
        seriesCode: resolvedId,
        startDate: (timeInfo as any)?.bojPeriod?.from,
        endDate: (timeInfo as any)?.bojPeriod?.to,
      });
      return {
        points: r.success ? extractBojTimeSeries(r.data) : [],
        indicator: indicatorLabel,
        unit: '',
      };
    }

    default:
      return { points: [], indicator: indicatorLabel, unit: '' };
  }
}

/**
 * 全47都道府県のデータを取得してpeerデータを構築する。
 * e-Stat は cdArea 未指定で全都道府県分を一括取得可能。
 */
async function fetchPeerData(
  source: string,
  id: string | undefined,
  config: ContextConfig,
): Promise<Array<{ code: string; name: string; value: number }>> {
  if (source !== 'estat' || !id || !config.estat.appId) return [];

  const r = await estat.getStatsData(config.estat, {
    statsDataId: id,
    limit: 2000,
  });
  if (!r.success) return [];

  const root = (r.data as any)?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE;
  if (!Array.isArray(root)) return [];

  // Group by area, take most recent time for each
  const byArea: Record<string, { time: string; value: number }> = {};
  for (const row of root) {
    const area = row['@area'] as string;
    const time = row['@time'] as string;
    const val = parseFloat(row['$']);
    if (!area || !time || isNaN(val)) continue;
    // Only prefecture-level areas (5 digit ending in 000)
    if (!area.endsWith('000') || area === '00000') continue;
    if (!byArea[area] || time > byArea[area].time) {
      byArea[area] = { time, value: val };
    }
  }

  // Map to prefCode
  const result: Array<{ code: string; name: string; value: number }> = [];
  for (const [estatCode, { value }] of Object.entries(byArea)) {
    const prefCode = estatCode.slice(0, 2);
    const pref = areaData.prefectures[prefCode];
    if (pref) {
      result.push({ code: prefCode, name: pref.name, value });
    }
  }

  return result;
}

// ═══ Exported Actions ═══

/**
 * percentile: 過去N年の分布における位置
 */
export async function percentile(params: {
  source: string;
  id?: string;
  query?: string;
  value: number;
  area?: string;
  window_years?: number;
}, config: ContextConfig): Promise<ApiResponse> {
  const src = 'context/percentile';
  const windowYears = params.window_years || 30;

  if (params.value === undefined || params.value === null) {
    return createError(src, '比較する値(value)が必要です');
  }

  try {
    const { points, indicator, unit } = await fetchTimeSeries(
      params.source, params.id, params.query, params.area, windowYears, config,
    );

    const values = points.map(p => p.value);
    if (values.length === 0) {
      const areaHint = params.area
        ? `地域コード「${params.area}」に一致するデータがありません。prefCode（例: "13"=東京都）で指定してください。estatAreaCode（例: "13000"）ではなくprefCodeを使用します。`
        : `${indicator}の過去データを取得できませんでした。id を直接指定するか、source/query を確認してください`;
      return createError(src, areaHint);
    }

    const pct = computePercentile(params.value, values);
    const dist = computeDistribution(values);
    const closest = findClosestPoints(params.value, points, 3);
    const desc = rankDescription(params.value, values, windowYears);

    // Annotate closest with historical events
    const comparisons = annotateWithEvents(closest, indicator);

    return {
      success: true,
      data: {
        value: params.value,
        percentile: pct,
        rank_description: desc,
        distribution: dist,
        historical_comparisons: comparisons,
        source_meta: {
          indicator,
          unit,
          period_range: points.length > 0
            ? `${points[0].period}〜${points[points.length - 1].period}`
            : '',
          data_points: values.length,
        },
      },
      source: src,
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    return createError(src, e.message);
  }
}

/**
 * peers: 同カテゴリ内での順位・偏差値
 */
export async function peers(params: {
  source: string;
  id?: string;
  query?: string;
  target: string;
  peer_group?: string;
  period?: string;
}, config: ContextConfig): Promise<ApiResponse> {
  const src = 'context/peers';

  // Resolve target
  const targetBridge = areaBridge({ name: params.target, prefCode: params.target });
  if (!targetBridge.success) {
    return createError(src, `対象「${params.target}」を特定できません`);
  }
  const targetCode = targetBridge.data?.prefCode || targetBridge.data?.cityCode;
  const targetName = targetBridge.data?.name || targetBridge.data?.prefName;

  // Resolve id from query if needed
  let resolvedId = params.id;
  if (!resolvedId && params.query) {
    const lookup = codeLookup({ query: params.query, source: params.source as any });
    if (lookup.success && lookup.data?.topic?.tools?.[0]?.params?.id) {
      resolvedId = lookup.data.topic.tools[0].params.id;
    }
  }

  try {
    const peerData = await fetchPeerData(params.source, resolvedId, config);

    if (peerData.length < 2) {
      return createError(src, `ピアデータが不足しています（${peerData.length}件）。statsDataId(id)を直接指定してください`);
    }

    const values = peerData.map(p => p.value);
    const dist = computeDistribution(values);

    // Find target in peer data
    const targetEntry = peerData.find(p => p.code === targetCode || p.name === targetName);
    const targetValue = targetEntry?.value ?? 0;

    // Rank (ascending by default for indicators like birthrate)
    const ranked = rankItems(peerData, p => p.value, true);
    const targetRank = ranked.find(p => p.code === targetCode || p.name === targetName)?.rank ?? 0;

    const pctInPeers = computePercentile(targetValue, values);
    const devScore = deviationScore(targetValue, dist.mean, dist.stdev);

    // Neighbors: 2 above, 2 below
    const targetIdx = ranked.findIndex(p => p.code === targetCode || p.name === targetName);
    const neighbors = ranked
      .slice(Math.max(0, targetIdx - 2), targetIdx + 3)
      .filter(p => p.code !== targetCode && p.name !== targetName)
      .map(p => ({ rank: p.rank, name: p.name, value: p.value }));

    const top3 = ranked.slice(0, 3).map(p => ({ rank: p.rank, name: p.name, value: p.value }));
    const bottom3 = ranked.slice(-3).map(p => ({ rank: p.rank, name: p.name, value: p.value }));

    return {
      success: true,
      data: {
        target: { name: targetName, code: targetCode, value: targetValue },
        rank: targetRank,
        total: peerData.length,
        percentile_in_peers: pctInPeers,
        deviation_score: devScore,
        peer_stats: {
          mean: dist.mean,
          median: dist.median,
          stdev: dist.stdev,
          min: { name: ranked[ranked.length - 1]?.name, value: ranked[ranked.length - 1]?.value },
          max: { name: ranked[0]?.name, value: ranked[0]?.value },
        },
        neighbors,
        top3,
        bottom3,
      },
      source: src,
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    return createError(src, e.message);
  }
}

/**
 * trend_context: トレンドの位置（山/谷/加速）
 */
export async function trendContext(params: {
  source: string;
  id?: string;
  query?: string;
  area?: string;
  current_value?: number;
  lookback_years?: number;
  recent_n?: number;
}, config: ContextConfig): Promise<ApiResponse> {
  const src = 'context/trend_context';
  const lookback = params.lookback_years || 10;

  try {
    const { points, indicator, unit } = await fetchTimeSeries(
      params.source, params.id, params.query, params.area, lookback, config,
    );

    if (points.length < 2) {
      const areaHint = params.area
        ? ` 地域コード「${params.area}」に一致するデータがない可能性があります。prefCode（例: "13"=東京都）で指定してください。`
        : '';
      return createError(src, `${indicator}のデータが不足しています（${points.length}点）。時系列分析には最低2点必要です。${areaHint}`);
    }

    const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
    const currentValue = params.current_value ?? sorted[sorted.length - 1].value;
    const currentPeriod = sorted[sorted.length - 1].period;

    const trend = analyzeTrend(sorted, { recent_n: params.recent_n });
    const peak = findPeak(sorted, currentValue);
    const trough = findTrough(sorted, currentValue);
    const similar = findSimilarPatterns(sorted);

    // Annotate similar patterns with historical events
    const events = findRelevantEvents(indicator);
    const annotatedSimilar = similar.map(s => {
      const ev = events.find(e => s.period_range.includes(e.period));
      return ev ? { ...s, pattern: ev.name } : s;
    });

    return {
      success: true,
      data: {
        current: { value: currentValue, period: currentPeriod },
        trend,
        from_peak: peak,
        from_trough: trough,
        similar_patterns: annotatedSimilar,
        source_meta: { indicator, unit, freq: 'A' },
      },
      source: src,
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    return createError(src, e.message);
  }
}

/**
 * annotate: join結果に一括文脈付与
 */
export async function annotate(params: {
  joined_data: {
    indicators?: Array<{ label: string; source: string; success: boolean; data?: unknown }>;
    axis?: { time?: unknown; area?: unknown };
    metadata?: { sources?: Array<{ label: string; source: string; id?: string; unit?: string }> };
  };
  depth?: 'quick' | 'standard' | 'deep';
}, config: ContextConfig): Promise<ApiResponse> {
  const src = 'context/annotate';
  const depth = params.depth || 'standard';

  if (!params.joined_data) {
    return createError(src, 'joined_data（join.fetch_alignedの出力）が必要です');
  }

  // Extract indicator info from joined_data
  const indicators = params.joined_data.indicators || [];
  const sources = params.joined_data.metadata?.sources || [];

  if (indicators.length === 0 && sources.length === 0) {
    return createError(src, 'joined_dataにindicatorsまたはmetadata.sourcesが必要です');
  }

  const context: Record<string, unknown> = {};
  const alerts: Array<{ indicator: string; area?: string; type: string; message: string; severity: string }> = [];

  // Process each indicator
  const indicatorList = sources.length > 0
    ? sources.map(s => ({ label: s.label, source: s.source, id: s.id }))
    : indicators.map(i => ({ label: i.label, source: i.source, id: undefined }));

  const promises = indicatorList.map(async (ind) => {
    try {
      // Extract values from this indicator's data
      let points: TimeSeriesPoint[] = [];
      const matchingIndicator = indicators.find(i => i.label === ind.label);
      if (matchingIndicator?.success && matchingIndicator.data) {
        points = extractEstatTimeSeries(matchingIndicator.data)
          || extractDashboardTimeSeries(matchingIndicator.data)
          || [];
      }

      const values = points.map(p => p.value);
      const indContext: Record<string, unknown> = {};

      // Percentile (always computed)
      if (values.length > 0) {
        const dist = computeDistribution(values);
        const byRow = points.map(p => ({
          period: p.period,
          value: p.value,
          percentile: computePercentile(p.value, values),
        }));

        indContext.percentile = {
          window_years: values.length,
          distribution: { min: dist.min, median: dist.median, max: dist.max, mean: dist.mean, stdev: dist.stdev },
          by_row: byRow,
          historical_comparisons: annotateWithEvents(
            findClosestPoints(values[values.length - 1], points, 3),
            ind.label,
          ),
        };

        // Check for alerts
        const latestPct = byRow[byRow.length - 1]?.percentile ?? 50;
        if (latestPct >= 99) {
          alerts.push({
            indicator: ind.label,
            type: '過去最高',
            message: `${ind.label}が過去${values.length}年で最高水準`,
            severity: 'warning',
          });
        } else if (latestPct <= 1) {
          alerts.push({
            indicator: ind.label,
            type: '過去最低',
            message: `${ind.label}が過去${values.length}年で最低水準`,
            severity: 'warning',
          });
        }

        // Check for sudden change (2σ)
        if (values.length >= 3) {
          const last = values[values.length - 1];
          const prev = values[values.length - 2];
          const change = Math.abs(last - prev);
          if (dist.stdev > 0 && change > 2 * dist.stdev) {
            alerts.push({
              indicator: ind.label,
              type: '急変',
              message: `${ind.label}の前期比変動が2σを超過（変動: ${Math.round(change * 100) / 100}）`,
              severity: 'critical',
            });
          }
        }
      }

      // Trend (standard and deep)
      if (depth !== 'quick' && points.length >= 2) {
        const trend = analyzeTrend(points);
        const peak = findPeak(points, points[points.length - 1].value);
        const trough = findTrough(points, points[points.length - 1].value);
        indContext.trend = { direction: trend.direction, duration_periods: trend.duration_periods, velocity: trend.velocity, from_peak: peak, from_trough: trough };

        // Trend reversal alert
        if (points.length >= 4) {
          const prevTrend = analyzeTrend(points.slice(0, -1));
          if (prevTrend.direction !== trend.direction && trend.direction !== '横ばい' && prevTrend.direction !== '横ばい') {
            alerts.push({
              indicator: ind.label,
              type: 'トレンド転換',
              message: `${ind.label}が${prevTrend.direction}→${trend.direction}に転換`,
              severity: 'info',
            });
          }
        }
      }

      return { label: ind.label, context: indContext };
    } catch {
      return { label: ind.label, context: {} };
    }
  });

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled') {
      context[r.value.label] = r.value.context;
    }
  }

  // Generate suggestions
  const suggestCtx: SuggestContext = {
    current_indicators: indicatorList.map(i => ({ source: i.source, id: i.id, label: i.label })),
    alerts: alerts.map(a => ({ type: a.type, indicator: a.indicator, area: a.area })),
  };

  const suggestions = generateSuggestions(suggestCtx);

  return {
    success: true,
    data: {
      context,
      alerts,
      suggestions,
    },
    source: src,
    timestamp: new Date().toISOString(),
  };
}

/**
 * suggest: 次に調べるべきことを提案
 */
export function suggest(params: {
  topic?: string;
  current_indicators?: Array<{ source: string; id?: string; query?: string; label: string }>;
  alerts?: Array<{ type: string; indicator: string; area?: string; period?: string }>;
  area_level?: string;
  unique_areas?: string[];
}): ApiResponse {
  const src = 'context/suggest';

  const ctx: SuggestContext = {
    topic: params.topic,
    area_level: (params.area_level as 'pref' | 'city' | 'national') || undefined,
    unique_areas: params.unique_areas,
    current_indicators: params.current_indicators || [],
    alerts: params.alerts || [],
  };

  const suggestions = generateSuggestions(ctx);

  // Build narrative
  let narrative = '';
  if (suggestions.length === 0) {
    narrative = 'データの文脈から追加の分析提案はありません。';
  } else {
    const highPri = suggestions.filter(s => s.priority === 'high');
    if (highPri.length > 0) {
      narrative = `重要: ${highPri.map(s => s.title).join('、')}`;
    } else {
      narrative = `推奨: ${suggestions[0].title}`;
    }
    narrative += `（計${suggestions.length}件の提案）`;
  }

  return {
    success: true,
    data: { suggestions, narrative },
    source: src,
    timestamp: new Date().toISOString(),
  };
}
