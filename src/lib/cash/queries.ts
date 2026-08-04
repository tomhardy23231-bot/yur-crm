import 'server-only';

import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec, toDbDate, ts } from '@/lib/db/convert';
import {
  rpcCashAccountsPick,
  rpcCashBalancesBefore,
  rpcCashCutoffSummary,
  type CashAccountPick,
  type CashCutoffRow,
  rpcCashUnsyncedPaymentsCount,
} from '@/lib/db/rpc';
import { expenseCategoryMap } from '@/lib/expenses/categories';
import type {
  CashAccount,
  CashDirection,
  CashEntryWithCase,
  ExpenseMethod,
  ExpenseWithRefs,
  PaymentWithCreator,
} from '@/lib/types/db';

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  kind: true,
  opening_balance: true,
  opening_date: true,
  is_active: true,
  is_default: true,
  created_by: true,
  created_at: true,
} as const;

const ENTRY_SELECT = {
  id: true,
  account_id: true,
  entry_date: true,
  direction: true,
  amount: true,
  description: true,
  case_id: true,
  payment_id: true,
  expense_id: true,
  created_by: true,
  created_at: true,
  include_before_opening: true,
} as const;

type AccountRow = {
  id: string;
  name: string;
  kind: string;
  opening_balance: unknown;
  opening_date: Date;
  is_active: boolean;
  is_default: boolean;
  created_by: string;
  created_at: Date;
};

function normalizeAccount(r: AccountRow): CashAccount {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as CashAccount['kind'],
    opening_balance: dec(r.opening_balance),
    opening_date: dateOnly(r.opening_date),
    is_active: r.is_active,
    is_default: r.is_default,
    created_by: r.created_by,
    created_at: ts(r.created_at),
  };
}

type EntryRow = {
  id: string;
  account_id: string;
  entry_date: Date;
  direction: string;
  amount: unknown;
  description: string;
  case_id: string | null;
  payment_id: string | null;
  expense_id: string | null;
  created_by: string;
  created_at: Date;
  include_before_opening: boolean;
  cases: { id: string; number_title: string } | null;
};

function normalizeEntry(r: EntryRow): CashEntryWithCase {
  return {
    id: r.id,
    account_id: r.account_id,
    entry_date: dateOnly(r.entry_date),
    direction: r.direction as CashDirection,
    amount: dec(r.amount),
    description: r.description,
    case_id: r.case_id,
    payment_id: r.payment_id,
    expense_id: r.expense_id,
    created_by: r.created_by,
    created_at: ts(r.created_at),
    include_before_opening: r.include_before_opening,
    case: r.cases ? { id: r.cases.id, number_title: r.cases.number_title } : null,
  };
}

// Счета кассы (RLS отдаёт только обладателю can_manage_cash). Старые сверху.
export async function listCashAccounts(
  opts: { activeOnly?: boolean } = {},
): Promise<CashAccount[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.cash_accounts.findMany({
      where: opts.activeOnly ? { is_active: true } : undefined,
      orderBy: { created_at: 'asc' },
      select: ACCOUNT_SELECT,
    }),
  );
  return rows.map(normalizeAccount);
}

// Потолок выборки операций периода. Раньше страховал от молчаливого усечения
// PostgREST (max_rows=1000); у Prisma тихого усечения нет, но лимит оставляем как
// защиту от аномально большого периода (год, вся история) + сравниваем с count()
// для флага truncated. Обороты и сальдо самого отчёта считает SQL (0017) — они
// под этот потолок НЕ попадают, усечься может только журнал операций.
const PERIOD_ENTRY_LIMIT = 5000;

export type CashReportData = {
  accounts: CashAccount[];
  // Операции ТОЛЬКО выбранного периода (свежие не теряются под потолком выборки).
  // Перенос из прошлых периодов считается SQL'ем (openingBalances), а не выкачкой истории.
  entries: CashEntryWithCase[];
  // Перенос остатка на начало периода по счёту (accountId → net до period.from, начиная с
  // opening_date). Эффективный остаток на начало = account.opening_balance + это число.
  openingBalances: Record<string, number>;
  // true, если операций за период больше лимита выборки (показать предупреждение в UI).
  truncated: boolean;
};

