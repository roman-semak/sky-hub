# ADR-012: MCP server as a separate package over the public REST API

## Context

SPEC phase 8 asks for "an MCP server over our own API". Two questions were
open: where it lives, and how it reaches the data.

## Decision

- A separate workspace package, `apps/mcp`, with `@modelcontextprotocol/sdk`
  and the stdio transport. It is not part of the API process: MCP clients
  spawn it themselves, and a crash in a tool cannot take the stream down.
- Tools call the **public REST endpoints** (`/api/search`, `/api/ac/:hex`,
  `/api/overhead`, `/api/airport/:code`, `/api/track/:hex`, `/api/heatmap`,
  `/api/route/:callsign`, `/api/stats`) over HTTP, not the in-process state.
  The API is already the contract the web client uses, so the MCP server has
  no privileged access and no second copy of the domain logic.
- Every tool is read-only (`readOnlyHint`), and the package has no write path.
- Tools are declared as plain objects — name, title, description, a Zod
  argument shape, and a handler returning text — and registered with the SDK
  in one loop. Tests call the handlers directly with a stubbed `fetch`, plus
  one end-to-end test over the SDK's in-memory transport.
- Responses are validated with Zod. An endpoint that changes shape produces a
  tool error, never a confidently wrong answer built from `undefined`.
- Output is formatted text rather than raw JSON: units spelled out, unknown
  values named ("alt unknown"), long tracks thinned, and the route caveat
  from ADR-006 repeated where it matters.

## Consequences

- The MCP server needs a running SkyTrace API (`SKYTRACE_API_URL`, default
  `http://127.0.0.1:8080`). Offline, every tool returns a "could not reach"
  error instead of hanging.
- New endpoints do not appear as tools automatically; each one is a small,
  deliberate addition — which is the point, since tool descriptions are part
  of the model's prompt budget.
- `apps/mcp` has no `dev` script on purpose: `pnpm dev` runs `turbo run dev
--parallel`, and a stdio server has nothing to do there.
