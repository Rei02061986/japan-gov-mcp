import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { codeLookup, areaBridge, timeBridge, entityBridge } from '../build/providers/resolve.js';
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

// ═══ codeLookup ═══

describe('resolve: codeLookup', () => {
  it('should resolve "東京都の人口"', () => {
    const r = codeLookup({ query: '東京都の人口' });
    assert.equal(r.success, true);
    assert.equal(r.data.area?.prefCode, '13');
    assert.equal(r.data.area?.name, '東京都');
    assert.equal(r.data.area?.jmaCode, '130000');
    assert.equal(r.data.topic?.name, '人口');
    assert.ok(r.data.topic?.tools?.length > 0);
  });

  it('should resolve "大阪のGDP"', () => {
    const r = codeLookup({ query: '大阪のGDP' });
    assert.equal(r.success, true);
    assert.equal(r.data.area?.prefCode, '27');
    assert.equal(r.data.topic?.name, 'GDP');
  });

  it('should resolve topic alias "unemployment"', () => {
    const r = codeLookup({ query: 'unemployment' });
    assert.equal(r.success, true);
    assert.equal(r.data.topic?.name, '雇用');
  });

  it('should resolve topic alias "CPI"', () => {
    const r = codeLookup({ query: 'CPI' });
    assert.equal(r.success, true);
    assert.equal(r.data.topic?.name, '物価');
  });

  it('should resolve English prefecture "tokyo"', () => {
    const r = codeLookup({ query: 'tokyo' });
    assert.equal(r.success, true);
    assert.equal(r.data.area?.prefCode, '13');
  });

  it('should fail on empty query', () => {
    const r = codeLookup({ query: '' });
    assert.equal(r.success, false);
  });

  it('should return hints for unknown topic', () => {
    const r = codeLookup({ query: '東京都のなんとか' });
    assert.equal(r.success, true);
    assert.ok(r.data.area?.prefCode === '13');
    assert.ok(r.data.hints?.length > 0);
  });

  it('should filter by source=boj', () => {
    const r = codeLookup({ query: '物価', source: 'boj' });
    assert.equal(r.success, true);
    for (const t of r.data.topic?.tools || []) {
      assert.equal(t.action.startsWith('boj_'), true, `Expected boj_ action, got ${t.action}`);
    }
  });
});

// ═══ areaBridge ═══

describe('resolve: areaBridge', () => {
  it('should convert prefCode 13 → all codes', () => {
    const r = areaBridge({ prefCode: '13' });
    assert.equal(r.success, true);
    assert.equal(r.data.name, '東京都');
    assert.equal(r.data.jmaCode, '130000');
    assert.equal(r.data.estatCode, '13000');
  });

  it('should convert name "大阪" → all codes', () => {
    const r = areaBridge({ name: '大阪' });
    assert.equal(r.success, true);
    assert.equal(r.data.prefCode, '27');
    assert.equal(r.data.jmaCode, '270000');
  });

  it('should convert jmaCode "400000" → prefCode', () => {
    const r = areaBridge({ jmaCode: '400000' });
    assert.equal(r.success, true);
    assert.equal(r.data.prefCode, '40');
    assert.equal(r.data.name, '福岡県');
  });

  it('should convert estatCode "01000" → prefCode', () => {
    const r = areaBridge({ estatCode: '01000' });
    assert.equal(r.success, true);
    assert.equal(r.data.prefCode, '01');
    assert.equal(r.data.name, '北海道');
  });

  it('should resolve lat/lon near Tokyo', () => {
    const r = areaBridge({ lat: 35.68, lon: 139.69 });
    assert.equal(r.success, true);
    assert.equal(r.data.prefCode, '13');
  });

  it('should resolve hiragana "おおさか"', () => {
    const r = areaBridge({ name: 'おおさか' });
    assert.equal(r.success, true);
    assert.equal(r.data.prefCode, '27');
  });

  it('should resolve English "hokkaido"', () => {
    const r = areaBridge({ name: 'hokkaido' });
    assert.equal(r.success, true);
    assert.equal(r.data.prefCode, '01');
  });

  it('should fail on invalid name', () => {
    const r = areaBridge({ name: 'ニューヨーク' });
    assert.equal(r.success, false);
  });
});

