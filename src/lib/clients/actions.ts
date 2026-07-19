'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireCap, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { diffChanges } from '@/lib/activity-log/diff';
import { userDb } from '@/lib/db';
import { dateOnlyOrNull } from '@/lib/db/convert';
import { dbActionError, pgErrorCode } from '@/lib/db/errors';
import { getT } from '@/lib/i18n/server';
import type { I18n } from '@/lib/i18n/core';
import { UUID_RE } from '@/lib/validation';
import {
  CLIENT_KINDS,
  CLIENT_SOURCES,
  clientKindHasFullName,
  type ClientKind,
  type ClientSource,
} from '@/lib/types/db';

export type ClientFormFields =
  | 'name'
  | 'client_kind'
  | 'last_name'
  | 'first_name'
  | 'middle_name'
  | 'birth_date'
  | 'inn'
  | 'contract_number'
  | 'phone'
  | 'email'
  | 'address'
  | 'source'
  | 'notes';

export type ClientActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<ClientFormFields, string>>;
  values?: Partial<Record<ClientFormFields, string>>;
};

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isClientKind(value: string): value is ClientKind {
  return (CLIENT_KINDS as readonly string[]).includes(value);
}

function isClientSource(value: string): value is ClientSource {
  return (CLIENT_SOURCES as readonly string[]).includes(value);
}

// Базовая валидация e-mail без RFC-крайностей — пользовательских e-mail тут немного.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ИНН/ЕДРПОУ — только цифры. В Украине ИПН физлица = 10 цифр, ЕДРПОУ компании =
// 8 цифр; допускаем диапазон 8–12, чтобы не упираться в юрисдикционные нюансы.
const INN_RE = /^\d{8,12}$/;
// Дата рождения из <input type="date"> приходит как YYYY-MM-DD.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Validated = {
  name: string;
  client_kind: ClientKind;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  inn: string | null;
  contract_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: ClientSource | null;
  notes: string | null;
};

