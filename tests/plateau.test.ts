/**
 * PLATEAU API Provider Tests (国交省 3D都市モデル)
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchPlateauDatasets,
  getPlateauCitygml,
} from '../build/providers/plateau.js';
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

describe('PLATEAU 3D都市モデルAPI', () => {
  describe('searchPlateauDatasets', () => {
    it('should search PLATEAU datasets with default query', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /geospatial\.jp/);
        assert.equal(url.pathname, '/ckan/api/3/action/package_search');
        assert.equal(url.searchParams.get('q'), 'PLATEAU');
        assert.equal(url.searchParams.get('fq'), 'tags:PLATEAU');
        assert.equal(url.searchParams.get('rows'), '20');
        return mockJsonResponse({
          success: true,
          result: { count: 1, results: [{ name: 'plateau-tokyo' }] },
        });
      };

      const result = await searchPlateauDatasets({});
      assert.equal(result.success, true);
    });

    it('should include prefecture and city in query', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        const q = url.searchParams.get('q') || '';
        assert.match(q, /PLATEAU/);
        assert.match(q, /東京都/);
        assert.match(q, /新宿区/);
        return mockJsonResponse({ success: true, result: { count: 0, results: [] } });
      };

      const result = await searchPlateauDatasets({ prefecture: '東京都', city: '新宿区' });
      assert.equal(result.success, true);
    });

    it('should include type in query', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        const q = url.searchParams.get('q') || '';
        assert.match(q, /建築物/);
        return mockJsonResponse({ success: true, result: { count: 0, results: [] } });
      };

      const result = await searchPlateauDatasets({ type: '建築物' });
      assert.equal(result.success, true);
    });
  });

  describe('getPlateauCitygml', () => {
    it('should search CityGML by meshCode', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        const q = url.searchParams.get('q') || '';
        assert.match(q, /PLATEAU/);
        assert.match(q, /53394525/);
        assert.equal(url.searchParams.get('fq'), 'tags:PLATEAU');
        return mockJsonResponse({
          success: true,
          result: { count: 1, results: [{ name: 'mesh-53394525' }] },
        });
      };

      const result = await getPlateauCitygml({ meshCode: '53394525' });
      assert.equal(result.success, true);
    });

    it('should fail when meshCode is empty', async () => {
      const result = await getPlateauCitygml({ meshCode: '  ' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /meshCode is required/);
    });
  });
});
