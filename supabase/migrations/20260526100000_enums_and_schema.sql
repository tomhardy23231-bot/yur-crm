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

create type public.user_role as enum (
  'owner', 'admin', 'specialist', 'assistant'
);

create type public.specialist_type as enum (
  'lawyer', 'jurist'
);

create type public.client_kind as enum (
  'individual', 'company'
);

create type public.case_type as enum (
  'civil', 'criminal', 'corporate', 'administrative', 'family', 'labor', 'other'
);

-- Воронка дела, движение только вперёд (CLAUDE.md §6, §7-2).
-- Сам факт «только вперёд» в Шаге 1 не валидируем — это Шаг 6.
create type public.case_stage as enum (
  'new_request',
  'consultation',
  'in_progress',
  'pretrial',
  'litigation',
  'awaiting_decision',
  'enforcement',
  'closed'
);

create type public.case_priority as enum (
  'normal', 'urgent'
);

create type public.billing_type as enum (
  'prepaid', 'hourly', 'fixed', 'success_fee'
);

create type public.doc_type as enum (
  'contract', 'claim', 'power_of_attorney', 'correspondence', 'other'
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
