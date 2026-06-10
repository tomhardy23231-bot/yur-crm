import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { nextMonth } from '@/lib/payroll/month';
import type {
  CashAccount,
  CashAccountKind,
  CashDirection,
  CashEntryWithCase,
} from '@/lib/types/db';

const ACCOUNT_SELECT =
  'id, name, kind, opening_balance, opening_date, is_active, is_default, created_by, created_at';

const ENTRY_SELECT =
  'id, account_id, entry_date, direction, amount, description, case_id, payment_id, created_by, created_at';

type RawAccount = {
  id: string;
  name: string;
  kind: CashAccountKind;
  opening_balance: number | string;
  opening_date: string;
  is_active: boolean;
  is_default: boolean;
  created_by: string;
  created_at: string;
};

function normalizeAccount(r: RawAccount): CashAccount {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    opening_balance: Number(r.opening_balance),
    opening_date: r.opening_date,
    is_active: r.is_active,
    is_default: r.is_default,
    created_by: r.created_by,
    created_at: r.created_at,
  };
}

type RawEntry = {
  id: string;
  account_id: string;
  entry_date: string;
  direction: CashDirection;
  amount: number | string;
  description: string;
  case_id: string | null;
  payment_id: string | null;
  created_by: string;
  created_at: string;
  case:
    | ReadonlyArray<{ id: string; number_title: string }>
    | { id: string; number_title: string }
    | null;
};

function normalizeEntry(r: RawEntry): CashEntryWithCase {
  const c = Array.isArray(r.case) ? (r.case[0] ?? null) : r.case;
  return {
    id: r.id,
    account_id: r.account_id,
    entry_date: r.entry_date,
    direction: r.direction,
    amount: Number(r.amount),
    description: r.description,
    case_id: r.case_id,
    payment_id: r.payment_id,
    created_by: r.created_by,
    created_at: r.created_at,
    case: c,
  };
}

// Счета кассы (RLS отдаёт только обладателю can_manage_cash). Старые сверху.
export async function listCashAccounts(
  opts: { activeOnly?: boolean } = {},
): Promise<CashAccount[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('cash_accounts')
    .select(ACCOUNT_SELECT)
    .order('created_at', { ascending: true });
  if (opts.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`listCashAccounts failed: ${error.message}`);
  return (data ?? []).map((r) => normalizeAccount(r as RawAccount));
}

export type CashReportData = {
  accounts: CashAccount[];
  // Все операции по entry_date <= конца месяца (для корректного переноса остатка),
  // с краткой ссылкой на дело у авто-приходов. Сальдо/итоги считаются в TS.
  entries: CashEntryWithCase[];
};

// Данные сальдо-отчёта за месяц. month — 'YYYY-MM-01' (см. lib/payroll/month).
// Тянем операции до конца месяца включительно: предыдущие нужны для остатка на
// начало, текущие — для разворота по дням и журнала. RLS скоупит по can_manage_cash.
export async function getCashReportData(month: string): Promise<CashReportData> {
  const supabase = await createSupabaseServerClient();
  // Верхняя граница — первый день следующего месяца (строго меньше).
  const upperExclusive = nextMonth(month);

  const [accounts, entriesRes] = await Promise.all([
    listCashAccounts(),
    supabase
      .from('cash_entries')
      .select(`${ENTRY_SELECT}, case:case_id(id, number_title)`)
      .lt('entry_date', upperExclusive)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (entriesRes.error) {
    throw new Error(`getCashReportData failed: ${entriesRes.error.message}`);
  }

  return {
    accounts,
    entries: (entriesRes.data ?? []).map((r) => normalizeEntry(r as RawEntry)),
  };
}
