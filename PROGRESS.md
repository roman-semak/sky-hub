# Прогрес

## Поточна фаза: 7 — Поліш

### Зроблено

- [x] 2026-09-18 · pnpm workspace, Turborepo, TS strict, ESLint flat config, Prettier · `feat/0-foundation`
- [x] 2026-09-18 · Vitest + coverage, husky + lint-staged · `feat/0-foundation`
- [x] 2026-09-18 · GitHub Actions: lint → typecheck → test → build · `feat/0-foundation`
- [x] 2026-09-18 · `packages/adsb-types` із Zod-схемами, нормалізатор, фікстура adsb.lol · `feat/0-foundation`

- [x] 2026-09-19 · `packages/geo`: great-circle, bbox, geohash, dead reckoning, RDP, сітка покриття + fast-check · `feat/1-providers`
- [x] 2026-09-19 · Провайдер-абстракція: adsb.lol / adsb.fi / airplanes.live / adsb.one + OpenSky-фолбек · `feat/1-providers`
- [x] 2026-09-19 · Health-check, circuit breaker, AIMD-пейсинг, метрики в `/healthz` · `feat/1-providers`
- [x] 2026-09-19 · Планувальник покриття за попитом (115 кіл по 250 нм) · `feat/1-providers`
- [x] 2026-09-19 · Нормалізація + дедуп по `hex`, in-memory store, `flatbush`-індекс 1×/с · `feat/1-providers`

