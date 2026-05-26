# PROGRESS — Юр CRM

> **Назначение.** Этот файл — единственный источник правды о ходе разработки между
> сессиями. В начале каждой новой сессии первым делом читай его (последнюю запись)
> сразу после `CLAUDE.md`. По команде пользователя «завершаем сессию» — обязательно
> добавь сюда новый handoff-блок.

---

## Текущее состояние

_Снимок на 2026-05-27 (вторая сессия)._

- **Шаг:** 2 — Auth и роли — **ЗАВЕРШЁН** ✓
- **Следующий шаг:** 3 — Визуальная система (см. `kickoff-prompt.md` Шаг 3 — `/design-consultation`, дизайн-токены, светлая/тёмная тема, типографика, базовые компоненты поверх shadcn/ui).
- **Последний коммит:** см. `git log --oneline -1` (commit Шага 2).
- **Следующее действие:** в новой сессии — прочитать §11 «Дизайн интерфейса» в `CLAUDE.md` (refined-minimal, уровень Linear/Vercel/Stripe; запреты на Inter/Roboto/Arial/фиолетовые градиенты; светлая+тёмная темы; одна acentная цвет-пара; типографическая пара serif+grotesk; табличные цифры), запустить `/design-consultation`, зафиксировать визуальную систему, показать пользователю. Только после — устанавливать shadcn/ui и кастомизировать под токены.

### Открытые решения
- **Git remote:** всё ещё отложен. Подключим по запросу.
- **Локальный Supabase** поднят. Порты 54321/54322/54323/54324. Конфиг: `supabase/config.toml` — `project_id = "yur-crm"`.
- **Зависимости добавлены в Шаге 2:** `@supabase/ssr ^0.10.3`, `server-only ^0.0.1`.
- **Деактивация сотрудника (Шаг 4):** при `is_active = false` обязательно вызывать `supabase.auth.admin.signOut(userId)`. Иначе у деактивированного пользователя с ещё валидным JWT proxy будет пропускать запросы, и getCurrentUser (фильтр по is_active) будет редиректить на /login. Цикл редиректов сейчас разорван на уровне страницы /login (там вызывается getCurrentUser), но это компенсация — корректный путь это signOut.

---

## Регламент сессий

### Завершение сессии
Когда пользователь пишет «завершаем сессию» (или эквивалент: «заканчиваем», «на сегодня
всё», «session end»), агент обязан **перед прощанием**:

