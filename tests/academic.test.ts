/**
 * 学術・文化 API Provider Tests
 * NDL + J-STAGE + ジャパンサーチ + CiNii + IRDB
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchNdl,
  searchJstage,
  searchJapanSearch,
  searchCinii,
  searchIrdb,
} from '../build/providers/academic.js';
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

function mockXmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

describe('学術・文化API', () => {
  // ── NDL Search ──
  describe('NDL (国立国会図書館)', () => {
    it('searchNdl should fetch XML with query parameter', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /ndlsearch\.ndl\.go\.jp/);
        assert.equal(url.searchParams.get('any'), '人工知能');
        assert.equal(url.searchParams.get('cnt'), '20');
        return mockXmlResponse('<rss><channel><item><title>AI論文</title></item></channel></rss>');
      };

      const result = await searchNdl({ query: '人工知能' });
      assert.equal(result.success, true);
      assert.ok(result.data);
    });

    it('searchNdl should fail when query is empty', async () => {
      const result = await searchNdl({ query: '  ' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /query is required/);
    });

    it('searchNdl should respect custom count', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('cnt'), '5');
        return mockXmlResponse('<rss><channel></channel></rss>');
      };

      const result = await searchNdl({ query: 'test', count: 5 });
      assert.equal(result.success, true);
    });
  });

  // ── J-STAGE ──
  describe('J-STAGE (科学技術振興機構)', () => {
    it('searchJstage should fetch XML with keyword parameter', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /api\.jstage\.jst\.go\.jp/);
        assert.equal(url.searchParams.get('service'), '3');
        assert.equal(url.searchParams.get('keyword'), '機械学習');
        assert.equal(url.searchParams.get('count'), '20');
        return mockXmlResponse('<feed><entry><title>ML Paper</title></entry></feed>');
      };

      const result = await searchJstage({ query: '機械学習' });
      assert.equal(result.success, true);
      assert.ok(result.data);
    });

    it('searchJstage should fail when query is empty', async () => {
      const result = await searchJstage({ query: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /query is required/);
    });

    it('searchJstage should support year range', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('pubyearfrom'), '2020');
        assert.equal(url.searchParams.get('pubyearto'), '2024');
        return mockXmlResponse('<feed></feed>');
      };

      const result = await searchJstage({ query: 'AI', pubyearfrom: '2020', pubyearto: '2024' });
      assert.equal(result.success, true);
    });
  });

  // ── ジャパンサーチ ──
  describe('ジャパンサーチ', () => {
    it('searchJapanSearch should fetch JSON with keyword parameter', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /jpsearch\.go\.jp/);
        assert.equal(url.searchParams.get('keyword'), '浮世絵');
        assert.equal(url.searchParams.get('size'), '20');
        return mockJsonResponse({ list: [{ id: '1', title: '浮世絵作品' }] });
      };

      const result = await searchJapanSearch({ keyword: '浮世絵' });
      assert.equal(result.success, true);
      assert.ok(result.data);
    });

    it('searchJapanSearch should fail when keyword is empty', async () => {
      const result = await searchJapanSearch({ keyword: '   ' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /keyword is required/);
    });

    it('searchJapanSearch should support pagination', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('from'), '20');
        assert.equal(url.searchParams.get('size'), '10');
        return mockJsonResponse({ list: [] });
      };

      const result = await searchJapanSearch({ keyword: 'test', from: 20, size: 10 });
      assert.equal(result.success, true);
    });
  });

  // ── CiNii Research ──
  describe('CiNii Research', () => {
    it('searchCinii should fetch JSON with query parameter', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /cir\.nii\.ac\.jp/);
        assert.equal(url.searchParams.get('q'), '量子コンピュータ');
        assert.equal(url.searchParams.get('format'), 'json');
        return mockJsonResponse({ '@graph': [{ title: '量子計算論文' }] });
      };

      const result = await searchCinii({ query: '量子コンピュータ' });
      assert.equal(result.success, true);
      assert.ok(result.data);
    });

    it('searchCinii should fail when query is empty', async () => {
      const result = await searchCinii({ query: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /query is required/);
    });
  });

  // ── IRDB ──
  describe('IRDB (学術機関リポジトリ)', () => {
    it('searchIrdb should fetch XML with OAI-PMH ListIdentifiers verb', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /irdb\.nii\.ac\.jp/);
        assert.equal(url.searchParams.get('verb'), 'ListIdentifiers');
        assert.equal(url.searchParams.get('metadataPrefix'), 'junii2');
        return mockXmlResponse('<OAI-PMH><ListIdentifiers><header><identifier>oai:test:1</identifier></header></ListIdentifiers></OAI-PMH>');
      };

      const result = await searchIrdb({ query: 'データサイエンス' });
      assert.equal(result.success, true);
    });

    it('searchIrdb should succeed even with empty params', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('verb'), 'ListIdentifiers');
        assert.equal(url.searchParams.get('metadataPrefix'), 'junii2');
        return mockXmlResponse('<OAI-PMH><ListIdentifiers></ListIdentifiers></OAI-PMH>');
      };

      const result = await searchIrdb({});
      assert.equal(result.success, true);
    });

    it('searchIrdb should call API regardless of title and author params', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        // Provider does not use title/author in URL building;
        // it always sends verb=ListIdentifiers with metadataPrefix=junii2
        assert.equal(url.searchParams.get('verb'), 'ListIdentifiers');
        assert.equal(url.searchParams.get('metadataPrefix'), 'junii2');
        // No set param should be present since provider ignores title/author
        assert.equal(url.searchParams.get('set'), null);
        return mockXmlResponse('<OAI-PMH><ListIdentifiers><header><identifier>oai:test:2</identifier></header></ListIdentifiers></OAI-PMH>');
      };

      const result = await searchIrdb({ title: 'AI研究', author: '田中太郎' });
      assert.equal(result.success, true);
    });
  });
});