- [x] 2026-09-19 · Бінарний кодек 28 Б/борт + property-based round-trip тести · `feat/2-binary-codec`
- [x] 2026-09-19 · `WS /stream`: viewport-підписки, zoom-деградація, кластери geohash-3, watch · `feat/2-ws-viewport`
- [x] 2026-09-19 · Delta-кодування + removals, кодування в store (поза гарячим шляхом) · `feat/2-ws-viewport`
- [x] 2026-09-19 · REST: `/api/ac/:hex`, `/api/search`, `/api/stats` · `feat/2-ws-viewport`
- [x] 2026-09-19 · Rate limit по IP (REST + WS-з'єднання + WS-повідомлення), backpressure · `feat/2-ws-viewport`
- [x] 2026-09-19 · DoD: 200 WS-клієнтів, 20k бортів — p99 39–46 мс (було 80 до оптимізації); 600 бортів ≤ 16.8 КБ/с

- [x] 2026-09-21 · Angular 20 zoneless, Nocturne-токени, glass-рецепт, темна/світла тема · `feat/3-map`
- [x] 2026-09-21 · MapLibre + тайли CARTO у палітрі Nocturne, лейзі-чанк · `feat/3-map`
- [x] 2026-09-21 · deck.gl IconLayer, атлас 13 силуетів, колір за висотою на GPU (LayerExtension) · `feat/3-map`
- [x] 2026-09-21 · Dead reckoning із згладжуванням (allocation-free `renderPoseInto`) · `feat/3-map`
- [x] 2026-09-21 · Hover-tooltip, клік → вибір, URL як стан (`?lat&lon&z&sel`) · `feat/3-map`
- [x] 2026-09-21 · Playwright: 5000 бортів — CPU p95 2.8 мс, 60 fps на M1 Pro (Metal) · `feat/3-map`
- [x] 2026-09-21 · Playwright підключено (пункт фази 0) · `feat/3-map`

- [x] 2026-09-21 · Статичні датасети: аеропорти, авіакомпанії, типи ПС, ICAO24 → країна; `pnpm data:refresh` · `feat/4-static-data`
- [x] 2026-09-21 · Route lookup: adsb.lol routeset → adsbdb.com, кеш 6 год · `feat/4-static-data`
- [x] 2026-09-21 · Сервер: `/api/route`, `/api/track` (in-memory + RDP), `/api/airport`, пошук аеропортів/авіакомпаній, фільтр за країною, `preview`-лічильник · `feat/4-static-data`

- [x] 2026-09-21 · Панель борту: маршрут із прогресом, uPlot-графік висоти/швидкості, журнал позицій, сирі поля, follow/share · `feat/4-flight-details`
- [x] 2026-09-21 · Фільтри (висота, швидкість, оператор, тип, країна, mil/emergency/LADD), пресети в localStorage, живий «Show N flights» · `feat/4-flight-details`
- [x] 2026-09-21 · Пошук по callsign / реєстрації / hex / аеропорту / авіакомпанії, недавні запити; `/`, ⌘K, `f`, `Esc` · `feat/4-flight-details`
- [x] 2026-09-21 · Екран Following (макет 1d) · `feat/4-flight-details`
- [x] 2026-09-21 · DoD e2e: «знайти рейс TAP → деталі → маршрут» (мок REST + WS) · `feat/4-flight-details`

- [x] 2026-09-21 · Parquet-запис (zstd через `node:zlib`), part-файли кожні 5 хв, retention-крон `HISTORY_RETENTION_HOURS` · `feat/5-history`
- [x] 2026-09-21 · `/api/track/{hex}`: Parquet + буфер + пам'ять, RDP ε=0.0005°, кеш 60 с; `/api/flights/{hex}` · `feat/5-history`
- [x] 2026-09-21 · Шлейф треку на карті з історії для вибраного борту + hover-шлейф · `feat/5-history`
- [x] 2026-09-21 · Playback зі скрабером ×1/×10/×60 (бінарний `/api/history`, віртуальний годинник) · `feat/5-history`
- [x] 2026-09-21 · Сторінка борту `/aircraft/{hex|reg}` з історією польотів · `feat/5-history`
- [x] 2026-09-21 · DoD: година історії × 1500 бортів на ×60 — 60 fps, p95 кадру 18 мс, найгірший 36 мс · `feat/5-history`

- [x] 2026-09-21 · `/airport/{icao}`: METAR/TAF (NOAA AWC), роза вітрів за 24 год, борти в 50 нм — прильоти/вильоти/на землі · `feat/6-airports-weather`
- [x] 2026-09-21 · Шар радара опадів (RainViewer, напряму з клієнта) · `feat/6-airports-weather`
- [x] 2026-09-21 · Шар вітру на ешелонах FL050/FL180/FL340 (Open-Meteo), 1500 частинок deck.gl · `feat/6-airports-weather`
- [x] 2026-09-21 · Live-дешборд статистики (оновлення 10 с) · `feat/6-airports-weather`
- [x] 2026-09-21 · DoD: сторінка LPPT показує реальні борти на підльоті (AEA12AT 0.4 нм/75 ft, THY4GH 8.7 нм/−1024 fpm) · `feat/6-airports-weather`

- [x] 2026-09-21 · PWA: маніфест, власні іконки, service worker (оболонка + кеш тайлів CARTO), офлайн-банер і реконект · `feat/7-pwa`
- [x] 2026-09-21 · i18n EN/UK через `$localize`: 200 повідомлень, дві збірки (`/` і `/uk/`), перемикач мови · `feat/7-pwa`
- [x] 2026-09-21 · A11y: axe (WCAG 2.1 AA) — 0 порушень на всіх екранах, темна й світла теми · `feat/7-pwa`
- [x] 2026-09-21 · Lighthouse: карта desktop 100/100/100/100; mobile 83 (див. ADR-009), /search і /stats mobile 95 · `feat/7-pwa`

### Журнал

- 2026-09-21 · Initial bundle 100 КБ gzip (ліміт 250). Мапа живих даних Франкфурта/Лондона перевірена скріншотами desktop/mobile, dark/light.
- 2026-09-21 · Баг: воркер MapLibre 6 не завантажувався після бандлінгу → ADR-005.
- 2026-09-21 · Пік 10 879 бортів одночасно (дешборд) — DoD фази 1 «≥10k у пік» виконано.
- 2026-09-21 · Живий прогін: пошук «TAP» → TAP077 OPO → GIG, 7742 км, ETA 566 хв.
- 2026-09-21 · Баг: синхронізація URL навігувала на `/` з будь-якої сторінки — тепер лише з карти.
- 2026-09-21 · Баг: кнопки зуму/локації/переходи з пошуку не рухали камеру — додано канал `camera` у сторі.
- 2026-09-21 · SwiftShader у headless дає 10 fps незалежно від застосунку; FPS-перевірка лише на апаратному GPU, CPU-бюджет — завжди.

- 2026-09-19 · Soak 20 хв на живих даних: heap 22–26 МБ, дрейф +3.5 %, пік 6039 бортів.
- 2026-09-19 · Живий WS-probe (Франкфурт, zoom 8): 170 бортів, 3 КБ/с, viewport оновлюється кожні ~2 с.
- 2026-09-19 · Баг: неопитані кола мали `lastFetched=0` і перебивали пріоритет viewport-кіл — виправлено.

### У роботі

### Рішення

- ADR-001: TypeScript 5.9 / Vitest 3 / ESLint 9 — сумісність з Angular 20.
- ADR-002: airplanes.live і adsb.one відхиляють анонімних клієнтів → за замовчуванням adsb.fi + adsb.lol з AIMD-пейсингом.
- ADR-004: деталі формату, яких немає в SPEC (null-сентинели, non-ICAO біт, емердженсі-байт, кадри 0x03/0x04).
- ADR-005: MapLibre/deck.gl у лейзі-чанку, воркер MapLibre як ассет, GPU-рампа кольору.
- ADR-006: routeset adsb.lol мовчить → ланцюг з adsbdb.com; реєстраційна база Mictronics не потрібна.
- ADR-007: part-файли Parquet на кожен флаш, сортування (icao24, ts), zstd з `node:zlib`, бінарний payload програвання.
- ADR-008: METAR/TAF і вітер через серверний кеш, радар RainViewer напряму з браузера.
- ADR-009: власна атрибуція, MapLibre і deck.gl окремими чанками, HTML-shell; мобільна карта обмежена вартістю стеку.
- ADR-003: ~1.1 запиту/с замість потрібних 20 → планувальник за попитом (viewport-кола 30× пріоритетніші), виселення 180 с.

### Заблоковано

- Lighthouse ≥ 95 для **мобільної** карти (зараз 83): потрібен SSR/SSG-пререндер оболонки — окрема задача (ADR-009).

- (порожньо)
