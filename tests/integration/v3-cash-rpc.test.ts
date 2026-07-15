import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import {
  rpcCashBalancesBefore,
  rpcCashBackfillPayments,
  rpcCashUnsyncedPaymentsCount,
} from '@/lib/db/rpc';

// Интеграционные тесты v3 Сессии 3 (касса: SQL-сальдо, бэкфилл, право). Проверяем:
//   • cash_balances_before — перенос остатка строго до даты (опер. до opening_date и
//     >= cutoff исключены);
//   • cash_backfill_payments — заводит строки кассы для платежей без них и идемпотентен;
//   • RPC под юзером без can_manage_cash → ошибка/0/пусто.
//
// Тест самодостаточен: создаёт собственный счёт ACC (kind=bank, не дефолтный — чтобы не
// конфликтовать с засеянным дефолтным счётом), ручные операции для баланса и платёж для
// бэкфилла. Изоляция вызовов последовательная (vitest singleFork) → в БД живут только
// наши данные, поэтому «повторный backfill → 0» детерминирован. Чистка — destroyWorld
// (cash_entries/cash_accounts по created_by=owner; платежи по case_id → каскад).

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v3-cash-rpc] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — v3 касса: сальдо, бэкфилл, право (Сессия 3)', () => {
  let world: World;
  let accId: string;

  beforeAll(async () => {
    world = await createWorld();

    // Собственный счёт кассы (bank, не дефолтный — избегаем конфликта с засеянным
    // дефолтным счётом по partial-unique cash_accounts_one_default).
    const acc = await world.admin.cash_accounts.create({
      data: {
        name: `IT-${world.runId}-bank`,
        kind: 'bank',
        opening_balance: 0,
        opening_date: new Date('2026-01-01'),
        is_default: false,
        created_by: world.users.owner.id,
      },
      select: { id: true },
    });
    accId = acc.id;

    // Ручные операции для теста переноса остатка. 999 — РАНЬШЕ opening_date (2026-01-01),
    // должна быть исключена из переноса; out 30 (2026-03-20) — после cutoff в первом кейсе.
    await world.admin.cash_entries.createMany({
      data: [
        {
          account_id: accId,
          entry_date: new Date('2025-12-01'),
          direction: 'in',
          amount: 999,
          description: 'IT до opening_date',
          created_by: world.users.owner.id,
        },
        {
          account_id: accId,
          entry_date: new Date('2026-03-01'),
          direction: 'in',
          amount: 100,
          description: 'IT in1',
          created_by: world.users.owner.id,
        },
        {
          account_id: accId,
          entry_date: new Date('2026-03-15'),
          direction: 'in',
          amount: 50,
          description: 'IT in2',
          created_by: world.users.owner.id,
        },
        {
          account_id: accId,
          entry_date: new Date('2026-03-20'),
          direction: 'out',
          amount: 30,
          description: 'IT out1',
          created_by: world.users.owner.id,
        },
      ],
    });
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  describe('cash_balances_before — перенос остатка', () => {
    it('возвращает сумму только до даты (опер. до opening_date и после cutoff исключены)', async () => {
      const { row1, row2 } = await userDb(world.users.owner.id, async (tx) => {
        // До 2026-03-16: in100 (03-01) + in50 (03-15) = 150; out30 (03-20) и 999 (до opening) — нет.
        const rows1 = await rpcCashBalancesBefore(tx, { before: '2026-03-16' });
        // До 2026-06-01: in100 + in50 − out30 = 120 (999 всё ещё исключена — до opening_date).
        const rows2 = await rpcCashBalancesBefore(tx, { before: '2026-06-01' });
        return {
          row1: rows1.find((r) => r.account_id === accId),
          row2: rows2.find((r) => r.account_id === accId),
        };
      });
      expect(row1?.balance).toBe(150);
      expect(row2?.balance).toBe(120);
    });
  });

  describe('cash_backfill_payments — недостающие строки + идемпотентность', () => {
    it('создаёт строку кассы для платежа без неё и не дублирует при повторе', async () => {
      // Платёж по делу; его авто-строку удаляем — имитируем платёж, внесённый до настройки
      // счетов (или иным путём оставшийся без кассы).
      const pay = await world.admin.payments.create({
        data: {
          case_id: world.caseA,
          amount: 4321,
          paid_at: new Date('2026-05-20'),
          method: 'bank',
          note: 'IT backfill payment',
          created_by: world.users.owner.id,
        },
        select: { id: true },
      });
      const payId = pay.id;

      await world.admin.cash_entries.deleteMany({ where: { payment_id: payId } });

      const { cntBefore, made } = await userDb(world.users.owner.id, async (tx) => {
        const cntBefore = await rpcCashUnsyncedPaymentsCount(tx);
        const made = await rpcCashBackfillPayments(tx);
        return { cntBefore, made };
      });
      expect(cntBefore).toBeGreaterThanOrEqual(1);
      expect(made).toBeGreaterThanOrEqual(1);

      // Платёж теперь отражён ровно одной строкой кассы.
      const forP = await world.admin.cash_entries.count({ where: { payment_id: payId } });
      expect(forP).toBe(1);

      // Идемпотентно: все платежи синхронизированы → повторный вызов 0.
      const made2 = await userDb(world.users.owner.id, (tx) => rpcCashBackfillPayments(tx));
      expect(made2).toBe(0);

      // Чистим платёж (каскад снимет связанную строку кассы).
      await world.admin.payments.delete({ where: { id: payId } });
    });
  });

  describe('право can_manage_cash обязательно', () => {
    it('RPC под lawyer (без права) → бэкфилл падает, счётчик 0, баланс пуст', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) => rpcCashBackfillPayments(tx)),
      ).rejects.toThrow();

      const { cnt, bal } = await userDb(world.users.lawyer1.id, async (tx) => {
        const cnt = await rpcCashUnsyncedPaymentsCount(tx);
        const bal = await rpcCashBalancesBefore(tx, { before: '2026-06-01' });
        return { cnt, bal };
      });
      expect(cnt).toBe(0);
      expect(bal).toHaveLength(0);
    });
  });
});
