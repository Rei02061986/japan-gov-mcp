/**
 * E2E テスト共通ユーティリティ
 *
 * 実API呼び出しを伴うE2Eテスト用のヘルパー関数群。
 * レート制限対応、構造検証、スキップ判定などを提供する。
 */
import assert from 'node:assert/strict';

/** APIコール間のレート制限対応 wait */
export function wait(ms: number = 1500): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** オブジェクトに指定フィールドが存在し、nullでないことを検証 */
export function assertHasFields(obj: unknown, fields: string[], label = 'object'): void {
  assert.ok(obj && typeof obj === 'object', `${label} should be an object`);
  for (const f of fields) {
    const val = (obj as Record<string, unknown>)[f];
    assert.ok(val !== undefined && val !== null, `${label} missing field: ${f}`);
  }
}

/** 配列が空でないことの検証 */
export function assertNonEmpty(arr: unknown[], label: string): void {
  assert.ok(Array.isArray(arr), `${label} should be an array`);
  assert.ok(arr.length > 0, `${label} should not be empty (got ${arr.length})`);
}

/** APIキーが設定されているかチェック */
export function hasApiKey(envVar: string): boolean {
  return !!process.env[envVar]?.trim();
}

/** APIキー未設定時にスキップするためのガード */
export function skipUnless(condition: boolean, reason: string): void {
  if (!condition) {
    // node:test の skip は describe/it の { skip } オプションで制御するが、
    // 動的スキップは assert 前に条件チェックで代替
    console.error(`  ⏭ SKIP: ${reason}`);
    assert.ok(true, `SKIPPED: ${reason}`);
  }
}

/** ApiResponse の基本構造を検証 */
export function assertApiResponse(r: any, expectSuccess = true): void {
  assert.ok(r, 'Response should not be null/undefined');
  assert.equal(typeof r.success, 'boolean', 'Response should have boolean success');
  assert.ok(r.source, 'Response should have source');
  assert.ok(r.timestamp, 'Response should have timestamp');
  if (expectSuccess) {
    assert.equal(r.success, true, `Expected success but got error: ${r.error}`);
    assert.ok(r.data, 'Successful response should have data');
  }
}

/** 5xxエラー（サーバー側問題）かどうかを判定 */
export function isServerError(r: any): boolean {
  if (!r) return false;
  const errMsg = r.error || '';
  return /5\d{2}|server error|internal error|service unavailable/i.test(errMsg);
}
