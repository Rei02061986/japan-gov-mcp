/**
 * Codex User Simulation Test
 *
 * 5 user scenarios that exercise the real built code (resolve, navigate, join, context)
 * with mocked fetch responses simulating realistic API data.
 *
 * Scenario 1: 少子化の全体像
 * Scenario 2: 東京の経済指標に文脈をつける
 * Scenario 3: CPI の歴史的位置
 * Scenario 4: suggest の実用性テスト
 * Scenario 5: エラー・エッジケース
 */
import { describe, it, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, coverage } from '../../build/providers/navigate.js';
import { codeLookup, areaBridge, timeBridge } from '../../build/providers/resolve.js';
import { fetchAligned, normalize, fillGaps } from '../../build/providers/join.js';
import { percentile, peers, trendContext, annotate, suggest } from '../../build/providers/context.js';
import { cache, rateLimiters } from '../../build/utils/http.js';

// ── Constants ──

const VALID_TOOLS = [
  'estat', 'stats', 'corporate', 'weather', 'law', 'geo',
  'academic', 'opendata', 'misc', 'resolve', 'navigate', 'join', 'context',
];

const testConfig = { estat: { appId: 'test-mock' } };

// ── Test Helpers ──

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

/** Generate e-Stat style time series response */
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

/** Generate 47-prefecture e-Stat data */
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

// ── Tracking for report ──

interface TestResult {
  scenario: string;
  test: string;
  passed: boolean;
  toolCalls: string[];
  issues: string[];
}

const results: TestResult[] = [];

function track(scenario: string, test: string, toolCalls: string[], fn: () => void | Promise<void>) {
  return async () => {
    const entry: TestResult = { scenario, test, passed: false, toolCalls, issues: [] };
    try {
      await fn();
      entry.passed = true;
    } catch (e: any) {
      entry.issues.push(e.message || String(e));
      throw e;
    } finally {
      results.push(entry);
    }
  };
}

// ================================================================
// Scenario 1: 少子化の全体像
// ================================================================
describe('Scenario 1: 少子化の全体像', () => {

  it('1-1: navigate.recommend("少子化") returns birth-rate related indicators', track(
    'Scenario 1', '1-1 recommend', ['navigate.recommend'],
    () => {
      const r = recommend({ topic: '少子化' });
      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);

      const recs = r.data.recommended;
      assert.ok(Array.isArray(recs), 'recommended should be an array');
      assert.ok(recs.length >= 1, `Expected >= 1 recommendations, got ${recs.length}`);

      // Should resolve to 人口 topic (少子化 matches 出生 keyword)
      const labels = recs.map((r: any) => r.label).join(', ');
      const tools = recs.map((r: any) => r.tool);
      assert.ok(
        tools.includes('estat') || tools.includes('stats'),
        `Expected estat or stats, got: ${tools.join(', ')}`,
      );

      // Each recommendation has required fields
      for (const rec of recs) {
        assert.ok(rec.tool, `Missing tool in: ${JSON.stringify(rec)}`);
        assert.ok(rec.label, `Missing label in: ${JSON.stringify(rec)}`);
        assert.ok(rec.action, `Missing action in: ${JSON.stringify(rec)}`);
      }
    },
  ));

  it('1-2: resolve.codeLookup("少子化") resolves to topic', track(
    'Scenario 1', '1-2 codeLookup', ['resolve.codeLookup'],
    () => {
      const r = codeLookup({ query: '少子化' });
      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);

      // 少子化 matches 人口 topic via keywords (出生)
      assert.ok(r.data.topic, 'Should resolve a topic');
      assert.ok(r.data.topic.name, 'Topic should have name');
      assert.ok(r.data.topic.keywords, 'Topic should have keywords');
      assert.ok(r.data.topic.tools?.length >= 1, 'Topic should have at least 1 tool ref');
    },
  ));

  it('1-3: context.suggest with topic="少子化" returns broaden/deepen suggestions', track(
    'Scenario 1', '1-3 suggest', ['context.suggest'],
    () => {
      const r = suggest({
        topic: '少子化',
        current_indicators: [
          { source: 'estat', query: '出生率', label: '出生率' },
        ],
      });

      assert.equal(r.success, true);
      const sug = r.data.suggestions;
      assert.ok(Array.isArray(sug), 'suggestions should be an array');
      assert.ok(sug.length >= 1, 'Should have at least 1 suggestion');

      // With topic set, we expect at least an explain suggestion (Rule 4: academic)
      // With single indicator, we expect broaden suggestions (Rule 2)
      const types = sug.map((s: any) => s.type);
      assert.ok(
        types.includes('broaden') || types.includes('explain'),
        `Expected broaden or explain, got types: ${types.join(', ')}`,
      );

      // Narrative should be non-empty
      assert.ok(r.data.narrative.length > 0, 'Narrative should be non-empty');
    },
  ));

  it('1-4: context.annotate with mocked birth-rate time series returns alerts+context', track(
    'Scenario 1', '1-4 annotate', ['context.annotate'],
    async () => {
      // Simulate declining birth rate: triggers trend context
      const birthRateData = makeEstatTimeSeries(2015, [1.46, 1.44, 1.43, 1.42, 1.36, 1.33, 1.30, 1.26, 1.20]);

      const r = await annotate({
        joined_data: {
          indicators: [{
            label: '出生率',
            source: 'estat',
            success: true,
            data: birthRateData,
          }],
        },
        depth: 'standard',
      }, testConfig);

      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);
      assert.ok(r.data.context, 'Should have context');
      assert.ok(r.data.context['出生率'], 'Should have context for 出生率');
      assert.ok(r.data.context['出生率'].percentile, 'Should have percentile info');
      assert.ok(r.data.context['出生率'].trend, 'Should have trend info (depth=standard)');
      assert.ok(r.data.context['出生率'].trend.direction, 'Trend should have direction');

      // Suggestions should be present
      assert.ok(Array.isArray(r.data.suggestions), 'Should have suggestions');

      // Alerts may or may not fire depending on data
      assert.ok(Array.isArray(r.data.alerts), 'Should have alerts array');
    },
  ));
});

