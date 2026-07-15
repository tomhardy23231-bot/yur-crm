import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec, toDbDate, ts } from '@/lib/db/convert';
import {
  rpcCashBalancesBefore,
  rpcCashUnsyncedPaymentsCount,
} from '@/lib/db/rpc';
import { nextMonth } from '@/lib/payroll/month';
import type {
  CashAccount,
  CashDirection,
  CashEntryWithCase,
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
  created_by: true,
  created_at: true,
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
  created_by: string;
  created_at: Date;
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
    created_by: r.created_by,
    created_at: ts(r.created_at),
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

// Потолок выборки операций месяца. Раньше страховал от молчаливого усечения
// PostgREST (max_rows=1000); у Prisma тихого усечения нет, но лимит оставляем как
// защиту от аномально большого месяца + сравниваем с count() для флага truncated.
const MONTH_ENTRY_LIMIT = 5000;

export type CashReportData = {
  accounts: CashAccount[];
  // Операции ТОЛЬКО выбранного месяца (свежие не теряются под потолком выборки).
  // Перенос из прошлых периодов считается SQL'ем (openingBalances), а не выкачкой истории.
  entries: CashEntryWithCase[];
  // Перенос остатка на начало месяца по счёту (accountId → net до monthStart, начиная с
  // opening_date). Эффективный остаток на начало = account.opening_balance + это число.
  openingBalances: Record<string, number>;
  // true, если операций за месяц больше лимита выборки (показать предупреждение в UI).
  truncated: boolean;
};

// Данные сальдо-отчёта за месяц. month — 'YYYY-MM-01' (см. lib/payroll/month).
// Тянем ТОЛЬКО операции выбранного месяца, а перенос остатка на начало месяца
// считаем SQL-функцией cash_balances_before (без выкачки всей истории). RLS/право
// скоупит по can_manage_cash.
export async function getCashReportData(month: string): Promise<CashReportData> {
  const user = await getCurrentUser();
  if (!user) {
    return { accounts: [], entries: [], openingBalances: {}, truncated: false };
  }
  const uid = user.profile.id;
  const monthStart = month; // 'YYYY-MM-01'
  const upperExclusive = nextMonth(month); // первый день следующего месяца (строго меньше)
  const entryWhere = {
    entry_date: { gte: toDbDate(monthStart), lt: toDbDate(upperExclusive) },
  };

  const [accounts, balances, entryRows, total] = await Promise.all([
    listCashAccounts(),
    userDb(uid, (tx) => rpcCashBalancesBefore(tx, { before: monthStart })),
    userDb(uid, (tx) =>
      tx.cash_entries.findMany({
        where: entryWhere,
        orderBy: [{ entry_date: 'asc' }, { created_at: 'asc' }],
        take: MONTH_ENTRY_LIMIT,
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
