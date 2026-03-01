import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, schema, coverage } from '../build/providers/navigate.js';
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

// ═══ recommend ═══

describe('navigate: recommend', () => {
  it('should recommend APIs for "人口"', () => {
    const r = recommend({ topic: '人口' });
    assert.equal(r.success, true);
    assert.equal(r.data.topic, '人口');
    assert.ok(r.data.recommended.length >= 2, 'Should have at least 2 recommendations');
    // Should include estat and dashboard
    const tools = r.data.recommended.map((rec: any) => rec.tool);
    assert.ok(tools.includes('estat'), 'Should recommend estat');
    assert.ok(tools.includes('stats'), 'Should recommend stats dashboard');
  });

  it('should recommend APIs for "GDP"', () => {
    const r = recommend({ topic: 'GDP' });
    assert.equal(r.success, true);
    assert.equal(r.data.topic, 'GDP');
  });

  it('should resolve alias "unemployment"', () => {
    const r = recommend({ topic: 'unemployment' });
    assert.equal(r.success, true);
    assert.equal(r.data.topic, '雇用');
  });

  it('should include params templates in recommendations', () => {
    const r = recommend({ topic: '物価' });
    assert.equal(r.success, true);
    const first = r.data.recommended[0];
    assert.ok(first.params, 'Should include params template');
    assert.ok(first.tool, 'Should include tool name');
    assert.ok(first.action, 'Should include action name');
  });

  it('should include API key status', () => {
    const r = recommend({ topic: '人口' });
    assert.equal(r.success, true);
    for (const rec of r.data.recommended) {
      assert.ok('apiKeyRequired' in rec || 'required' in rec);
    }
  });

  it('should return fewer results for quick mode', () => {
    const quick = recommend({ topic: '人口', detailLevel: 'quick' });
    const full = recommend({ topic: '人口', detailLevel: 'comprehensive' });
    assert.equal(quick.success, true);
    assert.equal(full.success, true);
    assert.ok(quick.data.recommended.length <= full.data.recommended.length);
  });

  it('should fallback to estat search for unknown topic', () => {
    const r = recommend({ topic: 'ユニークなトピック' });
    assert.equal(r.success, true);
    assert.equal(r.data.recommended[0].tool, 'estat');
    assert.equal(r.data.recommended[0].action, 'search');
  });

  it('should fail on empty topic', () => {
    const r = recommend({ topic: '' });
    assert.equal(r.success, false);
  });
});

// ═══ schema ═══

describe('navigate: schema', () => {
  it('should parse estat meta into schema', async () => {
    globalThis.fetch = async () => mockJsonResponse({
      GET_META_INFO: {
        RESULT: { STATUS: 0 },
        TABLE_INF: {
          '@id': '0003448230',
          TITLE: { '$': '人口推計' },
          STAT_NAME: { '$': '人口推計' },
          GOV_ORG: { '$': '総務省' },
          UPDATED_DATE: '2024-04-01',
        },
        CLASS_INF: {
          CLASS_OBJ: [
            {
              '@id': 'tab',
              '@name': '表章項目',
              CLASS: [
                { '@code': '001', '@name': '人口' },
                { '@code': '002', '@name': '人口性比' },
              ],
            },
            {
              '@id': 'time',
              '@name': '時間軸',
              CLASS: [
                { '@code': '2023000000', '@name': '2023年' },
                { '@code': '2022000000', '@name': '2022年' },
              ],
            },
            {
              '@id': 'area',
              '@name': '地域',
              CLASS: [
                { '@code': '00000', '@name': '全国' },
                ...[...Array(47)].map((_, i) => ({ '@code': String(i + 1).padStart(5, '0'), '@name': `${i + 1}` })),
              ],
            },
          ],
        },
      },
    });

    const r = await schema({ source: 'estat', id: '0003448230' }, { estat: { appId: 'test' } });
    assert.equal(r.success, true);
    assert.equal(r.data.title, '人口推計');
    assert.equal(r.data.org, '総務省');
    assert.ok(r.data.dimensions.length >= 3);
    // Time dimension should be detected
    const timeDim = r.data.dimensions.find((d: any) => d.type === 'time');
    assert.ok(timeDim, 'Should find time dimension');
    // Area level should be detected
    assert.equal(r.data.areaLevel, 'prefecture');
  });

  it('should fail without id', async () => {
    const r = await schema({ source: 'estat', id: '' }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });

  it('should fail for unsupported source', async () => {
    const r = await schema({ source: 'unknown', id: '123' }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });
});

// ═══ coverage ═══

describe('navigate: coverage', () => {
  it('should list available APIs for topic "人口"', () => {
    const r = coverage({ topic: '人口' });
    assert.equal(r.success, true);
    assert.ok(r.data.apis.length >= 2);
    assert.ok(['full', 'partial', 'insufficient'].includes(r.data.feasibility));
  });

  it('should list all APIs without topic', () => {
    const r = coverage({ area: '東京都' });
    assert.equal(r.success, true);
    assert.ok(r.data.apis.length >= 5, `Expected at least 5 APIs, got ${r.data.apis.length}`);
  });

  it('should show feasibility', () => {
    const r = coverage({ topic: '気象' });
    assert.equal(r.success, true);
    assert.ok(r.data.feasibility);
    assert.ok(r.data.summary);
  });

  it('should fail without topic or area', () => {
    const r = coverage({});
    assert.equal(r.success, false);
  });
});