// Данные сальдо-отчёта за ПЕРИОД (2026-08-03; раньше — строго календарный месяц).
// Тянем ТОЛЬКО операции периода, а перенос остатка на его начало считаем
// SQL-функцией cash_balances_before (без выкачки всей истории). RLS/право
// скоупит по view_cash/can_manage_cash.
// cache() — за один рендер страницу кассы просят эти данные дважды: сама
// страница (вкладки счетов) и отчёт «Реестр операций». Без мемоизации это два
// одинаковых обхода cash_entries на каждый показ.
export const getCashReportData = cache(async function getCashReportData(period: {
  from: string;
  to: string;
}): Promise<CashReportData> {
  const user = await getCurrentUser();
  if (!user) {
    return { accounts: [], entries: [], openingBalances: {}, truncated: false };
  }
  const uid = user.profile.id;
  const { from: periodStart, to: periodEnd } = period;
  // Обе границы включительно — как их понимают SQL-функции отчётов (0017).
  const entryWhere = {
    entry_date: { gte: toDbDate(periodStart), lte: toDbDate(periodEnd) },
  };

  const [accounts, balances, entryRows, total] = await Promise.all([
    listCashAccounts(),
    userDb(uid, (tx) => rpcCashBalancesBefore(tx, { before: periodStart })),
    userDb(uid, (tx) =>
      tx.cash_entries.findMany({
        where: entryWhere,
        orderBy: [{ entry_date: 'asc' }, { created_at: 'asc' }],
        take: PERIOD_ENTRY_LIMIT,
        select: {
          ...ENTRY_SELECT,
          cases: { select: { id: true, number_title: true } },
        },
      }),
    ),
    userDb(uid, (tx) => tx.cash_entries.count({ where: entryWhere })),
  ]);

  const openingBalances: Record<string, number> = {};
  for (const r of balances) openingBalances[r.account_id] = r.balance;

  const entries = entryRows.map(normalizeEntry);
  const truncated = total > entries.length;

  return { accounts, entries, openingBalances, truncated };
});

// =====================================================================
// getCashCutoffSummary — операции, отсечённые датой начального остатка счёта,
// по ВСЕМУ счёту (0020). Раньше плашка считала их по видимому периоду, а
// кнопка меняет настройку счёта навсегда: в августе предлагалось перенести
// дату на 02.08, хотя такие же операции лежали ещё и в апреле.
// =====================================================================
export async function getCashCutoffSummary(): Promise<Record<string, CashCutoffRow>> {
  const user = await getCurrentUser();
  if (!user) return {};
  try {
    const rows = await userDb(user.profile.id, (tx) => rpcCashCutoffSummary(tx));
    return Object.fromEntries(rows.map((r) => [r.account_id, r]));
  } catch (err) {
    // Плашка — подсказка, а не расчёт: её отсутствие не должно ронять кассу.
    console.error('getCashCutoffSummary failed:', err);
    return {};
  }
}

// Сколько платежей ещё не отражены в кассе (для баннера «Синхронизировать»). Не валит
// страницу: при ошибке/без права RPC вернёт 0 (право проверяется внутри функции).
export async function getUnsyncedPaymentsCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;

  try {
    return await userDb(user.profile.id, (tx) =>
      rpcCashUnsyncedPaymentsCount(tx),
    );
  } catch (err) {
    console.error('getUnsyncedPaymentsCount failed:', err);
    return 0;
  }
}

// =====================================================================
// getCurrentBalances — фактический остаток по счетам НА СЕГОДНЯ, независимо от
// выбранного в отчёте месяца (2026-07-26, замечание владельца: листая месяцы,
// он видел остаток на конец того месяца и не понимал, сколько на счету сейчас).
//
// Считает та же SQL-функция cash_balances_before, но с границей «завтра»:
// накопленный перенос по всем операциям + начальный остаток счёта.
// =====================================================================
export async function getCurrentBalances(): Promise<Record<string, number>> {
  const user = await getCurrentUser();
  if (!user) return {};
  // Граница берётся строго меньше, поэтому «завтра» = включая сегодняшний день.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await userDb(user.profile.id, (tx) =>
    rpcCashBalancesBefore(tx, { before: tomorrow }),
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.account_id] = r.balance;
  return out;
}

// =====================================================================
// getCashEntryDetails — карточка одной операции кассы (2026-08-04).
//
// Тянется ЛЕНИВО, по клику на строку: журнал бывает на тысячи строк, а автора,
// клиента и статью расхода нужно знать только для той, что открыли.
//
// Возвращает саму операцию + её ИСТОЧНИК: платёж (авто-приход) или расход
// (авто-розхід). Правка идёт в источник, а не в кассу — там же живут права.
// =====================================================================
export type CashEntryDetails = {
  entry: CashEntryWithCase & {
    account_name: string;
    creator: { id: string; full_name: string } | null;
  };
  /** Дата начального остатка счёта: раньше неё операция в обороты не входит. */
  accountOpeningDate: string;
  /** Платёж-источник авто-прихода (+ дело и клиент для шапки). */
  payment:
    | (PaymentWithCreator & { case_title: string | null; client_name: string | null })
    | null;
  /** Расход-источник авто-розхода (+ дело для шапки). */
  expense: (ExpenseWithRefs & { case_title: string | null }) | null;
};

