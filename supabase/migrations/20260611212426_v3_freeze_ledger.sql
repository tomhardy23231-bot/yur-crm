-- v3 s12: заморозка авто-синхронизации леджера зарплаты (payroll_ledger).
--
-- Леджер начислений (P1.3) в текущем UI не используется: источник правды отчёта
-- ЗП — payroll_transactions/payout_allocations через payroll_employee_summary.
-- Снимаем триггер, который при правке дела автоматически писал начисления в
-- payroll_ledger, и его функцию-обёртку. Таблицу и исторические данные НЕ трогаем —
-- судьбу леджера решит Phase 2 (если вернём в UI).

drop trigger if exists cases_sync_ledger on public.cases;
drop function if exists private.cases_sync_ledger_trigger();

comment on table public.payroll_ledger is
  'FROZEN 2026-06 (v3 s12): авто-синхронизация снята (триггер cases_sync_ledger удалён). Данные исторические; в текущем UI не отображается. Судьбу решит Phase 2.';
