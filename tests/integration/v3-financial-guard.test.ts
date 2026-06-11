import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты v3 Сессии 1 (БД-безопасность). Проверяем:
//   • гард финансовых полей дела (cases_guard_financial_fields): не-staff не меняет
//     category/contract_sum/lawyer_id/responsible_id/client_id, прочие поля — может;
//   • неизменяемость act-связанного платежа (payments_guard_act_payment);
//   • пересчёт completion актов при смене contract_sum (cases_recompute_acts_on_sum);
//   • скоуп confirm_act_paid по подразделению (admin чужого филиала не подтвердит).
//
// caseA = lawyer1(Київ) + expert1(Дніпро), representation 30000, оплачено 10000.

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:v3-financial-guard] Пропущено: нет Supabase env в .env.local.');
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
    const expert1 = await signIn(world.users.expert1.email);
    const { data: act, error: actErr } = await expert1
      .from('case_acts')
      .insert({
        case_id: world.caseA,
        amount,
        issued_at: '2026-05-20',
        created_by: world.users.expert1.id,
      })
      .select('id')
      .single();
    if (actErr || !act) throw new Error(`seed act: ${actErr?.message}`);

    const owner = await signIn(world.users.owner.email);
    const { data: paymentId, error: rpcErr } = await owner.rpc('confirm_act_paid', {
      p_act_id: act.id,
      p_confirmed_amount: amount,
      p_paid_at: '2026-05-20',
      p_storage_key: `${world.prefix}${suffix}.pdf`,
      p_file_name: `${suffix}.pdf`,
      p_method: 'act',
      p_note: null,
    });
    if (rpcErr) throw new Error(`confirm act: ${rpcErr.message}`);
    return { actId: act.id as string, paymentId: paymentId as string };
  }

  // Удалить платёж (вернёт акт в issued триггером) и сам акт (service_role — мимо RLS).
  async function cleanupAct(actId: string, paymentId: string) {
    await world.admin.from('payments').delete().eq('id', paymentId);
    await world.admin.from('case_acts').delete().eq('id', actId);
  }

  describe('гард финансовых полей дела', () => {
    it('юрист дела меняет subject своего дела → ок', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1
        .from('cases')
        .update({ subject: `${world.prefix}subj` })
        .eq('id', world.caseA);
      expect(error).toBeNull();
    });

    it('юрист дела меняет category → 42501 (гард)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1
        .from('cases')
        .update({ category: 'claim' })
        .eq('id', world.caseA);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      // Значение не изменилось.
      const { data } = await world.admin
        .from('cases')
        .select('category')
        .eq('id', world.caseA)
        .single();
      expect(data?.category).toBe('representation');
    });

    it('owner меняет category → ок', async () => {
      const owner = await signIn(world.users.owner.email);
      const { error } = await owner
        .from('cases')
        .update({ category: 'claim' })
        .eq('id', world.caseA);
      expect(error).toBeNull();
      // Возвращаем representation — другие кейсы на него рассчитывают.
      await owner.from('cases').update({ category: 'representation' }).eq('id', world.caseA);
    });
  });

  describe('act-платёж неизменяем', () => {
    it('UPDATE amount платежа с act_id (owner) → 42501', async () => {
      const { actId, paymentId } = await makePaidAct(2000, 's1pay');
      const owner = await signIn(world.users.owner.email);
      const { error } = await owner
        .from('payments')
        .update({ amount: 9999 })
        .eq('id', paymentId);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      await cleanupAct(actId, paymentId);
    });
  });

  describe('contract_sum пересчитывает completion актов', () => {
    it('owner меняет contract_sum дела с paid-актом → completion пересчитан', async () => {
      // Акт 2000 при contract 30000 → partial.
      const { actId, paymentId } = await makePaidAct(2000, 's1sum');
      const { data: before } = await world.admin
        .from('case_acts')
        .select('completion')
        .eq('id', actId)
        .single();
      expect(before?.completion).toBe('partial');

      // Снижаем сумму договора до 1000 → 2000 ≥ 1000 → full.
      const owner = await signIn(world.users.owner.email);
      const { error } = await owner
        .from('cases')
        .update({ contract_sum: 1000 })
        .eq('id', world.caseA);
      expect(error).toBeNull();

      const { data: after } = await world.admin
        .from('case_acts')
        .select('completion')
        .eq('id', actId)
        .single();
      expect(after?.completion).toBe('full');

      // Восстанавливаем и чистим.
      await owner.from('cases').update({ contract_sum: 30000 }).eq('id', world.caseA);
      await cleanupAct(actId, paymentId);
    });
  });

  describe('confirm_act_paid скоуп по подразделению', () => {
    it('admin чужого подразделения НЕ подтверждает акт чужого дела', async () => {
      // caseA принадлежит Київ/Дніпро; lvivAdmin (Львів) дело не видит.
      const expert1 = await signIn(world.users.expert1.email);
      const { data: act, error: actErr } = await expert1
        .from('case_acts')
        .insert({
          case_id: world.caseA,
          amount: 1500,
          issued_at: '2026-05-22',
          created_by: world.users.expert1.id,
        })
        .select('id')
        .single();
      expect(actErr).toBeNull();

      const lviv = await signIn(world.users.lvivAdmin.email);
      const { error } = await lviv.rpc('confirm_act_paid', {
        p_act_id: act!.id,
        p_confirmed_amount: 1500,
        p_paid_at: '2026-05-22',
        p_storage_key: `${world.prefix}s1lviv.pdf`,
        p_file_name: 's1lviv.pdf',
        p_method: 'act',
        p_note: null,
      });
      expect(error).not.toBeNull();

      // Акт остался issued — чистим напрямую.
      await world.admin.from('case_acts').delete().eq('id', act!.id);
    });
  });
});
