'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { dec } from '@/lib/db/convert';
import { rpcConfirmActPaid, rpcSetActCompletion } from '@/lib/db/rpc';
import { getT } from '@/lib/i18n/server';
import { storage } from '@/lib/storage';
import { ACT_COMPLETIONS, MANAGER_ROLES, STAFF_ROLES } from '@/lib/types/db';
import { UUID_RE, parseAmount, isValidDate } from '@/lib/validation';

const MAX_BYTES = 25 * 1024 * 1024;
const FORBIDDEN_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr',
  'ps1', 'vbs', 'js', 'jse', 'wsf', 'wsh',
  'dll', 'sh', 'lnk',
]);

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

  const amount = parseAmount(amount_raw)!;
  const isStaff = STAFF_ROLES.includes(user.profile.role);

  // Право (зеркало RLS case_acts_insert): staff ИЛИ Експерт-исполнитель дела.
  // Read + insert в одной tx: RLS всё равно вторая линия (WITH CHECK на insert).
  let result:
    | { kind: 'ok'; id: string; number: number }
    | { kind: 'caseInvalid' }
    | { kind: 'noPermission' };
  try {
    result = await userDb(user.profile.id, async (tx) => {
      const caseRow = await tx.cases.findUnique({
        where: { id: case_id },
        select: { responsible_id: true },
      });
      if (!caseRow) return { kind: 'caseInvalid' as const };
      const isExpertOfCase = caseRow.responsible_id === user.profile.id;
      if (!isStaff && !isExpertOfCase) return { kind: 'noPermission' as const };

      const inserted = await tx.case_acts.create({
        data: {
          case_id,
          service_name,
          amount,
          service_period: service_period || null,
          note: note || null,
          created_by: user.profile.id,
        },
        select: { id: true, number: true },
      });
      return { kind: 'ok' as const, id: inserted.id, number: inserted.number };
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('createActAction', err, t.acts.actions.createFailed, t.errors.db),
    };
  }

  if (result.kind === 'caseInvalid') return { ok: false, message: t.acts.actions.caseInvalid };
  if (result.kind === 'noPermission') return { ok: false, message: t.acts.actions.noCreatePermission };

  await logActivity({
    entity_type: 'case',
    entity_id: case_id,
    action: 'act_created',
    changes: { act_id: result.id, number: result.number, amount },
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

  // Право + состояние акта (зеркало RPC): подтверждает lawyer дела / owner / admin;
  // акт должен быть issued.
  const actRow = await userDb(user.profile.id, (tx) =>
    tx.case_acts.findUnique({
      where: { id: act_id },
      select: { status: true, case_id: true, cases: { select: { lawyer_id: true } } },
    }),
  );
  if (!actRow) {
    return { ok: false, message: t.acts.actions.actInvalid };
  }
  // Подтверждает lawyer дела ИЛИ owner/admin (по роли — зеркало confirm_act_paid,
  // которая гейтит role-only can_manage_users(); НЕ caps.manage_users-оверрайд).
  const isManager = MANAGER_ROLES.includes(user.profile.role);
  const isLawyerOfCase = actRow.cases?.lawyer_id === user.profile.id;
  if (!isManager && !isLawyerOfCase) {
    return { ok: false, message: t.acts.actions.noConfirmPermission };
  }
  if (actRow.status !== 'issued') {
    return { ok: false, message: t.acts.actions.alreadyPaid };
  }

  const amount = parseAmount(amount_raw)!;
  const file = fileEntry as File;

  // 1) Загружаем скан в хранилище. Строку documents создаёт сама RPC (атомарно
  //    с платежом), поэтому при ошибке RPC откатываем только файл — осиротевшей
  //    documents-записи не остаётся (юрист и так не имеет права DELETE на documents).
  const storageKey = `cases/${case_id}/${randomUUID()}--${slugifyFilename(file.name)}`;
  const contentType = file.type || 'application/octet-stream';
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await storage().upload(storageKey, buffer, { contentType });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('confirmActPaidAction.storage', err, t.acts.actions.scanUploadFailed, t.errors.db),
    };
  }

  // 2) Атомарное подтверждение: documents(скан) + платёж (act_id) + completion +
  //    акт paid + журнал — всё в одной транзакции внутри SECURITY DEFINER RPC.
  try {
    await userDb(user.profile.id, (tx) =>
      rpcConfirmActPaid(tx, {
        actId: act_id,
        confirmedAmount: amount,
        paidAt: paid_at,
        storageKey,
        fileName: file.name,
        method: 'act',
        note: null,
      }),
    );
  } catch (err) {
    // Подтверждение не состоялось → чистим только загруженный файл.
    await storage().remove(storageKey).catch(() => {});
    return {
      ok: false,
      message: dbActionError('confirmActPaidAction.rpc', err, t.acts.actions.confirmFailed, t.errors.db),
    };
  }

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// ============================================================================
// Удаление неоплаченного (issued) акта. RLS: owner/admin или автор; только issued.
// ============================================================================
export async function deleteActAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const act_id = String(formData.get('act_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!act_id || !UUID_RE.test(act_id)) return;

  // Читаем акт ДО удаления — для журнала. case_id берём из БД (не из formData),
  // чтобы запись лога не приписали к чужому делу (паттерн «CSO #2»).
  const actRow = await userDb(user.profile.id, (tx) =>
    tx.case_acts.findUnique({
      where: { id: act_id },
      select: { case_id: true, number: true, amount: true },
    }),
  );

  // deleteMany с фильтром status=issued: удалит только неоплаченный и только
  // видимый под RLS (count=0 = тихий no-op, не исключение).
  let deletedCount = 0;
  let failed = false;
  try {
    const res = await userDb(user.profile.id, (tx) =>
      tx.case_acts.deleteMany({ where: { id: act_id, status: 'issued' } }),
    );
    deletedCount = res.count;
  } catch (err) {
    console.error('deleteActAction failed:', err);
    failed = true;
  }

  // redirect — ВНЕ try/catch (NEXT_REDIRECT пробрасывается как исключение).
  if (failed) {
    if (case_id && UUID_RE.test(case_id)) {
      redirect(`/cases/${case_id}?error=act_delete_failed`);
    }
    return;
  }

  // Журналируем только если строка реально удалена (issued + RLS пропустила).
  if (deletedCount > 0 && actRow) {
    await logActivity({
      entity_type: 'case',
      entity_id: actRow.case_id,
      action: 'act_deleted',
      changes: { number: actRow.number, amount: dec(actRow.amount) },
    });
    revalidatePath(`/cases/${actRow.case_id}`);
  }
}

// ============================================================================
// Переопределение отметки выполнения (staff) для оплаченного акта.
// ============================================================================
export async function setActCompletionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const act_id = String(formData.get('act_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();
  const completion = String(formData.get('completion') ?? '').trim();
  if (!act_id || !UUID_RE.test(act_id)) return;
  if (!(ACT_COMPLETIONS as readonly string[]).includes(completion)) return;

  let failed = false;
  try {
    await userDb(user.profile.id, (tx) =>
      rpcSetActCompletion(tx, { actId: act_id, completion }),
    );
  } catch (err) {
    console.error('setActCompletionAction failed:', err);
    failed = true;
  }

  if (failed) {
    if (case_id && UUID_RE.test(case_id)) {
      redirect(`/cases/${case_id}?error=act_update_failed`);
    }
    return;
  }
  if (case_id && UUID_RE.test(case_id)) revalidatePath(`/cases/${case_id}`);
}
