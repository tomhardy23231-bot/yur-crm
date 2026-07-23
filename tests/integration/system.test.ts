import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
  type Db,
} from '../helpers/fixtures';
import {
  rpcSearchCaseIds,
  rpcCasePayroll,
  rpcPayrollBySpecialist,
  rpcPayrollEmployeeSummary,
  rpcPayrollEmployeeCases,
  rpcManageUserSalaries,
  rpcConfirmActPaid,
} from '@/lib/db/rpc';

// Интеграционные тесты RLS / триггеров / воронки / зарплаты / актов поверх Neon
// (цикл v4): проверяют то, что нельзя проверить юнитами — доступ по ролям (RLS
// через шим auth.uid() ← app.user_id, выставляемый userDb), денежные триггеры
// (paid_total/debt), строгую воронку этапов, % от оплат (payroll_rates +
// salary_mode) и цикл Рахунок-Акта. Без DATABASE_URL_APP/DATABASE_URL_ADMIN в
// .env.local набор помечается skipped.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:system] Пропущено: нет DATABASE_URL_* в .env.local.');
}

type DbLike = Db | PrismaClient;

// salary_mode/salary_fixed_amount — колонки users приватны (@ignore в Prisma-схеме
// из-за column-level revoke от authenticated/anon, CLAUDE.md §5) — типизированный
// клиент их вообще не знает. Читаем/пишем ТОЛЬКО raw SQL. Через admin-пул (auth.uid()
// IS NULL) гард users_guard_salary_fields пропускает системным путём (как раньше
// service_role); через userDb(actorId, ...) идёт та же RLS-сессия, что и в реальном
// экшене — нужно, чтобы проверить сам гард.
async function setSalaryRaw(
  db: DbLike,
  userId: string,
  mode: string,
  amount: number | null,
): Promise<void> {
  await db.$executeRaw`
    update public.users
       set salary_mode = ${mode}::text,
           salary_fixed_amount = ${amount}::numeric
     where id = ${userId}::uuid`;
}

async function getSalaryRaw(
  db: DbLike,
  userId: string,
): Promise<{ salary_mode: string; salary_fixed_amount: number | null }> {
  const rows = await db.$queryRaw<
    { salary_mode: string; salary_fixed_amount: string | number | null }[]
  >`select salary_mode, salary_fixed_amount from public.users where id = ${userId}::uuid`;
  const row = rows[0]!;
  return {
    salary_mode: row.salary_mode,
    salary_fixed_amount:
      row.salary_fixed_amount == null ? null : Number(row.salary_fixed_amount),
  };
}

// Обёртки payroll_employee_summary/_cases требуют p_month, но семантика «за всё
// время» — это SQL NULL. Тип обёртки — string (не nullable), поэтому точечно
// приводим (как fixtures.ts делает `as never` для enum-параметров mkCase).
const noMonth = null as unknown as string;

