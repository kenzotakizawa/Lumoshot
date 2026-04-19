#!/usr/bin/env node
import { startMcpServer } from './mcp/server.js';

startMcpServer().catch((err) => {
  process.stderr.write(`[lumoshot-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
