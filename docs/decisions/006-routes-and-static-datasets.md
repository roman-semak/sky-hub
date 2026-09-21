# ADR-006: Route lookup chain and static dataset scope

## Context

- SPEC § 1.6 names adsb.lol `POST /api/0/routeset` for callsign → route.
  On 2026-09-21 it answers `201` with an empty body for every callsign.
- SPEC § 1.4 lists five datasets including the ~40 MB Mictronics
  registration database. Mictronics' own download page returns 403; the
  types and operators tables are available from its public repository.

## Decision

- Routes: provider chain `adsb.lol routeset → adsbdb.com` (free, keyless,
  callsign → origin/destination). adsb.lol stays first so it takes over again
  if it recovers. Results are cached 6 h, misses 30 min, max 20 000 entries;
  nothing is cached when every provider is unreachable. Airport names and
  coordinates are replaced by our own OurAirports table when the code matches.
- Datasets: OurAirports (public domain) → 19 k airports with 4-letter ICAO
  codes; OpenFlights airlines (ODbL); Mictronics aircraft types. They ship as
  one committed `data/static/datasets.json.zst` (~0.8 MB, Node's built-in
  zstd; engines raised to Node ≥ 22.15). `pnpm data:refresh` is idempotent.
- The registration database is skipped: adsb.lol and adsb.fi already send
  `r` (registration) and `t` (type) with every aircraft.
- ICAO24 → country: hand-maintained table of ~125 Annex 10 blocks.

## Consequences

Route data quality is that of adsbdb (crowd-sourced); the UI labels routes as
"scheduled" and shows the source. Airports without an ICAO code (many private
strips) are not searchable.
