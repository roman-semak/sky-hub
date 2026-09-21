import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import compress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Locales built by `ng build --localize`; the source locale sits at the root. */
const LOCALE_PREFIXES = ['uk'] as const;

/**
 * Serves the Angular production build from the API process (single-container
 * deploys, local prod previews). Unknown paths fall back to the right
 * locale's `index.html` so client-side routes survive a reload.
 */
export async function serveWeb(app: FastifyInstance, dist: string): Promise<boolean> {
  const root = resolve(dist);
  if (!existsSync(join(root, 'index.html'))) return false;
  await app.register(compress, { encodings: ['br', 'gzip'], threshold: 1024 });
  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    // Hashed bundles are immutable; index.html and the service worker are not.
    setHeaders: (res, path) => {
      const immutable = /-[A-Z0-9]{8}\.(js|css)$/.test(path);
      res.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0] ?? '/';
    if (
      req.method !== 'GET' ||
      url.startsWith('/api/') ||
      url === '/stream' ||
      url === '/healthz'
    ) {
      return reply.code(404).send({ error: 'not found' });
    }
    const locale = LOCALE_PREFIXES.find((l) => url === `/${l}` || url.startsWith(`/${l}/`));
    const rel = locale === undefined ? 'index.html' : join(locale, 'index.html');
    // A path that looks like a file (has an extension) is a real 404.
    if (/\.[a-z0-9]+$/i.test(url)) return reply.code(404).send({ error: 'not found' });
    return reply.type('text/html').header('cache-control', 'no-cache').sendFile(rel);
  });
  return true;
}
