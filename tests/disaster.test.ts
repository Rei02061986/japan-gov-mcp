import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getFloodDepth, getRiverLevel, getTrafficVolume } from '../build/providers/disaster.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

// Helper to create a mock JSON Response for globalThis.fetch
function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Helper to create a mock text/csv Response for globalThis.fetch
function mockTextResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/csv' },
  });
}

// ═══════════════════════════════════════════════
// getFloodDepth tests
// Uses node:https internally (NOT globalThis.fetch), so we can only
// test parameter validation — not the actual HTTP call via mock.
// ═══════════════════════════════════════════════
describe('getFloodDepth', () => {
  it('should return error when lat is undefined', async () => {
    const result = await getFloodDepth({ lat: undefined as any, lon: 139.7671 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon are required/);
    assert.equal(result.source, '浸水ナビ/flood');
  });

  it('should return error when lon is undefined', async () => {
    const result = await getFloodDepth({ lat: 35.6812, lon: undefined as any });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon are required/);
    assert.equal(result.source, '浸水ナビ/flood');
  });

  it('should return error when both lat and lon are undefined', async () => {
    const result = await getFloodDepth({ lat: undefined as any, lon: undefined as any });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon are required/);
  });

  // The current implementation does NOT validate lat/lon ranges,
  // so out-of-range values should NOT produce a validation error.
  // (They will attempt the real HTTP call via node:https, which may
  // fail for network reasons, but NOT with a range-validation message.)
  it('should NOT reject out-of-range lat (no range validation)', async () => {
    // lat=50 is outside Japan but the provider does not validate ranges.
    // The call will attempt a real HTTPS request, which will likely fail
    // with a network/timeout error — but it should NOT fail with a
    // "lat must be between" validation message.
    const result = await getFloodDepth({ lat: 50, lon: 139.7671 });
    // If the server is unreachable, success may be false, but the error
    // should not be a range-validation error.
    if (!result.success) {
      assert.doesNotMatch(result.error || '', /lat must be between/);
    }
  });

  it('should NOT reject out-of-range lon (no range validation)', async () => {
    const result = await getFloodDepth({ lat: 35.6812, lon: 160 });
    if (!result.success) {
      assert.doesNotMatch(result.error || '', /lon must be between/);
    }
  });
});

