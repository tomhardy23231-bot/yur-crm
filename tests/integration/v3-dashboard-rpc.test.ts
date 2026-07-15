import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import {
  rpcDashboardPaymentMonths,
  rpcDashboardStockMonths,
} from '@/lib/db/rpc';

// Интеграционные тесты v3 Сессии 4 (агрегаты дашборда в SQL). Главное: функции
// SECURITY INVOKER, поэтому RLS вызывающего ДОЛЖНА резать выдачу по роли — каждый
// видит платежи/дела ТОЛЬКО своих дел. Если бы они были DEFINER, lawyer2 «увидел»
// бы выручку чужого дела.
//
// Фикстура (helpers/fixtures): caseA = lawyer1 + expert1, оплата 10000 (2026-05-10);
// caseB = lawyer2 + expert2, БЕЗ оплат; caseS = lawyer1, document, без оплат.
// Ждём: lawyer1 видит выручку 10000 (его caseA), lawyer2 — 0 (его caseB без оплат).

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v3-dashboard-rpc] Пропущено: нет DATABASE_URL_* в .env.local.');
}

const FROM = '2026-01-01'; // покрывает май 2026 (оплата caseA)

suite('Юр CRM — v3 дашборд: SQL-агрегаты под RLS (Сессия 4)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  describe('dashboard_payment_months — выручка по месяцам под RLS invoker', () => {
    it('lawyer видит выручку ТОЛЬКО своих дел (caseA = 10000)', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) =>
        rpcDashboardPaymentMonths(tx, { from: FROM }),
      );
      // Единственный видимый платёж — 10000 по caseA в мае 2026.
      const sum = rows.reduce((acc, r) => acc + r.total, 0);
      expect(sum).toBe(10000);
      const may = rows.find((r) => r.month_start.startsWith('2026-05'));
      expect(may?.total).toBe(10000);
    });

    it('второй юрист НЕ видит чужую выручку (его дело без оплат → пусто/0)', async () => {
      const rows = await userDb(world.users.lawyer2.id, (tx) =>
        rpcDashboardPaymentMonths(tx, { from: FROM }),
      );
      const sum = rows.reduce((acc, r) => acc + r.total, 0);
      expect(sum).toBe(0);
    });
  });

  describe('dashboard_stock_months — снимки на конец месяца под RLS invoker', () => {
    it('возвращает 6 строк; salary юриста > 0 по оплаченному делу', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) =>
        rpcDashboardStockMonths(tx, {
          from: FROM,
          userId: world.users.lawyer1.id,
          fixedUserIds: [],
        }),
      );
      expect(rows).toHaveLength(6);
      // Последний снимок (после мая) учитывает оплату caseA → salary > 0, долг > 0.
      const last = rows[rows.length - 1]!;
      expect(last.salary).toBeGreaterThan(0);
      expect(last.debt).toBeGreaterThan(0);
    });

    it('у второго юриста (его дело без оплат) salary == 0', async () => {
      const rows = await userDb(world.users.lawyer2.id, (tx) =>
        rpcDashboardStockMonths(tx, {
          from: FROM,
          userId: world.users.lawyer2.id,
          fixedUserIds: [],
        }),
      );
      const salarySum = rows.reduce((acc, r) => acc + r.salary, 0);
      expect(salarySum).toBe(0);
    });
  });
});
