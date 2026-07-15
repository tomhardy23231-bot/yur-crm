import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';

// Цикл v4, ревью V3-5 / задача T10 — optimistic locking дела на updated_at.
//
// Гоча: cases.updated_at сравнивается на РАВЕНСТВО с микросекундной точностью.
// Prisma отдаёт timestamptz как JS Date (миллисекунды) → микросекунды усекаются,
// и сравнение `updated_at = base(из Date)` НИКОГДА не совпало бы → ложный
// «дело изменено другим пользователем» на каждой правке. Решение (getCase +
// updateCaseAction): возить и сравнивать updated_at::text (полная точность,
// нативный текст Postgres). Тест проверяет ИМЕННО текстовый путь.
//
// getCase читает `select updated_at::text`; updateCaseAction под FOR UPDATE
// сравнивает locked.updated_at::text === base. Здесь воспроизводим этот путь
// напрямую через userDb (тот же боевой RLS-контекст).

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:v4-optimistic-lock] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('v4 cases optimistic lock (updated_at::text, T10/V3-5)', () => {
  let w: World;
  beforeAll(async () => {
    w = await createWorld();
  });
  afterAll(async () => {
    await destroyWorld(w);
  });

  // Читает updated_at::text дела (как getCase).
  async function readVersion(uid: string, caseId: string): Promise<string> {
    return userDb(uid, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ t: string }>>`
        select updated_at::text as t from public.cases where id = ${caseId}::uuid`;
      return rows[0]!.t;
    });
  }

  it('та же версия → нет ложного конфликта (round-trip ::text совпадает)', async () => {
    const uid = w.users.owner.id;
    const base = await readVersion(uid, w.caseA);

    // Путь updateCaseAction: FOR UPDATE + сравнение ::text без промежуточной правки.
    const matches = await userDb(uid, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ t: string }>>`
        select updated_at::text as t from public.cases where id = ${w.caseA}::uuid for update`;
      return locked[0]!.t === base;
    });
    expect(matches).toBe(true);
  });

  it('после чужой правки старая версия НЕ совпадает (конфликт детектится)', async () => {
    const uid = w.users.owner.id;
    const base = await readVersion(uid, w.caseA);

    // touch-триггер cases_touch_updated_at бьёт updated_at на любом UPDATE.
    await userDb(uid, (tx) =>
      tx.cases.updateMany({
        where: { id: w.caseA },
        data: { subject: 'v4 lock probe' },
      }),
    );

    const after = await readVersion(uid, w.caseA);
    expect(after).not.toBe(base);

    // Повторная правка со старой base → сравнение ::text не совпало бы → отказ.
    const stillMatchesOldBase = await userDb(uid, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ t: string }>>`
        select updated_at::text as t from public.cases where id = ${w.caseA}::uuid for update`;
      return locked[0]!.t === base;
    });
    expect(stillMatchesOldBase).toBe(false);
  });
});
