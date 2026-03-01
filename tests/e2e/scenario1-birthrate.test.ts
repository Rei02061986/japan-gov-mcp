/**
 * E2E Scenario 1: 少子化の地域差分析
 *
 * 「都道府県別の出生率と関連指標を比較し、少子化の地域差を把握したい」
 * navigate → resolve → join の典型的なワークフローを検証。
 *
 * ESTAT_APP_ID が未設定の場合、API呼出しステップはスキップ。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, schema, coverage } from '../../build/providers/navigate.js';
import { areaBridge, timeBridge, codeLookup } from '../../build/providers/resolve.js';
import { fetchAligned } from '../../build/providers/join.js';
import {
  assertApiResponse, assertHasFields, assertNonEmpty,
  hasApiKey, wait, isServerError,
} from './helpers/e2e-utils.ts';

const HAS_ESTAT = hasApiKey('ESTAT_APP_ID');
const estatConfig = { appId: process.env.ESTAT_APP_ID || '' };

describe('E2E Scenario 1: 少子化の地域差分析', () => {

  // ── Step 1: navigate.recommend ──
  it('Step 1: navigate.recommend("少子化 地域差") → 推薦リスト', () => {
    const r = recommend({ topic: '少子化 地域差' });
    assertApiResponse(r);

    const recs = r.data.recommended;
    assert.ok(Array.isArray(recs), 'recommended should be an array');
    assertNonEmpty(recs, 'recommended');

    // 少子化 → 人口テーマにマッチするはず（keywords に "出生" を含む）
    assert.ok(recs.length >= 2, `Expected >= 2 recommendations, got ${recs.length}`);

    // 各推薦の構造チェック
    for (const rec of recs) {
      assert.ok(rec.tool, 'Should have tool');
      assert.ok(rec.label, 'Should have label');
      assert.ok(
        ['primary', 'secondary', 'context'].includes(rec.relevance as string),
        `Invalid relevance: ${rec.relevance}`,
      );
    }

    // estat または stats が推薦に含まれる
    const tools = recs.map((r: any) => r.tool);
    assert.ok(
      tools.includes('estat') || tools.includes('stats'),
      `Expected estat or stats in recommendations, got: ${tools.join(', ')}`,
    );
  });

  // ── Step 2: navigate.schema (e-Stat meta) ──
  it('Step 2: navigate.schema → データ構造確認', { skip: !HAS_ESTAT && 'ESTAT_APP_ID未設定' }, async () => {
    // 人口推計のstatsDataId (有名なテーブル)
    const r = await schema({ source: 'estat', id: '0003448230' }, { estat: estatConfig });

    if (isServerError(r)) {
      console.error('  ⏭ e-Stat server error, skipping');
      return;
    }

    assertApiResponse(r);
    assert.ok(r.data.dimensions, 'Should have dimensions');
    assert.ok(Array.isArray(r.data.dimensions), 'dimensions should be array');

    // 最低限 time と area の次元がある
    const types = r.data.dimensions.map((d: any) => d.type);
    assert.ok(types.includes('time'), 'Should have time dimension');

    // areaLevel が返る
    assert.ok(r.data.areaLevel, `Should have areaLevel, got: ${r.data.areaLevel}`);

    await wait();
  });

  // ── Step 3: resolve.area_bridge ──
  it('Step 3: resolve.area_bridge(東京都) → コード変換', () => {
    const r = areaBridge({ prefCode: '13' });
    assertApiResponse(r);

    assert.equal(r.data.name, '東京都');
    assert.ok(r.data.estatCode, 'Should have estatCode');
    assert.equal(r.data.jmaCode, '130000');
    assert.equal(r.data.prefCode, '13');
    assertHasFields(r.data, ['lat', 'lon'], 'area data');
  });

  // ── Step 4: resolve.time_bridge ──
  it('Step 4: resolve.time_bridge(2018-2023) → 時間コード変換', () => {
    const r = timeBridge({ from: '2018', to: '2023', freq: 'A', calendar: 'calendar' });
    assertApiResponse(r);

    assert.ok(r.data.estatCdTime, 'Should have estatCdTime');
    assert.deepEqual(r.data.labels, ['2018年', '2019年', '2020年', '2021年', '2022年', '2023年']);
    assert.equal(r.data.labels.length, 6);
  });

  // ── Step 5: resolve.code_lookup ──
  it('Step 5: resolve.code_lookup("合計特殊出生率") → トピック解決', () => {
    const r = codeLookup({ query: '合計特殊出生率 都道府県別' });
    assertApiResponse(r);

    // 人口テーマにマッチ（出生は人口のキーワード）
    assert.ok(r.data.topic, 'Should resolve topic');
    assert.ok(r.data.topic.name, 'Topic should have name');
    assert.ok(r.data.topic.tools?.length >= 1, 'Topic should have tools');
  });

  // ── Step 6: join.fetch_aligned (実API) ──
  it('Step 6: join.fetch_aligned → 複数指標の結合取得', { skip: !HAS_ESTAT && 'ESTAT_APP_ID未設定' }, async () => {
    const r = await fetchAligned(
      {
        indicators: [
          { source: 'estat', query: '合計特殊出生率 都道府県別', label: '出生率' },
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

    // indicators 配列が返る
    assert.ok(Array.isArray(r.data.indicators), 'Should have indicators array');
    assert.equal(r.data.indicators.length, 1);

    // axis が返る
    assert.ok(r.data.axis, 'Should have axis');
    assert.ok(r.data.axis.time, 'Should have time axis');

    await wait();
  });

  // ── Step 7: navigate.coverage ──
  it('Step 7: navigate.coverage("少子化") → API有無確認', () => {
    const r = coverage({ topic: '少子化' });
    assertApiResponse(r);

    assert.ok(r.data.apis.length >= 1, 'Should have at least 1 API');
    assert.ok(['full', 'partial', 'insufficient'].includes(r.data.feasibility));
    assert.ok(r.data.summary, 'Should have summary');
  });
});
