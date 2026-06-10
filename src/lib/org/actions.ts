'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type RequisitesField =
  | 'org_name'
  | 'edrpou'
  | 'address'
  | 'phone'
  | 'iban'
  | 'bank_name'
  | 'mfo'
  | 'tax_status';

export type RequisitesState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<RequisitesField, string>>;
};

function getString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

const MAX_LINE = 300;

export async function updateOrgRequisitesAction(
  _prev: RequisitesState,
  formData: FormData,
): Promise<RequisitesState> {
  const user = await requireUser();
  const { t } = await getT();

  // Реквизиты компании — системная настройка (как ставки ЗП): только owner.
  // RLS (org_requisites_update_owner) дублирует; здесь дружелюбный отказ.
  if (user.profile.role !== 'owner') {
    return { ok: false, message: t.requisites.actions.noPermission };
  }

  const org_name = getString(formData, 'org_name');
  const edrpou = getString(formData, 'edrpou');
  const address = getString(formData, 'address');
  const phone = getString(formData, 'phone');
  const iban = getString(formData, 'iban');
  const bank_name = getString(formData, 'bank_name');
  const mfo = getString(formData, 'mfo');
  const taxRaw = getString(formData, 'tax_status');

  const fieldErrors: RequisitesState['fieldErrors'] = {};
  if (!org_name) fieldErrors.org_name = t.requisites.actions.orgNameRequired;

  const lengthChecks: Array<[RequisitesField, string]> = [
    ['org_name', org_name],
    ['edrpou', edrpou],
    ['address', address],
    ['phone', phone],
    ['iban', iban],
    ['bank_name', bank_name],
    ['mfo', mfo],
  ];
  for (const [field, value] of lengthChecks) {
    if (value.length > MAX_LINE) fieldErrors[field] = t.requisites.actions.tooLong;
  }

  // Налоговый статус — построчно (одна строка = один пункт), пустые строки убираем.
  const tax_status_lines = taxRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => s.slice(0, MAX_LINE));

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.errors.checkForm };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('org_requisites')
    .update({
      org_name,
      edrpou,
      address,
      phone,
      iban,
      bank_name,
      mfo,
      tax_status_lines,
      updated_at: new Date().toISOString(),
      updated_by: user.profile.id,
    })
    .eq('id', 1);

  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(
        'updateOrgRequisitesAction',
        error,
        t.requisites.actions.saveFailed,
        t.errors.db,
      ),
    };
  }

  revalidatePath('/settings/requisites');
  return { ok: true };
}
