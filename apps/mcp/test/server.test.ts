import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { SkyTraceApi } from '../src/api.js';
import { createServer } from '../src/server.js';
import { TOOLS } from '../src/tools.js';

const BASE = 'http://api.test';

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

let reply: Reply = { status: 200, body: {} };
let reachable = true;

const api = new SkyTraceApi(BASE, async (url) => {
  if (!reachable) throw new TypeError(`fetch failed for ${url}`);
  return new Response(JSON.stringify(reply.body), { status: reply.status });
});

const connect = async (): Promise<Client> => {
  const client = new Client({ name: 'test', version: '0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer(BASE, api).connect(serverSide), client.connect(clientSide)]);
  return client;
};

/** `callTool` returns a union of result shapes; only the text matters here. */
const textOf = (result: unknown): string => {
  const { content } = result as { content?: { text?: string }[] };
  return (content ?? []).map((c) => c.text ?? '').join('\n');
};

describe('MCP server', () => {
  beforeEach(() => {
    reachable = true;
  });

  it('advertises every tool with its schema', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    const search = tools.find((t) => t.name === 'search_flights');
    expect(search?.inputSchema.properties).toHaveProperty('query');
    // Nothing here writes; clients may rely on that hint.
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('runs a tool end to end', async () => {
    reply = {
      status: 200,
      body: {
        generatedAt: Date.UTC(2026, 8, 23, 10, 0, 0),
        total: 10,
        airborne: 9,
        onGround: 1,
        military: 0,
        emergencies: [],
        altitudeBands: [],
        topOperators: [],
        topTypes: [],
      },
    };
    const client = await connect();
    const result = await client.callTool({ name: 'traffic_stats', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('10 tracked, 9 airborne');
  });

  it('turns a 404 into a readable tool error', async () => {
    reply = { status: 404, body: { error: 'not found' } };
    const client = await connect();
    const result = await client.callTool({ name: 'get_flight', arguments: { hex: '4951ab' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('may have left coverage');
  });

  it('reports an unreachable API instead of crashing', async () => {
    reachable = false;
    const client = await connect();
    const result = await client.callTool({ name: 'traffic_stats', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(BASE);
  });

  it('rejects arguments that fail the tool schema', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'get_flight', arguments: { hex: 'not-a-hex' } });
    expect(result.isError).toBe(true);
  });
});
