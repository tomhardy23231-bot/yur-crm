// Чистая логика статусов графика платежей (v3 Сессия 9). Без обращений к БД и
// без Date-арифметики над due_date — статус «просрочено» сравнивает строки
// 'YYYY-MM-DD' лексикографически (корректно для ISO-дат), todayIso приходит
// киевским (lib/payroll/month.ts kyivToday). Покрытие считается накопительно из
// общей суммы оплат по делу (cases.paid_total): позиции сортируются по сроку и
// «закрываются» оплатами по очереди.

export type PlanItemStatus = 'paid' | 'pending' | 'overdue';

// Вход — позиции графика. created_at опционален: используется как tie-break при
// равных due_date (порядок внесения). Без него — стабильная сортировка по входу.
export interface PlanItemInput {
  id: string;
  due_date: string; // 'YYYY-MM-DD'
  amount: number;
  created_at?: string;
}

export interface PlanItemStatusRow {
  id: string;
  status: PlanItemStatus;
  /** Сколько из суммы позиции покрыто оплатами (для прогресс-подписи). */
  coveredAmount: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Возвращает статус и покрытие для каждой позиции, в порядке по сроку (due_date,
// затем created_at). Позиция `paid` только при ПОЛНОМ покрытии накопленной суммой;
// частично покрытая остаётся pending/overdue (coveredAmount показывает сколько).
export function planWithStatuses(
  items: PlanItemInput[],
  paidTotal: number,
  todayIso: string,
): PlanItemStatusRow[] {
  // Стабильная сортировка по (due_date, created_at, исходный индекс).
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.due_date !== b.item.due_date)
        return a.item.due_date < b.item.due_date ? -1 : 1;
      const ca = a.item.created_at ?? '';
      const cb = b.item.created_at ?? '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.index - b.index;
    });

  const paid = Math.max(0, paidTotal);
  let cumBefore = 0;

  return sorted.map(({ item }) => {
    const cumAfter = cumBefore + item.amount;
    let status: PlanItemStatus;
    let coveredAmount: number;

    if (paid >= cumAfter - 1e-9) {
      // Полностью покрыта накопленной оплатой.
      status = 'paid';
      coveredAmount = item.amount;
    } else {
      // Частично или вовсе не покрыта → статус по сроку.
      coveredAmount = Math.min(item.amount, Math.max(0, paid - cumBefore));
      status = item.due_date < todayIso ? 'overdue' : 'pending';
    }

    cumBefore = cumAfter;
    return { id: item.id, status, coveredAmount: round2(coveredAmount) };
  });
}
