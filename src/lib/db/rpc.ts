// Типизированный реестр SQL-функций (RPC) — цикл v4, ревью Q2.
//
// ЕДИНСТВЕННОЕ место вызова наших ~26 SQL-функций (замена supabase.rpc):
// одна обёртка на функцию, параметры и результат типизированы, все вызовы
// схемо-квалифицированы (public.*). Новая SQL-функция в БД → новая обёртка
// здесь, вызовов $queryRaw по файлам приложения НЕ раскидываем.
//
// Все обёртки зовутся с tx-клиентом ВНУТРИ userDb(...) — включая
// SECURITY DEFINER-функции: свои проверки прав они делают сами через
// auth.uid() (шим), которому нужен app.user_id транзакции. Из admin-пула
// (adminDb) можно звать только системные вещи (seed/тесты).
//
// Конверсии под старую PostgREST-семантику (call-sites сессий 3–4 меняются
// минимально): numeric/bigint → number (num), date → 'YYYY-MM-DD' (dateStr),
// timestamptz → ISO-строка (tsStr).

import type { PrismaClient } from '@/generated/prisma/client';
import type {
  case_category,
  case_stage,
  case_type,
} from '@/generated/prisma/enums';
import type { Db } from '@/lib/db';

type DbLike = Db | PrismaClient;

// --- конверсии значений из raw-строк -----------------------------------------

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') return Number(v);
  if (typeof v === 'object' && 'toNumber' in (v as object)) {
    return (v as { toNumber(): number }).toNumber();
  }
  return Number(v as never);
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : num(v);
}