// ================================================================
// Scenario 2: 東京の経済指標に文脈をつける
// ================================================================
describe('Scenario 2: 東京の経済指標に文脈をつける', () => {

  it('2-1: resolve.areaBridge({ name: "東京都" }) returns prefCode=13', track(
    'Scenario 2', '2-1 areaBridge', ['resolve.areaBridge'],
    () => {
      const r = areaBridge({ name: '東京都' });
      assert.equal(r.success, true);
      assert.equal(r.data.prefCode, '13');
      assert.equal(r.data.name, '東京都');
      assert.ok(r.data.estatCode, 'Should have estatCode');
      assert.ok(r.data.jmaCode, 'Should have jmaCode');
      assert.ok(typeof r.data.lat === 'number', 'Should have lat');
      assert.ok(typeof r.data.lon === 'number', 'Should have lon');
    },
  ));

  it('2-2: resolve.codeLookup("東京都のGDP") resolves area and topic', track(
    'Scenario 2', '2-2 codeLookup', ['resolve.codeLookup'],
    () => {
      const r = codeLookup({ query: '東京都のGDP' });
      assert.equal(r.success, true);

      // Should extract area: 東京都
      assert.ok(r.data.area, 'Should resolve area');
      assert.equal(r.data.area.prefCode, '13', 'prefCode should be 13');
      assert.equal(r.data.area.name, '東京都');

      // Should extract topic: GDP
      assert.ok(r.data.topic, 'Should resolve topic');
      assert.ok(r.data.topic.name, 'Topic should have name');
      assert.ok(r.data.topic.tools?.length >= 1, 'Topic should have tools');
    },
  ));

  it('2-3: context.percentile with mocked data and high value', track(
    'Scenario 2', '2-3 percentile', ['context.percentile'],
    async () => {
      // GDP-like values trending up; current year value (600) is very high
      // Use area code '13000' so the area filter (estatCode for Tokyo) matches
      const gdpValues = [400, 410, 420, 430, 440, 450, 460, 470, 500, 520, 540, 560, 580, 590, 600];

      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2009, gdpValues, '13000'),
      );

      const r = await percentile({
        source: 'estat',
        id: 'gdp-test-id',
        value: 600,
        area: '13',
        window_years: 15,
      }, testConfig);

      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);
      assert.ok(r.data.percentile >= 80, `Expected percentile >= 80, got ${r.data.percentile}`);
      assert.ok(r.data.distribution, 'Should have distribution');
      assert.ok(r.data.rank_description, 'Should have rank description');
      assert.ok(r.data.source_meta, 'Should have source_meta');
    },
  ));

  it('2-4: context.peers with target="13" and mocked 47-pref data', track(
    'Scenario 2', '2-4 peers', ['context.peers'],
    async () => {
      // GDP per capita by prefecture - Tokyo is highest
      globalThis.fetch = async () => mockJsonResponse(
        make47PrefData(i => i === 13 ? 700 : 300 + i * 5),
      );

      const r = await peers({
        source: 'estat',
        id: 'gdp-percapita-test',
        target: '13',
      }, testConfig);

      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);

      // Structure checks
      assert.equal(r.data.total, 47, 'Should have 47 prefectures');
      assert.ok(r.data.target, 'Should have target info');
      assert.equal(r.data.target.code, '13');
      assert.ok(r.data.rank >= 1 && r.data.rank <= 47, `Rank should be 1-47, got ${r.data.rank}`);
      assert.ok(typeof r.data.deviation_score === 'number', 'Should have deviation_score');
      assert.ok(typeof r.data.percentile_in_peers === 'number', 'Should have percentile_in_peers');
      assert.ok(r.data.peer_stats, 'Should have peer_stats');
      assert.ok(typeof r.data.peer_stats.mean === 'number', 'peer_stats should have mean');
      assert.ok(typeof r.data.peer_stats.median === 'number', 'peer_stats should have median');
      assert.ok(r.data.top3.length === 3, 'Should have top3');
      assert.ok(r.data.bottom3.length === 3, 'Should have bottom3');

      // Tokyo (700) should be #1 since we use descending ranking
      assert.equal(r.data.rank, 1, `Tokyo should be rank 1 with value 700, got rank ${r.data.rank}`);
    },
  ));
});

