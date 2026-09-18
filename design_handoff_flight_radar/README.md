# Handoff: Live Flight Radar — mobile-first web app

## Overview
Mobile-first UI for a live flight-tracking web app: a real-time map of aircraft fed by a WebSocket stream, with flight detail, search/filters and a followed-flights list. Turn 1 covers the four mobile screens (390×844); Turn 2 covers the desktop layout (1440×900) and the light theme.

The design targets the stack and budgets already fixed in the project's `SPEC.md` / `CLAUDE.md`: Angular standalone components, signals, `ChangeDetectionStrategy.OnPush`, zoneless, TypeScript strict, 16 ms frame budget at 5 000 aircraft, ≤250 KB gzip initial JS.

## About the design files
`Radar Mobile.dc.html` is a **design reference written in HTML** — a prototype showing intended look, structure and behavior. It is not production code to copy. Recreate these screens in the target codebase using its own patterns: Angular standalone components + signals, the project's own CSS layer (Tailwind utilities if that is the chosen architecture), and a real map renderer.

The prototype draws its map with d3-geo + Natural Earth TopoJSON purely so the mock shows truthful geography. **Production must use a real tiled/vector map renderer** (MapLibre GL JS or Leaflet + OSM tiles) with aircraft drawn on a canvas/WebGL overlay — 5 000 SVG markers will not hold the 16 ms frame budget.

## Fidelity
**High-fidelity.** Final colors, type, spacing, radii, glass treatment and copy. Recreate pixel-accurately against the tokens below.

## Design tokens
All tokens come from the Nocturne design system (`_ds/nocturne-*/styles.css`). Do not invent values.

Core (dark, default):
- Ground `--color-bg` #161826 · surface `--color-surface` #232532 · text `--color-text` #e9e9ed
- Accent `--color-accent` #9184d9; ramp 100→900: #f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741
- Neutral ramp `--color-neutral-100…900` (muted text = 300/400)
- Spacing 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4 px (density 0.70×)
- Radius sm 4 · md 8 · lg 14. UI additions in this design: 14 px icon buttons, 16 px tiles/buttons, 18–22 px glass panels, 30 px sheet top, 42 px phone bezel, 999 px pills
- Shadows `--shadow-sm/md/lg` (hairline edge + ambient darkness)
- Type: Inter for both heading and body; headings never above weight 500. Sizes used: 10 (tab labels), 11 (uppercase eyebrows, .1em tracking), 12–13 (meta), 14 (body/rows), 17–20 (titles), 22–28 (numbers, screen titles)
- Numeric readouts use `font-variant-numeric: tabular-nums`

Theme layer (the only thing that changes between dark and light — every surface reads from these):
```
/* dark */
--ink: 233,233,237;  --hi: 255,255,255;  --acc: 145,132,217;
--sheet-top: rgba(35,37,50,.8);   --sheet-bot: rgba(22,24,38,.93);
--scrim-0: rgba(22,24,38,.2);     --scrim-1: rgba(22,24,38,.9);
--top-fade: rgba(15,17,28,.85);
--ground-a: radial-gradient(120% 80% at 30% 10%, #1b2033, #10121d 70%);
--knob: var(--color-accent-100);
map land #1f2333, land stroke rgba(233,233,237,.16), graticule rgba(233,233,237,.05)

/* light */
--ink: 26,28,38;  --hi: 255,255,255;  --acc: 121,108,191;
--sheet-top: rgba(252,252,253,.84); --sheet-bot: rgba(238,239,245,.95);
--scrim-0: rgba(244,244,248,.2);    --scrim-1: rgba(243,244,249,.93);
--top-fade: rgba(247,248,251,.88);
--ground-a: radial-gradient(120% 80% at 30% 10%, #f4f5f9, #e3e5ee 70%);
--color-text: #1a1c26; --color-neutral-200:#33363f; --color-neutral-300:#454954; --color-neutral-400:#5a5e6b;
--color-accent-100:#2b2741; -200:#4a4176; -300:#5d5294; -400:#6f63ad; -500:#796cbf; -600:#cfc9f9; -700:#c6bef6; -800:#ded9fc;
--knob:#fcfcfd; --shadow-lg: 0 0 0 1px #c9ccd8, 0 18px 44px rgba(0,0,0,.18);
map land #e9ebf2, land stroke rgba(26,28,38,.18), graticule rgba(26,28,38,.07)
```
Implementation note: in the prototype the light tokens are set inline on the light artboard. In production put them on `html[data-theme="light"]` (or `:root` + `prefers-color-scheme`) and **also declare `color: var(--color-text)` on that same scope** — inherited `color` carries a resolved value, so a token-only override does not repaint inherited text.

