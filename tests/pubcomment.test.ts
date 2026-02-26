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
  it('getPublicComments should fetch list RSS by default', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.hostname, /public-comment\.e-gov\.go\.jp/);
      assert.equal(url.pathname, '/rss/pcm_list.xml');
      return mockXmlResponse('<rss><channel><title>パブコメ一覧</title></channel></rss>');
    };

    const result = await getPublicComments();
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('getPublicComments should fetch list type explicitly', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/rss/pcm_list.xml');
      return mockXmlResponse('<rss><channel><title>パブコメ一覧</title></channel></rss>');
    };

    const result = await getPublicComments({ type: 'list' });
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('getPublicComments should fetch result type', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.hostname, /public-comment\.e-gov\.go\.jp/);
      assert.equal(url.pathname, '/rss/pcm_result.xml');
      return mockXmlResponse('<rss><channel><title>結果公示</title></channel></rss>');
    };

    const result = await getPublicComments({ type: 'result' });
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('getPublicComments should return XML data as string', async () => {
    const xmlBody = '<rss><channel><title>テスト</title><item><title>案件1</title></item></channel></rss>';
    globalThis.fetch = async () => {
      return mockXmlResponse(xmlBody);
    };

    const result = await getPublicComments();
    assert.equal(result.success, true);
    assert.equal(typeof result.data, 'string');
  });
});
