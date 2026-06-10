import { describe, it, expect } from 'vitest';
import {
  computePersonalEarnings,
  type DashboardCaseRow,
} from '@/lib/dashboard/compute';
import type { PayrollRate } from '@/lib/types/db';

// Личные начисления на дашборде — чистый расчёт. Проверяем учёт режима зарплаты
// (v2 Этап 4): fixed зануляет процент, percent/override работают как раньше.

const RATES: PayrollRate[] = [
  { category: 'representation', lawyer_percent: 25, expert_percent: 25, updated_at: '' },
  { category: 'claim', lawyer_percent: 10, expert_percent: 10, updated_at: '' },
  { category: 'document', lawyer_percent: 7, expert_percent: 7, updated_at: '' },
];

function mkCase(over: Partial<DashboardCaseRow> = {}): DashboardCaseRow {
  return {
    id: 'c1',
    number_title: 'CRM-1',
    stage: 'in_progress',
    category: 'representation',
    contract_sum: 30000,
    paid_total: 10000,
    debt: 20000,
    opened_at: '2026-05-01',
    lawyer_id: 'U1',
    responsible_id: 'U2',
    lawyer_rate_override: null,
    expert_rate_override: null,
    ...over,
  };
}

describe('computePersonalEarnings — режимы зарплаты', () => {
  it('percent: юрист получает % категории от оплат (25% от 10000 = 2500)', () => {
    const [r] = computePersonalEarnings([mkCase()], RATES, 'U1');
    expect(r?.role_in_case).toBe('lawyer');
    expect(r?.percent).toBe(25);
    expect(r?.earned).toBe(2500);
  });

  it('percent: эксперт считается по своей роли', () => {
    const [r] = computePersonalEarnings([mkCase()], RATES, 'U2');
    expect(r?.role_in_case).toBe('expert');
    expect(r?.earned).toBe(2500);
  });

  it('override на деле перекрывает ставку категории (30% → 3000)', () => {
    const [r] = computePersonalEarnings(
      [mkCase({ lawyer_rate_override: 30 })],
      RATES,
      'U1',
    );
    expect(r?.percent).toBe(30);
    expect(r?.earned).toBe(3000);
  });

  it("fixed: процент и заработок зануляются для сотрудника на окладе", () => {
    const fixed = new Set(['U1']);
    const [r] = computePersonalEarnings([mkCase()], RATES, 'U1', fixed);
    expect(r?.percent).toBe(0);
    expect(r?.earned).toBe(0);
  });

  it('fixed одного сотрудника не влияет на другого (U2 на проценте)', () => {
    const fixed = new Set(['U1']);
    const [r] = computePersonalEarnings([mkCase()], RATES, 'U2', fixed);
    expect(r?.earned).toBe(2500); // U2 не в наборе fixed → процент сохраняется
  });
});
