/**
 * E2E Scenario 11: 文脈付与 (context)
 *
 * context ツールの5アクション（percentile, peers, trend_context, annotate, suggest）を検証。
 * 純粋関数のテスト + モックIO のテスト。
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, peers, trendContext, annotate, suggest } from '../../build/providers/context.js';
import { cache, rateLimiters } from '../../build/utils/http.js';

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

/** e-Stat風の時系列データを生成 */
function makeEstatTimeSeries(
  startYear: number,
  values: number[],
  areaCode = '00000',
) {
  return {
    GET_STATS_DATA: {
      RESULT: { STATUS: 0 },
      STATISTICAL_DATA: {
        DATA_INF: {
          VALUE: values.map((v, i) => ({
            '@time': `${startYear + i}000000`,
            '@area': areaCode,
            '$': String(v),
          })),
        },
      },
    },
  };
}

/** 47都道府県のe-Statデータを生成 */
function make47PrefData(valuesFn: (prefIdx: number) => number) {
  const values: unknown[] = [];
  for (let i = 1; i <= 47; i++) {
    const code = String(i).padStart(2, '0') + '000';
    values.push({
      '@time': '2023000000',
      '@area': code,
      '$': String(valuesFn(i)),
    });
  }
  return {
    GET_STATS_DATA: {
      RESULT: { STATUS: 0 },
      STATISTICAL_DATA: {
        DATA_INF: { VALUE: values },
      },
    },
  };
}

const testConfig = { estat: { appId: 'test' } };

