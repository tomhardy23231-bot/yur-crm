# CLAUDE.md

> Это файл-память проекта для Claude Code. Здесь зафиксированы стек, доменная модель,
> роли, правила доступа и бизнес-правила. Читай его перед началом любой задачи.
> Если требование расходится с этим файлом — сначала уточни у меня, не додумывай.

---

## 1. О проекте

CRM-система для юридической компании.

Центральная сущность — **«Дело»** (оно же договор; отдельной сущности «договор» НЕТ).
Вокруг дела собираются: клиент, документы, задачи и сроки, команда и финансы.

Система состоит из:
- **внутреннего интерфейса** для сотрудников (основное);
- **клиентского портала** (позже, Phase 3) — клиент видит статус своего дела и документы.

Язык интерфейса — **русский**. Идентификаторы в коде и БД — **английские**, с понятными именами.

---

## 2. Технологический стек

| Слой | Выбор |
|---|---|
| Frontend + backend | **Next.js (App Router) + TypeScript** |
| БД / Auth / Storage | **Supabase** (PostgreSQL + Auth + Storage + Row Level Security) |
| Доступ к данным | `supabase-js` на сервере, **с сессией пользователя** (чтобы работал RLS) |
| Схема и миграции | SQL-миграции через **Supabase CLI** (`supabase/migrations`) |
| UI | **Tailwind CSS + shadcn/ui** |
| Хранение файлов по делам | **Supabase Storage** (приватный бакет) |
| Деплой | Vercel (или любой Node-хостинг) |

**Почему так.** RLS в Postgres напрямую ложится на нашу модель доступа («специалист
видит только свои дела»): правило проверяется в самой базе, а не только в коде —
это надёжнее и безопаснее. Один Next.js-проект закрывает и внутренний интерфейс,
и будущий клиентский портал через ролевые маршруты.

**Важно про RLS (легко сломать):** запросы к данным от лица пользователя должны идти
через клиент Supabase **с его JWT/сессией**, иначе RLS не сработает. `service_role`
(ключ в обход RLS) использовать только для системных задач (миграции, сидинг,
фоновые операции) — никогда для обычных пользовательских запросов.

**Стек можно поменять.** При смене правится только этот раздел и раздел «Команды»;
доменная модель и бизнес-правила (разделы 4–8) не меняются.

---

## 3. Команды

Корень проекта: `c:\Users\HP\Desktop\Юр система\`. Используется **npm** (не bun/yarn/pnpm).

### Next.js
```bash
npm install            # установить зависимости (или после правок package.json)
npm run dev            # локальная разработка (next dev, Turbopack по умолчанию)
npm run build          # production-сборка
npm start              # запуск production-сборки локально
npm run lint           # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit       # тайпчек без сборки
```

### Supabase (локально, через Docker)
```bash
npx supabase start            # поднять локальный стек (Postgres + Auth + Storage + Studio)
npx supabase stop             # остановить
npx supabase status           # URL и ключи локального стека → копировать в .env.local
npx supabase db reset         # пересоздать БД из миграций + seed.sql
npx supabase migration new <name>   # создать новый файл миграции
npx supabase db push          # применить миграции на удалённый Supabase (когда подключим)
```

Studio (веб-интерфейс БД) после `supabase start` доступен на `http://127.0.0.1:54323`.

### Seed (тестовые данные)
```bash
npm run db:seed   # появится в Шаге 1; использует SUPABASE_SERVICE_ROLE_KEY
```

### Окружение
- Скопировать `.env.example` → `.env.local`
- Подставить значения из вывода `npx supabase status`
- `.env*` в `.gitignore`, исключение — `.env.example`

---

## 4. Роли и доступ

Пять ролей (`users.role`): `owner`, `admin`, `office_manager`, `lawyer`, `expert`.
(Новая Концепция_CRM. Роли `specialist`/`assistant`, поле `specialist_type` и
`supervisor_id` удалены.)

- **owner** (владелец / супер-админ) — полный доступ ко всему: системные настройки
  (в т. ч. ставки зарплаты), управление пользователями и правами, все дела и финансы.
- **admin** (руководитель подразделения, контроль) — управляет пользователями и их
  правами. Видит дела и финансы **своего подразделения** (`visibility_scope='department'`,
  по умолчанию); owner может выставить ему `visibility_scope='all'` (вся компания).
  **НЕ** трогает системные настройки. (v2 Этап 2: до раскидывания людей по
  подразделениям `department_id IS NULL` = видит всё — переходное правило.)
- **office_manager** (офис-менеджер / секретарь) — заводит клиентов и дела, прикрепляет
  договоры, следит за порядком. Видит дела и финансы **своего подразделения** (как admin:
  `visibility_scope`, owner может расширить до `all`). **НЕ** управляет пользователями и
  системными настройками; не удаляет записи и не правит платежи.
- **lawyer** (юрист — продажник) — заключает договор, вносит платежи и контролирует
  доплаты/сроки. Видит **только дела, где он `cases.lawyer_id`** (которые «продал»).
- **expert** (Експерт — адвокат/юрист, исполнитель) — исполняет договор, ведёт дело,
  загружает акт. Видит **только дела, где он `cases.responsible_id`**.

> Внешний партнёр (по ответу клиента) — при необходимости получает учётку с широким
> доступом; отдельная роль для него в Phase 1 не вводится.

### Матрица доступа

