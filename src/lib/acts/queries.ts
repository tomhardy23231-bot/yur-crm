import 'server-only';
import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dec, decOrNull, dateOnly, dateOnlyOrNull, ts } from '@/lib/db/convert';
import { getOrgRequisites } from '@/lib/org/queries';
import type {
  ActCompletion,
  ActStatus,
  CaseAct,
  CaseActWithScan,
  ClientKind,
  OrgRequisites,
} from '@/lib/types/db';

// Поля акта для выборки (общие для списка и печатной формы).
const ACT_FIELDS = {
  id: true,
  case_id: true,
  number: true,
  service_name: true,
  service_period: true,
  amount: true,
  confirmed_amount: true,
  completion: true,
  status: true,
  issued_at: true,
  paid_at: true,
  scan_document_id: true,
  note: true,
  created_by: true,
  created_at: true,
} as const;

// Структурный тип выбранных полей акта — конвертеры (dec/dateOnly/ts) берут
// unknown, поэтому нативные Prisma-типы (Decimal, Date) сюда ложатся как есть.
type RawAct = {
  id: string;
  case_id: string;
  number: number;
  service_name: string;
  service_period: string | null;
  amount: unknown;
  confirmed_amount: unknown;
  completion: string | null;
  status: string;
  issued_at: unknown;
  paid_at: unknown;
  scan_document_id: string | null;
  note: string | null;
  created_by: string;
  created_at: unknown;
};

function mapAct(r: RawAct): CaseAct {
  return {
    id: r.id,
    case_id: r.case_id,
    number: r.number,
    service_name: r.service_name,
    service_period: r.service_period,
    amount: dec(r.amount),
    confirmed_amount: decOrNull(r.confirmed_amount),
    completion: r.completion as ActCompletion | null,
    status: r.status as ActStatus,
    issued_at: dateOnly(r.issued_at),
    paid_at: dateOnlyOrNull(r.paid_at),
    scan_document_id: r.scan_document_id,
    note: r.note,
    created_by: r.created_by,
    created_at: ts(r.created_at),
  };
}

// Акты дела (новые сверху), с краткой ссылкой на подтверждающий скан.
// Доступ — RLS (SELECT наследует от дела).
export const listActsByCase = cache(async (
  caseId: string,
): Promise<CaseActWithScan[]> => {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.case_acts.findMany({
      where: { case_id: caseId },
      select: {
        ...ACT_FIELDS,
        documents: { select: { id: true, file_name: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
  );

  return rows.map((r) => ({
    ...mapAct(r),
    scan: r.documents
      ? { id: r.documents.id, file_name: r.documents.file_name }
      : null,
  }));
});

export type ActPrintData = {
  act: CaseAct;
  caseTitle: string;
  caseSubject: string | null;
  client: { name: string; client_kind: ClientKind; inn: string | null } | null;
  org: OrgRequisites;
};

// Данные для печатной формы акта. Под RLS-сессией: вернёт null, если акт не виден.
export async function getActPrintData(
  actId: string,
): Promise<ActPrintData | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const row = await userDb(user.profile.id, (tx) =>
    tx.case_acts.findUnique({
      where: { id: actId },
      select: {
        ...ACT_FIELDS,
        cases: {
          select: {
            number_title: true,
            subject: true,
            clients: {
              select: { name: true, client_kind: true, inn: true },
            },
          },
        },
      },
    }),
  );
  if (!row) return null;

  const caseJoin = row.cases;
  const clientJoin = caseJoin?.clients ?? null;

  const org = await getOrgRequisites();

  return {
    act: mapAct(row),
    caseTitle: caseJoin?.number_title ?? '',
    caseSubject: caseJoin?.subject ?? null,
    client: clientJoin
      ? {
          name: clientJoin.name,
          client_kind: clientJoin.client_kind as ClientKind,
          inn: clientJoin.inn,
        }
      : null,
    org,
  };
}
