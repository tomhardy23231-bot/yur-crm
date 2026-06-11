'use server';

import { revalidatePath } from 'next/cache';

import { requireCap, requireUser } from '@/lib/auth/require-role';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CASH_ACCOUNT_KINDS, type CashAccountKind } from '@/lib/types/db';
import { UUID_RE, parseAmount, parseNonNegAmount, isValidDate } from '@/lib/validation';

// Валидаторы суммы/даты/UUID — в @/lib/validation: parseAmount (> 0) для операций,
// parseNonNegAmount (>= 0) для начального остатка счёта.

// Если выставляем новый дефолтный счёт — снимаем флаг с прежнего (partial-unique
// индекс cash_accounts_one_default допускает лишь один is_default на компанию).
async function clearOtherDefaults(exceptId: string | null): Promise<void> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from('cash_accounts').update({ is_default: false }).eq('is_default', true);
  if (exceptId) q = q.neq('id', exceptId);
  await q;
}

// ============================================================================
// Создание счёта кассы. Право — can_manage_cash (по дефолту только owner).
// ============================================================================
export type CashAccountFields = 'name' | 'kind' | 'opening_balance' | 'opening_date';

export type CashAccountState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CashAccountFields, string>>;
};

export async function createCashAccountAction(
  _prev: CashAccountState,
  formData: FormData,
): Promise<CashAccountState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.caps.can_manage_cash) {
    return { ok: false, message: t.cash.actions.noPermission };
  }

  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim();
  const opening_balance_raw = String(formData.get('opening_balance') ?? '').trim();
  const opening_date = String(formData.get('opening_date') ?? '').trim();
  const is_default = formData.get('is_default') === 'on' || formData.get('is_default') === 'true';

  const fieldErrors: CashAccountState['fieldErrors'] = {};
  if (!name) fieldErrors.name = t.cash.actions.nameRequired;
  else if (name.length > 120) fieldErrors.name = t.cash.actions.nameTooLong;
  if (!(CASH_ACCOUNT_KINDS as readonly string[]).includes(kind)) {
    fieldErrors.kind = t.cash.actions.kindInvalid;
  }
  const opening_balance = parseNonNegAmount(opening_balance_raw);
  if (opening_balance === null) fieldErrors.opening_balance = t.cash.actions.amountInvalid;
  if (!opening_date) fieldErrors.opening_date = t.cash.actions.dateRequired;
  else if (!isValidDate(opening_date)) fieldErrors.opening_date = t.cash.actions.dateInvalid;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.cash.actions.checkForm };
  }

  if (is_default) await clearOtherDefaults(null);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('cash_accounts').insert({
    name,
    kind: kind as CashAccountKind,
    opening_balance,
    opening_date,
    is_default,
    created_by: user.profile.id,
  });

  if (error) {
    return {
      ok: false,
      message: dbErrorMessage('createCashAccountAction', error, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.accountSaved };
}

// ============================================================================
// Правка счёта: переименование, активность, дефолт, начальный остаток/дата.
// ============================================================================
export async function updateCashAccountAction(
  _prev: CashAccountState,
  formData: FormData,
): Promise<CashAccountState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.caps.can_manage_cash) {
    return { ok: false, message: t.cash.actions.noPermission };
  }

  const id = String(formData.get('id') ?? '').trim();
  if (!id || !UUID_RE.test(id)) return { ok: false, message: t.cash.actions.notFound };

  const name = String(formData.get('name') ?? '').trim();
  const opening_balance_raw = String(formData.get('opening_balance') ?? '').trim();
  const opening_date = String(formData.get('opening_date') ?? '').trim();
  const is_active = formData.get('is_active') === 'on' || formData.get('is_active') === 'true';
  const is_default = formData.get('is_default') === 'on' || formData.get('is_default') === 'true';

  const fieldErrors: CashAccountState['fieldErrors'] = {};
  if (!name) fieldErrors.name = t.cash.actions.nameRequired;
  else if (name.length > 120) fieldErrors.name = t.cash.actions.nameTooLong;
  const opening_balance = parseNonNegAmount(opening_balance_raw);
  if (opening_balance === null) fieldErrors.opening_balance = t.cash.actions.amountInvalid;
  if (!opening_date) fieldErrors.opening_date = t.cash.actions.dateRequired;
  else if (!isValidDate(opening_date)) fieldErrors.opening_date = t.cash.actions.dateInvalid;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.cash.actions.checkForm };
  }

  if (is_default) await clearOtherDefaults(id);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cash_accounts')
    .update({ name, opening_balance, opening_date, is_active, is_default })
    .eq('id', id);

  if (error) {
    return {
      ok: false,
      message: dbErrorMessage('updateCashAccountAction', error, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.accountSaved };
}

// ============================================================================
// Ручная операция кассы (приход/расход), не привязанная к делу. payment_id IS NULL.
// ============================================================================
export type CashEntryFields = 'account_id' | 'entry_date' | 'direction' | 'amount' | 'description';

export type CashEntryState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CashEntryFields, string>>;
};

