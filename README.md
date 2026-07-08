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
| БД / Auth / Storage | Supabase (PostgreSQL + Auth + Storage + Row Level Security) |
| UI | Tailwind CSS v4 + Radix UI, шрифт IBM Plex Sans |
| Печатные формы | ExcelJS (Рахунок-Акт → XLSX) |
| Тесты | Vitest (unit + integration) + Playwright (e2e) |
| Деплой | Vercel + Supabase |

Доступ к данным идёт через `supabase-js` **с сессией пользователя** — чтобы работал RLS.
`service_role` (обход RLS) — только для системных задач (миграции, сидинг, auth-админ).

## Быстрый старт

```bash
npm install                    # зависимости
cp .env.example .env.local     # затем подставить значения из `npx supabase status`

npx supabase start             # локальный стек (Postgres + Auth + Storage + Studio)
npm run db:seed                # тестовые данные и логины (*@yur.local / test12345!)
npm run dev                    # http://localhost:3000
```

Проверки:

```bash
npm run lint                   # ESLint
npx tsc --noEmit               # тайпчек
npm test                       # unit-тесты (Vitest)
npm run test:integration       # integration-тесты (нужен локальный Supabase)
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
src/lib/           — серверная логика: доступ к данным, финансы/ЗП, касса, акты, валидация
supabase/migrations — SQL-миграции (схема, RLS, функции, триггеры)
scripts/           — сидинг и служебные скрипты
tests/             — unit / integration / e2e
docs/              — документация; docs/archive — история завершённых циклов
```

## Документация

- [`CLAUDE.md`](CLAUDE.md) — стек, домен, роли, RLS, бизнес-правила, конвенции (главный документ).
- [`DESIGN.md`](DESIGN.md) — дизайн-система (токены, типографика, компоненты).
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — журнал разработки и текущее состояние.
- [`docs/archive/`](docs/archive) — планы и история завершённых циклов v1/v2/v3.
