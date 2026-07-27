import Link from 'next/link';
import { ArrowRightLeft, ChevronLeft, Receipt } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { listExpenseCategoriesForSettings } from '@/lib/expenses/categories';
import { ExpenseCategoryCreateForm } from '@/components/expense-categories/expense-category-create-form';
import {
  ExpenseCategoryNameControl,
  ExpenseCategoryActiveControl,
  ExpenseCategoryScopeControl,
  ExpenseCategoryDeleteControl,
} from '@/components/expense-categories/expense-category-row-controls';

// Справочник статей расходов — управление по праву manage_expense_categories
// (RLS expense_categories_write_manage дублирует). Добавить свою статью,
// переименовать (кроме встроенных) и скрыть/вернуть. Удаления нет — только
// скрытие: у заведённых расходов статья должна сохраниться.
export default async function ExpenseCategoriesSettingsPage() {
  const actor = await requireCap('manage_expense_categories');
  const { t } = await getT();
  const categories = await listExpenseCategoriesForSettings();
  // Разбор старых «расходов-платежей» — разовый инструмент; требует ОБА права
  // (вносить расходы + удалять платежи), поэтому ссылку показываем адресно.
  const canCleanup = actor.caps.manage_case_expenses && actor.caps.delete_payments;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/settings"
        className="inline-flex w-fit items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {t.nav.settings}
      </Link>

      {/* Создание статьи */}
      <section className="flex flex-col gap-3">
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold text-text">
              {t.expenseCategories.heading}
            </h2>
          </div>
          <div className="p-5">
            <p className="mb-4 text-[13px] text-text-muted">
              {t.expenseCategories.intro}
            </p>
            <ExpenseCategoryCreateForm />
          </div>
        </Card>
      </section>

      {canCleanup && (
        <Link
          href="/settings/expense-cleanup"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] text-primary-pressed transition-colors hover:underline"
        >
          <ArrowRightLeft size={14} strokeWidth={1.75} />
          {t.expenseCleanup.heading}
        </Link>
      )}

      {/* Список статей */}
      <section className="flex flex-col gap-2">
        <p className="text-[12.5px] text-text-subtle">
          {t.expenseCategories.list.hint}
        </p>
        {categories.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            {t.expenseCategories.list.empty}
          </p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {categories.map((ec) => (
                <li
                  key={ec.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors ${
                    ec.is_active ? '' : 'opacity-70'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning-text">
                      <Receipt size={16} strokeWidth={1.75} />
                    </span>
                    <ExpenseCategoryNameControl
                      id={ec.id}
                      name={ec.label}
                      isBuiltin={ec.is_builtin}
                    />
                    {ec.is_builtin && (
                      <Badge tone="neutral" quiet>
                        {t.expenseCategories.list.builtinBadge}
                      </Badge>
                    )}
                    {ec.is_active ? (
                      <Badge tone="success" quiet>
                        {t.expenseCategories.list.statusActive}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" quiet>
                        {t.expenseCategories.list.statusInactive}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ExpenseCategoryScopeControl id={ec.id} scope={ec.scope} />
                    <ExpenseCategoryActiveControl id={ec.id} isActive={ec.is_active} />
                    {!ec.is_builtin && (
                      <ExpenseCategoryDeleteControl id={ec.id} name={ec.label} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}
