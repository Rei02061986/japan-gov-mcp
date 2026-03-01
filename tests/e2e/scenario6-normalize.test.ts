/**
 * E2E Scenario 6: join.normalize 単位変換
 *
 * 統計データでよく使われる単位変換が正しく機能するか検証。
 * 純粋関数のためAPIキー不要。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../../build/providers/join.js';
import { assertApiResponse } from './helpers/e2e-utils.ts';

describe('E2E Scenario 6: join.normalize 単位変換', () => {

  it('Step 1: 千人 → 人 の変換', () => {
    const r = normalize({
      data: [
        { time: '2020', value: 126.5, unit: '千人' },
        { time: '2021', value: 125.5, unit: '千人' },
        { time: '2022', value: 124.9, unit: '千人' },
      ],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assertApiResponse(r);

    assert.equal(r.data.records[0].value, 126500, '126.5千人 = 126500人');
    assert.equal(r.data.records[0].unit, '人');
    assert.equal(r.data.records[0].converted, true);
    assert.equal(r.data.records[1].value, 125500);
    assert.equal(r.data.records[2].value, 124900);
  });

  it('Step 2: 百万円 → 億円 の変換', () => {
    const r = normalize({
      data: [{ time: '2023', value: 5400, unit: '百万円' }],
      rules: [{ fromUnit: '百万円', toUnit: '億円' }],
    });
    assertApiResponse(r);
    assert.equal(r.data.records[0].value, 54, '5400百万円 = 54億円');
    assert.equal(r.data.records[0].unit, '億円');
    assert.equal(r.data.records[0].converted, true);
  });

  it('Step 3: 万人 → 人 の変換', () => {
    const r = normalize({
      data: [{ time: '2023', value: 1.26, unit: '万人' }],
      rules: [{ fromUnit: '万人', toUnit: '人' }],
    });
    assertApiResponse(r);
    assert.equal(r.data.records[0].value, 12600, '1.26万人 = 12600人');
  });

  it('Step 4: 百万円 → 兆円 の変換', () => {
    const r = normalize({
      data: [{ time: '2023', value: 6000000, unit: '百万円' }],
      rules: [{ fromUnit: '百万円', toUnit: '兆円' }],
    });
    assertApiResponse(r);
    assert.equal(r.data.records[0].value, 6, '6000000百万円 = 6兆円');
  });

  it('Step 5: 不明単位の処理（変換ルール未定義）', () => {
    const r = normalize({
      data: [{ time: '2023', value: 100, unit: 'unknown_unit' }],
      rules: [{ fromUnit: 'unknown_unit', toUnit: '人' }],
    });
    assertApiResponse(r);

    // 変換ルールが見つからないため原値が保持される
    assert.equal(r.data.records[0].value, 100, 'Value should be unchanged');
    assert.equal(r.data.records[0].converted, false, 'Should not be marked as converted');

    // ログに警告が出る
    assert.ok(r.data.log.length > 0, 'Should have log entry about undefined rule');
    assert.ok(
      r.data.log[0].includes('変換ルール未定義'),
      `Log should mention undefined rule, got: ${r.data.log[0]}`,
    );
  });

  it('Step 6: 単位が一致しないレコードはスキップ', () => {
    const r = normalize({
      data: [
        { time: '2020', value: 100, unit: '千人' },
        { time: '2021', value: 3.5, unit: '%' },  // ルールに一致しない
        { time: '2022', value: 200, unit: '千人' },
      ],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assertApiResponse(r);

    assert.equal(r.data.records[0].value, 100000, '千人→人 変換される');
    assert.equal(r.data.records[0].converted, true);
    assert.equal(r.data.records[1].value, 3.5, '% は変換されない');
    assert.equal(r.data.records[1].converted, false);
    assert.equal(r.data.records[2].value, 200000, '千人→人 変換される');
  });

  it('Step 7: 文字列値も正しくパースされる', () => {
    const r = normalize({
      data: [
        { time: '2023', value: '1234.5', unit: '千人' },
        { time: '2024', value: '999', unit: '千人' },
      ],
      rules: [{ fromUnit: '千人', toUnit: '人' }],
    });
    assertApiResponse(r);
    assert.equal(r.data.records[0].value, 1234500);
    assert.equal(r.data.records[1].value, 999000);
  });

  it('Step 8: 複数ルールの逐次適用', () => {
    const r = normalize({
      data: [
        { time: '2023', value: 500, unit: '千人' },
        { time: '2023', value: 3000, unit: '百万円' },
      ],
      rules: [
        { fromUnit: '千人', toUnit: '人' },
        { fromUnit: '百万円', toUnit: '億円' },
      ],
    });
    assertApiResponse(r);
    assert.equal(r.data.records[0].value, 500000);
    assert.equal(r.data.records[0].unit, '人');
    assert.equal(r.data.records[1].value, 30);
    assert.equal(r.data.records[1].unit, '億円');
  });

  it('Step 9: 空データはエラーを返す', () => {
    const r = normalize({ data: [], rules: [{ fromUnit: '千人', toUnit: '人' }] });
    assert.equal(r.success, false);
  });

  it('Step 10: 空ルールはエラーを返す', () => {
    const r = normalize({ data: [{ time: '2023', value: 100 }], rules: [] });
    assert.equal(r.success, false);
  });
});
