'use server';

import { revalidatePath } from 'next/cache';

import { requireRole, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// numeric(14,2): 12 знаков до запятой, 2 после. До 999 999 999 999.99.
const MAX_AMOUNT = 1_000_000_000_000;

function parseAmount(raw: string): number | null {
  // Клиентам привычна и точка, и запятая — нормализуем.
  const normalized = raw.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n >= MAX_AMOUNT) return null;
  return n;
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  // Проверяем, что строка сериализуется обратно — отсекает 2026-02-31 и т.п.
  return d.toISOString().slice(0, 10) === s;
}

export async function createPaymentAction(
  _prev: CreatePaymentState,
  formData: FormData,
): Promise<CreatePaymentState> {
  const user = await requireUser();

  const case_id = String(formData.get('case_id') ?? '').trim();
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const paid_at = String(formData.get('paid_at') ?? '').trim();
  const method_raw = String(formData.get('method') ?? '').trim();
  const note_raw = String(formData.get('note') ?? '').trim();

  const fieldErrors: CreatePaymentState['fieldErrors'] = {};

  if (!case_id) fieldErrors.case_id = 'Не указано дело';
  else if (!UUID_RE.test(case_id))
    fieldErrors.case_id = 'Некорректный идентификатор дела';

  if (!amount_raw) fieldErrors.amount = 'Укажите сумму';
  else if (parseAmount(amount_raw) === null)
    fieldErrors.amount = 'Сумма должна быть больше 0, до 2 знаков после запятой';

  if (!paid_at) fieldErrors.paid_at = 'Укажите дату';
  else if (!isValidDate(paid_at))
    fieldErrors.paid_at = 'Некорректная дата';

  if (method_raw.length > 80) fieldErrors.method = 'Слишком длинно (макс 80)';
  if (note_raw.length > 500) fieldErrors.note = 'Слишком длинно (макс 500)';

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: 'Проверьте поля формы',
    };
  }

  const amount = parseAmount(amount_raw)!;
  const method = method_raw === '' ? null : method_raw;
  const note = note_raw === '' ? null : note_raw;

  const supabase = await createSupabaseServerClient();

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
    })
    .select('id')
    .single();

  if (error || !insertedPay) {
    return {
      ok: false,
      message: `Не удалось сохранить платёж: ${error?.message ?? 'unknown'}`,
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

// Bare action: удаление платежа. RLS DELETE = is_staff() only.
// requireRole — первая линия защиты: иначе specialist, форсящий POST вручную,
// проходит мимо silent-RLS-deny (supabase возвращает rows=0, error=null) и
// пишет фейковый `payment_deleted` в activity_log на видимое ему дело.
export async function deletePaymentAction(formData: FormData): Promise<void> {
  await requireRole(['owner', 'admin']);
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
