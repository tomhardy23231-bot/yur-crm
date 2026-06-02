'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireCap, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { diffChanges } from '@/lib/activity-log/diff';
import { dbErrorMessage } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function validate(formData: FormData):
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
  if (!kindRaw) fieldErrors.client_kind = 'Выберите тип';
  else if (!kindValid) fieldErrors.client_kind = 'Недопустимый тип';

  // У физлица/ФОП собираем отображаемое имя из ФИО; у компании name = наименование.
  const hasFullName = kindValid && clientKindHasFullName(kindRaw as ClientKind);
  let name = nameRaw;
  if (hasFullName) {
    if (!lastName) fieldErrors.last_name = 'Укажите фамилию';
    else if (lastName.length > 100) fieldErrors.last_name = 'Слишком длинно (макс 100)';
    if (!firstName) fieldErrors.first_name = 'Укажите имя';
    else if (firstName.length > 100) fieldErrors.first_name = 'Слишком длинно (макс 100)';
    if (middleName.length > 100) fieldErrors.middle_name = 'Слишком длинно (макс 100)';
    name = [lastName, firstName, middleName].filter(Boolean).join(' ');
  } else {
    if (!nameRaw) fieldErrors.name = 'Укажите наименование';
    else if (nameRaw.length > 200) fieldErrors.name = 'Слишком длинное (макс 200)';
  }

  if (birthDate) {
    if (!DATE_RE.test(birthDate)) {
      fieldErrors.birth_date = 'Неверная дата';
    } else {
      const d = new Date(`${birthDate}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) fieldErrors.birth_date = 'Неверная дата';
      else if (d.getTime() > Date.now()) fieldErrors.birth_date = 'Дата в будущем';
    }
  }

  if (inn && !INN_RE.test(inn)) {
    fieldErrors.inn = 'ИНН — только цифры (8–12)';
  }

  if (contractNumber && contractNumber.length > 100) {
    fieldErrors.contract_number = 'Слишком длинно (макс 100)';
  }

  if (email && !EMAIL_RE.test(email)) {
    fieldErrors.email = 'Похоже на ошибку в e-mail';
  }

  if (sourceRaw && !isClientSource(sourceRaw)) {
    fieldErrors.source = 'Недопустимый источник';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: { ok: false, fieldErrors, values, message: 'Проверьте поля формы' },
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

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const user = await requireUser();

  // Клиентов заводят обладатели права create_clients (по умолчанию все, кроме
  // эксперта). RLS (clients_insert_creators) — жёсткая защита; здесь дружелюбный
  // ответ вместо сырого RLS-отказа.
  if (!user.caps.create_clients) {
    return {
      ok: false,
      message: 'Недостаточно прав для создания клиента.',
    };
  }

  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      ...result.data,
      created_by: user.profile.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      values: result.values,
      message: dbErrorMessage(
        'createClientAction',
        error,
        'Не удалось создать клиента.',
      ),
    };
  }

  await logActivity({
    entity_type: 'client',
    entity_id: data.id,
    action: 'client_created',
    changes: {
      after: { name: result.data.name, client_kind: result.data.client_kind },
    },
  });

  revalidatePath('/clients');
  redirect(`/clients/${data.id}`);
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
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();

  // Снапшот до правки — для diff'а. created_by — для проверки прав (P2.3):
  // править может staff или автор записи. Иначе RLS отклонил бы UPDATE молча
  // (0 строк, error=null) → ложный «сохранено». Поле notes намеренно не логируем.
  const { data: before } = await supabase
    .from('clients')
    .select(
      'name, client_kind, last_name, first_name, middle_name, birth_date, inn, contract_number, phone, email, address, source, created_by',
    )
    .eq('id', clientId)
    .maybeSingle();

  if (
    before &&
    !user.caps.view_all_cases &&
    (before as { created_by: string }).created_by !== user.profile.id
  ) {
    return {
      ok: false,
      values: result.values,
      message:
        'Недостаточно прав: клиента может изменить автор записи или сотрудник с доступом ко всем делам.',
    };
  }

  const { error } = await supabase
    .from('clients')
    .update(result.data)
    .eq('id', clientId);

  if (error) {
    return {
      ok: false,
      values: result.values,
      message: dbErrorMessage(
        'updateClientAction',
        error,
        'Не удалось сохранить изменения клиента.',
      ),
    };
  }

  if (before) {
    const beforeShape: ClientDiffShape = {
      name: String(before.name ?? ''),
      client_kind: before.client_kind as ClientKind,
      last_name: (before.last_name as string | null) ?? null,
      first_name: (before.first_name as string | null) ?? null,
      middle_name: (before.middle_name as string | null) ?? null,
      birth_date: (before.birth_date as string | null) ?? null,
      inn: (before.inn as string | null) ?? null,
      contract_number: (before.contract_number as string | null) ?? null,
      phone: (before.phone as string | null) ?? null,
      email: (before.email as string | null) ?? null,
      address: (before.address as string | null) ?? null,
      source: (before.source as ClientSource | null) ?? null,
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

  if (!user.caps.create_clients) {
    return {
      ok: false,
      message: 'Недостаточно прав для создания клиента.',
    };
  }

  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      ...result.data,
      created_by: user.profile.id,
    })
    .select('id, name, client_kind')
    .single();

  if (error || !data) {
    return {
      ok: false,
      values: result.values,
      message: dbErrorMessage(
        'createClientInlineAction',
        error,
        'Не удалось создать клиента.',
      ),
    };
  }

  await logActivity({
    entity_type: 'client',
    entity_id: data.id,
    action: 'client_created',
    changes: {
      after: { name: result.data.name, client_kind: result.data.client_kind },
    },
  });

  revalidatePath('/clients');
  return {
    ok: true,
    client: {
      id: data.id as string,
      name: data.name as string,
      client_kind: data.client_kind as ClientKind,
    },
  };
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  // RLS DELETE = is_staff(). Без role-gate specialist, форсящий POST вручную,
  // получает silent-success UI ("Клиент удалён") при том, что RLS DELETE
  // молча возвращает 0 строк — клиент жив. Журнал тут защищён allowlist'ом
  // log_activity (is_staff для entity_type=client), но UI-обман всё равно есть.
  await requireCap('delete_clients');

  const clientId = getString(formData, 'client_id');
  if (!clientId || !UUID_RE.test(clientId)) {
    redirect('/clients?error=missing_id');
  }

  const supabase = await createSupabaseServerClient();

  // Снапшот для лога. После DELETE строки нет; миграция MED#7 расширила
  // log_activity на is_staff bypass для 'client_deleted'. Логируем ПОСЛЕ
  // delete — при FK-violation (есть связанные дела) фейковая запись
  // 'client_deleted' не появится в журнале.
  const { data: clientBefore } = await supabase
    .from('clients')
    .select('name, client_kind')
    .eq('id', clientId)
    .maybeSingle();

  const { error } = await supabase.from('clients').delete().eq('id', clientId);

  if (error) {
    // Самая частая причина — FK от cases (RESTRICT). RLS-отказ (нет прав)
    // молчаливо вернёт 0 строк, без ошибки — поэтому ловим только реальный SQL-error.
    const isFkViolation = error.code === '23503';
    const param = isFkViolation ? 'has_cases' : 'delete_failed';
    redirect(`/clients/${clientId}?error=${param}`);
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
