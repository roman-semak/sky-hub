/** Server → client control messages, JSON text frames. Aircraft data is binary. */
export type ServerMessage =
  | { readonly t: 'hello'; readonly version: 1; readonly serverTime: number }
  /** Latency probe; the client echoes `ts` back in a `pong`. */
  | { readonly t: 'ping'; readonly ts: number }
  /** Round-trip latency the server measured for this client, ms. */
  | { readonly t: 'stats'; readonly rttMs: number | null; readonly inView: number }
  /** Answer to a client `preview`; `id` echoes the request. */
  | { readonly t: 'preview'; readonly id: number; readonly count: number }
  | { readonly t: 'error'; readonly message: string };
