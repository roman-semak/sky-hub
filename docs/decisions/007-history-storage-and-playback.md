# ADR-007: History storage layout and playback payload

## Context

SPEC § 6 wants append-only history flushed every 5 minutes into
`data/history/YYYY-MM-DD/HH.parquet` with zstd, 72 h retention, and a
playback screen. Parquet files cannot be appended to, and the only pure-JS
writer (`hyparquet-writer`) ships Snappy but accepts custom compressors.

## Decision

- One immutable part file per flush: `YYYY-MM-DD/HH-mmss.parquet` (UTC).
  An hour is up to twelve parts. Files are written to `*.tmp` and renamed.
- zstd through Node's built-in `node:zlib` (`zstdCompressSync`) plugged into
  hyparquet-writer/hyparquet as a custom codec — no native or paid deps.
- Rows are sorted by `(icao24, ts)` before writing, 20 k rows per row group.
  Row-group min/max statistics let a single-aircraft read skip almost every
  group. Non-ICAO addresses are stored as `icao | 0x1000000` in the same
  INT32 column.
- `/api/track/:hex` merges Parquet, the writer's unflushed buffer and the
  30-minute in-memory track; RDP ε = 0.0005°, cached 60 s (SPEC § 6.2).
- Playback: `/api/history?bbox&from&to&spacing` returns
  `[u32 length][delta frame]…` using the stream codec, thinned server-side to
  one fix per aircraft per 20 s. The client replays it into its own
  `LiveRegistry` on a virtual clock, so dead reckoning and blending work
  unchanged at ×1/×10/×60. Windows are capped at 2 h.
- Retention: a purge every 10 minutes deletes part files whose hour ended
  before `now − HISTORY_RETENTION_HOURS` and removes empty day folders.

## Consequences

Real-data size is ~5–10 bytes/row after zstd. At the free-API ingest rate
(~200 fixes/s average) that is ≈ 0.2–0.3 GB/day, under 1 GB for 72 h. Playback of a
wide viewport reads every row in the window (bbox is not the sort key); the
2 h cap and the 60 s cache bound the cost.
