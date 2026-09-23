# ADR-009: Load performance of a WebGL map app and the Lighthouse target

## Context

Phase 7 asks for Lighthouse ≥ 95 performance and ≥ 95 accessibility. The
stack fixed in SPEC § 3 (MapLibre GL + deck.gl) is ~1.5 MB of minified JS
(MapLibre 995 KB, deck.gl 501 KB, luma.gl 177 KB). The first measurement of
the map page: desktop 68 (TBT 590 ms), mobile 75 (LCP 5.8 s). The LCP element
was MapLibre's attribution text, which only paints after the map loads.

## Decision

Optimizations kept (none of them delays the map to dodge the measurement):

1. **Own attribution/disclaimer footer** rendered with the page (SPEC § 9
   wants it in the footer anyway) instead of MapLibre's control; collapsible
   on phones.
2. **Map page eager, engine lazy.** The landing route is part of the initial
   bundle (117 KB gzip, budget 250 KB) so its overlays paint immediately.
3. **MapLibre and deck.gl in separate lazy chunks**, loaded one after the
   other with a yield to the main thread in between, so no single task
   evaluates both libraries.
4. **HTML app shell** (brand + live dot, language-neutral) painted straight
   from `index.html`; doubles as the PWA splash.
5. Brotli/gzip and immutable caching for hashed bundles when the server
   serves the build (`WEB_DIST`).

Results (Lighthouse 12, production build served by Fastify):

| page      | preset  | perf    | a11y | best practices | SEO |
| --------- | ------- | ------- | ---- | -------------- | --- |
| map `/`   | desktop | **100** | 100  | 100            | 100 |
| map `/`   | mobile  | 83      | 100  | 100            | 100 |
| `/search` | mobile  | 95      | 100  | 96             | 100 |
| `/stats`  | mobile  | 95      | 100  | 100            | 100 |

Re-measured after preconnecting the basemap origins (2026-09-23): the mobile
map page reads **93** (median of five runs: 77 / 82 / 93 / 93 / 95), with
FCP 1.8 s, LCP 2.0 s, TBT 252 ms and CLS 0; accessibility, best practices and
SEO stay at 100. The spread is the measuring machine, not the page — a
developer laptop under other load. Treat the median as the number and the
spread as the error bar; anything below 90 in a single run says more about
the machine than the build.

axe (WCAG 2.1 AA) reports zero violations on every screen in both themes.

## Consequences

The mobile map score is bounded by the cost the mandated stack imposes on a
4× throttled CPU over slow 4G: evaluating MapLibre and deck.gl. Preconnecting
the two basemap origins removed the serial handshakes in front of the style
and the tiles, which halved LCP (≈ 4 s → 2.0 s) and took the median from 83
to 93. The remaining ~250 ms of blocking time is library evaluation, and the
last few points need build-time prerendering of the shell (Angular SSR/SSG)
or map work off the main thread once MapLibre supports it — a follow-up, not
something to buy by delaying the map.