function validate(formData: FormData, t: I18n['t']):
  | { ok: true; data: Validated; values: Record<ClientFormFields, string> }
  | { ok: false; state: ClientActionState } {
  const nameRaw = getString(formData, 'name');
  const kindRaw = getString(formData, 'client_kind');
  const lastName = getString(formData, 'last_name');
  const firstName = getString(formData, 'first_name');
  const middleName = getString(formData, 'middle_name');
  const birthDate = getString(formData, 'birth_date');
  const inn = getString(formData, 'inn');
  const contractNumber = getString(formData, 'contract_number');
  const phone = getString(formData, 'phone');
  const email = getString(formData, 'email');
  const address = getString(formData, 'address');
  const sourceRaw = getString(formData, 'source');
  const notes = getString(formData, 'notes');

  const values: Record<ClientFormFields, string> = {
    name: nameRaw,
    client_kind: kindRaw,
    last_name: lastName,
    first_name: firstName,
    middle_name: middleName,
    birth_date: birthDate,
    inn,
    contract_number: contractNumber,
    phone,
    email,
    address,
    source: sourceRaw,
    notes,
  };

  const fieldErrors: ClientActionState['fieldErrors'] = {};

  const kindValid = isClientKind(kindRaw);
  if (!kindRaw) fieldErrors.client_kind = t.clients.actions.selectKind;
  else if (!kindValid) fieldErrors.client_kind = t.clients.actions.invalidKind;

  // У физлица/ФОП собираем отображаемое имя из ФИО; у компании name = наименование.
  const hasFullName = kindValid && clientKindHasFullName(kindRaw as ClientKind);
  let name = nameRaw;
  if (hasFullName) {
    if (!lastName) fieldErrors.last_name = t.clients.actions.enterLastName;
    else if (lastName.length > 100) fieldErrors.last_name = t.clients.actions.tooLong100;
    if (!firstName) fieldErrors.first_name = t.clients.actions.enterFirstName;
    else if (firstName.length > 100) fieldErrors.first_name = t.clients.actions.tooLong100;
    if (middleName.length > 100) fieldErrors.middle_name = t.clients.actions.tooLong100;
    name = [lastName, firstName, middleName].filter(Boolean).join(' ');
  } else {
    if (!nameRaw) fieldErrors.name = t.clients.actions.enterName;
    else if (nameRaw.length > 200) fieldErrors.name = t.clients.actions.nameTooLong;
  }

  if (birthDate) {
    if (!DATE_RE.test(birthDate)) {
      fieldErrors.birth_date = t.clients.actions.invalidDate;
    } else {
      const d = new Date(`${birthDate}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) fieldErrors.birth_date = t.clients.actions.invalidDate;
      else if (d.getTime() > Date.now()) fieldErrors.birth_date = t.clients.actions.futureDate;
    }
  }

  if (inn && !INN_RE.test(inn)) {
    fieldErrors.inn = t.clients.actions.invalidInn;
  }

  if (contractNumber && contractNumber.length > 100) {
    fieldErrors.contract_number = t.clients.actions.tooLong100;
  }

  if (email && !EMAIL_RE.test(email)) {
    fieldErrors.email = t.clients.actions.invalidEmail;
  }

  if (sourceRaw && !isClientSource(sourceRaw)) {
    fieldErrors.source = t.clients.actions.invalidSource;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: { ok: false, fieldErrors, values, message: t.errors.checkForm },
    };
  }

  // isClientKind проверен выше — но TS этого не знает после union narrowing
  // через объект, поэтому утверждаем тип явно.
  return {
    ok: true,
    data: {
      name,
      client_kind: kindRaw as ClientKind,
      last_name: hasFullName ? lastName || null : null,
      first_name: hasFullName ? firstName || null : null,
      middle_name: hasFullName ? middleName || null : null,
      birth_date: birthDate || null,
      inn: inn || null,
      contract_number: contractNumber || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      source: sourceRaw ? (sourceRaw as ClientSource) : null,
      notes: notes || null,
    },
    values,
  };
}

// Validated → data для Prisma: единственное отличие — birth_date (строка YYYY-MM-DD
// из формы → Date UTC-полночи для колонки @db.Date; читается назад тем же днём).
function clientDataForDb(d: Validated) {
  return {
    name: d.name,
    client_kind: d.client_kind,
    last_name: d.last_name,
    first_name: d.first_name,
    middle_name: d.middle_name,
    birth_date: d.birth_date ? new Date(`${d.birth_date}T00:00:00Z`) : null,
    inn: d.inn,
    contract_number: d.contract_number,
    phone: d.phone,
    email: d.email,
    address: d.address,
    source: d.source,
    notes: d.notes,
  };
}

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const user = await requireUser();
  const { t } = await getT();

  // Клиентов заводят обладатели права create_clients (по умолчанию все, кроме
  // эксперта). RLS (clients_insert_creators) — жёсткая защита; здесь дружелюбный
  // ответ вместо сырого RLS-отказа.
  if (!user.caps.create_clients) {
    return {
      ok: false,
      message: t.clients.actions.noCreatePermission,
    };
  }

  const result = validate(formData, t);
  if (!result.ok) return result.state;

  let newId: string;
  try {
    const row = await userDb(user.profile.id, (tx) =>
      tx.clients.create({
        data: { ...clientDataForDb(result.data), created_by: user.profile.id },
        select: { id: true },
      }),
    );
    newId = row.id;
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError(
        'createClientAction',
        err,
        t.clients.actions.createFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'client',
    entity_id: newId,
    action: 'client_created',
    changes: {
      after: { name: result.data.name, client_kind: result.data.client_kind },
    },
  });

  revalidatePath('/clients');
  redirect(`/clients/${newId}`); // NEXT_REDIRECT — вне try/catch, пробрасывается
}

// LOW#10 (внешнее ревью): `notes` намеренно НЕ в этом списке.
// Причина — Phase 1: notes часто содержит длинный свободный текст
// (комментарии адвоката, контекст по делу), при каждой правке diff раздувал
// бы activity_log payload. CSO #1 cap 8KB обрезает большие записи.
// Если в Phase 2 понадобится аудит изменений notes — добавить сюда + продумать
// truncation в logActivity-обёртке.
const CLIENT_DIFF_FIELDS = [
  'name',
  'client_kind',
  'last_name',
  'first_name',
  'middle_name',
  'birth_date',
  'inn',
  'contract_number',
  'phone',
  'email',
  'address',
  'source',
] as const;

type ClientDiffShape = {
  name: string;
  client_kind: ClientKind;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  inn: string | null;
  contract_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: ClientSource | null;
};

export async function updateClientAction(
  clientId: string,
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const user = await requireUser();
  const { t } = await getT();
  const result = validate(formData, t);
  if (!result.ok) return result.state;

  // Снапшот до правки — для diff'а. created_by — для проверки прав (P2.3):
  // править может staff или автор записи. Иначе RLS отклонил бы UPDATE молча
  // (0 строк) → ложный «сохранено». Поле notes намеренно не логируем.
  let before;
  try {
    before = await userDb(user.profile.id, (tx) =>
      tx.clients.findUnique({
        where: { id: clientId },
        select: {
          name: true,
          client_kind: true,
          last_name: true,
          first_name: true,
          middle_name: true,
          birth_date: true,
          inn: true,
          contract_number: true,
          phone: true,
          email: true,
          address: true,
          source: true,
          created_by: true,
        },
      }),
    );
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError(
        'updateClientAction',
        err,
        t.clients.actions.updateFailed,
        t.errors.db,
      ),
    };
  }

  if (
    before &&
    !user.caps.view_all_cases &&
    before.created_by !== user.profile.id
  ) {
    return {
      ok: false,
      values: result.values,
      message: t.clients.actions.noEditPermission,
    };
  }

  let updatedCount = 0;
  try {
    const upd = await userDb(user.profile.id, (tx) =>
      tx.clients.updateMany({
        where: { id: clientId },
        data: clientDataForDb(result.data),
      }),
    );
    updatedCount = upd.count;
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError(
        'updateClientAction',
        err,
        t.clients.actions.updateFailed,
        t.errors.db,
      ),
    };
  }

  if (before && updatedCount > 0) {
    const beforeShape: ClientDiffShape = {
      name: before.name,
      client_kind: before.client_kind as ClientKind,
      last_name: before.last_name,
      first_name: before.first_name,
      middle_name: before.middle_name,
      birth_date: dateOnlyOrNull(before.birth_date),
      inn: before.inn,
      contract_number: before.contract_number,
      phone: before.phone,
      email: before.email,
      address: before.address,
      source: before.source as ClientSource | null,
    };
    const afterShape: Partial<ClientDiffShape> = {
      name: result.data.name,
      client_kind: result.data.client_kind,
      last_name: result.data.last_name,
      first_name: result.data.first_name,
      middle_name: result.data.middle_name,
      birth_date: result.data.birth_date,
      inn: result.data.inn,
      contract_number: result.data.contract_number,
      phone: result.data.phone,
      email: result.data.email,
      address: result.data.address,
      source: result.data.source,
    };
    const diff = diffChanges(beforeShape, afterShape, CLIENT_DIFF_FIELDS);
    if (diff) {
      await logActivity({
        entity_type: 'client',
        entity_id: clientId,
        action: 'client_updated',
        changes: { diff },
      });
    }
  }

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

// ── Inline-правка контакта клиента с карточки дела (карандаш в «Деталях») ──
// Лёгкий брат updateClientAction: одно поле из allowlist, те же права (staff
// по view_all_cases ИЛИ автор записи; RLS дублирует) и тот же журнал
// (client_updated с diff). caseId — для ревалидации карточки дела-источника.
export type InlineClientFieldState = { ok: boolean; message?: string };

const CLIENT_INLINE_FIELDS = ['phone', 'email', 'source'] as const;
export type ClientInlineField = (typeof CLIENT_INLINE_FIELDS)[number];

export async function updateClientFieldAction(
  clientId: string,
  caseId: string | null,
  field: ClientInlineField,
  value: string,
): Promise<InlineClientFieldState> {
  const user = await requireUser();
  const { t } = await getT();

  if (!UUID_RE.test(clientId) || (caseId !== null && !UUID_RE.test(caseId)))
    return { ok: false, message: t.clients.actions.updateFailed };
  if (!(CLIENT_INLINE_FIELDS as readonly string[]).includes(field))
    return { ok: false, message: t.clients.actions.updateFailed };

  // Валидация — зеркало validate() полной формы по этому полю; пусто → NULL.
  const raw = value.trim();
  if (field === 'email' && raw && !EMAIL_RE.test(raw))
    return { ok: false, message: t.clients.actions.invalidEmail };
  if (field === 'source' && raw && !isClientSource(raw))
    return { ok: false, message: t.clients.actions.invalidSource };
  const next = raw || null;
  // source сужен isClientSource выше — Prisma ждёт enum-тип, не string.
  const data =
    field === 'phone'
      ? { phone: next }
      : field === 'email'
        ? { email: next }
        : { source: next as ClientSource | null };

  let res:
    | { kind: 'notFound' }
    | { kind: 'forbidden' }
    | { kind: 'noop' }
    | { kind: 'blocked' }
    | { kind: 'done'; prev: string | null };
  try {
    res = await userDb(user.profile.id, async (tx) => {
      const b = await tx.clients.findUnique({
        where: { id: clientId },
        select: { phone: true, email: true, source: true, created_by: true },
      });
      if (!b) return { kind: 'notFound' as const };
      // Права — как в updateClientAction (P2.3): staff или автор записи.
      if (!user.caps.view_all_cases && b.created_by !== user.profile.id)
        return { kind: 'forbidden' as const };
      const prev = (b[field] ?? null) as string | null;
      if (prev === next) return { kind: 'noop' as const };
      const upd = await tx.clients.updateMany({ where: { id: clientId }, data });
      if (upd.count === 0) return { kind: 'blocked' as const };
      return { kind: 'done' as const, prev };
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'updateClientFieldAction',
        err,
        t.clients.actions.updateFailed,
        t.errors.db,
      ),
    };
  }
  if (res.kind === 'notFound')
    return { ok: false, message: t.clients.actions.updateFailed };
  if (res.kind === 'forbidden')
    return { ok: false, message: t.clients.actions.noEditPermission };
  if (res.kind === 'noop') return { ok: true };
  if (res.kind === 'blocked')
    return { ok: false, message: t.clients.actions.updateFailed };

  await logActivity({
    entity_type: 'client',
    entity_id: clientId,
    action: 'client_updated',
    changes: { diff: { [field]: { from: res.prev, to: next } } },
  });

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  if (caseId) revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

// ============================================================================
// Задача 5: создание клиента «на месте» из формы дела.
// В отличие от createClientAction НЕ делает redirect — возвращает созданного
// клиента, чтобы форма дела сразу подставила его в селект. Права и валидация —
// те же (canCreateClients + validate), RLS на стороне БД дублирует защиту.
// ============================================================================

export type InlineClientState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<ClientFormFields, string>>;
  values?: Partial<Record<ClientFormFields, string>>;
  client?: { id: string; name: string; client_kind: ClientKind };
};

export async function createClientInlineAction(
  _prev: InlineClientState,
  formData: FormData,
): Promise<InlineClientState> {
  const user = await requireUser();
  const { t } = await getT();

  if (!user.caps.create_clients) {
    return {
      ok: false,
      message: t.clients.actions.noCreatePermission,
    };
  }

  const result = validate(formData, t);
  if (!result.ok) return result.state;

  let created;
  try {
    created = await userDb(user.profile.id, (tx) =>
      tx.clients.create({
        data: { ...clientDataForDb(result.data), created_by: user.profile.id },
        select: { id: true, name: true, client_kind: true },
      }),
    );
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError(
        'createClientInlineAction',
        err,
        t.clients.actions.createFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'client',
    entity_id: created.id,
    action: 'client_created',
    changes: {
      after: { name: result.data.name, client_kind: result.data.client_kind },
    },
  });

  revalidatePath('/clients');
  return {
    ok: true,
    client: {
      id: created.id,
      name: created.name,
      client_kind: created.client_kind as ClientKind,
    },
  };
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  // RLS DELETE = is_staff(). Без role-gate specialist, форсящий POST вручную,
  // получает silent-success UI ("Клиент удалён") при том, что RLS DELETE
  // молча возвращает 0 строк — клиент жив. Журнал тут защищён allowlist'ом
  // log_activity (is_staff для entity_type=client), но UI-обман всё равно есть.
  const user = await requireCap('delete_clients');

  const clientId = getString(formData, 'client_id');
  if (!clientId || !UUID_RE.test(clientId)) {
    redirect('/clients?error=missing_id');
  }

  // Снапшот для лога (до удаления). Миграция MED#7 расширила log_activity на
  // is_staff bypass для 'client_deleted'. Логируем ПОСЛЕ delete — при FK-violation
  // (есть связанные дела) фейковая запись 'client_deleted' не появится в журнале.
  const clientBefore = await userDb(user.profile.id, (tx) =>
    tx.clients.findUnique({
      where: { id: clientId },
      select: { name: true, client_kind: true },
    }),
  );

  try {
    // delete (не deleteMany): FK от cases (RESTRICT) → 23503; RLS-отказ невидимой
    // строки → P2025 — оба ведут на понятный экран ошибки, не ложное «удалено».
    await userDb(user.profile.id, (tx) =>
      tx.clients.delete({ where: { id: clientId } }),
    );
  } catch (err) {
    const isFkViolation = pgErrorCode(err) === '23503';
    redirect(`/clients/${clientId}?error=${isFkViolation ? 'has_cases' : 'delete_failed'}`);
  }

  if (clientBefore) {
    await logActivity({
      entity_type: 'client',
      entity_id: clientId,
      action: 'client_deleted',
      changes: { before: { name: clientBefore.name, client_kind: clientBefore.client_kind } },
    });
  }

  revalidatePath('/clients');
  redirect('/clients?deleted=1');
}
