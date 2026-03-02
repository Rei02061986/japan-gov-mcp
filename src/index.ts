#!/usr/bin/env node
/**
 * japan-gov-mcp v3.3 — stdio entry point
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp-server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('japan-gov-mcp v3.3 (13 tools) [stdio]');
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
