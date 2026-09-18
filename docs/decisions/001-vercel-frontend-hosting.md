# ADR-001: Vercel для фронтенду замість Cloudflare Pages

- Статус: прийнято (за запитом власника проєкту)
- Дата: 2026-09-18

## Контекст

`SPEC.md` § 3 фіксує хостинг «Cloudflare Pages (фронт) + Fly.io / Render (бек)».
Власник проєкту попросив налаштувати деплой на Vercel.

Vercel — це статика + serverless/edge функції з обмеженим часом виконання.
Він не тримає довгоживучі WebSocket-з'єднання і не дає постійного процесу
з in-memory станом, а `apps/server` саме на цьому побудований
(ingest worker, `Map<hex, Aircraft>`, `WS /stream`, history WAL на диску).

## Рішення

- `apps/web` (Angular, статичний білд) деплоїться на **Vercel** (Hobby, 0 €;
  проєкт некомерційний — умови Hobby дозволяють).
- `apps/server` лишається на **Fly.io / Render**, як у специфікації.
- Конфіг — `vercel.json` у корені монорепо: білд через Turborepo з фільтром
  `@skytrace/web`, `turbo-ignore` пропускає деплой, якщо web і його
  залежності не змінились.
- SPA-фолбек на `index.html`; хешовані ассети — `immutable`, `index.html` — `no-cache`.
- URL бекенда передається у фронт через змінну оточення Vercel
  (`SKYTRACE_API_URL`) на етапі білду — буде підключено у фазі 2/7.

## Наслідки

- Preview-деплой на кожен PR безкоштовно — зручно для ревʼю UI.
- Фронт і бек на різних доменах → на сервері потрібен CORS і перевірка
  `Origin` для WS.
- Cloudflare Pages із фази 7 замінено на Vercel; Fly.io для бекенда без змін.
