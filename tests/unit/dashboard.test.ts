import { describe, it, expect } from 'vitest';
import {
  computeConversion,
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
    outcome: null,
    lawyer_id: 'U1',
    responsible_id: 'U2',
    lawyer_rate_override: null,
    expert_rate_override: null,
    dual_rate_override: null,
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

// Совмещение ролей (0007): юрист и Експерт дела — один человек → начисление
// ОДИН раз (dual_rate_override, иначе большая из эффективных ставок ролей).
describe('computePersonalEarnings — совмещение ролей (юрист = эксперт)', () => {
  it('без назначенной ставки — один процент категории, не сумма двух', () => {
    const [r] = computePersonalEarnings(
      [mkCase({ responsible_id: 'U1' })], // U1 и юрист, и эксперт
      RATES,
      'U1',
    );
    expect(r?.percent).toBe(25); // одинарные 25%, а не 50%
    expect(r?.earned).toBe(2500);
  });

  it('dual_rate_override перекрывает всё (12% → 1200)', () => {
    const [r] = computePersonalEarnings(
      [mkCase({ responsible_id: 'U1', dual_rate_override: 12 })],
      RATES,
      'U1',
    );
    expect(r?.percent).toBe(12);
    expect(r?.earned).toBe(1200);
  });

  it('без dual-ставки берётся большая из override ставок ролей', () => {
    const [r] = computePersonalEarnings(
      [
        mkCase({
          responsible_id: 'U1',
          lawyer_rate_override: 8,
          expert_rate_override: 30,
        }),
      ],
      RATES,
      'U1',
    );
    expect(r?.percent).toBe(30); // greatest(8, 30)
    expect(r?.earned).toBe(3000);
  });

  it('fixed зануляет и dual-начисление', () => {
    const fixed = new Set(['U1']);
    const [r] = computePersonalEarnings(
      [mkCase({ responsible_id: 'U1', dual_rate_override: 12 })],
      RATES,
      'U1',
      fixed,
    );
    expect(r?.percent).toBe(0);
    expect(r?.earned).toBe(0);
  });

  it('dual_rate_override чужого совмещённого дела не влияет на раздельные роли', () => {
    // Роли разные (U1 юрист, U2 эксперт) — dual-ставка игнорируется.
    const [r] = computePersonalEarnings(
      [mkCase({ dual_rate_override: 12 })],
      RATES,
      'U1',
    );
    expect(r?.percent).toBe(25);
  });
});

// Конверсия воронки (v3 Сессия 7): created = все; reached = дошедшие до
// in_progress+ и НЕ lost; lost = outcome='lost' (их stage=closed, но не «дошедшие»).
describe('computeConversion — конверсия воронки в договор', () => {
  it('считает created / reached / lost по этапам и исходу', () => {
    const rows = [
      mkCase({ id: 'a', stage: 'new_request' }), // до контракта — не дошёл
      mkCase({ id: 'b', stage: 'consultation' }), // до контракта — не дошёл
      mkCase({ id: 'c', stage: 'in_progress' }), // дошёл (договор)
      mkCase({ id: 'd', stage: 'closed' }), // дошёл (штатно завершён)
      mkCase({ id: 'e', stage: 'closed', outcome: 'lost' }), // потерян
    ];
    const r = computeConversion(rows);
    expect(r.created).toBe(5);
    expect(r.reached).toBe(2); // c, d
    expect(r.lost).toBe(1); // e
  });

  it('lost-дело не считается дошедшим, хотя stage=closed', () => {
    const r = computeConversion([
      mkCase({ stage: 'closed', outcome: 'lost' }),
    ]);
    expect(r.reached).toBe(0);
    expect(r.lost).toBe(1);
  });

  it('пустой список → нули', () => {
    expect(computeConversion([])).toEqual({ created: 0, reached: 0, lost: 0 });
  });
});