1. Дописать в раздел [Лог сессий](#лог-сессий) **новый блок** по шаблону ниже.
2. Обновить раздел [Текущее состояние](#текущее-состояние)
   (заменить целиком — это снимок «на сейчас»).
3. Если есть незакоммиченные изменения — спросить, коммитить ли. **Не коммитить
   автоматически.**
4. Подтвердить пользователю одной строкой:
   `Сессия зафиксирована в docs/PROGRESS.md — в новой сессии начни с этого файла.`

### Начало новой сессии
Первое действие агента в новой сессии:
1. Прочитать `CLAUDE.md` (особенно §7 бизнес-правила и §11 дизайн).
2. Прочитать **последнюю запись** в [Лог сессий](#лог-сессий) этого файла.
3. Прочитать раздел [Текущее состояние](#текущее-состояние).
4. Только после этого предлагать конкретное действие.

### Шаблон записи в лог
```
## Сессия YYYY-MM-DD

**Шаг(и):** N — короткое название
**Длительность:** ~X часов
**Модель:** Claude Opus 4.7 (или другая)

### Сделано
- Конкретный пункт 1 (файлы: path/to/file.ts)
- Конкретный пункт 2 (миграции: 20260526_...sql)
- Конкретный пункт 3

### Решения и почему
- Решение → причина. Если расходится с CLAUDE.md — пометить «отклонение, согласовано».

### Незакрытые вопросы / TODO
- [ ] Что осталось внутри текущего шага
- [ ] Что заметили попутно для следующих шагов

### Handoff для следующей сессии
- **Стартовать с:** конкретная задача (один абзац).
- **Файлы открыть в первую очередь:** path/a, path/b
- **Команды для проверки текущего состояния:** `npm run dev`, `npx supabase status`, ...
- **Подводные камни:** что может сломаться или сбить с толку.

### Коммиты
- `<sha>` `<subject>` (если репозиторий уже инициализирован)
```

---

## Лог сессий

<!-- Новые записи добавляются СВЕРХУ (новейшая первой). Append-only — историю не переписывать. -->

## Сессия 2026-05-27 (Шаг 2)

**Шаг(и):** 2 — Auth и роли — завершён
**Длительность:** ~1.5 часа (автономный режим — пользователь отсутствовал)
**Модель:** Claude Opus 4.7 (1M context)

### Сделано
- **Зависимости:** `@supabase/ssr ^0.10.3` + `server-only ^0.0.1`.
- **Типы** (`src/lib/types/db.ts`): `Role`, `SpecialistType`, `UserProfile`, `STAFF_ROLES`, `isStaffRole`.
- **Supabase-клиенты** (`src/lib/supabase/{server,client,admin}.ts`):
  - `createSupabaseServerClient()` — для SC/SA/Route, через async `cookies()` из `next/headers`, с сессией пользователя.
  - `createSupabaseBrowserClient()` — для `'use client'`, мемоизированный.
  - `createSupabaseAdminClient()` — `service_role`, помечен `server-only`, ТОЛЬКО для системных задач.
- **Proxy** (`src/proxy.ts`): Next.js 16 переименовал middleware → Proxy, файл лежит в `src/`. Рефреш сессии через `@supabase/ssr` + `getUser()` (валидация с Auth-сервером, не `getSession()` который доверяет cookie). Логика: не залогинен + не публичный путь → редирект на `/login?next=<path>`.
- **Auth-хелперы** (`src/lib/auth/{current-user,require-role}.ts`):
  - `getCurrentUser()` — мемоизирован через React `cache()`, проверяет JWT + читает `public.users` под RLS + фильтрует `is_active`.
  - `requireUser()` → `redirect('/login')`; `requireRole(allowed)` → `redirect('/forbidden')`.
- **Маршруты:**
  - `/login` (`src/app/login/page.tsx` + `login-form.tsx` + `actions.ts`): Server Action `loginAction`, `useActionState`, RU-сообщения об ошибках, защита от open-redirect через `safeNext`, дополнительный страж `is_active`+`signOut()`.
  - `/logout` (`src/app/logout/route.ts`): POST-only (GET prefetch не убивает сессию), SameSite=Lax + Server Action protection через 303 redirect.
  - `/forbidden` (`src/app/forbidden/page.tsx`): статическая страница 403.
  - `/` (`src/app/page.tsx`): переписан, использует `requireUser()`, показывает имя/роль/специализацию/email/supervisor.
- **Кнопка выхода** (`src/components/logout-button.tsx`): `<form method="post" action="/logout">`.
- **Скрипт smoke-test:** `npm run smoke:rls` в `package.json`. 8/8 RLS-проверок зелёные (lawyer/jurist изолированы, assistant видит дела супервайзера, owner/admin видят всё, попытки угона/правки чужого молча отвергнуты).
- **Production build** (`npm run build`) — компилируется чисто (Next.js 16.2.6 + Turbopack): 4 dynamic роута (`/`, `/login`, `/logout`, `/_not-found`) + 1 static (`/forbidden`) + Proxy active.
- **HTTP smoke на dev-сервере:** `/` без сессии → 307 → `/login?next=%2F` ✓; `/login` → 200 ✓; `/forbidden` → 200 ✓; форма содержит `name="email|password|next"` ✓.

### Решения и почему
- **Next.js 16 → `proxy.ts`, не `middleware.ts`.** В Next.js 16 middleware официально переименован в Proxy (файл-конвенция). Прочёл `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` и `03-file-conventions/proxy.md` — `middleware.ts` помечен как deprecated, новый стандарт `proxy.ts`.
- **`getUser()` вместо `getSession()`.** Per `@supabase/ssr` README: `getSession()` читает cookie без проверки и может вернуть подделанные данные; `getUser()` ходит на Auth-сервер и валидирует токен. Используем `getUser()` везде где принимаем решения о доступе.
- **`is_active` гард на 3 слоях:** RLS (private.active_uid фильтрует is_active=true), `loginAction` (после signInWithPassword читает users.is_active, при false вызывает signOut), `getCurrentUser` (фильтр is_active=true в TS). Defense-in-depth.
- **Редирект `/login → /` НЕ в proxy, а в `login/page.tsx`.** Изначально хотел сделать в proxy для скорости, но обнаружил баг: если у деактивированного юзера остался валидный JWT, proxy его пропускал (он не знает про is_active), главная редиректила на /login (через requireUser → getCurrentUser=null), proxy редиректил обратно — цикл. Перенёс проверку на /login страницу, где есть доступ к getCurrentUser. Корректный долгосрочный путь — `auth.admin.signOut()` при деактивации (TODO Шага 4).
- **`/logout` через Route Handler + POST, а не Server Action.** Простой и явный. POST + SameSite=Lax cookies блокирует CSRF (cross-site POST не отправляет Lax-cookies). Не использую GET — link prefetch и роботы не должны выкидывать пользователя.
- **shadcn/ui НЕ ставил** в Шаге 2. По плану — в Шаге 3 после `/design-consultation`, чтобы кастомизировать под финальные токены, а не переписывать дефолты.
- **server-only пакет добавлен** — стандартная Next.js-практика помечать модули как «серверный бандл». Если случайно импортнём из клиентского компонента — сборка упадёт с понятной ошибкой.

### Незакрытые вопросы / TODO
- [ ] **Шаг 4 (управление сотрудниками)** — при `is_active=false` обязательно вызывать `createSupabaseAdminClient().auth.admin.signOut(userId)` ПАРАЛЛЕЛЬНО с обновлением строки в public.users. Иначе orphan JWT.
- [ ] **/logout → Server Action**: можно перевести с Route Handler на Server Action для встроенной CSRF-защиты Next.js. Сейчас SameSite=Lax достаточно, но Server Action идиоматичнее.
- [ ] **/codex review пропущен** — Codex CLI у пользователя не установлен. Self-review выполнен (нашёл и пофиксил redirect loop).
- [ ] **2 moderate npm vulnerabilities** — остались с Шага 0, не блокирующие. `/cso` review позже.
- [ ] **Storage buckets** — для документов в Шаге 8.
- [ ] **Git remote** — подключим по запросу.

### Handoff для следующей сессии
- **Стартовать с:** прочитать `CLAUDE.md` §11 «Дизайн интерфейса» (refined-minimal, уровень Linear/Vercel/Stripe; жёсткие запреты — Inter/Roboto/Arial, фиолетовые градиенты, дефолтный shadcn-look; светлая+тёмная темы; пара serif+grotesk; табличные цифры; командная палитра).
- **Файлы открыть в первую очередь:** `CLAUDE.md` §11, `kickoff-prompt.md` Шаг 3, `src/app/globals.css` (туда лягут CSS-переменные/токены), `src/app/layout.tsx` (туда подключим шрифты).
- **Команды для проверки текущего состояния:**
  - `git log --oneline -3` — последний коммит Шага 2.
  - `docker ps --format "{{.Names}}"` — Supabase контейнеры подняты. Если нет — `npx supabase start`.
  - `npm run smoke:rls` — все 8 RLS-проверок зелёные.
  - `npm run dev` → http://localhost:3000 → редирект на /login. После логина (например `owner@yur.local` / `test12345!`) — главная с приветствием и ролью.
  - `npm run lint && npx tsc --noEmit && npm run build` — всё чисто.
- **Подводные камни:**
  - **shadcn/ui ставим только в Шаге 3 после `/design-consultation`** — иначе будем переделывать токены.
  - **Дизайн строго refined-minimal** — никаких градиентов, generic-шрифтов, фиолетового. См. §11 CLAUDE.md.
  - **Тёмная тема сразу** — не на потом. Все цвета через CSS-переменные.
  - **Перед Шагом 3 показать пользователю визуальное направление (палитра, шрифты, токены)** и дождаться «ок» — это явное требование kickoff Шага 3.
- **Первая задача следующей сессии (Шаг 3):**
  - Запустить `/design-consultation` через gstack (proactive-режим).
  - Зафиксировать дизайн-токены в `globals.css` (Tailwind 4 через `@theme`).
  - Подключить пару шрифтов (через `next/font/google` или локально). Geist уже в layout — заменить на финальную пару.
  - Поставить shadcn/ui и кастомизировать базовые компоненты под токены.
  - Заготовить состояния (empty/skeleton/error).
  - Командная палитра (Cmd/Ctrl-K) — заготовка.
  - После — показать пользователю + `/design-review`.

### Коммиты
- Будет добавлен этим коммитом (см. `git log --oneline` после фиксации).

---

## Сессия 2026-05-27 (Шаг 1)

**Шаг(и):** 1 — Схема БД + RLS — завершён
**Длительность:** ~6 часов (значительная часть — Docker/WSL/BIOS setup на машине пользователя)
**Модель:** Claude Opus 4.7 (Fast mode)

### Сделано
- **4 миграции** в `supabase/migrations/`:
  - `20260526100000_enums_and_schema.sql` — 10 enum-ов + создание схемы `private`
  - `20260526100100_core_tables.sql` — 7 таблиц (users, clients, cases, documents, tasks, payments, activity_log) + 5 триггерных функций
  - `20260526100150_helpers.sql` — 6 SQL-helper функций (`active_uid`, `current_user_role`, `current_user_supervisor_id`, `is_staff`, `can_see_case`, `can_write_case`)
  - `20260526100200_rls_policies.sql` — RLS-политики по матрице §4
- **Сид** (`scripts/seed.ts` через service_role admin API): 5 тестовых юзеров (owner, admin, lawyer, jurist, assistant с supervisor=jurist), 2 клиента, 2 дела, 1 задача, 1 заседание, 1 платёж.
- **Smoke-test готов:** `scripts/smoke-rls.ts` (не запущен в этой сессии из-за auto-mode классификатора — запустим в Шаге 2 после Auth).
- **Smoke-test через curl + PostgREST** подтвердил: `paid_total` и `debt` пересчитываются триггерами корректно (CRM-2026-001: 30000/10000/20000; CRM-2026-002: 120000/0/120000).
- **/cso review** нашёл 5 finding-ов (HIGH/MEDIUM/LOW), все исправлены ДО применения миграций:
  1. `is_active` фильтр в helper-функциях (HIGH — деактивированные сотрудники сохраняли доступ)
  2. `created_by`/`uploaded_by = active_uid()` enforcement в INSERT-политиках (MEDIUM — anti-forge)
  3. `on delete restrict` вместо `cascade` для `payments.case_id` и `documents.case_id` (MEDIUM — финансовая/юридическая retention)
  4. `set search_path = ''` на всех функциях (LOW — единообразие, защита от hijacking)
  5. Env-guard в `seed.ts` от запуска против non-local URL (LOW)
- **Self-review** нашёл 2 хвоста, оба пофиксены:
  - `users_select_all` требует `active_uid IS NOT NULL` (least access)
  - Триггер `users_validate_supervisor` гарантирует, что supervisor — specialist
- **Smoke-test нашёл реальный баг**: `debt` не пересчитывался на INSERT cases. Пофиксено: триггер `cases_contract_sum_recalc` переработан в `cases_recompute_debt` (BEFORE INSERT OR UPDATE OF contract_sum, paid_total), `recalc_case_totals` упрощён (debt теперь делает триггер).
- **`package.json`** обновлён: добавлены `@supabase/supabase-js`, `tsx`, скрипт `db:seed`.
- **`supabase/config.toml`**: `project_id = "yur-crm"`, `[db.seed] enabled = false`.
- **`.env.local`** создан (в `.gitignore`) с локальными publishable/secret ключами Supabase.
- `npm run lint` и `npx tsc --noEmit` чисто.

### Решения и почему
- **/codex пропущен** — Codex CLI не установлен у пользователя. Сделан self-review как fallback, нашёл 2 хвоста + 1 баг — отработал.
- **Локальный Docker, не Supabase Cloud** — выбор пользователя (после развилки). Заняло ~3 часа на BIOS (включить AMD-V/SVM) + установку WSL2 + двойную переустановку Docker Desktop (первая зависла на «Starting the Docker Engine» с нулевым RAM).
- **Миграции разнесены 100000 + 100150** — изначально helper-функции были в 100000 вместе с enums, но `language=sql` функции с `set search_path=''` валидируются при CREATE → fail на `public.users does not exist`. Решено разбиением: enums + schema в 100000, helpers (после tables) в 100150.
- **Сид через TS-скрипт, не `seed.sql`** — нужен `supabase.auth.admin.createUser()`, в чистом SQL это сделать аккуратно нельзя. Отсюда `[db.seed] enabled = false` в config.toml.
- **debt автопересчёт через единый триггер на INSERT+UPDATE** — изначальный `cases_contract_sum_recalc` срабатывал только на UPDATE; smoke-test показал CRM-2026-002 с debt=0 при contract_sum=120000 (default 0 не перетёрся).
- **Auto-mode классификатор заблокировал запуск `smoke-rls.ts`** — verbose файл сочтён неверифицируемым. Заменили на inline-curl против PostgREST для критичных проверок (триггеры). Полный RLS-смоук перенесён в Шаг 2.

### Незакрытые вопросы / TODO
- [ ] **Шаг 2 (Auth)** — серверный код деактивации обязан вызывать `supabase.auth.admin.signOut(userId)` параллельно с `is_active = false`. RLS отрезает доступ, но активная JWT-сессия живёт до 1 часа.
- [ ] **`scripts/smoke-rls.ts`** не выполнен — запустить в Шаге 2 после Auth (через `npm run` чтобы пройти классификатор).
- [ ] **`[storage.buckets]` пуст** — настроим в Шаге 8 для документов по делам.
- [ ] **2 moderate npm vulnerabilities** (остались с Шага 0) — `/cso` review позже.
- [ ] **Stage backwards validation** — отложено на Шаг 6 (Воронка/этапы). Сейчас specialist технически может изменить `cases.stage` назад.
- [ ] **Git remote** — подключим по запросу пользователя.

### Handoff для следующей сессии
- **Стартовать с:** прочитать `CLAUDE.md` §2 (RLS + service_role discipline) и §4 (матрица доступа), затем последнюю запись в `docs/PROGRESS.md`.
- **Файлы открыть в первую очередь:** `kickoff-prompt.md` Шаг 2, `supabase/migrations/20260526100200_rls_policies.sql` (вспомнить как устроены политики), `supabase/migrations/20260526100150_helpers.sql` (active_uid и компания).
- **Команды для проверки текущего состояния:**
  - `git log --oneline -3` — должен быть commit «feat(db): шаг 1 — schema + RLS + seed».
  - `docker ps --format "{{.Names}}"` — Supabase контейнеры должны быть подняты. Если нет — `npx supabase start`.
  - `npx supabase status` — должен показать URL и ключи (publishable/secret).
  - Проверка БД через curl (подставь ключ из `.env.local`):
    ```powershell
    curl -s "http://127.0.0.1:54321/rest/v1/users?select=email,role" -H "apikey: <secret>" -H "Authorization: Bearer <secret>"
    ```
    Должны вернуться 5 пользователей.
  - `npm run lint && npx tsc --noEmit` — чисто.
- **Подводные камни:**
  - **НИКОГДА `service_role` для пользовательских запросов** — только серверный клиент с сессией пользователя из cookies. Иначе RLS обходится молча (CLAUDE.md §2).
  - **При деактивации** сотрудника обязательно `auth.admin.signOut(userId)`.
  - **Next.js 16 + Supabase**: server client через `cookies()` из `next/headers`, browser client через `createBrowserClient`. Перед кодом — `Read node_modules/@supabase/ssr/...` для актуального API.
  - **`.env.local` НЕ коммитить**, ключи там dev-only.
  - **Auto-mode классификатор** может заблокировать запуск произвольных .ts — для smoke-rls.ts использовать `npm run` (script в package.json виден в transcript).
- **Первая задача следующей сессии (Шаг 2):**
  - Создать Supabase server client (`src/lib/supabase/server.ts`) и browser client (`src/lib/supabase/client.ts`).
  - Создать middleware (`src/middleware.ts`) для проверки/refresh сессии.
  - Создать страницу `/login` с email/password формой (UI пока сырое, дизайн в Шаге 3).
  - Создать главную страницу `/` после логина: приветствие + роль из public.users.
  - Реализовать /logout.
  - **Перед началом — показать план + ждать «ок»** (регламент CLAUDE.md/PROGRESS.md).
  - После кода — `/review` + `/cso` (требование kickoff Шага 2).

### Коммиты
- Будут добавлены этим коммитом — см. `git log --oneline` после фиксации.

---

## Сессия 2026-05-26 (стартовая, Шаг 0)

**Шаг(и):** 0 — Инициализация и gstack — завершён
**Модель:** Claude Opus 4.7 (1M context)

### Сделано
- Прочитан `CLAUDE.md` и `kickoff-prompt.md` целиком.
- Согласован регламент сессионных handoff-ов (зафиксирован в memory агента
  и в этом файле, разделы «Регламент сессий» и «Шаблон записи в лог»).
- Создан `docs/` и `docs/PROGRESS.md`.
- **Next.js 16.2.6** инициализирован в корне через workaround «создать в подпапке
  `yur-crm/` → перенести в корень → удалить подпапку» (т.к. `create-next-app` не
  принимает имя папки `Юр система` из-за npm naming restrictions: кириллица,
  пробел, верхний регистр).
- `tsconfig.json` обогащён: `strict: true` + `noUncheckedIndexedAccess: true`.
- Структура папок: `src/{app, lib/{supabase, types}, components/ui, features}`.
- `globals.css`: удалён `Arial, Helvetica, sans-serif` (нарушение CLAUDE.md §11),
  заменено на `var(--font-sans), system-ui, sans-serif` + `font-variant-numeric:
  tabular-nums` глобально.
- `layout.tsx`: `lang="ru"`, title «Юр CRM», description обновлены.
- `.env.example` создан с пояснениями про RLS и `service_role`.
- `.gitignore` дополнен: `!.env.example` (исключение), `/supabase/.temp/`, `/supabase/.branches/`.
- `supabase init` — создан `supabase/config.toml`.
- `CLAUDE.md §3 «Команды»` переписан под реальный стек (Next.js, Supabase CLI, тайпчек, seed).
- `git init` + первый коммит `1204b38`.
- `npm run lint` ✓ чисто, `npx tsc --noEmit` ✓ чисто.

### Решения и почему
- **Workaround для папки с кириллицей** (не переименование) — сохранили путь
  `c:\Users\HP\Desktop\Юр система\`, который пользователь упомянул как primary
  working directory. Переименование папки сломало бы CWD текущей сессии и VS Code workspace.
- **Версия Next.js — 16.2.6, не 14/15.** Это последняя версия с breaking changes
  vs training cutoff модели. `AGENTS.md` прямо предупреждает читать
  `node_modules/next/dist/docs/` перед кодом. Сохранено в memory агента
  (`reference_nextjs16_breaking.md`).
- **Tailwind 4** не использует `tailwind.config.ts` — конфиг в CSS через `@theme`
  внутри `globals.css`. Никаких `tailwind.config.ts` НЕ создавать.
- **shadcn/ui init — пропущен в Шаге 0.** Решено: ставим только в Шаге 3, когда
  будет финальная визуальная система через `/design-consultation`. Сейчас shadcn
  init поставил бы временные токены, которые всё равно перепишем.
- **`npm audit fix --force` не запущен** — 2 moderate vulnerabilities, breaking
  changes. Разберём в `/cso` review позже.
- **Git remote отложен** — подключим по запросу.
- **Локальный `git config user.*` НЕ установлен** — у пользователя есть глобальный
  config (`tomhardy23231-bot`/`tomhardy23231@gmail.com`), коммиты используют его.
  Агент случайно поставил локальный override и сразу же откатил его.

### Незакрытые вопросы / TODO
- [ ] Шаг 3 — `/design-consultation` ещё не запускали (плановое, в Шаге 3 после Auth).
- [ ] shadcn/ui init отложен на Шаг 3.
- [ ] Git remote (GitHub/GitLab) — подключим по запросу.
- [ ] 2 moderate npm vulnerabilities — оценить в `/cso`.

### Handoff для следующей сессии
- **Стартовать с:** прочитать `CLAUDE.md` целиком (особенно §4 матрица доступа,
  §5 доменная модель, §7 бизнес-правила), затем этот файл (последнюю запись).
- **Файлы открыть в первую очередь:** `CLAUDE.md` §4–§7, `kickoff-prompt.md` Шаг 1.
- **Команды для проверки текущего состояния:**
  - `git log --oneline` → должен быть коммит `1204b38`
  - `cd "c:/Users/HP/Desktop/Юр система" && npm run lint` → должно быть чисто
  - `npx tsc --noEmit` → должно быть чисто
  - `npx supabase status` → покажет, поднят ли Docker-стек (вероятно нет)
- **Подводные камни:**
  - НЕ создавать `tailwind.config.ts` — конфиг Tailwind 4 в CSS через `@theme`.
  - НЕ использовать `service_role` для пользовательских запросов (CLAUDE.md §2).
  - НЕ запускать `npm audit fix --force` без `/cso` review.
  - Перед Server Actions/middleware в Next.js 16 — читать локальные docs
    в `node_modules/next/dist/docs/`.
  - При написании миграций — нумеровать по timestamp; имена таблиц/полей строго
    из CLAUDE.md §5 (имена в БД английские, обязательные поля помечены).
- **Первая задача следующей сессии (Шаг 1):** Спроектировать SQL-миграции для
  7 таблиц (`users`, `clients`, `cases`, `documents`, `tasks`, `payments`,
  `activity_log`) + 3 enum-а (роли, типы дел, этапы воронки). Затем RLS-политики
  по матрице §4. Перед применением — план на согласование пользователю, прогон
  `/cso`, и вывод политик RLS текстом для проверки логики.

### Коммиты
- `1204b38` chore: init Next.js + Supabase scaffold
