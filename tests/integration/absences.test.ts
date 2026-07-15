import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';

// Интеграционные тесты RLS отсутствий (v2 Этап 6). Матрица видимости/записи по
// подразделению: owner всё; admin/office_manager — своё подразделение (+scope='all'
// / NULL); сам сотрудник — себя; office_manager только читает (НЕ пишет).
// Подразделения участников: lawyer1→Київ, expert1→Дніпро, lawyer2→Дніпро,
// expert2→Львів; staffAdmin — NULL (видит всё), allAdmin — Київ scope='all'.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:absences] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — отсутствия (RLS Этап 6)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
    // Засеваем два известных отсутствия (через admin-пул, в обход RLS):
    //   seed-kyiv — у lawyer1 (Київ), seed-lviv — у expert2 (Львів).
    await world.admin.absences.createMany({
      data: [
        {
          user_id: world.users.lawyer1.id,
          kind: 'vacation',
          starts_on: new Date('2026-06-01'),
          ends_on: new Date('2026-06-10'),
          note: `${world.prefix}seed-kyiv`,
          created_by: world.users.owner.id,
        },
        {
          user_id: world.users.expert2.id,
          kind: 'sick',
          starts_on: new Date('2026-06-05'),
          ends_on: new Date('2026-06-07'),
          note: `${world.prefix}seed-lviv`,
          created_by: world.users.owner.id,
        },
      ],
    });
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // Видимые этому пользователю засеянные отсутствия (по note-префиксу).
  const seenSeed = async (userId: string): Promise<string[]> => {
    const rows = await userDb(userId, (tx) =>
      tx.absences.findMany({
        where: { note: { startsWith: `${world.prefix}seed-` } },
        select: { note: true },
      }),
    );
    return rows.map((r) => r.note as string).sort();
  };

  // Существует ли строка с данным note (проверка через admin-пул — мимо RLS).
  const existsByNote = async (note: string): Promise<boolean> => {
    const count = await world.admin.absences.count({ where: { note } });
    return count > 0;
  };

  // ── Видимость (SELECT) ────────────────────────────────────────────
  describe('видимость', () => {
    it('сотрудник видит только свои отсутствия', async () => {
      expect(await seenSeed(world.users.lawyer1.id)).toEqual([`${world.prefix}seed-kyiv`]);
      expect(await seenSeed(world.users.expert2.id)).toEqual([`${world.prefix}seed-lviv`]);
    });

    it('сотрудник без своих отсутствий не видит чужие', async () => {
      expect(await seenSeed(world.users.lawyer2.id)).toEqual([]); // Дніпро, без seed
    });

    it('admin видит отсутствия только своего подразделения', async () => {
      expect(await seenSeed(world.users.kyivAdmin.id)).toEqual([`${world.prefix}seed-kyiv`]);
      expect(await seenSeed(world.users.lvivAdmin.id)).toEqual([`${world.prefix}seed-lviv`]);
      expect(await seenSeed(world.users.dniproAdmin.id)).toEqual([]); // никого из Дніпро не засевали
    });

    it('office_manager видит отсутствия своего подразделения (читает)', async () => {
      expect(await seenSeed(world.users.officeKyiv.id)).toEqual([`${world.prefix}seed-kyiv`]);
    });

    it('admin scope=all видит отсутствия всех подразделений', async () => {
      expect(await seenSeed(world.users.allAdmin.id)).toEqual([
        `${world.prefix}seed-kyiv`,
        `${world.prefix}seed-lviv`,
      ]);
    });

    it('admin без подразделения (переходное NULL) и owner видят всё', async () => {
      expect(await seenSeed(world.users.staffAdmin.id)).toEqual([
        `${world.prefix}seed-kyiv`,
        `${world.prefix}seed-lviv`,
      ]);
      expect(await seenSeed(world.users.owner.id)).toEqual([
        `${world.prefix}seed-kyiv`,
        `${world.prefix}seed-lviv`,
      ]);
    });
  });

  // ── Запись (INSERT) ───────────────────────────────────────────────
  describe('создание', () => {
    it('сотрудник вносит отсутствие себе', async () => {
      await userDb(world.users.lawyer1.id, (tx) =>
        tx.absences.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'vacation',
            starts_on: new Date('2026-07-01'),
            ends_on: new Date('2026-07-05'),
            note: `${world.prefix}ins-self`,
            created_by: world.users.lawyer1.id,
          },
        }),
      );
    });

    it('сотрудник НЕ может внести отсутствие другому', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.absences.create({
            data: {
              user_id: world.users.lawyer2.id,
              kind: 'vacation',
              starts_on: new Date('2026-07-01'),
              ends_on: new Date('2026-07-05'),
              note: `${world.prefix}ins-other`,
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow(); // RLS deny
    });

    it('нельзя приписать запись чужому created_by (спуф)', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.absences.create({
            data: {
              user_id: world.users.lawyer1.id,
              kind: 'vacation',
              starts_on: new Date('2026-07-01'),
              ends_on: new Date('2026-07-05'),
              note: `${world.prefix}ins-spoof`,
              created_by: world.users.lawyer2.id, // не active_uid → with_check fail
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('admin вносит отсутствие сотруднику своего подразделения', async () => {
      await userDb(world.users.kyivAdmin.id, (tx) =>
        tx.absences.create({
          data: {
            user_id: world.users.lawyer1.id, // Київ
            kind: 'sick',
            starts_on: new Date('2026-08-01'),
            ends_on: new Date('2026-08-03'),
            note: `${world.prefix}ins-kyivadmin`,
            created_by: world.users.kyivAdmin.id,
          },
        }),
      );
    });

    it('admin чужого подразделения НЕ может внести отсутствие', async () => {
      await expect(
        userDb(world.users.lvivAdmin.id, (tx) =>
          tx.absences.create({
            data: {
              user_id: world.users.lawyer1.id, // Київ, не Львів
              kind: 'sick',
              starts_on: new Date('2026-08-01'),
              ends_on: new Date('2026-08-03'),
              note: `${world.prefix}ins-lvivadmin`,
              created_by: world.users.lvivAdmin.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('office_manager НЕ может вносить отсутствия подразделения (только читает)', async () => {
      await expect(
        userDb(world.users.officeKyiv.id, (tx) =>
          tx.absences.create({
            data: {
              user_id: world.users.lawyer1.id, // Київ — читает, но не пишет
              kind: 'vacation',
              starts_on: new Date('2026-09-01'),
              ends_on: new Date('2026-09-02'),
              note: `${world.prefix}ins-office`,
              created_by: world.users.officeKyiv.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('office_manager МОЖЕТ внести отсутствие себе', async () => {
      await userDb(world.users.officeKyiv.id, (tx) =>
        tx.absences.create({
          data: {
            user_id: world.users.officeKyiv.id,
            kind: 'vacation',
            starts_on: new Date('2026-09-01'),
            ends_on: new Date('2026-09-02'),
            note: `${world.prefix}ins-office-self`,
            created_by: world.users.officeKyiv.id,
          },
        }),
      );
    });

    it('owner вносит отсутствие кому угодно', async () => {
      await userDb(world.users.owner.id, (tx) =>
        tx.absences.create({
          data: {
            user_id: world.users.expert2.id, // Львів
            kind: 'other',
            starts_on: new Date('2026-10-01'),
            ends_on: new Date('2026-10-01'),
            note: `${world.prefix}ins-owner`,
            created_by: world.users.owner.id,
          },
        }),
      );
    });
  });

  // ── Удаление (DELETE) ─────────────────────────────────────────────
  describe('удаление', () => {
    // Свежая засеянная запись lawyer1 (Київ) для проверки удаления.
    // v3 s2: триггер absences_no_overlap запрещает пересечение периодов одного
    // сотрудника, а no-op-delete тесты ниже оставляют свою строку в БД — поэтому
    // каждому seedDel даём РАЗНЫЙ непересекающийся день (иначе вставка падала бы).
    let delSeq = 0;
    const seedDel = async (note: string): Promise<void> => {
      delSeq += 1;
      const day = String(delSeq).padStart(2, '0');
      await world.admin.absences.create({
        data: {
          user_id: world.users.lawyer1.id,
          kind: 'vacation',
          starts_on: new Date(`2026-11-${day}`),
          ends_on: new Date(`2026-11-${day}`),
          note,
          created_by: world.users.owner.id,
        },
      });
    };

    it('office_manager НЕ удаляет отсутствие подразделения (no-op)', async () => {
      const note = `${world.prefix}del-office`;
      await seedDel(note);
      await userDb(world.users.officeKyiv.id, (tx) =>
        tx.absences.deleteMany({ where: { note } }),
      );
      expect(await existsByNote(note)).toBe(true); // RLS отфильтровал — строка цела
    });

    it('admin чужого подразделения НЕ удаляет (no-op)', async () => {
      const note = `${world.prefix}del-lviv`;
      await seedDel(note);
      await userDb(world.users.lvivAdmin.id, (tx) =>
        tx.absences.deleteMany({ where: { note } }),
      );
      expect(await existsByNote(note)).toBe(true);
    });

    it('admin своего подразделения удаляет отсутствие', async () => {
      const note = `${world.prefix}del-kyiv`;
      await seedDel(note);
      await userDb(world.users.kyivAdmin.id, (tx) =>
        tx.absences.deleteMany({ where: { note } }),
      );
      expect(await existsByNote(note)).toBe(false);
    });

    it('сотрудник удаляет своё отсутствие', async () => {
      const note = `${world.prefix}del-self`;
      await userDb(world.users.lawyer1.id, async (tx) => {
        await tx.absences.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'vacation',
            starts_on: new Date('2026-12-01'),
            ends_on: new Date('2026-12-02'),
            note,
            created_by: world.users.lawyer1.id,
          },
        });
        await tx.absences.deleteMany({ where: { note } });
      });
      expect(await existsByNote(note)).toBe(false);
    });
  });

  // ── Доменные ограничения (CHECK) ──────────────────────────────────
  describe('ограничения', () => {
    it('диапазон ends_on < starts_on отвергается', async () => {
      await expect(
        world.admin.absences.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'vacation',
            starts_on: new Date('2026-06-10'),
            ends_on: new Date('2026-06-01'),
            note: `${world.prefix}bad-range`,
            created_by: world.users.owner.id,
          },
        }),
      ).rejects.toThrow();
    });

    it('недопустимый kind отвергается', async () => {
      await expect(
        world.admin.absences.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'holiday',
            starts_on: new Date('2026-06-01'),
            ends_on: new Date('2026-06-02'),
            note: `${world.prefix}bad-kind`,
            created_by: world.users.owner.id,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
