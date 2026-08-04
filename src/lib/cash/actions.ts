'use server';

import { revalidatePath } from 'next/cache';

import { logActivity } from '@/lib/activity-log/log';
import { requireAnyCap, requireCap, requireUser } from '@/lib/auth/require-role';
import { getCashEntryDetails, type CashEntryDetails } from '@/lib/cash/queries';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { toDbDate } from '@/lib/db/convert';
import { rpcCashBackfillPayments, rpcCashEntrySetIncluded } from '@/lib/db/rpc';
import { getT } from '@/lib/i18n/server';
import { CASH_ACCOUNT_KINDS, type CashAccountKind } from '@/lib/types/db';
import { UUID_RE, parseAmount, parseNonNegAmount, isWorkDate } from '@/lib/validation';

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
  else if (!isWorkDate(opening_date)) fieldErrors.opening_date = t.cash.actions.dateInvalid;

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
  else if (!isWorkDate(opening_date)) fieldErrors.opening_date = t.cash.actions.dateInvalid;

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
// Удаление счёта кассы (2026-07-26, просьба владельца: счета не только
// переименовывать, но и удалять).
//
// Счёт с операциями удалять НЕЛЬЗЯ: за ним стоят приходы платежей и расходы,
// и снос счёта увёл бы историю денег. На уровне БД это держит FK
// cash_entries_account_id_fkey ON DELETE RESTRICT; здесь считаем операции
// заранее, чтобы вместо сырой ошибки БД показать понятный текст и предложить
// сделать счёт неактивным.
// ============================================================================
export type DeleteCashAccountResult = {
  ok: boolean;
  message?: string;
  /** Сколько операций мешает удалению (для текста подсказки). */
  entryCount?: number;
};

export async function deleteCashAccountAction(
  id: string,
): Promise<DeleteCashAccountResult> {
  const user = await requireCap('can_manage_cash');
  const { t } = await getT();

  if (!id || !UUID_RE.test(id)) {
    return { ok: false, message: t.cash.actions.notFound };
  }

  const account = await userDb(user.profile.id, (tx) =>
    tx.cash_accounts.findUnique({ where: { id }, select: { name: true } }),
  );
  if (!account) return { ok: false, message: t.cash.actions.notFound };

  const entryCount = await userDb(user.profile.id, (tx) =>
    tx.cash_entries.count({ where: { account_id: id } }),
  );
  if (entryCount > 0) {
    return { ok: false, entryCount, message: t.cash.actions.accountHasEntries };
  }

  try {
    // deleteMany — под RLS это тихий no-op (0 строк), а не исключение.
    await userDb(user.profile.id, (tx) =>
      tx.cash_accounts.deleteMany({ where: { id } }),
    );
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'deleteCashAccountAction',
        err,
        t.cash.actions.accountDeleteFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'cash',
    entity_id: id,
    action: 'cash_account_deleted',
    changes: { name: account.name },
  });

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.accountDeleted };
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
  else if (!isWorkDate(entry_date)) fieldErrors.entry_date = t.cash.actions.dateInvalid;
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
// Карточка операции: детали тянутся лениво, по клику на строку журнала
// (2026-08-04). Гейт тот же, что у страницы кассы, — смотреть может и
// view_cash; править ли что-то, решает уже сама карточка по правам.
// ============================================================================
export async function loadCashEntryDetailsAction(
  entryId: string,
): Promise<CashEntryDetails | null> {
  await requireAnyCap(['view_cash', 'can_manage_cash']);
  if (!entryId || !UUID_RE.test(entryId)) return null;
  return getCashEntryDetails(entryId);
}

// ============================================================================
// Правка РУЧНОЙ операции кассы (2026-08-04). RLS-политика cash_entries_update
// была с самого начала, но формы к ней не существовало — операцию можно было
// только снести и завести заново. Авто-строки (приход платежа, розхід расхода)
// правятся через свою сущность: их RLS на UPDATE не отдаёт вовсе.
// ============================================================================
export async function updateCashEntryAction(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.caps.can_manage_cash) {
    return { ok: false, message: t.cash.actions.noPermission };
  }

  const id = String(formData.get('id') ?? '').trim();
  if (!id || !UUID_RE.test(id)) return { ok: false, message: t.cash.actions.notFound };

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
  else if (!isWorkDate(entry_date)) fieldErrors.entry_date = t.cash.actions.dateInvalid;
  if (!description) fieldErrors.description = t.cash.actions.descriptionRequired;
  else if (description.length > 300) fieldErrors.description = t.cash.actions.descriptionTooLong;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.cash.actions.checkForm };
  }

  // Снапшот «до» — и для журнала, и чтобы отличить авто-строку от ручной:
  // без этого правка авто-прихода упиралась бы в немой отказ RLS.
  const before = await userDb(user.profile.id, (tx) =>
    tx.cash_entries.findUnique({
      where: { id },
      select: {
        account_id: true,
        entry_date: true,
        direction: true,
        amount: true,
        description: true,
        payment_id: true,
        expense_id: true,
      },
    }),
  );
  if (!before) return { ok: false, message: t.cash.actions.notFound };
  if (before.payment_id !== null || before.expense_id !== null) {
    return { ok: false, message: t.cash.actions.autoRowReadonly };
  }

  const amount = parseAmount(amount_raw)!;

  try {
    const res = await userDb(user.profile.id, (tx) =>
      tx.cash_entries.updateMany({
        where: { id },
        data: {
          account_id,
          entry_date: toDbDate(entry_date),
          direction: direction as 'in' | 'out',
          amount,
          description,
        },
      }),
    );
    if (res.count === 0) return { ok: false, message: t.cash.actions.noPermission };
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('updateCashEntryAction', err, t.cash.actions.saveFailed, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'cash',
    entity_id: account_id,
    action: 'cash_entry_updated',
    changes: {
      entry_id: id,
      before: {
        account_id: before.account_id,
        direction: before.direction,
        amount: Number(before.amount),
        entry_date: before.entry_date.toISOString().slice(0, 10),
        description: before.description,
      },
      after: { account_id, direction, amount, entry_date, description },
    },
  });

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.entrySaved };
}

