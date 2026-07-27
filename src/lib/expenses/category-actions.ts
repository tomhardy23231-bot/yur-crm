'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError, pgErrorCode } from '@/lib/db/errors';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';

// Управление справочником статей расходов — по праву manage_expense_categories
// (RLS expense_categories_write_manage дублирует на стороне БД). Зеркало
// lib/case-types/actions.ts: встроенные статьи можно скрывать, но НЕ
// переименовывать (их лейбл — из словаря enums.expenseCategory). Удаления нет —
// только скрытие: код остаётся, у заведённых расходов статья не ломается
// (FK case_expenses_category_id_fkey ON DELETE RESTRICT страхует и на уровне БД).

const MAX_NAME = 60;

export type ExpenseCategoryFormState = {
  ok: boolean;
  message?: string;
  fieldError?: string;
  /**
   * Созданная статья — чтобы форма расхода могла сразу подставить её в селект,
   * не перезагружая страницу (2026-07-26: «нужна кнопка добавить статью»).
   */
  created?: { id: string; code: string; name: string };
};

// Транслитерация укр/рус → латиница для генерации code из названия.
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ё: 'e',
  ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'iu', я: 'ia',
};

function slugifyCategory(name: string): string {
  let out = '';
  for (const ch of name.trim().toLowerCase()) {
    if (ch in TRANSLIT) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s\-_]/.test(ch)) out += '_';
    // прочее (пунктуация/эмодзи) — пропускаем
  }
  return out.replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

// ============================================================================
// Создание статьи расхода (useActionState-форма).
// ============================================================================
export async function createExpenseCategoryAction(
  _prev: ExpenseCategoryFormState,
  formData: FormData,
): Promise<ExpenseCategoryFormState> {
  const actor = await requireUser();
  const { t } = await getT();
  if (!actor.caps.manage_expense_categories) {
    return { ok: false, message: t.errors.db.noPermission };
  }

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, fieldError: t.expenseCategories.errors.enterName };
  if (name.length > MAX_NAME)
    return { ok: false, fieldError: t.expenseCategories.errors.nameTooLong };

  // Где предлагать статью (0013). Форма расхода передаёт свой контекст, чтобы
  // заведённая «на лету» статья сразу попадала в нужный список.
  const scopeRaw = String(formData.get('scope') ?? 'both').trim();
  const scope =
    scopeRaw === 'case' || scopeRaw === 'company' || scopeRaw === 'both'
      ? scopeRaw
      : 'both';

  let created: { id: string; code: string };
  try {
    created = await userDb(actor.profile.id, async (tx) => {
      const base = slugifyCategory(name) || 'expense';
      const existing = await tx.expense_categories.findMany({ select: { code: true } });
      const taken = new Set(existing.map((r) => r.code));
      let code = base;
      let n = 2;
      while (taken.has(code)) code = `${base}_${n++}`;
      const agg = await tx.expense_categories.aggregate({ _max: { sort_order: true } });
      const nextOrder = (agg._max.sort_order ?? 0) + 10;
      return tx.expense_categories.create({
        data: { code, name, sort_order: nextOrder, scope },
        select: { id: true, code: true },
      });
    });
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      return { ok: false, fieldError: t.expenseCategories.errors.nameTaken };
    }
    return {
      ok: false,
      message: dbActionError('createExpenseCategoryAction', err, undefined, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'expense_category',
    entity_id: created.id,
    action: 'expense_category_created',
    changes: { code: created.code, name, scope },
  });

  revalidatePath('/settings/expense-categories');
  revalidatePath('/reports/cash');
  return {
    ok: true,
    message: t.expenseCategories.created,
    created: { id: created.id, code: created.code, name },
  };
}

// ============================================================================
// Переименование статьи (bare action, inline-форма). Встроенные — нельзя.
// ============================================================================
export async function renameExpenseCategoryAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_expense_categories) return;

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!UUID_RE.test(id) || !name || name.length > MAX_NAME) return;

  let beforeName: string | null = null;
  try {
    beforeName = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.expense_categories.findUnique({
        where: { id },
        select: { name: true, is_builtin: true },
      });
      if (!before || before.is_builtin || before.name === name) return null;
      const upd = await tx.expense_categories.updateMany({
        where: { id, is_builtin: false },
        data: { name },
      });
      return upd.count > 0 ? before.name : null;
    });
  } catch (err) {
    console.error('renameExpenseCategoryAction failed:', err);
    return;
  }
  if (beforeName === null) return;

  await logActivity({
    entity_type: 'expense_category',
    entity_id: id,
    action: 'expense_category_renamed',
    changes: { from: beforeName, to: name },
  });
  revalidatePath('/settings/expense-categories');
}