// ═══ timeBridge ═══

describe('resolve: timeBridge', () => {
  it('should parse "2020" to "2020"', () => {
    const r = timeBridge({ from: '2020', to: '2023' });
    assert.equal(r.success, true);
    assert.equal(r.data.fromYear, 2020);
    assert.equal(r.data.toYear, 2023);
    assert.deepEqual(r.data.years, [2020, 2021, 2022, 2023]);
    assert.equal(r.data.estatCdTime, '2020000000-2023000000');
  });

  it('should parse 令和5年', () => {
    const r = timeBridge({ from: '令和5年' });
    assert.equal(r.success, true);
    assert.equal(r.data.fromYear, 2023);
  });

  it('should parse 平成30年', () => {
    const r = timeBridge({ from: '平成30年' });
    assert.equal(r.success, true);
    assert.equal(r.data.fromYear, 2018);
  });

  it('should parse R5 shorthand', () => {
    const r = timeBridge({ from: 'R5' });
    assert.equal(r.success, true);
    assert.equal(r.data.fromYear, 2023);
  });

  it('should parse FY2023', () => {
    const r = timeBridge({ from: 'FY2023' });
    assert.equal(r.success, true);
    assert.equal(r.data.fromYear, 2023);
  });

  it('should generate BOJ period for fiscal year', () => {
    const r = timeBridge({ from: '2023', to: '2024', calendar: 'fiscal' });
    assert.equal(r.success, true);
    assert.equal(r.data.bojPeriod.from, '202304');
    assert.equal(r.data.bojPeriod.to, '202503');
  });

  it('should generate BOJ period for calendar year', () => {
    const r = timeBridge({ from: '2023', to: '2023' });
    assert.equal(r.success, true);
    assert.equal(r.data.bojPeriod.from, '202301');
    assert.equal(r.data.bojPeriod.to, '202312');
  });

  it('should fail on unparseable input', () => {
    const r = timeBridge({ from: 'yesterday' });
    assert.equal(r.success, false);
  });
});

// ═══ entityBridge ═══

describe('resolve: entityBridge', () => {
  it('should bridge company name to IDs', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes('houjin-bangou')) {
        return mockJsonResponse({
          corporation: [{
            corporateNumber: '1234567890123',
            name: 'テスト株式会社',
            prefectureName: '東京都',
            cityName: '千代田区',
            streetNumber: '丸の内1-1',
            kind: '株式会社',
          }],
        });
      }
      if (url.includes('gbiz')) {
        return mockJsonResponse({
          'hojin-infos': [{
            corporate_number: '1234567890123',
            name: 'テスト株式会社',
            status: '存続',
            date_of_establishment: '2000-01-01',
            business_summary: 'テスト事業',
          }],
        });
      }
      return mockJsonResponse({});
    };

    const r = await entityBridge(
      { name: 'テスト株式会社' },
      { houjin: { appId: 'test' }, gbiz: { token: 'test' } },
    );
    assert.equal(r.success, true);
    assert.equal(r.data.corporateNumber, '1234567890123');
    assert.ok(r.data.houjin);
    assert.ok(r.data.gbiz);
  });

  it('should fail without name or corporateNumber', async () => {
    const r = await entityBridge({}, { houjin: { appId: 'test' }, gbiz: { token: 'test' } });
    assert.equal(r.success, false);
  });

  it('should warn when API key is missing', async () => {
    globalThis.fetch = async () => mockJsonResponse({ corporation: [] });
    const r = await entityBridge(
      { name: 'テスト' },
      { houjin: { appId: '' }, gbiz: { token: '' } },
    );
    // Should fail since both keys are empty
    assert.equal(r.success, false);
  });
});
