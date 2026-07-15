import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts } from '@/lib/db/convert';
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
// Если строки нет (теоретически) или зритель не аутентифицирован — отдаём пустую
// болванку, чтобы UI/печать не падали (fail-closed: без сессии userDb недоступен).
export async function getOrgRequisites(): Promise<OrgRequisites> {
  const user = await getCurrentUser();
  if (!user) return EMPTY;

  const row = await userDb(user.profile.id, (tx) =>
    tx.org_requisites.findUnique({
      where: { id: 1 },
      select: {
        org_name: true,
        edrpou: true,
        address: true,
        phone: true,
        iban: true,
        bank_name: true,
        mfo: true,
        tax_status_lines: true,
        updated_at: true,
      },
    }),
  );
  if (!row) return EMPTY;

  return {
    org_name: row.org_name ?? '',
    edrpou: row.edrpou ?? '',
    address: row.address ?? '',
    phone: row.phone ?? '',
    iban: row.iban ?? '',
    bank_name: row.bank_name ?? '',
    mfo: row.mfo ?? '',
    tax_status_lines: row.tax_status_lines ?? [],
    updated_at: ts(row.updated_at),
  };
}

// Достаточно ли реквизитов для печати акта (минимум — наименование исполнителя).
export function requisitesAreUsable(r: OrgRequisites): boolean {
  return r.org_name.trim().length > 0;
}
