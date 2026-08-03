-- ============================================================================
-- 0018_sane_dates.sql — база перестаёт принимать бессмысленные даты.
--
-- ЗАЧЕМ (владелец, 2026-08-03): «первое, что нужно исправить — не позволять
-- писать вот такие бессмысленные даты как 0004.04.07».
--
-- Что случилось: платёж на 1 000 ₴ по делу «07/04/26» уехал на дату
-- 0004-04-07 — при вводе года набрали 0004 вместо 2026. Формально дата
-- валидна (существующий день существующего месяца), поэтому её пропустили и
-- форма, и сервер. В отчётах платёж провалился на две тысячи лет назад и
-- выпал из любого периода — цифры молча не сходились. Запись починена
-- отдельным UPDATE до этой миграции (обе базы: прод и локальная).
--
-- ТРИ БАРЬЕРА, этот — последний и единственный обязательный:
--   1. <input type="date" min max> — календарь браузера (workDateBounds);
--   2. server actions — isWorkDate / isBirthDate (lib/validation.ts);
--   3. CHECK ниже — ловит ЛЮБОЙ путь записи: сырой SQL, импорт, будущий код,
--      забывший про валидатор.
--
-- ГРАНИЦЫ. В CHECK они фиксированные, потому что выражение обязано быть
-- IMMUTABLE — now()/current_date внутри ограничения запрещены. Отсюда широкая
-- вилка 2000…2100: она гарантированно ловит промах в разряде года (0004, 0202,
-- 9999), а точную верхнюю границу «не дальше пяти лет вперёд» держит серверная
-- валидация, где сегодняшний день известен.
--
-- Дата рождения клиента — своя вилка (с 1900), рабочий диапазон ей не годится.
--
-- NULL проходит любой CHECK, поэтому необязательные даты (closed_at, paid_at
-- у акта) отдельной проверки на NULL не требуют.
-- ============================================================================

-- ── Деньги ──────────────────────────────────────────────────────────────────
alter table public.payments
  add constraint payments_paid_at_sane
  check (paid_at >= '2000-01-01'::date and paid_at < '2100-01-01'::date);

alter table public.expenses
  add constraint expenses_spent_at_sane
  check (spent_at >= '2000-01-01'::date and spent_at < '2100-01-01'::date);

alter table public.cash_entries
  add constraint cash_entries_entry_date_sane
  check (entry_date >= '2000-01-01'::date and entry_date < '2100-01-01'::date);

alter table public.cash_accounts
  add constraint cash_accounts_opening_date_sane
  check (opening_date >= '2000-01-01'::date and opening_date < '2100-01-01'::date);

alter table public.payment_plan_items
  add constraint payment_plan_items_due_date_sane
  check (due_date >= '2000-01-01'::date and due_date < '2100-01-01'::date);

alter table public.payroll_transactions
  add constraint payroll_transactions_occurred_on_sane
  check (occurred_on >= '2000-01-01'::date and occurred_on < '2100-01-01'::date);

-- ── Дела и акты ─────────────────────────────────────────────────────────────
alter table public.cases
  add constraint cases_opened_at_sane
  check (opened_at >= '2000-01-01'::date and opened_at < '2100-01-01'::date);

alter table public.cases
  add constraint cases_closed_at_sane
  check (closed_at >= '2000-01-01'::date and closed_at < '2100-01-01'::date);

alter table public.case_acts
  add constraint case_acts_issued_at_sane
  check (issued_at >= '2000-01-01'::date and issued_at < '2100-01-01'::date);

alter table public.case_acts
  add constraint case_acts_paid_at_sane
  check (paid_at >= '2000-01-01'::date and paid_at < '2100-01-01'::date);

-- ── Люди ────────────────────────────────────────────────────────────────────
alter table public.absences
  add constraint absences_starts_on_sane
  check (starts_on >= '2000-01-01'::date and starts_on < '2100-01-01'::date);

alter table public.absences
  add constraint absences_ends_on_sane
  check (ends_on >= '2000-01-01'::date and ends_on < '2100-01-01'::date);

-- Дата рождения: с 1900 года. Верхнюю границу («не в будущем») держит сервер —
-- в CHECK её не выразить без current_date.
alter table public.clients
  add constraint clients_birth_date_sane
  check (birth_date >= '1900-01-01'::date and birth_date < '2100-01-01'::date);

-- ── Задачи и сроки (timestamptz) ────────────────────────────────────────────
alter table public.tasks
  add constraint tasks_due_at_sane
  check (due_at >= '2000-01-01'::timestamptz and due_at < '2100-01-01'::timestamptz);

comment on constraint payments_paid_at_sane on public.payments is
  'Дата платежа в разумных пределах (2000–2100). Ловит промах в разряде года — 0004 вместо 2026 (реальный случай 2026-08-03). Точную верхнюю границу «не дальше +5 лет» держит isWorkDate в lib/validation.ts. 0018.';
