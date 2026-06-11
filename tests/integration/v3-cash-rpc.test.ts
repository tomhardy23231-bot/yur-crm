import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

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

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:v3-cash-rpc] Пропущено: нет Supabase env в .env.local.');
}

suite('Юр CRM — v3 касса: сальдо, бэкфилл, право (Сессия 3)', () => {
  let world: World;
  let accId: string;

  beforeAll(async () => {
    world = await createWorld();

    // Собственный счёт кассы (bank, не дефолтный — избегаем конфликта с засеянным
    // дефолтным счётом по partial-unique cash_accounts_one_default).
    const { data: acc, error: accErr } = await world.admin
      .from('cash_accounts')
      .insert({
        name: `IT-${world.runId}-bank`,
        kind: 'bank',
        opening_balance: 0,
        opening_date: '2026-01-01',
        is_default: false,
        created_by: world.users.owner.id,
      })
      .select('id')
      .single();
    if (accErr || !acc) throw new Error(`cash account: ${accErr?.message}`);
    accId = (acc as { id: string }).id;

    // Ручные операции для теста переноса остатка. 999 — РАНЬШЕ opening_date (2026-01-01),
    // должна быть исключена из переноса; out 30 (2026-03-20) — после cutoff в первом кейсе.
    const { error: eErr } = await world.admin.from('cash_entries').insert([
      { account_id: accId, entry_date: '2025-12-01', direction: 'in', amount: 999, description: 'IT до opening_date', created_by: world.users.owner.id },
      { account_id: accId, entry_date: '2026-03-01', direction: 'in', amount: 100, description: 'IT in1', created_by: world.users.owner.id },
      { account_id: accId, entry_date: '2026-03-15', direction: 'in', amount: 50, description: 'IT in2', created_by: world.users.owner.id },
      { account_id: accId, entry_date: '2026-03-20', direction: 'out', amount: 30, description: 'IT out1', created_by: world.users.owner.id },
    ]);
    if (eErr) throw new Error(`cash entries: ${eErr.message}`);
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  describe('cash_balances_before — перенос остатка', () => {
    it('возвращает сумму только до даты (опер. до opening_date и после cutoff исключены)', async () => {
      const owner = await signIn(world.users.owner.email);

      // До 2026-03-16: in100 (03-01) + in50 (03-15) = 150; out30 (03-20) и 999 (до opening) — нет.
      const { data: d1, error: e1 } = await owner.rpc('cash_balances_before', {
        p_before: '2026-03-16',
      });
      expect(e1).toBeNull();
      const row1 = (d1 as Array<{ account_id: string; balance: number | string }>).find(
        (r) => r.account_id === accId,
      );
      expect(Number(row1?.balance)).toBe(150);

      // До 2026-06-01: in100 + in50 − out30 = 120 (999 всё ещё исключена — до opening_date).
      const { data: d2 } = await owner.rpc('cash_balances_before', { p_before: '2026-06-01' });
      const row2 = (d2 as Array<{ account_id: string; balance: number | string }>).find(
        (r) => r.account_id === accId,
      );
      expect(Number(row2?.balance)).toBe(120);
    });
  });

  describe('cash_backfill_payments — недостающие строки + идемпотентность', () => {
    it('создаёт строку кассы для платежа без неё и не дублирует при повторе', async () => {
      // Платёж по делу; его авто-строку удаляем — имитируем платёж, внесённый до настройки
      // счетов (или иным путём оставшийся без кассы).
      const { data: pay, error: pErr } = await world.admin
        .from('payments')
        .insert({
          case_id: world.caseA,
          amount: 4321,
          paid_at: '2026-05-20',
          method: 'bank',
          note: 'IT backfill payment',
          created_by: world.users.owner.id,
        })
        .select('id')
        .single();
      expect(pErr).toBeNull();
      const payId = (pay as { id: string }).id;

      await world.admin.from('cash_entries').delete().eq('payment_id', payId);

      const owner = await signIn(world.users.owner.email);

      const { data: cntBefore } = await owner.rpc('cash_unsynced_payments_count');
      expect(Number(cntBefore)).toBeGreaterThanOrEqual(1);

      const { data: made, error: mErr } = await owner.rpc('cash_backfill_payments');
      expect(mErr).toBeNull();
      expect(Number(made)).toBeGreaterThanOrEqual(1);

      // Платёж теперь отражён ровно одной строкой кассы.
      const { count: forP } = await world.admin
        .from('cash_entries')
        .select('id', { count: 'exact', head: true })
        .eq('payment_id', payId);
      expect(forP).toBe(1);

      // Идемпотентно: все платежи синхронизированы → повторный вызов 0.
      const { data: made2, error: m2Err } = await owner.rpc('cash_backfill_payments');
      expect(m2Err).toBeNull();
      expect(Number(made2)).toBe(0);

      // Чистим платёж (каскад снимет связанную строку кассы).
      await world.admin.from('payments').delete().eq('id', payId);
    });
  });

  describe('право can_manage_cash обязательно', () => {
    it('RPC под lawyer (без права) → бэкфилл падает, счётчик 0, баланс пуст', async () => {
      const lawyer = await signIn(world.users.lawyer1.email);

      const { error: bErr } = await lawyer.rpc('cash_backfill_payments');
      expect(bErr).not.toBeNull();

      const { data: cnt } = await lawyer.rpc('cash_unsynced_payments_count');
      expect(Number(cnt)).toBe(0);

      const { data: bal } = await lawyer.rpc('cash_balances_before', { p_before: '2026-06-01' });
      expect(bal ?? []).toHaveLength(0);
    });
  });
});
