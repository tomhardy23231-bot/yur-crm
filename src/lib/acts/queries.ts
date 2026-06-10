import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOrgRequisites } from '@/lib/org/queries';
import type {
  ActCompletion,
  ActStatus,
  CaseAct,
  CaseActWithScan,
  ClientKind,
  OrgRequisites,
} from '@/lib/types/db';

const ACT_SELECT =
  'id, case_id, number, service_name, service_period, amount, confirmed_amount, ' +
  'completion, status, issued_at, paid_at, scan_document_id, note, created_by, created_at';

type RawAct = {
  id: string;
  case_id: string;
  number: number;
  service_name: string;
  service_period: string | null;
  amount: number | string;
  confirmed_amount: number | string | null;
  completion: ActCompletion | null;
  status: ActStatus;
  issued_at: string;
  paid_at: string | null;
  scan_document_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

function normalizeAct(r: RawAct): CaseAct {
  return {
    id: r.id,
    case_id: r.case_id,
    number: r.number,
    service_name: r.service_name,
    service_period: r.service_period,
    amount: Number(r.amount),
    confirmed_amount: r.confirmed_amount == null ? null : Number(r.confirmed_amount),
    completion: r.completion,
    status: r.status,
    issued_at: r.issued_at,
    paid_at: r.paid_at,
    scan_document_id: r.scan_document_id,
    note: r.note,
    created_by: r.created_by,
    created_at: r.created_at,
  };
}

// Акты дела (новые сверху), с краткой ссылкой на подтверждающий скан.
export async function listActsByCase(caseId: string): Promise<CaseActWithScan[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_acts')
    .select(`${ACT_SELECT}, scan:scan_document_id(id, file_name)`)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`listActsByCase failed: ${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as unknown as RawAct & {
      scan:
        | ReadonlyArray<{ id: string; file_name: string }>
        | { id: string; file_name: string }
        | null;
    };
    const scan = Array.isArray(r.scan) ? (r.scan[0] ?? null) : r.scan;
    return { ...normalizeAct(r), scan };
  });
}

export type ActPrintData = {
  act: CaseAct;
  caseTitle: string;
  caseSubject: string | null;
  client: { name: string; client_kind: ClientKind; inn: string | null } | null;
  org: OrgRequisites;
};

// Данные для печатной формы акта. Под RLS-сессией: вернёт null, если акт не виден.
export async function getActPrintData(actId: string): Promise<ActPrintData | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_acts')
    .select(
      `${ACT_SELECT}, ` +
        'case:case_id(number_title, subject, client:client_id(name, client_kind, inn))',
    )
    .eq('id', actId)
    .maybeSingle();

  if (error) throw new Error(`getActPrintData failed: ${error.message}`);
  if (!data) return null;

  type CaseJoin = {
    number_title: string;
    subject: string | null;
    client:
      | ReadonlyArray<{ name: string; client_kind: ClientKind; inn: string | null }>
      | { name: string; client_kind: ClientKind; inn: string | null }
      | null;
  };
  const r = data as unknown as RawAct & {
    case: ReadonlyArray<CaseJoin> | CaseJoin | null;
  };
  const caseJoin = Array.isArray(r.case) ? (r.case[0] ?? null) : r.case;
  const clientJoin = caseJoin
    ? Array.isArray(caseJoin.client)
      ? (caseJoin.client[0] ?? null)
      : caseJoin.client
    : null;

  const org = await getOrgRequisites();

  return {
    act: normalizeAct(r),
    caseTitle: caseJoin?.number_title ?? '',
    caseSubject: caseJoin?.subject ?? null,
    client: clientJoin
      ? { name: clientJoin.name, client_kind: clientJoin.client_kind, inn: clientJoin.inn }
      : null,
    org,
  };
}
