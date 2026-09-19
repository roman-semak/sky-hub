# Прогрес

## Поточна фаза: 3 — Карта

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

### Журнал

- 2026-09-19 · Soak 20 хв на живих даних: heap 22–26 МБ, дрейф +3.5 %, пік 6039 бортів.
- 2026-09-19 · Живий WS-probe (Франкфурт, zoom 8): 170 бортів, 3 КБ/с, viewport оновлюється кожні ~2 с.
- 2026-09-19 · Баг: неопитані кола мали `lastFetched=0` і перебивали пріоритет viewport-кіл — виправлено.

### У роботі

- [ ] Playwright — підключається разом з `apps/web` (фаза 3), бо до того немає що тестувати

### Рішення

- ADR-001: TypeScript 5.9 / Vitest 3 / ESLint 9 — сумісність з Angular 20.
- ADR-002: airplanes.live і adsb.one відхиляють анонімних клієнтів → за замовчуванням adsb.fi + adsb.lol з AIMD-пейсингом.
- ADR-004: деталі формату, яких немає в SPEC (null-сентинели, non-ICAO біт, емердженсі-байт, кадри 0x03/0x04).
- ADR-003: ~1.1 запиту/с замість потрібних 20 → планувальник за попитом (viewport-кола 30× пріоритетніші), виселення 180 с.

### Заблоковано

- (порожньо)
