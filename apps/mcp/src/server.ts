import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, SkyTraceApi } from './api.js';
import { TOOLS } from './tools.js';

const asText = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });

const asError = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

/**
 * Model Context Protocol server over the public SkyTrace API (SPEC phase 8).
 * Read-only by construction: every tool is a GET against the same endpoints
 * the web client uses, so nothing here can change server state.
 */
export function createServer(baseUrl: string, api = new SkyTraceApi(baseUrl)): McpServer {
  const server = new McpServer(
    { name: 'skytrace', version: '0.0.0' },
    {
      instructions:
        'Live flight tracking over community ADS-B data. Positions are what receivers heard in the last seconds — not a navigation source, and coverage is thin over oceans and where volunteers have no receivers.',
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          return asText(await tool.run(api, args as never));
        } catch (err) {
          if (err instanceof ApiError) {
            return asError(
              err.status === 404
                ? `Not found: ${err.message}. The aircraft may have left coverage, or the code may not exist.`
                : `SkyTrace API error: ${err.message}`,
            );
          }
          return asError(`Could not reach the SkyTrace API at ${baseUrl}.`);
        }
      },
    );
  }

  return server;
}
