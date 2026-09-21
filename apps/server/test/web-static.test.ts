import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serveWeb } from '../src/web-static.js';

function dist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skytrace-web-'));
  mkdirSync(join(dir, 'uk'));
  writeFileSync(join(dir, 'index.html'), '<html lang="en"></html>');
  writeFileSync(join(dir, 'uk', 'index.html'), '<html lang="uk"></html>');
  writeFileSync(join(dir, 'main-ABCDEF12.js'), 'console.log(1)');
  return dir;
}

describe('serveWeb', () => {
  it('serves files, locale fallbacks and caching headers', async () => {
    const app = Fastify();
    app.get('/api/ping', () => ({ ok: true }));
    expect(await serveWeb(app, dist())).toBe(true);
    const js = await app.inject('/main-ABCDEF12.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['cache-control']).toContain('immutable');
    expect((await app.inject('/airport/LPPT')).body).toContain('lang="en"');
    expect((await app.inject('/uk/airport/LPPT')).body).toContain('lang="uk"');
    expect((await app.inject('/uk')).body).toContain('lang="uk"');
    expect((await app.inject('/api/nope')).statusCode).toBe(404);
    expect((await app.inject('/missing.png')).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/x' })).statusCode).toBe(404);
    expect((await app.inject('/api/ping')).json()).toEqual({ ok: true });
    await app.close();
  });

  it('does nothing without a build', async () => {
    expect(await serveWeb(Fastify(), mkdtempSync(join(tmpdir(), 'empty-')))).toBe(false);
  });
});
