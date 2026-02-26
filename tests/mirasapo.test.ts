/**
 * ミラサポplus API Provider Tests (中小企業庁)
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchCaseStudies,
  getCaseStudy,
  getCategories,
  getRegions,
} from '../build/providers/mirasapo.js';
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

describe('ミラサポplus API', () => {
  describe('searchCaseStudies', () => {
    it('should search case studies with default params', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /mirasapo-plus\.go\.jp/);
        assert.equal(url.pathname, '/jirei-api/case_studies');
        assert.equal(url.searchParams.get('limit'), '10');
        assert.equal(url.searchParams.get('offset'), '0');
        return mockJsonResponse({ cases: [], total: 0 });
      };

      const result = await searchCaseStudies({});
      assert.equal(result.success, true);
    });

    it('should pass keyword and prefecture parameters', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/case_studies');
        assert.equal(url.searchParams.get('keywords'), 'DX推進');
        assert.equal(url.searchParams.get('prefecture'), '東京都');
        return mockJsonResponse({ cases: [{ id: '1', title: 'DX事例' }], total: 1 });
      };

      const result = await searchCaseStudies({ keywords: 'DX推進', prefecture: '東京都' });
      assert.equal(result.success, true);
    });

    it('should pass industry_category and purpose_category parameters', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('industry_category'), '製造業');
        assert.equal(url.searchParams.get('purpose_category'), '生産性向上');
        return mockJsonResponse({ cases: [], total: 0 });
      };

      const result = await searchCaseStudies({
        industryCategory: '製造業',
        purposeCategory: '生産性向上',
      });
      assert.equal(result.success, true);
    });

    it('should support custom limit and offset', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('limit'), '5');
        assert.equal(url.searchParams.get('offset'), '10');
        return mockJsonResponse({ cases: [], total: 0 });
      };

      const result = await searchCaseStudies({ limit: 5, offset: 10 });
      assert.equal(result.success, true);
    });

    it('should support sort and order parameters', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('sort'), 'date');
        assert.equal(url.searchParams.get('order'), 'desc');
        return mockJsonResponse({ cases: [], total: 0 });
      };

      const result = await searchCaseStudies({ sort: 'date', order: 'desc' });
      assert.equal(result.success, true);
    });
  });

  describe('getCaseStudy', () => {
    it('should fetch case study detail by id', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/case_studies/abc123');
        return mockJsonResponse({ id: 'abc123', title: '事例詳細' });
      };

      const result = await getCaseStudy({ id: 'abc123' });
      assert.equal(result.success, true);
    });
  });

  describe('getCategories', () => {
    it('should fetch industry categories', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/categories/industries');
        return mockJsonResponse([{ id: '1', name: '製造業' }]);
      };

      const result = await getCategories({ type: 'industries' });
      assert.equal(result.success, true);
    });

    it('should fetch purpose categories', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/categories/purposes');
        return mockJsonResponse([{ id: '1', name: '生産性向上' }]);
      };

      const result = await getCategories({ type: 'purposes' });
      assert.equal(result.success, true);
    });

    it('should fetch services categories', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/categories/services');
        return mockJsonResponse([{ id: '1', name: 'IT導入支援' }]);
      };

      const result = await getCategories({ type: 'services' });
      assert.equal(result.success, true);
    });

    it('should fetch specific_measures categories', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/categories/specific_measures');
        return mockJsonResponse([{ id: '1', name: 'ものづくり補助金' }]);
      };

      const result = await getCategories({ type: 'specific_measures' });
      assert.equal(result.success, true);
    });
  });

  describe('getRegions', () => {
    it('should fetch region master data', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/jirei-api/regions');
        return mockJsonResponse([{ code: '13', name: '東京都' }]);
      };

      const result = await getRegions();
      assert.equal(result.success, true);
    });
  });
});
