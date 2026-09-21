# Architecture

SkyTrace is two processes' worth of work in one Node server plus an Angular
client. Everything current lives in memory; history is append-only Parquet.
No Redis, no database, no paid service (SPEC § 2).

```
 community /v2 APIs ──┐        OpenSky (fallback)      NOAA AWC · Open-Meteo · adsbdb
 (adsb.fi, adsb.lol)  │              │                         │ (cached proxies)
                      ▼              ▼                         ▼
             ┌─────────────────────────────────────────────────────────────┐
             │ Fastify server (apps/server)                                │
             │                                                             │
             │  CoverageScheduler ─► ProviderPool (breaker + AIMD pacing)  │
             │        ▲ demand            │ fixes                          │
             │        │                   ▼                                │
             │   StreamHub ◄── SpatialIndex ◄── StateStore ──► History      │
             │   (WS /stream)   (flatbush, 1 s)  (Map<hex>)    writer ─► Parquet
             │        │                             │          reader ◄─┘  │
             │        │              REST /api/* ◄──┘                      │
             └────────┼─────────────────────────────────────────────────────┘
                      │ binary frames (28 B/aircraft, deltas)
                      ▼
             ┌─────────────────────────────────────────────────────────────┐
             │ Angular client (apps/web)                                   │
             │  StreamClient ─► LiveRegistry (TrackState per aircraft)     │
             │                        │ read every frame                   │
             │  rAF loop: renderPoseInto → RenderBuffer (typed arrays)     │
             │                        └─► deck.gl IconLayer (GPU colours)  │
             │  signals/UI: panel, filters, search, airport, stats, …      │
             └─────────────────────────────────────────────────────────────┘
```

## Ingest (ADR-002, ADR-003)

Free providers allow ~1 request/s in total, far less than a uniform 3-second
refresh of the world needs. The `CoverageScheduler` therefore ranks 115
circles of 250 nm by `staleness × weight`, weighting circles inside any
connected client's viewport 30×. Viewports outside community coverage get a
dynamic circle served only by OpenSky. Each provider has a circuit breaker
(3 failures → 60 s out) and AIMD pacing that backs off on 429s.

Responses are validated with Zod per aircraft (a bad entry is skipped, never
fatal), normalized, and merged into `StateStore` (newer fix wins; for
simultaneous fixes, more received messages wins). Accepted updates are encoded
into their 28-byte wire form right there, off the fan-out path.

## Stream (ADR-004)

A client sends `sub` with its bbox and zoom. Each second the hub asks every
due session for frames: records whose revision changed since last sent,
removal frames for aircraft that left, and at zoom ≤ 3 geohash-3 clusters.
Frames are assembled by copying pre-encoded bytes and patching only `age`.
Slow consumers (> 256 KB buffered) skip ticks; the next delta catches up.
`filter` narrows the stream server-side; `preview` answers "how many would
this filter show".

## Client rendering (ADR-005, ADR-009)

Aircraft state is deliberately **not** reactive: a `Map<hex, LiveAircraft>`
holds `TrackState` from `@skytrace/geo`. The animation frame projects every
aircraft with allocation-free dead reckoning (`renderPoseInto`), fills typed
arrays and hands them to deck.gl as binary attributes. Altitude colour is a
`LayerExtension` whose GLSL is generated from the same stops as the CPU
reference. Only the selected aircraft's readouts touch the DOM (4 Hz).

MapLibre and deck.gl (~1.5 MB) load as two lazy chunks after first paint.

## History (ADR-007)

Every accepted fix goes to a buffer flushed every 5 minutes into an immutable
Parquet part (zstd via `node:zlib`, rows sorted by `(icao24, ts)`). Track reads
skip row groups by min/max statistics and merge the unflushed buffer and the
30-minute in-memory track. Playback reuses the stream codec: the client
replays frames into its own registry on a virtual clock.

## Shared packages

| package       | role                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `adsb-types`  | provider schemas, normalized `Aircraft`, `FilterSpec` + `matchesFilter` (same logic on both sides)    |
| `protocol`    | binary codec, client/server message types                                                             |
| `geo`         | haversine, destination point, bbox/antimeridian, geohash, dead reckoning, RDP — pure, property-tested |
| `static-data` | CSV parser, dataset normalizers, ICAO24 → country, lookup index                                       |

## Decisions

See [docs/decisions](docs/decisions): toolchain (001), providers (002),
demand-driven polling (003), wire format (004), lazy map (005), routes and
datasets (006), history (007), weather (008), performance (009),
deployment (010).
