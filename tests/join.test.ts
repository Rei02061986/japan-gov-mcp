import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, fillGaps, fetchAligned } from '../build/providers/join.js';
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

// ═══ normalize ═══

describe('join: normalize', () => {
  it('should convert 千人 → 人', () => {
    const r = normalize({
      data: [
        { time: '2020', value: 125, unit: '千人' },
        { time: '2021', value: 124, unit: '千人' },
      ],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assert.equal(r.success, true);
    assert.equal(r.data.records[0].value, 125000);
    assert.equal(r.data.records[0].unit, '人');
    assert.equal(r.data.records[0].converted, true);
    assert.equal(r.data.records[1].value, 124000);
  });

  it('should convert 百万円 → 億円', () => {
    const r = normalize({
      data: [{ time: '2023', value: 5000, unit: '百万円' }],
      rules: [{ fromUnit: '百万円', toUnit: '億円' }],
    });
    assert.equal(r.success, true);
    assert.equal(r.data.records[0].value, 50);
    assert.equal(r.data.records[0].unit, '億円');
  });

  it('should handle string values', () => {
    const r = normalize({
      data: [{ time: '2023', value: '1234.5', unit: '千人' }],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assert.equal(r.success, true);
    assert.equal(r.data.records[0].value, 1234500);
  });

  it('should not convert when unit does not match', () => {
    const r = normalize({
      data: [{ time: '2023', value: 100, unit: '%' }],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assert.equal(r.success, true);
    assert.equal(r.data.records[0].value, 100);
    assert.equal(r.data.records[0].converted, false);
  });

  it('should log conversion details', () => {
    const r = normalize({
      data: [{ time: '2023', value: 50, unit: '千人' }],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assert.equal(r.success, true);
    assert.ok(r.data.log.length > 0);
  });

  it('should fail on empty data', () => {
    const r = normalize({ data: [], rules: [{ fromUnit: '千人', toUnit: '人' }] });
    assert.equal(r.success, false);
  });

  it('should fail on empty rules', () => {
    const r = normalize({ data: [{ time: '2023', value: 100 }], rules: [] });
    assert.equal(r.success, false);
  });
});

// ═══ fillGaps ═══

describe('join: fillGaps', () => {
  it('should detect missing years', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2021', value: 101 },
        { time: '2023', value: 103 },
        { time: '2024', value: 104 },
      ],
      expectedRange: { from: '2020', to: '2024' },
      frequency: 'year',
    });
    assert.equal(r.success, true);
    assert.deepEqual(r.data.gaps, ['2022']);
    assert.equal(r.data.coveragePercent, 80);
    assert.equal(r.data.complete.length, 5);
    // The missing entry should be flagged
    const missing = r.data.complete.find((c: any) => c.time === '2022');
    assert.ok(missing);
    assert.equal(missing.isMissing, true);
    assert.equal(missing.value, null);
  });

  it('should report 100% for complete series', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2021', value: 101 },
        { time: '2022', value: 102 },
      ],
      expectedRange: { from: '2020', to: '2022' },
      frequency: 'year',
    });
    assert.equal(r.success, true);
    assert.deepEqual(r.data.gaps, []);
    assert.equal(r.data.coveragePercent, 100);
  });

  it('should auto-detect range without expectedRange', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2023', value: 103 },
      ],
      frequency: 'year',
    });
    assert.equal(r.success, true);
    assert.ok(r.data.gaps.includes('2021'));
    assert.ok(r.data.gaps.includes('2022'));
  });

  it('should handle quarterly data', () => {
    const r = fillGaps({
      records: [
        { time: '2023Q1', value: 100 },
        { time: '2023Q3', value: 102 },
      ],
      expectedRange: { from: '2023', to: '2023' },
      frequency: 'quarter',
    });
    assert.equal(r.success, true);
    assert.ok(r.data.gaps.includes('2023Q2'));
    assert.ok(r.data.gaps.includes('2023Q4'));
  });

  it('should fail on empty records', () => {
    const r = fillGaps({ records: [] });
    assert.equal(r.success, false);
  });
});

// ═══ fetchAligned ═══

describe('join: fetchAligned', () => {
  it('should fetch multiple indicators', async () => {
    let fetchCount = 0;
    globalThis.fetch = async (input) => {
      fetchCount++;
      const url = String(input);
      if (url.includes('e-stat')) {
        return mockJsonResponse({
          GET_STATS_LIST: {
            RESULT: { STATUS: 0 },
            DATALIST_INF: { NUMBER: 1, TABLE_INF: [{ '@id': '001', TITLE: 'テスト' }] },
          },
        });
      }
      return mockJsonResponse({ RESULT: [] });
    };

    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '人口', label: '人口' },
        ],
        axis: {
          time: { from: '2020', to: '2023' },
          area: { prefCodes: ['13'] },
        },
      },
      { estat: { appId: 'test' } },
    );
    assert.equal(r.success, true);
    assert.ok(r.data.indicators.length === 1);
    assert.ok(fetchCount > 0);
  });

  it('should handle missing API key gracefully', async () => {
    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', id: '001', label: 'テスト' },
        ],
      },
      { estat: { appId: '' } },
    );
    assert.equal(r.success, true);
    assert.equal(r.data.indicators[0].success, false);
    assert.ok(r.data.warnings?.length > 0);
  });

  it('should fail on empty indicators', async () => {
    const r = await fetchAligned({ indicators: [] }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });
});
