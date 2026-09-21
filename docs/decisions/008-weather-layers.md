# ADR-008: Weather sources and how each layer is delivered

## Context

SPEC § 1.5 / phase 6 name Open-Meteo (wind aloft), RainViewer (radar tiles)
and NOAA AWC (METAR/TAF). They differ in CORS support and rate expectations.

## Decision

- **METAR/TAF** go through the server (`/api/airport/:code`) with a 5 min /
  30 min cache: AWC asks for modest request rates and one cached upstream
  call serves every visitor. The same response carries 24 h of METAR winds
  for the wind rose and the live 50 nm traffic list.
- **Radar** is fetched by the browser directly: RainViewer sends
  `access-control-allow-origin: *`, and proxying map tiles would cost our
  free-tier bandwidth for nothing. Tiles are capped at zoom 7 (RainViewer's
  limit) and overzoomed by MapLibre.
- **Wind aloft** is proxied (`/api/wind`) because the client needs one
  compact grid, not 64 forecast series: the server samples an 8 × 8 grid over
  the viewport in a single multi-location Open-Meteo request, converts to
  u/v in m/s, snaps the bbox to 0.5° and caches 30 min. The client renders
  1 500 particles advected by bilinear interpolation as a deck.gl LineLayer
  on binary attributes.
- Traffic classification uses vertical rate plus heading relative to the
  field, so descending traffic heading away (another airport's arrival) is an
  overflight, not an arrival.

## Consequences

Wind resolution is coarse (8 × 8 per view), which is enough for a visual
layer, not for flight planning — consistent with the "not a navigation
source" disclaimer.
