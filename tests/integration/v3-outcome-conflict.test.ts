import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import { rpcCloseCaseLost, rpcConflictCheck } from '@/lib/db/rpc';

// Интеграционные тесты v3 Сессии 7 (Продукт). Проверяем:
//   • public.close_case_lost: юрист дела закрывает дело как «не заключили» с этапа
//     new_request (stage→closed, outcome=lost, запись case_lost в activity_log);
//   • close_case_lost с этапа in_progress → исключение (lost только до контракта);
//   • public.conflict_check: находит клиента по ИНН и оппонента по имени.
//
// caseS = lawyer1(Київ) + expert1(Дніпро), document, new_request — кандидат на lost.
// caseA = ... in_progress — lost запрещён.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v3-outcome-conflict] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — v3 исход «не заключили» + конфликт-чек (Сессия 7)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  describe('close_case_lost', () => {
    it('юрист дела закрывает дело с этапа new_request как lost', async () => {
      await userDb(world.users.lawyer1.id, (tx) =>
        rpcCloseCaseLost(tx, { caseId: world.caseS, reason: 'IT lost reason' }),
      );

      // Дело: closed + outcome=lost + причина + closed_at проставлен.
      const row = await world.admin.cases.findFirst({
        where: { id: world.caseS },
        select: { stage: true, outcome: true, lost_reason: true, closed_at: true },
      });
      expect(row?.stage).toBe('closed');
      expect(row?.outcome).toBe('lost');
      expect(row?.lost_reason).toBe('IT lost reason');
      expect(row?.closed_at).not.toBeNull();

      // Журнал: запись case_lost по делу.
      const log = await world.admin.activity_log.findMany({
        where: { entity_type: 'case', entity_id: world.caseS, action: 'case_lost' },
        select: { id: true, action: true },
      });
      expect(log.length).toBeGreaterThanOrEqual(1);
    });

    it('lost с этапа in_progress → исключение', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          rpcCloseCaseLost(tx, { caseId: world.caseA, reason: '' }), // in_progress
        ),
      ).rejects.toThrow();
    });

    it('не-юрист и не-staff (эксперт дела) НЕ закрывает как lost', async () => {
      // caseB = lawyer2 + expert2, consultation. expert2 — эксперт, не юрист → 42501.
      await expect(
        userDb(world.users.expert2.id, (tx) =>
          rpcCloseCaseLost(tx, { caseId: world.caseB, reason: '' }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('conflict_check', () => {
    it('находит клиента по ИНН и оппонента по имени', async () => {
      const inn = '1234509876';
      const opponentName = `Opponent-${world.runId}`;
      // Проставляем ИНН нашему клиенту и оппонента — нашему делу (admin-пул).
      await world.admin.clients.update({ where: { id: world.clientId }, data: { inn } });
      await world.admin.cases.update({
        where: { id: world.caseB },
        data: { opponent: opponentName },
      });

      // По ИНН → совпадение-клиент (наш клиент в label).
      const byInn = await userDb(world.users.owner.id, (tx) =>
        rpcConflictCheck(tx, { name: null, inn, phone: null }),
      );
      expect(
        byInn.some((r) => r.kind === 'client' && r.label.includes(world.runId)),
      ).toBe(true);

      // По имени оппонента → ветка opponent (дело в label).
      const byName = await userDb(world.users.owner.id, (tx) =>
        rpcConflictCheck(tx, { name: opponentName, inn: null, phone: null }),
      );
      expect(byName.some((r) => r.kind === 'opponent')).toBe(true);

      // Прибираем за собой (destroyWorld и так удалит дело/клиента).
      await world.admin.clients.update({ where: { id: world.clientId }, data: { inn: null } });
      await world.admin.cases.update({ where: { id: world.caseB }, data: { opponent: null } });
    });
  });
});
