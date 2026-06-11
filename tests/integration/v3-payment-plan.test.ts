import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты v3 Сессии 9 (график платежей). Проверяем:
//   • RLS payment_plan_items: юрист дела создаёт позицию своего дела (ок),
//     чужого — отказ; подделка created_by — отказ;
//   • overdue_plan_items (SECURITY INVOKER): юрист видит просрочку ТОЛЬКО своих
//     дел (RLS вызывающего режет выдачу).
//
// Фикстура: caseA = lawyer1 + expert1 (in_progress, оплата 10000); caseB =
// lawyer2 + expert2 (consultation, без оплат). lawyer1 не видит caseB и наоборот.

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:v3-payment-plan] Пропущено: нет Supabase env в .env.local.');
}

suite('Юр CRM — v3 график платежей + просрочки (Сессия 9)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  describe('RLS payment_plan_items', () => {
    it('юрист дела создаёт позицию СВОЕГО дела (caseA) — ок', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('payment_plan_items').insert({
        case_id: world.caseA,
        due_date: '2026-09-01',
        amount: 1000,
        created_by: world.users.lawyer1.id,
      });
      expect(error).toBeNull();
    });

    it('юрист создаёт позицию ЧУЖОГО дела (caseB) — отказ RLS', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('payment_plan_items').insert({
        case_id: world.caseB, // дело lawyer2 — lawyer1 его не видит
        due_date: '2026-09-01',
        amount: 1000,
        created_by: world.users.lawyer1.id,
      });
      expect(error).not.toBeNull();
    });

    it('подделка created_by (чужой uid) — отказ RLS', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('payment_plan_items').insert({
        case_id: world.caseA,
        due_date: '2026-09-02',
        amount: 1000,
        created_by: world.users.lawyer2.id, // не active_uid
      });
      expect(error).not.toBeNull();
    });
  });

  describe('overdue_plan_items — под RLS invoker', () => {
    beforeAll(async () => {
      // Просроченные позиции на оба дела (admin обходит RLS при вставке).
      const { error } = await world.admin.from('payment_plan_items').insert([
        {
          case_id: world.caseA,
          due_date: '2020-01-01',
          amount: 500,
          created_by: world.users.lawyer1.id,
        },
        {
          case_id: world.caseB,
          due_date: '2020-01-01',
          amount: 700,
          created_by: world.users.lawyer2.id,
        },
      ]);
      expect(error).toBeNull();
    });

    it('lawyer1 видит просрочку ТОЛЬКО своих дел (caseA, не caseB)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { data, error } = await lawyer1.rpc('overdue_plan_items', {
        p_today: '2026-06-11',
      });
      expect(error).toBeNull();
      const ids = ((data ?? []) as Array<{ case_id: string }>).map((r) => r.case_id);
      expect(ids).toContain(world.caseA);
      expect(ids).not.toContain(world.caseB);
    });

    it('lawyer2 видит просрочку своего дела (caseB, не caseA)', async () => {
      const lawyer2 = await signIn(world.users.lawyer2.email);
      const { data, error } = await lawyer2.rpc('overdue_plan_items', {
        p_today: '2026-06-11',
      });
      expect(error).toBeNull();
      const ids = ((data ?? []) as Array<{ case_id: string }>).map((r) => r.case_id);
      expect(ids).toContain(world.caseB);
      expect(ids).not.toContain(world.caseA);
    });
  });
});
