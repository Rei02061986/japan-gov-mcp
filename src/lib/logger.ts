/**
 * logger — リクエストログ (JSONL)
 *
 * 全 tool call のリクエスト・レスポンス・エラーを日付別 JSONL に記録。
 * - 同期書き込み (appendFileSync): プロセス終了時のログ損失を防止
 * - try-catch 完全包囲: ログ失敗で本体を巻き込まない
 * - APIキー自動除去 (REDACT)
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Config ──

const LOG_ENABLED = process.env.JAPAN_GOV_MCP_LOG !== 'false';

const LOG_DIR = process.env.JAPAN_GOV_MCP_LOG_DIR
  || join(process.env.HOME || '/tmp', '.japan-gov-mcp', 'logs');

const REDACT_KEYS = new Set([
  'apikey', 'appid', 'token', 'key', 'password', 'secret',
]);

// ── Helpers ──

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `${date}.jsonl`);
}

function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      cleaned[k] = '[REDACTED]';
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

// ── Public API ──

export interface LogEntry {
  tool: string;
  action: string;
  params: Record<string, unknown>;
  status: 'ok' | 'error' | 'timeout';
  duration_ms: number;
  response_size: number;
  error?: string | null;
}

/**
 * リクエストログを1行 JSONL として追記する。
 * 失敗しても例外を投げない。
 */
export function logRequest(entry: LogEntry): void {
  if (!LOG_ENABLED) return;
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    const record = {
      ts: new Date().toISOString(),
      tool: entry.tool,
      action: entry.action,
      params: redactParams(entry.params),
      status: entry.status,
      duration_ms: entry.duration_ms,
      response_size: entry.response_size,
      error: entry.error || null,
    };
    appendFileSync(getLogPath(), JSON.stringify(record) + '\n');
  } catch {
    // ログ書き込み失敗は無視
  }
}

/** テスト用: 現在のログディレクトリパスを返す */
export function getLogDir(): string {
  return LOG_DIR;
}
