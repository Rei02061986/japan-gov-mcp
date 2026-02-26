/**
 * 科学・環境 API Provider Tests
 * Tests for: そらまめくん, シームレス地質図, JAXA STAC Catalog
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAirQuality,
  getGeologyLegend,
  getGeologyAtPoint,
  getJaxaCollections,
} from '../build/providers/science.js';
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
// そらまめくん (大気汚染データ)
// ═══════════════════════════════════════════════

describe('そらまめくん API', () => {
  it('getAirQuality should call data_search endpoint with default params', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.href, /soramame\.env\.go\.jp\/soramame\/api\/data_search/);
      // Default prefCode is '13' (Tokyo)
      assert.equal(url.searchParams.get('TDFKN_CD'), '13');
      // Default data item is PM2_5
      assert.equal(url.searchParams.get('REQUEST_DATA'), 'PM2_5');
      // Start_YM should be set to current YYYYMM
      assert.ok(url.searchParams.get('Start_YM'));
      return mockJsonResponse({ data: [{ station: 'test', PM2_5: 12.3 }] });
    };

    const result = await getAirQuality({});
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('getAirQuality should pass prefCode, stationCode, and dataItems', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('TDFKN_CD'), '01');
      assert.equal(url.searchParams.get('SKT_CD'), '01101010');
      assert.equal(url.searchParams.get('REQUEST_DATA'), 'OX,NO2');
      return mockJsonResponse({ data: [] });
    };

    const result = await getAirQuality({
      prefCode: '01',
      stationCode: '01101010',
      dataItems: 'OX,NO2',
    });
    assert.equal(result.success, true);
  });

  it('getAirQuality should pass startYM and endYM', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('Start_YM'), '202501');
      assert.equal(url.searchParams.get('End_YM'), '202512');
      return mockJsonResponse({ data: [] });
    };

    const result = await getAirQuality({
      startYM: '202501',
      endYM: '202512',
    });
    assert.equal(result.success, true);
  });

  it('getAirQuality should return error on HTTP failure', async () => {
    globalThis.fetch = async () => mockJsonResponse({ error: 'fail' }, 500);

    const result = await getAirQuality({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500/);
  });
});

// ═══════════════════════════════════════════════
// シームレス地質図 (産総研/GSJ)
// ═══════════════════════════════════════════════

describe('シームレス地質図 API', () => {
  it('getGeologyLegend should fetch v2/api/1.3.1/legend.json', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /gbank\.gsj\.jp\/seamless\/v2\/api\/1\.3\.1\/legend\.json/);
      return mockJsonResponse([{ id: 1, name: '沖積層' }, { id: 2, name: '洪積層' }]);
    };

    const result = await getGeologyLegend();
    assert.equal(result.success, true);
    assert.equal(Array.isArray(result.data), true);
  });

  it('getGeologyAtPoint should use legend.json?point= endpoint with v1.3.1', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /1\.3\.1\/legend\.json$/);
      assert.equal(url.searchParams.get('point'), '35.6895,139.6917');
      return mockJsonResponse({ geology: 'alluvium' });
    };

    const result = await getGeologyAtPoint({ lat: 35.6895, lon: 139.6917 });
    assert.equal(result.success, true);
    assert.equal((result.data as { geology?: string })?.geology, 'alluvium');
  });

  it('getGeologyAtPoint should fail when lat is out of range', async () => {
    const result = await getGeologyAtPoint({ lat: 91, lon: 139.7 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat must be between -90 and 90/);
  });

  it('getGeologyAtPoint should fail when lon is out of range', async () => {
    const result = await getGeologyAtPoint({ lat: 35.6, lon: 181 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lon must be between -180 and 180/);
  });

  it('getGeologyAtPoint should fail when lat is not finite', async () => {
    const result = await getGeologyAtPoint({ lat: Number.NaN, lon: 139.7 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon must be finite numbers/);
  });

  it('getGeologyAtPoint should fail when lon is not finite', async () => {
    const result = await getGeologyAtPoint({ lat: 35.6, lon: Number.POSITIVE_INFINITY });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon must be finite numbers/);
  });

  it('getGeologyLegend should return error on HTTP failure', async () => {
    globalThis.fetch = async () => mockJsonResponse({}, 503);

    const result = await getGeologyLegend();
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 503/);
  });
});

// ═══════════════════════════════════════════════
// JAXA STAC Catalog
// ═══════════════════════════════════════════════

describe('JAXA STAC Catalog API', () => {
  it('getJaxaCollections should fetch catalog.json and return raw STAC data', async () => {
    const stacCatalog = {
      type: 'Catalog',
      id: 'cog',
      title: 'JAXA Earth Observation Data',
      links: [
        { rel: 'root', href: 'catalog.json' },
        { rel: 'child', href: 'col1/collection.json', title: 'Collection 1' },
        { rel: 'child', href: 'col2/collection.json', title: 'Collection 2' },
      ],
    };

    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /data\.earth\.jaxa\.jp\/stac\/cog\/v1\/catalog\.json/);
      return mockJsonResponse(stacCatalog);
    };

    const result = await getJaxaCollections({});
    assert.equal(result.success, true);
    // Raw STAC JSON is returned directly (no transformation)
    const data = result.data as { type?: string; links?: unknown[] };
    assert.equal(data.type, 'Catalog');
    assert.ok(Array.isArray(data.links));
  });

  it('getJaxaCollections should accept limit param (even though unused for static STAC)', async () => {
    globalThis.fetch = async () => {
      return mockJsonResponse({ type: 'Catalog', links: [] });
    };

    const result = await getJaxaCollections({ limit: 5 });
    assert.equal(result.success, true);
  });

  it('getJaxaCollections should return error on HTTP failure', async () => {
    globalThis.fetch = async () => mockJsonResponse({ message: 'error' }, 500);

    const result = await getJaxaCollections({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500/);
  });
});
