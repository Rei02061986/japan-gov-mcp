/**
 * Extended Scenario Composite Tools Tests
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { corporateIntelligence } from '../build/scenarios/corporate-analysis.js';
import { disasterRiskAssessment } from '../build/scenarios/disaster-analysis.js';
import { academicTrend, academicTrendByTopics } from '../build/scenarios/academic-analysis.js';
import { realestateDemographics } from '../build/scenarios/realestate-analysis.js';
import { regionalEconomyFull, nationalEconomySummary } from '../build/scenarios/economy-analysis.js';
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

describe('Scenario: Corporate Intelligence', () => {
  it('should require companyName or corporateNumber', async () => {
    const result = await corporateIntelligence({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /companyName or corporateNumber is required/);
  });

  it('should report skipped APIs when keys are not set', async () => {
    const result = await corporateIntelligence({ companyName: 'トヨタ自動車' });
    assert.equal(result.success, true);
    const data = result.data as { skipped?: string[] };
    assert.ok(Array.isArray(data.skipped), 'skipped should be an array');
    assert.ok(data.skipped!.length > 0, 'skipped should be non-empty');
  });

  it('should use corporateNumber directly when provided', async () => {
    globalThis.fetch = async () => mockJsonResponse({ data: {} });

    const result = await corporateIntelligence({
      corporateNumber: '1234567890123',
      gbizToken: 'test-token',
    });

    assert.equal(result.success, true);
    const data = result.data as { query?: { corporateNumber?: string } };
    assert.equal(data.query?.corporateNumber, '1234567890123');
  });
});

describe('Scenario: Disaster Risk Assessment', () => {
  it('should require address or coordinates', async () => {
    const result = await disasterRiskAssessment({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /address or lat\/lon is required/);
  });

  it('should use coordinates directly when provided', async () => {
    globalThis.fetch = async () => mockJsonResponse({ hazard: 0.5 });

    const result = await disasterRiskAssessment({ lat: 35.6895, lon: 139.6917 });
    assert.equal(result.success, true);

    const data = result.data as { location?: { lat?: number; lon?: number } };
    assert.equal(data.location?.lat, 35.6895);
    assert.equal(data.location?.lon, 139.6917);
  });

  it('should geocode address when provided', async () => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      // Geocoding mock - 国土地理院のレスポンス形式
      if (url.hostname === 'msearch.gsi.go.jp') {
        return mockJsonResponse([
          {
            geometry: { coordinates: [139.6917, 35.6895] },
            properties: { title: '東京都千代田区霞が関1-1-1' },
          },
        ]);
      }

      // Other API mocks (地震ハザード、浸水深など)
      return mockJsonResponse({ hazard: 0.1 });
    };

    const result = await disasterRiskAssessment({ address: '東京都千代田区霞が関1-1-1' });
    assert.equal(result.success, true);

    const data = result.data as { location?: { address?: string; lat?: number; lon?: number } };
    assert.equal(data.location?.address, '東京都千代田区霞が関1-1-1');
    assert.equal(data.location?.lat, 35.6895);
    assert.equal(data.location?.lon, 139.6917);
  });
});

describe('Scenario: Academic Trend', () => {
  it('should require keyword', async () => {
    const result = await academicTrend({ keyword: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /keyword is required/);
  });

  it('should search multiple academic databases', async () => {
    globalThis.fetch = async () =>
      mockJsonResponse({
        totalResults: 10,
        items: [{ title: 'Test Paper' }],
      });

    const result = await academicTrend({ keyword: 'AI', limit: 5 });
    assert.equal(result.success, true);

    const data = result.data as Record<string, unknown>;
    assert.equal(data.keyword, 'AI');
    // Provider returns named keys for each database
    assert.ok('NDL' in data, 'should have NDL key');
    assert.ok('J-STAGE' in data, 'should have J-STAGE key');
    assert.ok('CiNii' in data, 'should have CiNii key');
    assert.ok('JapanSearch' in data, 'should have JapanSearch key');
  });

  it('should include AgriKnowledge when requested', async () => {
    globalThis.fetch = async () => mockJsonResponse({ totalResults: 5, items: [] });

    const result = await academicTrend({ keyword: '稲作', includeAgri: true });
    assert.equal(result.success, true);

    const data = result.data as Record<string, unknown>;
    assert.ok('AgriKnowledge' in data, 'should have AgriKnowledge key');
  });
});

describe('Scenario: Academic Trend By Topics', () => {
  it('should require topics array', async () => {
    const result = await academicTrendByTopics({ topics: [] });
    assert.equal(result.success, false);
    assert.match(result.error || '', /topics array is required/);
  });

  it('should search multiple topics in parallel', async () => {
    globalThis.fetch = async () => mockJsonResponse({ totalResults: 1, items: [] });

    const result = await academicTrendByTopics({
      topics: ['AI', '機械学習', '深層学習'],
      limit: 3,
    });

    assert.equal(result.success, true);
    // data is an array of topic results
    const data = result.data as Array<{ topic: string }>;
    assert.ok(Array.isArray(data), 'data should be an array');
    assert.equal(data.length, 3);
    assert.equal(data[0].topic, 'AI');
    assert.equal(data[1].topic, '機械学習');
    assert.equal(data[2].topic, '深層学習');
  });
});

describe('Scenario: Realestate Demographics', () => {
  it('should require prefecture or city', async () => {
    const result = await realestateDemographics({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /prefecture or city is required/);
  });

  it('should skip realestate APIs when key is not set', async () => {
    globalThis.fetch = async () => mockJsonResponse({ value: [] });

    const result = await realestateDemographics({ prefecture: '13', year: 2023, quarter: 1 });
    assert.equal(result.success, true);

    const data = result.data as { realestate?: { transactions?: { skipped?: boolean } } };
    assert.equal(data.realestate?.transactions?.skipped, true);
  });
});

describe('Scenario: Regional Economy Full', () => {
  it('should validate empty prefectureCode', async () => {
    const result = await regionalEconomyFull({ prefectureCode: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /prefectureCode is required/);
  });

  it('should call multiple APIs in parallel', async () => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      // Dashboard mock
      if (url.hostname === 'dashboard.e-stat.go.jp') {
        return mockJsonResponse({ value: [] });
      }

      // BOJ mock (JSON)
      if (url.hostname === 'www.stat-search.boj.or.jp') {
        return mockJsonResponse({ data: [], total: 0 });
      }

      return mockJsonResponse({});
    };

    const result = await regionalEconomyFull({ prefectureCode: '13', year: 2024 });
    assert.equal(result.success, true);

    const data = result.data as Record<string, unknown>;
    assert.equal(data.prefectureCode, '13');
    assert.ok(data.gdp !== undefined, 'should have gdp key');
    assert.ok(data.population !== undefined, 'should have population key');
    assert.ok(data.cpi !== undefined, 'should have cpi key');
  });
});

describe('Scenario: National Economy Summary', () => {
  it('should fetch national indicators', async () => {
    globalThis.fetch = async () =>
      mockJsonResponse({ value: [] });

    const result = await nationalEconomySummary();
    assert.equal(result.success, true);

    // data is an array of {code, name, data} objects
    const data = result.data as Array<{ code: string; name: string; data: unknown }>;
    assert.ok(Array.isArray(data), 'data should be an array');
    assert.ok(data.length > 0, 'should have indicator results');
    assert.ok(data[0].code, 'each entry should have a code');
    assert.ok(data[0].name, 'each entry should have a name');
  });
});
