# ADR-005: Lazy map chunk, MapLibre worker as an asset, GPU colour ramp

## Context

MapLibre GL (~220 KB gzip) and deck.gl (~180 KB gzip) alone exceed the
250 KB initial-bundle budget. MapLibre 6 resolves its web worker relative to
its own module URL (`import.meta.url`), which does not exist after Angular's
esbuild bundling — the map silently never fires `load`.

## Decision

- `map-engine.ts` (MapLibre + deck.gl) is only reached through a dynamic
  `import()` from `MapViewComponent`, so it is a lazy chunk. Initial load is
  ~100 KB gzip (checked by `size-limit`, file list read from `index.html`).
- `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` are copied to
  `/maplibre/` as build assets; `setWorkerUrl()` points MapLibre at them.
- Aircraft are drawn by one `IconLayer` fed with binary attributes. Colour by
  altitude is a `LayerExtension` that injects a GLSL ramp generated from the
  same stops as the CPU reference (`altitude-color.ts`); a unit test evaluates
  the generated GLSL against the CPU function.
- Basemap: CARTO no-label GL styles repainted with the Nocturne palette at
  load time (free, keyless). Protomaps stays an option if CARTO limits change.

## Consequences

First paint of the map waits for the lazy chunk (~400 KB gzip, cached by the
service worker in phase 7). Upgrading MapLibre must keep the asset glob in
`angular.json` in sync with the worker file names.
