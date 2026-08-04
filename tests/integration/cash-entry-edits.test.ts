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
  rpcCashCutoffSummary,
  rpcCashEntrySetIncluded,
  rpcCashTurnover,
} from '@/lib/db/rpc';

// Интеграционные тесты миграции 0019 (жалоба клиента 2026-08-04).
//
// Что здесь проверяется:
//   • UPDATE-политика expenses — зеркало delete: расход по делу правит автор с
//     правом (или управленец), расход фирмы — только менеджер кассы. Право
//     «расходы по делу» по-прежнему НЕ открывает зарплату и чужие дела;
//   • зарплатный авто-расход не правится даже owner;
//   • гард expenses_guard_update: case_id / created_by неизменны — перенос
//     между делом и фирмой остаётся удалением и внесением заново;
//   • правка расхода пересобирает строку кассы (сумма, дата, описание);
//   • флаг include_before_opening: операция раньше opening_date не входит в
//     обороты и перенос остатка, а помеченная — входит; ставит его только
//     обладатель can_manage_cash; правка источника флаг не теряет.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:cash-entry-edits] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — правка операций кассы (0019)', () => {
  let world: World;
  let catCourtFee: string;
  let catExpertise: string;
  let catOffice: string;
  // Неактивный счёт с ПОЗДНЕЙ датой начального остатка: операции мая на нём
  // отсекаются, и это ровно та ситуация, из-за которой клиент жаловался.
  // Неактивность нужна, чтобы подбор cash_resolve_account не утащил на него
  // чужие операции среды.
  let account: string;
  const OPENING = '2026-06-01';

  const catId = async (code: string): Promise<string> => {
    const row = await world.admin.expense_categories.findFirst({
      where: { code },
      select: { id: true },
    });
    if (!row) throw new Error(`нет встроенной статьи «${code}» — миграции 0009/0010 применены?`);
    return row.id;
  };

  beforeAll(async () => {
    world = await createWorld();

    await world.admin.public_users.update({
      where: { id: world.users.lawyer1.id },
      data: { perm_overrides: { view_case_expenses: true, manage_case_expenses: true } },
    });
    await world.admin.public_users.update({
      where: { id: world.users.officeKyiv.id },
      data: { perm_overrides: { view_cash: true, can_manage_cash: true } },
    });

    catCourtFee = await catId('court_fee');
    catExpertise = await catId('expertise');
    catOffice = await catId('office');

    const acc = await world.admin.cash_accounts.create({
      data: {
        name: `${world.prefix}cut`,
        kind: 'cash',
        opening_balance: 1000,
        opening_date: new Date(`${OPENING}T00:00:00Z`),
        is_active: false,
        is_default: false,
        created_by: world.users.owner.id,
      },
      select: { id: true },
    });
    account = acc.id;
  });

  afterAll(async () => {
    if (!world) return;
    const userIds = Object.values(world.users).map((u) => u.id);
    await world.admin.payroll_transactions.deleteMany({ where: { user_id: { in: userIds } } });
    await world.admin.expenses.deleteMany({ where: { created_by: { in: userIds } } });
    await world.admin.cash_entries.deleteMany({ where: { account_id: account } });
    await world.admin.cash_accounts.deleteMany({ where: { id: account } });
    await destroyWorld(world);
  });

  // ── 1. Правка расхода по делу ──────────────────────────────────────────────
  describe('расход по делу: кто может править', () => {
    let expenseA: string;

    beforeAll(async () => {
      const row = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: world.caseA,
            category_id: catCourtFee,
            amount: 500,
            spent_at: new Date('2026-06-15'),
            account_id: account,
            note: 'судовий збір',
            created_by: world.users.lawyer1.id,
          },
          select: { id: true },
        }),
      );
      expenseA = row.id;
    });

    it('автор с правом правит статью, сумму и комментарий', async () => {
      const res = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.updateMany({
          where: { id: expenseA },
          data: { category_id: catExpertise, amount: 750, note: 'експертиза' },
        }),
      );
      expect(res.count).toBe(1);

      const after = await world.admin.expenses.findUnique({
        where: { id: expenseA },
        select: { category_id: true, amount: true, note: true },
      });
      expect(after?.category_id).toBe(catExpertise);
      expect(Number(after?.amount)).toBe(750);
      expect(after?.note).toBe('експертиза');
    });

    it('правка пересобрала строку кассы: новая сумма и новое описание', async () => {
      const entry = await world.admin.cash_entries.findFirst({
        where: { expense_id: expenseA },
        select: { amount: true, description: true, direction: true, entry_date: true },
      });
      expect(entry).not.toBeNull();
      expect(Number(entry!.amount)).toBe(750);
      expect(entry!.direction).toBe('out');
      expect(entry!.description).toContain('експертиза');
    });

    it('lawyer2 (нет права и чужое дело) — тихий no-op', async () => {
      const res = await userDb(world.users.lawyer2.id, (tx) =>
        tx.expenses.updateMany({ where: { id: expenseA }, data: { note: 'зламано' } }),
      );
      expect(res.count).toBe(0);
    });

    it('expert1 видит дело, но без права расходов — тоже no-op', async () => {
      const res = await userDb(world.users.expert1.id, (tx) =>
        tx.expenses.updateMany({ where: { id: expenseA }, data: { note: 'зламано' } }),
      );
      expect(res.count).toBe(0);
    });

    it('гард: дело у расхода правкой не меняется', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.expenses.updateMany({
            where: { id: expenseA },
            data: { case_id: world.caseS },
          }),
        ),
      ).rejects.toThrow();
    });

    it('гард: автора расхода правкой не подменить', async () => {
      await expect(
        userDb(world.users.owner.id, (tx) =>
          tx.expenses.updateMany({
            where: { id: expenseA },
            data: { created_by: world.users.owner.id },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ── 2. Расход фирмы и зарплата ─────────────────────────────────────────────
  describe('расход фирмы: только права кассы; зарплата не правится', () => {
    let companyExpense: string;
    let payoutExpense: string;

    beforeAll(async () => {
      const row = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: null,
            category_id: catOffice,
            amount: 300,
            spent_at: new Date('2026-06-10'),
            account_id: account,
            note: 'вода',
            created_by: world.users.officeKyiv.id,
          },
          select: { id: true },
        }),
      );
      companyExpense = row.id;

      // Выплата ЗП сама создаёт расход фирмы по статье «Зарплата» (0010).
      const tx = await world.admin.payroll_transactions.create({
        data: {
          user_id: world.users.lawyer1.id,
          kind: 'payout',
          amount: 1000,
          occurred_on: new Date('2026-06-20'),
          created_by: world.users.owner.id,
        },
        select: { id: true },
      });
      const auto = await world.admin.expenses.findFirst({
        where: { payroll_transaction_id: tx.id },
        select: { id: true },
      });
      if (!auto) throw new Error('выплата ЗП не создала авто-расход — миграция 0010 применена?');
      payoutExpense = auto.id;
    });

    it('менеджер кассы правит расход фирмы', async () => {
      const res = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.updateMany({
          where: { id: companyExpense },
          data: { note: 'вода та кава', amount: 420 },
        }),
      );
      expect(res.count).toBe(1);
    });

    it('lawyer1 с правом «расходы по делу» фирменный расход НЕ правит', async () => {
      const res = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.updateMany({
          where: { id: companyExpense },
          data: { note: 'зламано' },
        }),
      );
      expect(res.count).toBe(0);
    });

    it('зарплатный авто-расход не правит даже owner', async () => {
      const res = await userDb(world.users.owner.id, (tx) =>
        tx.expenses.updateMany({
          where: { id: payoutExpense },
          data: { note: 'зламано' },
        }),
      );
      expect(res.count).toBe(0);
    });
  });

  // ── 3. «Внести в оборот» — исключение из отсечки по opening_date ───────────
  describe('include_before_opening', () => {
    let earlyEntry: string;

    beforeAll(async () => {
      // Ручная операция МАЯ на счёте, открытом 1 июня: в журнале есть, в
      // оборотах нет — та самая жалоба «+408 ₴ не в обороте».
      const row = await world.admin.cash_entries.create({
        data: {
          account_id: account,
          entry_date: new Date('2026-05-20T00:00:00Z'),
          direction: 'in',
          amount: 408,
          description: `${world.prefix}відсотки`,
          created_by: world.users.officeKyiv.id,
        },
        select: { id: true },
      });
      earlyEntry = row.id;
    });

    const turnoverIn = async (): Promise<number> => {
      const rows = await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashTurnover(tx, { from: '2026-05-01', to: '2026-05-31' }),
      );
      return rows.find((r) => r.account_id === account)?.inflow ?? 0;
    };

    const carryBefore = async (): Promise<number> => {
      const rows = await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashBalancesBefore(tx, { before: '2026-06-01' }),
      );
      return rows.find((r) => r.account_id === account)?.balance ?? 0;
    };

    it('до пометки операция не входит ни в обороты, ни в перенос остатка', async () => {
      expect(await turnoverIn()).toBe(0);
      expect(await carryBefore()).toBe(0);
    });

    it('без права can_manage_cash пометку не поставить', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          rpcCashEntrySetIncluded(tx, { entryId: earlyEntry, value: true }),
        ),
      ).rejects.toThrow();
    });

    it('менеджер кассы вносит операцию в оборот — она начинает считаться', async () => {
      const ok = await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashEntrySetIncluded(tx, { entryId: earlyEntry, value: true }),
      );
      expect(ok).toBe(true);
      expect(await turnoverIn()).toBe(408);
      expect(await carryBefore()).toBe(408);
    });

    it('пометку можно снять — операция снова выпадает из оборотов', async () => {
      await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashEntrySetIncluded(tx, { entryId: earlyEntry, value: false }),
      );
      expect(await turnoverIn()).toBe(0);
    });
  });

  // ── 3b. Сводка отсечённых операций по ВСЕМУ счёту (0020) ──────────────────
  // Питает подтверждение переноса даты остатка. Считать её по видимому периоду
  // было ловушкой: настройка меняется навсегда, а цифры показывались бы за
  // случайный открытый месяц.
  describe('cash_cutoff_summary', () => {
    it('считает все отсечённые операции счёта и самую раннюю дату', async () => {
      // Ещё одна отсечённая операция, на месяц раньше майской из блока выше.
      await world.admin.cash_entries.create({
        data: {
          account_id: account,
          entry_date: new Date('2026-04-10T00:00:00Z'),
          direction: 'out',
          amount: 100,
          description: `${world.prefix}квітень`,
          created_by: world.users.officeKyiv.id,
        },
      });

      const rows = await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashCutoffSummary(tx),
      );
      const mine = rows.find((r) => r.account_id === account);
      expect(mine).toBeDefined();
      // Майские 408 ₴ (пометку сняли в предыдущем блоке) + апрельские −100 ₴.
      expect(mine!.cnt).toBe(2);
      expect(mine!.net).toBe(308);
      expect(mine!.earliest).toBe('2026-04-10');
    });

    it('помеченные «внести в оборот» в сводку не попадают', async () => {
      const early = await world.admin.cash_entries.findFirst({
        where: { account_id: account, entry_date: new Date('2026-04-10T00:00:00Z') },
        select: { id: true },
      });
      await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashEntrySetIncluded(tx, { entryId: early!.id, value: true }),
      );

      const rows = await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashCutoffSummary(tx),
      );
      const mine = rows.find((r) => r.account_id === account);
      expect(mine!.cnt).toBe(1);
      expect(mine!.earliest).toBe('2026-05-20');
    });

    it('без прав кассы сводка пуста (fail-closed)', async () => {
      const rows = await userDb(world.users.lawyer2.id, (tx) =>
        rpcCashCutoffSummary(tx),
      );
      expect(rows.find((r) => r.account_id === account)).toBeUndefined();
    });
  });

  // ── 4. Флаг переживает пересборку авто-строки ─────────────────────────────
  describe('правка источника не теряет пометку', () => {
    it('расход мая помечен, правка комментария — пометка на месте', async () => {
      const exp = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: null,
            category_id: catOffice,
            amount: 120,
            spent_at: new Date('2026-05-25'),
            account_id: account,
            note: 'канцелярія',
            created_by: world.users.officeKyiv.id,
          },
          select: { id: true },
        }),
      );

      const before = await world.admin.cash_entries.findFirst({
        where: { expense_id: exp.id },
        select: { id: true },
      });
      expect(before).not.toBeNull();

      await userDb(world.users.officeKyiv.id, (tx) =>
        rpcCashEntrySetIncluded(tx, { entryId: before!.id, value: true }),
      );

      // Правка расхода = delete + insert строки кассы внутри триггера.
      await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.updateMany({
          where: { id: exp.id },
          data: { note: 'канцелярія та папір' },
        }),
      );

      const after = await world.admin.cash_entries.findFirst({
        where: { expense_id: exp.id },
        select: { include_before_opening: true, description: true },
      });
      expect(after?.include_before_opening).toBe(true);
      expect(after?.description).toContain('папір');
    });
  });
});