### The glass recipe (Liquid Glass)
Every floating surface is the same four-part recipe — reuse one utility/mixin, do not hand-tune per element:
```
background: linear-gradient(160deg, rgba(var(--ink),.12), rgba(var(--ink),.05));
backdrop-filter: blur(var(--glass-blur)) saturate(150%);   /* + -webkit- prefix */
border: 1px solid rgba(var(--ink),.15);
box-shadow: inset 0 1px 0 rgba(var(--hi),.13), 0 10px 28px rgba(0,0,0,.45);
```
`--glass-blur` is 22 px; the bottom sheet and the desktop detail panel use `calc(var(--glass-blur) * 1.4)` and `saturate(160%)`. Tinted (selected) glass swaps the fill for `rgba(var(--acc),.16)` with a `var(--color-accent-700)` border. The inset top highlight is what makes the edge read as lit — never drop it. Provide a `@supports not (backdrop-filter: blur(1px))` fallback of opaque `--color-surface`.

## Screens

### 1a — Live map · nearby (390×844)
Layout: map fills the frame; everything else floats above it.
- Status bar: 14 px top / 22 px sides, 13 px 600-weight, Phosphor `cell-signal-full`, `wifi-high`, `battery-vertical-high` (rotated 90°).
- Top fade: 132 px tall `linear-gradient(180deg, var(--top-fade), transparent)`, pointer-events none — keeps the status bar legible over the map.
- Search bar: glass, radius 20, padding 12/14, left `magnifying-glass` 18 px, placeholder "Flight, airport or route" (14 px, neutral-400), right 26 px avatar pill (gradient accent-600→800, initials 11/600).
- Filter chips row (gap 8, 999 px pills, 12 px): "Filters" (tinted glass, `sliders-horizontal`), "Above FL200", "KLM".
- Map controls, right edge, top 176: two 40×40 glass buttons radius 14 — `stack-simple` (layers), `crosshair` (locate).
- Aircraft: Phosphor `airplane-in-flight` (fill), rotated to true track. Selected = 26 px accent-200 with a 44 px radial accent glow + `drop-shadow(0 0 8px rgba(var(--acc),.7))`; others 15–17 px at `rgba(var(--ink),.38–.62)` — size and opacity encode altitude/recency.
- Track: dashed `5 6` accent-500 1.6 px behind the aircraft, solid 28 %-opacity line ahead (projected); filled 3.5 r dot at origin, hollow ring at destination.
- Bottom sheet (glass, radius 30/30/42/42, 1.4× blur): 38×4 grabber; header "Nearby" (17/500) + live pill (pulsing 6 px accent dot, 2.4 s, "42 live"); three flight rows 12/18 padding, 1 px `rgba(var(--ink),.08)` rules, selected row gets `linear-gradient(90deg, rgba(var(--acc),.14), transparent 70%)`. Row = rotated plane icon · callsign + route (14/600) / type + registration (12, neutral-400) · right column FL + speed (13 / 12, tabular).
- Tab bar: 4-column grid, 22 px icons over 10 px labels, active = accent-300 + fill-weight icon. Map / Search / Following / Me. 30 px bottom safe area.

Sheet is a drag sheet: three stops — peek (~46 %, as shown), full (as in 1b), collapsed to the header.

