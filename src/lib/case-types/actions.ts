'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError, pgErrorCode } from '@/lib/db/errors';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';

// Управление справочником типов дел — по праву manage_case_types (RLS
// case_types_write_manage дублирует на стороне БД; здесь — ранний понятный отказ
// и журнал). Все операции идут под сессией пользователя (RLS работает).
// Встроенные типы (is_builtin) можно скрывать, но НЕ переименовывать (их лейбл —
// из словаря enums.caseType). Удаления нет — только скрытие (как у подразделений):
// код остаётся в справочнике, у заведённых дел тип не ломается.

const MAX_NAME = 60;

export type CaseTypeFormState = {
  ok: boolean;
  message?: string;
  fieldError?: string;
};

// Транслитерация укр/рус → латиница для генерации code из названия. Код —
// внутренний стабильный идентификатор (хранится в cases.case_type, ходит в
// ?type=). Читаемость приятна для отладки; уникальность гарантируют суффиксы.
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ё: 'e',
  ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'iu', я: 'ia',
};

function slugifyCaseType(name: string): string {
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
// Создание типа дела (useActionState-форма).
// ============================================================================
export async function createCaseTypeAction(
  _prev: CaseTypeFormState,
  formData: FormData,
): Promise<CaseTypeFormState> {
  const actor = await requireUser();
  const { t } = await getT();
  if (!actor.caps.manage_case_types) {
    return { ok: false, message: t.errors.db.noPermission };
  }

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, fieldError: t.caseTypes.errors.enterName };
  if (name.length > MAX_NAME)
    return { ok: false, fieldError: t.caseTypes.errors.nameTooLong };

  let created: { id: string; code: string };
  try {
    created = await userDb(actor.profile.id, async (tx) => {
      // Свободный code из имени (транслит + числовой суффикс при коллизии).
      const base = slugifyCaseType(name) || 'type';
      const existing = await tx.case_types.findMany({ select: { code: true } });
      const taken = new Set(existing.map((r) => r.code));
      let code = base;
      let n = 2;
      while (taken.has(code)) code = `${base}_${n++}`;
      // sort_order — в конец списка (шаг 10).
      const agg = await tx.case_types.aggregate({ _max: { sort_order: true } });
      const nextOrder = (agg._max.sort_order ?? 0) + 10;
      return tx.case_types.create({
        data: { code, name, sort_order: nextOrder },
        select: { id: true, code: true },
      });
    });
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      return { ok: false, fieldError: t.caseTypes.errors.nameTaken };
    }
    return {
      ok: false,
      message: dbActionError('createCaseTypeAction', err, undefined, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'case_type',
    entity_id: created.id,
    action: 'case_type_created',
    changes: { code: created.code, name },
  });

  revalidatePath('/settings/case-types');
  return { ok: true, message: t.caseTypes.created };
}

// ============================================================================
// Переименование типа дела (bare action, inline-форма). Встроенные — нельзя.
// ============================================================================
export async function renameCaseTypeAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_case_types) return;

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!UUID_RE.test(id) || !name || name.length > MAX_NAME) return;

  let beforeName: string | null = null;
  try {
    beforeName = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.case_types.findUnique({
        where: { id },
        select: { name: true, is_builtin: true },
      });
      // Нет записи / встроенный (переименование запрещено) / no-op.
      if (!before || before.is_builtin || before.name === name) return null;
      const upd = await tx.case_types.updateMany({
        where: { id, is_builtin: false },
        data: { name },
      });
      return upd.count > 0 ? before.name : null;
    });
  } catch (err) {
    console.error('renameCaseTypeAction failed:', err);
    return;
  }
  if (beforeName === null) return;

  await logActivity({
    entity_type: 'case_type',
    entity_id: id,
    action: 'case_type_renamed',
    changes: { from: beforeName, to: name },
  });
  revalidatePath('/settings/case-types');
}

// ============================================================================
// Скрытие / показ типа дела (bare action, кнопка). Скрытый тип пропадает из
// селектов формы/фильтров, но у заведённых дел сохраняется (код в справочнике).
// ============================================================================
export async function setCaseTypeActiveAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_case_types) return;

  const id = String(formData.get('id') ?? '').trim();
  const active_raw = String(formData.get('active') ?? '').trim();
  if (!UUID_RE.test(id) || (active_raw !== 'true' && active_raw !== 'false')) return;
  const nextActive = active_raw === 'true';

  let changed: { code: string; name: string } | null = null;
  try {
    changed = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.case_types.findUnique({
        where: { id },
        select: { is_active: true, code: true, name: true },
      });
      if (!before || before.is_active === nextActive) return null; // нет / no-op
      const upd = await tx.case_types.updateMany({
        where: { id },
        data: { is_active: nextActive },
      });
      return upd.count > 0 ? { code: before.code, name: before.name } : null;
    });
  } catch (err) {
    console.error('setCaseTypeActiveAction failed:', err);
    return;
  }
  if (!changed) return;

  await logActivity({
    entity_type: 'case_type',
    entity_id: id,
    action: nextActive ? 'case_type_activated' : 'case_type_deactivated',
    changes: { is_active: nextActive, code: changed.code, name: changed.name },
  });
  revalidatePath('/settings/case-types');
}