// ================================================================
// Scenario 3: CPI の歴史的位置
// ================================================================
describe('Scenario 3: CPI の歴史的位置', () => {

  it('3-1: context.percentile with CPI=3.2 in upward trend data', track(
    'Scenario 3', '3-1 percentile CPI', ['context.percentile'],
    async () => {
      // Realistic CPI data: low inflation for decades, then spike
      // 1994-2023: mostly 0-2%, with 3.2 being anomalously high
      const cpiValues = [
        0.7, 0.2, 0.1, 1.8, 0.6, -0.3,  // 1994-1999
        -0.7, -0.7, -0.9, -0.3, 0.0, -0.3,  // 2000-2005
        0.2, 0.0, 1.4, -1.3, -0.7, -0.3,  // 2006-2011
        0.0, 0.3, 2.7, 0.8, -0.1, 0.5,  // 2012-2017
        1.0, 0.5, 0.0, -0.2, 0.9, 2.5,  // 2018-2023
      ];

      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(1994, cpiValues),
      );

      const r = await percentile({
        source: 'estat',
        id: 'cpi-test-id',
        value: 3.2,
        window_years: 30,
      }, testConfig);

      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);
      assert.ok(
        r.data.percentile >= 80,
        `CPI 3.2% should be >= 80th percentile in 30yr distribution, got ${r.data.percentile}`,
      );
      assert.ok(r.data.distribution.n === 30, `Expected 30 data points, got ${r.data.distribution.n}`);
      assert.ok(r.data.historical_comparisons, 'Should have historical_comparisons');
      assert.ok(r.data.historical_comparisons.length > 0, 'Should have at least 1 comparison');
    },
  ));

  it('3-2: context.trendContext with upward CPI data', track(
    'Scenario 3', '3-2 trendContext CPI', ['context.trendContext'],
    async () => {
      // Upward trend in recent years
      // Last 3 points must be ascending for analyzeTrend to detect 上昇
      const cpiRecent = [0.0, -0.2, 0.5, 1.0, 1.5, 2.0, 2.5, 2.8, 3.0, 3.2];

      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2014, cpiRecent),
      );

      const r = await trendContext({
        source: 'estat',
        id: 'cpi-trend-test',
        lookback_years: 10,
      }, testConfig);

      assert.equal(r.success, true, `Expected success, got error: ${r.error}`);
      assert.ok(r.data.trend, 'Should have trend');
      assert.equal(r.data.trend.direction, '上昇', `Expected 上昇, got ${r.data.trend.direction}`);
      assert.ok(r.data.trend.velocity > 0, 'Velocity should be positive for upward trend');
      assert.ok(r.data.from_peak, 'Should have from_peak');
      assert.ok(r.data.from_trough, 'Should have from_trough');
      assert.ok(r.data.source_meta, 'Should have source_meta');
    },
  ));

  it('3-3: historical_comparisons are returned with period info', track(
    'Scenario 3', '3-3 historical comparisons', ['context.percentile'],
    async () => {
      const values = [1.0, 0.5, 0.8, 1.2, 1.5, 2.0, 2.3, 2.8, 3.0, 3.2];

      globalThis.fetch = async () => mockJsonResponse(
        makeEstatTimeSeries(2014, values),
      );

      const r = await percentile({
        source: 'estat',
        id: 'cpi-hist-test',
        value: 3.2,
        window_years: 10,
      }, testConfig);

      assert.equal(r.success, true);
      const comps = r.data.historical_comparisons;
      assert.ok(Array.isArray(comps), 'historical_comparisons should be array');
      assert.ok(comps.length > 0, 'Should have >= 1 comparison');
      assert.ok(comps.length <= 3, 'Should have <= 3 comparisons');

      // Each comparison should have period and value
      for (const c of comps) {
        assert.ok(c.period, 'Comparison should have period');
        assert.ok(typeof c.value === 'number', 'Comparison should have numeric value');
      }
    },
  ));
});

