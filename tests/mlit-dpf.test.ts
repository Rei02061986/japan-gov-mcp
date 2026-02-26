import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getMlitDpfCatalog, searchMlitDpf, type MlitDpfConfig } from '../build/providers/mlit-dpf.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const TEST_CONFIG: MlitDpfConfig = { apiKey: 'test-mlit-dpf-key' };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

function mockJsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

describe('国交省DPF API', () => {
  describe('searchMlitDpf', () => {
    it('should execute GraphQL search query', async () => {
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), 'https://data-platform.mlit.go.jp/api/v1/');
        assert.equal(init?.method, 'POST');
        assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/json');
        assert.equal((init?.headers as Record<string, string>).apikey, 'test-mlit-dpf-key');

        const body = JSON.parse(String(init?.body)) as { query: string };
        assert.match(body.query, /search\(first:\s*0,\s*size:\s*10,\s*term:\s*"橋梁"/);
        assert.match(body.query, /totalNumber/);
        assert.match(body.query, /searchResults/);
        assert.match(body.query, /lat/);
        assert.match(body.query, /lon/);
        assert.match(body.query, /year/);
        assert.match(body.query, /dataset_id/);
        assert.match(body.query, /catalog_id/);

        return mockJsonResponse({
          data: {
            search: {
              totalNumber: 1,
              searchResults: [{ id: 'abc', title: '橋梁点検データ' }],
            },
          },
        });
      };

      const result = await searchMlitDpf(TEST_CONFIG, { term: '橋梁' });
      assert.equal(result.success, true);
      assert.equal((result.data as any)?.data?.search?.totalNumber, 1);
      assert.equal(result.source, '国交省DPF/search');
    });

    it('should fail when api key is missing', async () => {
      const result = await searchMlitDpf({ apiKey: '' }, { term: '道路' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /MLIT_DPF_API_KEY is required/);
    });

    it('should fail when term is missing', async () => {
      const result = await searchMlitDpf(TEST_CONFIG, { term: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /term is required/);
    });
  });

  describe('getMlitDpfCatalog', () => {
    it('should execute GraphQL catalog query', async () => {
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), 'https://data-platform.mlit.go.jp/api/v1/');
        assert.equal(init?.method, 'POST');
        const body = JSON.parse(String(init?.body)) as { query: string };
        assert.match(body.query, /catalog\(id:\s*"catalog-001"\)/);
        assert.match(body.query, /description/);

        return mockJsonResponse({
          data: {
            catalog: {
              id: 'catalog-001',
              title: 'テストカタログ',
              description: 'テスト説明',
            },
          },
        });
      };

      const result = await getMlitDpfCatalog(TEST_CONFIG, { id: 'catalog-001' });
      assert.equal(result.success, true);
      assert.equal((result.data as any)?.data?.catalog?.id, 'catalog-001');
      assert.equal(result.source, '国交省DPF/catalog');
    });

    it('should fail when id is missing', async () => {
      const result = await getMlitDpfCatalog(TEST_CONFIG, { id: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /id is required/);
    });
  });

  it('should handle HTTP 500 errors', async () => {
    globalThis.fetch = async () => mockJsonResponse({ error: 'server failed' }, 500, 'Internal Server Error');

    const result = await searchMlitDpf(TEST_CONFIG, { term: '港湾' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500: Internal Server Error/);
  });
});
