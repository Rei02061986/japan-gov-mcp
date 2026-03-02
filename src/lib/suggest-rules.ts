/**
 * suggest-rules — ルールベースのサジェストエンジン
 *
 * 予測可能で説明可能なサジェストを生成する。
 * 各ルールは condition → generate のパターン。
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const suggestRelationsData = require('../data/suggest-relations.json') as SuggestRelations;

// ── Types ──

interface RelatedIndicator {
  label: string;
  source: string;
  strength: string;
  query?: string;
}

interface SuggestRelations {
  relations: Array<{
    indicator: string;
    related: RelatedIndicator[];
  }>;
}

export interface SuggestContext {
  topic?: string;
  area_level?: 'pref' | 'city' | 'national';
  unique_areas?: string[];
  current_indicators: Array<{
    source: string;
    id?: string;
    query?: string;
    label: string;
  }>;
  alerts: Array<{
    type: string;
    indicator: string;
    area?: string;
    period?: string;
  }>;
}

export interface Suggestion {
  type: 'deepen' | 'broaden' | 'compare' | 'explain' | 'external';
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  tool: string;
  action: string;
  params: Record<string, unknown>;
  estimated_time?: string;
}

interface SuggestRule {
  condition: (ctx: SuggestContext) => boolean;
  generate: (ctx: SuggestContext) => Suggestion[];
}

// ── Helper ──

/** 指標ラベルに関連する指標を suggest-relations.json から検索 */
export function findRelatedIndicators(indicatorLabel: string): RelatedIndicator[] {
  for (const rel of suggestRelationsData.relations) {
    if (indicatorLabel.includes(rel.indicator) || rel.indicator.includes(indicatorLabel)) {
      return rel.related || [];
    }
  }
  return [];
}

// ── Rules ──