// ================================================================
// Scenario 4: suggest の実用性テスト
// ================================================================
describe('Scenario 4: suggest の実用性テスト', () => {

  it('4-1: navigate.recommend + context.suggest integration', track(
    'Scenario 4', '4-1 recommend+suggest', ['navigate.recommend', 'context.suggest'],
    () => {
      // Step 1: Get recommendations
      const recResult = recommend({ topic: '少子化' });
      assert.equal(recResult.success, true);
      const recs = recResult.data.recommended;
      assert.ok(recs.length >= 1);

      // Step 2: Use recommendations as current_indicators for suggest
      const currentIndicators = recs.slice(0, 2).map((r: any) => ({
        source: r.tool,
        id: r.params?.code || r.params?.id,
        query: r.params?.q,
        label: r.label,
      }));

      const sugResult = suggest({
        topic: '少子化',
        current_indicators: currentIndicators,
      });

      assert.equal(sugResult.success, true);
      const sug = sugResult.data.suggestions;
      assert.ok(Array.isArray(sug));
      assert.ok(sug.length >= 1, `Expected >= 1 suggestion, got ${sug.length}`);
      assert.ok(sug.length <= 5, `Expected <= 5 suggestions, got ${sug.length}`);
    },
  ));

  it('4-2: every suggestion has tool, action, params, reason', track(
    'Scenario 4', '4-2 suggestion structure', ['context.suggest'],
    () => {
      const r = suggest({
        topic: '少子化',
        current_indicators: [
          { source: 'estat', query: '出生率', label: '出生率' },
        ],
        alerts: [
          { type: '急変', indicator: '出生率', period: '2023' },
        ],
      });

      assert.equal(r.success, true);
      const sug = r.data.suggestions;
      assert.ok(sug.length >= 1, 'Should have at least 1 suggestion');

      for (const s of sug) {
        assert.ok(s.tool, `Missing tool: ${JSON.stringify(s)}`);
        assert.ok(s.action, `Missing action: ${JSON.stringify(s)}`);
        assert.ok(s.params && typeof s.params === 'object', `Missing params: ${JSON.stringify(s)}`);
        assert.ok(s.reason, `Missing reason: ${JSON.stringify(s)}`);
        assert.ok(s.title, `Missing title: ${JSON.stringify(s)}`);
        assert.ok(s.type, `Missing type: ${JSON.stringify(s)}`);
        assert.ok(s.priority, `Missing priority: ${JSON.stringify(s)}`);
      }
    },
  ));

  it('4-3: suggested tool names are valid (within 13 tools)', track(
    'Scenario 4', '4-3 valid tool names', ['context.suggest'],
    () => {
      // Comprehensive test: several different contexts to trigger various rules
      const contexts = [
        {
          topic: '物価',
          current_indicators: [{ source: 'stats', label: '物価' }],
          alerts: [{ type: '急変', indicator: '物価' }],
        },
        {
          topic: '少子化',
          area_level: 'pref' as const,
          unique_areas: ['東京都'],
          current_indicators: [{ source: 'estat', label: '地価' }],
          alerts: [{ type: '外れ値', indicator: '地価', area: '東京都' }],
        },
        {
          topic: '雇用',
          current_indicators: [{ source: 'estat', label: '雇用' }],
          alerts: [],
        },
      ];

      for (const ctx of contexts) {
        const r = suggest(ctx);
        assert.equal(r.success, true);

        for (const s of r.data.suggestions) {
          // The suggestion tool names should be one of:
          // estat, stats, corporate, weather, law, geo, academic,
          // opendata, misc, resolve, navigate, join, context
          // OR could be a sub-tool like 'law' mapped to action 'speech'
          assert.ok(
            VALID_TOOLS.includes(s.tool),
            `Suggestion tool "${s.tool}" is not in valid tools list: ${VALID_TOOLS.join(', ')}`,
          );
        }
      }
    },
  ));

  it('4-4: suggestions count is 1-5', track(
    'Scenario 4', '4-4 suggestion count bounds', ['context.suggest'],
    () => {
      // Maximum case: topic + area + alerts + single indicator
      const r = suggest({
        topic: '少子化',
        area_level: 'pref',
        unique_areas: ['東京都', '大阪府'],
        current_indicators: [
          { source: 'estat', label: '出生率' },
        ],
        alerts: [
          { type: '外れ値', indicator: '出生率', area: '東京都' },
          { type: '急変', indicator: '出生率', period: '2023' },
          { type: '過去最低', indicator: '出生率', area: '大阪府' },
        ],
      });

      assert.equal(r.success, true);
      assert.ok(r.data.suggestions.length >= 1, `Expected >= 1, got ${r.data.suggestions.length}`);
      assert.ok(r.data.suggestions.length <= 5, `Expected <= 5, got ${r.data.suggestions.length}`);
    },
  ));
});

