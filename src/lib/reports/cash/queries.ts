import 'server-only';

import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import {
  rpcCashBalancesBefore,
  rpcCashFlowMonthly,
  rpcCashTurnover,
  rpcIncomeBreakdown,
  type CashFlowMonthRow,
  type CashIncomeDim,
  type CashIncomeRow,
  type CashTurnoverRow,
} from '@/lib/db/rpc';
import { listCashAccounts } from '@/lib/cash/queries';
import { nextDay, type Period } from '@/lib/reports/period';
import type { CashAccount } from '@/lib/types/db';

// Данные отчётов кассы за период (2026-08-03). Всё через userDb → RLS и
// гейты прав внутри SQL-функций (миграция 0017). Ни одна функция здесь ничего
// не считает сверх того, что вернула БД, — расчёты живут в SQL и в documents.ts.

export type TurnoverData = {
  accounts: CashAccount[];
  /** accountId → обороты за период. */
  turnover: Record<string, CashTurnoverRow>;
  /** accountId → перенос остатка ДО начала периода (без opening_balance). */
  before: Record<string, number>;
  /** accountId → перенос остатка ДО конца периода включительно. */
  through: Record<string, number>;
};

/**
 * Оборотно-сальдовая: остатки на границах + обороты внутри.
 *
 * Остаток на начало = account.opening_balance + before[id];
 * остаток на конец   = account.opening_balance + through[id].
 * Так же считает существующая вкладка сальдо — цифры обязаны сходиться.
 */
// cache(): за один рендер страницы кассы эти данные просят три отчёта —
// оборотка, доходы (ради даты начала кассы) и финансовый итог.
export const getTurnoverData = cache(async function getTurnoverData(
  period: Period,
): Promise<TurnoverData> {
  const user = await getCurrentUser();
  if (!user) return { accounts: [], turnover: {}, before: {}, through: {} };
  const uid = user.profile.id;

  const [accounts, rows, beforeRows, throughRows] = await Promise.all([
    listCashAccounts(),
    userDb(uid, (tx) => rpcCashTurnover(tx, { from: period.from, to: period.to })),
    // Граница СТРОГО меньше: до первого дня периода.
    userDb(uid, (tx) => rpcCashBalancesBefore(tx, { before: period.from })),
    // …и по последний день периода включительно.
    userDb(uid, (tx) => rpcCashBalancesBefore(tx, { before: nextDay(period.to) })),
  ]);

  const turnover: Record<string, CashTurnoverRow> = {};
  for (const r of rows) turnover[r.account_id] = r;
  const before: Record<string, number> = {};
  for (const r of beforeRows) before[r.account_id] = r.balance;
  const through: Record<string, number> = {};
  for (const r of throughRows) through[r.account_id] = r.balance;

  return { accounts, turnover, before, through };
});

/** Движение денег по месяцам. Только месяцы с операциями — дыры дорисовывает UI. */
export async function getFlowData(period: Period): Promise<CashFlowMonthRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return userDb(user.profile.id, (tx) =>
    rpcCashFlowMonthly(tx, { from: period.from, to: period.to }),
  );
}

/**
 * Доходы «откуда пришли деньги» — по ОПЛАТАМ В ДЕЛАХ, не по кассе (решение
 * владельца 2026-08-03, см. шапку миграции 0017). RLS скоупит строки по
 * видимости дела: юрист увидит только свои.
 */
export async function getIncomeData(
  period: Period,
  dim: CashIncomeDim,
): Promise<CashIncomeRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return userDb(user.profile.id, (tx) =>
    rpcIncomeBreakdown(tx, { from: period.from, to: period.to, dim }),
  );
}

/**
 * Самая ранняя дата открытия счёта — «касса ведётся с …». Нужна для honest-
 * подписи: за более ранние периоды движения по счетам нет и быть не может.
 * null — счетов ещё нет.
 */
export function cashStartDate(accounts: ReadonlyArray<CashAccount>): string | null {
  if (accounts.length === 0) return null;
  return accounts.reduce(
    (min, a) => (a.opening_date < min ? a.opening_date : min),
    accounts[0]!.opening_date,
  );
}
