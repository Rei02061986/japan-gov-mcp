import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { searchKokkaiSpeeches, searchKokkaiMeetings } from '../build/providers/kokkai.js';
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

describe('国会会議録API', () => {
  it('searchKokkaiSpeeches should call /speech with default recordPacking=json', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://kokkai.ndl.go.jp');
      assert.equal(url.pathname, '/api/speech');
      assert.equal(url.searchParams.get('any'), 'AI');
      assert.equal(url.searchParams.get('recordPacking'), 'json');
      assert.equal(url.searchParams.get('maximumRecords'), '20');
      assert.equal(url.searchParams.get('startRecord'), '1');
      return mockJsonResponse({ numberOfRecords: 1, speechRecord: [] });
    };

    const result = await searchKokkaiSpeeches({ any: 'AI' });
    assert.equal(result.success, true);
    assert.equal((result.data as { numberOfRecords?: number }).numberOfRecords, 1);
  });

  it('searchKokkaiMeetings should call /meeting_list with query params', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/api/meeting_list');
      assert.equal(url.searchParams.get('speaker'), '岸田文雄');
      assert.equal(url.searchParams.get('nameOfHouse'), '衆議院');
      assert.equal(url.searchParams.get('from'), '2024-01-01');
      assert.equal(url.searchParams.get('until'), '2024-12-31');
      assert.equal(url.searchParams.get('maximumRecords'), '50');
      assert.equal(url.searchParams.get('startRecord'), '11');
      return mockJsonResponse({ numberOfRecords: 2, meetingRecord: [] });
    };

    const result = await searchKokkaiMeetings({
      speaker: '岸田文雄',
      nameOfHouse: '衆議院',
      from: '2024-01-01',
      until: '2024-12-31',
      maximumRecords: 50,
      startRecord: 11,
    });
    assert.equal(result.success, true);
  });

  it('searchKokkaiSpeeches should handle HTTP error', async () => {
    globalThis.fetch = async () => new Response('error', { status: 503, statusText: 'Service Unavailable' });
    const result = await searchKokkaiSpeeches({ any: '予算' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 503/);
  });
});