suite('Юр CRM — интеграция (RLS · триггеры · воронка · зарплата)', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // ── Названия наших дел среди прочих в БД (фильтр по runId-префиксу) ──
  async function titlesOf(tx: Db, prefix: string): Promise<string[]> {
    const rows = await tx.cases.findMany({
      where: { number_title: { startsWith: prefix } },
      select: { number_title: true },
    });
    return rows.map((r) => r.number_title).sort();
  }

  // ============================================================
  describe('RLS — видимость дел', () => {
    it('юрист видит только свои дела (по lawyer_id)', async () => {
      const seen = await userDb(world.users.lawyer1.id, (tx) => titlesOf(tx, world.prefix));
      // lawyer1 — на A и S, не на B.
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}S`]);
      expect(seen).not.toContain(`${world.prefix}B`);
    });

    it('второй юрист изолирован (видит только B)', async () => {
      const seen = await userDb(world.users.lawyer2.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}B`]);
    });

    it('эксперт видит только свои дела (по responsible_id)', async () => {
      const seen = await userDb(world.users.expert1.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}S`]);
    });

    it('второй эксперт изолирован (видит только B)', async () => {
      const seen = await userDb(world.users.expert2.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}B`]);
    });

    it('staff (admin) видит все наши дела', async () => {
      const seen = await userDb(world.users.staffAdmin.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}B`, `${world.prefix}S`]);
    });

    it('юрист не может изменить чужое дело (RLS режет апдейт)', async () => {
      // Пытаемся сделать чужое дело B срочным — RLS не даст (0 строк, без ошибки).
      const result = await userDb(world.users.lawyer1.id, (tx) =>
        tx.cases.updateMany({ where: { id: world.caseB }, data: { priority: 'urgent' } }),
      );
      expect(result.count).toBe(0);
      const after = await world.admin.cases.findFirst({
        where: { id: world.caseB },
        select: { priority: true },
      });
      expect(after?.priority).toBe('normal');
    });
  });

  // ============================================================
  describe('RLS — видимость платежей', () => {
    it('эксперт своего дела видит платёж, чужой — нет', async () => {
      const e1 = await userDb(world.users.expert1.id, (tx) =>
        tx.payments.findMany({ where: { case_id: world.caseA }, select: { amount: true } }),
      );
      const e2 = await userDb(world.users.expert2.id, (tx) =>
        tx.payments.findMany({ where: { case_id: world.caseA }, select: { amount: true } }),
      );
      expect(e1.length).toBe(1);
      expect(Number(e1[0]?.amount)).toBe(10000);
      expect(e2.length).toBe(0); // expert2 не на деле A → платежа не видит
    });
  });

  // ============================================================
  // v2 Этап 2 — видимость по подразделениям (departments).
  //   Привязка: lawyer1→Київ, expert1→Дніпро, lawyer2→Дніпро, expert2→Львів.
  //   Дела:  A = Київ(юрист) + Дніпро(експерт);  S = Київ + Дніпро;
  //          B = Дніпро(юрист) + Львів(експерт).
  //   Ожидаемые наборы для скоупленных admin'ов:
  //     Київ   → {A, S}        (B не трогает Київ)
  //     Дніпро → {A, B, S}     (Дніпро есть на всех делах)
  //     Львів  → {B}           (только B касается Львова)
  //     all/NULL-dept → {A, B, S}
  // ============================================================
  describe('RLS — видимость по подразделениям', () => {
    // Ad hoc пользователь для тестов эскалации — ТОЧНО такой же паттерн, что и
    // mkUser в fixtures.ts (randomUUID + $transaction[auth_users, public_users]).
    // Не добавлен в world.users → удаляем сами в finally каждого теста.
    async function mkAdhocUser(
      slug: string,
      opts: { departmentId?: string | null; permOverrides?: Record<string, boolean> } = {},
    ): Promise<{ id: string; email: string }> {
      const id = randomUUID();
      const email = `it-${world.runId}-${slug}@yur.test`;
      await world.admin.$transaction([
        world.admin.auth_users.create({ data: { id, email } }),
        world.admin.public_users.create({
          data: {
            id,
            full_name: `IT ${slug} ${world.runId}`,
            email,
            role: 'lawyer',
            is_active: true,
            department_id: opts.departmentId ?? null,
            visibility_scope: 'department',
            perm_overrides: opts.permOverrides ?? {},
          },
        }),
      ]);
      return { id, email };
    }

    async function destroyAdhocUser(id: string): Promise<void> {
      await world.admin.public_users.deleteMany({ where: { id } });
      await world.admin.auth_users.deleteMany({ where: { id } });
    }

    it('руководитель Києва видит дела своего подразделения (A, S), не B', async () => {
      const seen = await userDb(world.users.kyivAdmin.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}S`]);
      expect(seen).not.toContain(`${world.prefix}B`);
    });

    it('кросс-дело A (Київ продав / Дніпро веде) видно обоим руководителям', async () => {
      const kyivSeen = await userDb(world.users.kyivAdmin.id, (tx) => titlesOf(tx, world.prefix));
      const dniproSeen = await userDb(world.users.dniproAdmin.id, (tx) =>
        titlesOf(tx, world.prefix),
      );
      expect(kyivSeen).toContain(`${world.prefix}A`);
      expect(dniproSeen).toContain(`${world.prefix}A`);
    });

    it('руководитель Дніпра видит все три (Дніпро есть на A, B, S)', async () => {
      const seen = await userDb(world.users.dniproAdmin.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}B`, `${world.prefix}S`]);
    });

    it('руководитель Львова видит только B и НЕ видит A/S', async () => {
      const seen = await userDb(world.users.lvivAdmin.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}B`]);
      expect(seen).not.toContain(`${world.prefix}A`);
      expect(seen).not.toContain(`${world.prefix}S`);
    });

    it('admin со scope=all видит всё (подразделение перекрыто)', async () => {
      const seen = await userDb(world.users.allAdmin.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}B`, `${world.prefix}S`]);
    });

    it('переходное правило: admin без подразделения (NULL) видит всё', async () => {
      const seen = await userDb(world.users.staffAdmin.id, (tx) => titlesOf(tx, world.prefix));
      expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}B`, `${world.prefix}S`]);
    });

    it('юрист/Експерт не меняются: видят только свои дела', async () => {
      expect(await userDb(world.users.lawyer1.id, (tx) => titlesOf(tx, world.prefix))).toEqual([
        `${world.prefix}A`,
        `${world.prefix}S`,
      ]);
      expect(await userDb(world.users.expert2.id, (tx) => titlesOf(tx, world.prefix))).toEqual([
        `${world.prefix}B`,
      ]);
    });

    it('наследование: платёж дела A виден Києву, не Львову', async () => {
      const k = await userDb(world.users.kyivAdmin.id, (tx) =>
        tx.payments.findMany({ where: { case_id: world.caseA }, select: { amount: true } }),
      );
      const l = await userDb(world.users.lvivAdmin.id, (tx) =>
        tx.payments.findMany({ where: { case_id: world.caseA }, select: { amount: true } }),
      );
      expect(k.length).toBe(1);
      expect(Number(k[0]?.amount)).toBe(10000);
      expect(l.length).toBe(0); // дело A не касается Львова → платёж скрыт
    });

    it('клиент виден Києву (есть дело подразделения)', async () => {
      const rows = await userDb(world.users.kyivAdmin.id, (tx) =>
        tx.clients.findMany({ where: { id: world.clientId }, select: { id: true } }),
      );
      expect(rows.length).toBe(1);
    });

    it('ЗП-сводка скоупится: Київ видит lawyer1, не expert1 (Дніпро)', async () => {
      const rows = await userDb(world.users.kyivAdmin.id, (tx) => rpcPayrollBySpecialist(tx));
      const ids = rows.map((r) => r.user_id);
      expect(ids).toContain(world.users.lawyer1.id); // Київ — в зоне видимости
      expect(ids).not.toContain(world.users.expert1.id); // Дніпро — вне зоны
    });

    it('ЗП-сводка для scope=all включает и Дніпро, и Львів', async () => {
      const rows = await userDb(world.users.allAdmin.id, (tx) => rpcPayrollBySpecialist(tx));
      const ids = rows.map((r) => r.user_id);
      expect(ids).toContain(world.users.lawyer1.id);
      expect(ids).toContain(world.users.expert1.id);
      expect(ids).toContain(world.users.expert2.id);
    });

    // v2 Этап 3 — фильтр «Подразделение» в поиске дел (search_case_ids
    // p_department_id): дело видно подразделению юриста ЛИБО эксперта.
    //   Львів → только B; Київ → A и S (не B). q=prefix изолирует от seed-дел.
    it('search_case_ids: p_department_id сужает до дел подразделения', async () => {
      const deptId = async (name: string): Promise<string> => {
        const dep = await world.admin.departments.findFirst({
          where: { name },
          select: { id: true },
        });
        if (!dep) throw new Error(`department ${name} not found`);
        return dep.id;
      };
      const idsFor = async (department: string): Promise<string[]> => {
        const departmentId = await deptId(department);
        const rows = await userDb(world.users.allAdmin.id, (tx) =>
          rpcSearchCaseIds(tx, { q: world.prefix, departmentId, limit: 50, offset: 0 }),
        );
        return rows.map((r) => r.id);
      };

      const lviv = await idsFor('Львівський');
      expect(lviv).toContain(world.caseB);
      expect(lviv).not.toContain(world.caseA);
      expect(lviv).not.toContain(world.caseS);

      const kyiv = await idsFor('Київський');
      expect(kyiv).toEqual(expect.arrayContaining([world.caseA, world.caseS]));
      expect(kyiv).not.toContain(world.caseB);
    });

    // Регрессия на находку аудита (HIGH, privilege escalation):
    // переходное правило «department_id IS NULL ⇒ scope_is_all» НЕ должно срабатывать
    // для lawyer/expert. Иначе admin, выдав юристу право view_all_cases, эскалировал
    // бы его до видимости всей компании (у юриста department_id=NULL по умолчанию).
    it('эскалация заблокирована: lawyer+view_all_cases БЕЗ подразделения видит только своё', async () => {
      const { id } = await mkAdhocUser('esc-null', { permOverrides: { view_all_cases: true } });
      try {
        const seen = await userDb(id, (tx) => titlesOf(tx, world.prefix));
        // НЕ на одном из наших дел и БЕЗ подразделения → пусто, а не {A, B, S}.
        expect(seen).toEqual([]);
      } finally {
        await destroyAdhocUser(id);
      }
    });

    // Обратная сторона: granted-cap НЕ отключается, а СКОУПИТСЯ подразделением —
    // lawyer+view_all_cases с подразделением Дніпро видит дела своего филиала (A,B,S),
    // а не только свои назначенные.
    it('granted-cap скоупится: lawyer+view_all_cases с Дніпро видит дела филиала', async () => {
      const dep = await world.admin.departments.findFirst({
        where: { name: 'Дніпровський' },
        select: { id: true },
      });
      const { id } = await mkAdhocUser('esc-dep', {
        departmentId: dep!.id,
        permOverrides: { view_all_cases: true },
      });
      try {
        const seen = await userDb(id, (tx) => titlesOf(tx, world.prefix));
        expect(seen).toEqual([`${world.prefix}A`, `${world.prefix}B`, `${world.prefix}S`]);
      } finally {
        await destroyAdhocUser(id);
      }
    });
  });

  // ============================================================
  describe('Триггеры — paid_total и debt', () => {
    it('после сид-платежа A: paid_total=10000, debt=20000', async () => {
      const data = await world.admin.cases.findFirst({
        where: { id: world.caseA },
        select: { paid_total: true, debt: true, contract_sum: true },
      });
      expect(Number(data?.contract_sum)).toBe(30000);
      expect(Number(data?.paid_total)).toBe(10000);
      expect(Number(data?.debt)).toBe(20000);
    });

    it('дело без оплат B: paid_total=0, debt=120000', async () => {
      const data = await world.admin.cases.findFirst({
        where: { id: world.caseB },
        select: { paid_total: true, debt: true },
      });
      expect(Number(data?.paid_total)).toBe(0);
      expect(Number(data?.debt)).toBe(120000);
    });

    it('новый платёж пересчитывает paid_total/debt, удаление — откатывает', async () => {
      const ins = await world.admin.payments.create({
        data: {
          case_id: world.caseB,
          amount: 50000,
          paid_at: new Date('2026-05-20'),
          method: 'bank',
          note: 'IT extra',
          created_by: world.users.staffAdmin.id,
        },
        select: { id: true },
      });

      const after = await world.admin.cases.findFirst({
        where: { id: world.caseB },
        select: { paid_total: true, debt: true },
      });
      expect(Number(after?.paid_total)).toBe(50000);
      expect(Number(after?.debt)).toBe(70000);

      // Откат: удаляем платёж — триггер должен вернуть исходные значения
      // (заодно каскадом снимет авто-строку кассы, если она успела создаться).
      await world.admin.payments.delete({ where: { id: ins.id } });
      const restored = await world.admin.cases.findFirst({
        where: { id: world.caseB },
        select: { paid_total: true, debt: true },
      });
      expect(Number(restored?.paid_total)).toBe(0);
      expect(Number(restored?.debt)).toBe(120000);
    });
  });

  // ============================================================
  describe('Зарплата — ставки и расчёт (% от оплат)', () => {
    it('ставки по умолчанию: document 7%, claim 10%, representation 25%', async () => {
      const rows = await world.admin.payroll_rates.findMany({
        select: { category: true, lawyer_percent: true, expert_percent: true },
      });
      const byCat = new Map(rows.map((r) => [r.category, r]));
      expect(Number(byCat.get('document')?.lawyer_percent)).toBe(7);
      expect(Number(byCat.get('claim')?.lawyer_percent)).toBe(10);
      expect(Number(byCat.get('representation')?.lawyer_percent)).toBe(25);
      // Дефолты равны для юриста и эксперта (Концепция §7-4).
      expect(Number(byCat.get('representation')?.expert_percent)).toBe(25);
    });

    it('case_payroll(A): representation 25% от 10000 = 2500 каждому, итого 5000', async () => {
      const rows = await userDb(world.users.staffAdmin.id, (tx) =>
        rpcCasePayroll(tx, { caseId: world.caseA }),
      );
      const r = rows[0];
      expect(r).toBeTruthy();
      expect(r!.category).toBe('representation');
      expect(r!.lawyer_percent).toBe(25);
      expect(r!.expert_percent).toBe(25);
      expect(r!.lawyer_amount).toBe(2500);
      expect(r!.expert_amount).toBe(2500);
      expect(r!.total).toBe(5000);
    });

    it('payroll_by_specialist: юрист видит своё начисление, эксперт — не чужое', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) => rpcPayrollBySpecialist(tx));
      const mine = rows.find((r) => r.user_id === world.users.lawyer1.id);
      expect(mine).toBeTruthy();
      expect(mine!.earned).toBeGreaterThanOrEqual(2500);
      // Юрист не должен видеть строку чужого эксперта (expert2 на деле B).
      const foreign = rows.find((r) => r.user_id === world.users.expert2.id);
      expect(foreign).toBeUndefined();
    });
  });

  // ============================================================
  describe('Зарплата — режимы (v2 Этап 4)', () => {
    // Сброс к проценту (по умолчанию) — оба поля вместе из-за check-консистентности.
    const resetSalary = (userId: string) => setSalaryRaw(world.admin, userId, 'percent', null);

    it("режим 'fixed' зануляет процент в case_payroll / by_specialist / summary / cases", async () => {
      // lawyer1 (Київ) на деле A: representation 25% от 10000. Ставим оклад
      // (admin-пул: auth.uid() IS NULL → гард проходит системным путём, как раньше
      // service_role).
      await setSalaryRaw(world.admin, world.users.lawyer1.id, 'fixed', 20000);
      try {
        const { cpr, lawyerRow, sRow, caseRow } = await userDb(
          world.users.staffAdmin.id,
          async (tx) => {
            const cp = await rpcCasePayroll(tx, { caseId: world.caseA });
            const bs = await rpcPayrollBySpecialist(tx);
            const sum = await rpcPayrollEmployeeSummary(tx, { month: noMonth });
            const ec = await rpcPayrollEmployeeCases(tx, {
              userId: world.users.lawyer1.id,
              month: noMonth,
            });
            return {
              cpr: cp[0],
              lawyerRow: bs.find(
                (r) => r.user_id === world.users.lawyer1.id && r.role_in_case === 'lawyer',
              ),
              sRow: sum.find((r) => r.user_id === world.users.lawyer1.id),
              caseRow: ec.find(
                (r) => r.case_id === world.caseA && r.role_in_case === 'lawyer',
              ),
            };
          },
        );

        expect(cpr).toBeTruthy();
        expect(cpr!.lawyer_percent).toBe(0);
        expect(cpr!.lawyer_amount).toBe(0);
        // Эксперт1 — без изменений (процент): 25% от 10000 = 2500.
        expect(cpr!.expert_amount).toBe(2500);
        expect(cpr!.total).toBe(2500);

        expect(lawyerRow?.earned).toBe(0);

        expect(sRow).toBeTruthy();
        expect(sRow!.salary_mode).toBe('fixed');
        expect(sRow!.earned).toBe(0);
        expect(sRow!.fixed).toBe(20000);
        // balance (накопленный остаток) не включает оклад → 0 (нет премий/выплат).
        expect(sRow!.balance).toBe(0);

        expect(caseRow?.percent).toBe(0);
        expect(caseRow?.earned).toBe(0);
      } finally {
        await resetSalary(world.users.lawyer1.id);
      }
    });

    it("режим 'fixed_percent' = оклад + процент (процент сохраняется)", async () => {
      await setSalaryRaw(world.admin, world.users.lawyer1.id, 'fixed_percent', 15000);
      try {
        const { cpr, sRow } = await userDb(world.users.staffAdmin.id, async (tx) => {
          const cp = await rpcCasePayroll(tx, { caseId: world.caseA });
          const sum = await rpcPayrollEmployeeSummary(tx, { month: noMonth });
          return {
            cpr: cp[0],
            sRow: sum.find((r) => r.user_id === world.users.lawyer1.id),
          };
        });

        expect(cpr!.lawyer_percent).toBe(25);
        expect(cpr!.lawyer_amount).toBe(2500); // процент сохранён

        expect(sRow!.salary_mode).toBe('fixed_percent');
        expect(sRow!.earned).toBe(2500);
        expect(sRow!.fixed).toBe(15000);
        // balance = процент (2500), оклад не входит.
        expect(sRow!.balance).toBe(2500);
      } finally {
        await resetSalary(world.users.lawyer1.id);
      }
    });

    it('сотрудник на окладе без дел попадает в summary (kyivAdmin без дел)', async () => {
      await setSalaryRaw(world.admin, world.users.kyivAdmin.id, 'fixed', 30000);
      try {
        const row = await userDb(world.users.staffAdmin.id, async (tx) => {
          const sum = await rpcPayrollEmployeeSummary(tx, { month: noMonth });
          return sum.find((r) => r.user_id === world.users.kyivAdmin.id);
        });
        expect(row).toBeTruthy(); // без оклада admin без дел не появился бы
        expect(row!.fixed).toBe(30000);
        expect(row!.earned).toBe(0);
      } finally {
        await resetSalary(world.users.kyivAdmin.id);
      }
    });

    it('admin меняет оклад сотрудника СВОЕГО подразделения (kyivAdmin → lawyer1/Київ)', async () => {
      await userDb(world.users.kyivAdmin.id, (tx) =>
        setSalaryRaw(tx, world.users.lawyer1.id, 'fixed', 11000),
      );
      // Проверяем через admin-пул (сессия колонки salary_* не видит — column revoke).
      const data = await getSalaryRaw(world.admin, world.users.lawyer1.id);
      expect(data.salary_mode).toBe('fixed');
      expect(data.salary_fixed_amount).toBe(11000);
      await resetSalary(world.users.lawyer1.id);
    });

    it('admin НЕ может менять оклад ЧУЖОГО подразделения (kyivAdmin → lawyer2/Дніпро)', async () => {
      await expect(
        userDb(world.users.kyivAdmin.id, (tx) =>
          setSalaryRaw(tx, world.users.lawyer2.id, 'fixed', 9000),
        ),
      ).rejects.toThrow(/salary fields/); // гард users_guard_salary_fields
    });

    it('admin без подразделения (NULL) не меняет ничью зарплату (staffAdmin → lawyer1)', async () => {
      await expect(
        userDb(world.users.staffAdmin.id, (tx) =>
          setSalaryRaw(tx, world.users.lawyer1.id, 'fixed', 5000),
        ),
      ).rejects.toThrow(/salary fields/); // NULL-подразделение → can_manage_user_salary=false
    });

    it('приватность: обычный сотрудник не читает salary_* прямым select', async () => {
      // Колонка оклада защищена column-level привилегиями → permission denied.
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.$queryRaw`select salary_fixed_amount from public.users where id = ${world.users.lawyer2.id}::uuid`,
        ),
      ).rejects.toThrow();

      // Безопасные колонки (имя) по-прежнему читаются.
      const ok = await userDb(world.users.lawyer1.id, (tx) =>
        tx.public_users.findFirst({
          where: { id: world.users.lawyer2.id },
          select: { full_name: true },
        }),
      );
      expect(ok?.full_name).toBeTruthy();
    });

    it('оклад читается через manage_user_salaries с can_edit (kyivAdmin → lawyer1)', async () => {
      await setSalaryRaw(world.admin, world.users.lawyer1.id, 'fixed', 12345);
      try {
        const row = await userDb(world.users.kyivAdmin.id, async (tx) => {
          const rows = await rpcManageUserSalaries(tx);
          return rows.find((r) => r.user_id === world.users.lawyer1.id);
        });
        expect(row).toBeTruthy();
        expect(row!.salary_fixed_amount).toBe(12345);
        expect(row!.can_edit).toBe(true); // своё подразделение → можно править
      } finally {
        await resetSalary(world.users.lawyer1.id);
      }
    });
  });

  // ============================================================
  describe('Зарплата — совмещение ролей (0007: юрист = эксперт)', () => {
    // Дело D: lawyer1 в ОБЕИХ ролях, representation 25%, оплачено 10000.
    // Создаётся/удаляется внутри блока (не входит в destroyWorld).
    let caseD: string;

    beforeAll(async () => {
      const row = await world.admin.cases.create({
        data: {
          number_title: `${world.prefix}D`,
          client_id: world.clientId,
          lawyer_id: world.users.lawyer1.id,
          responsible_id: world.users.lawyer1.id,
          opened_at: new Date('2026-05-01'),
          case_type: 'civil' as never,
          category: 'representation' as never,
          stage: 'in_progress' as never,
          priority: 'normal',
          contract_sum: 30000,
        },
        select: { id: true },
      });
      caseD = row.id;
      await world.admin.payments.create({
        data: {
          case_id: caseD,
          amount: 10000,
          paid_at: new Date('2026-05-12'),
          method: 'bank',
          note: 'IT dual payment',
          created_by: world.users.staffAdmin.id,
        },
      });
    });

    afterAll(async () => {
      await world.admin.payments.deleteMany({ where: { case_id: caseD } });
      await world.admin.cases.deleteMany({ where: { id: caseD } });
    });

    it('case_payroll: одно начисление 25% (не 50%) — lawyer_* несёт dual, expert_* = 0', async () => {
      const rows = await userDb(world.users.staffAdmin.id, (tx) =>
        rpcCasePayroll(tx, { caseId: caseD }),
      );
      const r = rows[0]!;
      expect(r.lawyer_percent).toBe(25);
      expect(r.lawyer_amount).toBe(2500);
      expect(r.expert_percent).toBe(0);
      expect(r.expert_amount).toBe(0);
      expect(r.total).toBe(2500); // раньше было бы 5000 (дубль)
    });

    it("payroll_employee_cases: совмещённое дело — ОДНОЙ строкой role='dual'", async () => {
      const rows = await userDb(world.users.staffAdmin.id, (tx) =>
        rpcPayrollEmployeeCases(tx, {
          userId: world.users.lawyer1.id,
          month: noMonth,
        }),
      );
      const dRows = rows.filter((r) => r.case_id === caseD);
      expect(dRows).toHaveLength(1);
      expect(dRows[0]!.role_in_case).toBe('dual');
      expect(dRows[0]!.percent).toBe(25);
      expect(dRows[0]!.earned).toBe(2500);
    });

    it('payroll_employee_summary: начислено БЕЗ удвоения (A: 2500 + D: 2500 = 5000)', async () => {
      const sum = await userDb(world.users.staffAdmin.id, (tx) =>
        rpcPayrollEmployeeSummary(tx, { month: noMonth }),
      );
      const sRow = sum.find((r) => r.user_id === world.users.lawyer1.id);
      // Дела lawyer1: A (юрист, 25% от 10000 = 2500), S (без оплат, 0),
      // D (dual, 2500 — не 5000). При старом дубле было бы 7500.
      expect(sRow?.earned).toBe(5000);
      expect(sRow?.balance).toBe(5000);
    });

    it('payroll_by_specialist: у lawyer1 строка dual по делу D, expert-строки нет', async () => {
      const rows = await userDb(world.users.staffAdmin.id, (tx) =>
        rpcPayrollBySpecialist(tx),
      );
      const mine = rows.filter((r) => r.user_id === world.users.lawyer1.id);
      const dual = mine.find((r) => r.role_in_case === 'dual');
      expect(dual).toBeTruthy();
      expect(dual!.earned).toBe(2500);
      // Експерт-ветка совмещённые дела пропускает → роли 'expert' у lawyer1 нет.
      expect(mine.some((r) => r.role_in_case === 'expert')).toBe(false);
    });

    it('dual_rate_override: staff назначает 12% → начисление 1200', async () => {
      await userDb(world.users.staffAdmin.id, (tx) =>
        tx.$executeRaw`update public.cases set dual_rate_override = 12 where id = ${caseD}::uuid`,
      );
      try {
        const rows = await userDb(world.users.staffAdmin.id, (tx) =>
          rpcCasePayroll(tx, { caseId: caseD }),
        );
        expect(rows[0]!.lawyer_percent).toBe(12);
        expect(rows[0]!.lawyer_amount).toBe(1200);
        expect(rows[0]!.total).toBe(1200);
      } finally {
        // Сброс тоже от staff-сессии: гард rate_overrides не имеет системной
        // ветки для admin-пула (auth.uid() IS NULL → can() = false).
        await userDb(world.users.staffAdmin.id, (tx) =>
          tx.$executeRaw`update public.cases set dual_rate_override = null where id = ${caseD}::uuid`,
        );
      }
    });

    it('гард: юрист без права не меняет dual-ставку (rate_override_forbidden)', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.$executeRaw`update public.cases set dual_rate_override = 50 where id = ${caseD}::uuid`,
        ),
      ).rejects.toThrow(/rate overrides/);
    });
  });

  // ============================================================
  describe('Воронка — движение только вперёд', () => {
    it('юрист двигает своё дело на +1 этап (new_request → consultation)', async () => {
      const updated = await userDb(world.users.lawyer1.id, (tx) =>
        tx.cases.update({ where: { id: world.caseS }, data: { stage: 'consultation' } }),
      );
      expect(updated.stage).toBe('consultation');
    });

    it('перескок через этап запрещён (stage_skip_forbidden)', async () => {
      // consultation → closed: пропускает in_progress и awaiting_decision.
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.cases.update({ where: { id: world.caseS }, data: { stage: 'closed' } }),
        ),
      ).rejects.toThrow(/stage_skip_forbidden/);
    });

    it('откат назад запрещён для не-staff (stage_backward_forbidden)', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.cases.update({ where: { id: world.caseS }, data: { stage: 'new_request' } }),
        ),
      ).rejects.toThrow(/stage_backward_forbidden/);
    });

    it('staff может исправить этап назад (stage_corrected)', async () => {
      const updated = await userDb(world.users.staffAdmin.id, (tx) =>
        tx.cases.update({ where: { id: world.caseS }, data: { stage: 'new_request' } }),
      );
      expect(updated.stage).toBe('new_request');
    });
  });

  // ============================================================
  describe('RLS — справочник подразделений (v2 Этап 1)', () => {
    it('активный сотрудник (юрист) читает справочник', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) =>
        tx.departments.findMany({ select: { id: true, name: true } }),
      );
      // Сид клал 10, но владелец почистил справочник до реальных филиалов
      // (2026-07: осталось 4) — тесту важен сам ДОСТУП по RLS, не количество.
      // Минимум 4: Київський/Дніпровський/Львівський нужны фикстурам мира.
      expect(rows.length).toBeGreaterThanOrEqual(4);
    });

    it('не-owner (admin) не может создать подразделение', async () => {
      await expect(
        userDb(world.users.staffAdmin.id, (tx) =>
          tx.departments.create({ data: { name: `${world.prefix}Філія` } }),
        ),
      ).rejects.toThrow(); // with check (is_owner) → 42501
    });

    it('не-owner (admin) не может переименовать (RLS режет апдейт молча)', async () => {
      const dep = await world.admin.departments.findFirst({
        where: { name: 'Київський' },
        select: { id: true, name: true },
      });
      const result = await userDb(world.users.staffAdmin.id, (tx) =>
        tx.departments.updateMany({
          where: { id: dep!.id },
          data: { name: `${world.prefix}X` },
        }),
      );
      expect(result.count).toBe(0);
      const after = await world.admin.departments.findFirst({
        where: { id: dep!.id },
        select: { name: true },
      });
      expect(after?.name).toBe('Київський');
    });

    it('гард: admin не может выдать юристу visibility_scope/department_id', async () => {
      // Снимок «до»: фикстуры Этапа 2 назначают юристу подразделение, поэтому
      // тест не закладывается на конкретные значения, а проверяет неизменность.
      const before = await world.admin.public_users.findFirst({
        where: { id: world.users.lawyer1.id },
        select: { visibility_scope: true, department_id: true },
      });

      // RLS пропускает (users_update_managed_roles: admin правит lawyer),
      // но триггер users_guard_visibility_fields обязан отбить не-owner'а.
      // scope: текущий 'department' → пробуем 'all' (заведомо иное значение).
      await expect(
        userDb(world.users.staffAdmin.id, (tx) =>
          tx.public_users.update({
            where: { id: world.users.lawyer1.id },
            data: { visibility_scope: 'all' },
          }),
        ),
      ).rejects.toThrow(/only owner/);

      // department_id: берём ДРУГОЕ подразделение, чем у юриста сейчас — иначе
      // "new is not distinct from old" (изменения нет) и гард промолчит.
      const otherDep = await world.admin.departments.findFirst({
        where: { id: { not: before?.department_id ?? '00000000-0000-0000-0000-000000000000' } },
        select: { id: true },
      });
      await expect(
        userDb(world.users.staffAdmin.id, (tx) =>
          tx.public_users.update({
            where: { id: world.users.lawyer1.id },
            data: { department_id: otherDep!.id },
          }),
        ),
      ).rejects.toThrow(/only owner/);

      // Гард откатил обе попытки — значения не изменились.
      const after = await world.admin.public_users.findFirst({
        where: { id: world.users.lawyer1.id },
        select: { visibility_scope: true, department_id: true },
      });
      expect(after?.visibility_scope).toBe(before?.visibility_scope);
      expect(after?.department_id).toBe(before?.department_id);
    });

    it('owner: CRUD подразделения, назначение полей, FK держит удаление', async () => {
      // owner есть в фикстурах (с Этапа 6) — используем его.
      const createdId = await userDb(world.users.owner.id, async (tx) => {
        // owner создаёт подразделение
        const created = await tx.departments.create({
          data: { name: `${world.prefix}Філія` },
          select: { id: true },
        });
        // owner назначает юристу подразделение и scope (гард пропускает owner'а)
        await tx.public_users.update({
          where: { id: world.users.lawyer1.id },
          data: { department_id: created.id, visibility_scope: 'all' },
        });
        return created.id;
      });

      // FK без on delete: удалить подразделение с сотрудником нельзя (23503)
      await expect(
        userDb(world.users.owner.id, (tx) => tx.departments.delete({ where: { id: createdId } })),
      ).rejects.toThrow();

      // Откатываем назначение → теперь удаление проходит. (Сброс в NULL — как было
      // в исходном тесте; зависящие от lawyer1∈Київ проверки идут раньше по файлу.)
      await userDb(world.users.owner.id, async (tx) => {
        await tx.public_users.update({
          where: { id: world.users.lawyer1.id },
          data: { department_id: null, visibility_scope: 'department' },
        });
        await tx.departments.delete({ where: { id: createdId } });
      });
    });

    it('деактивированный сотрудник с живым токеном не читает справочник', async () => {
      try {
        await world.admin.public_users.update({
          where: { id: world.users.lawyer2.id },
          data: { is_active: false },
        });
        const rows = await userDb(world.users.lawyer2.id, (tx) =>
          tx.departments.findMany({ select: { id: true } }),
        );
        expect(rows).toHaveLength(0); // active_uid() → null → select-политика не пускает
      } finally {
        await world.admin.public_users.update({
          where: { id: world.users.lawyer2.id },
          data: { is_active: true },
        });
      }
    });
  });

  // ============================================================
  // v2 Этап 5 — Акты (Рахунок-Акт) как платёжные документы.
  //   Дела создаём свои (чтобы не ломать наборы предыдущих тестов):
  //     actCase  — document 7%, contract 19000, lawyer1+expert1;
  //     actCase2 — document 7%, contract 30000, lawyer1+expert1.
  // ============================================================
  describe('Акты — создание, подтверждение оплаты, completion', () => {
    let actCase = '';
    let actCase2 = '';

    const mkActCase = async (suffix: string, contract: number): Promise<string> => {
      const row = await world.admin.cases.create({
        data: {
          number_title: `${world.prefix}${suffix}`,
          client_id: world.clientId,
          lawyer_id: world.users.lawyer1.id,
          responsible_id: world.users.expert1.id,
          opened_at: new Date('2026-05-01'),
          case_type: 'civil',
          category: 'document',
          stage: 'in_progress',
          priority: 'normal',
          contract_sum: contract,
        },
        select: { id: true },
      });
      return row.id;
    };

    // Скан передаётся в RPC как storageKey + fileName; documents-строку создаёт
    // сама confirm_act_paid (атомарно). Для интеграции реальный файл не нужен.
    const scanArgs = (caseId: string) => ({
      storageKey: `cases/${caseId}/it-scan-${Math.random().toString(36).slice(2)}.pdf`,
      fileName: 'scan.pdf',
    });

    beforeAll(async () => {
      actCase = await mkActCase('ACT', 19000);
      actCase2 = await mkActCase('ACT2', 30000);
    });

    afterAll(async () => {
      const ids = [actCase, actCase2].filter(Boolean);
      if (ids.length === 0) return;
      // Реверт ещё оплаченных актов ПЕРЕД их удалением: если оставить paid-акт со
      // связанным платежом, FK payments.act_id→case_acts (ON DELETE SET NULL)
      // попытался бы обнулить act_id этого платежа при удалении акта — а это
      // запрещает payments_guard_act_payment (v3 s1, «act-linked payment is
      // immutable»). Поэтому сначала удаляем ЛЮБОЙ ещё оставшийся act-связанный
      // платёж (запускает case_acts_revert_on_payment_delete → акт issued), и
      // только потом — сами акты.
      await world.admin.payments.deleteMany({
        where: { case_id: { in: ids }, act_id: { not: null } },
      });
      await world.admin.case_acts.deleteMany({ where: { case_id: { in: ids } } });
      await world.admin.payments.deleteMany({ where: { case_id: { in: ids } } });
      await world.admin.documents.deleteMany({ where: { case_id: { in: ids } } });
      await world.admin.cases.deleteMany({ where: { id: { in: ids } } });
    });

    it('юрист-продажник НЕ может выписать акт (RLS: только Експерт/staff)', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.case_acts.create({
            data: {
              case_id: actCase,
              service_name: 'Юридичні послуги',
              amount: 19000,
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow(); // нарушение WITH CHECK
      const count = await world.admin.case_acts.count({ where: { case_id: actCase } });
      expect(count).toBe(0);
    });

    it('Експерт своего дела выписывает акт (issued)', async () => {
      const created = await userDb(world.users.expert1.id, (tx) =>
        tx.case_acts.create({
          data: {
            case_id: actCase,
            service_name: 'Юридичні послуги',
            amount: 19000,
            created_by: world.users.expert1.id,
          },
          select: { id: true, status: true, number: true },
        }),
      );
      expect(created.status).toBe('issued');
      expect(typeof created.number).toBe('number');
    });

    it('Експерт (не юрист/owner/admin) НЕ может подтвердить оплату', async () => {
      const act = await world.admin.case_acts.findFirst({
        where: { case_id: actCase },
        select: { id: true },
      });
      await expect(
        userDb(world.users.expert1.id, (tx) =>
          rpcConfirmActPaid(tx, {
            actId: act!.id,
            confirmedAmount: 19000,
            paidAt: '2026-05-20',
            ...scanArgs(actCase),
            method: 'act',
            note: null,
          }),
        ),
      ).rejects.toThrow(/insufficient privilege/); // insufficient privilege to confirm act
      // акт остаётся issued (RPC атомарна → документ/платёж не создались)
      const after = await world.admin.case_acts.findFirst({
        where: { id: act!.id },
        select: { status: true },
      });
      expect(after?.status).toBe('issued');
    });

    it('юрист дела подтверждает оплату → платёж, completion=full, долг 0', async () => {
      const act = await world.admin.case_acts.findFirst({
        where: { case_id: actCase },
        select: { id: true },
      });
      const paymentId = await userDb(world.users.lawyer1.id, (tx) =>
        rpcConfirmActPaid(tx, {
          actId: act!.id,
          confirmedAmount: 19000,
          paidAt: '2026-05-20',
          ...scanArgs(actCase),
          method: 'act',
          note: null,
        }),
      );

      const paidAct = await world.admin.case_acts.findFirst({
        where: { id: act!.id },
        select: {
          status: true,
          completion: true,
          confirmed_amount: true,
          scan_document_id: true,
        },
      });
      expect(paidAct?.status).toBe('paid');
      expect(paidAct?.completion).toBe('full'); // 19000 ≥ 19000
      expect(Number(paidAct?.confirmed_amount)).toBe(19000);
      expect(paidAct?.scan_document_id).not.toBeNull(); // documents-строка создана RPC

      // Скан-документ создан внутри RPC (doc_type='act').
      const scanDoc = await world.admin.documents.findFirst({
        where: { id: paidAct!.scan_document_id! },
        select: { id: true, doc_type: true },
      });
      expect(scanDoc).not.toBeNull();
      expect(scanDoc?.doc_type).toBe('act');

      // Автоплатёж создан и связан с актом.
      const pay = await world.admin.payments.findFirst({
        where: { case_id: actCase },
        select: { id: true, amount: true, act_id: true },
      });
      expect(pay?.id).toBe(paymentId);
      expect(Number(pay?.amount)).toBe(19000);
      expect(pay?.act_id).toBe(act!.id);

      // Триггеры пересчитали деньги дела.
      const cse = await world.admin.cases.findFirst({
        where: { id: actCase },
        select: { paid_total: true, debt: true },
      });
      expect(Number(cse?.paid_total)).toBe(19000);
      expect(Number(cse?.debt)).toBe(0);
    });

    it('повторное подтверждение оплаченного акта отвергается', async () => {
      const act = await world.admin.case_acts.findFirst({
        where: { case_id: actCase },
        select: { id: true },
      });
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          rpcConfirmActPaid(tx, {
            actId: act!.id,
            confirmedAmount: 1000,
            paidAt: '2026-05-21',
            ...scanArgs(actCase),
            method: 'act',
            note: null,
          }),
        ),
      ).rejects.toThrow(/is not in issued status/);
    });

    it('частичная оплата → completion=partial, долг остаётся', async () => {
      // staff (admin без подразделения) выписывает акт на actCase2 (contract 30000).
      const act = await userDb(world.users.staffAdmin.id, (tx) =>
        tx.case_acts.create({
          data: {
            case_id: actCase2,
            service_name: 'Юридичні послуги',
            amount: 10000,
            created_by: world.users.staffAdmin.id,
          },
          select: { id: true },
        }),
      );

      await userDb(world.users.lawyer1.id, (tx) =>
        rpcConfirmActPaid(tx, {
          actId: act.id,
          confirmedAmount: 10000,
          paidAt: '2026-05-22',
          ...scanArgs(actCase2),
          method: 'act',
          note: null,
        }),
      );

      const paidAct = await world.admin.case_acts.findFirst({
        where: { id: act.id },
        select: { completion: true },
      });
      expect(paidAct?.completion).toBe('partial'); // 10000 < 30000

      const cse = await world.admin.cases.findFirst({
        where: { id: actCase2 },
        select: { paid_total: true, debt: true },
      });
      expect(Number(cse?.paid_total)).toBe(10000);
      expect(Number(cse?.debt)).toBe(20000);
    });

    it('удаление платежа возвращает акт в issued (целостность)', async () => {
      const act = await world.admin.case_acts.findFirst({
        where: { case_id: actCase },
        select: { id: true },
      });
      // Удаляем автоплатёж акта → триггер реверта возвращает акт в issued.
      await world.admin.payments.deleteMany({ where: { act_id: act!.id } });
      const reverted = await world.admin.case_acts.findFirst({
        where: { id: act!.id },
        select: { status: true, completion: true, confirmed_amount: true, paid_at: true },
      });
      expect(reverted?.status).toBe('issued');
      expect(reverted?.completion).toBeNull();
      expect(reverted?.confirmed_amount).toBeNull();
      expect(reverted?.paid_at).toBeNull();
    });
  });
});
