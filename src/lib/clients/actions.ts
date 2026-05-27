'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireRole, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { diffChanges } from '@/lib/activity-log/diff';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CLIENT_KINDS, type ClientKind } from '@/lib/types/db';

export type ClientFormFields =
  | 'name'
  | 'client_kind'
  | 'phone'
  | 'email'
  | 'address'
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

// Базовая валидация e-mail без RFC-крайностей — пользовательских e-mail тут немного.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Validated = {
  name: string;
  client_kind: ClientKind;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

function validate(formData: FormData):
  | { ok: true; data: Validated; values: Record<ClientFormFields, string> }
  | { ok: false; state: ClientActionState } {
  const name = getString(formData, 'name');
  const kindRaw = getString(formData, 'client_kind');
  const phone = getString(formData, 'phone');
  const email = getString(formData, 'email');
  const address = getString(formData, 'address');
  const notes = getString(formData, 'notes');

  const values: Record<ClientFormFields, string> = {
    name,
    client_kind: kindRaw,
    phone,
    email,
    address,
    notes,
  };

  const fieldErrors: ClientActionState['fieldErrors'] = {};
  if (!name) fieldErrors.name = 'Укажите имя клиента';
  else if (name.length > 200) fieldErrors.name = 'Слишком длинное (макс 200)';

  if (!kindRaw) fieldErrors.client_kind = 'Выберите тип';
  else if (!isClientKind(kindRaw)) fieldErrors.client_kind = 'Недопустимый тип';

  if (email && !EMAIL_RE.test(email)) {
    fieldErrors.email = 'Похоже на ошибку в e-mail';
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
      phone: phone || null,
      email: email || null,
      address: address || null,
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
      message: error?.message ?? 'Не удалось создать клиента',
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
  'phone',
  'email',
  'address',
] as const;

type ClientDiffShape = {
  name: string;
  client_kind: ClientKind;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export async function updateClientAction(
  clientId: string,
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireUser();
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();

  // Снапшот до правки — для diff'а. Поле notes намеренно не логируем.
  const { data: before } = await supabase
    .from('clients')
    .select('name, client_kind, phone, email, address')
    .eq('id', clientId)
    .maybeSingle();

  const { error } = await supabase
    .from('clients')
    .update(result.data)
    .eq('id', clientId);

  if (error) {
    return {
      ok: false,
      values: result.values,
      message: error.message,
    };
  }

  if (before) {
    const beforeShape: ClientDiffShape = {
      name: String(before.name ?? ''),
      client_kind: before.client_kind as ClientKind,
      phone: (before.phone as string | null) ?? null,
      email: (before.email as string | null) ?? null,
      address: (before.address as string | null) ?? null,
    };
    const afterShape: Partial<ClientDiffShape> = {
      name: result.data.name,
      client_kind: result.data.client_kind,
      phone: result.data.phone,
      email: result.data.email,
      address: result.data.address,
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

export async function deleteClientAction(formData: FormData): Promise<void> {
  // RLS DELETE = is_staff(). Без role-gate specialist, форсящий POST вручную,
  // получает silent-success UI ("Клиент удалён") при том, что RLS DELETE
  // молча возвращает 0 строк — клиент жив. Журнал тут защищён allowlist'ом
  // log_activity (is_staff для entity_type=client), но UI-обман всё равно есть.
  await requireRole(['owner', 'admin']);

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
