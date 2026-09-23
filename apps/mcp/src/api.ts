import type { z } from 'zod';

/** Same shape as `globalThis.fetch`, so tests can pass a stub. */
export type Fetcher = (url: string) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin typed client over the SkyTrace REST API. Every response is validated,
 * so a changed or truncated payload surfaces as a tool error instead of
 * leaking `undefined` into the model's answer.
 */
export class SkyTraceApi {
  private readonly fetchFn: Fetcher;

  constructor(
    private readonly baseUrl: string,
    fetchFn: Fetcher = (url) => fetch(url),
  ) {
    this.fetchFn = fetchFn;
  }

  private url(path: string, query: Record<string, string | number | undefined> = {}): string {
    const u = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  async json<T>(
    path: string,
    schema: z.ZodType<T>,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const res = await this.fetchFn(this.url(path, query));
    if (!res.ok) throw new ApiError(res.status, `${path} returned ${res.status}`);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new ApiError(res.status, `unexpected response from ${path}`);
    return parsed.data;
  }

  async text(path: string, query?: Record<string, string | number | undefined>): Promise<string> {
    const res = await this.fetchFn(this.url(path, query));
    if (!res.ok) throw new ApiError(res.status, `${path} returned ${res.status}`);
    return res.text();
  }
}
