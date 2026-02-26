/**
 * パブリックコメント API Provider Tests
 * e-Gov パブリックコメント RSS
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getPublicComments } from '../build/providers/pubcomment.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

function mockXmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

describe('パブリックコメントAPI', () => {
  it('getPublicComments should fetch list RSS with default params', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.hostname, /public-comment\.e-gov\.go\.jp/);
      assert.equal(url.searchParams.get('seqNo'), '0000000001');
      return mockXmlResponse('<rss><channel><title>パブコメ一覧</title></channel></rss>');
    };

    const result = await getPublicComments();
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('getPublicComments should fetch list type explicitly', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('seqNo'), '0000000001');
      return mockXmlResponse('<rss><channel></channel></rss>');
    };

    const result = await getPublicComments({ type: 'list' });
    assert.equal(result.success, true);
  });

  it('getPublicComments should fetch result type', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('seqNo'), '0000000002');
      return mockXmlResponse('<rss><channel><title>結果公示</title></channel></rss>');
    };

    const result = await getPublicComments({ type: 'result' });
    assert.equal(result.success, true);
  });

  it('getPublicComments should pass categoryCode parameter', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('categoryCode'), '0100000000');
      return mockXmlResponse('<rss><channel></channel></rss>');
    };

    const result = await getPublicComments({ categoryCode: '0100000000' });
    assert.equal(result.success, true);
  });
});
