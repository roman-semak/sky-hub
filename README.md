# SkyTrace

Open-source live flight tracker in the spirit of Flightradar24, built entirely on
**free, public community ADS-B data** (adsb.lol and compatible mirrors).

> **Non-commercial project.** SkyTrace is not for commercial use and is **not a
> source of navigational information**. Data is provided by community networks
> under the ODbL — see [ATTRIBUTION.md](ATTRIBUTION.md).

## Quick start

Requirements: Node ≥ 22.15 (built-in zstd), pnpm 10.

```bash
pnpm install
pnpm dev          # server on :8080, web on :4200
```

| command             | what it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`          | runs the ingest server and the Angular app in watch mode  |
| `pnpm check`        | lint + typecheck + test + build for every workspace       |
| `pnpm data:refresh` | downloads and normalizes the static datasets into `data/` |

## Repository layout

```
apps/
  web/            Angular client (MapLibre GL + deck.gl)
  server/         Fastify API + WebSocket + ingest worker
packages/
  adsb-types/     Zod schemas and the normalized Aircraft type
  protocol/       binary codec shared by web and server
  geo/            great-circle math, bbox, geohash, dead reckoning
  static-data/    airports, airlines, aircraft types
scripts/          data refresh, load and soak tests
docs/decisions/   architecture decision records
```

## What SkyTrace deliberately does not have

- **Oceanic coverage** — requires satellite ADS-B, which is a paid feed.
- **MLAT for aircraft without ADS-B** — requires our own receiver network.
- **Airline schedules, real gates and delays** — paid feeds. Routes are
  inferred from the free adsb.lol `routeset` lookup instead.
- **Aircraft photos** — licensed; we link to planespotters.net by registration
  and never host images.

## License

Code: MIT. Data: ODbL (see [ATTRIBUTION.md](ATTRIBUTION.md)).
