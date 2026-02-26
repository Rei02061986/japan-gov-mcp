import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchLaws,
  getLawData,
  searchLawsByKeyword,
  getDashboardIndicators,
  getDashboardData,
  getRealEstateTransactions,
  getLandPrice,
  searchDatasets,
  getDatasetDetail,
  listOrganizations,
  getSafetyInfo,
  searchJobs,
  searchAgriKnowledge,
} from '../build/providers/misc.js';
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

// ═══════════════════════════════════════════════
// 法令API
// ═══════════════════════════════════════════════
describe('法令API', () => {
  it('searchLaws should fetch law list', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/laws$/);
      assert.equal(url.searchParams.get('category'), '2');
      assert.equal(url.searchParams.get('offset'), '0');
      assert.equal(url.searchParams.get('limit'), '20');
      return mockJsonResponse({ laws: [] });
    };
    const result = await searchLaws({ category: 2 });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { laws: [] });
  });

  it('searchLaws should use default category 2', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('category'), '2');
      return mockJsonResponse({ laws: [] });
    };
    const result = await searchLaws({});
    assert.equal(result.success, true);
  });

  it('searchLaws should reject invalid category', async () => {
    const result = await searchLaws({ category: 7 });
    assert.equal(result.success, false);
    assert.match(result.error || '', /category must be/);
  });

  it('getLawData should fetch by lawId', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /law_data\/129AC0000000089/);
      assert.match(url, /response_format=json/);
      return mockJsonResponse({ law: { lawId: '129AC0000000089' } });
    };
    const result = await getLawData({ lawId: '129AC0000000089' });
    assert.equal(result.success, true);
  });

  it('getLawData should fail when lawId missing', async () => {
    const result = await getLawData({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /lawId is required/);
  });

  it('searchLawsByKeyword should search with keyword', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/laws$/);
      assert.equal(url.searchParams.get('keyword'), '個人情報');
      assert.equal(url.searchParams.get('offset'), '10');
      assert.equal(url.searchParams.get('limit'), '5');
      return mockJsonResponse({ laws: [{ lawId: 'abc' }] });
    };
    const result = await searchLawsByKeyword({ keyword: '個人情報', offset: 10, limit: 5 });
    assert.equal(result.success, true);
  });

  it('searchLawsByKeyword should reject empty keyword', async () => {
    const result = await searchLawsByKeyword({ keyword: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /keyword is required/);
  });
});

// ═══════════════════════════════════════════════
// 統計ダッシュボード
// ═══════════════════════════════════════════════
describe('統計ダッシュボード', () => {
  it('getDashboardIndicators should fetch indicators', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /getIndicatorInfo/);
      assert.equal(url.searchParams.get('Lang'), 'JP');
      // MetaGetFlg removed
      assert.equal(url.searchParams.get('MetaGetFlg'), null);
      return mockJsonResponse({ GET_INDICATOR_INFO: { RESULT: { STATUS: 0 } } });
    };
    const result = await getDashboardIndicators({});
    assert.equal(result.success, true);
  });

  it('getDashboardIndicators should pass indicatorCode', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('IndicatorCode'), '0201010010000010010');
      return mockJsonResponse({ GET_INDICATOR_INFO: {} });
    };
    const result = await getDashboardIndicators({ indicatorCode: '0201010010000010010' });
    assert.equal(result.success, true);
  });

  it('getDashboardData should use getData endpoint', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /getData/);
      assert.equal(url.searchParams.get('IndicatorCode'), '0201010010000010010');
      return mockJsonResponse({ GET_STATS_DATA: { RESULT: { STATUS: 0 } } });
    };
    const result = await getDashboardData({ indicatorCode: '0201010010000010010' });
    assert.equal(result.success, true);
  });

  it('getDashboardData should fail when indicatorCode missing', async () => {
    const result = await getDashboardData({ indicatorCode: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /indicatorCode is required/);
  });
});

// ═══════════════════════════════════════════════
// 不動産情報ライブラリ (APIキー必要)
// ═══════════════════════════════════════════════
describe('不動産情報ライブラリ', () => {
  const config = { apiKey: 'test-key' };

  it('getRealEstateTransactions should fetch with key header', async () => {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /XIT001/);
      assert.equal(url.searchParams.get('from'), '20231');
      assert.equal(url.searchParams.get('to'), '20234');
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.['Ocp-Apim-Subscription-Key'], 'test-key');
      return mockJsonResponse({ status: 'OK', data: [] });
    };
    const result = await getRealEstateTransactions(config, { year: '20231', quarter: '20234', area: '13' });
    assert.equal(result.success, true);
  });

  it('getRealEstateTransactions should fail when apiKey missing', async () => {
    const result = await getRealEstateTransactions({ apiKey: '' }, { year: '20231', quarter: '20234' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /API key is required/);
  });

  it('getRealEstateTransactions should fail when year missing', async () => {
    const result = await getRealEstateTransactions(config, { year: '', quarter: '20234' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /year and quarter are required/);
  });

  it('getLandPrice should fetch with key header', async () => {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /XIT002/);
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.['Ocp-Apim-Subscription-Key'], 'test-key');
      return mockJsonResponse({ status: 'OK', data: [] });
    };
    const result = await getLandPrice(config, { year: '2023', area: '13' });
    assert.equal(result.success, true);
  });

  it('getLandPrice should fail when apiKey missing', async () => {
    const result = await getLandPrice({ apiKey: '' }, { year: '2023' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /API key is required/);
  });
});

