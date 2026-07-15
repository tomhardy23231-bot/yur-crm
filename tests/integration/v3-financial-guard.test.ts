import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import { rpcConfirmActPaid } from '@/lib/db/rpc';

// Интеграционные тесты v3 Сессии 1 (БД-безопасность). Проверяем:
//   • гард финансовых полей дела (cases_guard_financial_fields): не-staff не меняет
//     category/contract_sum/lawyer_id/responsible_id/client_id, прочие поля — может;
//   • неизменяемость act-связанного платежа (payments_guard_act_payment);
//   • пересчёт completion актов при смене contract_sum (cases_recompute_acts_on_sum);
//   • скоуп confirm_act_paid по подразделению (admin чужого филиала не подтвердит).
//
// caseA = lawyer1(Київ) + expert1(Дніпро), representation 30000, оплачено 10000.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v3-financial-guard] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — v3 финансовый гард (Сессия 1)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // Создать issued-акт на caseA (Експерт дела) и подтвердить оплату owner'ом.
  async function makePaidAct(
    amount: number,
    suffix: string,
  ): Promise<{ actId: string; paymentId: string }> {
    const act = await userDb(world.users.expert1.id, (tx) =>
      tx.case_acts.create({
        data: {
          case_id: world.caseA,
          amount,
          issued_at: new Date('2026-05-20'),
          created_by: world.users.expert1.id,
        },
        select: { id: true },
      }),
    );

    const paymentId = await userDb(world.users.owner.id, (tx) =>
      rpcConfirmActPaid(tx, {
        actId: act.id,
        confirmedAmount: amount,
        paidAt: '2026-05-20',
        storageKey: `${world.prefix}${suffix}.pdf`,
        fileName: `${suffix}.pdf`,
        method: 'act',
        note: null,
      }),
    );
    return { actId: act.id, paymentId };
  }

  // Удалить платёж (вернёт акт в issued триггером) и сам акт (admin-пул — мимо RLS).
  async function cleanupAct(actId: string, paymentId: string) {
    await world.admin.payments.delete({ where: { id: paymentId } });
    await world.admin.case_acts.delete({ where: { id: actId } });
  }

  describe('гард финансовых полей дела', () => {
    it('юрист дела меняет subject своего дела → ок', async () => {
      const updated = await userDb(world.users.lawyer1.id, (tx) =>
        tx.cases.update({
          where: { id: world.caseA },
          data: { subject: `${world.prefix}subj` },
        }),
      );
      expect(updated.subject).toBe(`${world.prefix}subj`);
    });

    it('юрист дела меняет category → 42501 (гард)', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.cases.update({
            where: { id: world.caseA },
            data: { category: 'claim' },
          }),
        ),
      ).rejects.toThrow(/only staff can change financial fields/);

      // Значение не изменилось.
      const data = await world.admin.cases.findFirst({
        where: { id: world.caseA },
        select: { category: true },
      });
      expect(data?.category).toBe('representation');
    });

    it('owner меняет category → ок', async () => {
      const updated = await userDb(world.users.owner.id, (tx) =>
        tx.cases.update({
          where: { id: world.caseA },
          data: { category: 'claim' },
        }),
      );
      expect(updated.category).toBe('claim');
      // Возвращаем representation — другие кейсы на него рассчитывают.
      await userDb(world.users.owner.id, (tx) =>
        tx.cases.update({
          where: { id: world.caseA },
          data: { category: 'representation' },
        }),
      );
    });
  });

  describe('act-платёж неизменяем', () => {
    it('UPDATE amount платежа с act_id (owner) → 42501', async () => {
      const { actId, paymentId } = await makePaidAct(2000, 's1pay');
      await expect(
        userDb(world.users.owner.id, (tx) =>
          tx.payments.update({
            where: { id: paymentId },
            data: { amount: 9999 },
          }),
        ),
      ).rejects.toThrow(/act-linked payment is immutable/);
      await cleanupAct(actId, paymentId);
    });
  });

  describe('contract_sum пересчитывает completion актов', () => {
    it('owner меняет contract_sum дела с paid-актом → completion пересчитан', async () => {
      // Акт 2000 при contract 30000 → partial.
      const { actId, paymentId } = await makePaidAct(2000, 's1sum');
      const before = await world.admin.case_acts.findFirst({
        where: { id: actId },
        select: { completion: true },
      });
      expect(before?.completion).toBe('partial');

      // Снижаем сумму договора до 1000 → 2000 ≥ 1000 → full.
      await userDb(world.users.owner.id, (tx) =>
        tx.cases.update({
          where: { id: world.caseA },
          data: { contract_sum: 1000 },
        }),
      );

      const after = await world.admin.case_acts.findFirst({
        where: { id: actId },
        select: { completion: true },
      });
      expect(after?.completion).toBe('full');

      // Восстанавливаем и чистим.
      await userDb(world.users.owner.id, (tx) =>
        tx.cases.update({
          where: { id: world.caseA },
          data: { contract_sum: 30000 },
        }),
      );
      await cleanupAct(actId, paymentId);
    });
  });

  describe('confirm_act_paid скоуп по подразделению', () => {
    it('admin чужого подразделения НЕ подтверждает акт чужого дела', async () => {
      // caseA принадлежит Київ/Дніпро; lvivAdmin (Львів) дело не видит.
      const act = await userDb(world.users.expert1.id, (tx) =>
        tx.case_acts.create({
          data: {
            case_id: world.caseA,
            amount: 1500,
            issued_at: new Date('2026-05-22'),
            created_by: world.users.expert1.id,
          },
          select: { id: true },
        }),
      );

      await expect(
        userDb(world.users.lvivAdmin.id, (tx) =>
          rpcConfirmActPaid(tx, {
            actId: act.id,
            confirmedAmount: 1500,
            paidAt: '2026-05-22',
            storageKey: `${world.prefix}s1lviv.pdf`,
            fileName: 's1lviv.pdf',
            method: 'act',
            note: null,
          }),
        ),
      ).rejects.toThrow();

      // Акт остался issued — чистим напрямую.
      await world.admin.case_acts.delete({ where: { id: act.id } });
    });
  });
});
