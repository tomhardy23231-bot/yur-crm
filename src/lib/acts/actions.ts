'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACT_COMPLETIONS, MANAGER_ROLES, STAFF_ROLES, type ActCompletion } from '@/lib/types/db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1_000_000_000_000;
const MAX_BYTES = 25 * 1024 * 1024;
const FORBIDDEN_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr',
  'ps1', 'vbs', 'js', 'jse', 'wsf', 'wsh',
  'dll', 'sh', 'lnk',
]);

function parseAmount(raw: string): number | null {
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
  return d.toISOString().slice(0, 10) === s;
}

function slugifyFilename(name: string): string {
  return (
    name
      .normalize('NFC')
      .replace(/[^\x20-\x7E]+/g, '-')
      .replace(/[\\/\s]+/g, '-')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'file'
  );
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

// ============================================================================
// Создание акта (issued). RLS: Експерт своего дела + staff с доступом к делу.
// ============================================================================
export type CreateActFields = 'case_id' | 'service_name' | 'amount' | 'service_period' | 'note';

export type CreateActState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CreateActFields, string>>;
};

export async function createActAction(
  _prev: CreateActState,
  formData: FormData,
): Promise<CreateActState> {
  const user = await requireUser();
  const { t } = await getT();

  const case_id = String(formData.get('case_id') ?? '').trim();
  const service_name = String(formData.get('service_name') ?? '').trim() || 'Юридичні послуги';
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const service_period = String(formData.get('service_period') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  const fieldErrors: CreateActState['fieldErrors'] = {};
  if (!case_id || !UUID_RE.test(case_id)) fieldErrors.case_id = t.acts.actions.caseInvalid;
  if (!amount_raw) fieldErrors.amount = t.acts.actions.amountRequired;
  else if (parseAmount(amount_raw) === null) fieldErrors.amount = t.acts.actions.amountInvalid;
  if (service_name.length > 200) fieldErrors.service_name = t.acts.actions.serviceNameTooLong;
  if (service_period.length > 120) fieldErrors.service_period = t.acts.actions.periodTooLong;
  if (note.length > 500) fieldErrors.note = t.acts.actions.noteTooLong;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.acts.actions.checkForm };
  }

  const supabase = await createSupabaseServerClient();

  // Право (зеркало RLS case_acts_insert): staff ИЛИ Експерт-исполнитель дела.
  const { data: caseRow } = await supabase
    .from('cases')
    .select('responsible_id')
    .eq('id', case_id)
    .maybeSingle();
  if (!caseRow) {
    return { ok: false, message: t.acts.actions.caseInvalid };
  }
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  const isExpertOfCase = (caseRow as { responsible_id: string }).responsible_id === user.profile.id;
  if (!isStaff && !isExpertOfCase) {
    return { ok: false, message: t.acts.actions.noCreatePermission };
  }

  const amount = parseAmount(amount_raw)!;

  const { data: inserted, error } = await supabase
    .from('case_acts')
    .insert({
      case_id,
      service_name,
      amount,
      service_period: service_period || null,
      note: note || null,
      created_by: user.profile.id,
    })
    .select('id, number')
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      message: dbErrorMessage('createActAction', error, t.acts.actions.createFailed, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: case_id,
    action: 'act_created',
    changes: { act_id: inserted.id, number: inserted.number, amount },
  });

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// ============================================================================
// Подтверждение оплаты: скан (обяз.) + сумма + дата → платёж по делу + акт paid.
// Право: lawyer своего дела + owner/admin (зеркало confirm_act_paid).
// ============================================================================
export type ConfirmActFields = 'amount' | 'paid_at' | 'file';

export type ConfirmActState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<ConfirmActFields, string>>;
};