// ================================================================
// Scenario 5: エラー・エッジケース
// ================================================================
describe('Scenario 5: エラー・エッジケース', () => {

  it('5-1: resolve.codeLookup("存在しない統計XYZABC") handles gracefully', track(
    'Scenario 5', '5-1 unknown topic', ['resolve.codeLookup'],
    () => {
      const r = codeLookup({ query: '存在しない統計XYZABC' });

      // It should either:
      // a) success=false with a helpful message, or
      // b) success=true with hints suggesting alternatives
      if (r.success) {
        // If success, should have hints telling user to search
        assert.ok(
          r.data.hints && r.data.hints.length > 0,
          'Should have hints when topic is unresolvable',
        );
      } else {
        // If failure, should have an error message
        assert.ok(r.error, 'Should have error message');
        assert.ok(r.error.length > 0, 'Error message should be non-empty');
      }

      // Most importantly: no crash
      assert.ok(true, 'No crash occurred');
    },
  ));

  it('5-2: context.peers with target="99" (invalid prefCode) returns error', track(
    'Scenario 5', '5-2 invalid prefCode', ['context.peers'],
    async () => {
      const r = await peers({
        source: 'estat',
        id: 'test-id',
        target: '99',
      }, testConfig);

      assert.equal(r.success, false, 'Should fail for invalid prefCode 99');
      assert.ok(r.error, 'Should have error message');
    },
  ));

  it('5-3: join.fillGaps with empty records does not crash', track(
    'Scenario 5', '5-3 fillGaps empty', ['join.fillGaps'],
    () => {
      const r = fillGaps({
        records: [],
      });

      // Should return error (records required) but no crash
      if (r.success) {
        // If somehow success, verify structure
        assert.ok(r.data, 'Should have data');
      } else {
        assert.ok(r.error, 'Should have error message');
      }

      // No crash
      assert.ok(true, 'No crash with empty records');
    },
  ));

  it('5-4: join.normalize with unknown unit conversion', track(
    'Scenario 5', '5-4 normalize unknown units', ['join.normalize'],
    () => {
      const r = normalize({
        data: [
          { time: '2023', value: 100, unit: 'フィート' },
          { time: '2024', value: 200, unit: 'フィート' },
        ],
        rules: [
          { fromUnit: 'フィート', toUnit: 'メートル' },
        ],
      });

      // Should succeed but not convert (no rule for フィート→メートル)
      assert.equal(r.success, true, 'Should succeed even with unknown unit conversion');
      assert.ok(r.data.records, 'Should have records');
      assert.equal(r.data.records.length, 2, 'Should have 2 records');

      // Values should be unchanged since conversion is unknown
      for (const rec of r.data.records) {
        assert.equal(rec.converted, false, 'Should not be converted');
      }

      // Log should mention the unknown conversion
      assert.ok(r.data.log.length > 0, 'Should have log entries about unknown conversion');
      assert.ok(
        r.data.log.some((l: string) => l.includes('変換ルール未定義')),
        `Log should mention undefined conversion rule, got: ${r.data.log.join('; ')}`,
      );
    },
  ));

  it('5-5: navigate.recommend("") handles empty input', track(
    'Scenario 5', '5-5 empty recommend', ['navigate.recommend'],
    () => {
      const r = recommend({ topic: '' });

      // Should return error for empty topic
      assert.equal(r.success, false, 'Should fail for empty topic');
      assert.ok(r.error, 'Should have error message');

      // No crash
      assert.ok(true, 'No crash with empty topic');
    },
  ));

  it('5-6: resolve.areaBridge with completely invalid input', track(
    'Scenario 5', '5-6 invalid areaBridge', ['resolve.areaBridge'],
    () => {
      const r = areaBridge({ name: 'xxxxxxxxxxxxxx' });

      // Should fail gracefully
      assert.equal(r.success, false, 'Should fail for nonsense name');
      assert.ok(r.error, 'Should have error message');
    },
  ));

  it('5-7: context.percentile without value returns error', track(
    'Scenario 5', '5-7 missing value', ['context.percentile'],
    async () => {
      const r = await percentile({
        source: 'estat',
        id: 'test-id',
        value: undefined as any,
      }, testConfig);

      assert.equal(r.success, false, 'Should fail without value');
      assert.ok(r.error, 'Should have error message');
    },
  ));

  it('5-8: join.fillGaps with single record', track(
    'Scenario 5', '5-8 fillGaps single record', ['join.fillGaps'],
    () => {
      const r = fillGaps({
        records: [{ time: '2023', value: 100 }],
      });

      assert.equal(r.success, true, 'Should succeed with single record');
      assert.ok(r.data.complete, 'Should have complete timeline');
      assert.equal(r.data.gaps.length, 0, 'Single record, no gaps expected');
      assert.equal(r.data.coveragePercent, 100, 'Coverage should be 100%');
    },
  ));

  it('5-9: context.suggest with no inputs returns empty or minimal suggestions', track(
    'Scenario 5', '5-9 suggest empty', ['context.suggest'],
    () => {
      const r = suggest({
        current_indicators: [],
        alerts: [],
      });

      assert.equal(r.success, true, 'Should succeed even with empty inputs');
      assert.ok(Array.isArray(r.data.suggestions), 'Should have suggestions array');
      // With no topic, no indicators, no alerts, minimal rules fire
      // Still should not crash
      assert.ok(r.data.narrative, 'Should have narrative');
    },
  ));

  it('5-10: join.normalize with valid known conversion', track(
    'Scenario 5', '5-10 normalize known conversion', ['join.normalize'],
    () => {
      const r = normalize({
        data: [
          { time: '2023', value: 5, unit: '千人' },
          { time: '2024', value: 10, unit: '千人' },
        ],
        rules: [
          { fromUnit: '千人', toUnit: '人' },
        ],
      });

      assert.equal(r.success, true);
      assert.equal(r.data.records[0].value, 5000, 'Should convert 5千人 to 5000人');
      assert.equal(r.data.records[1].value, 10000, 'Should convert 10千人 to 10000人');
      assert.equal(r.data.records[0].unit, '人');
      assert.equal(r.data.records[0].converted, true);
    },
  ));
});
