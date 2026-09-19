# Прогрес

## Поточна фаза: 2 — API + WebSocket

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

### У роботі

- [ ] Playwright — підключається разом з `apps/web` (фаза 3), бо до того немає що тестувати

### Рішення

- ADR-001: TypeScript 5.9 / Vitest 3 / ESLint 9 — сумісність з Angular 20.
- ADR-002: airplanes.live і adsb.one відхиляють анонімних клієнтів → за замовчуванням adsb.fi + adsb.lol з AIMD-пейсингом.
- ADR-003: ~1.1 запиту/с замість потрібних 20 → планувальник за попитом (viewport-кола 30× пріоритетніші), виселення 180 с.

### Заблоковано

- (порожньо)
