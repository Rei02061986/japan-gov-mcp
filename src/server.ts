/**
 * japan-gov-mcp v3.3 — HTTP entry point (Streamable HTTP transport)
 *
 * Usage:
 *   PORT=8007 node build/server.js
 *
 * Endpoints:
 *   GET  /health  — liveness probe
 *   POST /mcp     — MCP Streamable HTTP
 *   GET  /mcp     — MCP SSE stream
 *   DELETE /mcp   — close session
 */
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './mcp-server.js';

const PORT = Number(process.env.PORT) || 8007;
const HOST = process.env.HOST || '0.0.0.0';

/** Per-request stateless transport: each request creates a fresh server + transport pair */
const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '3.3.0', tools: 13 }));
    return;
  }

  // MCP endpoint
  if (req.url === '/mcp') {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      // wire server to transport
      await server.connect(transport);
      // delegate request
      await transport.handleRequest(req, res);
      // close after request completes
      await transport.close();
      await server.close();
    } catch (e: any) {
      console.error('MCP error:', e.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error', message: e.message }));
      }
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', endpoints: ['/health', '/mcp'] }));
});

httpServer.listen(PORT, HOST, () => {
  console.error(`japan-gov-mcp v3.3 (13 tools) [http] listening on ${HOST}:${PORT}`);
  console.error(`  Health: http://${HOST}:${PORT}/health`);
  console.error(`  MCP:    http://${HOST}:${PORT}/mcp`);
});
