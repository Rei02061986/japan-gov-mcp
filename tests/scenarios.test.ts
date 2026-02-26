/**
 * Scenario Composite Tools Tests
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { regionalHealthEconomy, laborDemandSupply } from '../build/scenarios/regional-analysis.js';
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

describe('Scenario: Regional Health Economy', () => {
  it('should validate empty prefectureCode', async () => {
    const result = await regionalHealthEconomy({ prefectureCode: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /prefectureCode is required/);
  });

  it('should call multiple APIs in parallel', async () => {
    let callCount = 0;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      callCount++;
      const url = new URL(String(input));

      // NDB API mock
      if (url.hostname === 'ndbopendata-hub.com') {
        return mockJsonResponse({ data: [], total: 0 });
      }

      // Dashboard API mock
      if (url.hostname === 'dashboard.e-stat.go.jp') {
        return mockJsonResponse({ value: [] });
      }

      // BOJ API mock (JSON response)
      if (url.hostname === 'www.stat-search.boj.or.jp') {
        return mockJsonResponse({ data: [], total: 0 });
      }

      return mockJsonResponse({});
    };

    const result = await regionalHealthEconomy({ prefectureCode: '13', year: 2024 });
    assert.equal(result.success, true);
    assert.ok(callCount >= 3, 'Should call multiple APIs');

    const data = result.data as Record<string, unknown>;
    assert.ok(data.health !== undefined);
    assert.ok(data.population !== undefined);
    assert.ok(data.macro !== undefined);
  });

  it('should handle API failures gracefully', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const result = await regionalHealthEconomy({ prefectureCode: '13' });
    // Should still succeed but contain error info
    assert.equal(result.success, true);
    const data = result.data as Record<string, unknown>;
    assert.ok(data.health);
  });
});

describe('Scenario: Labor Demand Supply', () => {
  it('should validate empty prefectureCode', async () => {
    const result = await laborDemandSupply({ prefectureCode: '' });
    assert.equal(result.success, false);
    assert.match(result.error || '', /prefectureCode is required/);
  });

  it('should return error info when API keys are missing', async () => {
    globalThis.fetch = async () => mockJsonResponse({ value: [] });

    const result = await laborDemandSupply({ prefectureCode: '13' });
    assert.equal(result.success, true);

    const data = result.data as Record<string, unknown>;
    assert.ok(data.prefectureCode);

    // jobs should have error since HELLOWORK_API_KEY is not set
    const jobs = data.jobs as Record<string, unknown>;
    assert.ok(jobs.error, 'jobs should contain error when API key missing');

    // labor (dashboard) should still return data
    assert.ok(data.labor !== undefined);
  });

  it('should call dashboard API for labor stats', async () => {
    let dashboardCalled = false;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === 'dashboard.e-stat.go.jp') {
        dashboardCalled = true;
        return mockJsonResponse({ value: [] });
      }
      return mockJsonResponse({});
    };

    const result = await laborDemandSupply({
      prefectureCode: '13',
    });

    assert.equal(result.success, true);
    assert.ok(dashboardCalled, 'Dashboard API should be called');
  });
});
