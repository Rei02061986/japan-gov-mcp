import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { searchKkj } from '../build/providers/kkj.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

function mockXmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

describe('官公需情報ポータルAPI', () => {
  it('searchKkj should fetch XML with expected query params', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://www.kkj.go.jp');
      assert.equal(url.pathname, '/api/');
      assert.equal(url.searchParams.get('Query'), 'クラウド');
      assert.equal(url.searchParams.get('Project_Name'), 'システム開発');
      assert.equal(url.searchParams.get('Organization_Name'), 'デジタル庁');
      assert.equal(url.searchParams.get('Count'), '100');
      assert.equal(url.searchParams.get('Start'), '21');
      return mockXmlResponse('<?xml version="1.0"?><result><count>1</count></result>');
    };

    const result = await searchKkj({
      Query: 'クラウド',
      Project_Name: 'システム開発',
      Organization_Name: 'デジタル庁',
      Count: 100,
      Start: 21,
    });

    assert.equal(result.success, true);
    assert.match(result.data || '', /<result>/);
  });

  it('searchKkj should handle HTTP error', async () => {
    globalThis.fetch = async () => new Response('error', { status: 500, statusText: 'Server Error' });
    const result = await searchKkj({ Query: 'ネットワーク' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500/);
  });
});
