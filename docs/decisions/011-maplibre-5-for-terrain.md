# ADR-011: MapLibre GL 5 instead of 6 for deck.gl terrain support

## Context

SPEC § 3 lists "MapLibre GL JS" without a major version, and the project was
built on MapLibre 6. Phase 8 adds a 3D mode: terrain from free DEM tiles plus
aircraft drawn at their real altitude on top of it.

With MapLibre 6, enabling terrain threw on every animation frame:

```
TypeError: Cannot read properties of undefined (reading 'elevation')
  at centerCameraOnTerrain (@deck.gl/mapbox)
```

`@deck.gl/mapbox` synchronises its own camera with the basemap through
`map.transform` and `map.getFreeCameraOptions()`. MapLibre 6 removed both from
its public surface, so deck.gl 9 reads `undefined` as soon as terrain is on.
deck.gl 9 supports MapLibre up to 5.x; there is no released deck.gl that
speaks MapLibre 6's camera API.

Options considered:

1. Keep MapLibre 6 and drop 3D mode — loses a SPEC phase 8 feature.
2. Keep MapLibre 6 and reimplement the camera sync against internals —
   unsupported private API, breaks on any patch release.
3. Pin `maplibre-gl` to `^5.24.0`.

## Decision

Option 3: `maplibre-gl` is pinned to `^5.24.0` until deck.gl ships MapLibre 6
support. Everything the app uses (style spec, `addSource`, `setTerrain`,
hillshade, raster sources, events) is identical in both majors, so no
application code changed apart from the worker handling below.

MapLibre 5 bundles its worker inline, so the `setWorkerUrl()` call and the
`/maplibre/**` asset copy from ADR-005 were removed, along with the matching
service-worker cache entry.

## Consequences

- 3D terrain works: DEM tiles load, the camera tilts, deck.gl keeps its
  viewport in sync, no per-frame errors.
- One fewer moving part in the build — no worker asset glob to keep in sync
  with MapLibre file names (the fragile part of ADR-005).
- Security updates now come from the MapLibre 5 line. Revisit when deck.gl
  announces MapLibre 6 support; the upgrade is a version bump plus restoring
  the worker asset.
- SPEC § 3 is unchanged: MapLibre GL is still the basemap engine.
