/**
 * E2E Scenario 2: 企業の多面調査（トヨタ自動車）
 *
 * 「トヨタ自動車のgBiz情報を取得するために、まず企業名からIDを解決したい」
 * resolve.entity_bridge を中心に、企業ID横断変換を検証。
 *
 * HOUJIN_APP_ID / GBIZ_TOKEN が未設定の場合、API呼出しステップはスキップ。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entityBridge, codeLookup } from '../../build/providers/resolve.js';
import { recommend } from '../../build/providers/navigate.js';
import {
  assertApiResponse, assertHasFields,
  hasApiKey, wait, isServerError,
} from './helpers/e2e-utils.ts';

const HAS_HOUJIN = hasApiKey('HOUJIN_APP_ID');
const HAS_GBIZ = hasApiKey('GBIZ_TOKEN');
const HAS_ANY_CORP_KEY = HAS_HOUJIN || HAS_GBIZ;

const houjinConfig = { appId: process.env.HOUJIN_APP_ID || '' };
const gbizConfig = { token: process.env.GBIZ_TOKEN || '' };

describe('E2E Scenario 2: 企業の多面調査（トヨタ自動車）', () => {

  // ── Step 1: entity_bridge（名前検索） ──
  it('Step 1: entity_bridge("トヨタ自動車") → 法人番号解決', {
    skip: !HAS_ANY_CORP_KEY && 'HOUJIN_APP_ID/GBIZ_TOKEN共に未設定',
  }, async () => {
    const r = await entityBridge(
      { name: 'トヨタ自動車' },
      { houjin: houjinConfig, gbiz: gbizConfig },
    );

    if (isServerError(r)) {
      console.error('  ⏭ Server error, skipping');
      return;
    }

    assertApiResponse(r);

    // corporateNumber が返る
    assert.ok(r.data.corporateNumber, 'Should have corporateNumber');
    assert.ok(
      /^\d{13}$/.test(r.data.corporateNumber),
      `corporateNumber should be 13 digits, got: ${r.data.corporateNumber}`,
    );

    // houjin or gbiz の結果がある
    assert.ok(
      r.data.houjin || r.data.gbiz,
      'Should have houjin or gbiz result',
    );

    // 名前に「トヨタ」が含まれる
    const name = r.data.houjin?.name || r.data.gbiz?.name;
    if (name) {
      assert.ok(
        (name as string).includes('トヨタ'),
        `Name should contain トヨタ, got: ${name}`,
      );
    }

    await wait(2000);
  });

  // ── Step 2: entity_bridge（法人番号から逆引き） ──
  it('Step 2: entity_bridge(corporateNumber) → 逆引き', {
    skip: !HAS_HOUJIN && 'HOUJIN_APP_ID未設定',
  }, async () => {
    // トヨタ自動車の法人番号（公開情報）
    const toyotaCorpNum = '1180301018771';

    const r = await entityBridge(
      { corporateNumber: toyotaCorpNum },
      { houjin: houjinConfig, gbiz: gbizConfig },
    );

    if (isServerError(r)) {
      console.error('  ⏭ Server error, skipping');
      return;
    }

    assertApiResponse(r);
    assert.equal(r.data.corporateNumber, toyotaCorpNum);

    await wait(2000);
  });

  // ── Step 3: navigate.recommend（自動車産業） ──
  it('Step 3: navigate.recommend("自動車産業 動向") → API推薦', () => {
    const r = recommend({ topic: '自動車産業 動向' });
    assertApiResponse(r);

    const recs = r.data.recommended;
    assert.ok(Array.isArray(recs), 'recommended should be an array');
    assert.ok(recs.length >= 1, 'Should have at least 1 recommendation');

    // estat or stats が推薦に含まれる
    const tools = recs.map((r: any) => r.tool);
    assert.ok(
      tools.includes('estat') || tools.includes('stats'),
      `Expected estat or stats, got: ${tools.join(', ')}`,
    );
  });

  // ── Step 4: code_lookup（企業関連指標） ──
  it('Step 4: codeLookup("企業") → トピック解決', () => {
    const r = codeLookup({ query: '企業' });
    assertApiResponse(r);
    assert.ok(r.data.topic, 'Should resolve 企業 topic');
    assert.ok(r.data.topic.tools?.length >= 1, 'Should have tool references');
  });

  // ── Step 5: APIキー未設定時の graceful 処理 ──
  it('Step 5: entity_bridge(APIキーなし) → 適切なエラー/警告', async () => {
    const r = await entityBridge(
      { name: 'テスト企業' },
      { houjin: { appId: '' }, gbiz: { token: '' } },
    );

    // success=false（両方キーなし → 企業情報が見つからない）
    assert.equal(r.success, false, 'Should fail with no API keys');
    assert.ok(r.error, 'Should have error message');
  });
});
