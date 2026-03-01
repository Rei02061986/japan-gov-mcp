/**
 * join — データ結合・正規化プロバイダ
 *
 * 複数のデータソースを時間軸・地域軸・単位を統一して結合する。
 * - fetch_aligned: 複数APIを粒度統一して同時取得
 * - normalize: 単位・スケール変換
 * - fill_gaps: 欠損検知（補完しない）
 */

import { createError } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';
import * as estat from './estat.js';
import type { EStatConfig } from './estat.js';
import { getDashboardData } from './misc.js';
import * as boj from './boj.js';
import { codeLookup, areaBridge, timeBridge } from './resolve.js';

// ── Config type (mirrors index.ts C object shape) ──
interface JoinConfig {
  estat: EStatConfig;
}

// ── Unit Conversion Rules ──

interface ConversionRule {
  from: string;
  to: string;
  fn: (v: number) => number;
}

const UNIT_RULES: ConversionRule[] = [
  { from: '千人', to: '人', fn: v => v * 1000 },
  { from: '万人', to: '人', fn: v => v * 10000 },
  { from: '百万円', to: '億円', fn: v => v / 100 },
  { from: '千円', to: '万円', fn: v => v / 10 },
  { from: '千円', to: '億円', fn: v => v / 100000 },
  { from: '百万円', to: '兆円', fn: v => v / 1000000 },
  { from: '千台', to: '台', fn: v => v * 1000 },
  { from: '千戸', to: '戸', fn: v => v * 1000 },
  { from: '%ポイント', to: '%', fn: v => v }, // same
  { from: 'ポイント', to: '%', fn: v => v },
];

function findConversion(from: string, to: string): ((v: number) => number) | undefined {
  const rule = UNIT_RULES.find(r => r.from === from && r.to === to);
  return rule?.fn;
}

// ═══ fetch_aligned ═══

interface Indicator {
  source: 'estat' | 'stats' | 'boj';
  query?: string;
  id?: string;
  label: string;
}

/**
 * 複数APIを粒度統一して同時取得
 */
