'use server';

import { revalidatePath } from 'next/cache';

import { logActivity } from '@/lib/activity-log/log';
import { requireCap, requireUser } from '@/lib/auth/require-role';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { toDbDate } from '@/lib/db/convert';
import { rpcCashBackfillPayments } from '@/lib/db/rpc';
import { getT } from '@/lib/i18n/server';
import { CASH_ACCOUNT_KINDS, type CashAccountKind } from '@/lib/types/db';
import { UUID_RE, parseAmount, parseNonNegAmount, isValidDate } from '@/lib/validation';

// Валидаторы суммы/даты/UUID — в @/lib/validation: parseAmount (> 0) для операций,
// parseNonNegAmount (>= 0) для начального остатка счёта.

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

  // Снятие флага с прежнего дефолта + вставка — одной транзакцией (partial-unique
  // индекс cash_accounts_one_default допускает лишь один is_default на компанию).
  let createdId: string | null = null;
  try {
    await userDb(user.profile.id, async (tx) => {
      if (is_default) {
        await tx.cash_accounts.updateMany({
          where: { is_default: true },
          data: { is_default: false },
        });
      }
      const created = await tx.cash_accounts.create({
        data: {
          name,
          kind: kind as CashAccountKind,
          opening_balance: opening_balance!,
          opening_date: toDbDate(opening_date),
          is_default,
          created_by: user.profile.id,
        },
        select: { id: true },
      });
      createdId = created.id;
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('createCashAccountAction', err, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  if (createdId) {
    await logActivity({
      entity_type: 'cash',
      entity_id: createdId,
      action: 'cash_account_created',
      changes: { name, kind, opening_balance, opening_date, is_default },
    });
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

  try {
    await userDb(user.profile.id, async (tx) => {
      if (is_default) {
        await tx.cash_accounts.updateMany({
          where: { is_default: true, NOT: { id } },
          data: { is_default: false },
        });
      }
      await tx.cash_accounts.updateMany({
        where: { id },
        data: {
          name,
          opening_balance: opening_balance!,
          opening_date: toDbDate(opening_date),
          is_active,
          is_default,
        },
      });
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('updateCashAccountAction', err, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'cash',
    entity_id: id,
    action: 'cash_account_updated',
    changes: { name, opening_balance, opening_date, is_active, is_default },
  });

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

  let accountName: string | null = null;
  try {
    await userDb(user.profile.id, async (tx) => {
      await tx.cash_entries.create({
        data: {
          account_id,
          entry_date: toDbDate(entry_date),
          direction: direction as 'in' | 'out',
          amount: parseAmount(amount_raw)!,
          description,
          created_by: user.profile.id,
          // payment_id остаётся NULL — это ручная операция (RLS требует payment_id IS NULL).
        },
      });
      const acc = await tx.cash_accounts.findUnique({
        where: { id: account_id },
        select: { name: true },
      });
      accountName = acc?.name ?? null;
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('createCashEntryAction', err, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'cash',
    entity_id: account_id,
    action: 'cash_entry_created',
    changes: {
      account_name: accountName,
      direction,
      amount: parseAmount(amount_raw),
      entry_date,
      description,
    },
  });

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.entrySaved };
}

// ============================================================================
// Удаление РУЧНОЙ операции (payment_id IS NULL — RLS отсекает авто-приходы).
// Bare-form action (void) по образцу deletePaymentAction/deleteAbsenceAction.
// ============================================================================
export async function deleteCashEntryAction(formData: FormData): Promise<void> {
  const user = await requireCap('can_manage_cash');
  const id = String(formData.get('id') ?? '').trim();
  if (!id || !UUID_RE.test(id)) return;

  // Детали строки — до удаления (в журнал пишем, что именно снесли).
  let deleted: {
    account_id: string;
    account_name: string | null;
    direction: string;
    amount: number;
    entry_date: string;
    description: string;
  } | null = null;

  try {
    // Возврат из колбэка (не присваивание в замыкании) — иначе TS теряет тип.
    deleted = await userDb(user.profile.id, async (tx) => {
      const row = await tx.cash_entries.findUnique({
        where: { id },
        select: {
          account_id: true,
          direction: true,
          amount: true,
          entry_date: true,
          description: true,
          payment_id: true,
          cash_accounts: { select: { name: true } },
        },
      });
      // deleteMany — тихий no-op, если строка невидима или это авто-приход
      // (RLS DELETE отсекает payment_id IS NOT NULL).
      const res = await tx.cash_entries.deleteMany({ where: { id } });
      if (res.count === 0 || !row || row.payment_id !== null) return null;
      return {
        account_id: row.account_id,
        account_name: row.cash_accounts?.name ?? null,
        direction: row.direction,
        amount: Number(row.amount),
        entry_date: row.entry_date.toISOString().slice(0, 10),
        description: row.description,
      };
    });
  } catch (err) {
    console.error('deleteCashEntryAction failed:', err);
    return;
  }

  if (deleted !== null) {
    await logActivity({
      entity_type: 'cash',
      entity_id: deleted.account_id,
      action: 'cash_entry_deleted',
      changes: {
        account_name: deleted.account_name,
        direction: deleted.direction,
        amount: deleted.amount,
        entry_date: deleted.entry_date,
        description: deleted.description,
      },
    });
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

  let count: number;
  try {
    count = await userDb(user.profile.id, (tx) => rpcCashBackfillPayments(tx));
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('backfillCashAction', err, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  revalidatePath('/reports/cash');
  return { ok: true, count };
}
