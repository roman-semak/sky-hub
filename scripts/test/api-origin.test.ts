import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setApiOrigin } from '../lib/api-origin.js';

/** A dist tree with the root locale and `uk/`, as the Angular build emits it. */
function dist(rootHtml: string, ukHtml = rootHtml): string {
  const dir = mkdtempSync(join(tmpdir(), 'skytrace-origin-'));
  mkdirSync(join(dir, 'uk'));
  writeFileSync(join(dir, 'index.html'), rootHtml);
  writeFileSync(join(dir, 'uk', 'index.html'), ukHtml);
  return dir;
}

const meta = (html: string): string | undefined =>
  /<meta name="skytrace-api" content="([^"]*)"/.exec(html)?.[1];

describe('setApiOrigin', () => {
  it('patches the minified bare content attribute the build emits', () => {
    const dir = dist('<head><meta name="skytrace-api" content></head>');
    const written = setApiOrigin(dir, 'https://api.skytrace.dev');

    expect(written).toHaveLength(2);
    expect(meta(readFileSync(join(dir, 'index.html'), 'utf8'))).toBe('https://api.skytrace.dev');
    expect(meta(readFileSync(join(dir, 'uk', 'index.html'), 'utf8'))).toBe(
      'https://api.skytrace.dev',
    );
  });

  it('patches a quoted empty attribute and a self-closing tag', () => {
    const dir = dist('<meta name="skytrace-api" content="" />', '<meta name="skytrace-api"/>');
    setApiOrigin(dir, 'https://api.skytrace.dev');

    for (const file of ['index.html', join('uk', 'index.html')]) {
      expect(meta(readFileSync(join(dir, file), 'utf8'))).toBe('https://api.skytrace.dev');
    }
  });

  it('replaces an origin left over from an earlier deploy and drops trailing slashes', () => {
    const dir = dist('<meta name="skytrace-api" content="https://old.example">');
    setApiOrigin(dir, '  https://api.skytrace.dev//  ');

    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(meta(html)).toBe('https://api.skytrace.dev');
    expect(html).not.toContain('old.example');
  });

  it('leaves the bundle on same origin when no origin is given', () => {
    const html = '<meta name="skytrace-api" content>';
    const dir = dist(html);

    expect(setApiOrigin(dir, '   ')).toEqual([]);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toBe(html);
  });

  it.each(['http://api.skytrace.dev', 'ws://api.skytrace.dev', 'api.skytrace.dev', 'https://a b'])(
    'refuses %s',
    (origin) => {
      const dir = dist('<meta name="skytrace-api" content>');
      expect(() => setApiOrigin(dir, origin)).toThrow(/non-https API origin/);
    },
  );

  it('fails loudly when the bundle has no meta tag to patch', () => {
    const dir = dist('<head><title>SkyTrace</title></head>');
    expect(() => setApiOrigin(dir, 'https://api.skytrace.dev')).toThrow(/no <meta/);
  });

  it('fails when the directory holds no index.html', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skytrace-empty-'));
    expect(() => setApiOrigin(dir, 'https://api.skytrace.dev')).toThrow(/no index.html/);
  });
});

describe('set-api-origin CLI', () => {
  const cli = fileURLToPath(new URL('../set-api-origin.ts', import.meta.url));

  it('reads the origin from SKYTRACE_API_ORIGIN, as the Vercel build does', () => {
    const dir = dist('<meta name="skytrace-api" content>');
    const run = spawnSync('node', ['--import', 'tsx', cli, dir], {
      env: { ...process.env, SKYTRACE_API_ORIGIN: 'https://api.skytrace.dev' },
      encoding: 'utf8',
    });

    expect(run.status).toBe(0);
    expect(meta(readFileSync(join(dir, 'index.html'), 'utf8'))).toBe('https://api.skytrace.dev');
  });

  it('exits non-zero when the bundle cannot be patched, so a bad deploy fails', () => {
    const dir = dist('<head><title>SkyTrace</title></head>');
    const run = spawnSync('node', ['--import', 'tsx', cli, dir, 'https://api.skytrace.dev'], {
      encoding: 'utf8',
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/no <meta/);
  });
});
