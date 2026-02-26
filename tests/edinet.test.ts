import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getDocumentList, getDocument, type EdinetConfig } from '../build/providers/edinet.js';
import { rateLimiters } from '../build/utils/http.js';

const TEST_CONFIG: EdinetConfig = { apiKey: 'test-edinet-key' };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  rateLimiters.clear();
});

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('EDINET API', () => {
  describe('getDocumentList', () => {
    it('should fetch document list for a date', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.pathname, /documents\.json/);
        assert.equal(url.searchParams.get('date'), '2026-01-15');
        assert.equal(url.searchParams.get('type'), '2');
        assert.equal(url.searchParams.get('Subscription-Key'), 'test-edinet-key');
        return mockJsonResponse({
          metadata: { resultset: { count: 10 } },
          results: [{ docID: 'S100ABC1', filerName: 'テスト株式会社' }],
        });
      };
      const result = await getDocumentList(TEST_CONFIG, { date: '2026-01-15' });
      assert.equal(result.success, true);
      assert.equal(result.data?.metadata?.resultset?.count, 10);
    });

    it('should fail when apiKey is empty', async () => {
      const result = await getDocumentList({ apiKey: '' }, { date: '2026-01-15' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /API key is required/);
    });

    it('should fail when date format is invalid', async () => {
      const result = await getDocumentList(TEST_CONFIG, { date: '2026/01/15' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /YYYY-MM-DD/);
    });

    it('should fail when date is empty', async () => {
      const result = await getDocumentList(TEST_CONFIG, { date: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /YYYY-MM-DD/);
    });

    it('should respect type parameter', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('type'), '1');
        return mockJsonResponse({ metadata: {}, results: [] });
      };
      const result = await getDocumentList(TEST_CONFIG, { date: '2026-01-15', type: 1 });
      assert.equal(result.success, true);
    });
  });

  describe('getDocument', () => {
    it('should fetch document by docId', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /documents\/S100ABC1/);
        return mockJsonResponse({ metadata: {}, results: [] });
      };
      const result = await getDocument(TEST_CONFIG, { docId: 'S100ABC1' });
      assert.equal(result.success, true);
    });

    it('should fail when docId is empty', async () => {
      const result = await getDocument(TEST_CONFIG, { docId: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /docId is required/);
    });

    it('should fail when apiKey is empty', async () => {
      const result = await getDocument({ apiKey: '' }, { docId: 'S100ABC1' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /API key is required/);
    });
  });
});
