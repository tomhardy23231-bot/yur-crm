'use server';

import { revalidatePath } from 'next/cache';

import { requireCap, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UUID_RE, parseAmount, isValidDate } from '@/lib/validation';

export type CreatePaymentFields =
  | 'case_id'
  | 'amount'
  | 'paid_at'
  | 'method'
  | 'note';

export type CreatePaymentState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CreatePaymentFields, string>>;
};

export async function createPaymentAction(
  _prev: CreatePaymentState,
  formData: FormData,
): Promise<CreatePaymentState> {
  const user = await requireUser();
  const { t } = await getT();

  const case_id = String(formData.get('case_id') ?? '').trim();
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const paid_at = String(formData.get('paid_at') ?? '').trim();
  const method_raw = String(formData.get('method') ?? '').trim();
  const note_raw = String(formData.get('note') ?? '').trim();
  // Ключ идемпотентности (Задача 2). Если форма прислала валидный UUID — кладём
  // его в payments.idempotency_key; уникальный индекс отвергнет дубль. Невалидный
  // / отсутствующий ключ → null (вставка без защиты — мягкая деградация).
  const idem_raw = String(formData.get('idempotency_key') ?? '').trim();
  const idempotency_key = UUID_RE.test(idem_raw) ? idem_raw : null;

  const fieldErrors: CreatePaymentState['fieldErrors'] = {};

  if (!case_id) fieldErrors.case_id = t.payments.errors.caseRequired;
  else if (!UUID_RE.test(case_id))
    fieldErrors.case_id = t.payments.errors.caseInvalid;

  if (!amount_raw) fieldErrors.amount = t.payments.errors.amountRequired;
  else if (parseAmount(amount_raw) === null)
    fieldErrors.amount = t.payments.errors.amountInvalid;

  if (!paid_at) fieldErrors.paid_at = t.payments.errors.dateRequired;
  else if (!isValidDate(paid_at))
    fieldErrors.paid_at = t.payments.errors.dateInvalid;

  if (method_raw.length > 80) fieldErrors.method = t.payments.errors.methodTooLong;
  if (note_raw.length > 500) fieldErrors.note = t.payments.errors.noteTooLong;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: t.errors.checkForm,
    };
  }

  const amount = parseAmount(amount_raw)!;
  const method = method_raw === '' ? null : method_raw;
  const note = note_raw === '' ? null : note_raw;

  const supabase = await createSupabaseServerClient();

  // Задача 2 (defense-in-depth): серверный дедуп-гард. Если за последние ~3 секунды
  // от того же пользователя по тому же делу уже прошёл платёж на ту же сумму —
  // считаем это повторной отправкой и тихо отдаём успех, не плодя строку и не
  // показывая ошибку. Основная (атомарная) защита — стабильный idempotency_key +
  // уникальный индекс; этот гард страхует на случай разных ключей (refresh формы).
  const dedupSince = new Date(Date.now() - 3000).toISOString();
  const { data: recentDup } = await supabase
    .from('payments')
    .select('id')
    .eq('case_id', case_id)
    .eq('created_by', user.profile.id)
    .eq('amount', amount)
    .gte('created_at', dedupSince)
    .limit(1)
    .maybeSingle();
  if (recentDup) {
    revalidatePath(`/cases/${case_id}`);
    return { ok: true };
  }

  // RLS WITH CHECK: payments_insert_via_case требует
  // can_write_case(case_id) AND created_by = active_uid().
  const { data: insertedPay, error } = await supabase
    .from('payments')
    .insert({
      case_id,
      amount,
      paid_at,
      method,
      note,
      created_by: user.profile.id,
      idempotency_key,
    })
    .select('id')
    .single();

  if (error || !insertedPay) {
    // Задача 2: дубль по idempotency_key (мульти-сабмит) → нарушение уникального
    // индекса (SQLSTATE 23505). Первый платёж уже прошёл — тихо отдаём успех,
    // ошибку не показываем. Логировать/ревалидировать тоже не нужно: запись одна.
    if (error?.code === '23505') {
      revalidatePath(`/cases/${case_id}`);
      return { ok: true };
    }
    return {
      ok: false,
      message: dbErrorMessage(
        'createPaymentAction',
        error,
        t.payments.errors.saveFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: case_id,
    action: 'payment_created',
    changes: {
      payment_id: insertedPay.id,
      amount,
      paid_at,
      method,
    },
  });

  // paid_total/debt пересчитываются триггерами payments_recalc + cases_recompute_debt.
  // Revalidate перечитает cases-row и список платежей.
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// Bare action: удаление платежа. RLS UPDATE/DELETE = private.can('edit_payments').
// requireCap — первая линия защиты: иначе пользователь без права, форсящий POST
// вручную, прошёл бы мимо silent-RLS-deny (rows=0, error=null) и записал бы
// фейковый `payment_deleted` в activity_log на видимое ему дело.
export async function deletePaymentAction(formData: FormData): Promise<void> {
  await requireCap('edit_payments');
  const payment_id = String(formData.get('payment_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();

  if (!payment_id || !UUID_RE.test(payment_id)) return;

  const supabase = await createSupabaseServerClient();

  // Снапшот для лога — после delete amount уже не достать.
  const { data: payBefore } = await supabase
    .from('payments')
    .select('amount, case_id')
    .eq('id', payment_id)
    .maybeSingle();

  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', payment_id);

  if (error) {
    console.error('deletePaymentAction failed:', error.message);
    return;
  }

  // CSO #2: case_id для лога берём из payBefore (DB-truth), не из user-controlled
  // formData — иначе authenticated мог бы перенаправить запись activity_log
  // на чужой видимый case_id.
  if (payBefore?.case_id && UUID_RE.test(payBefore.case_id)) {
    const trueCid = payBefore.case_id;
    await logActivity({
      entity_type: 'case',
      entity_id: trueCid,
      action: 'payment_deleted',
      changes: {
        payment_id,
        amount: Number(payBefore.amount),
      },
    });
    revalidatePath(`/cases/${trueCid}`);
  } else if (case_id && UUID_RE.test(case_id)) {
    // RLS не пустил к payBefore — лог не пишем (нечего логировать),
    // но UI пересобираем по user-supplied case_id для редиректа.
    revalidatePath(`/cases/${case_id}`);
  }
}

// ============================================================================
// График платежей (v3 Сессия 9). Плановая доплата = дата + сумма (+ примечание).
// RLS: INSERT/DELETE = private.can_write_case(case_id) (как задачи). UPDATE нет —
// правка через удаление + создание.
// ============================================================================
export type CreatePlanItemFields = 'case_id' | 'due_date' | 'amount' | 'note';

export type CreatePlanItemState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CreatePlanItemFields, string>>;
};

export async function createPlanItemAction(
  _prev: CreatePlanItemState,
  formData: FormData,
): Promise<CreatePlanItemState> {
  const user = await requireUser();
  const { t } = await getT();

  const case_id = String(formData.get('case_id') ?? '').trim();
  const due_date = String(formData.get('due_date') ?? '').trim();
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const note_raw = String(formData.get('note') ?? '').trim();

  const fieldErrors: CreatePlanItemState['fieldErrors'] = {};

  if (!case_id) fieldErrors.case_id = t.payments.errors.caseRequired;
  else if (!UUID_RE.test(case_id))
    fieldErrors.case_id = t.payments.errors.caseInvalid;

  if (!due_date) fieldErrors.due_date = t.payments.errors.dateRequired;
  else if (!isValidDate(due_date))
    fieldErrors.due_date = t.payments.errors.dateInvalid;

  if (!amount_raw) fieldErrors.amount = t.payments.errors.amountRequired;
  else if (parseAmount(amount_raw) === null)
    fieldErrors.amount = t.payments.errors.amountInvalid;

  if (note_raw.length > 300) fieldErrors.note = t.payments.errors.noteTooLong;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.errors.checkForm };
  }

  const amount = parseAmount(amount_raw)!;
  const note = note_raw === '' ? null : note_raw;

  const supabase = await createSupabaseServerClient();

  // RLS WITH CHECK: plan_insert_via_case = can_write_case(case_id) AND
  // created_by = active_uid(). case_id возвращаем для лога (DB-truth).
  const { data: inserted, error } = await supabase
    .from('payment_plan_items')
    .insert({
      case_id,
      due_date,
      amount,
      note,
      created_by: user.profile.id,
    })
    .select('id, case_id')
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      message: dbErrorMessage(
        'createPlanItemAction',
        error,
        t.payments.plan.saveFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: inserted.case_id,
    action: 'payment_plan_updated',
    changes: { item_id: inserted.id, op: 'created', due_date, amount },
  });

  revalidatePath(`/cases/${inserted.case_id}`);
  return { ok: true };
}

