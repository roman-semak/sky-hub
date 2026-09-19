# ADR-003: Demand-driven polling instead of uniform 3 s world refresh

## Context

SPEC Phase 1 asks for ~60 circles of 250 nm refreshed so every point updates
within 3 s — ~20 requests/s. Free providers give ~1.1 requests/s (ADR-002).
Covering the regions where community receivers exist takes 115 circles.

## Decision

- `CoverageScheduler` ranks circles by `staleness × weight`; circles that
  intersect any connected client's viewport weigh 30× more. With one or two
  viewports the watched circles refresh every 1–3 s, the rest of the world
  cycles in the background (~2 min).
- Viewports outside the static grid get a dynamic circle served only by the
  OpenSky fallback (SPEC § 1.3: "only for regions with poor coverage").
- Server eviction is `EVICT_AFTER_SEC` (default 180 s) rather than 60 s, so
  background circles do not blink out between refreshes. Clients still fade
  icons after 30 s and hide them after 120 s based on position age.

## Consequences

The "≤ 3 s everywhere" target is met only where someone is looking — which is
the only place it is visible. `/healthz` exposes `maxDemandedAgeMs` to verify it.