export async function confirmActPaidAction(
  _prev: ConfirmActState,
  formData: FormData,
): Promise<ConfirmActState> {
  const user = await requireUser();
  const { t } = await getT();

  const act_id = String(formData.get('act_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const paid_at = String(formData.get('paid_at') ?? '').trim();
  const fileEntry = formData.get('file');

  if (!act_id || !UUID_RE.test(act_id) || !case_id || !UUID_RE.test(case_id)) {
    return { ok: false, message: t.acts.actions.actInvalid };
  }

  const fieldErrors: ConfirmActState['fieldErrors'] = {};
  if (!amount_raw) fieldErrors.amount = t.acts.actions.amountRequired;
  else if (parseAmount(amount_raw) === null) fieldErrors.amount = t.acts.actions.amountInvalid;
  if (!paid_at) fieldErrors.paid_at = t.acts.actions.dateRequired;
  else if (!isValidDate(paid_at)) fieldErrors.paid_at = t.acts.actions.dateInvalid;

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    fieldErrors.file = t.acts.actions.scanRequired;
  } else if (fileEntry.size > MAX_BYTES) {
    fieldErrors.file = t.acts.actions.scanUploadFailed;
  } else {
    const ext = fileExtension(fileEntry.name);
    if (ext && FORBIDDEN_EXT.has(ext)) fieldErrors.file = t.acts.actions.scanUploadFailed;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.acts.actions.checkForm };
  }

  const supabase = await createSupabaseServerClient();

  // Право + состояние акта (зеркало RPC): подтверждает lawyer дела / owner / admin;
  // акт должен быть issued.
  const { data: actRow } = await supabase
    .from('case_acts')
    .select('status, case_id, case:case_id(lawyer_id)')
    .eq('id', act_id)
    .maybeSingle();
  if (!actRow) {
    return { ok: false, message: t.acts.actions.actInvalid };
  }
  type ActJoin = { status: string; case_id: string; case: { lawyer_id: string } | { lawyer_id: string }[] | null };
  const ar = actRow as unknown as ActJoin;
  const caseJoin = Array.isArray(ar.case) ? (ar.case[0] ?? null) : ar.case;
  // Подтверждает lawyer дела ИЛИ owner/admin (по роли — зеркало confirm_act_paid,
  // которая гейтит role-only can_manage_users(); НЕ caps.manage_users-оверрайд).
  const isManager = MANAGER_ROLES.includes(user.profile.role);
  const isLawyerOfCase = caseJoin?.lawyer_id === user.profile.id;
  if (!isManager && !isLawyerOfCase) {
    return { ok: false, message: t.acts.actions.noConfirmPermission };
  }
  if (ar.status !== 'issued') {
    return { ok: false, message: t.acts.actions.alreadyPaid };
  }

  const amount = parseAmount(amount_raw)!;
  const file = fileEntry as File;

  // 1) Загружаем скан в Storage. Строку documents создаёт сама RPC (атомарно с
  //    платежом), поэтому при ошибке RPC откатываем только Storage-файл — осиротевшей
  //    documents-записи не остаётся (юрист и так не имеет права DELETE на documents).
  const storageKey = `cases/${case_id}/${randomUUID()}--${slugifyFilename(file.name)}`;
  const contentType = file.type || 'application/octet-stream';
  const buffer = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from('case-documents')
    .upload(storageKey, buffer, { contentType, upsert: false });
  if (uploadErr) {
    return {
      ok: false,
      message: dbErrorMessage('confirmActPaidAction.storage', uploadErr, t.acts.actions.scanUploadFailed, t.errors.db),
    };
  }

  // 2) Атомарное подтверждение: documents(скан) + платёж (act_id) + completion +
  //    акт paid + журнал — всё в одной транзакции внутри SECURITY DEFINER RPC.
  const { error: rpcErr } = await supabase.rpc('confirm_act_paid', {
    p_act_id: act_id,
    p_confirmed_amount: amount,
    p_paid_at: paid_at,
    p_storage_key: storageKey,
    p_file_name: file.name,
    p_method: 'act',
    p_note: null,
  });

  if (rpcErr) {
    // Подтверждение не состоялось → чистим только загруженный Storage-файл.
    await supabase.storage.from('case-documents').remove([storageKey]).catch(() => {});
    return {
      ok: false,
      message: dbErrorMessage('confirmActPaidAction.rpc', rpcErr, t.acts.actions.confirmFailed, t.errors.db),
    };
  }

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// ============================================================================
// Удаление неоплаченного (issued) акта. RLS: owner/admin или автор; только issued.
// ============================================================================
export async function deleteActAction(formData: FormData): Promise<void> {
  await requireUser();
  const act_id = String(formData.get('act_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!act_id || !UUID_RE.test(act_id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('case_acts')
    .delete()
    .eq('id', act_id)
    .eq('status', 'issued');
  if (error) {
    console.error('deleteActAction failed:', error.message);
    return;
  }
  if (case_id && UUID_RE.test(case_id)) revalidatePath(`/cases/${case_id}`);
}

// ============================================================================
// Переопределение отметки выполнения (staff) для оплаченного акта.
// ============================================================================
export async function setActCompletionAction(formData: FormData): Promise<void> {
  await requireUser();
  const act_id = String(formData.get('act_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();
  const completion = String(formData.get('completion') ?? '').trim();
  if (!act_id || !UUID_RE.test(act_id)) return;
  if (!(ACT_COMPLETIONS as readonly string[]).includes(completion)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_act_completion', {
    p_act_id: act_id,
    p_completion: completion as ActCompletion,
  });
  if (error) {
    console.error('setActCompletionAction failed:', error.message);
    return;
  }
  if (case_id && UUID_RE.test(case_id)) revalidatePath(`/cases/${case_id}`);
}
