/**
 * Downloads and normalizes the static datasets (SPEC § 1.4) into
 * `data/static/datasets.json.zst`. Idempotent: the file is only rewritten
 * when the dataset content changes.
 *
 *   pnpm data:refresh
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import {
  normalizeAirlines,
  normalizeAirports,
  normalizeTypes,
  StaticDatasetsSchema,
  type StaticDatasets,
} from '@skytrace/static-data';

const SOURCES = {
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  airlines: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat',
  types:
    'https://raw.githubusercontent.com/Mictronics/readsb-protobuf/dev/webapp/src/db/types.json',
} as const;

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'static',
  'datasets.json.zst',
);
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function download(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'SkyTrace data refresh (non-commercial)' },
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const [airportsCsv, airlinesDat, typesJson] = await Promise.all([
  download(SOURCES.airports),
  download(SOURCES.airlines),
  download(SOURCES.types),
]);

const content = {
  airports: normalizeAirports(airportsCsv),
  airlines: normalizeAirlines(airlinesDat),
  types: normalizeTypes(JSON.parse(typesJson) as unknown),
};
out(
  `airports ${content.airports.length}, airlines ${content.airlines.length}, types ${content.types.length}`,
);

if (existsSync(OUT)) {
  const previous = StaticDatasetsSchema.parse(
    JSON.parse(zstdDecompressSync(readFileSync(OUT)).toString('utf8')),
  );
  const same =
    JSON.stringify({
      airports: previous.airports,
      airlines: previous.airlines,
      types: previous.types,
    }) === JSON.stringify(content);
  if (same) {
    out('unchanged, nothing written');
    process.exit(0);
  }
}

const dataset: StaticDatasets = StaticDatasetsSchema.parse({
  version: 1,
  generatedAt: new Date().toISOString(),
  ...content,
});
mkdirSync(dirname(OUT), { recursive: true });
const bytes = zstdCompressSync(Buffer.from(JSON.stringify(dataset)));
writeFileSync(OUT, bytes);
out(`wrote ${OUT} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