// ============================================================================
// Скрытие / показ статьи (bare action, кнопка). Скрытая пропадает из селекта
// формы расхода, но у заведённых расходов сохраняется.
// ============================================================================
export async function setExpenseCategoryActiveAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_expense_categories) return;

  const id = String(formData.get('id') ?? '').trim();
  const active_raw = String(formData.get('active') ?? '').trim();
  if (!UUID_RE.test(id) || (active_raw !== 'true' && active_raw !== 'false')) return;
  const nextActive = active_raw === 'true';

  let changed: { code: string; name: string } | null = null;
  try {
    changed = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.expense_categories.findUnique({
        where: { id },
        select: { is_active: true, code: true, name: true },
      });
      if (!before || before.is_active === nextActive) return null;
      const upd = await tx.expense_categories.updateMany({
        where: { id },
        data: { is_active: nextActive },
      });
      return upd.count > 0 ? { code: before.code, name: before.name } : null;
    });
  } catch (err) {
    console.error('setExpenseCategoryActiveAction failed:', err);
    return;
  }
  if (!changed) return;

  await logActivity({
    entity_type: 'expense_category',
    entity_id: id,
    action: nextActive ? 'expense_category_activated' : 'expense_category_deactivated',
    changes: { is_active: nextActive, code: changed.code, name: changed.name },
  });
  revalidatePath('/settings/expense-categories');
}

// ============================================================================
// Смена области применения статьи: по делу / по фирме / везде (0013).
// ============================================================================
export async function setExpenseCategoryScopeAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_expense_categories) return;

  const id = String(formData.get('id') ?? '').trim();
  const scope = String(formData.get('scope') ?? '').trim();
  if (!UUID_RE.test(id)) return;
  if (scope !== 'case' && scope !== 'company' && scope !== 'both') return;

  let changed: { from: string; name: string } | null = null;
  try {
    changed = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.expense_categories.findUnique({
        where: { id },
        select: { scope: true, name: true },
      });
      if (!before || before.scope === scope) return null;
      const upd = await tx.expense_categories.updateMany({ where: { id }, data: { scope } });
      return upd.count > 0 ? { from: before.scope, name: before.name } : null;
    });
  } catch (err) {
    console.error('setExpenseCategoryScopeAction failed:', err);
    return;
  }
  if (!changed) return;

  await logActivity({
    entity_type: 'expense_category',
    entity_id: id,
    action: 'expense_category_scope_changed',
    changes: { from: changed.from, to: scope, name: changed.name },
  });
  revalidatePath('/settings/expense-categories');
  revalidatePath('/reports/cash');
}

// ============================================================================
// Удаление статьи. Только СВОЯ (не встроенная) и только пока по ней нет
// расходов: иначе история потеряла бы название траты. На уровне БД это же
// держит FK expenses.category_id ON DELETE RESTRICT — здесь считаем заранее,
// чтобы вместо сырой ошибки показать понятный отказ.
// ============================================================================
export type DeleteExpenseCategoryResult = {
  ok: boolean;
  message?: string;
  /** Сколько расходов мешает удалению (для текста подсказки). */
  usedBy?: number;
};

export async function deleteExpenseCategoryAction(
  id: string,
): Promise<DeleteExpenseCategoryResult> {
  const actor = await requireUser();
  const { t } = await getT();
  if (!actor.caps.manage_expense_categories) {
    return { ok: false, message: t.errors.db.noPermission };
  }
  if (!UUID_RE.test(id)) return { ok: false, message: t.expenseCategories.errors.notFound };

  const row = await userDb(actor.profile.id, (tx) =>
    tx.expense_categories.findUnique({
      where: { id },
      select: { name: true, code: true, is_builtin: true },
    }),
  );
  if (!row) return { ok: false, message: t.expenseCategories.errors.notFound };
  if (row.is_builtin) {
    return { ok: false, message: t.expenseCategories.errors.builtinNoDelete };
  }

  const usedBy = await userDb(actor.profile.id, (tx) =>
    tx.expenses.count({ where: { category_id: id } }),
  );
  if (usedBy > 0) {
    return { ok: false, usedBy, message: t.expenseCategories.errors.inUse };
  }

  try {
    await userDb(actor.profile.id, (tx) =>
      tx.expense_categories.deleteMany({ where: { id, is_builtin: false } }),
    );
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('deleteExpenseCategoryAction', err, undefined, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'expense_category',
    entity_id: id,
    action: 'expense_category_deleted',
    changes: { code: row.code, name: row.name },
  });
  revalidatePath('/settings/expense-categories');
  revalidatePath('/reports/cash');
  return { ok: true, message: t.expenseCategories.deleted };
}