export async function getCashEntryDetails(
  entryId: string,
): Promise<CashEntryDetails | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const uid = user.profile.id;

  const row = await userDb(uid, (tx) =>
    tx.cash_entries.findUnique({
      where: { id: entryId },
      select: {
        ...ENTRY_SELECT,
        cases: { select: { id: true, number_title: true } },
        cash_accounts: { select: { name: true, opening_date: true } },
        users: { select: { id: true, full_name: true } },
      },
    }),
  );
  if (!row) return null;

  const entry = {
    ...normalizeEntry(row as EntryRow),
    account_name: row.cash_accounts?.name ?? '',
    creator: row.users ? { id: row.users.id, full_name: row.users.full_name } : null,
  };
  const accountOpeningDate = row.cash_accounts
    ? dateOnly(row.cash_accounts.opening_date)
    : entry.entry_date;

  // Источник строки. Обе выборки под RLS: платёж виден по видимости дела,
  // расход — по правам расходов/кассы. Не видно источник → карточка покажет
  // только саму операцию, без правки.
  const [payment, expense] = await Promise.all([
    row.payment_id ? loadEntryPayment(uid, row.payment_id) : Promise.resolve(null),
    row.expense_id ? loadEntryExpense(uid, row.expense_id) : Promise.resolve(null),
  ]);

  return { entry, accountOpeningDate, payment, expense };
}

async function loadEntryPayment(
  uid: string,
  paymentId: string,
): Promise<CashEntryDetails['payment']> {
  const p = await userDb(uid, (tx) =>
    tx.payments.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        case_id: true,
        amount: true,
        paid_at: true,
        method: true,
        account_id: true,
        note: true,
        created_by: true,
        created_at: true,
        // idempotency_key НЕ читаем: он не нужен ни карточке, ни форме правки,
        // а полезная нагрузка карточки уходит в браузер (ревью 0019).
        act_id: true,
        users: { select: { id: true, full_name: true } },
        cases: {
          select: { number_title: true, clients: { select: { name: true } } },
        },
      },
    }),
  );
  if (!p) return null;

  return {
    id: p.id,
    case_id: p.case_id,
    amount: dec(p.amount),
    paid_at: dateOnly(p.paid_at),
    method: p.method,
    account_id: p.account_id,
    note: p.note,
    created_by: p.created_by,
    created_at: ts(p.created_at),
    idempotency_key: null,
    act_id: p.act_id,
    creator: p.users ? { id: p.users.id, full_name: p.users.full_name } : null,
    case_title: p.cases?.number_title ?? null,
    client_name: p.cases?.clients?.name ?? null,
  };
}

async function loadEntryExpense(
  uid: string,
  expenseId: string,
): Promise<CashEntryDetails['expense']> {
  const e = await userDb(uid, (tx) =>
    tx.expenses.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        case_id: true,
        category_id: true,
        amount: true,
        spent_at: true,
        method: true,
        note: true,
        created_by: true,
        created_at: true,
        payroll_transaction_id: true,
        account_id: true,
        users: { select: { id: true, full_name: true } },
        expense_categories: { select: { id: true, code: true, name: true } },
        cases: { select: { number_title: true } },
      },
    }),
  );
  if (!e) return null;

  // Лейбл статьи — общим резолвером: встроенные из i18n, кастомные из name.
  const cats = await expenseCategoryMap();
  const cat = cats.get(e.category_id);

  return {
    id: e.id,
    case_id: e.case_id,
    category_id: e.category_id,
    amount: dec(e.amount),
    spent_at: dateOnly(e.spent_at),
    method: (e.method as ExpenseMethod | null) ?? null,
    note: e.note,
    created_by: e.created_by,
    created_at: ts(e.created_at),
    payroll_transaction_id: e.payroll_transaction_id,
    account_id: e.account_id,
    category: {
      id: e.category_id,
      code: cat?.code ?? e.expense_categories.code,
      label: cat?.label ?? e.expense_categories.name,
    },
    creator: e.users ? { id: e.users.id, full_name: e.users.full_name } : null,
    case_title: e.cases?.number_title ?? null,
  };
}

// =====================================================================
// listAccountsForPicker — счета для выпадающих списков форм (платёж, расход).
// Только справочные поля; доступно любому активному сотруднику (0016), потому
// что платёж вносит юрист, а права кассы выдаёт только владелец.
// =====================================================================
export async function listAccountsForPicker(): Promise<CashAccountPick[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await userDb(user.profile.id, (tx) => rpcCashAccountsPick(tx));
  } catch {
    // Счетов может не быть вовсе — форма просто не покажет поле.
    return [];
  }
}
