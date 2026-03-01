/**
 * E2E Scenario 4: 時間コード変換の正確性
 *
 * 暦年・年度・月次・四半期の変換が正しく機能するか検証。
 * 全て純粋関数のためAPIキー不要。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { timeBridge } from '../../build/providers/resolve.js';
import { assertApiResponse, assertHasFields } from './helpers/e2e-utils.ts';

describe('E2E Scenario 4: 時間コード変換', () => {

  it('Step 1: 暦年→年次（2020-2024）', () => {
    const r = timeBridge({ from: '2020', to: '2024', freq: 'A', calendar: 'calendar' });
    assertApiResponse(r);
    const d = r.data;

    // estatCdTime が空でない
    assert.ok(d.estatCdTime, 'estatCdTime should not be empty');
    assert.ok(d.estatCdTime.includes('2020'), 'estatCdTime should contain 2020');
    assert.ok(d.estatCdTime.includes('2024'), 'estatCdTime should contain 2024');

    // labels が5要素 (2020-2024)
    assert.deepEqual(d.labels, ['2020年', '2021年', '2022年', '2023年', '2024年']);
    assert.deepEqual(d.years, [2020, 2021, 2022, 2023, 2024]);

    // BOJ期間
    assertHasFields(d.bojPeriod, ['from', 'to'], 'bojPeriod');
    assert.equal(d.bojPeriod.from, '202001');
    assert.equal(d.bojPeriod.to, '202412');
  });

  it('Step 2: 年度（fiscal year）変換', () => {
    const r = timeBridge({ from: '2020', to: '2024', freq: 'A', calendar: 'fiscal' });
    assertApiResponse(r);
    const d = r.data;

    // ラベルに「年度」が含まれる
    assert.ok(d.labels[0].includes('年度'), `Label should contain 年度, got: ${d.labels[0]}`);
    assert.deepEqual(d.labels, ['2020年度', '2021年度', '2022年度', '2023年度', '2024年度']);

    // BOJ期間が4月始まり
    assert.equal(d.bojPeriod.from, '202004', 'Fiscal year should start from April');
    assert.equal(d.bojPeriod.to, '202503', 'Fiscal year should end in March next year');

    // 暦年テスト(Step 1)とestatCdTimeが異なるかは実装依存だが、
    // BOJ期間は確実に異なるはず
    const calR = timeBridge({ from: '2020', to: '2024', freq: 'A', calendar: 'calendar' });
    assert.notEqual(d.bojPeriod.from, calR.data.bojPeriod.from, 'Fiscal and calendar BOJ periods should differ');
  });

  it('Step 3: 月次（2023-01 ~ 2023-12）', () => {
    const r = timeBridge({ from: '2023', to: '2023', freq: 'M', calendar: 'calendar' });
    assertApiResponse(r);
    const d = r.data;

    // labels は1要素（年単位で生成）
    assert.ok(d.years.length === 1, 'Should have 1 year');
    assert.equal(d.years[0], 2023);

    // estatCdTime が月次コード形式（YYYYMM0000）
    assert.ok(d.estatCdTime, 'estatCdTime should not be empty');
    assert.ok(d.estatCdTime.includes('0000'), 'Monthly code should include 0000 suffix');
    // 月次 calendar: 202301 - 202312
    assert.ok(d.estatCdTime.includes('202301'), `estatCdTime should contain 202301, got: ${d.estatCdTime}`);
    assert.ok(d.estatCdTime.includes('202312'), `estatCdTime should contain 202312, got: ${d.estatCdTime}`);
  });

  it('Step 4: 四半期（2023-2024）', () => {
    const r = timeBridge({ from: '2023', to: '2024', freq: 'Q', calendar: 'calendar' });
    assertApiResponse(r);
    const d = r.data;

    // years が2要素
    assert.deepEqual(d.years, [2023, 2024]);

    // estatCdTime が四半期コード形式（YYYY0Q0000）
    assert.ok(d.estatCdTime, 'estatCdTime should not be empty');
    // Q1からQ4まで
    assert.ok(d.estatCdTime.includes('2023010000'), `Should start with 2023Q1, got: ${d.estatCdTime}`);
    assert.ok(d.estatCdTime.includes('2024040000'), `Should end with 2024Q4, got: ${d.estatCdTime}`);
  });

  it('Step 5: 和暦変換（令和5年=2023年）', () => {
    const r = timeBridge({ from: '令和5年', to: '令和7年' });
    assertApiResponse(r);
    assert.deepEqual(r.data.years, [2023, 2024, 2025]);
    assert.equal(r.data.fromYear, 2023);
    assert.equal(r.data.toYear, 2025);
  });

  it('Step 6: 和暦短縮形（R5=2023, H30=2018）', () => {
    const r1 = timeBridge({ from: 'R5' });
    assertApiResponse(r1);
    assert.equal(r1.data.fromYear, 2023);

    const r2 = timeBridge({ from: 'H30' });
    assertApiResponse(r2);
    assert.equal(r2.data.fromYear, 2018);
  });

  it('Step 7: FY年度表記', () => {
    const r = timeBridge({ from: 'FY2023', to: 'FY2024' });
    assertApiResponse(r);
    assert.equal(r.data.fromYear, 2023);
    assert.equal(r.data.toYear, 2024);
  });

  it('Step 8: 不正な入力はエラーを返す', () => {
    const r = timeBridge({ from: 'abc' });
    assert.equal(r.success, false);
    assert.ok(r.error);
  });

  // ── W2 追加: エッジケース ──

  it('W2-1: 令和元年 (R1 = 2019)', () => {
    const r = timeBridge({ from: 'R1', to: 'R6' });
    assertApiResponse(r);
    assert.equal(r.data.fromYear, 2019);
    assert.equal(r.data.toYear, 2024);
    assert.deepEqual(r.data.years, [2019, 2020, 2021, 2022, 2023, 2024]);
  });

  it('W2-2: 単一年指定（from === to）', () => {
    const r = timeBridge({ from: '2023', to: '2023', freq: 'A' });
    assertApiResponse(r);
    assert.deepEqual(r.data.years, [2023]);
    assert.deepEqual(r.data.labels, ['2023年']);
    // estatCdTime は単一年コード
    assert.ok(r.data.estatCdTime.includes('2023'), 'Should include 2023');
  });

  it('W2-3: from のみ指定（to省略 → 単一年）', () => {
    const r = timeBridge({ from: '2023' });
    assertApiResponse(r);
    assert.equal(r.data.fromYear, 2023);
    assert.equal(r.data.toYear, 2023);
    assert.deepEqual(r.data.years, [2023]);
  });

  it('W2-4: 年度の月次（fiscal + M）→ BOJ期間が4月始まり', () => {
    const r = timeBridge({ from: '2023', to: '2023', freq: 'M', calendar: 'fiscal' });
    assertApiResponse(r);
    assert.equal(r.data.bojPeriod.from, '202304', 'Fiscal M should start April');
    assert.equal(r.data.bojPeriod.to, '202403', 'Fiscal M should end March');
    // estatCdTime も月次
    assert.ok(r.data.estatCdTime.includes('0000'), 'Monthly estat code');
  });

  it('W2-5: 昭和 (S63 = 1988)', () => {
    const r = timeBridge({ from: 'S63' });
    assertApiResponse(r);
    assert.equal(r.data.fromYear, 1988);
  });

  it('W2-6: 平成元年 (H1 = 1989)', () => {
    const r = timeBridge({ from: 'H1' });
    assertApiResponse(r);
    assert.equal(r.data.fromYear, 1989);
  });

  it('W2-7: "2023年度" テキストのパース', () => {
    const r = timeBridge({ from: '2023年度' });
    assertApiResponse(r);
    assert.equal(r.data.fromYear, 2023);
  });

  it('W2-8: 広い年範囲 (2000-2024)', () => {
    const r = timeBridge({ from: '2000', to: '2024', freq: 'A' });
    assertApiResponse(r);
    assert.equal(r.data.years.length, 25);
    assert.equal(r.data.years[0], 2000);
    assert.equal(r.data.years[24], 2024);
  });
});
