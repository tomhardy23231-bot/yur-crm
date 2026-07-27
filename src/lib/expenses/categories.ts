import 'server-only';

import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { getT } from '@/lib/i18n/server';

// Справочник статей расходов (public.expense_categories) — источник вариантов
// для формы расхода и отчётов. Встроенные 9 статей (коды court_fee..other)
// локализуются через i18n enums.expenseCategory по code; кастомные (добавленные
// из интерфейса) показываются своим name. RLS expense_categories_select_active
// отдаёт справочник любому активному сотруднику — гейт стоит не здесь, а на
// самих расходах (view_case_expenses). Зеркало lib/cases/case-types.ts.

// Где предлагать статью (0013): расход по делу / расход фирмы / везде.
export type ExpenseScope = 'case' | 'company' | 'both';

export type ExpenseCategoryRow = {
  id: string;
  code: string;
  name: string;
  is_builtin: boolean;
  is_active: boolean;
  sort_order: number;
  scope: ExpenseScope;
};

// Опция селекта статьи: id (хранится в case_expenses.category_id) + лейбл.
export type ExpenseCategoryOption = { id: string; code: string; label: string };

// Полная строка справочника с готовым лейблом — для страницы настроек.
export type ExpenseCategoryManaged = ExpenseCategoryRow & { label: string };

// Сырой справочник (активные + скрытые), упорядочен sort_order → name.
// Request-cached: список читают несколько компонентов одного рендера.
const fetchAllExpenseCategories = cache(async (): Promise<ExpenseCategoryRow[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  // scope в БД — text с CHECK; сужаем до union уже здесь, чтобы дальше по коду
  // ходил типизированный вариант.
  const rows = await userDb(user.profile.id, (tx) =>
    tx.expense_categories.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        is_builtin: true,
        is_active: true,
        sort_order: true,
        scope: true,
      },
    }),
  );
  return rows.map((r) => ({ ...r, scope: r.scope as ExpenseScope }));
});

// Лейбл статьи по коду: встроенные — из словаря enums.expenseCategory
// (двуязычно), кастомные — свой name справочника; неизвестный код — как есть.
export const expenseCategoryLabeler = cache(
  async (): Promise<(code: string) => string> => {
    const { t } = await getT();
    const dict = t.enums.expenseCategory as Record<string, string | undefined>;
    const rows = await fetchAllExpenseCategories();
    const names = new Map<string, string>();
    for (const r of rows) names.set(r.code, r.name);
    return (code: string) => dict[code] ?? names.get(code) ?? code;
  },
);

// Активные статьи для селекта формы расхода, в порядке sort_order.
// scope: 'case' — форма расхода по делу, 'company' — расход фирмы. Статьи со
// scope='both' («Інше») предлагаются в обеих формах. Без аргумента — все
// активные (отчёты, справочник настроек).
export async function listActiveExpenseCategories(
  scope?: 'case' | 'company',
): Promise<ExpenseCategoryOption[]> {
  const { t } = await getT();
  const dict = t.enums.expenseCategory as Record<string, string | undefined>;
  const rows = await fetchAllExpenseCategories();
  return rows
    .filter((r) => r.is_active)
    .filter((r) => !scope || r.scope === scope || r.scope === 'both')
    .map((r) => ({ id: r.id, code: r.code, label: dict[r.code] ?? r.name }));
}

// Полный справочник (активные + скрытые) с лейблами — страница настроек.
export async function listExpenseCategoriesForSettings(): Promise<ExpenseCategoryManaged[]> {
  const { t } = await getT();
  const dict = t.enums.expenseCategory as Record<string, string | undefined>;
  const rows = await fetchAllExpenseCategories();
  return rows.map((r) => ({ ...r, label: dict[r.code] ?? r.name }));
}

// Множество id АКТИВНЫХ статей — валидация выбранной статьи при создании
// расхода (скрытую заводить нельзя, но на старых записях она остаётся).
export async function activeExpenseCategoryIdSet(): Promise<ReadonlySet<string>> {
  const rows = await fetchAllExpenseCategories();
  return new Set(rows.filter((r) => r.is_active).map((r) => r.id));
}

// Карта id → { code, label } для резолва статьи в списках и отчётах.
export async function expenseCategoryMap(): Promise<
  ReadonlyMap<string, { code: string; label: string }>
> {
  const rows = await listExpenseCategoriesForSettings();
  return new Map(rows.map((r) => [r.id, { code: r.code, label: r.label }]));
}
