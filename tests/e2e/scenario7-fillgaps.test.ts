/**
 * E2E Scenario 7: join.fill_gaps 欠損検知
 *
 * 時系列データの欠損パターンを正しく検知できるか検証。
 * 現在の実装は flag_only（補完しない）。
 * 純粋関数のためAPIキー不要。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fillGaps } from '../../build/providers/join.js';
import { assertApiResponse } from './helpers/e2e-utils.ts';

describe('E2E Scenario 7: join.fill_gaps 欠損検知', () => {

  it('Step 1: 明示的範囲で中間欠損を検知', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2021', value: 101 },
        // 2022 欠損
        { time: '2023', value: 103 },
        { time: '2024', value: 104 },
      ],
      expectedRange: { from: '2020', to: '2024' },
      frequency: 'year',
    });
    assertApiResponse(r);

    // 2022年が欠損
    assert.deepEqual(r.data.gaps, ['2022']);
    assert.equal(r.data.coveragePercent, 80, '4/5 = 80%');

    // complete 配列は5要素
    assert.equal(r.data.complete.length, 5);

    // 2022年のエントリ
    const missing = r.data.complete.find((c: any) => c.time === '2022');
    assert.ok(missing, 'Should have 2022 entry');
    assert.equal(missing.value, null, '欠損値はnull（補完しない）');
    assert.equal(missing.isMissing, true);

    // 既存エントリ
    const existing = r.data.complete.find((c: any) => c.time === '2020');
    assert.ok(existing);
    assert.equal(existing.value, 100);
    assert.equal(existing.isMissing, false);
  });

  it('Step 2: 完全データ（欠損なし）', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2021', value: 101 },
        { time: '2022', value: 102 },
        { time: '2023', value: 103 },
      ],
      expectedRange: { from: '2020', to: '2023' },
      frequency: 'year',
    });
    assertApiResponse(r);

    assert.deepEqual(r.data.gaps, []);
    assert.equal(r.data.coveragePercent, 100);
    assert.ok(r.data.summary.includes('全'), 'Summary should indicate complete');
  });

  it('Step 3: 範囲自動検出', () => {
    const r = fillGaps({
      records: [
        { time: '2018', value: 100 },
        // 2019, 2020, 2021 欠損
        { time: '2022', value: 105 },
      ],
      frequency: 'year',
    });
    assertApiResponse(r);

    // 自動で2018-2022を推測し、3件の欠損を検出
    assert.ok(r.data.gaps.includes('2019'));
    assert.ok(r.data.gaps.includes('2020'));
    assert.ok(r.data.gaps.includes('2021'));
    assert.equal(r.data.gaps.length, 3);
    assert.equal(r.data.coveragePercent, 40, '2/5 = 40%');
  });

  it('Step 4: 四半期データの欠損検知', () => {
    const r = fillGaps({
      records: [
        { time: '2023Q1', value: 100 },
        // Q2 欠損
        { time: '2023Q3', value: 102 },
        // Q4 欠損
      ],
      expectedRange: { from: '2023', to: '2023' },
      frequency: 'quarter',
    });
    assertApiResponse(r);

    assert.ok(r.data.gaps.includes('2023Q2'), 'Q2 should be missing');
    assert.ok(r.data.gaps.includes('2023Q4'), 'Q4 should be missing');
    assert.equal(r.data.gaps.length, 2);
    assert.equal(r.data.coveragePercent, 50, '2/4 = 50%');
  });

  it('Step 5: 先頭・末尾の欠損', () => {
    const r = fillGaps({
      records: [
        // 2020 欠損
        { time: '2021', value: 101 },
        { time: '2022', value: 102 },
        // 2023 欠損
      ],
      expectedRange: { from: '2020', to: '2023' },
      frequency: 'year',
    });
    assertApiResponse(r);

    assert.ok(r.data.gaps.includes('2020'), 'First year should be missing');
    assert.ok(r.data.gaps.includes('2023'), 'Last year should be missing');
    assert.equal(r.data.gaps.length, 2);
    assert.equal(r.data.coveragePercent, 50);
  });

  it('Step 6: 全期間欠損', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
      ],
      expectedRange: { from: '2020', to: '2025' },
      frequency: 'year',
    });
    assertApiResponse(r);

    // 6期間中5件欠損
    assert.equal(r.data.gaps.length, 5);
    assert.equal(r.data.coveragePercent, 17, 'Math.round(1/6*100) = 17%');
  });

  it('Step 7: 月次データの欠損検知', () => {
    const r = fillGaps({
      records: [
        { time: '2023-01', value: 100 },
        { time: '2023-06', value: 106 },
        { time: '2023-12', value: 112 },
      ],
      expectedRange: { from: '2023', to: '2023' },
      frequency: 'month',
    });
    assertApiResponse(r);

    // 12ヶ月中3件あり、9件欠損
    assert.equal(r.data.complete.length, 12);
    assert.equal(r.data.gaps.length, 9);
    assert.equal(r.data.coveragePercent, 25, '3/12 = 25%');
  });

  it('Step 8: 空レコードはエラー', () => {
    const r = fillGaps({ records: [] });
    assert.equal(r.success, false);
    assert.ok(r.error);
  });

  it('Step 9: summary メッセージが適切', () => {
    const r = fillGaps({
      records: [
        { time: '2020', value: 100 },
        { time: '2023', value: 103 },
      ],
      expectedRange: { from: '2020', to: '2025' },
      frequency: 'year',
    });
    assertApiResponse(r);
    assert.ok(r.data.summary, 'Should have summary');
    assert.ok(r.data.summary.includes('件の欠損'), `Summary should mention 欠損: ${r.data.summary}`);
  });
});
