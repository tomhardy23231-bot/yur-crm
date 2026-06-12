import 'server-only';
import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PaymentRow, PaymentWithCreator } from '@/lib/types/db';

// =====================================================================
// График платежей (v3 Сессия 9). Плановые доплаты по делу: дата + сумма.
// Статус (оплачено/ожидает/просрочено) считает чистая логика lib/payments/plan.ts
// из cases.paid_total — здесь только выборка строк.
// =====================================================================
export interface PlanItem {
  id: string;
  case_id: string;
  due_date: string; // 'YYYY-MM-DD'
  amount: number;
  note: string | null;
  created_by: string;
  created_at: string;
}

export const listPlanItems = cache(async (caseId: string): Promise<PlanItem[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payment_plan_items')
    .select('id, case_id, due_date, amount, note, created_by, created_at')
    .eq('case_id', caseId)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`listPlanItems failed: ${error.message}`);
  }
  // numeric(14,2) приходит строкой — нормализуем как в платежах (Number безопасен
  // в пределах Phase 1).
  return (
    (data ?? []) as Array<{
      id: string;
      case_id: string;
      due_date: string;
      amount: number | string;
      note: string | null;
      created_by: string;
      created_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    case_id: r.case_id,
    due_date: r.due_date,
    amount: typeof r.amount === 'string' ? Number(r.amount) : r.amount,
    note: r.note,
    created_by: r.created_by,
    created_at: r.created_at,
  }));
});

// =====================================================================
// listPaymentsByCase — список платежей на карточке дела.
// Сортировка: paid_at desc, created_at desc (на одну дату новые сверху).
// =====================================================================
export async function listPaymentsByCase(
  caseId: string,
): Promise<PaymentWithCreator[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, case_id, amount, paid_at, method, note, created_by, created_at, idempotency_key, ' +
        'creator:created_by(id, full_name)',
    )
    .eq('case_id', caseId)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`listPaymentsByCase failed: ${error.message}`);
  }
  return normalizePayments(data ?? []);
}

// =====================================================================
// helpers
// =====================================================================

// PostgREST для numeric(14,2) возвращает строку, чтобы не терять точность.
// Внутри Phase 1 (суммы до 14 знаков, 2 после запятой) Number() безопасен —
// JS double выдерживает 15+ значащих цифр. Если в будущем доберёмся до
// big-money, перейдём на string + Intl-format.
type RawPaymentRow = Omit<PaymentRow, 'amount'> & {
  amount: number | string;
  creator:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
};

function normalizePayments(
  rows: ReadonlyArray<unknown>,
): PaymentWithCreator[] {
  return rows.map((row) => {
    const r = row as RawPaymentRow;
    const creator = Array.isArray(r.creator)
      ? (r.creator[0] ?? null)
      : r.creator;
    return {
      id: r.id,
      case_id: r.case_id,
      amount: typeof r.amount === 'string' ? Number(r.amount) : r.amount,
      paid_at: r.paid_at,
      method: r.method,
      note: r.note,
      created_by: r.created_by,
      created_at: r.created_at,
      idempotency_key: r.idempotency_key ?? null,
      creator,
    };
  });
}