// date из pg приходит JS Date с полуночью ЛОКАЛЬНОГО пояса — собираем
// YYYY-MM-DD из локальных компонент (toISOString сдвинул бы день через UTC)
function dateStr(v: unknown): string {
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function dateStrOrNull(v: unknown): string | null {
  return v == null ? null : dateStr(v);
}

function tsStr(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

type Row = Record<string, unknown>;

// SELECT f(...) всегда возвращает ровно одну строку — отсутствие строки
// значит сломанный вызов, честно падаем (strict: rows[0] может быть undefined)
function firstRow(rows: Row[], fn: string): Row {
  const row = rows[0];
  if (!row) throw new Error(`rpc ${fn}: пустой результат`);
  return row;
}

// === Журнал изменений =========================================================

/** activity_log через DEFINER (гоча 23514: allowlist actions живёт в БД). */
export async function rpcLogActivity(
  db: DbLike,
  args: {
    entityType: string;
    entityId: string;
    action: string;
    changes?: unknown;
  },
): Promise<void> {
  const changes = args.changes == null ? null : JSON.stringify(args.changes);
  // void-функции зовём через $executeRaw: адаптер pg не умеет
  // десериализовать колонку типа void (UnsupportedNativeDataType)
  await db.$executeRaw`
    select public.log_activity(
      ${args.entityType}::text, ${args.entityId}::uuid,
      ${args.action}::text, ${changes}::jsonb)`;
}

// === Дела =====================================================================

export type SearchCaseIdsRow = { id: string; total: number };

/** Поиск/фильтры списка дел: возвращает страницу id + общий счётчик. */
export async function rpcSearchCaseIds(
  db: DbLike,
  args: {
    q?: string | null;
    stage?: case_stage | null;
    caseType?: case_type | null;
    responsibleId?: string | null;
    category?: case_category | null;
    lawyerId?: string | null;
    clientId?: string | null;
    departmentId?: string | null;
    archived?: boolean | null;
    closedFrom?: string | null;
    closedTo?: string | null;
    limit: number;
    offset: number;
    sort?: string | null;
    dir?: string | null;
  },
): Promise<SearchCaseIdsRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.search_case_ids(
      ${args.q ?? null}::text,
      ${args.stage ?? null}::case_stage,
      ${args.caseType ?? null}::case_type,
      ${args.responsibleId ?? null}::uuid,
      ${args.category ?? null}::case_category,
      ${args.lawyerId ?? null}::uuid,
      ${args.clientId ?? null}::uuid,
      ${args.departmentId ?? null}::uuid,
      ${args.archived ?? null}::boolean,
      ${args.closedFrom ?? null}::date,
      ${args.closedTo ?? null}::date,
      ${args.limit}::integer,
      ${args.offset}::integer,
      ${args.sort ?? null}::text,
      ${args.dir ?? null}::text)`;
  return rows.map((r) => ({ id: r.id as string, total: num(r.total) }));
}

/** Закрытие «не заключили» с этапов new_request/consultation (v3 s7). */
export async function rpcCloseCaseLost(
  db: DbLike,
  args: { caseId: string; reason: string | null },
): Promise<void> {
  await db.$executeRaw`
    select public.close_case_lost(${args.caseId}::uuid, ${args.reason}::text)`;
}

export type ConflictCheckRow = { kind: string; label: string };

/** Конфликт-чек клиента по имени/ИНН/телефону (v3 s7). */
export async function rpcConflictCheck(
  db: DbLike,
  args: { name?: string | null; inn?: string | null; phone?: string | null },
): Promise<ConflictCheckRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.conflict_check(
      ${args.name ?? null}::text, ${args.inn ?? null}::text,
      ${args.phone ?? null}::text)`;
  return rows.map((r) => ({
    kind: r.kind as string,
    label: r.label as string,
  }));
}

// === Акты (Рахунок-Акт, v2 Этап 5) ===========================================

/**
 * Атомарное подтверждение оплаты акта: скан (documents) + платёж (act_id)
 * + issued→paid + пересчёт completion. Возвращает id созданного платежа.
 */
export async function rpcConfirmActPaid(
  db: DbLike,
  args: {
    actId: string;
    confirmedAmount: number;
    paidAt: string; // YYYY-MM-DD
    storageKey: string;
    fileName: string;
    method: string;
    note?: string | null;
  },
): Promise<string> {
  const rows = await db.$queryRaw<Row[]>`
    select public.confirm_act_paid(
      ${args.actId}::uuid, ${args.confirmedAmount}::numeric,
      ${args.paidAt}::date, ${args.storageKey}::text,
      ${args.fileName}::text, ${args.method}::text,
      ${args.note ?? null}::text) as payment_id`;
  return firstRow(rows, 'confirm_act_paid').payment_id as string;
}

/** Ручное переопределение completion акта staff'ом (full|partial). */
export async function rpcSetActCompletion(
  db: DbLike,
  args: { actId: string; completion: string },
): Promise<void> {
  await db.$executeRaw`
    select public.set_act_completion(
      ${args.actId}::uuid, ${args.completion}::text)`;
}

// === Зарплата (CLAUDE.md §7-4) ===============================================

export type CasePayrollRow = {
  category: case_category;
  lawyer_percent: number;
  lawyer_amount: number;
  expert_percent: number;
  expert_amount: number;
  total: number;
};

/** Живой расчёт ЗП по делу (эффективные ставки ролей + суммы). */
export async function rpcCasePayroll(
  db: DbLike,
  args: { caseId: string },
): Promise<CasePayrollRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.case_payroll(${args.caseId}::uuid)`;
  return rows.map((r) => ({
    category: r.category as case_category,
    lawyer_percent: num(r.lawyer_percent),
    lawyer_amount: num(r.lawyer_amount),
    expert_percent: num(r.expert_percent),
    expert_amount: num(r.expert_amount),
    total: num(r.total),
  }));
}

export type PayrollBySpecialistRow = {
  user_id: string;
  full_name: string;
  role_in_case: string;
  case_count: number;
  paid_base: number;
  earned: number;
};

/** Сводка ЗП по специалистам (live, без леджера). */
export async function rpcPayrollBySpecialist(
  db: DbLike,
): Promise<PayrollBySpecialistRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.payroll_by_specialist()`;
  return rows.map((r) => ({
    user_id: r.user_id as string,
    full_name: r.full_name as string,
    role_in_case: r.role_in_case as string,
    case_count: num(r.case_count),
    paid_base: num(r.paid_base),
    earned: num(r.earned),
  }));
}

export type PayrollEmployeeSummaryRow = {
  user_id: string;
  full_name: string;
  earned: number;
  fixed: number;
  bonus: number;
  payout: number;
  balance: number;
  salary_mode: string;
};

