-- Юр CRM — Шаг 1, часть 1: enum-ы домена + создание схемы `private` для RLS-helpers.
--
-- Сами helper-функции в private создаются в 20260526100150_helpers.sql ПОСЛЕ
-- 20260526100100_core_tables.sql — иначе SQL-функции с set search_path=''
-- падают на этапе CREATE FUNCTION с «relation public.users does not exist»
-- (Postgres валидирует тело language=sql функций сразу при создании).
-- Схема private здесь нужна, потому что 100100_core_tables создаёт в ней
-- private.cases_validate_responsible и др. триггерные функции.

-- =====================================================================
-- Enum-ы домена (CLAUDE.md §5, §6)
-- =====================================================================

-- Роли (CLAUDE.md §4, новая Концепция):
--   owner          — владелец / супер-админ (всё + системные настройки);
--   admin          — руководитель подразделения (всё + управление пользователями,
--                    но без системных настроек);
--   office_manager — секретарь (заводит клиентов/дела, видит все финансы,
--                    без управления пользователями/настроек);
--   lawyer         — юрист-продажник (заключает договор → cases.lawyer_id);
--   expert         — Експерт-исполнитель (ведёт дело → cases.responsible_id).
-- Помощник (assistant) и specialist_type удалены по новой Концепции.
create type public.user_role as enum (
  'owner', 'admin', 'office_manager', 'lawyer', 'expert'
);

create type public.client_kind as enum (
  'individual', 'company'
);

-- Источник клиента (откуда пришёл) — фиксируем по новой Концепции (раздел 7).
create type public.client_source as enum (
  'website', 'referral', 'advertising', 'repeat', 'other'
);

create type public.case_type as enum (
  'civil', 'criminal', 'corporate', 'administrative', 'family', 'labor', 'other'
);

-- Категория дела (новая Концепция, раздел 3): основа расчёта % зарплаты.
--   document       — документ        (7%);
--   claim          — иск             (10%);
--   representation — представительство (25%).
-- Конкретные проценты лежат в public.payroll_rates и редактируются owner.
create type public.case_category as enum (
  'document', 'claim', 'representation'
);

-- Воронка дела (новая Концепция, раздел 6): 5 этапов, движение только вперёд.
-- «Только вперёд» валидируется триггером (20260527090000_stage_forward.sql).
create type public.case_stage as enum (
  'new_request',
  'consultation',
  'in_progress',
  'awaiting_decision',
  'closed'
);

create type public.case_priority as enum (
  'normal', 'urgent'
);

-- Схема расчётов с клиентом (новая Концепция, раздел 7): предоплата,
-- график расчётов (рассрочка), фиксированная сумма, гонорар успеха.
-- Почасовая оплата (hourly) удалена вместе с учётом времени.
create type public.billing_type as enum (
  'prepaid', 'installments', 'fixed', 'success_fee'
);

-- doc_type: +act — акт приёма-передачи выполненных работ (закрытие дела).
create type public.doc_type as enum (
  'contract', 'claim', 'power_of_attorney', 'correspondence', 'act', 'other'
);

create type public.task_kind as enum (
  'task', 'hearing', 'deadline'
);

create type public.task_status as enum (
  'open', 'done'
);

-- =====================================================================
-- Helper-схема `private` для RLS-предикатов и триггерных функций
-- =====================================================================

create schema if not exists private;

-- Никому из API-ролей не даём прав на саму схему; ниже (в helpers.sql)
-- точечно grant execute на конкретные функции.
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to postgres, service_role;
