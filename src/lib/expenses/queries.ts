import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec, ts } from '@/lib/db/convert';
import { expenseCategoryMap } from '@/lib/expenses/categories';
import type { ExpenseMethod, ExpenseWithRefs } from '@/lib/types/db';

// Общий select строки расхода: поля + статья + автор (+ дело, где нужно).
const EXPENSE_SELECT = {
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
} as const;

type RawExpense = {
  id: string;
  case_id: string | null;
  category_id: string;
  amount: unknown;
  spent_at: Date;
  method: string | null;
  note: string | null;
  created_by: string;
  created_at: Date;
  payroll_transaction_id: string | null;
  account_id: string | null;
  users: { id: string; full_name: string } | null;
  expense_categories: { id: string; code: string; name: string };
};

async function toRows(rows: RawExpense[]): Promise<ExpenseWithRefs[]> {
  if (rows.length === 0) return [];
  // Лейблы статей — через общий резолвер (встроенные из i18n, кастомные из name).
  const cats = await expenseCategoryMap();

  return rows.map((r) => {
    const cat = cats.get(r.category_id);
    return {
      id: r.id,
      case_id: r.case_id,
      category_id: r.category_id,
      amount: dec(r.amount),
      spent_at: dateOnly(r.spent_at),
      method: (r.method as ExpenseMethod | null) ?? null,
      note: r.note,
      created_by: r.created_by,
      created_at: ts(r.created_at),
      payroll_transaction_id: r.payroll_transaction_id,
      account_id: r.account_id,
      category: {
        id: r.category_id,
        code: cat?.code ?? r.expense_categories.code,
        label: cat?.label ?? r.expense_categories.name,
      },
      creator: r.users ? { id: r.users.id, full_name: r.users.full_name } : null,
    };
  });
}

// =====================================================================
// listExpensesByCase — список расходов на карточке дела.
// Сортировка: spent_at desc, created_at desc (на одну дату новые сверху).
//
// Видимость режет RLS expenses_select: для строки с делом это
// can_see_case(case_id) AND can('view_case_expenses'). Сотруднику без права
// придёт пустой список (fail-closed), поэтому UI дополнительно прячет блок по
// caps — чтобы не показывать пустую карточку тому, кому расходы не положены.
// =====================================================================
export async function listExpensesByCase(
  caseId: string,
): Promise<ExpenseWithRefs[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.expenses.findMany({
      where: { case_id: caseId },
      orderBy: [{ spent_at: 'desc' }, { created_at: 'desc' }],
      select: EXPENSE_SELECT,
    }),
  );

  return toRows(rows as RawExpense[]);
}

// Сумма расходов по делу (для сводки Дохід/Витрати/Маржа, когда список не нужен).
export async function getCaseExpenseTotal(caseId: string): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;

  const agg = await userDb(user.profile.id, (tx) =>
    tx.expenses.aggregate({
      where: { case_id: caseId },
      _sum: { amount: true },
    }),
  );

  return agg._sum.amount ? dec(agg._sum.amount) : 0;
}

// =====================================================================
// listCompanyExpenses — расходы фирмы (case_id IS NULL) за период: аренда,
// налоги, связь, зарплата. Видимость режет RLS по правам кассы.
// Период — 'YYYY-MM-DD' включительно с обеих сторон.
// =====================================================================
export async function listCompanyExpenses(
  from: string,
  to: string,
): Promise<ExpenseWithRefs[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.expenses.findMany({
      where: {
        case_id: null,
        spent_at: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      orderBy: [{ spent_at: 'desc' }, { created_at: 'desc' }],
      select: EXPENSE_SELECT,
    }),
  );

  return toRows(rows as RawExpense[]);
}
