import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты v3 Сессии 7 (Продукт). Проверяем:
//   • public.close_case_lost: юрист дела закрывает дело как «не заключили» с этапа
//     new_request (stage→closed, outcome=lost, запись case_lost в activity_log);
//   • close_case_lost с этапа in_progress → исключение (lost только до контракта);
//   • public.conflict_check: находит клиента по ИНН и оппонента по имени.
//
// caseS = lawyer1(Київ) + expert1(Дніпро), document, new_request — кандидат на lost.
// caseA = ... in_progress — lost запрещён.

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:v3-outcome-conflict] Пропущено: нет Supabase env в .env.local.');
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
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.rpc('close_case_lost', {
        p_case_id: world.caseS,
        p_reason: 'IT lost reason',
      });
      expect(error).toBeNull();

      // Дело: closed + outcome=lost + причина + closed_at проставлен.
      const { data: row } = await world.admin
        .from('cases')
        .select('stage, outcome, lost_reason, closed_at')
        .eq('id', world.caseS)
        .single();
      expect(row?.stage).toBe('closed');
      expect(row?.outcome).toBe('lost');
      expect(row?.lost_reason).toBe('IT lost reason');
      expect(row?.closed_at).not.toBeNull();

      // Журнал: запись case_lost по делу.
      const { data: log } = await world.admin
        .from('activity_log')
        .select('id, action')
        .eq('entity_type', 'case')
        .eq('entity_id', world.caseS)
        .eq('action', 'case_lost');
      expect((log ?? []).length).toBeGreaterThanOrEqual(1);
    });

    it('lost с этапа in_progress → исключение', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.rpc('close_case_lost', {
        p_case_id: world.caseA, // in_progress
        p_reason: '',
      });
      expect(error).not.toBeNull();
    });

    it('не-юрист и не-staff (эксперт дела) НЕ закрывает как lost', async () => {
      // caseB = lawyer2 + expert2, consultation. expert2 — эксперт, не юрист → 42501.
      const expert2 = await signIn(world.users.expert2.email);
      const { error } = await expert2.rpc('close_case_lost', {
        p_case_id: world.caseB,
        p_reason: '',
      });
      expect(error).not.toBeNull();
    });
  });

  describe('conflict_check', () => {
    it('находит клиента по ИНН и оппонента по имени', async () => {
      const inn = '1234509876';
      const opponentName = `Opponent-${world.runId}`;
      // Проставляем ИНН нашему клиенту и оппонента — нашему делу (service_role).
      await world.admin.from('clients').update({ inn }).eq('id', world.clientId);
      await world.admin
        .from('cases')
        .update({ opponent: opponentName })
        .eq('id', world.caseB);

      const owner = await signIn(world.users.owner.email);

      // По ИНН → совпадение-клиент (наш клиент в label).
      const { data: byInn, error: innErr } = await owner.rpc('conflict_check', {
        p_name: null,
        p_inn: inn,
        p_phone: null,
      });
      expect(innErr).toBeNull();
      expect(
        (byInn ?? []).some(
          (r: { kind: string; label: string }) =>
            r.kind === 'client' && r.label.includes(world.runId),
        ),
      ).toBe(true);

      // По имени оппонента → ветка opponent (дело в label).
      const { data: byName, error: nameErr } = await owner.rpc('conflict_check', {
        p_name: opponentName,
        p_inn: null,
        p_phone: null,
      });
      expect(nameErr).toBeNull();
      expect(
        (byName ?? []).some(
          (r: { kind: string; label: string }) => r.kind === 'opponent',
        ),
      ).toBe(true);

      // Прибираем за собой (destroyWorld и так удалит дело/клиента).
      await world.admin.from('clients').update({ inn: null }).eq('id', world.clientId);
      await world.admin.from('cases').update({ opponent: null }).eq('id', world.caseB);
    });
  });
});
