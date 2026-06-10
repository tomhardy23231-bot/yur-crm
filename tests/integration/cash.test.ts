import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты кассы (v2 Этап 7). Доступ — по праву can_manage_cash
// (по умолчанию только owner; выдаёт точечно тоже только owner). Проверяем:
//   • видимость счетов/операций по cap (owner и обладатель права — да; юрист — нет);
//   • АВТОПРИХОД: платёж по делу (method='bank') создаёт cash_entries(in) на счёт,
//     удаление платежа снимает строку (FK cascade);
//   • ручные операции: пишет/удаляет только cash-manager, payment_id обязан быть NULL,
//     авто-приход (payment_id NOT NULL) пользователю на UPDATE/DELETE не отдаётся;
//   • выдача права can_manage_cash — только владельцем (owner-only грант).

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:cash] Пропущено: нет Supabase env в .env.local.');
}

suite('Юр CRM — касса (RLS Этап 7)', () => {
  let world: World;
  let bankAccountId: string;

  beforeAll(async () => {
    world = await createWorld();

    // Выдаём office_manager (Київ) право управлять кассой (service_role — мимо guard).
    const { error: capErr } = await world.admin
      .from('users')
      .update({ perm_overrides: { can_manage_cash: true } })
      .eq('id', world.users.officeKyiv.id);
    if (capErr) throw new Error(`grant cash cap: ${capErr.message}`);

    // Счёт «банк» (kind='bank') — method='bank' автоприхода ляжет на него.
    const { data: acc, error: accErr } = await world.admin
      .from('cash_accounts')
      .insert({
        name: `${world.prefix}bank`,
        kind: 'bank',
        opening_balance: 1000,
        opening_date: '2026-05-01',
        is_default: false,
        created_by: world.users.owner.id,
      })
      .select('id')
      .single();
    if (accErr || !acc) throw new Error(`seed cash account: ${accErr?.message}`);
    bankAccountId = acc.id as string;
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // ── Видимость по праву (SELECT) ───────────────────────────────────
  describe('видимость по can_manage_cash', () => {
    it('owner видит счёт кассы', async () => {
      const owner = await signIn(world.users.owner.email);
      const { data, error } = await owner
        .from('cash_accounts')
        .select('id')
        .eq('id', bankAccountId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(1);
    });

    it('обладатель права (office_manager+cap) видит счёт', async () => {
      const office = await signIn(world.users.officeKyiv.email);
      const { data } = await office.from('cash_accounts').select('id').eq('id', bankAccountId);
      expect((data ?? []).length).toBe(1);
    });

    it('юрист без права НЕ видит счета', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { data } = await lawyer1.from('cash_accounts').select('id').eq('id', bankAccountId);
      expect((data ?? []).length).toBe(0);
    });

    it('юрист без права НЕ может завести счёт', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('cash_accounts').insert({
        name: `${world.prefix}hack`,
        kind: 'cash',
        opening_balance: 0,
        opening_date: '2026-05-01',
        created_by: world.users.lawyer1.id,
      });
      expect(error).not.toBeNull();
    });
  });

  // ── Автоприход платежа ────────────────────────────────────────────
  describe('автоприход платежа по делу', () => {
    it('платёж method=bank создаёт cash_entries(in) на счёт; удаление платежа снимает строку', async () => {
      // Юрист дела A вносит платёж (его сессия; can_write_case(A) = true).
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { data: pay, error: payErr } = await lawyer1
        .from('payments')
        .insert({
          case_id: world.caseA,
          amount: 1234.5,
          paid_at: '2026-05-12',
          method: 'bank',
          note: `${world.prefix}auto`,
          created_by: world.users.lawyer1.id,
        })
        .select('id')
        .single();
      expect(payErr).toBeNull();
      const paymentId = pay!.id as string;

      // Авто-строка кассы (читаем service_role — мимо RLS).
      const { data: entries } = await world.admin
        .from('cash_entries')
        .select('account_id, direction, amount, payment_id, created_by')
        .eq('payment_id', paymentId);
      expect((entries ?? []).length).toBe(1);
      const e = entries![0]!;
      expect(e.account_id).toBe(bankAccountId);
      expect(e.direction).toBe('in');
      expect(Number(e.amount)).toBe(1234.5);
      expect(e.created_by).toBe(world.users.lawyer1.id);

      // Удаляем платёж (owner — can edit_payments) → строка кассы исчезает (FK cascade).
      const owner = await signIn(world.users.owner.email);
      const { error: delErr } = await owner.from('payments').delete().eq('id', paymentId);
      expect(delErr).toBeNull();
      const { data: after } = await world.admin
        .from('cash_entries')
        .select('id')
        .eq('payment_id', paymentId);
      expect((after ?? []).length).toBe(0);
    });

    it('подтверждение акта (method=act) создаёт авто-приход на банковский счёт', async () => {
      // Експерт дела A выписывает акт (responsible_id), owner подтверждает оплату —
      // confirm_act_paid создаёт payment с method='act' → триггер кладёт приход на bank.
      const expert1 = await signIn(world.users.expert1.email);
      const { data: act, error: actErr } = await expert1
        .from('case_acts')
        .insert({
          case_id: world.caseA,
          amount: 2000,
          issued_at: '2026-05-20',
          created_by: world.users.expert1.id,
        })
        .select('id')
        .single();
      expect(actErr).toBeNull();

      const owner = await signIn(world.users.owner.email);
      const { data: paymentId, error: rpcErr } = await owner.rpc('confirm_act_paid', {
        p_act_id: act!.id,
        p_confirmed_amount: 2000,
        p_paid_at: '2026-05-20',
        p_storage_key: `${world.prefix}scan.pdf`,
        p_file_name: 'scan.pdf',
        p_method: 'act',
        p_note: null,
      });
      expect(rpcErr).toBeNull();

      const { data: entries } = await world.admin
        .from('cash_entries')
        .select('account_id, direction, amount')
        .eq('payment_id', paymentId as string);
      expect((entries ?? []).length).toBe(1);
      expect(entries![0]!.account_id).toBe(bankAccountId);
      expect(entries![0]!.direction).toBe('in');
      expect(Number(entries![0]!.amount)).toBe(2000);
    });
  });

  // ── Ручные операции ───────────────────────────────────────────────
  describe('ручные операции', () => {
    it('cash-manager вносит ручную операцию (payment_id NULL)', async () => {
      const office = await signIn(world.users.officeKyiv.email);
      const { error } = await office.from('cash_entries').insert({
        account_id: bankAccountId,
        entry_date: '2026-05-13',
        direction: 'out',
        amount: 500,
        description: `${world.prefix}rent`,
        created_by: world.users.officeKyiv.id,
      });
      expect(error).toBeNull();
    });

    it('юрист без права НЕ может внести операцию', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('cash_entries').insert({
        account_id: bankAccountId,
        entry_date: '2026-05-13',
        direction: 'out',
        amount: 100,
        description: `${world.prefix}hack`,
        created_by: world.users.lawyer1.id,
      });
      expect(error).not.toBeNull();
    });

    it('cash-manager НЕ может подсунуть payment_id вручную (with_check payment_id IS NULL)', async () => {
      const office = await signIn(world.users.officeKyiv.email);
      // Заведём настоящий платёж, чтобы payment_id ссылался на существующую строку.
      const { data: pay } = await world.admin
        .from('payments')
        .insert({
          case_id: world.caseA,
          amount: 10,
          paid_at: '2026-05-14',
          method: 'card',
          note: `${world.prefix}fk`,
          created_by: world.users.owner.id,
        })
        .select('id')
        .single();
      const { error } = await office.from('cash_entries').insert({
        account_id: bankAccountId,
        entry_date: '2026-05-14',
        direction: 'in',
        amount: 10,
        description: `${world.prefix}spoof`,
        payment_id: pay!.id,
        created_by: world.users.officeKyiv.id,
      });
      expect(error).not.toBeNull();
      await world.admin.from('payments').delete().eq('id', pay!.id);
    });

    it('cash-manager НЕ может удалить авто-приход (payment_id NOT NULL) — no-op', async () => {
      // Создаём авто-приход через платёж.
      const { data: pay } = await world.admin
        .from('payments')
        .insert({
          case_id: world.caseA,
          amount: 77,
          paid_at: '2026-05-15',
          method: 'bank',
          note: `${world.prefix}auto2`,
          created_by: world.users.owner.id,
        })
        .select('id')
        .single();
      const paymentId = pay!.id as string;
      const office = await signIn(world.users.officeKyiv.email);
      await office.from('cash_entries').delete().eq('payment_id', paymentId);
      // RLS не пустил (payment_id IS NULL гейт) → авто-строка цела.
      const { data: still } = await world.admin
        .from('cash_entries')
        .select('id')
        .eq('payment_id', paymentId);
      expect((still ?? []).length).toBe(1);
      await world.admin.from('payments').delete().eq('id', paymentId); // чистим (cascade)
    });

    it('cash-manager удаляет свою ручную операцию', async () => {
      const office = await signIn(world.users.officeKyiv.email);
      const note = `${world.prefix}del-manual`;
      const { data: ins } = await office
        .from('cash_entries')
        .insert({
          account_id: bankAccountId,
          entry_date: '2026-05-16',
          direction: 'out',
          amount: 42,
          description: note,
          created_by: world.users.officeKyiv.id,
        })
        .select('id')
        .single();
      await office.from('cash_entries').delete().eq('id', ins!.id);
      const { data: after } = await world.admin
        .from('cash_entries')
        .select('id')
        .eq('id', ins!.id);
      expect((after ?? []).length).toBe(0);
    });
  });

  // ── Выдача права can_manage_cash — только владелец ────────────────
  describe('грант права can_manage_cash', () => {
    it('admin (manage_users) НЕ может выдать can_manage_cash юристу', async () => {
      const kyivAdmin = await signIn(world.users.kyivAdmin.email);
      const { error } = await kyivAdmin
        .from('users')
        .update({ perm_overrides: { can_manage_cash: true } })
        .eq('id', world.users.lawyer1.id);
      expect(error).not.toBeNull(); // guard_perm_overrides_change → can_grant_cap=false
    });

    it('owner выдаёт can_manage_cash', async () => {
      const owner = await signIn(world.users.owner.email);
      const { error } = await owner
        .from('users')
        .update({ perm_overrides: { can_manage_cash: true } })
        .eq('id', world.users.expert2.id);
      expect(error).toBeNull();
    });
  });
});
