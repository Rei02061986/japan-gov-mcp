import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { searchHoujin, type HoujinConfig } from '../build/providers/houjin.js';
import { rateLimiters } from '../build/utils/http.js';

const TEST_CONFIG: HoujinConfig = { appId: 'test-app-id' };
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

describe('法人番号API', () => {
  it('should search by corporate number', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/num$/);
      assert.equal(url.searchParams.get('number'), '1234567890123');
      assert.equal(url.searchParams.get('type'), '12');
      return mockJsonResponse({
        'hojin-infos': {
          count: 1,
          'hojin-info': { 'corporate-number': '1234567890123', name: 'テスト法人' },
        },
      });
    };
    const result = await searchHoujin(TEST_CONFIG, { number: '1234567890123' });
    assert.equal(result.success, true);
  });

  it('should search by name', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/name$/);
      assert.equal(url.searchParams.get('name'), 'テスト株式会社');
      return mockJsonResponse({
        'hojin-infos': { count: 3, 'hojin-info': [] },
      });
    };
    const result = await searchHoujin(TEST_CONFIG, { name: 'テスト株式会社' });
    assert.equal(result.success, true);
  });

  it('should search by address', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('address'), '東京都');
      return mockJsonResponse({ 'hojin-infos': { count: 0, 'hojin-info': [] } });
    };
    const result = await searchHoujin(TEST_CONFIG, { address: '東京都' });
    assert.equal(result.success, true);
  });

  it('should fail when appId is empty', async () => {
    const result = await searchHoujin({ appId: '' }, { name: 'テスト' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /appId is required/);
  });

  it('should fail when neither name nor address given for name search', async () => {
    const result = await searchHoujin(TEST_CONFIG, {});
    assert.equal(result.success, false);
    assert.match(result.error || '', /name or address is required/);
  });

  it('should handle HTTP error', async () => {
    globalThis.fetch = async () => new Response('error', { status: 500, statusText: 'Server Error' });
    const result = await searchHoujin(TEST_CONFIG, { name: 'テスト' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 500/);
  });
});
