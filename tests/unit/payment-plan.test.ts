import { describe, it, expect } from 'vitest';
import { planWithStatuses, type PlanItemInput } from '@/lib/payments/plan';

// v3 Сессия 9: чистая логика статусов графика платежей. Покрытие — накопительно
// из cases.paid_total; «просрочено» — due_date < todayIso и не покрыто.

const TODAY = '2026-06-11';

function item(id: string, due: string, amount: number): PlanItemInput {
  return { id, due_date: due, amount };
}

describe('planWithStatuses', () => {
  it('пустой график → пустой результат', () => {
    expect(planWithStatuses([], 0, TODAY)).toEqual([]);
  });

  it('ровно покрыто: оплата = сумме всех позиций → все paid', () => {
    const items = [
      item('a', '2026-05-01', 1000),
      item('b', '2026-06-01', 2000),
    ];
    const res = planWithStatuses(items, 3000, TODAY);
    expect(res.map((r) => r.status)).toEqual(['paid', 'paid']);
    expect(res.map((r) => r.coveredAmount)).toEqual([1000, 2000]);
  });

  it('частично покрыто: оплата закрывает первую, вторую — частично', () => {
    const items = [
      item('a', '2026-07-01', 1000), // будущая → не overdue
      item('b', '2026-07-15', 2000),
    ];
    const res = planWithStatuses(items, 1500, TODAY);
    // Первая полностью покрыта (paid), вторая покрыта на 500 (pending — будущая).
    expect(res[0]).toEqual({ id: 'a', status: 'paid', coveredAmount: 1000 });
    expect(res[1]).toEqual({ id: 'b', status: 'pending', coveredAmount: 500 });
  });

  it('просрочка: непокрытая позиция с due_date < today → overdue', () => {
    const items = [
      item('a', '2026-05-01', 1000), // прошлая, не покрыта → overdue
      item('b', '2026-07-01', 2000), // будущая, не покрыта → pending
    ];
    const res = planWithStatuses(items, 0, TODAY);
    expect(res[0]!.status).toBe('overdue');
    expect(res[0]!.coveredAmount).toBe(0);
    expect(res[1]!.status).toBe('pending');
  });

  it('частично покрытая просроченная позиция всё равно overdue (по полному покрытию)', () => {
    const items = [item('a', '2026-05-01', 1000)];
    const res = planWithStatuses(items, 400, TODAY);
    expect(res[0]).toEqual({ id: 'a', status: 'overdue', coveredAmount: 400 });
  });

  it('платёж больше плана: излишек не «переливается» в фантомные позиции', () => {
    const items = [
      item('a', '2026-05-01', 1000),
      item('b', '2026-06-01', 1000),
    ];
    const res = planWithStatuses(items, 5000, TODAY);
    expect(res.map((r) => r.status)).toEqual(['paid', 'paid']);
    // coveredAmount не превышает сумму позиции.
    expect(res.map((r) => r.coveredAmount)).toEqual([1000, 1000]);
  });

  it('сортировка по сроку: статусы привязаны к позиции, не к входному порядку', () => {
    const items = [
      item('late', '2026-08-01', 1000),
      item('early', '2026-05-01', 1000), // прошлая
    ];
    const res = planWithStatuses(items, 1000, TODAY);
    // Оплата 1000 закрывает раннюю (по сроку), поздняя — pending (будущая).
    const byId = new Map(res.map((r) => [r.id, r]));
    expect(byId.get('early')?.status).toBe('paid');
    expect(byId.get('late')?.status).toBe('pending');
  });

  it('tie-break по created_at при равном сроке', () => {
    const items: PlanItemInput[] = [
      { id: 'second', due_date: '2026-05-01', amount: 500, created_at: '2026-01-02T00:00:00Z' },
      { id: 'first', due_date: '2026-05-01', amount: 500, created_at: '2026-01-01T00:00:00Z' },
    ];
    const res = planWithStatuses(items, 500, TODAY);
    const byId = new Map(res.map((r) => [r.id, r]));
    // Оплата 500 покрывает более раннюю по created_at ('first').
    expect(byId.get('first')?.status).toBe('paid');
    expect(byId.get('second')?.status).toBe('overdue');
  });
});
