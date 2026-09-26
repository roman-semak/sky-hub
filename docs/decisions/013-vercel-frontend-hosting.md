# ADR-013: Vercel як хост фронтенду

## Контекст

`SPEC.md` § 3 і ADR-010 фіксують Cloudflare Pages для фронтенду і Fly.io для
API. Власник проєкту попросив налаштувати виливку на Vercel (2026-09-18) і
запушив репозиторій на GitHub (2026-09-26).

Vercel — це статика плюс serverless-функції з обмеженим часом виконання. Він
не тримає довгоживучі WebSocket-з'єднання і не дає процесу з in-memory станом,
а `apps/server` саме на цьому побудований: ingest-цикл, `Map<hex, Aircraft>`,
`WS /stream`, Parquet-історія на диску. Тому Vercel може взяти на себе тільки
статичний бандл.

## Рішення

- **Фронт:** `apps/web` деплоїться на Vercel (Hobby, 0 €; проєкт
  некомерційний). Конфіг — `vercel.json` у корені: білд через Turborepo з
  фільтром `@skytrace/web`, вихід `apps/web/dist/web/browser`.
- **Бек:** без змін, Fly.io за ADR-010. Фронт і API на різних origin, тому
  на сервері потрібні CORS і перевірка `Origin` для WS.
- **API origin** пишеться в `<meta name="skytrace-api">` після білду —
  `scripts/set-api-origin.ts`, значення з env `SKYTRACE_API_ORIGIN` у
  налаштуваннях проєкту Vercel. Порожнє значення = same-origin.
- `_headers` і `_redirects` з білду Vercel не читає, тому їхні правила
  продубльовані в `vercel.json`: SPA-фолбек окремо для `/uk/*`, immutable
  тільки для хешованих файлів, `no-cache` для service worker і манифесту.
- **Cloudflare-джоба в `.github/workflows/deploy.yml` лишається**, але спить:
  вона пропускається, поки не задано `vars.CLOUDFLARE_PROJECT`. Так Vercel і
  Cloudflare не деплоять одночасно, а конфіг з ADR-010 лишається робочим,
  якщо знадобиться перенести фронт назад.
- Деплой тригериться git-інтеграцією Vercel на push у `main`, без секретів
  у GitHub Actions.

## Наслідки

- Preview-деплой на кожен PR безкоштовно.
- `Ignored Build Step` не налаштовуємо через `turbo-ignore` (депрекейтнутий,
  і на першому деплої він скасував білд, бо порівнював `HEAD^1..HEAD` —
  merge з одними доками). Пропуск незмінених проєктів лишається за
  вбудованим механізмом Vercel у налаштуваннях проєкту.
- Поки `SKYTRACE_API_ORIGIN` не задано, сайт на Vercel очікує API на своєму ж
  origin і живих бортів не покаже: карта підніметься, стрім — ні.
