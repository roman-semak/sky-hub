#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const baseUrl = process.env['SKYTRACE_API_URL'] ?? 'http://127.0.0.1:8080';

const server = createServer(baseUrl);
// stdout carries the protocol; anything else written there breaks the client.
await server.connect(new StdioServerTransport());
process.stderr.write(`skytrace-mcp ready against ${baseUrl}\n`);