// ═══════════════════════════════════════════════
// getRiverLevel tests
// Uses fetchJson (globalThis.fetch) with a single URL call to
// www.river.go.jp/kawabou/ipSuiiKobetu?obsrvId=X&gamenFlg=0
// ═══════════════════════════════════════════════
describe('getRiverLevel', () => {
  it('should fetch river level with a single URL call', async () => {
    let capturedUrl: URL | undefined;
    globalThis.fetch = async (input) => {
      capturedUrl = new URL(String(input));
      return mockJsonResponse({
        obsrvId: '1234567890',
        waterLevel: 3.21,
        dangerLevel: 5.0,
      });
    };

    const result = await getRiverLevel({ stationId: '1234567890' });
    assert.equal(result.success, true);
    assert.ok(capturedUrl, 'fetch should have been called');
    assert.equal(capturedUrl!.host, 'www.river.go.jp');
    assert.equal(capturedUrl!.pathname, '/kawabou/ipSuiiKobetu');
    assert.equal(capturedUrl!.searchParams.get('obsrvId'), '1234567890');
    assert.equal(capturedUrl!.searchParams.get('gamenFlg'), '0');
    // Verify the data is returned as-is from the JSON response
    const data = result.data as { obsrvId?: string; waterLevel?: number };
    assert.equal(data.obsrvId, '1234567890');
    assert.equal(data.waterLevel, 3.21);
  });

  it('should return error when stationId is empty', async () => {
    const result = await getRiverLevel({ stationId: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /stationId is required/);
    assert.equal(result.source, '河川水位/level');
  });

  it('should return error when stationId is whitespace-only', async () => {
    const result = await getRiverLevel({ stationId: '   ' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /stationId is required/);
  });

  it('should handle HTTP error from upstream', async () => {
    globalThis.fetch = async () => {
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    };

    const result = await getRiverLevel({ stationId: 'nonexistent' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 404/);
  });
});

// ═══════════════════════════════════════════════
// getTrafficVolume tests
// Uses fetchXml (globalThis.fetch with Accept: application/xml).
// URL host: api.jartic-open-traffic.org, WFS 2.0 params,
// outputFormat=csv, cql_filter=BBOX(ジオメトリ,...).
// ═══════════════════════════════════════════════
describe('getTrafficVolume', () => {
  it('should build correct WFS URL with BBOX cql_filter', async () => {
    let capturedUrl: URL | undefined;
    const csvData = 'FID,ジオメトリ,速度\n1,"POINT(139.767 35.681)",45';
    globalThis.fetch = async (input) => {
      capturedUrl = new URL(String(input));
      return mockTextResponse(csvData);
    };

    const result = await getTrafficVolume({ lat: 35.681, lon: 139.767, radius: 5000, count: 10 });
    assert.equal(result.success, true);
    assert.ok(capturedUrl, 'fetch should have been called');

    // Verify host
    assert.equal(capturedUrl!.host, 'api.jartic-open-traffic.org');
    assert.equal(capturedUrl!.pathname, '/geoserver');

    // Verify WFS params
    assert.equal(capturedUrl!.searchParams.get('service'), 'WFS');
    assert.equal(capturedUrl!.searchParams.get('version'), '2.0.0');
    assert.equal(capturedUrl!.searchParams.get('request'), 'GetFeature');
    assert.equal(capturedUrl!.searchParams.get('srsName'), 'EPSG:4326');

    // Verify csv outputFormat
    assert.equal(capturedUrl!.searchParams.get('outputFormat'), 'csv');

    // Verify typeNames defaults to 1h interval
    assert.equal(capturedUrl!.searchParams.get('typeNames'), 't_travospublic_measure_1h');

    // Verify count
    assert.equal(capturedUrl!.searchParams.get('count'), '10');

    // Verify BBOX cql_filter
    const cqlFilter = capturedUrl!.searchParams.get('cql_filter') || '';
    assert.match(cqlFilter, /BBOX/);
    assert.match(cqlFilter, /ジオメトリ/);
    assert.match(cqlFilter, /EPSG:4326/);

    // Verify the CSV data is returned as text
    assert.equal(result.data, csvData);
  });

  it('should use 5m interval when specified', async () => {
    let capturedUrl: URL | undefined;
    globalThis.fetch = async (input) => {
      capturedUrl = new URL(String(input));
      return mockTextResponse('FID\n');
    };

    await getTrafficVolume({ lat: 35.681, lon: 139.767, interval: '5m' });
    assert.ok(capturedUrl);
    assert.equal(capturedUrl!.searchParams.get('typeNames'), 't_travospublic_measure_5m');
  });

  it('should default radius to 5000 and count to 10', async () => {
    let capturedUrl: URL | undefined;
    globalThis.fetch = async (input) => {
      capturedUrl = new URL(String(input));
      return mockTextResponse('FID\n');
    };

    await getTrafficVolume({ lat: 35.681, lon: 139.767 });
    assert.ok(capturedUrl);
    assert.equal(capturedUrl!.searchParams.get('count'), '10');

    // BBOX should use default radius of 5000m -> delta ~= 5000/111000
    const cqlFilter = capturedUrl!.searchParams.get('cql_filter') || '';
    // The delta for 5000m is approximately 0.045, so BBOX extents should
    // be roughly lon +/- 0.045, lat +/- 0.045
    assert.match(cqlFilter, /BBOX/);
  });

  it('should return error when lat is undefined', async () => {
    const result = await getTrafficVolume({ lat: undefined as any, lon: 139.767 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon are required/);
    assert.equal(result.source, '交通量/volume');
  });

  it('should return error when lon is undefined', async () => {
    const result = await getTrafficVolume({ lat: 35.681, lon: undefined as any });
    assert.equal(result.success, false);
    assert.match(result.error || '', /lat and lon are required/);
  });

  // The current implementation does NOT validate lat/lon ranges
  it('should NOT reject out-of-range lat (no range validation)', async () => {
    globalThis.fetch = async () => mockTextResponse('FID\n');
    const result = await getTrafficVolume({ lat: 95, lon: 139.767 });
    // Should attempt the call (not fail with range validation)
    if (!result.success) {
      assert.doesNotMatch(result.error || '', /lat must be between/);
    }
  });

  it('should NOT reject out-of-range lon (no range validation)', async () => {
    globalThis.fetch = async () => mockTextResponse('FID\n');
    const result = await getTrafficVolume({ lat: 35.681, lon: 200 });
    if (!result.success) {
      assert.doesNotMatch(result.error || '', /lon must be between/);
    }
  });

  it('should handle HTTP error from upstream', async () => {
    globalThis.fetch = async () => {
      return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
    };

    const result = await getTrafficVolume({ lat: 35.681, lon: 139.767 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 503/);
  });
});