const rules: SuggestRule[] = [
  // Rule 1: 都道府県データ + 外れ値 → 市区町村に深掘り
  {
    condition: (ctx) =>
      ctx.area_level === 'pref' &&
      ctx.alerts.some(a => a.type === '外れ値' || a.type === '過去最低' || a.type === '過去最高'),
    generate: (ctx) => {
      const alertAreas = [...new Set(ctx.alerts.filter(a => a.area).map(a => a.area!))];
      return alertAreas.slice(0, 2).map(area => ({
        type: 'deepen' as const,
        priority: 'high' as const,
        title: `${area}の市区町村別内訳を確認`,
        reason: `${area}が外れ値/過去最高・最低のため、市区町村レベルの差異が重要`,
        tool: 'join',
        action: 'fetch_aligned',
        params: { indicators: ctx.current_indicators, axis: { area: { parentPref: area } } },
        estimated_time: '約10秒',
      }));
    },
  },

  // Rule 2: 単一指標 → 相関しそうな指標を追加
  {
    condition: (ctx) => ctx.current_indicators.length === 1,
    generate: (ctx) => {
      const related = findRelatedIndicators(ctx.current_indicators[0].label);
      return related.slice(0, 2).map(ind => ({
        type: 'broaden' as const,
        priority: 'medium' as const,
        title: `関連指標「${ind.label}」を追加`,
        reason: `${ctx.current_indicators[0].label}と${ind.strength === 'strong' ? '強い' : '中程度の'}相関が知られている`,
        tool: 'join',
        action: 'fetch_aligned',
        params: {
          indicators: [
            ...ctx.current_indicators,
            { source: ind.source, query: ind.query || ind.label, label: ind.label },
          ],
        },
        estimated_time: '約8秒',
      }));
    },
  },

  // Rule 3: 急変アラート → 原因調査（国会審議）
  {
    condition: (ctx) =>
      ctx.alerts.some(a => a.type === '急変' || a.type === 'トレンド転換'),
    generate: (ctx) => {
      const alert = ctx.alerts.find(a => a.type === '急変' || a.type === 'トレンド転換');
      return [{
        type: 'explain' as const,
        priority: 'high' as const,
        title: '変動の背景を国会審議で確認',
        reason: `${alert?.indicator || '指標'}に急変が検出されたため、関連する国会審議を確認`,
        tool: 'law',
        action: 'speech',
        params: { q: alert?.indicator || ctx.current_indicators[0]?.label, from: alert?.period },
        estimated_time: '約5秒',
      }];
    },
  },

  // Rule 4: トピック指定 → 学術論文を提案
  {
    condition: (ctx) => ctx.topic != null,
    generate: (ctx) => [{
      type: 'explain' as const,
      priority: 'low' as const,
      title: '関連する学術論文を検索',
      reason: `「${ctx.topic}」に関する最新の研究動向を把握`,
      tool: 'academic',
      action: 'jstage',
      params: { q: ctx.topic! },
      estimated_time: '約3秒',
    }],
  },

  // Rule 5: トピック指定 → パブリックコメント
  {
    condition: (ctx) => ctx.topic != null,
    generate: (ctx) => [{
      type: 'explain' as const,
      priority: 'medium' as const,
      title: '関連するパブリックコメントを確認',
      reason: '現在進行中の政策議論や規制変更の動向を把握',
      tool: 'law',
      action: 'pubcomment',
      params: { q: ctx.topic! },
      estimated_time: '約3秒',
    }],
  },

  // Rule 6: 地域データ + 地価/不動産 → 防災リスク
  {
    condition: (ctx) =>
      ctx.area_level === 'pref' &&
      ctx.current_indicators.some(i =>
        ['地価', '人口', '不動産', '住宅'].some(k => i.label.includes(k)),
      ),
    generate: () => [{
      type: 'broaden' as const,
      priority: 'low' as const,
      title: '地震ハザード情報を追加',
      reason: '地価・不動産分析では防災リスクとの関連が重要',
      tool: 'weather',
      action: 'hazard',
      params: {},
      estimated_time: '約3秒',
    }],
  },

  // Rule 7: 地域データ → 自治体オープンデータポータル
  {
    condition: (ctx) =>
      (ctx.area_level === 'city' || ctx.area_level === 'pref') &&
      ctx.unique_areas != null &&
      ctx.unique_areas.length > 0,
    generate: (ctx) => {
      const area = ctx.unique_areas![0];
      return [{
        type: 'external' as const,
        priority: 'low' as const,
        title: `${area}のオープンデータポータルを確認`,
        reason: '自治体独自の詳細データが公開されている可能性',
        tool: 'opendata',
        action: 'gov',
        params: { q: `${area} オープンデータ` },
        estimated_time: '約3秒',
      }];
    },
  },
];

// ── Valid tool names (index.ts のツール登録と同期) ──

export const VALID_TOOLS = new Set([
  'estat', 'stats', 'corporate', 'weather', 'law', 'geo',
  'academic', 'opendata', 'misc', 'resolve', 'navigate', 'join', 'context',
]);

// ── Priority / Type ordering ──

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const TYPE_ORDER: Record<string, number> = { deepen: 0, broaden: 1, explain: 2, compare: 3, external: 4 };

/**
 * ルールエンジン: コンテキストに合致するルールを実行し、
 * 無効なツール名を除外、優先度・タイプ順でソートして最大 maxCount 件返す。
 */
export function generateSuggestions(ctx: SuggestContext, maxCount = 5): Suggestion[] {
  const all = rules
    .filter(r => r.condition(ctx))
    .flatMap(r => r.generate(ctx));

  // ランタイム検証: 無効なツール名の提案を除外
  const validated = all.filter(s => {
    if (!VALID_TOOLS.has(s.tool)) {
      console.error(`[suggest] 無効なツール名を除外: ${s.tool}`);
      return false;
    }
    return true;
  });

  validated.sort((a, b) => {
    const pDiff = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    if (pDiff !== 0) return pDiff;
    return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
  });

  return validated.slice(0, maxCount);
}
