# Юр CRM

CRM-система для юридической компании. Центральная сущность — **«Дело»** (оно же договор);
вокруг него собираются клиент, документы, задачи и сроки, команда и финансы.

Система на проде: [`yur-crm.vercel.app`](https://yur-crm.vercel.app). Интерфейс — украинский/русский.

> **Разработчику/агенту:** источник правды по домену, ролям, доступу (RLS) и бизнес-правилам —
> [`CLAUDE.md`](CLAUDE.md). Дизайн-система — [`DESIGN.md`](DESIGN.md). Ход разработки и
> «текущее состояние» — [`docs/PROGRESS.md`](docs/PROGRESS.md). Читай их **перед** кодом.

## Стек

| Слой | Технология |
|---|---|
| Frontend + backend | Next.js 16 (App Router) + React 19 + TypeScript (strict) |
| БД | Neon (managed PostgreSQL, Frankfurt); ветки production / development |
| Auth | Свой — JWT в httpOnly-cookie (`jose`) + пароли `bcryptjs`, проверка сессии локальная |
| Доступ к данным | Prisma: `userDb()` под RLS (роль `app_user`) / `adminDb()` (owner БД) системно |
| Файлы | S3-совместимое (`lib/storage`): Cloudflare R2 на проде, локальный провайдер для dev |
| UI | Tailwind CSS v4 + Radix UI, шрифт IBM Plex Sans |
| Печатные формы | ExcelJS (Рахунок-Акт → XLSX) |
| Тесты | Vitest (unit + integration) + Playwright (e2e) |
| Деплой | Vercel + Neon |

Пользовательские запросы идут через `userDb(userId, tx ⇒ …)` — обёртка ставит контекст
пользователя (`app.user_id`), на нём работает RLS. `adminDb()` (owner БД, обход RLS) — только
системно (machine-роуты/seed/миграции; импорт вне allowlist валит ESLint).

> Идёт цикл v4 — переезд Supabase → Neon (код готов, прод переключается позже). См.
> [`docs/PLAN-V4-POSTGRES.md`](docs/PLAN-V4-POSTGRES.md).

## Быстрый старт

```bash
npm install                    # зависимости
cp .env.example .env.local     # заполнить DATABASE_URL_* (Neon Console) + AUTH_SECRET

npm run db:migrate             # применить миграции на ветку development
npm run db:seed                # тестовые данные и логины (*@yur.local / test12345!)
npm run dev                    # http://localhost:3000
```

Проверки:

```bash
npm run lint                   # ESLint
npx tsc --noEmit               # тайпчек
npm test                       # unit-тесты (Vitest)
npm run test:integration       # integration-тесты (нужен Postgres: ветка Neon dev / CI-service)
npm run smoke:rls              # быстрый RLS-smoke на живой БД (21 инвариант доступа)
```

## Роли

Пять ролей (`users.role`): **owner** (владелец), **admin** (руководитель подразделения),
**office_manager** (офис-менеджер), **lawyer** (юрист-продажник, видит свои дела по `lawyer_id`),
**expert** (Эксперт-исполнитель, видит свои дела по `responsible_id`). Полная матрица доступа
и правила RLS — в [`CLAUDE.md` §4](CLAUDE.md).

## Структура

```
src/app/          — маршруты (App Router): (app) интерфейс, (print) печать, api эндпоинты
src/components/    — UI-компоненты (примитивы ui/, оболочка app/, доменные группы)
src/lib/           — серверная логика: доступ к данным (db/), финансы/ЗП, касса, акты, валидация
db/migrations/     — SQL-миграции (шим + baseline-слепок + инкременты; свой раннер)
prisma/            — schema.prisma (introspect готовой схемы → типизированный клиент)
scripts/           — миграции БД, сидинг, RLS-smoke, перенос данных/файлов (сессия 7)
tests/             — unit / integration / e2e
docs/              — документация; docs/archive — история завершённых циклов
```

## Документация

- [`CLAUDE.md`](CLAUDE.md) — стек, домен, роли, RLS, бизнес-правила, конвенции (главный документ).
- [`DESIGN.md`](DESIGN.md) — дизайн-система (токены, типографика, компоненты).
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — журнал разработки и текущее состояние.
- [`docs/archive/`](docs/archive) — планы и история завершённых циклов v1/v2/v3.
