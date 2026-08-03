import 'server-only';

import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import {
  rpcExpensesByCategory,
  rpcFinanceByCase,
  type ExpenseByCategoryRow,
  type FinanceByCaseRow,
} from '@/lib/db/rpc';
import { expenseCategoryLabeler } from '@/lib/expenses/categories';

// Отчёт прибыльности «Доходы−Расходы» (/reports/profit).
//
// Скоуп строк держит RLS внутри SECURITY INVOKER-функции finance_by_case:
// дела режет private.case_visible (owner — всё, руководитель/офис-менеджер —
// своё подразделение, юрист/Експерт — свои дела), расходы дополнительно
// требуют права view_case_expenses.
//
// ⚠️ Доход здесь — SUM(payments.amount) за период, ТОЛЬКО для показа. Ни
// cases.paid_total, ни расчёт зарплаты этот отчёт не трогает.

export type ProfitRow = FinanceByCaseRow;

export type ProfitTotals = {
  income: number;
  expense: number;
  margin: number;
};

// cache(): за один рендер кассы это просят вкладка «За справами» и сборщик
// одноимённого отчёта — запрос тяжёлый, дублировать его незачем.
export const getProfitByCase = cache(async function getProfitByCase(
  from: string | null,
  to: string | null,
): Promise<ProfitRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    rpcFinanceByCase(tx, { from, to }),
  );
  // Сначала самые прибыльные, затем убыточные — чтобы «минус» бросался в глаза
  // в конце списка; при равной марже — по доходу.
  return rows.sort((a, b) => b.margin - a.margin || b.income - a.income);
});

export function sumProfit(rows: ReadonlyArray<ProfitRow>): ProfitTotals {
  return rows.reduce<ProfitTotals>(
    (acc, r) => ({
      income: acc.income + r.income,
      expense: acc.expense + r.expense,
      margin: acc.margin + r.margin,
    }),
    { income: 0, expense: 0, margin: 0 },
  );
}

// =====================================================================
// Расходы по статьям за период — ответ на вопрос клиента «куда сколько ушло»
// (2026-07-26). Лейблы встроенных статей берём из i18n по code, кастомных —
// из name (тот же резолвер, что у справочника).
// =====================================================================
export type CategorySpendRow = ExpenseByCategoryRow & { label: string };

export type CategorySpendTotals = {
  total: number;
  caseTotal: number;
  companyTotal: number;
};

// cache(): просят вкладка «Витрати», одноимённый отчёт и финансовый итог.
export const getExpensesByCategory = cache(async function getExpensesByCategory(
  from: string | null,
  to: string | null,
): Promise<CategorySpendRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    rpcExpensesByCategory(tx, { from, to }),
  );
  const label = await expenseCategoryLabeler();
  // Функция уже отдаёт по убыванию суммы — порядок не трогаем.
  return rows.map((r) => ({ ...r, label: label(r.code) }));
});

export function sumCategorySpend(
  rows: ReadonlyArray<CategorySpendRow>,
): CategorySpendTotals {
  return rows.reduce<CategorySpendTotals>(
    (acc, r) => ({
      total: acc.total + r.total,
      caseTotal: acc.caseTotal + r.case_total,
      companyTotal: acc.companyTotal + r.company_total,
    }),
    { total: 0, caseTotal: 0, companyTotal: 0 },
  );
}
