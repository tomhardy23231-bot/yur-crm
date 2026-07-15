import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import { rpcCreatePayout } from '@/lib/db/rpc';

// Интеграционные тесты v3 Сессии 2 (журнал и целостность). Проверяем:
//   • смена этапа staff оставляет запись в activity_log;
//   • Σ аллокаций выплаты не может превышать сумму транзакции (check_payout_allocations);
//   • create_payout не вешает выплату на чужое дело;
//   • payroll_rates нельзя удалить (RLS без DELETE-политики);
//   • отпуска одного сотрудника не пересекаются (absences_no_overlap).
//
// caseA = lawyer1(Київ) + expert1(Дніпро) representation, оплачено 10000;
// caseB = lawyer2(Дніпро) + expert2(Львів) claim, stage consultation.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v3-journal-integrity] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — v3 журнал и целостность (Сессия 2)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) {
      // payroll_transactions не чистится destroyWorld, а ссылается на cases/users
      // (on delete restrict) — снимаем возможные хвосты до удаления мира.
      const userIds = Object.values(world.users).map((u) => u.id);
      await world.admin.payroll_transactions.deleteMany({
        where: { user_id: { in: userIds } },
      });
      await destroyWorld(world);
    }
  });

  async function logCount(caseId: string): Promise<number> {
    return world.admin.activity_log.count({ where: { entity_id: caseId } });
  }

  describe('журнал смены этапа', () => {
    it('staff-смена этапа оставляет запись в activity_log', async () => {
      const before = await logCount(world.caseB);
      // Откат назад (staff-исправление) → триггер cases_validate_stage_forward
      // пишет stage_corrected в журнал.
      await userDb(world.users.owner.id, (tx) =>
        tx.cases.update({ where: { id: world.caseB }, data: { stage: 'new_request' } }),
      );

      const after = await logCount(world.caseB);
      expect(after).toBeGreaterThan(before);

      // Восстанавливаем исходный этап.
      await userDb(world.users.owner.id, (tx) =>
        tx.cases.update({ where: { id: world.caseB }, data: { stage: 'consultation' } }),
      );
    });
  });

  describe('целостность выплат', () => {
    it('Σ аллокаций сверх суммы payout-транзакции → ошибка на коммите', async () => {
      const payout = await world.admin.payroll_transactions.create({
        data: {
          user_id: world.users.lawyer1.id,
          kind: 'payout',
          amount: 100,
          created_by: world.users.owner.id,
        },
        select: { id: true },
      });

      // Аллокация ровно на сумму выплаты (Σ = 100 = amount) — ок.
      await world.admin.payout_allocations.create({
        data: {
          transaction_id: payout.id,
          case_id: world.caseA,
          role_in_case: 'lawyer',
          amount: 100,
        },
      });

      // Вторая аллокация (Σ = 150 > 100) → нарушение инварианта (DEFERRED-триггер
      // check_payout_allocations стреляет на коммите этого INSERT).
      await expect(
        world.admin.payout_allocations.create({
          data: {
            transaction_id: payout.id,
            case_id: world.caseA,
            role_in_case: 'expert',
            amount: 50,
          },
        }),
      ).rejects.toThrow();

      // Чистим выплату (каскад снимет аллокации).
      await world.admin.payroll_transactions.delete({ where: { id: payout.id } });
    });

    it('create_payout с аллокацией на чужое дело → исключение', async () => {
      // caseA принадлежит lawyer1; пытаемся выплатить lawyer2 за caseA в роли lawyer.
      await expect(
        userDb(world.users.owner.id, (tx) =>
          rpcCreatePayout(tx, {
            userId: world.users.lawyer2.id,
            comment: null,
            occurredOn: '2026-06-01',
            allocations: [{ case_id: world.caseA, role_in_case: 'lawyer', amount: 50 }],
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('payroll_rates не удаляется', () => {
    it('DELETE из payroll_rates под owner → 0 строк, ставка на месте', async () => {
      const result = await userDb(world.users.owner.id, (tx) =>
        tx.payroll_rates.deleteMany({ where: { category: 'document' } }),
      );
      // RLS без DELETE-политики → 0 строк (не ошибка).
      expect(result.count).toBe(0);

      const still = await world.admin.payroll_rates.findFirst({
        where: { category: 'document' },
        select: { category: true },
      });
      expect(still?.category).toBe('document');
    });
  });

  describe('непересечение отпусков', () => {
    it('два пересекающихся отпуска одному юзеру → второй падает', async () => {
      await world.admin.absences.create({
        data: {
          user_id: world.users.lawyer1.id,
          kind: 'vacation',
          starts_on: new Date('2026-09-01'),
          ends_on: new Date('2026-09-10'),
          created_by: world.users.owner.id,
        },
      });

      await expect(
        world.admin.absences.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'vacation',
            starts_on: new Date('2026-09-05'),
            ends_on: new Date('2026-09-15'),
            created_by: world.users.owner.id,
          },
        }),
      ).rejects.toThrow();

      // Чистим (destroyWorld тоже уберёт по user_id/created_by).
      await world.admin.absences.deleteMany({ where: { user_id: world.users.lawyer1.id } });
    });
  });
});
