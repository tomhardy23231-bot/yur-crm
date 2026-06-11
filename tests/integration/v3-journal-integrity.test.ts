import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты v3 Сессии 2 (журнал и целостность). Проверяем:
//   • смена этапа staff оставляет запись в activity_log;
//   • Σ аллокаций выплаты не может превышать сумму транзакции (check_payout_allocations);
//   • create_payout не вешает выплату на чужое дело;
//   • payroll_rates нельзя удалить (RLS без DELETE-политики);
//   • отпуска одного сотрудника не пересекаются (absences_no_overlap).
//
// caseA = lawyer1(Київ) + expert1(Дніпро) representation, оплачено 10000;
// caseB = lawyer2(Дніпро) + expert2(Львів) claim, stage consultation.

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:v3-journal-integrity] Пропущено: нет Supabase env в .env.local.');
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
      await world.admin.from('payroll_transactions').delete().in('user_id', userIds);
      await destroyWorld(world);
    }
  });

  async function logCount(caseId: string): Promise<number> {
    const { count } = await world.admin
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', caseId);
    return count ?? 0;
  }

  describe('журнал смены этапа', () => {
    it('staff-смена этапа оставляет запись в activity_log', async () => {
      const before = await logCount(world.caseB);
      const owner = await signIn(world.users.owner.email);
      // Откат назад (staff-исправление) → триггер cases_validate_stage_forward
      // пишет stage_corrected в журнал.
      const { error: back } = await owner
        .from('cases')
        .update({ stage: 'new_request' })
        .eq('id', world.caseB);
      expect(back).toBeNull();

      const after = await logCount(world.caseB);
      expect(after).toBeGreaterThan(before);

      // Восстанавливаем исходный этап.
      await owner.from('cases').update({ stage: 'consultation' }).eq('id', world.caseB);
    });
  });

  describe('целостность выплат', () => {
    it('Σ аллокаций сверх суммы payout-транзакции → ошибка на коммите', async () => {
      const { data: tx, error: txErr } = await world.admin
        .from('payroll_transactions')
        .insert({
          user_id: world.users.lawyer1.id,
          kind: 'payout',
          amount: 100,
          created_by: world.users.owner.id,
        })
        .select('id')
        .single();
      expect(txErr).toBeNull();
      const txId = (tx as { id: string }).id;

      // Аллокация ровно на сумму выплаты (Σ = 100 = amount) — ок.
      const { error: a1 } = await world.admin
        .from('payout_allocations')
        .insert({ transaction_id: txId, case_id: world.caseA, role_in_case: 'lawyer', amount: 100 });
      expect(a1).toBeNull();

      // Вторая аллокация (Σ = 150 > 100) → нарушение инварианта.
      const { error: a2 } = await world.admin
        .from('payout_allocations')
        .insert({ transaction_id: txId, case_id: world.caseA, role_in_case: 'expert', amount: 50 });
      expect(a2).not.toBeNull();

      // Чистим выплату (каскад снимет аллокации).
      await world.admin.from('payroll_transactions').delete().eq('id', txId);
    });

    it('create_payout с аллокацией на чужое дело → исключение', async () => {
      // caseA принадлежит lawyer1; пытаемся выплатить lawyer2 за caseA в роли lawyer.
      const owner = await signIn(world.users.owner.email);
      const { error } = await owner.rpc('create_payout', {
        p_user_id: world.users.lawyer2.id,
        p_comment: null,
        p_occurred_on: '2026-06-01',
        p_allocations: [{ case_id: world.caseA, role_in_case: 'lawyer', amount: 50 }],
      });
      expect(error).not.toBeNull();
    });
  });

  describe('payroll_rates не удаляется', () => {
    it('DELETE из payroll_rates под owner → 0 строк, ставка на месте', async () => {
      const owner = await signIn(world.users.owner.email);
      const { data, error } = await owner
        .from('payroll_rates')
        .delete()
        .eq('category', 'document')
        .select('category');
      // RLS без DELETE-политики → 0 строк (не ошибка).
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);

      const { data: still } = await world.admin
        .from('payroll_rates')
        .select('category')
        .eq('category', 'document')
        .maybeSingle();
      expect(still?.category).toBe('document');
    });
  });

  describe('непересечение отпусков', () => {
    it('два пересекающихся отпуска одному юзеру → второй падает', async () => {
      const { error: e1 } = await world.admin.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-09-01',
        ends_on: '2026-09-10',
        created_by: world.users.owner.id,
      });
      expect(e1).toBeNull();

      const { error: e2 } = await world.admin.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-09-05',
        ends_on: '2026-09-15',
        created_by: world.users.owner.id,
      });
      expect(e2).not.toBeNull();

      // Чистим (destroyWorld тоже уберёт по user_id/created_by).
      await world.admin.from('absences').delete().eq('user_id', world.users.lawyer1.id);
    });
  });
});
