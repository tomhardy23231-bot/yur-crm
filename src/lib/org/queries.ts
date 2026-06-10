import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { OrgRequisites } from '@/lib/types/db';

const EMPTY: OrgRequisites = {
  org_name: '',
  edrpou: '',
  address: '',
  phone: '',
  iban: '',
  bank_name: '',
  mfo: '',
  tax_status_lines: [],
  updated_at: '',
};

// Реквизиты компании-исполнителя (single-row, id=1). RLS: SELECT всем активным.
// Если строки нет (теоретически) — отдаём пустую болванку, чтобы UI/печать не падали.
export async function getOrgRequisites(): Promise<OrgRequisites> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('org_requisites')
    .select('org_name, edrpou, address, phone, iban, bank_name, mfo, tax_status_lines, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(`getOrgRequisites failed: ${error.message}`);
  if (!data) return EMPTY;

  return {
    org_name: data.org_name ?? '',
    edrpou: data.edrpou ?? '',
    address: data.address ?? '',
    phone: data.phone ?? '',
    iban: data.iban ?? '',
    bank_name: data.bank_name ?? '',
    mfo: data.mfo ?? '',
    tax_status_lines: (data.tax_status_lines as string[] | null) ?? [],
    updated_at: data.updated_at ?? '',
  };
}

// Достаточно ли реквизитов для печати акта (минимум — наименование исполнителя).
export function requisitesAreUsable(r: OrgRequisites): boolean {
  return r.org_name.trim().length > 0;
}
