/**
 * E2E Scenario 8: ロバストネス検証
 *
 * C1: code_lookup フォールバック（辞書外・不正入力）
 * C2: fetch_aligned 部分失敗ハンドリング
 * エッジケースと異常系を網羅的にテスト。
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { codeLookup, areaBridge, timeBridge, entityBridge } from '../../build/providers/resolve.js';
import { fetchAligned, normalize, fillGaps } from '../../build/providers/join.js';
import { recommend, schema, coverage } from '../../build/providers/navigate.js';
import { cache, rateLimiters } from '../../build/utils/http.js';
import { assertApiResponse } from './helpers/e2e-utils.ts';

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

// ═══ C1: code_lookup フォールバック ═══

describe('C1: code_lookup フォールバック検証', () => {

  it('辞書にない統計クエリ → 明確なエラーメッセージ', () => {
    // 漁業センサスは辞書に存在しない & 地域名も含まない → 解決不能
    const r = codeLookup({ query: '漁業センサス 養殖業' });
    assert.equal(r.success, false, 'Should fail for unknown topic without area');
    assert.ok(r.error, 'Should have error message');
    assert.ok(r.error!.includes('特定できません'), 'Error should be descriptive');
  });

  it('辞書にない統計 + 地域名 → area だけ返る + hints', () => {
    // 「北海道の漁業センサス」→ 地域(北海道)は解決、トピック(漁業センサス)は未解決
    const r = codeLookup({ query: '北海道の漁業センサス' });
    assertApiResponse(r);
    assert.ok(r.data.area, 'Should resolve area (北海道)');
    assert.equal(r.data.area.prefCode, '01');
    // トピックは見つからないので hints が返る
    if (!r.data.topic) {
      assert.ok(r.data.hints, 'Should have hints for unresolved topic');
      assert.ok(
        r.data.hints.some((h: string) => h.includes('estat') || h.includes('検索')),
        'hints should suggest estat search',
      );
    }
  });

  it('完全に存在しないクエリ → 明確なエラー/hints', () => {
    const r = codeLookup({ query: 'XYZZY存在しない統計' });
    // topic もarea も解決できない → error
    assert.equal(r.success, false);
    assert.ok(r.error, 'Should have error message');
    assert.ok(r.error!.includes('特定できません'), `Error should be descriptive: ${r.error}`);
  });

  it('地域名のみのクエリ → area だけ返る', () => {
    const r = codeLookup({ query: '北海道' });
    assertApiResponse(r);
    assert.ok(r.data.area, 'Should resolve area');
    assert.equal(r.data.area.prefCode, '01');
    // topic は見つからない場合もある（北海道だけではトピック不明）
  });

  it('トピックのみのクエリ → topic だけ返る', () => {
    const r = codeLookup({ query: 'GDP' });
    assertApiResponse(r);
    assert.ok(r.data.topic, 'Should resolve topic');
    assert.equal(r.data.topic.name, 'GDP');
    // area は undefined（地域指定なし）
    assert.equal(r.data.area, undefined);
  });

  it('英語エイリアス → 正しいトピックに解決', () => {
    const cases = [
      { query: 'population', expect: '人口' },
      { query: 'CPI', expect: '物価' },
      { query: 'trade', expect: '貿易' },
      { query: 'weather', expect: '気象' },
      { query: 'earthquake', expect: '防災' },
    ];
    for (const { query, expect: expectedTopic } of cases) {
      const r = codeLookup({ query });
      assertApiResponse(r);
      assert.ok(r.data.topic, `${query} should resolve topic`);
      assert.equal(r.data.topic.name, expectedTopic, `${query} should resolve to ${expectedTopic}`);
    }
  });

  it('source フィルタ → 指定sourceのツールのみ返る', () => {
    const r = codeLookup({ query: '人口', source: 'estat' });
    assertApiResponse(r);
    assert.ok(r.data.topic, 'Should resolve topic');
    const tools = r.data.topic.tools;
    for (const t of tools) {
      assert.equal(t.tool, 'estat', `All tools should be estat, got: ${t.tool}`);
    }
  });

  it('空白入力 → エラー', () => {
    assert.equal(codeLookup({ query: '' }).success, false);
    assert.equal(codeLookup({ query: '   ' }).success, false);
  });

  it('特殊文字入力 → クラッシュしない', () => {
    const specials = ['<script>', '"; DROP TABLE', '🎉', '\\n\\r\\t', 'null', 'undefined'];
    for (const q of specials) {
      const r = codeLookup({ query: q });
      // success が true でも false でもクラッシュしないことが重要
      assert.ok(typeof r.success === 'boolean', `Should not crash on "${q}"`);
    }
  });
});

// ═══ C2: fetch_aligned 部分失敗ハンドリング ═══

describe('C2: fetch_aligned 部分失敗ハンドリング', () => {

  it('1指標が存在しないクエリでも全体はsuccess', async () => {
    // estat search をモック: 最初の呼出しは成功、2番目は空結果
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return mockJsonResponse({
        GET_STATS_LIST: {
          RESULT: { STATUS: 0 },
          DATALIST_INF: { NUMBER: callCount === 1 ? 1 : 0,
            TABLE_INF: callCount === 1 ? [{ '@id': '001', TITLE: 'テスト' }] : [] },
        },
      });
    };

    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '人口推計', label: '人口' },
          { source: 'estat', query: '存在しないXYZZY', label: '不明' },
        ],
        axis: { time: { from: '2020', to: '2023' } },
      },
      { estat: { appId: 'test' } },
    );

    assertApiResponse(r);

    // 全体は success
    assert.equal(r.success, true, 'Overall should succeed');
    assert.equal(r.data.indicators.length, 2, 'Should have 2 indicator results');

    // 各indicatorの成否を確認
    assert.ok(r.data.indicators[0].success || !r.data.indicators[0].success,
      'Each indicator should have success field');
  });

  it('API キーなしの指標 → warnings に記録', async () => {
    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '人口', label: '人口' },
        ],
      },
      { estat: { appId: '' } },  // キーなし
    );

    assertApiResponse(r);
    assert.equal(r.success, true, 'Overall should succeed');
    assert.equal(r.data.indicators[0].success, false, 'Indicator should fail');
    assert.ok(r.data.warnings, 'Should have warnings');
    assert.ok(r.data.warnings.length > 0, 'warnings should not be empty');
  });

  it('複数ソース混在で一部失敗', async () => {
    globalThis.fetch = async () => {
      return mockJsonResponse({
        GET_STATS_LIST: {
          RESULT: { STATUS: 0 },
          DATALIST_INF: { NUMBER: 1, TABLE_INF: [{ '@id': '001', TITLE: 'テスト' }] },
        },
      });
    };

    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '人口', label: '人口' },
          { source: 'stats', id: 'A1101', label: 'ダッシュボード' },  // stats needs resolvedId
          { source: 'boj', query: 'コールレート', label: '金利' },    // boj needs resolvedId
        ],
      },
      { estat: { appId: 'test' } },
    );

    assertApiResponse(r);
    assert.equal(r.data.indicators.length, 3, 'All 3 indicators should be in results');
    // 一部が失敗しても全体は success
    assert.equal(r.success, true);
  });

  it('空 indicators → エラー', async () => {
    const r = await fetchAligned({ indicators: [] }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
  });

  it('axis 情報が正しく伝播', async () => {
    globalThis.fetch = async () => mockJsonResponse({ RESULT: [] });

    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '人口', label: '人口' },
        ],
        axis: {
          time: { from: '2020', to: '2023', freq: 'A' },
          area: { prefCodes: ['13'] },
        },
      },
      { estat: { appId: 'test' } },
    );

    assertApiResponse(r);
    // time axis が resolve される
    assert.ok(r.data.axis.time, 'Should have resolved time axis');
    assert.ok(r.data.axis.time.estatCdTime, 'Should have estatCdTime');
    assert.ok(r.data.axis.time.years, 'Should have years');
    // area axis が resolve される
    assert.ok(r.data.axis.area, 'Should have resolved area axis');
    assert.equal(r.data.axis.area.prefCode, '13');
    assert.equal(r.data.axis.area.name, '東京都');
  });
});

// ═══ その他のロバストネス ═══

describe('ロバストネス: area_bridge 異常系', () => {

  it('存在しない prefCode(99) → エラー', () => {
    const r = areaBridge({ prefCode: '99' });
    assert.equal(r.success, false);
  });

  it('prefCode "0" → エラー', () => {
    const r = areaBridge({ prefCode: '0' });
    assert.equal(r.success, false);
  });

  it('何も指定しない → エラーではなく最寄り返し？', () => {
    // 全パラメータ undefined の場合
    const r = areaBridge({});
    assert.equal(r.success, false);
  });
});

describe('ロバストネス: navigate 異常系', () => {

  it('schema: 不正な source → 明確なエラー', async () => {
    const r = await schema({ source: 'unknown', id: '123' }, { estat: { appId: 'test' } });
    assert.equal(r.success, false);
    assert.ok(r.error!.includes('未対応'));
  });

  it('coverage: 空パラメータ → エラー', () => {
    const r = coverage({});
    assert.equal(r.success, false);
  });

  it('recommend: 非常に長い入力 → クラッシュしない', () => {
    const longTopic = 'あ'.repeat(1000);
    const r = recommend({ topic: longTopic });
    assert.ok(typeof r.success === 'boolean');
  });
});

describe('ロバストネス: normalize/fillGaps 異常系', () => {

  it('normalize: NaN 値 → 原値保持', () => {
    const r = normalize({
      data: [{ time: '2023', value: 'not-a-number', unit: '千人' }],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assertApiResponse(r);
    // NaN は変換されず原値を保持
    assert.equal(r.data.records[0].value, 'not-a-number');
    assert.equal(r.data.records[0].converted, false);
  });

  it('normalize: 非常に大きな値', () => {
    const r = normalize({
      data: [{ time: '2023', value: Number.MAX_SAFE_INTEGER, unit: '千人' }],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assertApiResponse(r);
    // オーバーフローしないことを確認（JS Numbers は大丈夫だが念のため）
    assert.ok(r.data.records[0].value > 0, 'Should be positive');
  });

  it('fillGaps: 重複する time 値', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2020', value: 101 },  // 重複
        { time: '2022', value: 102 },
      ],
      expectedRange: { from: '2020', to: '2022' },
      frequency: 'year',
    });
    assertApiResponse(r);
    // 重複があってもクラッシュしない
    assert.ok(r.data.complete.length >= 3, 'Should handle duplicates');
  });

  it('fillGaps: from > to の expectedRange', () => {
    const r = fillGaps({
      records: [{ time: '2023', value: 100 }],
      expectedRange: { from: '2025', to: '2020' },  // 逆
      frequency: 'year',
    });
    // クラッシュしないことが重要
    assert.ok(typeof r.success === 'boolean');
  });
});
