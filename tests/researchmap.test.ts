/**
 * researchmap API Provider Tests (JST)
 * 研究者の業績情報取得
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getResearcherAchievements } from '../build/providers/researchmap.js';
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

describe('researchmap API', () => {
  it('getResearcherAchievements should fetch achievements by permalink and type', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.hostname, /api\.researchmap\.jp/);
      assert.match(url.pathname, /\/read0123456\/published_papers/);
      assert.equal(url.searchParams.get('limit'), '20');
      assert.equal(url.searchParams.get('format'), 'json');
      return mockJsonResponse({
        items_count: 1,
        items: [{ title: '論文タイトル', year: 2024 }],
      });
    };

    const result = await getResearcherAchievements({
      permalink: 'read0123456',
      achievementType: 'published_papers',
    });
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('should fail when permalink is empty', async () => {
    const result = await getResearcherAchievements({
      permalink: '  ',
      achievementType: 'published_papers',
    });
    assert.equal(result.success, false);
    assert.match(result.error || '', /permalink is required/);
  });

  it('should fail when achievementType is empty', async () => {
    const result = await getResearcherAchievements({
      permalink: 'read0123456',
      achievementType: '',
    });
    assert.equal(result.success, false);
    assert.match(result.error || '', /achievementType is required/);
  });

  it('should support custom limit and start parameters', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('limit'), '5');
      assert.equal(url.searchParams.get('start'), '10');
      return mockJsonResponse({ items_count: 0, items: [] });
    };

    const result = await getResearcherAchievements({
      permalink: 'read0123456',
      achievementType: 'misc',
      limit: 5,
      start: 10,
    });
    assert.equal(result.success, true);
  });

  it('should handle HTTP error responses', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });

    const result = await getResearcherAchievements({
      permalink: 'nonexistent',
      achievementType: 'published_papers',
    });
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 404/);
  });
});
