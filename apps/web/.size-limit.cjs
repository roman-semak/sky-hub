// Initial-load budget (CLAUDE.md: 250 KB gzip). Angular splits the initial
// code into several chunks, so the list is read from the built index.html:
// every <script src>, <link rel="modulepreload"> and stylesheet it loads.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const dir = join(__dirname, 'dist/web/browser');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => join(dir, m[1]));

module.exports = [{ name: 'initial JS + CSS (gzip)', path: files, limit: '250 kB', gzip: true }];
