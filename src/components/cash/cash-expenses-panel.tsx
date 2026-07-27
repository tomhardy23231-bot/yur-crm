'use client';

import Link from 'next/link';
import { Link2, Receipt, Wallet } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { AddExpenseDialog } from '@/components/expenses/add-expense-dialog';
import { DeleteExpenseButton } from '@/components/expenses/delete-expense-button';
import { useI18n } from '@/lib/i18n/provider';
import { cn, formatMoney } from '@/lib/utils';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import type { CategorySpendRow, CategorySpendTotals } from '@/lib/expenses/report';
import type { CashAccount, ExpenseWithRefs } from '@/lib/types/db';

// Вкладка «Витрати» кассы (2026-07-26): расходы фирмы за месяц + разбивка по
// статьям — ответ на вопрос клиента «куда сколько ушло». Траты по делам сюда
// не попадают: они живут на карточке дела, но в разбивку по статьям входят
// отдельной колонкой.
export function CashExpensesPanel({
  expenses,
  categories,
  spend,
  totals,
  canManage,
  accounts,
  canAddCategory,
}: {
  /** Расходы фирмы (case_id IS NULL) за выбранный месяц. */
  expenses: ExpenseWithRefs[];
  categories: ExpenseCategoryOption[];
  /** Разбивка по статьям за тот же месяц (включая траты по делам). */
  spend: CategorySpendRow[];
  totals: CategorySpendTotals;
  /** Право can_manage_cash: без него — только просмотр. */
  canManage: boolean;
  /** Счета кассы — выбор конкретного счёта списания. */
  accounts: CashAccount[];
  /** Право заводить статьи «на лету». */
  canAddCategory: boolean;
}) {
  const { t } = useI18n();
  const c = t.expenses.company;

  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col gap-4" data-tour="cash-expenses-panel">
      {/* Итоги месяца + кнопка добавления */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-[12.5px] text-text-muted">
            {c.totalMonth}{' '}
            <span className="font-mono text-[17px] font-bold tabular-nums text-error">
              −{formatMoney(totals.total)} ₴
            </span>
          </span>
          <span className="text-[12px] text-text-subtle">
            {c.fromCompany}{' '}
            <span className="font-mono font-semibold tabular-nums text-text">
              {formatMoney(totals.companyTotal)} ₴
            </span>
          </span>
          <span className="text-[12px] text-text-subtle">
            {c.fromCases}{' '}
            <span className="font-mono font-semibold tabular-nums text-text">
              {formatMoney(totals.caseTotal)} ₴
            </span>
          </span>
        </div>
        {canManage && (
          <AddExpenseDialog
            categories={categories}
            accounts={accounts}
            canAddCategory={canAddCategory}
          />
        )}
      </div>

      {/* Разбивка по статьям — «куда ушло» */}
      {spend.length > 0 && (
        <div className="rounded-card border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-2.5">
            <h3 className="text-[13.5px] font-semibold text-text">{c.byCategory}</h3>
          </div>
          <ul className="flex flex-col divide-y divide-border/60">
            {spend.map((r) => {
              const share = totals.total > 0 ? (r.total / totals.total) * 100 : 0;
              return (
                <li key={r.category_id} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                    {r.label}
                  </span>
                  {/* Полоса доли: длина = вклад статьи в расходы месяца. */}
                  <span
                    className="hidden h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-surface-sunken sm:block"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-error/70"
                      style={{ width: `${Math.max(2, Math.round(share))}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-text-subtle">
                    {Math.round(share)}%
                  </span>
                  <span className="w-28 shrink-0 text-right font-mono text-[13px] font-bold tabular-nums text-text">
                    {formatMoney(r.total)} ₴
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Список расходов фирмы за месяц */}
      {expenses.length === 0 ? (
        <div className="rounded-card border border-border bg-surface shadow-sm">
          <EmptyState icon={Receipt} title={c.empty} hint={c.hint} />
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <h3 className="text-[13.5px] font-semibold text-text">{c.heading}</h3>
            <span className="font-mono text-[12.5px] font-semibold tabular-nums text-error">
              −{formatMoney(monthTotal)} ₴
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-border/60">
            {expenses.map((e) => {
              const isAuto = e.payroll_transaction_id !== null;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 transition-colors hover:bg-primary-softer"
                >
                  <span className="font-mono text-[12px] tabular-nums text-text-subtle">
                    {e.spent_at}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-chip bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-text">
                    <Receipt size={11} strokeWidth={2.25} aria-hidden="true" />
                    {e.category.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                    {e.note ?? ''}
                  </span>
                  {e.case_id && (
                    <Link
                      href={`/cases/${e.case_id}`}
                      title={c.caseHint}
                      className="inline-flex items-center gap-1 font-mono text-[12px] text-primary hover:underline"
                    >
                      <Link2 size={12} strokeWidth={1.75} />
                    </Link>
                  )}
                  {e.method && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-text-subtle">
                      <Wallet size={11} strokeWidth={1.75} aria-hidden="true" />
                      {t.enums.expenseMethod[e.method]}
                    </span>
                  )}
                  {isAuto && (
                    <Badge tone="info" quiet title={c.autoHint}>
                      {c.autoBadge}
                    </Badge>
                  )}
                  <span className={cn('font-mono text-[13px] font-bold tabular-nums text-error')}>
                    −{formatMoney(e.amount)} ₴
                  </span>
                  {/* Зарплатные строки правятся только через саму выплату. */}
                  {canManage && !isAuto ? (
                    <DeleteExpenseButton
                      expenseId={e.id}
                      caseId={e.case_id ?? ''}
                      alwaysVisible
                    />
                  ) : (
                    <span className="inline-block h-7 w-7" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
