/**
 * E2E Scenario 3: 地域経済比較（東京 vs 大阪）
 *
 * 「東京と大阪の経済指標を横並びで比較したい」
 * resolve.area_bridge → code_lookup → navigate.coverage → join.fetch_aligned
 *
 * ESTAT_APP_ID が未設定の場合、API呼出しステップはスキップ。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areaBridge, codeLookup, timeBridge } from '../../build/providers/resolve.js';
import { coverage } from '../../build/providers/navigate.js';
import { fetchAligned } from '../../build/providers/join.js';
import {
  assertApiResponse, assertHasFields, assertNonEmpty,
  hasApiKey, wait, isServerError,
} from './helpers/e2e-utils.ts';

const HAS_ESTAT = hasApiKey('ESTAT_APP_ID');
const estatConfig = { appId: process.env.ESTAT_APP_ID || '' };

describe('E2E Scenario 3: 地域経済比較（東京 vs 大阪）', () => {

  // ── Step 1: area_bridge（東京） ──
  it('Step 1: areaBridge("東京") → コード解決', () => {
    const r = areaBridge({ name: '東京' });
    assertApiResponse(r);

    assert.equal(r.data.prefCode, '13');
    assert.equal(r.data.name, '東京都');
    assertHasFields(r.data, ['estatCode', 'jmaCode', 'lat', 'lon'], 'Tokyo area');
  });

  // ── Step 2: area_bridge（大阪） ──
  it('Step 2: areaBridge("大阪") → コード解決', () => {
    const r = areaBridge({ name: '大阪' });
    assertApiResponse(r);

    assert.equal(r.data.prefCode, '27');
    assert.equal(r.data.name, '大阪府');
    assertHasFields(r.data, ['estatCode', 'jmaCode', 'lat', 'lon'], 'Osaka area');
  });

  // ── Step 3: code_lookup（県内総生産） ──
  it('Step 3: codeLookup("県内総生産") → トピック解決', () => {
    const r = codeLookup({ query: '県内総生産', source: 'estat' });
    assertApiResponse(r);

    // GDP テーマにマッチするはず
    assert.ok(r.data.topic, 'Should resolve topic');
    assert.ok(r.data.topic.name, 'Topic should have name');
    assert.ok(r.data.topic.tools?.length >= 1, 'Topic should have tools');
  });

  // ── Step 4: navigate.coverage ──
  it('Step 4: coverage("GDP") → データ有無確認', () => {
    const r = coverage({ topic: 'GDP' });
    assertApiResponse(r);

    assertNonEmpty(r.data.apis, 'APIs for GDP');
    assert.ok(r.data.apis.length >= 2, `Expected >= 2 APIs for GDP, got ${r.data.apis.length}`);
    assert.ok(['full', 'partial', 'insufficient'].includes(r.data.feasibility));
  });

  // ── Step 5: timeBridge（2018-2023） ──
  it('Step 5: timeBridge(2018-2023) → 時間コード変換', () => {
    const r = timeBridge({ from: '2018', to: '2023', freq: 'A' });
    assertApiResponse(r);
    assert.ok(r.data.estatCdTime);
    assert.equal(r.data.years.length, 6);
  });

  // ── Step 6: 東京・大阪のコードが異なることを確認 ──
  it('Step 6: 東京と大阪のコードが異なる', () => {
    const tokyo = areaBridge({ name: '東京' });
    const osaka = areaBridge({ name: '大阪' });

    assert.notEqual(tokyo.data.prefCode, osaka.data.prefCode);
    assert.notEqual(tokyo.data.estatCode, osaka.data.estatCode);
    assert.notEqual(tokyo.data.jmaCode, osaka.data.jmaCode);
  });

  // ── Step 7: 全47都道府県のarea_bridgeが解決できる ──
  it('Step 7: 全47都道府県が area_bridge で解決可能', () => {
    for (let i = 1; i <= 47; i++) {
      const code = String(i).padStart(2, '0');
      const r = areaBridge({ prefCode: code });
      assertApiResponse(r);
      assert.equal(r.data.prefCode, code, `Failed for prefCode ${code}`);
      assert.ok(r.data.name, `Missing name for ${code}`);
      assert.ok(r.data.estatCode, `Missing estatCode for ${code}`);
      assert.ok(r.data.jmaCode, `Missing jmaCode for ${code}`);
    }
  });

  // ── Step 8: fetch_aligned（東京のGDP関連） ──
  it('Step 8: fetch_aligned(東京, GDP) → 実API結合', {
    skip: !HAS_ESTAT && 'ESTAT_APP_ID未設定',
  }, async () => {
    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '県内総生産', label: 'GDP' },
        ],
        axis: {
          time: { from: '2020', to: '2022', freq: 'A' },
          area: { prefCodes: ['13'] },
        },
      },
      { estat: estatConfig },
    );

    if (isServerError(r)) {
      console.error('  ⏭ e-Stat server error, skipping');
      return;
    }

    assertApiResponse(r);
    assert.ok(Array.isArray(r.data.indicators), 'Should have indicators');
    assert.equal(r.data.indicators.length, 1);

    // axis が正しく設定される
    assert.ok(r.data.axis.time, 'Should have time axis');
    assert.ok(r.data.axis.area, 'Should have area axis');

    await wait();
  });

  // ── Step 9: 英語名でもエリア解決 ──
  it('Step 9: 英語名 "tokyo" / "osaka" でもエリア解決', () => {
    const t = areaBridge({ name: 'tokyo' });
    assertApiResponse(t);
    assert.equal(t.data.prefCode, '13');

    const o = areaBridge({ name: 'osaka' });
    assertApiResponse(o);
    assert.equal(o.data.prefCode, '27');
  });

  // ── Step 10: lat/lon から最寄り都道府県 ──
  it('Step 10: lat/lon → 最寄り都道府県（東京タワー付近）', () => {
    const r = areaBridge({ lat: 35.6586, lon: 139.7454 });
    assertApiResponse(r);
    assert.equal(r.data.prefCode, '13', 'Tokyo Tower should resolve to Tokyo');
    assert.equal(r.data.name, '東京都');
  });
});