export async function createCashEntryAction(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.caps.can_manage_cash) {
    return { ok: false, message: t.cash.actions.noPermission };
  }

  const account_id = String(formData.get('account_id') ?? '').trim();
  const entry_date = String(formData.get('entry_date') ?? '').trim();
  const direction = String(formData.get('direction') ?? '').trim();
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  const fieldErrors: CashEntryState['fieldErrors'] = {};
  if (!account_id || !UUID_RE.test(account_id)) fieldErrors.account_id = t.cash.actions.accountInvalid;
  if (direction !== 'in' && direction !== 'out') fieldErrors.direction = t.cash.actions.directionInvalid;
  if (!amount_raw) fieldErrors.amount = t.cash.actions.amountRequired;
  else if (parseAmount(amount_raw) === null) fieldErrors.amount = t.cash.actions.amountInvalid;
  if (!entry_date) fieldErrors.entry_date = t.cash.actions.dateRequired;
  else if (!isValidDate(entry_date)) fieldErrors.entry_date = t.cash.actions.dateInvalid;
  if (!description) fieldErrors.description = t.cash.actions.descriptionRequired;
  else if (description.length > 300) fieldErrors.description = t.cash.actions.descriptionTooLong;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.cash.actions.checkForm };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('cash_entries').insert({
    account_id,
    entry_date,
    direction: direction as 'in' | 'out',
    amount: parseAmount(amount_raw)!,
    description,
    created_by: user.profile.id,
    // payment_id остаётся NULL — это ручная операция (RLS требует payment_id IS NULL).
  });

  if (error) {
    return {
      ok: false,
      message: dbErrorMessage('createCashEntryAction', error, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.entrySaved };
}

// ============================================================================
// Удаление РУЧНОЙ операции (payment_id IS NULL — RLS отсекает авто-приходы).
// Bare-form action (void) по образцу deletePaymentAction/deleteAbsenceAction.
// ============================================================================
export async function deleteCashEntryAction(formData: FormData): Promise<void> {
  await requireCap('can_manage_cash');
  const id = String(formData.get('id') ?? '').trim();
  if (!id || !UUID_RE.test(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('cash_entries').delete().eq('id', id);
  if (error) {
    console.error('deleteCashEntryAction failed:', error.message);
    return;
  }
  revalidatePath('/reports/cash');
}

// ============================================================================
// Бэкфилл кассы: завести недостающие операции по платежам, у которых нет строки
// кассы (внесены до настройки счетов). Право — can_manage_cash. Возвращает число
// созданных операций. RPC идемпотентна (повторный вызов → 0).
// ============================================================================
export type CashBackfillResult = { ok: boolean; count?: number; message?: string };

export async function backfillCashAction(): Promise<CashBackfillResult> {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.caps.can_manage_cash) {
    return { ok: false, message: t.cash.actions.noPermission };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('cash_backfill_payments');
  if (error) {
    return {
      ok: false,
      message: dbErrorMessage('backfillCashAction', error, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  revalidatePath('/reports/cash');
  return { ok: true, count: Number(data ?? 0) };
}
