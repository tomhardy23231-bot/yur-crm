import 'server-only';
import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec, ts } from '@/lib/db/convert';
import type { PaymentWithCreator } from '@/lib/types/db';

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
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.payment_plan_items.findMany({
      where: { case_id: caseId },
      orderBy: [{ due_date: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        case_id: true,
        due_date: true,
        amount: true,
        note: true,
        created_by: true,
        created_at: true,
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    due_date: dateOnly(r.due_date),
    amount: dec(r.amount),
    note: r.note,
    created_by: r.created_by,
    created_at: ts(r.created_at),
  }));
});

// =====================================================================
// listPaymentsByCase — список платежей на карточке дела.
// Сортировка: paid_at desc, created_at desc (на одну дату новые сверху).
// =====================================================================
export async function listPaymentsByCase(
  caseId: string,
): Promise<PaymentWithCreator[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.payments.findMany({
      where: { case_id: caseId },
      orderBy: [{ paid_at: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        case_id: true,
        amount: true,
        paid_at: true,
        method: true,
        note: true,
        created_by: true,
        created_at: true,
        idempotency_key: true,
        users: { select: { id: true, full_name: true } },
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    amount: dec(r.amount),
    paid_at: dateOnly(r.paid_at),
    method: r.method,
    note: r.note,
    created_by: r.created_by,
    created_at: ts(r.created_at),
    idempotency_key: r.idempotency_key ?? null,
    creator: r.users ? { id: r.users.id, full_name: r.users.full_name } : null,
  }));
}
