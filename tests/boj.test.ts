/**
 * BOJ (Bank of Japan) Time-Series Data API Tests
 * Tests for: getTimeSeriesData, getMetadata, getMajorStatistics
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTimeSeriesData,
  getMetadata,
  getMajorStatistics,
} from '../build/providers/boj.js';
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

// ═══════════════════════════════════════════════
// getTimeSeriesData
// ═══════════════════════════════════════════════

describe('BOJ getTimeSeriesData', () => {
  it('should call /api/v1/getDataCode with correct query params', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://www.stat-search.boj.or.jp');
      assert.equal(url.pathname, '/api/v1/getDataCode');
      assert.equal(url.searchParams.get('code'), 'STRDCLUCON');
      assert.equal(url.searchParams.get('format'), 'json');
      assert.equal(url.searchParams.get('lang'), 'JP');
      assert.equal(url.searchParams.get('freq'), 'M'); // default frequency
      // startDate and endDate should be set by default
      assert.ok(url.searchParams.get('startDate'));
      assert.ok(url.searchParams.get('endDate'));
      return mockJsonResponse({ data: [{ date: '2025-01', value: 0.001 }] });
    };

    const result = await getTimeSeriesData({ seriesCode: 'STRDCLUCON' });
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('should fail when seriesCode is empty', async () => {
    const result = await getTimeSeriesData({ seriesCode: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /seriesCode is required/);
  });

  it('should fail when seriesCode is whitespace only', async () => {
    const result = await getTimeSeriesData({ seriesCode: '  ' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /seriesCode is required/);
  });

  it('should pass custom date range as startDate/endDate', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('startDate'), '202001');
      assert.equal(url.searchParams.get('endDate'), '202312');
      return mockJsonResponse({ data: [] });
    };

    const result = await getTimeSeriesData({
      seriesCode: 'TEST123',
      startDate: '202001',
      endDate: '202312',
    });
    assert.equal(result.success, true);
  });

  it('should pass db parameter when specified', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('db'), 'FM01');
      return mockJsonResponse({ data: [] });
    };

    const result = await getTimeSeriesData({
      seriesCode: 'STRDCLUCON',
      db: 'FM01',
    });
    assert.equal(result.success, true);
  });

  it('should pass custom freq parameter', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('freq'), 'Q');
      return mockJsonResponse({ data: [] });
    };

    const result = await getTimeSeriesData({
      seriesCode: 'TK99F0000601GCQ00000',
      freq: 'Q',
    });
    assert.equal(result.success, true);
  });

  it('should support csv format option', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('format'), 'csv');
      return mockJsonResponse({ data: [] });
    };

    const result = await getTimeSeriesData({
      seriesCode: 'TEST123',
      format: 'csv',
    });
    assert.equal(result.success, true);
  });

  it('should return error on HTTP 404', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });

    const result = await getTimeSeriesData({ seriesCode: 'TEST123' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 404/);
  });

  it('should return error on HTTP 500', async () => {
    globalThis.fetch = async () => mockJsonResponse({ error: 'server error' }, 500);

    const result = await getTimeSeriesData({ seriesCode: 'TEST123' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500/);
  });
});

// ═══════════════════════════════════════════════
// getMetadata
// ═══════════════════════════════════════════════

describe('BOJ getMetadata', () => {
  it('should call /api/v1/getMetadata with format=json and lang=JP', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://www.stat-search.boj.or.jp');
      assert.equal(url.pathname, '/api/v1/getMetadata');
      assert.equal(url.searchParams.get('format'), 'json');
      assert.equal(url.searchParams.get('lang'), 'JP');
      return mockJsonResponse({ metadata: [{ code: 'FM01', name: 'Financial Markets' }] });
    };

    const result = await getMetadata();
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('should pass db parameter when specified', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('db'), 'MD');
      return mockJsonResponse({ metadata: [] });
    };

    const result = await getMetadata({ db: 'MD' });
    assert.equal(result.success, true);
  });

  it('should return error on HTTP failure', async () => {
    globalThis.fetch = async () => mockJsonResponse({}, 503);

    const result = await getMetadata();
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 503/);
  });
});

// ═══════════════════════════════════════════════
// getMajorStatistics
// ═══════════════════════════════════════════════

describe('BOJ getMajorStatistics', () => {
  it('should return a static object with known series codes (no API call)', async () => {
    // Ensure no fetch is called
    globalThis.fetch = async () => {
      assert.fail('getMajorStatistics should not make any API call');
      return new Response();
    };

    const result = await getMajorStatistics();
    assert.equal(result.success, true);
    assert.equal(result.source, '日銀/major_statistics');
    assert.ok(result.timestamp);
  });

  it('should contain all expected keys in the data object', async () => {
    const result = await getMajorStatistics();
    const data = result.data as Record<string, unknown>;

    const expectedKeys = [
      'call_rate',
      'tankan_di',
      'monetary_base',
      'm2',
      'corporate_goods_price',
      'services_price',
    ];

    for (const key of expectedKeys) {
      assert.ok(data[key], `Missing key: ${key}`);
    }
  });

  it('each entry should have code, db, freq, and description fields', async () => {
    const result = await getMajorStatistics();
    const data = result.data as Record<string, { code: string; db: string; freq: string; description: string }>;

    for (const [key, entry] of Object.entries(data)) {
      assert.ok(entry.code, `${key} should have code`);
      assert.ok(entry.db, `${key} should have db`);
      assert.ok(entry.freq, `${key} should have freq`);
      assert.ok(entry.description, `${key} should have description`);
    }
  });

  it('should include Money Stock code (MD prefix)', async () => {
    const result = await getMajorStatistics();
    const data = result.data as Record<string, { code: string; db: string }>;
    assert.ok(data.monetary_base);
    assert.equal(data.monetary_base.db, 'MD01');
  });

  it('should include call rate and tankan series', async () => {
    const result = await getMajorStatistics();
    const data = result.data as Record<string, { code: string; freq: string }>;
    assert.ok(data.call_rate);
    assert.equal(data.call_rate.freq, 'D');
    assert.ok(data.tankan_di);
    assert.equal(data.tankan_di.freq, 'Q');
  });
});
