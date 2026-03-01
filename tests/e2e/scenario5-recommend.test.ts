/**
 * E2E Scenario 5: navigate.recommend の網羅性テスト
 *
 * 様々な政策テーマで推薦が機能するか検証。
 * 純粋関数のためAPIキー不要。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, coverage } from '../../build/providers/navigate.js';
import { assertApiResponse, assertNonEmpty } from './helpers/e2e-utils.ts';

const THEMES = [
  { topic: '高齢化 医療費', expect: { minResults: 1 } },
  { topic: '観光 インバウンド', expect: { minResults: 1 } },
  { topic: '雇用 賃金上昇', expect: { minResults: 2 } },
  { topic: '物価 インフレ', expect: { minResults: 2 } },
  { topic: '地方創生 人口減少', expect: { minResults: 1 } },
  { topic: '住宅 不動産市場', expect: { minResults: 1 } },
  { topic: '貿易 輸出入', expect: { minResults: 2 } },
  { topic: '環境 脱炭素', expect: { minResults: 1 } },
  { topic: '教育 学力', expect: { minResults: 1 } },
  { topic: '防災 地震リスク', expect: { minResults: 1 } },
] as const;

describe('E2E Scenario 5: navigate.recommend 網羅性', () => {

  let passCount = 0;

  for (const theme of THEMES) {
    it(`recommend("${theme.topic}") → 有効な推薦を返す`, () => {
      const r = recommend({ topic: theme.topic });
      assertApiResponse(r);

      const recs = r.data.recommended;
      assert.ok(Array.isArray(recs), 'recommended should be an array');
      assertNonEmpty(recs, `recommended for "${theme.topic}"`);

      // 最低件数チェック
      assert.ok(
        recs.length >= theme.expect.minResults,
        `Expected >= ${theme.expect.minResults} recommendations for "${theme.topic}", got ${recs.length}`,
      );

      // 各推薦の構造チェック
      for (const rec of recs) {
        assert.ok(rec.tool, `Recommendation for "${theme.topic}" missing tool`);
        assert.ok(rec.label, `Recommendation for "${theme.topic}" missing label`);
        assert.ok(
          ['primary', 'secondary', 'context'].includes(rec.relevance as string),
          `Invalid relevance "${rec.relevance}" for "${theme.topic}"`,
        );
      }

      passCount++;
    });
  }

  it('10テーマ中8テーマ以上が有効な推薦を返す（集計）', () => {
    // passCount はシリアル実行なので、ここで集計
    // ただし node:test では個別テストの結果を直接取れないため、
    // 全テーマを再度チェックする
    let valid = 0;
    for (const theme of THEMES) {
      const r = recommend({ topic: theme.topic });
      if (r.success && r.data.recommended?.length >= 1) valid++;
    }
    assert.ok(valid >= 8, `Expected 8+/10 valid themes, got ${valid}/10`);
  });

  it('recommend: quick vs comprehensive でレスポンス量が違う', () => {
    const quick = recommend({ topic: '雇用', detailLevel: 'quick' });
    const full = recommend({ topic: '雇用', detailLevel: 'comprehensive' });
    assertApiResponse(quick);
    assertApiResponse(full);
    assert.ok(
      quick.data.recommended.length <= full.data.recommended.length,
      `Quick (${quick.data.recommended.length}) should have <= items than comprehensive (${full.data.recommended.length})`,
    );
  });

  it('recommend: 未知トピックでも fallback が返る', () => {
    const r = recommend({ topic: '量子コンピュータ暗号通信' });
    assertApiResponse(r);
    assert.ok(r.data.recommended.length >= 1, 'Should have fallback recommendation');
    assert.equal(r.data.recommended[0].tool, 'estat', 'Fallback should suggest estat search');
  });

  it('coverage: トピック "人口" で複数API列挙', () => {
    const r = coverage({ topic: '人口' });
    assertApiResponse(r);
    assert.ok(r.data.apis.length >= 2, `Expected >= 2 APIs for 人口, got ${r.data.apis.length}`);
    assert.ok(['full', 'partial', 'insufficient'].includes(r.data.feasibility));
    assert.ok(r.data.summary, 'Should have summary');
  });

  it('coverage: エリアのみ指定で全API一覧', () => {
    const r = coverage({ area: '東京都' });
    assertApiResponse(r);
    assert.ok(r.data.apis.length >= 5, `Expected >= 5 APIs, got ${r.data.apis.length}`);
  });

  it('coverage: トピック＋エリア指定', () => {
    const r = coverage({ topic: '気象', area: '北海道' });
    assertApiResponse(r);
    assert.ok(r.data.apis.length >= 1);
    assert.ok(r.data.feasibility);
  });

  // ── W1 追加: 残り22テーマの全数テスト ──

  const REMAINING_TOPICS = [
    'GDP', '物価', '財政', '金融', '鉱工業', '住宅', '教育',
    '医療', '福祉', '少子化', '高齢化', '農業', '企業',
    '気象', '交通', '法令', '地理', '学術', '文化',
    '海外安全', '入札', 'エネルギー',
  ] as const;

  for (const topic of REMAINING_TOPICS) {
    it(`W1: recommend("${topic}") → 辞書ヒット`, () => {
      const r = recommend({ topic });
      assertApiResponse(r);
      const recs = r.data.recommended;
      assert.ok(Array.isArray(recs), `${topic}: should be array`);
      assertNonEmpty(recs, `${topic}: recommended`);
      // 辞書ヒットならトピック名が正規化されている
      assert.ok(r.data.topic, `${topic}: should have resolved topic`);
    });
  }

  // ── W1 追加: 辞書にないテーマのフォールバックテスト ──

  const OUT_OF_DICT_TOPICS = [
    '宇宙開発', '量子コンピュータ', 'フードロス',
    'ヤングケアラー', '空き家問題', '水道老朽化',
    'サイバーセキュリティ', '半導体産業', 'リスキリング',
    'カーボンプライシング',
  ] as const;

  for (const topic of OUT_OF_DICT_TOPICS) {
    it(`W1: recommend("${topic}") → フォールバック（estat検索）`, () => {
      const r = recommend({ topic });
      assertApiResponse(r);
      const recs = r.data.recommended;
      assert.ok(Array.isArray(recs), `${topic}: should be array`);
      assertNonEmpty(recs, `${topic}: should fallback to estat`);
      // フォールバック時はestat.searchを推薦
      assert.equal(recs[0].tool, 'estat', `${topic}: fallback should suggest estat`);
      assert.equal(recs[0].action, 'search', `${topic}: fallback should suggest search action`);
    });
  }

  it('W1: 全32辞書テーマが recommend で解決可能（集計）', () => {
    const ALL_TOPICS = [
      '人口', 'GDP', '物価', '雇用', '貿易', '財政', '金融', '鉱工業',
      '住宅', '教育', '医療', '福祉', '少子化', '高齢化', '観光', '農業',
      '環境', '企業', '気象', '防災', '交通', '法令', '地理', '学術',
      '文化', '海外安全', '入札', '中小企業', 'エネルギー', '犯罪', '賃金', '消費',
    ];
    let pass = 0;
    for (const topic of ALL_TOPICS) {
      const r = recommend({ topic });
      if (r.success && r.data.recommended?.length >= 1) pass++;
    }
    assert.equal(pass, ALL_TOPICS.length, `All ${ALL_TOPICS.length} topics should resolve`);
  });
});
