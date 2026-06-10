import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasSupabaseEnv,
  createWorld,
  destroyWorld,
  signIn,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты RLS отсутствий (v2 Этап 6). Матрица видимости/записи по
// подразделению: owner всё; admin/office_manager — своё подразделение (+scope='all'
// / NULL); сам сотрудник — себя; office_manager только читает (НЕ пишет).
// Подразделения участников: lawyer1→Київ, expert1→Дніпро, lawyer2→Дніпро,
// expert2→Львів; staffAdmin — NULL (видит всё), allAdmin — Київ scope='all'.

const suite = hasSupabaseEnv ? describe : describe.skip;

if (!hasSupabaseEnv) {
  console.warn('[integration:absences] Пропущено: нет Supabase env в .env.local.');
}

suite('Юр CRM — отсутствия (RLS Этап 6)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    // Засеваем два известных отсутствия (через service_role, в обход RLS):
    //   seed-kyiv — у lawyer1 (Київ), seed-lviv — у expert2 (Львів).
    const { error } = await world.admin.from('absences').insert([
      {
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-06-01',
        ends_on: '2026-06-10',
        note: `${world.prefix}seed-kyiv`,
        created_by: world.users.owner.id,
      },
      {
        user_id: world.users.expert2.id,
        kind: 'sick',
        starts_on: '2026-06-05',
        ends_on: '2026-06-07',
        note: `${world.prefix}seed-lviv`,
        created_by: world.users.owner.id,
      },
    ]);
    if (error) throw new Error(`seed absences: ${error.message}`);
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // Видимые этому клиенту засеянные отсутствия (по note-префиксу).
  const seenSeed = async (client: SupabaseClient): Promise<string[]> => {
    const { data, error } = await client
      .from('absences')
      .select('note')
      .like('note', `${world.prefix}seed-%`);
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.note as string).sort();
  };

  // Существует ли строка с данным note (проверка через service_role — мимо RLS).
  const existsByNote = async (note: string): Promise<boolean> => {
    const { data } = await world.admin.from('absences').select('id').eq('note', note);
    return (data ?? []).length > 0;
  };

  // ── Видимость (SELECT) ────────────────────────────────────────────
  describe('видимость', () => {
    it('сотрудник видит только свои отсутствия', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      expect(await seenSeed(lawyer1)).toEqual([`${world.prefix}seed-kyiv`]);

      const expert2 = await signIn(world.users.expert2.email);
      expect(await seenSeed(expert2)).toEqual([`${world.prefix}seed-lviv`]);
    });

    it('сотрудник без своих отсутствий не видит чужие', async () => {
      const lawyer2 = await signIn(world.users.lawyer2.email); // Дніпро, без seed
      expect(await seenSeed(lawyer2)).toEqual([]);
    });

    it('admin видит отсутствия только своего подразделения', async () => {
      const kyivAdmin = await signIn(world.users.kyivAdmin.email);
      expect(await seenSeed(kyivAdmin)).toEqual([`${world.prefix}seed-kyiv`]);

      const lvivAdmin = await signIn(world.users.lvivAdmin.email);
      expect(await seenSeed(lvivAdmin)).toEqual([`${world.prefix}seed-lviv`]);

      const dniproAdmin = await signIn(world.users.dniproAdmin.email);
      expect(await seenSeed(dniproAdmin)).toEqual([]); // никого из Дніпро не засевали
    });

    it('office_manager видит отсутствия своего подразделения (читает)', async () => {
      const officeKyiv = await signIn(world.users.officeKyiv.email);
      expect(await seenSeed(officeKyiv)).toEqual([`${world.prefix}seed-kyiv`]);
    });

    it('admin scope=all видит отсутствия всех подразделений', async () => {
      const allAdmin = await signIn(world.users.allAdmin.email);
      expect(await seenSeed(allAdmin)).toEqual([
        `${world.prefix}seed-kyiv`,
        `${world.prefix}seed-lviv`,
      ]);
    });

    it('admin без подразделения (переходное NULL) и owner видят всё', async () => {
      const staffAdmin = await signIn(world.users.staffAdmin.email);
      expect(await seenSeed(staffAdmin)).toEqual([
        `${world.prefix}seed-kyiv`,
        `${world.prefix}seed-lviv`,
      ]);

      const owner = await signIn(world.users.owner.email);
      expect(await seenSeed(owner)).toEqual([
        `${world.prefix}seed-kyiv`,
        `${world.prefix}seed-lviv`,
      ]);
    });
  });

  // ── Запись (INSERT) ───────────────────────────────────────────────
  describe('создание', () => {
    it('сотрудник вносит отсутствие себе', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-07-01',
        ends_on: '2026-07-05',
        note: `${world.prefix}ins-self`,
        created_by: world.users.lawyer1.id,
      });
      expect(error).toBeNull();
    });

    it('сотрудник НЕ может внести отсутствие другому', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('absences').insert({
        user_id: world.users.lawyer2.id,
        kind: 'vacation',
        starts_on: '2026-07-01',
        ends_on: '2026-07-05',
        note: `${world.prefix}ins-other`,
        created_by: world.users.lawyer1.id,
      });
      expect(error).not.toBeNull(); // RLS deny
    });

    it('нельзя приписать запись чужому created_by (спуф)', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const { error } = await lawyer1.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-07-01',
        ends_on: '2026-07-05',
        note: `${world.prefix}ins-spoof`,
        created_by: world.users.lawyer2.id, // не active_uid → with_check fail
      });
      expect(error).not.toBeNull();
    });

    it('admin вносит отсутствие сотруднику своего подразделения', async () => {
      const kyivAdmin = await signIn(world.users.kyivAdmin.email);
      const { error } = await kyivAdmin.from('absences').insert({
        user_id: world.users.lawyer1.id, // Київ
        kind: 'sick',
        starts_on: '2026-08-01',
        ends_on: '2026-08-03',
        note: `${world.prefix}ins-kyivadmin`,
        created_by: world.users.kyivAdmin.id,
      });
      expect(error).toBeNull();
    });

    it('admin чужого подразделения НЕ может внести отсутствие', async () => {
      const lvivAdmin = await signIn(world.users.lvivAdmin.email);
      const { error } = await lvivAdmin.from('absences').insert({
        user_id: world.users.lawyer1.id, // Київ, не Львів
        kind: 'sick',
        starts_on: '2026-08-01',
        ends_on: '2026-08-03',
        note: `${world.prefix}ins-lvivadmin`,
        created_by: world.users.lvivAdmin.id,
      });
      expect(error).not.toBeNull();
    });

    it('office_manager НЕ может вносить отсутствия подразделения (только читает)', async () => {
      const officeKyiv = await signIn(world.users.officeKyiv.email);
      const { error } = await officeKyiv.from('absences').insert({
        user_id: world.users.lawyer1.id, // Київ — читает, но не пишет
        kind: 'vacation',
        starts_on: '2026-09-01',
        ends_on: '2026-09-02',
        note: `${world.prefix}ins-office`,
        created_by: world.users.officeKyiv.id,
      });
      expect(error).not.toBeNull();
    });

    it('office_manager МОЖЕТ внести отсутствие себе', async () => {
      const officeKyiv = await signIn(world.users.officeKyiv.email);
      const { error } = await officeKyiv.from('absences').insert({
        user_id: world.users.officeKyiv.id,
        kind: 'vacation',
        starts_on: '2026-09-01',
        ends_on: '2026-09-02',
        note: `${world.prefix}ins-office-self`,
        created_by: world.users.officeKyiv.id,
      });
      expect(error).toBeNull();
    });

    it('owner вносит отсутствие кому угодно', async () => {
      const owner = await signIn(world.users.owner.email);
      const { error } = await owner.from('absences').insert({
        user_id: world.users.expert2.id, // Львів
        kind: 'other',
        starts_on: '2026-10-01',
        ends_on: '2026-10-01',
        note: `${world.prefix}ins-owner`,
        created_by: world.users.owner.id,
      });
      expect(error).toBeNull();
    });
  });

  // ── Удаление (DELETE) ─────────────────────────────────────────────
  describe('удаление', () => {
    // Свежая засеянная запись lawyer1 (Київ) для проверки удаления.
    const seedDel = async (note: string): Promise<void> => {
      const { error } = await world.admin.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-11-01',
        ends_on: '2026-11-05',
        note,
        created_by: world.users.owner.id,
      });
      if (error) throw new Error(`seedDel: ${error.message}`);
    };

    it('office_manager НЕ удаляет отсутствие подразделения (no-op)', async () => {
      const note = `${world.prefix}del-office`;
      await seedDel(note);
      const officeKyiv = await signIn(world.users.officeKyiv.email);
      await officeKyiv.from('absences').delete().eq('note', note);
      expect(await existsByNote(note)).toBe(true); // RLS отфильтровал — строка цела
    });

    it('admin чужого подразделения НЕ удаляет (no-op)', async () => {
      const note = `${world.prefix}del-lviv`;
      await seedDel(note);
      const lvivAdmin = await signIn(world.users.lvivAdmin.email);
      await lvivAdmin.from('absences').delete().eq('note', note);
      expect(await existsByNote(note)).toBe(true);
    });

    it('admin своего подразделения удаляет отсутствие', async () => {
      const note = `${world.prefix}del-kyiv`;
      await seedDel(note);
      const kyivAdmin = await signIn(world.users.kyivAdmin.email);
      await kyivAdmin.from('absences').delete().eq('note', note);
      expect(await existsByNote(note)).toBe(false);
    });

    it('сотрудник удаляет своё отсутствие', async () => {
      const lawyer1 = await signIn(world.users.lawyer1.email);
      const note = `${world.prefix}del-self`;
      const { error: insErr } = await lawyer1.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-12-01',
        ends_on: '2026-12-02',
        note,
        created_by: world.users.lawyer1.id,
      });
      expect(insErr).toBeNull();
      await lawyer1.from('absences').delete().eq('note', note);
      expect(await existsByNote(note)).toBe(false);
    });
  });

  // ── Доменные ограничения (CHECK) ──────────────────────────────────
  describe('ограничения', () => {
    it('диапазон ends_on < starts_on отвергается', async () => {
      const { error } = await world.admin.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'vacation',
        starts_on: '2026-06-10',
        ends_on: '2026-06-01',
        note: `${world.prefix}bad-range`,
        created_by: world.users.owner.id,
      });
      expect(error).not.toBeNull();
    });

    it('недопустимый kind отвергается', async () => {
      const { error } = await world.admin.from('absences').insert({
        user_id: world.users.lawyer1.id,
        kind: 'holiday',
        starts_on: '2026-06-01',
        ends_on: '2026-06-02',
        note: `${world.prefix}bad-kind`,
        created_by: world.users.owner.id,
      });
      expect(error).not.toBeNull();
    });
  });
});