describe('E2E Scenario 11: 文脈付与', () => {

  // ── 11-1: percentile ──

  describe('percentile', () => {
    it('CPI +3.2% の歴史的位置(モック)', async () => {
      // 過去30年のCPIモック: -1%〜+3%で推移し、3.2%は異常に高い
      const cpiValues = Array.from({ length: 30 }, (_, i) => {
        if (i < 15) return -0.5 + Math.random() * 2; // 1994-2008: -0.5〜1.5
        if (i < 25) return -0.3 + Math.random() * 1; // 2009-2018: -0.3〜0.7
        return 1.0 + Math.random() * 2; // 2019-2023: 1.0〜3.0
      });

      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(1994, cpiValues),
      );

      const r = await percentile({
        source: 'estat',
        id: '0003411995',
        value: 3.2,
        window_years: 30,
      }, testConfig);

      assert.equal(r.success, true);
      assert.ok(r.data.percentile >= 80, `Expected >= 80, got ${r.data.percentile}`);
      assert.ok(r.data.distribution.n >= 20);
    });

    it('分布のmin/max/mean/stdevが正しい', async () => {
      const values = [10, 20, 30, 40, 50];
      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2019, values),
      );

      const r = await percentile({
        source: 'estat',
        id: 'test-id',
        value: 30,
        window_years: 5,
      }, testConfig);

      assert.equal(r.success, true);
      assert.equal(r.data.distribution.min, 10);
      assert.equal(r.data.distribution.max, 50);
      assert.equal(r.data.distribution.mean, 30);
      assert.equal(r.data.distribution.n, 5);
    });

    it('historical_comparisons が返される', async () => {
      const values = [1.0, 1.5, 2.0, 0.5, 1.8, 2.5, 3.0, 2.2, 1.1, 2.8];
      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2014, values),
      );

      const r = await percentile({
        source: 'estat',
        id: 'test-id',
        value: 2.0,
        window_years: 10,
      }, testConfig);

      assert.equal(r.success, true);
      assert.ok(r.data.historical_comparisons.length > 0);
      assert.ok(r.data.historical_comparisons.length <= 3);
    });
  });

  // ── 11-2: peers ──

  describe('peers', () => {
    it('47都道府県の順位計算(モック)', async () => {
      // 出生率: prefIdx 13 (東京) = 最下位寄り
      globalThis.fetch = async () => mockJsonResponse(
        make47PrefData(i => i === 13 ? 0.99 : 1.0 + i * 0.02),
      );

      const r = await peers({
        source: 'estat',
        id: 'test-birthrate',
        target: '13',
      }, testConfig);

      assert.equal(r.success, true);
      assert.equal(r.data.total, 47);
      assert.ok(r.data.rank > 40, `Tokyo rank should be > 40, got ${r.data.rank}`);
      assert.ok(r.data.deviation_score < 40, `Deviation should be < 40, got ${r.data.deviation_score}`);
    });

    it('top3/bottom3 の抽出', async () => {
      globalThis.fetch = async () => mockJsonResponse(
        make47PrefData(i => 1.0 + i * 0.03),
      );

      const r = await peers({
        source: 'estat',
        id: 'test-id',
        target: '01', // 北海道
      }, testConfig);

      assert.equal(r.success, true);
      assert.equal(r.data.top3.length, 3);
      assert.equal(r.data.bottom3.length, 3);
      assert.ok(r.data.top3[0].rank === 1);
    });

    it('neighbors: 前後の順位を返す', async () => {
      globalThis.fetch = async () => mockJsonResponse(
        make47PrefData(i => i * 10),
      );

      const r = await peers({
        source: 'estat',
        id: 'test-id',
        target: '25', // 滋賀県
      }, testConfig);

      assert.equal(r.success, true);
      assert.ok(r.data.neighbors.length > 0, 'Should have neighbors');
      assert.ok(r.data.neighbors.length <= 4, 'Should have at most 4 neighbors');
    });

    it('不正なターゲット → エラー', async () => {
      const r = await peers({
        source: 'estat',
        id: 'test-id',
        target: 'xxxxxxxx',
      }, testConfig);
      assert.equal(r.success, false);
    });
  });

  // ── 11-3: trend_context ──

  describe('trend_context', () => {
    it('上昇トレンドの検出(モック)', async () => {
      const values = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2014, values),
      );

      const r = await trendContext({
        source: 'estat',
        id: 'test-id',
        lookback_years: 10,
      }, testConfig);

      assert.equal(r.success, true);
      assert.equal(r.data.trend.direction, '上昇');
      assert.ok(r.data.trend.velocity > 0);
      assert.ok(r.data.from_peak);
      assert.ok(r.data.from_trough);
    });

    it('ピーク/谷からの変化率', async () => {
      const values = [100, 200, 80, 150, 120];
      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2019, values),
      );

      const r = await trendContext({
        source: 'estat',
        id: 'test-id',
        lookback_years: 5,
      }, testConfig);

      assert.equal(r.success, true);
      assert.equal(r.data.from_peak.value, 200);
      assert.equal(r.data.from_trough.value, 80);
      assert.ok(r.data.from_peak.change_pct < 0, 'Should be below peak');
      assert.ok(r.data.from_trough.change_pct > 0, 'Should be above trough');
    });

    it('データ不足 → エラー', async () => {
      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2023, [100]),
      );

      const r = await trendContext({
        source: 'estat',
        id: 'test-id',
        lookback_years: 1,
      }, testConfig);

      // Only 1 point → error
      assert.equal(r.success, false);
    });
  });

  // ── 11-4: annotate ──

  describe('annotate', () => {
    it('join結果を受け取って文脈付与', async () => {
      const r = await annotate({
        joined_data: {
          indicators: [{
            label: '物価指数',
            source: 'estat',
            success: true,
            data: makeEstatTimeSeries(2018, [100, 101, 102, 105, 108, 112]),
          }],
        },
        depth: 'standard',
      }, testConfig);

      assert.equal(r.success, true);
      assert.ok(r.data.context['物価指数']);
      assert.ok(r.data.context['物価指数'].percentile);
      assert.ok(r.data.context['物価指数'].trend);
    });

    it('alerts 自動生成: 過去最高付近', async () => {
      // All values are 100 except last is 200 → should trigger 過去最高
      const values = [100, 100, 100, 100, 200];
      const r = await annotate({
        joined_data: {
          indicators: [{
            label: '急騰指標',
            source: 'estat',
            success: true,
            data: makeEstatTimeSeries(2019, values),
          }],
        },
      }, testConfig);

      assert.equal(r.success, true);
      // The jump from 100 to 200 should trigger 急変 alert (>2σ)
      const hasAlert = r.data.alerts.some(
        (a: any) => a.type === '急変' || a.type === '過去最高',
      );
      assert.ok(hasAlert, `Expected alert, got: ${JSON.stringify(r.data.alerts)}`);
    });

    it('suggestions が含まれる', async () => {
      const r = await annotate({
        joined_data: {
          indicators: [{
            label: '出生率',
            source: 'estat',
            success: true,
            data: makeEstatTimeSeries(2019, [1.4, 1.35, 1.30, 1.25, 1.20]),
          }],
        },
      }, testConfig);

      assert.equal(r.success, true);
      assert.ok(Array.isArray(r.data.suggestions));
      // Single indicator → should get broaden suggestions
      assert.ok(r.data.suggestions.length > 0);
    });
  });

  // ── 11-5: suggest ──

  describe('suggest', () => {
    it('少子化テーマからの提案', () => {
      const r = suggest({
        topic: '少子化',
        current_indicators: [
          { source: 'estat', query: '合計特殊出生率', label: '出生率' },
        ],
      });

      assert.equal(r.success, true);
      assert.ok(r.data.suggestions.length > 0);
      assert.ok(r.data.suggestions.some((s: any) => s.type === 'broaden'));
      assert.ok(r.data.narrative.length > 0);
    });

    it('全suggestにtool/action/reason', () => {
      const r = suggest({
        topic: '物価',
        current_indicators: [{ source: 'stats', label: '物価' }],
        alerts: [{ type: '急変', indicator: '物価' }],
      });

      for (const s of r.data.suggestions) {
        assert.ok(s.tool, 'missing tool');
        assert.ok(s.action, 'missing action');
        assert.ok(s.reason, 'missing reason');
      }
    });

    it('都道府県外れ値 → deepen + explain', () => {
      const r = suggest({
        area_level: 'pref',
        unique_areas: ['東京都'],
        current_indicators: [{ source: 'estat', label: '地価' }],
        alerts: [
          { type: '外れ値', indicator: '地価', area: '東京都' },
          { type: '急変', indicator: '地価', period: '2023' },
        ],
      });

      assert.equal(r.success, true);
      assert.ok(r.data.suggestions.some((s: any) => s.type === 'deepen'));
      assert.ok(r.data.suggestions.some((s: any) => s.type === 'explain'));
    });

    it('suggestions ≤ 5件', () => {
      const r = suggest({
        topic: '少子化',
        area_level: 'pref',
        unique_areas: ['東京都', '大阪府'],
        current_indicators: [{ source: 'estat', label: '出生率' }],
        alerts: [
          { type: '外れ値', indicator: '出生率', area: '東京都' },
          { type: '急変', indicator: '出生率', period: '2023' },
          { type: '過去最低', indicator: '出生率', area: '大阪府' },
        ],
      });
      assert.ok(r.data.suggestions.length <= 5);
    });
  });
});
