/**
 * MSIL (海しる) / ODPT プレースホルダ Tests
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getLayers, getFeatures } from '../build/providers/msil.js';
import { getRailwayTimetable, getBusTimetable } from '../build/providers/odpt.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

describe('MSIL (海しる) API Placeholder', () => {
  it('getLayers should return error when API key is not set', async () => {
    const result = await getLayers({ apiKey: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /MSIL_API_KEY is required/);
  });

  it('getFeatures should return error when API key is not set', async () => {
    const result = await getFeatures({ layerId: 'test-layer' }, { apiKey: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /MSIL_API_KEY is required/);
  });
});

describe('ODPT API Placeholder', () => {
  it('getRailwayTimetable should return error when API key is not set', async () => {
    const result = await getRailwayTimetable({}, { apiKey: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /ODPT_API_KEY is required/);
  });

  it('getBusTimetable should return error when API key is not set', async () => {
    const result = await getBusTimetable({}, { apiKey: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /ODPT_API_KEY is required/);
  });
});
