# ADR-002: Provider availability and pacing

## Context

SPEC § 1.2 lists four interchangeable `/v2` mirrors. Probing them on 2026-09-18:

| provider       | result                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| adsb.lol       | works; ~1 request / 6 s sustained, bursts → 429/420                      |
| adsb.fi        | works; ~1 request / s; different envelope (`aircraft`, `now` in seconds) |
| airplanes.live | 403 — "contact us by email" for any anonymous client                     |
| adsb.one       | 403 — Cloudflare challenge page                                          |
| OpenSky        | works anonymously, credit-limited                                        |

## Decision

- Default `PROVIDERS=adsb.fi,adsb.lol`. airplanes.live and adsb.one stay
  implemented and can be enabled via env once access is granted.
- The response parser accepts both envelopes (`ac`/`aircraft`, ms/s `now`).
- Per-provider AIMD pacing: 429 doubles the interval, success shrinks it by
  5 % towards the measured minimum (adsb.fi 1.1 s, adsb.lol 6 s). The SPEC
  circuit breaker (3 × 429/5xx → 60 s out) sits on top.
- Requests carry an honest `User-Agent` identifying the project.

## Consequences

Total budget is ~1.1 requests/s. Two working providers remain, so the
"all fallbacks dead" stop condition from CLAUDE.md does not apply.
