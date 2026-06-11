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

// Потолок выборки операций месяца. Защита от молчаливого усечения PostgREST
// (max_rows=1000): тянем явно с count:'exact' и сравниваем — при превышении UI
// покажет предупреждение «показаны не все операции месяца».
const MONTH_ENTRY_LIMIT = 5000;

export type CashReportData = {
  accounts: CashAccount[];
  // Операции ТОЛЬКО выбранного месяца (свежие не теряются под потолком PostgREST).
  // Перенос из прошлых периодов считается SQL'ем (openingBalances), а не выкачкой истории.
  entries: CashEntryWithCase[];
  // Перенос остатка на начало месяца по счёту (accountId → net до monthStart, начиная с
  // opening_date). Эффективный остаток на начало = account.opening_balance + это число.
  openingBalances: Record<string, number>;
  // true, если операций за месяц больше лимита выборки (показать предупреждение в UI).
  truncated: boolean;
};

// Данные сальдо-отчёта за месяц. month — 'YYYY-MM-01' (см. lib/payroll/month).
// Тянем ТОЛЬКО операции выбранного месяца (свежие не теряются под потолком 1000), а
// перенос остатка на начало месяца считаем SQL-функцией cash_balances_before (без
// выкачки всей истории). RLS/право скоупит по can_manage_cash.
export async function getCashReportData(month: string): Promise<CashReportData> {
  const supabase = await createSupabaseServerClient();
  const monthStart = month; // 'YYYY-MM-01'
  // Верхняя граница — первый день следующего месяца (строго меньше).
  const upperExclusive = nextMonth(month);

  const [accounts, balancesRes, entriesRes] = await Promise.all([
    listCashAccounts(),
    supabase.rpc('cash_balances_before', { p_before: monthStart }),
    supabase
      .from('cash_entries')
      .select(`${ENTRY_SELECT}, case:case_id(id, number_title)`, { count: 'exact' })
      .gte('entry_date', monthStart)
      .lt('entry_date', upperExclusive)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(MONTH_ENTRY_LIMIT),
  ]);

  if (balancesRes.error) {
    throw new Error(`getCashReportData balances failed: ${balancesRes.error.message}`);
  }
  if (entriesRes.error) {
    throw new Error(`getCashReportData failed: ${entriesRes.error.message}`);
  }

  const openingBalances: Record<string, number> = {};
  for (const r of (balancesRes.data ?? []) as Array<{
    account_id: string;
    balance: number | string;
  }>) {
    openingBalances[r.account_id] = Number(r.balance);
  }

  const rows = (entriesRes.data ?? []).map((r) => normalizeEntry(r as RawEntry));
  const truncated = (entriesRes.count ?? rows.length) > rows.length;

  return { accounts, entries: rows, openingBalances, truncated };
}

// Сколько платежей ещё не отражены в кассе (для баннера «Синхронизировать»). Не валит
// страницу: при ошибке/без права RPC вернёт 0 (право проверяется внутри функции).
export async function getUnsyncedPaymentsCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('cash_unsynced_payments_count');
  if (error) {
    console.error('getUnsyncedPaymentsCount failed:', error.message);
    return 0;
  }
  return Number(data ?? 0);
}