export async function fetchAligned(params: {
  indicators: Indicator[];
  axis?: {
    time?: { from: string; to: string; freq?: 'A' | 'Q' | 'M' };
    area?: { prefCodes?: string[] };
  };
}, config: JoinConfig): Promise<ApiResponse> {
  const source = 'join/fetch_aligned';

  if (!params.indicators || params.indicators.length === 0) {
    return createError(source, 'indicators is required (at least 1)');
  }

  // Resolve time axis
  let timeInfo: Record<string, unknown> | undefined;
  if (params.axis?.time) {
    const tb = timeBridge({
      from: params.axis.time.from,
      to: params.axis.time.to,
      freq: params.axis.time.freq,
    });
    if (tb.success) timeInfo = tb.data;
  }

  // Resolve area axis
  let areaInfo: Record<string, unknown> | undefined;
  if (params.axis?.area?.prefCodes?.[0]) {
    const ab = areaBridge({ prefCode: params.axis.area.prefCodes[0] });
    if (ab.success) areaInfo = ab.data;
  }

  // Fetch each indicator in parallel
  const promises = params.indicators.map(async (ind): Promise<{
    label: string;
    source: string;
    success: boolean;
    data?: unknown;
    error?: string;
  }> => {
    try {
      // If query given but no id, try code_lookup first
      let resolvedId = ind.id;
      if (!resolvedId && ind.query) {
        const lookup = codeLookup({ query: ind.query, source: ind.source === 'boj' ? 'boj' : ind.source });
        if (lookup.success && lookup.data?.topic?.tools?.[0]?.params?.code) {
          resolvedId = lookup.data.topic.tools[0].params.code;
        }
      }

      switch (ind.source) {
        case 'estat': {
          if (!config.estat.appId) {
            return { label: ind.label, source: 'estat', success: false, error: 'ESTAT_APP_ID未設定' };
          }
          if (resolvedId) {
            const result = await estat.getStatsData(config.estat, {
              statsDataId: resolvedId,
              cdTime: (timeInfo as any)?.estatCdTime,
              cdArea: (areaInfo as any)?.estatCode,
              limit: 100,
            });
            return { label: ind.label, source: 'estat', success: result.success, data: result.data, error: result.error };
          }
          // Fallback to search
          const searchResult = await estat.getStatsList(config.estat, {
            searchWord: ind.query || ind.label,
            limit: 5,
          });
          return { label: ind.label, source: 'estat', success: searchResult.success, data: searchResult.data, error: searchResult.error };
        }

        case 'stats': {
          if (resolvedId) {
            const result = await getDashboardData({
              indicatorCode: resolvedId,
              regionCode: (areaInfo as any)?.prefCode,
              timeCdFrom: (timeInfo as any)?.bojPeriod?.from,
              timeCdTo: (timeInfo as any)?.bojPeriod?.to,
            });
            return { label: ind.label, source: 'dashboard', success: result.success, data: result.data, error: result.error };
          }
          return { label: ind.label, source: 'dashboard', success: false, error: '指標コード(id)が必要です' };
        }

        case 'boj': {
          if (resolvedId) {
            const result = await boj.getTimeSeriesData({
              seriesCode: resolvedId,
              startDate: (timeInfo as any)?.bojPeriod?.from,
              endDate: (timeInfo as any)?.bojPeriod?.to,
            });
            return { label: ind.label, source: 'boj', success: result.success, data: result.data, error: result.error };
          }
          return { label: ind.label, source: 'boj', success: false, error: '系列コード(id)が必要です' };
        }

        default:
          return { label: ind.label, source: ind.source, success: false, error: `未対応のソース: ${ind.source}` };
      }
    } catch (e: any) {
      return { label: ind.label, source: ind.source, success: false, error: e.message };
    }
  });

  const results = await Promise.allSettled(promises);

  const fetchResults = results.map(r =>
    r.status === 'fulfilled' ? r.value : { label: '?', source: '?', success: false, error: String(r.reason) }
  );

  const warnings: string[] = [];
  for (const r of fetchResults) {
    if (!r.success) warnings.push(`${r.label}: ${r.error}`);
  }

  return {
    success: true,
    data: {
      indicators: fetchResults,
      axis: {
        time: timeInfo,
        area: areaInfo,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    source,
    timestamp: new Date().toISOString(),
  };
}

// ═══ normalize ═══

interface NormalizeRecord {
  time?: string;
  value: number | string;
  unit?: string;
}

interface NormalizeRule {
  fromUnit: string;
  toUnit: string;
}

/**
 * 単位・スケール変換
 */
export function normalize(params: {
  data: NormalizeRecord[];
  rules: NormalizeRule[];
}): ApiResponse {
  const source = 'join/normalize';
  if (!params.data || params.data.length === 0) {
    return createError(source, 'data is required');
  }
  if (!params.rules || params.rules.length === 0) {
    return createError(source, 'rules is required');
  }

  const log: string[] = [];
  const result = params.data.map(record => {
    let value = typeof record.value === 'string' ? parseFloat(record.value) : record.value;
    let unit = record.unit || '';
    let converted = false;

    if (!isNaN(value)) {
      for (const rule of params.rules) {
        if (unit === rule.fromUnit || (!unit && rule.fromUnit === '*')) {
          const fn = findConversion(rule.fromUnit, rule.toUnit);
          if (fn) {
            const oldValue = value;
            value = fn(value);
            unit = rule.toUnit;
            converted = true;
            log.push(`${record.time || '?'}: ${oldValue} ${rule.fromUnit} → ${value} ${rule.toUnit}`);
          } else {
            log.push(`${record.time || '?'}: 変換ルール未定義 (${rule.fromUnit} → ${rule.toUnit})`);
          }
        }
      }
    }

    return {
      time: record.time,
      value: isNaN(value) ? record.value : value,
      unit,
      converted,
    };
  });

  return {
    success: true,
    data: { records: result, log },
    source,
    timestamp: new Date().toISOString(),
  };
}

// ═══ fill_gaps ═══

/**
 * 時系列の欠損を検知（補完はしない）
 */
export function fillGaps(params: {
  records: Array<{ time: string; value: number | string }>;
  expectedRange?: { from: string; to: string };
  frequency?: 'year' | 'month' | 'quarter';
}): ApiResponse {
  const source = 'join/fill_gaps';
  if (!params.records || params.records.length === 0) {
    return createError(source, 'records is required');
  }

  const freq = params.frequency || 'year';

  // Parse existing times
  const existingTimes = new Set(params.records.map(r => r.time));

  // Generate expected time points
  const expectedTimes: string[] = [];
  if (params.expectedRange) {
    const fromYear = parseInt(params.expectedRange.from, 10);
    const toYear = parseInt(params.expectedRange.to, 10);
    if (!isNaN(fromYear) && !isNaN(toYear)) {
      for (let y = fromYear; y <= toYear; y++) {
        if (freq === 'year') {
          expectedTimes.push(String(y));
        } else if (freq === 'quarter') {
          for (let q = 1; q <= 4; q++) expectedTimes.push(`${y}Q${q}`);
        } else if (freq === 'month') {
          for (let m = 1; m <= 12; m++) expectedTimes.push(`${y}-${String(m).padStart(2, '0')}`);
        }
      }
    }
  } else {
    // Auto-detect from records (just use what's there)
    // Sort and find gaps
    const sorted = [...existingTimes].sort();
    if (freq === 'year' && sorted.length >= 2) {
      const first = parseInt(sorted[0], 10);
      const last = parseInt(sorted[sorted.length - 1], 10);
      if (!isNaN(first) && !isNaN(last)) {
        for (let y = first; y <= last; y++) expectedTimes.push(String(y));
      }
    }
  }

  // Build complete timeline
  const timesSet = expectedTimes.length > 0 ? expectedTimes : [...existingTimes].sort();
  const complete = timesSet.map(t => {
    const record = params.records.find(r => r.time === t);
    return {
      time: t,
      value: record ? record.value : null,
      isMissing: !record,
    };
  });

  const gaps = complete.filter(r => r.isMissing).map(r => r.time);
  const totalExpected = complete.length;
  const coveragePercent = totalExpected > 0
    ? Math.round((1 - gaps.length / totalExpected) * 100)
    : 100;

  return {
    success: true,
    data: {
      complete,
      gaps,
      coveragePercent,
      summary: gaps.length === 0
        ? `全${totalExpected}期間のデータあり`
        : `${gaps.length}件の欠損: ${gaps.slice(0, 5).join(', ')}${gaps.length > 5 ? '...' : ''}`,
    },
    source,
    timestamp: new Date().toISOString(),
  };
}