### 1b — Flight detail (390×844)
Sheet at 620 px (~73 %), map dimmed to 55 % opacity behind it, back button (40×40 glass, `arrow-left`) top-left.
- Header: "KL1024" (26/500, -.01em) + "KLM Royal Dutch Airlines · B737-800" (13, neutral-400); status pill "En route" (11/600, tinted accent).
- Route: AMS / LHR (20/500) with "10:05 · Gate D42" / "10:52 · Term 4"; 3 px progress rail, filled 62 % `linear-gradient(90deg, accent-700, accent-400)`, plane glyph at the head rotated 90°; caption "18 min remaining · 214 km to go".
- Telemetry: 2×2 grid, gap 10, tiles radius 16, fill `rgba(var(--ink),.06)`, 1 px `rgba(var(--ink),.1)`; eyebrow 11 px uppercase .1em + value 22/500 tabular with a 12 px neutral unit. Altitude 34 000 ft · Ground speed 448 kt · Track 241° · Vertical −640 fpm.
- Altitude profile: 340×68 SVG, accent-400 1.6 px line over a `accent-500 .45 → 0` vertical gradient fill, 3.2 r accent-200 dot at "now".
- Actions pinned to the bottom (30 px safe area): outlined "Follow" (46 px, radius 16, accent-500 border, `rgba(var(--acc),.12)` fill) + two 46 px icon buttons (`bell`, `share-network`). Primary actions are outlined, never filled.

### 1c — Search & filters (390×844)
Map at 22 % opacity as texture only; content on a flex column.
- Focused field: accent-500 border + `0 0 0 4px rgba(var(--acc),.14)` focus ring, value "AMS → LHR" (the arrow half at 50 % opacity), trailing `x-circle`.
- Segmented control: 3 equal columns, 3 px padding, outer radius 14 / inner 11; selected = `rgba(var(--acc),.28)` + inset top highlight + accent-100 text. Flights / Airports / Airlines.
- Altitude band: dual-thumb range, 3 px rail, accent-500 selected span, 18 px accent-200 thumbs with `0 0 0 4px rgba(var(--acc),.22)`; labels FL080 / FL410.
- Operators: wrapping chips, selected tinted accent (KLM, British Airways), unselected `rgba(var(--ink),.07)`.
- Recent: rows 12 px, top rules, `clock-counter-clockwise` leading + `arrow-up-right` trailing. EHAM · Amsterdam Schiphol / KL1024 / Squawk 7700.
- Footer bar over a `--scrim-0 → --scrim-1` gradient: "Reset" (flex 1) + "Show 128 flights" (flex 2, accent outline). The count is live and reflects current filter state.

### 1d — Following (390×844)
No map. Title "Following" (28/500) + "3 flights · 1 alert".
- Active card: tinted glass (`linear-gradient(160deg, rgba(var(--acc),.16), rgba(var(--ink),.04))`, accent-700 border, radius 20) — callsign 18/500, status "Descending" with pulsing dot, route line where the filled portion is the progress (`linear-gradient(90deg, accent-500 62%, rgba(var(--ink),.16) 62%)`), caption "Lands in 18 min · on time".
- Idle cards: `rgba(var(--ink),.055)` fill, neutral status pills — LH2041 "Boarding" (Gate H38 · delayed 15 min), FR8812 "Landed" (Arrived 12 min early).
- Alerts row: 1 px dashed `rgba(var(--ink),.16)`, `bell-ringing`, "Alerts on takeoff & landing" + 42×25 toggle (knob 19 px `--knob`, track `rgba(var(--acc),.34)`).
- Same tab bar, "Following" active.

### 2a / 2b — Desktop (1440×900, dark and light)
Same parts, redistributed — this is the responsive contract:
- **Left rail, 236 px fixed** (replaces the tab bar): glass column, `border-right: 1px rgba(var(--ink),.12)`. Brand (`radioactive` icon + "Radar" 18/500 + pulsing "live"), nav list (Map active tinted, Search, Following ·3, Alerts ·1, Filters — 10/12 padding, radius 14, 19 px icons), then a "Feed" stats card pinned to the bottom (Flights 5 012 / Receivers 1 284 / WS latency 42 ms) and an account row (28 px avatar, `caret-up-down`).
- **Map area** fills the remaining 1204 px; controls at 22 px insets. Search bar 380 px wide with a `⌘K` hint chip; "Filters · 2" and "Above FL200" chips beside it. Zoom/layer column (four 40×40 glass buttons: layers, crosshair, +, −) sits at `right: 386px` so it clears the detail panel.
- **Right detail panel, 348 px, 22 px inset, radius 22** (replaces the bottom sheet): the 1b content at desktop density — header, route + progress, 2×2 telemetry, 300×64 altitude profile, plus a desktop-only "Recent positions" log (time · lat/lon · FL, 12 px tabular rows on top rules), actions pinned to the bottom.
- **Bottom-left feed strip** (desktop-only): glass, three stats separated by 1 px 30 px dividers — In view 612 · Frame 11 ms · Stream 18 KB/s. This surfaces the SPEC performance budgets in the UI.

