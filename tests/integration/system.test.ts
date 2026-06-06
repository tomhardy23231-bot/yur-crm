import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты поверх локального Supabase: проверяют то, что нельзя
// проверить юнитами — RLS (права доступа), триггеры денег и воронку этапов.
// Без поднятого Supabase набор помечается skipped.

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  // Видимое предупреждение, чтобы пропуск не выглядел как «всё прошло».
  console.warn(
    '[integration] Пропущено: нет NEXT_PUBLIC_SUPABASE_URL/ANON/SERVICE_ROLE в .env.local. ' +
      'Подними `npx supabase start` и заполни .env.local.',
  );
}

suite('Юр CRM — интеграция (RLS · триггеры · воронка · зарплата)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // ── Названия наших дел среди прочих в БД (фильтр по runId-префиксу) ──
  const titlesOf = async (client: SupabaseClient, prefix: string) => {
    const { data, error } = await client
      .from('cases')
      .select('number_title')
      .like('number_title', `${prefix}%`);
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.number_title).sort();
  };

  // ============================================================
  describe('RLS — видимость дел', () => {
    it('юрист видит только свои дела (по lawyer_id)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const seen = await titlesOf(lawyer1, world.prefix);
      // lawyer1 — на A и S, не на B.
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}S`]);
      expect(seen).not.toContain(`${world.prefix}B`);
    });

    it('второй юрист изолирован (видит только B)', async () => {
      const lawyer2 = await signIn(world.users.lawyer2.email);
      const seen = await titlesOf(lawyer2, world.prefix);
      expect(seen).toEqual([`${world.prefix}B`]);
    });

    it('эксперт видит только свои дела (по responsible_id)', async () => {
      const expert1 = await signIn(world.users.expert1.email);
      const seen = await titlesOf(expert1, world.prefix);
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}S`]);
    });

    it('второй эксперт изолирован (видит только B)', async () => {
      const expert2 = await signIn(world.users.expert2.email);
      const seen = await titlesOf(expert2, world.prefix);
      expect(seen).toEqual([`${world.prefix}B`]);
    });

    it('staff (admin) видит все наши дела', async () => {
      const staff = await signIn(world.users.staffAdmin.email);
      const seen = await titlesOf(staff, world.prefix);
      expect(seen).toEqual([
        `${world.prefix}A`,
        `${world.prefix}B`,
        `${world.prefix}S`,
      ]);
    });

    it('юрист не может изменить чужое дело (RLS режет апдейт)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      // Пытаемся сделать чужое дело B срочным — RLS не даст (0 строк, без ошибки).
      await lawyer1.from('cases').update({ priority: 'urgent' }).eq('id', world.caseB);
      const { data } = await world.admin
        .from('cases')
        .select('priority')
        .eq('id', world.caseB)
        .single();
      expect(data?.priority).toBe('normal');
    });
  });

  // ============================================================
  describe('RLS — видимость платежей', () => {
    it('эксперт своего дела видит платёж, чужой — нет', async () => {
      const expert1 = await signIn(world.users.expert1.email);
      const expert2 = await signIn(world.users.expert2.email);
      const { data: e1 } = await expert1
        .from('payments')
        .select('amount')
        .eq('case_id', world.caseA);
      const { data: e2 } = await expert2
        .from('payments')
        .select('amount')
        .eq('case_id', world.caseA);
      expect(e1?.length).toBe(1);
      expect(Number(e1?.[0]?.amount)).toBe(10000);
      expect(e2?.length).toBe(0); // expert2 не на деле A → платежа не видит
    });
  });

  // ============================================================
  describe('Триггеры — paid_total и debt', () => {
    it('после сид-платежа A: paid_total=10000, debt=20000', async () => {
      const { data } = await world.admin
        .from('cases')
        .select('paid_total, debt, contract_sum')
        .eq('id', world.caseA)
        .single();
      expect(Number(data?.contract_sum)).toBe(30000);
      expect(Number(data?.paid_total)).toBe(10000);
      expect(Number(data?.debt)).toBe(20000);
    });

    it('дело без оплат B: paid_total=0, debt=120000', async () => {
      const { data } = await world.admin
        .from('cases')
        .select('paid_total, debt')
        .eq('id', world.caseB)
        .single();
      expect(Number(data?.paid_total)).toBe(0);
      expect(Number(data?.debt)).toBe(120000);
    });

    it('новый платёж пересчитывает paid_total/debt, удаление — откатывает', async () => {
      const { data: ins, error: insErr } = await world.admin
        .from('payments')
        .insert({
          case_id: world.caseB,
          amount: 50000,
          paid_at: '2026-05-20',
          method: 'bank',
          note: 'IT extra',
          created_by: world.users.staffAdmin.id,
        })
        .select('id')
        .single();
      expect(insErr).toBeNull();

      const after = await world.admin
        .from('cases')
        .select('paid_total, debt')
        .eq('id', world.caseB)
        .single();
      expect(Number(after.data?.paid_total)).toBe(50000);
      expect(Number(after.data?.debt)).toBe(70000);

      // Откат: удаляем платёж — триггер должен вернуть исходные значения.
      await world.admin.from('payments').delete().eq('id', ins!.id);
      const restored = await world.admin
        .from('cases')
        .select('paid_total, debt')
        .eq('id', world.caseB)
        .single();
      expect(Number(restored.data?.paid_total)).toBe(0);
      expect(Number(restored.data?.debt)).toBe(120000);
    });
  });

  // ============================================================
  describe('Зарплата — ставки и расчёт (% от оплат)', () => {
    it('ставки по умолчанию: document 7%, claim 10%, representation 25%', async () => {
      const { data } = await world.admin
        .from('payroll_rates')
        .select('category, lawyer_percent, expert_percent');
      const byCat = new Map(
        (data ?? []).map((r) => [r.category, r]),
      );
      expect(Number(byCat.get('document')?.lawyer_percent)).toBe(7);
      expect(Number(byCat.get('claim')?.lawyer_percent)).toBe(10);
      expect(Number(byCat.get('representation')?.lawyer_percent)).toBe(25);
      // Дефолты равны для юриста и эксперта (Концепция §7-4).
      expect(Number(byCat.get('representation')?.expert_percent)).toBe(25);
    });

    it('case_payroll(A): representation 25% от 10000 = 2500 каждому, итого 5000', async () => {
      const staff = await signIn(world.users.staffAdmin.email);
      const { data, error } = await staff.rpc('case_payroll', {
        p_case_id: world.caseA,
      });
      expect(error).toBeNull();
      const r = (data ?? [])[0];
      expect(r).toBeTruthy();
      expect(r.category).toBe('representation');
      expect(Number(r.lawyer_percent)).toBe(25);
      expect(Number(r.expert_percent)).toBe(25);
      expect(Number(r.lawyer_amount)).toBe(2500);
      expect(Number(r.expert_amount)).toBe(2500);
      expect(Number(r.total)).toBe(5000);
    });

    it('payroll_by_specialist: юрист видит своё начисление, эксперт — не чужое', async () => {
      const lawyer1Session = await signIn(world.users.lawyer1.email);
      const { data, error } = await lawyer1Session.rpc('payroll_by_specialist');
      expect(error).toBeNull();
      const mine = (data ?? []).find(
        (r: { user_id: string }) => r.user_id === world.users.lawyer1.id,
      );
      expect(mine).toBeTruthy();
      expect(Number(mine.earned)).toBeGreaterThanOrEqual(2500);
      // Юрист не должен видеть строку чужого эксперта (expert2 на деле B).
      const foreign = (data ?? []).find(
        (r: { user_id: string }) => r.user_id === world.users.expert2.id,
      );
      expect(foreign).toBeUndefined();
    });
  });

  // ============================================================
  describe('Воронка — движение только вперёд', () => {
    it('юрист двигает своё дело на +1 этап (new_request → consultation)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1
        .from('cases')
        .update({ stage: 'consultation' })
        .eq('id', world.caseS);
      expect(error).toBeNull();
      const { data } = await world.admin
        .from('cases')
        .select('stage')
        .eq('id', world.caseS)
        .single();
      expect(data?.stage).toBe('consultation');
    });

    it('перескок через этап запрещён (stage_skip_forbidden)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      // consultation → closed: пропускает in_progress и awaiting_decision.
      const { error } = await lawyer1
        .from('cases')
        .update({ stage: 'closed' })
        .eq('id', world.caseS);
      expect(error?.message ?? '').toContain('stage_skip_forbidden');
    });

    it('откат назад запрещён для не-staff (stage_backward_forbidden)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1
        .from('cases')
        .update({ stage: 'new_request' })
        .eq('id', world.caseS);
      expect(error?.message ?? '').toContain('stage_backward_forbidden');
    });

    it('staff может исправить этап назад (stage_corrected)', async () => {
      const staff = await signIn(world.users.staffAdmin.email);
      const { error } = await staff
        .from('cases')
        .update({ stage: 'new_request' })
        .eq('id', world.caseS);
      expect(error).toBeNull();
      const { data } = await world.admin
        .from('cases')
        .select('stage')
        .eq('id', world.caseS)
        .single();
      expect(data?.stage).toBe('new_request');
    });
  });
});
