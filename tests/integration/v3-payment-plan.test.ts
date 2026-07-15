import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import { rpcOverduePlanItems } from '@/lib/db/rpc';

// Интеграционные тесты v3 Сессии 9 (график платежей). Проверяем:
//   • RLS payment_plan_items: юрист дела создаёт позицию своего дела (ок),
//     чужого — отказ; подделка created_by — отказ;
//   • overdue_plan_items (SECURITY INVOKER): юрист видит просрочку ТОЛЬКО своих
//     дел (RLS вызывающего режет выдачу).
//
// Фикстура: caseA = lawyer1 + expert1 (in_progress, оплата 10000); caseB =
// lawyer2 + expert2 (consultation, без оплат). lawyer1 не видит caseB и наоборот.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v3-payment-plan] Пропущено: нет DATABASE_URL_* в .env.local.');
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
      const row = await userDb(world.users.lawyer1.id, (tx) =>
        tx.payment_plan_items.create({
          data: {
            case_id: world.caseA,
            due_date: new Date('2026-09-01'),
            amount: 1000,
            created_by: world.users.lawyer1.id,
          },
        }),
      );
      expect(row.case_id).toBe(world.caseA);
    });

    it('юрист создаёт позицию ЧУЖОГО дела (caseB) — отказ RLS', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.payment_plan_items.create({
            data: {
              case_id: world.caseB, // дело lawyer2 — lawyer1 его не видит
              due_date: new Date('2026-09-01'),
              amount: 1000,
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('подделка created_by (чужой uid) — отказ RLS', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.payment_plan_items.create({
            data: {
              case_id: world.caseA,
              due_date: new Date('2026-09-02'),
              amount: 1000,
              created_by: world.users.lawyer2.id, // не active_uid
            },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('overdue_plan_items — под RLS invoker', () => {
    beforeAll(async () => {
      // Просроченные позиции на оба дела (admin обходит RLS при вставке).
      await world.admin.payment_plan_items.createMany({
        data: [
          {
            case_id: world.caseA,
            due_date: new Date('2020-01-01'),
            amount: 500,
            created_by: world.users.lawyer1.id,
          },
          {
            case_id: world.caseB,
            due_date: new Date('2020-01-01'),
            amount: 700,
            created_by: world.users.lawyer2.id,
          },
        ],
      });
    });

    it('lawyer1 видит просрочку ТОЛЬКО своих дел (caseA, не caseB)', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) =>
        rpcOverduePlanItems(tx, { today: '2026-06-11' }),
      );
      const ids = rows.map((r) => r.case_id);
      expect(ids).toContain(world.caseA);
      expect(ids).not.toContain(world.caseB);
    });

    it('lawyer2 видит просрочку своего дела (caseB, не caseA)', async () => {
      const rows = await userDb(world.users.lawyer2.id, (tx) =>
        rpcOverduePlanItems(tx, { today: '2026-06-11' }),
      );
      const ids = rows.map((r) => r.case_id);
      expect(ids).toContain(world.caseB);
      expect(ids).not.toContain(world.caseA);
    });
  });
});