Breakpoints to implement: <768 px = mobile (tab bar + drag sheet), 768–1199 px = rail collapses to 64 px icons only, detail panel becomes an overlay sheet on the right at 420 px, ≥1200 px = the full 2a layout.

## Interactions & behavior
- Tap/click an aircraft → selects it: glow + dashed track appear, sheet/panel opens with detail, map eases to keep the aircraft in the upper third.
- Sheet drag between the three stops, spring-settled; on desktop the panel is static and closes with Esc or the back/close control.
- Live updates: positions interpolate between WS frames (constant-velocity dead reckoning on track + ground speed) so movement stays smooth between packets; never re-render the DOM per frame — aircraft live on a canvas/WebGL layer, and only the selected flight's readouts touch the DOM.
- Readout numbers cross-fade rather than snapping; the live dot pulse is the one ambient animation (2.4 s ease-in-out).
- Viewport-scoped subscription: the client subscribes to the current map bounds + zoom, matching the SPEC's viewport WS subscriptions; the "In view" figure comes from that subscription.
- Filters apply optimistically to the rendered layer while the server confirms; "Show N flights" reflects the pending count.
- States to design for: connecting (skeleton sheet, rail stats dashed), reconnecting (amber-free — use neutral pill "Reconnecting…" with the pulsing dot), empty filter result ("No flights match" in the sheet), and offline (last known positions greyed to `rgba(var(--ink),.3)` with a timestamp).
- Hit targets: nothing below 44 px on mobile. Focus: `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` on every interactive element; hover tints from the accent ramp; pressed = one step past base (accent-400 on dark). Respect `prefers-reduced-motion` by dropping the pulse and map easing.

## State
- `theme`: 'dark' | 'light' | 'system' (persisted).
- `viewport`: map center, zoom, bounds → drives the WS subscription.
- `aircraft`: id-keyed store of the decoded binary frames (position, track, speed, altitude, vertical rate, last-seen).
- `selectedId`: nullable; owns the detail panel/sheet and the track overlay.
- `sheetStop`: 'collapsed' | 'peek' | 'full' (mobile only).
- `filters`: { altitudeBand: [min, max], operators: string[], cargoOnly: boolean } + derived pending count.
- `following`: followed callsigns with status and alert preferences.
- `connection`: 'connecting' | 'live' | 'reconnecting' | 'offline' + latency and bytes/s for the feed strip.

## Assets
- Icons: **Phosphor** (regular + fill) — the exact names used: magnifying-glass, sliders-horizontal, stack-simple, crosshair, plus, minus, airplane-in-flight (fill), globe-hemisphere-west, bookmark-simple, bell, bell-ringing, user, arrow-left, arrow-up-right, x-circle, clock-counter-clockwise, share-network, caret-up-down, radioactive, cell-signal-full, wifi-high, battery-vertical-high. Install `@phosphor-icons/*` locally rather than the CDN.
- Map geometry in the prototype: world-atlas 2.0.2 `countries-110m.json` (Natural Earth, public domain) via d3-geo. Replace with the production map renderer.
- No raster assets. No logos.

## Files
- `Radar Mobile.dc.html` — all six artboards (1a–1d mobile dark, 2a/2b desktop dark+light, 2c mobile light). Open it in a browser to inspect live.
- `_ds/nocturne-*/styles.css` — the design-system token sheet every value above comes from. Port the `:root` block as the app's token layer.
- `support.js` — prototype runtime only; not part of the handoff.