// ═══════════════════════════════════════════════
// データカタログ (CKAN)
// ═══════════════════════════════════════════════
describe('データカタログ', () => {
  it('searchDatasets should search with query', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /package_search/);
      assert.equal(url.searchParams.get('q'), '人口');
      assert.equal(url.searchParams.get('rows'), '20');
      return mockJsonResponse({ success: true, result: { count: 100, results: [] } });
    };
    const result = await searchDatasets({ q: '人口' });
    assert.equal(result.success, true);
    assert.equal(result.data?.success, true);
  });

  it('searchDatasets should respect custom rows', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('rows'), '5');
      return mockJsonResponse({ success: true, result: { count: 5, results: [] } });
    };
    const result = await searchDatasets({ q: '人口', rows: 5 });
    assert.equal(result.success, true);
  });

  it('getDatasetDetail should fetch by id', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /package_show/);
      assert.equal(url.searchParams.get('id'), 'abc-123');
      return mockJsonResponse({ success: true, result: { id: 'abc-123', title: 'テスト' } });
    };
    const result = await getDatasetDetail({ id: 'abc-123' });
    assert.equal(result.success, true);
  });

  it('getDatasetDetail should fail when id missing', async () => {
    const result = await getDatasetDetail({ id: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /id is required/);
  });

  it('listOrganizations should fetch org list', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /organization_list/);
      return mockJsonResponse({ success: true, result: [{ name: 'mlit' }] });
    };
    const result = await listOrganizations();
    assert.equal(result.success, true);
  });
});

// ═══════════════════════════════════════════════
// 海外安全情報 (XML)
// ═══════════════════════════════════════════════
describe('海外安全情報', () => {
  it('getSafetyInfo should fetch all regions XML', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /ezairyu\.mofa\.go\.jp\/opendata\/area\/00\.xml/);
      return mockXmlResponse('<?xml version="1.0"?><opendata><area><cd>00</cd></area></opendata>');
    };
    const result = await getSafetyInfo({});
    assert.equal(result.success, true);
  });

  it('getSafetyInfo should fetch by regionCode', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /opendata\/area\/10\.xml/);
      return mockXmlResponse('<?xml version="1.0"?><opendata><area><cd>10</cd></area></opendata>');
    };
    const result = await getSafetyInfo({ regionCode: '10' });
    assert.equal(result.success, true);
  });

  it('getSafetyInfo should fetch by countryCode', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.match(url, /opendata\/country\/0001\.xml/);
      return mockXmlResponse('<?xml version="1.0"?><opendata></opendata>');
    };
    const result = await getSafetyInfo({ countryCode: '0001' });
    assert.equal(result.success, true);
  });
});

// ═══════════════════════════════════════════════
// ハローワーク (APIキー必要だがバリデーションテスト)
// ═══════════════════════════════════════════════
describe('ハローワーク', () => {
  it('searchJobs should fail when apiKey missing', async () => {
    const result = await searchJobs({ apiKey: '' }, { keyword: 'エンジニア' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /API key is required/);
  });

  it('searchJobs should send correct request', async () => {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /offers/);
      assert.equal(url.searchParams.get('keyword'), 'エンジニア');
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.['X-API-KEY'], 'test-key');
      return mockJsonResponse({ results: [] });
    };
    const result = await searchJobs({ apiKey: 'test-key' }, { keyword: 'エンジニア' });
    assert.equal(result.success, true);
  });
});

describe('AgriKnowledge', () => {
  it('searchAgriKnowledge should fetch search results', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://agriknowledge.affrc.go.jp');
      assert.equal(url.pathname, '/RNJ/api/2.0/search');
      assert.equal(url.searchParams.get('query'), '水稲');
      assert.equal(url.searchParams.get('count'), '3');
      return mockJsonResponse({ total: 1, records: [{ id: 'A001' }] });
    };

    const result = await searchAgriKnowledge({ query: '水稲', count: 3 });
    assert.equal(result.success, true);
    assert.equal((result.data as { total?: number })?.total, 1);
  });

  it('searchAgriKnowledge should fail when query is empty', async () => {
    const result = await searchAgriKnowledge({ query: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /query is required/);
  });
});

// ═══════════════════════════════════════════════
// HTTP エラーハンドリング共通
// ═══════════════════════════════════════════════
describe('HTTP error handling', () => {
  it('should handle 500 error', async () => {
    globalThis.fetch = async () => new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
    const result = await getDashboardIndicators({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500/);
  });

  it('should handle 404 error', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404, statusText: 'Not Found' });
    const result = await searchDatasets({ q: 'test' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 404/);
  });

  it('should handle network error', async () => {
    globalThis.fetch = async () => { throw new Error('Network unreachable'); };
    const result = await getSafetyInfo({});
    assert.equal(result.success, false);
    assert.match(result.error || '', /Network unreachable/);
  });
});