// Bare action: удаление позиции графика. RLS DELETE = can_write_case(case_id).
export async function deletePlanItemAction(formData: FormData): Promise<void> {
  await requireUser();
  const item_id = String(formData.get('item_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();

  if (!item_id || !UUID_RE.test(item_id)) return;

  const supabase = await createSupabaseServerClient();

  // Снапшот для лога — после delete не достать. case_id берём из БД (CSO #2),
  // не из user-controlled formData.
  const { data: before } = await supabase
    .from('payment_plan_items')
    .select('case_id, due_date, amount')
    .eq('id', item_id)
    .maybeSingle<{ case_id: string; due_date: string; amount: number }>();

  const { error } = await supabase
    .from('payment_plan_items')
    .delete()
    .eq('id', item_id);

  if (error) {
    console.error('deletePlanItemAction failed:', error.message);
    return;
  }

  if (before?.case_id && UUID_RE.test(before.case_id)) {
    const trueCid = before.case_id;
    await logActivity({
      entity_type: 'case',
      entity_id: trueCid,
      action: 'payment_plan_updated',
      changes: {
        item_id,
        op: 'deleted',
        due_date: before.due_date,
        amount: Number(before.amount),
      },
    });
    revalidatePath(`/cases/${trueCid}`);
  } else if (case_id && UUID_RE.test(case_id)) {
    revalidatePath(`/cases/${case_id}`);
  }
}
