/**
 * MCP Server Smoke Test
 * サーバー起動 → tools/list で全59ツール登録を検証
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, '..', 'build', 'index.js');

/** 改行区切りJSON-RPCメッセージ */
function rpcMessage(method: string, params: Record<string, unknown> = {}, id?: number): string {
  return JSON.stringify({ jsonrpc: '2.0', method, params, ...(id !== undefined ? { id } : {}) }) + '\n';
}

/** MCPサーバーを起動してtools/listを取得 */
async function getToolList(): Promise<{ name: string; description: string }[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let buffer = '';
    let phase = 0; // 0: waiting for init response, 1: waiting for tools/list response

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Parse newline-delimited JSON messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          if (phase === 0 && msg.id === 1) {
            // Initialize response → send initialized notification + tools/list
            phase = 1;
            child.stdin.write(rpcMessage('notifications/initialized'));
            child.stdin.write(rpcMessage('tools/list', {}, 2));
          } else if (phase === 1 && msg.id === 2) {
            // tools/list response
            child.kill();
            const tools = (msg.result?.tools || []).map((t: any) => ({
              name: t.name,
              description: t.description,
            }));
            resolve(tools);
            return;
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (phase < 1) reject(new Error(`Server exited early with code ${code}`));
    });

    // Send initialize request
    child.stdin.write(rpcMessage('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    }, 1));

    // Timeout
    setTimeout(() => {
      child.kill();
      reject(new Error('Timeout waiting for MCP server response'));
    }, 10000);
  });
}

// v3.1: 12 tools (9 original + 3 new: resolve, navigate, join)
const EXPECTED_TOOLS = [
  'academic',
  'corporate',
  'estat',
  'geo',
  'join',
  'law',
  'misc',
  'navigate',
  'opendata',
  'resolve',
  'stats',
  'weather',
];

describe('MCP Server Smoke Test', () => {
  it('should start and register all 12 tools', async () => {
    const tools = await getToolList();
    const toolNames = tools.map(t => t.name).sort();

    assert.equal(tools.length, EXPECTED_TOOLS.length,
      `Expected ${EXPECTED_TOOLS.length} tools, got ${tools.length}. Tools: ${toolNames.join(', ')}`);

    for (const expected of EXPECTED_TOOLS) {
      assert.ok(toolNames.includes(expected), `Missing tool: ${expected}`);
    }
  });

  it('each tool should have a description', async () => {
    const tools = await getToolList();

    for (const tool of tools) {
      assert.ok(tool.description, `Tool ${tool.name} has no description`);
      assert.ok(tool.description.length > 5, `Tool ${tool.name} description too short: "${tool.description}"`);
    }
  });
});
