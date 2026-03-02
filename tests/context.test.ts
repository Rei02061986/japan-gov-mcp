/**
 * context — 文脈付与・サジェストのユニットテスト
 *
 * lib 関数（pure）は直接テスト、
 * provider 関数（IO）は globalThis.fetch モックでテスト。
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── lib: percentile ──
import {
  computePercentile,
  computeDistribution,
  findClosestPoints,
  deviationScore,
  rankItems,
  rankDescription,
} from '../build/lib/percentile.js';

// ── lib: trend-analyzer ──
import {
  analyzeTrend,
  findPeak,
  findTrough,
  findSimilarPatterns,
} from '../build/lib/trend-analyzer.js';

// ── lib: suggest-rules ──
import {
  generateSuggestions,
  findRelatedIndicators,
  VALID_TOOLS,
} from '../build/lib/suggest-rules.js';

// ── provider ──
import { percentile, peers, trendContext, annotate, suggest } from '../build/providers/context.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ════════════════════════════════════════
// percentile lib
// ════════════════════════════════════════

describe('lib/percentile', () => {
  it('正規分布的データでの計算精度', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const p = computePercentile(5, data);
    assert.ok(p >= 40 && p <= 50, `Expected ~44, got ${p}`);
  });

  it('全同値データ → 0パーセンタイル(全て同じ)', () => {
    const data = [5, 5, 5, 5, 5];
    const p = computePercentile(5, data);
    // value <= min → 0 (since all values equal min)
    assert.equal(p, 0);
  });

  it('最大値 → 100パーセンタイル', () => {
    const data = [1, 2, 3, 4, 5];
    const p = computePercentile(5, data);
    assert.equal(p, 100);
  });

  it('最小値 → 0パーセンタイル', () => {
    const data = [1, 2, 3, 4, 5];
    const p = computePercentile(1, data);
    assert.equal(p, 0);
  });

  it('空データ → 50', () => {
    assert.equal(computePercentile(5, []), 50);
  });

  it('データ点数1 → 比較結果', () => {
    assert.equal(computePercentile(5, [3]), 100);
    assert.equal(computePercentile(1, [3]), 0);
    assert.equal(computePercentile(3, [3]), 50);
  });

  it('分布統計量の計算', () => {
    const data = [10, 20, 30, 40, 50];
    const dist = computeDistribution(data);
    assert.equal(dist.n, 5);
    assert.equal(dist.min, 10);
    assert.equal(dist.max, 50);
    assert.equal(dist.mean, 30);
    assert.equal(dist.median, 30);
    assert.ok(dist.stdev > 0, 'stdev should be > 0');
  });

  it('空データの分布', () => {
    const dist = computeDistribution([]);
    assert.equal(dist.n, 0);
    assert.equal(dist.mean, 0);
  });

  it('findClosestPoints: 近い値を返す', () => {
    const ts = [
      { period: '2020', value: 1.0 },
      { period: '2021', value: 2.0 },
      { period: '2022', value: 3.0 },
      { period: '2023', value: 4.0 },
    ];
    const closest = findClosestPoints(2.5, ts, 2);
    assert.equal(closest.length, 2);
    // 2.0 and 3.0 are closest to 2.5
    const values = closest.map(p => p.value).sort();
    assert.deepEqual(values, [2.0, 3.0]);
  });

  it('偏差値: 平均で50', () => {
    assert.equal(deviationScore(30, 30, 10), 50);
  });

  it('偏差値: 1σ上で60', () => {
    assert.equal(deviationScore(40, 30, 10), 60);
  });

  it('偏差値: stdev=0 → 50', () => {
    assert.equal(deviationScore(30, 30, 0), 50);
  });

  it('rankItems: 降順ランク', () => {
    const items = [{ name: 'A', val: 10 }, { name: 'B', val: 30 }, { name: 'C', val: 20 }];
    const ranked = rankItems(items, i => i.val, true);
    assert.equal(ranked[0].name, 'B');
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[2].name, 'A');
    assert.equal(ranked[2].rank, 3);
  });

  it('rankDescription: 最高値', () => {
    const desc = rankDescription(10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10);
    assert.ok(desc.includes('最高') || desc.includes('1番目'));
  });
});

// ════════════════════════════════════════
// trend-analyzer lib
// ════════════════════════════════════════

describe('lib/trend-analyzer', () => {
  it('上昇トレンドの検出', () => {
    const ts = [
      { period: '2020', value: 100 },
      { period: '2021', value: 110 },
      { period: '2022', value: 120 },
      { period: '2023', value: 130 },
    ];
    const result = analyzeTrend(ts);
    assert.equal(result.direction, '上昇');
    assert.ok(result.duration_periods >= 3);
    assert.ok(result.velocity > 0);
  });

  it('下降トレンドの検出', () => {
    const ts = [
      { period: '2020', value: 100 },
      { period: '2021', value: 90 },
      { period: '2022', value: 80 },
      { period: '2023', value: 70 },
    ];
    const result = analyzeTrend(ts);
    assert.equal(result.direction, '下降');
    assert.ok(result.velocity < 0);
  });

  it('横ばいの判定', () => {
    const ts = [
      { period: '2020', value: 100 },
      { period: '2021', value: 100.5 },
      { period: '2022', value: 100.2 },
      { period: '2023', value: 100.1 },
    ];
    const result = analyzeTrend(ts);
    assert.equal(result.direction, '横ばい');
  });

  it('データ不足 → 横ばい', () => {
    const result = analyzeTrend([{ period: '2023', value: 100 }]);
    assert.equal(result.direction, '横ばい');
    assert.equal(result.duration_periods, 0);
  });

  it('ピークの検出', () => {
    const ts = [
      { period: '2020', value: 100 },
      { period: '2021', value: 200 },
      { period: '2022', value: 150 },
    ];
    const peak = findPeak(ts, 150);
    assert.equal(peak.value, 200);
    assert.equal(peak.period, '2021');
    assert.ok(peak.change_pct < 0); // below peak
  });

  it('谷の検出', () => {
    const ts = [
      { period: '2020', value: 100 },
      { period: '2021', value: 50 },
      { period: '2022', value: 80 },
    ];
    const trough = findTrough(ts, 80);
    assert.equal(trough.value, 50);
    assert.equal(trough.period, '2021');
    assert.ok(trough.change_pct > 0); // above trough
  });

  it('velocity/acceleration の計算', () => {
    const ts = [
      { period: '2018', value: 100 },
      { period: '2019', value: 102 },
      { period: '2020', value: 106 },
      { period: '2021', value: 112 },
      { period: '2022', value: 120 },
      { period: '2023', value: 130 },
    ];
    const result = analyzeTrend(ts);
    assert.equal(result.direction, '上昇');
    assert.ok(result.velocity > 0);
    assert.equal(result.acceleration, '加速');
  });

  it('findSimilarPatterns: データ不足 → 空', () => {
    const ts = [
      { period: '2022', value: 100 },
      { period: '2023', value: 110 },
    ];
    assert.deepEqual(findSimilarPatterns(ts), []);
  });
});

// ════════════════════════════════════════
// suggest-rules lib
// ════════════════════════════════════════

describe('lib/suggest-rules', () => {
  it('都道府県外れ値 → deepen提案', () => {
    const suggestions = generateSuggestions({
      area_level: 'pref',
      current_indicators: [{ source: 'estat', label: '出生率' }],
      alerts: [{ type: '外れ値', indicator: '出生率', area: '東京都' }],
    });
    assert.ok(suggestions.some(s => s.type === 'deepen'), 'Should have deepen suggestion');
    assert.ok(suggestions.some(s => s.title.includes('東京都')));
  });

  it('単一指標 → broaden提案', () => {
    const suggestions = generateSuggestions({
      current_indicators: [{ source: 'estat', label: '出生率' }],
      alerts: [],
    });
    assert.ok(suggestions.some(s => s.type === 'broaden'), 'Should have broaden suggestion');
  });

  it('急変アラート → explain提案（国会審議）', () => {
    const suggestions = generateSuggestions({
      current_indicators: [{ source: 'estat', label: '物価' }],
      alerts: [{ type: '急変', indicator: '物価', period: '2022' }],
    });
    assert.ok(suggestions.some(s => s.type === 'explain' && s.tool === 'law'));
  });

  it('トピック指定 → 学術論文提案', () => {
    const suggestions = generateSuggestions({
      topic: '少子化',
      current_indicators: [{ source: 'estat', label: '出生率' }],
      alerts: [],
    });
    assert.ok(suggestions.some(s => s.tool === 'academic'));
  });

  it('最大5件に制限', () => {
    const suggestions = generateSuggestions({
      topic: '少子化',
      area_level: 'pref',
      unique_areas: ['東京都'],
      current_indicators: [{ source: 'estat', label: '出生率' }],
      alerts: [
        { type: '外れ値', indicator: '出生率', area: '東京都' },
        { type: '急変', indicator: '出生率', period: '2023' },
      ],
    });
    assert.ok(suggestions.length <= 5, `Expected <= 5, got ${suggestions.length}`);
  });

  it('priority順ソート: high → medium → low', () => {
    const suggestions = generateSuggestions({
      topic: '少子化',
      area_level: 'pref',
      unique_areas: ['東京都'],
      current_indicators: [{ source: 'estat', label: '出生率' }],
      alerts: [{ type: '外れ値', indicator: '出生率', area: '東京都' }],
    });
    if (suggestions.length >= 2) {
      const priorities = suggestions.map(s => s.priority);
      const order = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < priorities.length; i++) {
        assert.ok(
          (order[priorities[i] as keyof typeof order] ?? 9) >= (order[priorities[i - 1] as keyof typeof order] ?? 9),
          `Priority order violated: ${priorities[i - 1]} before ${priorities[i]}`,
        );
      }
    }
  });

  it('findRelatedIndicators: 出生率の関連指標', () => {
    const related = findRelatedIndicators('出生率');
    assert.ok(related.length > 0, 'Should find related indicators');
    assert.ok(related.some(r => r.label.includes('婚姻')), 'Should include 婚姻率');
  });

  it('findRelatedIndicators: 未知の指標 → 空', () => {
    const related = findRelatedIndicators('存在しない指標XXXXX');
    assert.equal(related.length, 0);
  });
});

// ════════════════════════════════════════
// provider: suggest (pure function, no IO)
// ════════════════════════════════════════

describe('context/suggest', () => {
  it('少子化テーマからの提案', () => {
    const r = suggest({
      topic: '少子化',
      current_indicators: [{ source: 'estat', label: '出生率' }],
    });
    assert.equal(r.success, true);
    assert.ok(r.data.suggestions.length > 0);
    assert.ok(r.data.suggestions.some((s: any) => s.type === 'broaden'));
    assert.ok(r.data.narrative.length > 0);
  });

  it('各suggestにtool, action, paramsが含まれる', () => {
    const r = suggest({
      topic: '物価',
      current_indicators: [{ source: 'stats', label: '物価' }],
      alerts: [{ type: '急変', indicator: '物価' }],
    });
    assert.equal(r.success, true);
    for (const s of r.data.suggestions) {
      assert.ok(s.tool, `suggestion missing tool: ${JSON.stringify(s)}`);
      assert.ok(s.action, `suggestion missing action: ${JSON.stringify(s)}`);
      assert.ok(s.reason, `suggestion missing reason: ${JSON.stringify(s)}`);
    }
  });

  it('空のコンテキスト → 提案なしでもエラーなし', () => {
    const r = suggest({ current_indicators: [], alerts: [] });
    assert.equal(r.success, true);
    assert.equal(r.data.suggestions.length, 0);
    assert.ok(r.data.narrative.includes('追加の分析提案はありません'));
  });
});

// ════════════════════════════════════════
// provider: percentile (mocked fetch)
// ════════════════════════════════════════

describe('context/percentile', () => {
  it('モックデータでパーセンタイル計算', async () => {
    // Mock e-Stat API
    globalThis.fetch = async () => mockJsonResponse({
      GET_STATS_DATA: {
        RESULT: { STATUS: 0 },
        STATISTICAL_DATA: {
          DATA_INF: {
            VALUE: Array.from({ length: 20 }, (_, i) => ({
              '@time': `${2004 + i}000000`,
              '@area': '00000',
              '$': String(1 + i * 0.1),
            })),
          },
        },
      },
    });

    const r = await percentile({
      source: 'estat',
      id: '0003411995',
      value: 2.0,
      window_years: 20,
    }, { estat: { appId: 'test' } });

    assert.equal(r.success, true);
    assert.ok(typeof r.data.percentile === 'number');
    assert.ok(r.data.distribution.n > 0);
    assert.ok(r.data.rank_description.length > 0);
  });

  it('value未指定 → エラー', async () => {
    const r = await percentile({
      source: 'estat',
      id: 'test',
      value: undefined as any,
    }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });
});

// ════════════════════════════════════════
// provider: annotate (mocked)
// ════════════════════════════════════════

describe('context/annotate', () => {
  it('joined_data未指定 → エラー', async () => {
    const r = await annotate({
      joined_data: undefined as any,
    }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });

  it('空のindicators → エラー', async () => {
    const r = await annotate({
      joined_data: { indicators: [] },
    }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });

  it('depth=quick: percentileのみ', async () => {
    const r = await annotate({
      joined_data: {
        indicators: [{
          label: 'テスト指標',
          source: 'estat',
          success: true,
          data: {
            GET_STATS_DATA: {
              STATISTICAL_DATA: {
                DATA_INF: {
                  VALUE: Array.from({ length: 5 }, (_, i) => ({
                    '@time': `${2019 + i}000000`,
                    '@area': '00000',
                    '$': String(100 + i * 10),
                  })),
                },
              },
            },
          },
        }],
      },
      depth: 'quick',
    }, { estat: { appId: 'test' } });

    assert.equal(r.success, true);
    assert.ok(r.data.context['テスト指標']);
    assert.ok(r.data.context['テスト指標'].percentile);
    // quick mode: no trend
    assert.equal(r.data.context['テスト指標'].trend, undefined);
  });
});

// ═══ 改善テスト: Fix 1 — trend recent_n ═══

describe('lib/trend-analyzer: recent_n option', () => {
  it('recent_n=6 で中期トレンド判定', () => {
    // 10点: 前半下降、後半上昇。last 6 points: [90, 100, 110, 120, 130, 140] → 上昇
    const data = [
      { period: '2014', value: 150 },
      { period: '2015', value: 140 },
      { period: '2016', value: 120 },
      { period: '2017', value: 100 },
      { period: '2018', value: 90 },
      { period: '2019', value: 100 },
      { period: '2020', value: 110 },
      { period: '2021', value: 120 },
      { period: '2022', value: 130 },
      { period: '2023', value: 140 },
    ];
    const r = analyzeTrend(data, { recent_n: 6 });
    assert.equal(r.direction, '上昇');
  });

  it('recent_n 未指定でデフォルト3', () => {
    // last 3 points: [120, 130, 140] → 上昇
    const data = [
      { period: '2020', value: 200 },
      { period: '2021', value: 120 },
      { period: '2022', value: 130 },
      { period: '2023', value: 140 },
    ];
    const r1 = analyzeTrend(data);
    const r2 = analyzeTrend(data, {});
    assert.equal(r1.direction, '上昇');
    assert.equal(r2.direction, '上昇');
  });

  it('recent_n=1 → last point only → 横ばい', () => {
    const data = [
      { period: '2022', value: 100 },
      { period: '2023', value: 200 },
    ];
    // With recent_n=1, only one point → first === last → changePct=0 → 横ばい
    const r = analyzeTrend(data, { recent_n: 1 });
    assert.equal(r.direction, '横ばい');
  });
});

// ═══ 改善テスト: Fix 2 — area エラーメッセージ ═══

describe('context/percentile: area error message', () => {
  it('不正なarea形式でprefCodeガイドを含むエラー', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      GET_STATS_DATA: {
        RESULT: { STATUS: 0 },
        STATISTICAL_DATA: {
          DATA_INF: {
            VALUE: [{ '@time': '2023000000', '@area': '00000', '$': '100' }],
          },
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    // area='99999' → areaBridge fails, but if it had resolved, the filter would return 0 points
    const r = await percentile({
      source: 'estat',
      id: 'test-id',
      value: 100,
      area: '99',
      window_years: 5,
    }, { estat: { appId: 'test' } });

    // Should mention prefCode in the error
    if (!r.success) {
      assert.ok(r.error!.includes('prefCode') || r.error!.includes('地域コード'),
        `Error should guide about prefCode, got: ${r.error}`);
    }
  });
});

// ═══ 改善テスト: Fix 3 — suggest ツール名検証 ═══

describe('lib/suggest-rules: VALID_TOOLS validation', () => {
  it('全suggestのtool名がVALID_TOOLSに含まれる', () => {
    // 複数のルール発火条件を満たすコンテキスト
    const ctx = {
      topic: '少子化',
      area_level: 'pref' as const,
      unique_areas: ['東京都'],
      current_indicators: [{ source: 'estat', label: '出生率' }],
      alerts: [
        { type: '外れ値', indicator: '出生率', area: '東京都' },
        { type: '急変', indicator: '出生率', period: '2023' },
      ],
    };
    const suggestions = generateSuggestions(ctx);
    for (const s of suggestions) {
      assert.ok(VALID_TOOLS.has(s.tool), `無効なツール名: ${s.tool}`);
    }
  });

  it('VALID_TOOLS に13ツールが含まれる', () => {
    assert.equal(VALID_TOOLS.size, 13);
    assert.ok(VALID_TOOLS.has('estat'));
    assert.ok(VALID_TOOLS.has('context'));
    assert.ok(VALID_TOOLS.has('join'));
  });
});