/** ИСТОЧНИК ПРАВДЫ отчёта ЗП /reports/payroll (учитывает salary_mode). */
export async function rpcPayrollEmployeeSummary(
  db: DbLike,
  args: { month: string }, // YYYY-MM-01
): Promise<PayrollEmployeeSummaryRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.payroll_employee_summary(${args.month}::date)`;
  return rows.map((r) => ({
    user_id: r.user_id as string,
    full_name: r.full_name as string,
    earned: num(r.earned),
    fixed: num(r.fixed),
    bonus: num(r.bonus),
    payout: num(r.payout),
    balance: num(r.balance),
    salary_mode: r.salary_mode as string,
  }));
}

export type PayrollEmployeeCaseRow = {
  case_id: string;
  number_title: string;
  stage: case_stage;
  role_in_case: string;
  paid_total: number;
  percent: number;
  earned: number;
  paid: number;
  outstanding: number;
};

/** Разбивка ЗП сотрудника по делам (карточка /reports/payroll/[userId]). */
export async function rpcPayrollEmployeeCases(
  db: DbLike,
  args: { userId: string; month: string },
): Promise<PayrollEmployeeCaseRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.payroll_employee_cases(
      ${args.userId}::uuid, ${args.month}::date)`;
  return rows.map((r) => ({
    case_id: r.case_id as string,
    number_title: r.number_title as string,
    stage: r.stage as case_stage,
    role_in_case: r.role_in_case as string,
    paid_total: num(r.paid_total),
    percent: num(r.percent),
    earned: num(r.earned),
    paid: num(r.paid),
    outstanding: num(r.outstanding),
  }));
}

export type ManageUserSalaryRow = {
  user_id: string;
  salary_mode: string;
  salary_fixed_amount: number | null;
  can_edit: boolean;
};

/** Режимы оплаты сотрудников для /settings/users (колонки salary_* приватны). */
export async function rpcManageUserSalaries(
  db: DbLike,
): Promise<ManageUserSalaryRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.manage_user_salaries()`;
  return rows.map((r) => ({
    user_id: r.user_id as string,
    salary_mode: r.salary_mode as string,
    salary_fixed_amount: numOrNull(r.salary_fixed_amount),
    can_edit: r.can_edit as boolean,
  }));
}

/**
 * Выплата сотруднику с распределением по делам (Σ аллокаций = сумма, v3 s2).
 * allocations: [{case_id, role_in_case, amount}]. Возвращает id транзакции.
 */
export async function rpcCreatePayout(
  db: DbLike,
  args: {
    userId: string;
    comment: string | null;
    occurredOn: string; // YYYY-MM-DD
    allocations: Array<{
      case_id: string;
      role_in_case: string;
      amount: number;
    }>;
  },
): Promise<string> {
  const rows = await db.$queryRaw<Row[]>`
    select public.create_payout(
      ${args.userId}::uuid, ${args.comment}::text,
      ${args.occurredOn}::date,
      ${JSON.stringify(args.allocations)}::jsonb) as id`;
  return firstRow(rows, 'create_payout').id as string;
}

/** Откат отметки «выплачено» в леджере (историческое, леджер заморожен v3 s12). */
export async function rpcRevertPayout(
  db: DbLike,
  args: { ledgerId: string },
): Promise<void> {
  await db.$executeRaw`select public.revert_payout(${args.ledgerId}::uuid)`;
}

// === Касса (v2 Этап 7) ========================================================

export type CashBalanceBeforeRow = { account_id: string; balance: number };

/** SQL-сальдо всех счетов на начало даты (v3 s3). */
export async function rpcCashBalancesBefore(
  db: DbLike,
  args: { before: string }, // YYYY-MM-DD
): Promise<CashBalanceBeforeRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.cash_balances_before(${args.before}::date)`;
  return rows.map((r) => ({
    account_id: r.account_id as string,
    balance: num(r.balance),
  }));
}

/** Бэкфилл авто-приходов по платежам, созданным до включения кассы. */
export async function rpcCashBackfillPayments(db: DbLike): Promise<number> {
  const rows = await db.$queryRaw<Row[]>`
    select public.cash_backfill_payments() as n`;
  return num(firstRow(rows, 'cash_backfill_payments').n);
}

/** Число платежей без строки кассы (кнопка бэкфилла в /reports/cash). */
export async function rpcCashUnsyncedPaymentsCount(
  db: DbLike,
): Promise<number> {
  const rows = await db.$queryRaw<Row[]>`
    select public.cash_unsynced_payments_count() as n`;
  return num(firstRow(rows, 'cash_unsynced_payments_count').n);
}

// === Дашборд (v3 s4 — агрегаты на SQL) =======================================

export type DashboardPaymentMonthRow = { month_start: string; total: number };