| Действие | owner | admin | office_manager | lawyer | expert |
|---|---|---|---|---|---|
| Все дела | ✅ | 🏢 своё подразделение¹ | 🏢 своё подразделение¹ | ❌ (свои по `lawyer_id`) | ❌ (свои по `responsible_id`) |
| Финансы / ЗП | ✅ | 🏢 своё подразделение¹ | 🏢 своё подразделение¹ | по своим | по своим |
| Создание дел/клиентов | ✅ | ✅ | ✅ | клиентов — да | клиентов — да |
| Удаление дел/клиентов/документов, правка платежей | ✅ | ✅ | ❌ | ❌ | ❌ |
| Управление пользователями/ролями | ✅ | ✅ | ❌ | ❌ | ❌ |
| Системные настройки (ставки зарплаты) | ✅ | ❌ | ❌ | ❌ | ❌ |

> ¹ **Скоуп по подразделению (v2 Этап 2).** admin/office_manager видят дела/финансы
> подразделений, к которым относится дело (по `department_id` его юриста ИЛИ Експерта),
> т.е. дело видят оба руководителя. owner может выставить сотруднику
> `visibility_scope='all'` → вся компания. `department_id IS NULL` (до раскидывания) =
> тоже вся компания (переходное правило). Создание/удаление/управление НЕ скоупится по
> подразделению в Этапе 2 (запись admin'а по подразделению — Этап 4).

**Правила RLS (для cases и связанных таблиц) — v2 Этап 2:**
- `is_owner()` = `owner` → всё, всегда (режим бога); системные настройки (`payroll_rates`);
- видимость дела = `private.case_visible(lawyer_id, responsible_id)` — ЕДИНЫЙ предикат:
  видит-всё компании ИЛИ ты юрист/Експерт дела ИЛИ ты руководитель (право
  `view_all_cases`) и подразделение юриста ЛИБО Експерта = твоё (`current_user_department`);
- «видит-всё компании» = `private.can_see_all_cases()` = owner ИЛИ (`view_all_cases` И
  `scope_is_all`), где `scope_is_all` — **только** для admin/office_manager:
  `visibility_scope='all'` ИЛИ `department_id IS NULL` (гейт по роли — иначе выдача
  `view_all_cases` юристу эскалировала бы его до всей компании);
- `lawyer` → `cases.lawyer_id = auth.uid()`; `expert` → `cases.responsible_id = auth.uid()`
  (всегда только свои, scope на них не влияет);
- финансы/ЗП по подразделению — `private.payroll_user_visible(user_id)` (тот же скоуп);
- `can_manage_users()` = `owner`/`admin` → управление users + деструктив (DELETE,
  правка платежей) — **НЕ** скоупится по подразделению (Этап 2 — про видимость данных);
- документы/задачи/платежи/комментарии/storage/лог дела наследуют доступ от своего дела
  (`can_see_case` → `case_visible`); клиенты — `can_see_client`; журнал по пользователям —
  по праву `manage_users`;
- **касса (v2 Этап 7)** — `cash_accounts`/`cash_entries` целиком по праву
  `private.can('can_manage_cash')` (НЕ по подразделению; owner имеет по дефолту роли).
  `can_manage_cash` — 12-е настраиваемое право в системе `perm_overrides`; дефолт —
  только owner, **выдаёт его тоже только owner** (`can_grant_cap`, owner-only ветка,
  как `edit_payroll_rates`). Авто-приход от платежей создаётся SECURITY DEFINER-триггером
  в обход RLS кассы (платёж вносит юрист/Експерт без этого права).

---

## 5. Доменная модель

> Имена таблиц/полей — английские. Глоссы в скобках — для понимания домена.

**users** — сотрудники
`id, full_name, email, role (owner|admin|office_manager|lawyer|expert), is_active,
department_id (→ departments, NULL = вне структуры; для admin/office_manager NULL =
переходное «видит всё»), position (должность, свободный текст — на права НЕ влияет,
права задаёт role), visibility_scope (department|all — для admin/office_manager,
действует в RLS с Этапа 2 v2: department = только своё подразделение, all = вся
компания; выставляет только owner, БД-гард `users_guard_visibility_fields`),
salary_mode (percent|fixed|fixed_percent, v2 Этап 4; default percent),
salary_fixed_amount (оклад ₴/мес для fixed/fixed_percent, иначе NULL; check
консистентности), created_at`
— **salary_*** (v2 Этап 4): режим оплаты труда сотрудника. `percent` — % от оплат
(текущая модель); `fixed` — фиксированный оклад/мес, процентная часть зануляется;
`fixed_percent` — оклад + процент. Меняет owner (любому) либо admin своего
подразделения (НЕ себе, только роли office_manager/lawyer/expert; admin без
подразделения — никому). БД-гард `users_guard_salary_fields` + право
`private.can_manage_user_salary`. **Приватность:** колонки `salary_*` защищены
column-level привилегиями (revoke табличного SELECT + grant безопасного списка),
читаются ТОЛЬКО через SECURITY DEFINER-функции (`payroll_employee_summary`,
`manage_user_salaries` и пр.) под `payroll_user_visible`. ⚠ Новые колонки `users`
в будущих миграциях добавлять в этот grant.

**departments** (подразделения/филиалы) — v2, Этап 1
`id, name (unique), is_active, created_at`
— 10 штук засеяны миграцией (Київський, Дніпровський, Львівський, Одеський +
«Підрозділ 5…10», переименуют позже). Читают все активные сотрудники, создаёт/правит
только owner. Дело «принадлежит» подразделениям юриста И Експерта одновременно
(его видят оба руководителя); скоуп видимости по подразделениям **включён** в Этапе 2
через `private.case_visible` / `payroll_user_visible` (см. §4 и docs/PLAN-V2.md).

**clients** (доверители)
`id, name, client_kind (individual|company|entrepreneur), phone, email, address,
source (website|referral|advertising|repeat|other, опц.), notes,
last_name/first_name/middle_name/birth_date/inn/contract_number (опц.; физлицо/ФОП),
created_by, created_at`
— у одного клиента может быть несколько дел. `source` — откуда пришёл клиент (Концепция,
раздел 7). `inn` — РНОКПП (физлицо/ФОП) или ЄДРПОУ (компания), 8–12 цифр; используется
как идентификатор ЗАМОВНИКА в печатной форме акта (v2 Этап 5 — отдельный `tax_id` НЕ
вводился).

**cases** (дела; оно же договор — центральная сущность)
`id, number_title (обязат.), client_id (обязат.),
lawyer_id (обязат., юрист-продажник — заключил договор),
responsible_id (обязат., Експерт-исполнитель),
opened_at (обязат.), case_type (обязат.: civil|criminal|corporate|...),
category (обязат.: document|claim|representation — основа расчёта зарплаты),
subject (опц., краткий предмет договора), stage (обязат., см. §6),
priority (normal|urgent), tags (text[]),
contract_sum, paid_total, debt, billing_types (text[]: prepaid|installments|fixed|success_fee),
opponent, court_case_number, court, closed_at, created_at,
outcome (won|lost|NULL — исход дела, v3 Сессия 7), lost_reason (опц. текст «не заключили»),
updated_at (timestamptz — optimistic locking, v3 Сессия 4)`
— обязательные поля помечены; остальные опциональны (суд — только если дошло до суда и т.д.).
— **outcome/lost_reason (v3 Сессия 7):** «не заключили» (`outcome='lost'`) ставит RPC
`close_case_lost` с этапов new_request/consultation (см. §7-2); `won`/NULL — обычный ход.
**updated_at (v3 Сессия 4):** версия строки — форма шлёт `base_updated_at`, при расхождении
правка отклоняется («дело изменено другим пользователем»); touch-триггер `cases_touch_updated_at`.

**documents**
`id, case_id, file_name, storage_key, doc_type (contract|claim|power_of_attorney|correspondence|act|other), uploaded_by, uploaded_at`
— `act` = акт приёма-передачи / скан подписанного «Рахунок-Акта». Скан подтверждения
оплаты акта (v2 Этап 5) создаётся как `documents(doc_type='act')` автоматически внутри
`confirm_act_paid` и привязывается к акту (`case_acts.scan_document_id`).

**tasks** (задачи и сроки)
`id, case_id, title, description, kind (task|hearing|deadline), assignee_id, created_by, due_at, status (open|done), created_at`
— юрист (продажник) и staff могут ставить задачи. Питает общий календарь.

**absences** (отпуска/отсутствия сотрудника) — v2 Этап 6
`id, user_id (→ users, on delete cascade), kind (vacation|sick|other, default vacation),
starts_on date, ends_on date (check ends_on ≥ starts_on), note (≤500), created_by
(→ users restrict), created_at`
— отпуск/больничный/иное отсутствие сотрудника на период. **Видимость — РОЛЕВАЯ, по
подразделению** (не по cap, в отличие от ЗП): читают — сам сотрудник, owner (всё),
admin/office_manager своего подразделения (либо `visibility_scope='all'` /
`department_id IS NULL` — переходное); вносят (INSERT) — сам, owner, admin своего
подразделения (office_manager **только читает**); удаляют — кто вправе писать ИЛИ автор
записи (сотрудник может снять свой отпуск). UPDATE-политики НЕТ (правка = удалить +
создать). Предикаты `private.absence_user_visible(user_id)` / `private.absence_can_write(user_id)`
(SECURITY DEFINER, зеркало в TS — `lib/absences/access.ts`). `activity_log` для отпусков
НЕ ведётся (не «по делам»). Показывается в карточке сотрудника (`/reports/payroll/[userId]`)
и в общем календаре (violet-маркер `--absence`, отличим от заседаний/дедлайнов).

**payments** (оплаты)
`id, case_id, amount, paid_at, method, note, created_by, act_id (опц. → case_acts)`
— `paid_total` и `debt` в case считаются из платежей и `contract_sum` (триггеры).
`act_id` (v2 Этап 5) — платёж, созданный подтверждением акта (один платёж на акт,
unique-индекс); при удалении такого платежа триггер `case_acts_revert_on_payment_delete`
возвращает акт в `issued` и пересчитывает completion дела.

**case_acts** (Рахунок-Акт — платёжный документ) — v2 Этап 5
`id, case_id, number (sequence — сквозная нумерация), service_name (default «Юридичні
послуги»), service_period (опц.), amount (>0 — «До оплати»), confirmed_amount (опц.,
прописанная при подтверждении), completion (full|partial), status (issued|paid),
issued_at, paid_at, scan_document_id (→ documents), note, created_by, created_at`
— цикл: **issued → paid**. Создаёт (issued) Експерт своего дела (`responsible_id`) или
staff с доступом; подтверждает оплату (issued→paid) **lawyer дела или owner/admin** (по
роли, НЕ office_manager) через SECURITY DEFINER `confirm_act_paid`: атомарно создаёт скан
(documents), платёж (`act_id`) и переводит акт в paid. `completion` считается накопительно
по оплаченным актам дела (Σ confirmed_amount по paid-актам в порядке `paid_at` ≥
`contract_sum` → `full`, иначе `partial`; источник правды —
`private.recompute_case_act_completions`); staff может переопределить вручную
(`set_act_completion`). RLS: SELECT наследует от дела (`can_see_case`); INSERT — Експерт
дела/staff; UPDATE-политики НЕТ (статус paid меняется только через DEFINER-RPC); DELETE —
только `issued`, owner/admin или автор. Печатная форма — XLSX по образцу
(`docs/samples/rahunok-akt-sample.xlsx`), маршрут `/cases/:id/acts/:actId/xlsx`.

**org_requisites** (реквизиты компании-исполнителя, ВИКОНАВЕЦЬ) — v2 Этап 5
`id (=1, single-row), org_name, edrpou, address, phone, iban, bank_name, mfo,
tax_status_lines (text[]), updated_at, updated_by`
— шапка/подвал печатной формы акта. Читают все активные сотрудники, правит только owner
(`/settings/requisites`, RLS `org_requisites_update_owner`). Засеяна реквизитами из
образца клиента (ОЛІМП).

**payroll_rates** (ставки зарплаты по категории дела) — Концепция
`category (document|claim|representation), lawyer_percent, expert_percent, updated_at`
— по умолчанию 7/10/25 (равны для юриста и Експерта; задаются раздельно — доработка
P1.2). Редактирует только `owner`. См. §7-4. На конкретном деле % переопределяется:
`cases.lawyer_rate_override` / `expert_rate_override` (NULL → ставка категории; менять
может только owner/admin, БД-триггер `cases_guard_rate_overrides` — доработка P1.1).
— **Режим зарплаты (v2 Этап 4)** живёт на сотруднике (`users.salary_mode`): процентная
механика выше применяется для режимов `percent`/`fixed_percent`, а для `fixed`
**зануляется** в отчётных функциях (`case_payroll`, `payroll_by_specialist`,
`payroll_employee_summary`, `payroll_employee_cases`) и в метриках дашборда
(`computePersonalEarnings` / `getDashboardAnalytics` через `getFixedSalaryUserIds`).
Оклад (`salary_fixed_amount`) показывается в `/reports/payroll` справочно за месяц и
**в накопленный остаток «К выплате» / выплаты v1 не входит**.

**payroll_ledger** (леджер начислений/выплат) — доработка P1.3
`id, case_id, user_id, role_in_case (lawyer|expert), base_amount, percent, amount,
status (accrued|paid), accrued_at, paid_at, created_by`
— фиксирует начисление как запись. Когда фиксируется — задаёт `cases.accrual_mode`
(`on_completion` при закрытии / `per_payment` по мере оплат — доработка P2.1). Синхрон
триггером `cases_sync_ledger`. Отметку «выплачено»/откат делает только owner/admin.
НЕ путать с `payments` (оплаты клиента). v2 Этап 4: леджер остаётся процентным и в
текущем UI не отображается (источник правды отчёта — `payroll_employee_summary`/`*_cases`).
Оклад (`salary_mode=fixed/fixed_percent`) в леджер НЕ пишем; интеграция режимов в леджер
отложена (Phase 2, если леджер вернут в UI).
— **v3 Сессия 12: ЗАМОРОЖЕН.** Триггер авто-синхронизации `cases_sync_ledger` снят
(миграция `v3_freeze_ledger`); мёртвый компонент `CaseLedgerBlock`, экшены
`mark/revertLedgerPaidAction` и query-функции `listLedger*`/`listPayroll*BySpecialist`
удалены из кода. Таблица и исторические данные сохранены — судьбу решит Phase 2.

**payroll_transactions** (ручные движения ЗП: выплаты и премии) — правка №1
`id, user_id (→ users restrict), kind (payout|bonus), amount (numeric(14,2) >0),
comment (опц.), occurred_on date (default current_date), created_by, created_at`
— **ИСТОЧНИК ПРАВДЫ отчёта ЗП** (через `payroll_employee_summary`): payout — выплата
сотруднику (с разбивкой по делам в `payout_allocations`), bonus — премия. Создаёт/удаляет
только owner/admin (RLS + RPC `create_payout`/`create_bonus` дублируют проверку).

**payout_allocations** (распределение выплаты по делам×роли) — правка №1
`id, transaction_id (→ payroll_transactions cascade), case_id (→ cases restrict),
role_in_case (lawyer|expert), amount (numeric(14,2) >0)`
— строки выплаты payout по конкретным делам. **Σ аллокаций транзакции = её amount**
(constraint-триггер `check_payout_allocations`, DEFERRABLE — v3 Сессия 2); uniq
(transaction_id, case_id, role_in_case); `create_payout` проверяет принадлежность дела
сотруднику по роли (v3 Сессия 2). RLS: staff — все, сотрудник — свои.

**cash_accounts** (счета кассы) — v2 Этап 7
`id, name, kind (card|bank|cash, default bank), opening_balance numeric(14,2) (default 0),
opening_date date, is_active bool (default true), is_default bool (default false,
partial-unique: ≤1 на компанию), created_by, created_at`
— счета кассы (Карта/Рахунок/Готівка + добавляемые). `kind` задаёт маппинг
`payments.method`→счёт автоприхода; `is_default` — фолбэк, когда метод не лёг ни на один
kind. Засеяны 3 счёта в `scripts/seed.ts` (не миграцией — начальные остатки реальны,
зависят от компании). Доступ — право `can_manage_cash` (см. ниже).

**cash_entries** (журнал операций кассы) — v2 Этап 7
`id, account_id (→ cash_accounts, on delete restrict), entry_date date,
direction (in|out), amount numeric(14,2) (>0), description (≤300, not null),
case_id (→ cases, set null, опц.), payment_id (→ payments, on delete cascade, опц.,
unique), created_by (→ users restrict), created_at`
— приход/расход за день, свободное описание (аренда/налоги/реклама — НЕ привязаны к делам).
**Авто-приход:** платёж по делу автоматически создаёт `cash_entries(direction='in')` на
счёт (триггер `cash_sync_on_payment` на `payments`, SECURITY DEFINER): счёт выбирается
`private.cash_resolve_account(method)` (kind по методу: card/bank/cash, `'act'`→bank;
фолбэк — дефолтный счёт; нет касс → **операция пропускается, триггер не падает**). Удаление
платежа снимает строку (FK cascade); правка платежа пересоздаёт её. Авто-строки
(`payment_id IS NULL=false`) пользователю на UPDATE/DELETE не отдаются (правятся через сам
платёж); ручные (`payment_id IS NULL`) правит/удаляет cash-manager. Сальдо считается
накопительно в TS (`lib/cash/saldo.ts`, юнит-тест по образцу ОЛІМП), отчёт — `/reports/cash`
(вкладки счетов + Total, разворот по дням, итоги месяца).

**case_comments** (комментарии к делу) — лента обсуждения
`id, case_id (→ cases cascade), author_id (→ users restrict), body (text, 1–5000,
not blank), created_at`
— свободная переписка по делу. RLS наследует доступ дела (`can_see_case`); правит/удаляет
автор. `updateCommentAction` берёт `case_id` из БД (CSO). Логируется в `activity_log`.

**user_notify_channels** (каналы уведомлений сотрудника: Telegram + ICS) — v3 Сессия 8
`user_id (PK → users cascade), telegram_chat_id (NULL = не привязан), telegram_link_code
(uniq, одноразовый код привязки по /start), calendar_token (uuid — секрет ICS-фида),
updated_at`
— self-RLS (каждый видит/правит ТОЛЬКО свою строку). Telegram-дайджест шлёт cron
(`/api/cron/reminders`), ICS-фид — `/api/calendar/[token]`; перевыпуск токена — RPC
`notify_reissue_calendar_token`. Настройка — в `/profile`.

**payment_plan_items** (график платежей по делу) — v3 Сессия 9
`id, case_id (→ cases cascade), due_date date, amount (numeric(14,2) >0), note (опц.
≤300), created_by (→ users restrict), created_at`
— плановые доплаты по делу (план vs факт `paid_total`). RLS наследует дело; статусы
(pending/overdue/paid) и aging дебиторки считаются в TS (`lib/payments/plan.ts`,
`lib/dashboard/aging.ts`) + RPC `overdue_plan_items`/`debt_aging` (invoker). Просрочки —
на staff-дашборде и в Telegram юриста.

**user_login_secrets** / **app_crypto_key** (схема `private`) — управление доступами (2026-06-30)
`private.user_login_secrets(user_id PK → users cascade, secret bytea, updated_at, updated_by)`,
`private.app_crypto_key(id bool PK, key text — single-row, генерится при миграции)`
— ЗЕРКАЛО последнего пароля, выданного владельцем через панель `/settings/users`
(зашифровано pgcrypto симметричным ключом из `app_crypto_key`). **НЕ источник истины
входа** (им остаётся `auth.users`) — только для показа владельцу в модалке; может
разойтись, если сотрудник сменил пароль сам. Схема `private` НЕ доступна PostgREST;
читает ТОЛЬКО owner через `public.get_user_login_secret` (owner-gated DEFINER), пишет
`public.set_user_login_secret`. Удаление сотрудника — `public.user_delete_blockers`
(owner-gated: чистые учётки удаляются, с историей RESTRICT — запрет, в UI → деактивация).
Временные пароли — 6 читаемых символов (`lib/users/temp-password.ts`). Зеркало модели
приватности зарплат. Миграция `20260630120000`.

**activity_log** (история изменений)
`id, entity_type, entity_id, user_id, action, changes (jsonb), created_at`

**Phase 2/3 (проектируем позже):** `document_templates` (если понадобятся),
`client_portal_users`, `client_requests` (обращения с портала). Учёт времени
(`time_entries`) и почасовая оплата из плана **исключены** — заменены моделью «зарплата =
% от оплат». Тема `invoices` закрыта актами (v2 Этап 5, `case_acts`) и кассой (Этап 7).

---

## 6. Этапы дела (воронка)

Линейная воронка из **5 этапов** (новая Концепция, раздел 6), движение
**только вперёд** (см. §7):

1. `new_request` — Новое обращение
2. `consultation` — Консультация и оценка
3. `in_progress` — Договор заключён, в работе
4. `awaiting_decision` — Ожидание решения (дело у Експерта)
5. `closed` — Завершено (акт подписан, в архив)

> Клиент подтвердил воронку и отсутствие отката. `stage` — enum, расширяемый при
> необходимости. Закрытие дела связано с актом (`documents.doc_type='act'` / `case_acts`);
> отсутствие акта при `closed` показывается мягким предупреждением в UI, **не блокирует**.
> (v2 Этап 5: `case_acts` считает `completion` full/partial, но **жёсткий блок закрытия
> без full+paid НЕ включён** — решение пользователя, до подтверждения клиентом; см.
> PLAN-V2 «Открытые вопросы» №1. Включается одной правкой триггера при необходимости.)

---

## 7. Бизнес-правила (соблюдать строго)

1. **Договор = Дело.** Отдельной сущности «договор» нет.
2. **Этапы — только вперёд.** Возврат на предыдущий этап в обычной работе запрещён
   (подтверждено клиентом). Исключение: ручное исправление ошибочно выставленного
   этапа — только staff (`owner`/`admin`/`office_manager`), с записью в `activity_log`.
   Исключение 2 (v3 Сессия 7): закрытие как **«не заключили»** (`outcome='lost'`) с этапов
   `new_request`/`consultation` — RPC `close_case_lost` (фиксирует `lost_reason`), дело
   уходит в `closed` без акта; действие журнала `case_lost`.
3. **Видимость дел:** юрист видит дела, где он `lawyer_id`; Експерт — где он
   `responsible_id`. Друг друга они не видят. owner видит всё; admin/office_manager —
   дела своего подразделения (по `department_id` юриста ИЛИ Експерта дела), либо всю
   компанию при `visibility_scope='all'`/`department_id IS NULL` (v2 Этап 2, см. §4).
4. **Зарплата = % от оплаченной суммы по делу**, по категории (`payroll_rates`:
   документ 7%, иск 10%, представительство 25%). Полный процент получает КАЖДЫЙ —
   и юрист, и Експерт. База — `paid_total`. Ставки задаются **раздельно** для юриста
   и Експерта (дефолты равны; P1.2) и **переопределяются на деле** (`*_rate_override`;
   P1.1) — эффективная ставка роли = `coalesce(override, дефолт категории)`. Дефолты
   меняет только `owner`, override на деле — owner/admin. Live-расчёт —
   `public.case_payroll` / `public.payroll_by_specialist`; фиксация начисления/выплаты
   — в `payroll_ledger` (P1.3), момент задаёт `cases.accrual_mode` (P2.1).
   **Режим зарплаты на сотруднике (v2 Этап 4, `users.salary_mode`):** `percent` —
   только процент (выше); `fixed` — фиксированный оклад/мес, **процентная часть = 0**;
   `fixed_percent` — оклад + процент. Оклад (`salary_fixed_amount`) — справочно за
   месяц в отчёте, в накопленный остаток «К выплате» и выплаты v1 НЕ входит. Меняет
   owner (любому) или admin своего подразделения (БД-гард `users_guard_salary_fields`,
   право `private.can_manage_user_salary`); колонки `salary_*` приватны (column-level
   привилегии), читаются только через SECURITY DEFINER-функции.
5. **admin и office_manager видят финансы/ЗП своего подразделения** (v2 Этап 2;
   `visibility_scope='all'`/`department_id IS NULL` → всей компании); office_manager не
   удаляет записи и не правит платежи; управление пользователями — только owner/admin
   (НЕ скоупится по подразделению); системные настройки — только owner.
6. **Задачи** ставят юристы (продажники), staff **и Експерт по своим делам**
   (v2 Этап 5; RLS `tasks_insert_via_case` уже это разрешает через `can_write_case`).
7. **Источник клиента фиксируем** (`clients.source`).
8. **Закрытие дела** связано с актом (`documents.doc_type='act'` / `case_acts`).
   Закрытие без акта — мягкое предупреждение в UI, не блок (v2 Этап 5: жёсткий блок
   по `case_acts.completion='full'`+`status='paid'` НЕ включён — решение до подтверждения
   клиентом). **Акты как платёжные документы (v2 Этап 5):** «Рахунок-Акт» создаётся
   (issued) → подтверждается оплата (скан + сумма → автоплатёж по делу) → пересчёт
   `paid_total`/долга/ЗП. См. §5 `case_acts`/`org_requisites`.
9. Все изменения по делам пишутся в `activity_log` (кто, что, когда). Смена этапа
   логируется во ВСЕХ путях: степпер (`advanceCaseStageAction`), правка дела и ручной
   откат staff (`updateCaseStageAction`/`updateCaseAction`, v3 Сессия 2), закрытие «lost».

---

## 8. Объём работ по фазам

> **✅ ЦИКЛ v3 «Hardening & Product» ЗАВЕРШЁН (сессии 1–12, 2026-06-12).** Источник
> правды цикла — **`docs/PLAN-V3.md`** (исторический): 12 сессий по итогам
> мультиагентного аудита 2026-06-11. **Выкачен на прод 2026-06-30** (Supabase
> `fmzevqyquljecmsiqsoj` + Vercel `yur-crm.vercel.app`); прод-миграции — по явному
> «ок» пользователя (см. PLAN-V3 §12.8).
>
> **Готово (сессии 1–12):** БД-гарды финансовых полей дела и гонок recalc/act-платежа,
> скоуп DEFINER-функций и удаления документов (с1); полнота журнала (allowlist
> `payment_updated`/`act_deleted`/`payroll_payout`/`case_lost`/`payment_plan_updated`,
> лог смены этапа во всех путях), целостность выплат (Σ аллокаций, `create_payout`,
> запрет DELETE rates), чеки/индексы (с2); касса на SQL-сальдо + бэкфилл + потолки
> строк (с3); дашборд на агрегатах-RPC, Promise.all-водопады, Киев-TZ, optimistic
> locking дела, RLS-initplan (с4); error-границы + `ConfirmDialog` + UX-фиксы (с5);
> глобальная задача, колокольчик, loading, мобильные отчёты, паритет доски (с6);
> исход «не заключили» + конверсия + источники + конфликт-чек (с7); Telegram/ICS-
> напоминания (с8); график платежей + просрочки + aging дебиторки (с9); дизайн-база
> AA + переписан DESIGN.md (с10); дизайн-полировка (тосты, хоткеи, пресеты фильтров,
> «Мой день», консистентность) (с11); модуль `validation.ts`, заморозка мёртвого
> леджера, CI, e2e, вычистка, коммиты (с12). См. `docs/PROGRESS.md` (записи цикла v3).
>
> **✅ ЦИКЛ v2 «Подразделения» ЗАВЕРШЁН (этапы 1–7, 2026-06-11).** Источник
> правды цикла — `docs/PLAN-V2.md` (исторический). **Выкачен на прод 2026-06-30.**
>
> **Готово (этапы 1–7):** БД-фундамент подразделений + департаментная RLS-видимость
> (§4–§5, §7), **UI** подразделений (`/settings/departments`, поля в `/settings/users`
> и форме создания, фильтр «Подразделение» в `/cases` и `/reports/payroll`),
> **ЗП-режимы** (Этап 4): `users.salary_mode` (percent/fixed/fixed_percent) +
> `salary_fixed_amount`, гард прав owner/admin-подразделения, редактор «Зарплата» в
> `/settings/users`, колонка «Оклад (мес.)» в отчёте и блок оклада на карточке
> сотрудника; отчётные функции учитывают режим (§5, §7-4), **Акты** (Этап 5):
> `case_acts` (Рахунок-Акт: issued→paid, скан+сумма→автоплатёж→ЗП, completion
> накопительно), `org_requisites` (реквизиты, `/settings/requisites`), `payments.act_id`,
> печатная форма XLSX по образцу, секция «Акты» на карточке дела; закрытие дела —
> мягкое предупреждение (жёсткий блок не включён, см. §6/§7-8), и **Отпуска** (Этап 6):
> `absences` (vacation/sick/other, период, ролевая видимость по подразделению —
> `private.absence_user_visible`/`absence_can_write`; office_manager только читает),
> блок «Отпуска и отсутствия» на карточке сотрудника + violet-маркеры в общем
> календаре (`--absence`), и **Касса** (Этап 7): `cash_accounts`/`cash_entries`
> (счета Карта/Рахунок/Готівка, журнал приход/расход), право `can_manage_cash`
> (12-й cap, owner-дефолт + owner-only грант), авто-приход платежей по делу
> (триггер `cash_sync_on_payment`, маппинг method→счёт), сальдо накопительно
> (`lib/cash/saldo.ts`, юнит-тест по образцу ОЛІМП), отчёт `/reports/cash`
> (вкладки счетов + Total, разворот по дням, итоги месяца) + пункт «Касса» в
> навигации (cap-gated). См. §4–§5, §7-8.

> **✅ Управление доступами сотрудников (2026-06-30, НА ПРОДЕ).** Owner-only модалка
> в `/settings/users` (клик по сотруднику): показать логин + выдать/сменить пароль,
> изменить логин (email), отправить приглашение на email (встроенная почта Supabase,
> шаблон recovery кастомизирован — укр., бренд «ЮрКейс»), умное удаление
> (`public.user_delete_blockers`: чистые учётки сносятся, с историей — блок →
> деактивация). Копи-блок «логин+пароль+ссылка» в модалке. Пароль виден ТОЛЬКО
> владельцу — зеркало `private.user_login_secrets` (pgcrypto, ключ
> `private.app_crypto_key`; читает owner через `public.get_user_login_secret`, пишет
> `public.set_user_login_secret`). Временные пароли — 6 читаемых символов
> (`lib/users/temp-password.ts`). Журнал: +`user_password_reset`/`user_email_changed`/
> `user_invited`/`user_deleted`. Маршрут `/auth/confirm` — обработка ссылки из письма.
> Миграция `20260630120000`. **Деплой-флоу:** push в master → Vercel автодеплой;
> прод-БД — Supabase `fmzevqyquljecmsiqsoj` (free tier, БЕЗ автобэкапов → дамп данных
> перед любой прод-правкой ОБЯЗАТЕЛЕН, лежит в `/backups/`; миграции — `supabase db
> push` ИЛИ Management API `/database/query` с PAT). См. §4, §5.

**Phase 1 — MVP (готово):**
- Auth + роли + RLS (модель доступа из §4);
- Клиенты (CRUD, список их дел, источник);
- Дела + карточка дела (все поля из §5: юрист, Експерт, категория, предмет);
- Этапы: доска (kanban) + список, движение только вперёд (5 этапов);
- Задачи + общий календарь заседаний/дедлайнов;
- Документы: загрузка/хранение/скачивание по делу (+тип «акт»);
- Финансы (вручную): `contract_sum`, платежи, расчёт долга;
- **Зарплата: % от оплат по категории** (карточка дела + отчёт `/reports/payroll` +
  настройка ставок `/settings/payroll` для owner);
- Поиск и фильтры (по статусу, типу, категории, клиенту, ответственному);
- Журнал изменений (`activity_log`);
- Напоминания о приближающихся сроках/заседаниях.

**Phase 2:**
- Выставление счетов (инвойсы) из системы — «если будет, вообще супер» (опционально);
- Леджер зарплаты (`payroll_ledger`) — фиксация начислений/выплат, история ставок;
- График расчётов (план платежей) по делу;
- Шаблоны документов с автоподстановкой — «не обязательно» (по запросу);
- Расширенные отчёты и аналитика.

**Phase 3:**
- Клиентский портал (статус дела, документы, обращения) — «теоретически можно»;
- Мобильный доступ;
- Электронная подпись документов;
- Внешние интеграции (почта, мессенджеры, бухгалтерия, судебные реестры);
- Миграция существующих данных (есть CRM по обзвонам).

---

## 9. Открытые вопросы (решить перед соответствующей фазой)

- **Время-трекинг:** ❌ исключён по новой Концепции — заменён моделью «зарплата = %
  от оплат по категории дела» (см. §7-4). Модуль `time_entries` удалён.
- **Электронная подпись (Q14):** «не обязательно» (ответ клиента). Если вернёмся —
  провайдер зависит от юрисдикции (Украина → **КЕП / Дія.Підпис**).
- **Клиентский портал (Q16):** уточнить объём (только просмотр статуса+документов или
  ещё и обращения/чат).
- **Интеграции (Q19):** приоритезировать. Для Украины потенциально ценно —
  **Електронний суд / ЄДРСР** (судебный реестр). Уточнить «зачем» по каждой интеграции.
- **Миграция (Q18):** данные есть, но в Phase 1 не нужны.
- **Теги/категории (Q9):** клиент не понял вопрос — пока оставляем `tags` опциональным
  массивом, вернёмся позже.

---

## 10. Конвенции разработки

- TypeScript строгий (`strict: true`), без `any` без необходимости.
- UI-тексты — на русском; код, БД, коммиты — на английском.
- Server Components по умолчанию; `'use client'` только где нужна интерактивность.
- Любой доступ к данным проходит через RLS (см. §2). `service_role` — только системно.
- Перед крупным изменением — короткий план и подтверждение от меня.
- Не реализовывать функции Phase 2/3, пока не закрыта Phase 1.

This project's Baseline target is Baseline 2026.

---

## 11. Дизайн интерфейса

> **Источник правды — `DESIGN.md` в корне проекта (ревизия 2026-06-12, v3).**
> Любой UI-код (шрифт, цвет, отступ, радиус, компонент) читает `DESIGN.md`
> ПРЕЖДЕ, чем выбрать значение. Отклонения — только с явным согласованием.

- **Действующая система (редизайн 2026-06-03):** строгий светлый вид, ОДИН
  синий акцент `#2563EB`, тёмный ink-сайдбар + светлая рабочая зона, белые
  карточки на холодном сером paper-фоне. Темы TEAL/латунь УДАЛЕНЫ (история в git).
- **Типографика:** IBM Plex Sans (UI + цифры, `tabular-nums` глобально);
  JetBrains Mono — ТОЛЬКО `<kbd>`-подсказки (веса 400/600).
- **Цвет — только токенами** из `globals.css` (`:root` → `@theme inline`),
  никаких хардкодов hex. Залитые чипы — пара «подложка `*-bg` + тёмный текст
  `*-fg`/`*-text`»; радиусы новых компонентов — алиасы
  `--r-card/control/chip/modal` (историческая шкала sm/md/lg deprecated).
- **Доступность AA обязательна:** текст ≥ 4.5:1 (проверять скриптом из
  PLAN-V3 s10), фокус-кольца видимы, цвет — не единственный носитель смысла.
- **Запреты прежние:** Inter/Roboto/system-ui и serif в display; градиенты на
  кнопках/больших фонах (только бренд-якоря); «1С-look» и дефолтный
  shadcn-slate; тёмная тема контента; infinite-анимации в списках и
  hover-lift у строк (решение 2026-06-07).
- Перед вёрсткой нового экрана — читать `DESIGN.md`; после — `/design-review` + `/qa`.

---

## gstack

Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /open-gstack-browser, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /sync-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /pair-agent, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn.

### Режим: использовать скилы по максимуму (proactive)
Включить проактивный режим: `~/.claude/skills/gstack/bin/gstack-config set proactive true`.
Не жди явной команды со слешем — сам определяй подходящий скил по задаче и вызывай его.
Применяй спринт-цикл ниже к каждой фиче. (Принятое решение: это заметно расходует токены.)

### Спринт-цикл: Think → Plan → Build → Review → Test → Ship → Reflect
1. **Think** — новая идея / неясные требования → `/office-hours`.
2. **Plan** — стратегия и скоуп → `/plan-ceo-review`; архитектура → `/plan-eng-review`;
   дизайн-система → `/plan-design-review` или `/design-consultation`;
   полный конвейер планирования → `/autoplan`.
3. **Build** — верстка / прототип экрана → `/design-html`, `/design-shotgun`;
   ограничить правки одной папкой → `/freeze` · вернуть → `/unfreeze`.
4. **Review** — ревью кода/диффа → `/review`; второе мнение другой моделью → `/codex`;
   безопасность / OWASP / права доступа → `/cso`.
5. **Test** — поведение в браузере → `/qa` (или `/qa-only`); баги/ошибки → `/investigate`;
   замеры производительности → `/benchmark`. Любой веб-браузинг — только через `/browse`.
6. **Ship** — PR / выкатка → `/ship` или `/land-and-deploy`; пост-деплой мониторинг → `/canary`;
   доки релиза → `/document-release`; документация с нуля → `/document-generate`.
7. **Reflect** — ретро «что отгрузили / как прошло» → `/retro`; зафиксировать урок → `/learn`.

### Безопасность работы (конфиденциальные данные клиентов)
- Рискованные правки → режим осторожности `/careful` или `/guard`.
- Перед каждой выкаткой обязательно прогонять `/cso` и `/review` на всё, что касается
  прав доступа (RLS) и хранения документов.

### Обвязка и настройка
- Несколько агентов / параллельные сессии → `/pair-agent`.
- Память и знания проекта → `/setup-gbrain`, регулярно `/sync-gbrain`.
- Разовая настройка браузера/деплоя/кук → `/open-gstack-browser`, `/setup-browser-cookies`, `/setup-deploy`.
- Обновление gstack → `/gstack-upgrade`.