// ============================================================================
// «Внести в оборот» — операция раньше даты начального остатка счёта всё же
// учитывается (2026-08-04, решение владельца).
//
// Начальный остаток — это фотография счёта на дату: всё, что раньше, считается
// уже внутри неё. Но операцию задним числом вносят и тогда, когда в остаток она
// не попала. Флаг — точечное исключение; альтернатива (двигать дату счёта)
// меняет правило сразу для всех операций. Идёт через SECURITY DEFINER-RPC:
// отсечка бьёт и по авто-строкам, а их RLS на UPDATE не отдаёт.
// ============================================================================
export type CashEntryIncludeResult = { ok: boolean; message?: string };

export async function setCashEntryIncludedAction(
  entryId: string,
  value: boolean,
): Promise<CashEntryIncludeResult> {
  const user = await requireCap('can_manage_cash');
  const { t } = await getT();

  if (!entryId || !UUID_RE.test(entryId)) {
    return { ok: false, message: t.cash.actions.notFound };
  }

  // Описание — для журнала (по id операции потом не восстановить: строку могли
  // снять вместе с платежом).
  const row = await userDb(user.profile.id, (tx) =>
    tx.cash_entries.findUnique({
      where: { id: entryId },
      select: { account_id: true, entry_date: true, amount: true, description: true },
    }),
  );
  if (!row) return { ok: false, message: t.cash.actions.notFound };

  let ok: boolean;
  try {
    ok = await userDb(user.profile.id, (tx) =>
      rpcCashEntrySetIncluded(tx, { entryId, value }),
    );
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'setCashEntryIncludedAction',
        err,
        t.cash.actions.saveFailed,
        t.errors.db,
      ),
    };
  }
  if (!ok) return { ok: false, message: t.cash.actions.notFound };

  await logActivity({
    entity_type: 'cash',
    entity_id: row.account_id,
    action: 'cash_entry_updated',
    changes: {
      entry_id: entryId,
      include_before_opening: value,
      entry_date: row.entry_date.toISOString().slice(0, 10),
      amount: Number(row.amount),
      description: row.description,
    },
  });

  revalidatePath('/reports/cash');
  return { ok: true, message: value ? t.cash.actions.included : t.cash.actions.excluded };
}

// ============================================================================
// Перенос даты начального остатка счёта назад — второй выход из той же
// ситуации: операций раньше открытия счёта много и все они законны (счёт
// завели позже, чем начали вести дела).
//
// Меняется ТОЛЬКО дата: сам остаток остаётся прежним, поэтому отсечённые
// операции просто начинают считаться. Двигать дату вперёд отсюда нельзя —
// это молча выкинуло бы операции из оборотов; для этого есть форма счёта.
// ============================================================================
export type ShiftOpeningDateResult = { ok: boolean; message?: string };

export async function shiftAccountOpeningDateAction(
  accountId: string,
  newDate: string,
): Promise<ShiftOpeningDateResult> {
  const user = await requireCap('can_manage_cash');
  const { t } = await getT();

  if (!accountId || !UUID_RE.test(accountId)) {
    return { ok: false, message: t.cash.actions.notFound };
  }
  if (!isWorkDate(newDate)) {
    return { ok: false, message: t.cash.actions.dateInvalid };
  }

  const account = await userDb(user.profile.id, (tx) =>
    tx.cash_accounts.findUnique({
      where: { id: accountId },
      select: { name: true, opening_date: true },
    }),
  );
  if (!account) return { ok: false, message: t.cash.actions.notFound };

  const current = account.opening_date.toISOString().slice(0, 10);
  if (newDate >= current) {
    return { ok: false, message: t.cash.actions.openingDateNotEarlier };
  }

  try {
    const res = await userDb(user.profile.id, (tx) =>
      tx.cash_accounts.updateMany({
        where: { id: accountId },
        data: { opening_date: toDbDate(newDate) },
      }),
    );
    if (res.count === 0) return { ok: false, message: t.cash.actions.noPermission };
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'shiftAccountOpeningDateAction',
        err,
        t.cash.actions.saveFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'cash',
    entity_id: accountId,
    action: 'cash_account_updated',
    changes: { name: account.name, opening_date: { from: current, to: newDate } },
  });

  revalidatePath('/reports/cash');
  return { ok: true, message: t.cash.actions.openingDateMoved };
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