export async function rpcDashboardPaymentMonths(
  db: DbLike,
  args: { from: string },
): Promise<DashboardPaymentMonthRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.dashboard_payment_months(${args.from}::date)`;
  return rows.map((r) => ({
    month_start: dateStr(r.month_start),
    total: num(r.total),
  }));
}

export type DashboardStockMonthRow = {
  month_start: string;
  debt: number;
  salary: number;
  active_cases: number;
};

/** Помесячная динамика долга/ЗП/активных дел; fixed-сотрудники исключаются. */
export async function rpcDashboardStockMonths(
  db: DbLike,
  args: { from: string; userId: string | null; fixedUserIds: string[] },
): Promise<DashboardStockMonthRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.dashboard_stock_months(
      ${args.from}::date, ${args.userId}::uuid,
      ${args.fixedUserIds}::uuid[])`;
  return rows.map((r) => ({
    month_start: dateStr(r.month_start),
    debt: num(r.debt),
    salary: num(r.salary),
    active_cases: num(r.active_cases),
  }));
}

export type DashboardSourceRow = {
  source: string | null;
  clients_count: number;
  cases_count: number;
  paid_total: number;
};

/** Конверсия по источникам клиентов (v3 s7). */
export async function rpcDashboardSources(
  db: DbLike,
  args: { from: string; to: string },
): Promise<DashboardSourceRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.dashboard_sources(${args.from}::date, ${args.to}::date)`;
  return rows.map((r) => ({
    source: (r.source as string | null) ?? null,
    clients_count: num(r.clients_count),
    cases_count: num(r.cases_count),
    paid_total: num(r.paid_total),
  }));
}

export type OverduePlanItemRow = {
  case_id: string;
  number_title: string;
  due_date: string;
  amount: number;
  paid_total: number;
  plan_before: number;
};

/** Просроченные позиции графика платежей (v3 s9). */
export async function rpcOverduePlanItems(
  db: DbLike,
  args: { today: string },
): Promise<OverduePlanItemRow[]> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.overdue_plan_items(${args.today}::date)`;
  return rows.map((r) => ({
    case_id: r.case_id as string,
    number_title: r.number_title as string,
    due_date: dateStr(r.due_date),
    amount: num(r.amount),
    paid_total: num(r.paid_total),
    plan_before: num(r.plan_before),
  }));
}

export type DebtAgingRow = {
  case_id: string;
  number_title: string;
  debt: number;
  last_paid_at: string | null;
  opened_at: string;
};

/** Aging дебиторки (v3 s9). */
export async function rpcDebtAging(db: DbLike): Promise<DebtAgingRow[]> {
  const rows = await db.$queryRaw<Row[]>`select * from public.debt_aging()`;
  return rows.map((r) => ({
    case_id: r.case_id as string,
    number_title: r.number_title as string,
    debt: num(r.debt),
    last_paid_at: dateStrOrNull(r.last_paid_at),
    opened_at: dateStr(r.opened_at),
  }));
}

// === Пользователи и доступы ===================================================

/** Зеркало выданного пароля (owner-gated DEFINER, 2026-06-30). */
export async function rpcGetUserLoginSecret(
  db: DbLike,
  args: { userId: string },
): Promise<{ password: string; updated_at: string } | null> {
  const rows = await db.$queryRaw<Row[]>`
    select * from public.get_user_login_secret(${args.userId}::uuid)`;
  const row = rows[0];
  if (!row) return null;
  return {
    password: row.password as string,
    updated_at: tsStr(row.updated_at),
  };
}

/** Записать зеркало пароля (owner-gated DEFINER). */
export async function rpcSetUserLoginSecret(
  db: DbLike,
  args: { userId: string; password: string },
): Promise<void> {
  await db.$executeRaw`
    select public.set_user_login_secret(
      ${args.userId}::uuid, ${args.password}::text)`;
}

/** Блокеры удаления сотрудника: {} = чистая учётка, можно сносить. */
export async function rpcUserDeleteBlockers(
  db: DbLike,
  args: { userId: string },
): Promise<Record<string, number>> {
  const rows = await db.$queryRaw<Row[]>`
    select public.user_delete_blockers(${args.userId}::uuid) as blockers`;
  return (firstRow(rows, 'user_delete_blockers').blockers ??
    {}) as Record<string, number>;
}

/** Язык интерфейса текущего пользователя (uk|ru). */
export async function rpcSetMyLanguage(
  db: DbLike,
  args: { lang: string },
): Promise<void> {
  await db.$executeRaw`select public.set_my_language(${args.lang}::text)`;
}

/** Перевыпуск секрета ICS-фида; возвращает новый token (v3 s8). */
export async function rpcNotifyReissueCalendarToken(
  db: DbLike,
): Promise<string> {
  const rows = await db.$queryRaw<Row[]>`
    select public.notify_reissue_calendar_token() as token`;
  return firstRow(rows, 'notify_reissue_calendar_token').token as string;
}
