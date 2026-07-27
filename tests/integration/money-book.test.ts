import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import {
  rpcCasePayroll,
  rpcCashAccountsPick,
  rpcConfirmActPaid,
  rpcExpensesByCategory,
  rpcFinanceByCase,
} from '@/lib/db/rpc';

// Интеграционные тесты «Книги операций» (миграции 0009–0016, сессия 2026-07-26/27).
// Проверяем инварианты, на которых держится бухучёт фирмы:
//   • RLS-развилка expenses по case_id: строка С делом — видимость дела × право
//     view/manage_case_expenses; строка БЕЗ дела (в т.ч. ЗАРПЛАТА) — только права
//     кассы. Галочка «расходы по делу» не открывает зарплату и чужие дела;
//   • ГЛАВНЫЙ ИНВАРИАНТ: расходы НЕ трогают базу ЗП (paid_total / case_payroll);
//   • счёт операции: явный account_id важнее подбора по method (0015/0016),
//     правка платежа пересоздаёт строку кассы; act-платёж заморожен по
//     сумме/дате, но счёт у него сменить можно;
//   • резолв счёта (0011): kind → is_default → единственный активный → NULL;
//     нет касс — операция проходит, триггер молчит (проверяется в транзакции
//     с откатом — данные среды не меняются);
//   • выплата ЗП → авто-расход по статье «Зарплата» → строка кассы; каскад
//     удаления; премия (bonus) движения денег не создаёт; авто-строки руками
//     не создаются и не удаляются;
//   • cash_accounts_pick(): справочник счетов без остатков доступен всем
//     активным, сама таблица cash_accounts остаётся закрытой;
//   • отчёты finance_by_case / expenses_by_category — SECURITY INVOKER, RLS
//     режет строки по зрителю.

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:money-book] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — книга операций (0009–0016)', () => {
  let world: World;
  let catCourtFee: string; // встроенная статья «по делу»
  let catSalary: string;   // встроенная статья «Зарплата» (авто-расход выплат)
  let catOffice: string;   // встроенная фирменная статья
  // Два НЕАКТИВНЫХ счёта: в подборе cash_resolve_account не участвуют, поэтому
  // операции среды (и владельца на общей dev-БД) наши тесты не перетягивают.
  let accA1: string;
  let accA2: string;

  const mkInactiveAccount = async (name: string): Promise<string> => {
    const acc = await world.admin.cash_accounts.create({
      data: {
        name,
        kind: 'cash',
        opening_balance: 0,
        opening_date: new Date('2026-05-01'),
        is_active: false,
        is_default: false,
        created_by: world.users.owner.id,
      },
      select: { id: true },
    });
    return acc.id;
  };

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

    // Права (admin-пул = системный путь, гвард грантов не мешает):
    //   lawyer1 — расходы по СВОИМ делам (view + manage);
    //   officeKyiv — касса (view_cash + can_manage_cash) → фирменные расходы.
    // lawyer2 / expert1 остаются на дефолтах роли (все четыре права false).
    await world.admin.public_users.update({
      where: { id: world.users.lawyer1.id },
      data: { perm_overrides: { view_case_expenses: true, manage_case_expenses: true } },
    });
    await world.admin.public_users.update({
      where: { id: world.users.officeKyiv.id },
      data: { perm_overrides: { view_cash: true, can_manage_cash: true } },
    });

    catCourtFee = await catId('court_fee');
    catSalary = await catId('salary');
    catOffice = await catId('office');

    accA1 = await mkInactiveAccount(`${world.prefix}acc1`);
    accA2 = await mkInactiveAccount(`${world.prefix}acc2`);
  });

  afterAll(async () => {
    if (!world) return;
    const userIds = Object.values(world.users).map((u) => u.id);
    // Порядок: выплаты (каскад снимает аллокации, авто-расход и строку кассы) →
    // прочие расходы (каскад снимает их строки кассы) → act-платежи (destroyWorld
    // удаляет акты ПЕРВЫМИ, а SET NULL по act_id бьётся о гард «act-платёж
    // неизменяем»; удаление платежа само возвращает акт в issued) → мир.
    await world.admin.payroll_transactions.deleteMany({ where: { user_id: { in: userIds } } });
    await world.admin.expenses.deleteMany({ where: { created_by: { in: userIds } } });
    await world.admin.expense_categories.deleteMany({ where: { code: { startsWith: world.prefix } } });
    await world.admin.payments.deleteMany({
      where: {
        case_id: { in: [world.caseA, world.caseB, world.caseS] },
        act_id: { not: null },
      },
    });
    await destroyWorld(world);
  });

  // ── 1. RLS: расход ПО ДЕЛУ = видимость дела × право ────────────────────────
  describe('расход по делу: право × видимость дела', () => {
    let expenseA: string; // расход lawyer1 по делу A
    let expenseB: string; // расход owner по делу B

    it('lawyer1 (право есть) вносит расход по СВОЕМУ делу и видит его', async () => {
      const row = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: world.caseA,
            category_id: catCourtFee,
            amount: 500,
            spent_at: new Date('2026-05-15'),
            method: 'cash',
            note: 'судовий збір',
            created_by: world.users.lawyer1.id,
          },
          select: { id: true },
        }),
      );
      expenseA = row.id;

      const seen = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.findMany({ where: { id: expenseA }, select: { id: true } }),
      );
      expect(seen).toHaveLength(1);
    });

    it('lawyer1 НЕ может внести расход по ЧУЖОМУ делу (право не расширяет видимость)', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.expenses.create({
            data: {
              case_id: world.caseB,
              category_id: catCourtFee,
              amount: 100,
              spent_at: new Date('2026-05-15'),
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('lawyer2 БЕЗ права не вносит расход даже по своему делу', async () => {
      await expect(
        userDb(world.users.lawyer2.id, (tx) =>
          tx.expenses.create({
            data: {
              case_id: world.caseB,
              category_id: catCourtFee,
              amount: 100,
              spent_at: new Date('2026-05-15'),
              created_by: world.users.lawyer2.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('expert1 (его дело A, но БЕЗ права) расход не видит; officeKyiv (staff) — видит', async () => {
      const expertSees = await userDb(world.users.expert1.id, (tx) =>
        tx.expenses.findMany({ where: { id: expenseA }, select: { id: true } }),
      );
      expect(expertSees).toHaveLength(0);

      const officeSees = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.findMany({ where: { id: expenseA }, select: { id: true } }),
      );
      expect(officeSees).toHaveLength(1);
    });

    it('lawyer2 не видит расход своего дела, внесённый owner (нет view_case_expenses)', async () => {
      const row = await userDb(world.users.owner.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: world.caseB,
            category_id: catCourtFee,
            amount: 250,
            spent_at: new Date('2026-05-16'),
            created_by: world.users.owner.id,
          },
          select: { id: true },
        }),
      );
      expenseB = row.id;

      const seen = await userDb(world.users.lawyer2.id, (tx) =>
        tx.expenses.findMany({ where: { id: expenseB }, select: { id: true } }),
      );
      expect(seen).toHaveLength(0);
    });

    it('удаление: чужой не может (0 строк), автор — может', async () => {
      const foreign = await userDb(world.users.expert1.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: expenseA } }),
      );
      expect(foreign.count).toBe(0);

      const own = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: expenseA } }),
      );
      expect(own.count).toBe(1);

      // cleanup: расход owner по делу B
      await world.admin.expenses.deleteMany({ where: { id: expenseB } });
    });
  });

  // ── 2. RLS: расход ФИРМЫ (case_id NULL) = только права кассы ───────────────
  describe('расход фирмы: права кассы, зарплата скрыта', () => {
    let companyExpense: string;

    it('lawyer1 с manage_case_expenses НЕ может внести расход фирмы', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.expenses.create({
            data: {
              case_id: null,
              category_id: catOffice,
              amount: 300,
              spent_at: new Date('2026-05-17'),
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('cash-manager (officeKyiv) вносит расход фирмы', async () => {
      const row = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: null,
            category_id: catOffice,
            amount: 300,
            spent_at: new Date('2026-05-17'),
            method: 'bank',
            note: 'вода в офіс',
            created_by: world.users.officeKyiv.id,
          },
          select: { id: true },
        }),
      );
      companyExpense = row.id;
    });

    it('lawyer1 (галочка «расходы по делу») фирменную строку НЕ видит; owner — видит', async () => {
      const lawyerSees = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.findMany({ where: { id: companyExpense }, select: { id: true } }),
      );
      expect(lawyerSees).toHaveLength(0);

      const ownerSees = await userDb(world.users.owner.id, (tx) =>
        tx.expenses.findMany({ where: { id: companyExpense }, select: { id: true } }),
      );
      expect(ownerSees).toHaveLength(1);
    });

    it('удаление фирменного: lawyer1 — 0 строк, cash-manager — удаляет', async () => {
      const lawyerDel = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: companyExpense } }),
      );
      expect(lawyerDel.count).toBe(0);

      const managerDel = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: companyExpense } }),
      );
      expect(managerDel.count).toBe(1);
    });
  });

  // ── 3. ГЛАВНЫЙ ИНВАРИАНТ: расходы не трогают базу ЗП ───────────────────────
  describe('инвариант: расход не меняет paid_total и расчёт ЗП', () => {
    it('case_payroll и paid_total дела A идентичны до и после расхода', async () => {
      const paidBefore = (await world.admin.cases.findUniqueOrThrow({
        where: { id: world.caseA },
        select: { paid_total: true, debt: true },
      }))!;
      const payrollBefore = await userDb(world.users.lawyer1.id, (tx) =>
        rpcCasePayroll(tx, { caseId: world.caseA }),
      );

      const exp = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: world.caseA,
            category_id: catCourtFee,
            amount: 999,
            spent_at: new Date('2026-05-18'),
            created_by: world.users.lawyer1.id,
          },
          select: { id: true },
        }),
      );

      const paidAfter = (await world.admin.cases.findUniqueOrThrow({
        where: { id: world.caseA },
        select: { paid_total: true, debt: true },
      }))!;
      const payrollAfter = await userDb(world.users.lawyer1.id, (tx) =>
        rpcCasePayroll(tx, { caseId: world.caseA }),
      );

      expect(Number(paidAfter.paid_total)).toBe(Number(paidBefore.paid_total));
      expect(Number(paidAfter.debt)).toBe(Number(paidBefore.debt));
      expect(payrollAfter).toEqual(payrollBefore);

      await world.admin.expenses.deleteMany({ where: { id: exp.id } }); // cleanup
    });
  });

  // ── 4. Счёт операции: явный account_id важнее подбора по method ────────────
  describe('явный счёт операции (0015/0016)', () => {
    it('платёж с account_id ложится именно на этот счёт; правка переносит; удаление снимает', async () => {
      // method='bank' подобрал бы bank-счёт, но явный account_id (kind=cash,
      // неактивный) обязан победить подбор.
      const pay = await userDb(world.users.owner.id, (tx) =>
        tx.payments.create({
          data: {
            case_id: world.caseA,
            amount: 1500,
            paid_at: new Date('2026-05-19'),
            method: 'bank',
            account_id: accA1,
            created_by: world.users.owner.id,
          },
          select: { id: true },
        }),
      );

      const entry1 = await world.admin.cash_entries.findMany({
        where: { payment_id: pay.id },
        select: { account_id: true, direction: true, amount: true },
      });
      expect(entry1).toHaveLength(1);
      expect(entry1[0]!.account_id).toBe(accA1);
      expect(entry1[0]!.direction).toBe('in');
      expect(Number(entry1[0]!.amount)).toBe(1500);

      // Правка платежа (edit_payments): счёт сменился → строка кассы пересоздана.
      await userDb(world.users.owner.id, (tx) =>
        tx.payments.updateMany({ where: { id: pay.id }, data: { account_id: accA2 } }),
      );
      const entry2 = await world.admin.cash_entries.findMany({
        where: { payment_id: pay.id },
        select: { account_id: true },
      });
      expect(entry2).toHaveLength(1);
      expect(entry2[0]!.account_id).toBe(accA2);

      await userDb(world.users.owner.id, (tx) =>
        tx.payments.deleteMany({ where: { id: pay.id } }),
      );
      const entry3 = await world.admin.cash_entries.findMany({ where: { payment_id: pay.id } });
      expect(entry3).toHaveLength(0);
    });

    it('расход с account_id: строка кассы out на этом счёте, с делом и expense_id; удаление снимает', async () => {
      const exp = await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: world.caseA,
            category_id: catCourtFee,
            amount: 640,
            spent_at: new Date('2026-05-20'),
            account_id: accA1,
            method: 'bank', // явный счёт должен победить и здесь
            created_by: world.users.lawyer1.id,
          },
          select: { id: true },
        }),
      );

      const entries = await world.admin.cash_entries.findMany({
        where: { expense_id: exp.id },
        select: { account_id: true, direction: true, amount: true, case_id: true },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.account_id).toBe(accA1);
      expect(entries[0]!.direction).toBe('out');
      expect(Number(entries[0]!.amount)).toBe(640);
      expect(entries[0]!.case_id).toBe(world.caseA);

      await userDb(world.users.lawyer1.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: exp.id } }),
      );
      const after = await world.admin.cash_entries.findMany({ where: { expense_id: exp.id } });
      expect(after).toHaveLength(0);
    });
  });

  // ── 5. Резолв счёта (0011) — в транзакции с откатом ────────────────────────
  // Правила подбора зависят от ПОЛНОГО набора счетов среды, поэтому весь
  // сценарий идёт в одной admin-транзакции и откатывается — счета среды
  // (и владельца на общей dev-БД) не меняются ни на секунду дольше транзакции.
  describe('cash_resolve_account: kind → default → единственный активный → NULL', () => {
    it('полный сценарий подбора; «касс нет» — платёж проходит без строки кассы', async () => {
      const resolve = async (
        tx: Parameters<Parameters<typeof world.admin.$transaction>[0]>[0],
        method: string | null,
      ): Promise<string | null> => {
        const rows = await tx.$queryRaw<Array<{ id: string | null }>>`
          select private.cash_resolve_account(${method}::text) as id`;
        return rows[0]?.id ?? null;
      };

      await expect(
        world.admin.$transaction(async (tx) => {
          // Чистое поле: все счета выключены, дефолт снят.
          await tx.cash_accounts.updateMany({ data: { is_active: false, is_default: false } });

          // Касс нет вовсе: платёж проходит, триггер молчит (строки кассы нет).
          expect(await resolve(tx, null)).toBeNull();
          const orphan = await tx.payments.create({
            data: {
              case_id: world.caseB,
              amount: 77,
              paid_at: new Date('2026-05-21'),
              created_by: world.users.owner.id,
            },
            select: { id: true },
          });
          expect(
            await tx.cash_entries.findMany({ where: { payment_id: orphan.id } }),
          ).toHaveLength(0);

          // Единственный активный счёт = счёт по умолчанию (0011) — даже при method NULL.
          const solo = await tx.cash_accounts.create({
            data: {
              name: `${world.prefix}solo`,
              kind: 'cash',
              opening_balance: 0,
              opening_date: new Date('2026-05-01'),
              created_by: world.users.owner.id,
            },
            select: { id: true },
          });
          expect(await resolve(tx, null)).toBe(solo.id);
          expect(await resolve(tx, 'безготівка')).toBe(solo.id); // свободный текст — тоже

          // Счетов два, дефолта нет: kind-совпадение работает, «наугад» — NULL.
          const card = await tx.cash_accounts.create({
            data: {
              name: `${world.prefix}card`,
              kind: 'card',
              opening_balance: 0,
              opening_date: new Date('2026-05-01'),
              created_by: world.users.owner.id,
            },
            select: { id: true },
          });
          expect(await resolve(tx, 'card')).toBe(card.id);
          expect(await resolve(tx, null)).toBeNull();

          // Галочка «за замовчуванням» ловит то, что не легло по kind.
          await tx.cash_accounts.update({ where: { id: solo.id }, data: { is_default: true } });
          expect(await resolve(tx, null)).toBe(solo.id);
          expect(await resolve(tx, 'act')).toBe(solo.id); // act→bank: bank-счёта нет → дефолт

          throw new Error('__rollback__'); // весь сценарий — только внутри транзакции
        }),
      ).rejects.toThrow('__rollback__');

      // Откат отработал: наших временных счетов нет.
      const leftovers = await world.admin.cash_accounts.findMany({
        where: { name: { in: [`${world.prefix}solo`, `${world.prefix}card`] } },
      });
      expect(leftovers).toHaveLength(0);
    });
  });

  // ── 6. Выплата ЗП → авто-расход «Зарплата» → касса ─────────────────────────
  describe('зарплата → касса (0010)', () => {
    let payoutId: string;
    let autoExpenseId: string;

    it('payout создаёт системный расход фирмы по статье «Зарплата»', async () => {
      payoutId = await userDb(world.users.owner.id, async (tx) => {
        const t = await tx.payroll_transactions.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'payout',
            amount: 3000,
            occurred_on: new Date('2026-05-22'),
            comment: 'аванс',
            created_by: world.users.owner.id,
          },
          select: { id: true },
        });
        await tx.payout_allocations.create({
          data: {
            transaction_id: t.id,
            case_id: world.caseA,
            role_in_case: 'lawyer',
            amount: 3000,
          },
        });
        return t.id;
      });

      const auto = await world.admin.expenses.findMany({
        where: { payroll_transaction_id: payoutId },
        select: { id: true, case_id: true, category_id: true, amount: true },
      });
      expect(auto).toHaveLength(1);
      expect(auto[0]!.case_id).toBeNull(); // расход ФИРМЫ — в маржу дел не входит
      expect(auto[0]!.category_id).toBe(catSalary);
      expect(Number(auto[0]!.amount)).toBe(3000);
      autoExpenseId = auto[0]!.id;
    });

    it('авто-расход дошёл до кассы (если счёт по умолчанию есть в среде)', async () => {
      // Контракт: строка кассы есть ⟺ резолв со method NULL нашёл счёт.
      const resolved = await world.admin.$queryRaw<Array<{ id: string | null }>>`
        select private.cash_resolve_account(null::text) as id`;
      const entries = await world.admin.cash_entries.findMany({
        where: { expense_id: autoExpenseId },
        select: { direction: true, amount: true, account_id: true },
      });
      if (resolved[0]?.id) {
        expect(entries).toHaveLength(1);
        expect(entries[0]!.direction).toBe('out');
        expect(Number(entries[0]!.amount)).toBe(3000);
        expect(entries[0]!.account_id).toBe(resolved[0].id);
      } else {
        expect(entries).toHaveLength(0);
      }
    });

    it('системные строки руками не создаются и не удаляются (даже owner)', async () => {
      await expect(
        userDb(world.users.owner.id, (tx) =>
          tx.expenses.create({
            data: {
              case_id: null,
              category_id: catSalary,
              amount: 1,
              spent_at: new Date('2026-05-22'),
              created_by: world.users.owner.id,
              payroll_transaction_id: payoutId,
            },
          }),
        ),
      ).rejects.toThrow();

      const del = await userDb(world.users.owner.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: autoExpenseId } }),
      );
      expect(del.count).toBe(0);
    });

    it('удаление выплаты каскадом снимает расход и строку кассы', async () => {
      await userDb(world.users.owner.id, (tx) =>
        tx.payroll_transactions.deleteMany({ where: { id: payoutId } }),
      );
      expect(
        await world.admin.expenses.findMany({ where: { id: autoExpenseId } }),
      ).toHaveLength(0);
      expect(
        await world.admin.cash_entries.findMany({ where: { expense_id: autoExpenseId } }),
      ).toHaveLength(0);
    });

    it('премия (bonus) — начисление, расход не создаёт', async () => {
      const bonus = await userDb(world.users.owner.id, (tx) =>
        tx.payroll_transactions.create({
          data: {
            user_id: world.users.lawyer1.id,
            kind: 'bonus',
            amount: 500,
            occurred_on: new Date('2026-05-22'),
            created_by: world.users.owner.id,
          },
          select: { id: true },
        }),
      );
      expect(
        await world.admin.expenses.findMany({
          where: { payroll_transaction_id: bonus.id },
        }),
      ).toHaveLength(0);
      await world.admin.payroll_transactions.deleteMany({ where: { id: bonus.id } }); // cleanup
    });
  });

  // ── 7. Act-платёж: сумма/дата заморожены, счёт — правится ──────────────────
  describe('act-платёж (гард v3 + счёт 0016)', () => {
    let actPaymentId: string;

    it('акт подтверждает lawyer дела; платёж с act_id заморожен по amount', async () => {
      const actId = await userDb(world.users.expert1.id, async (tx) => {
        const act = await tx.case_acts.create({
          data: {
            case_id: world.caseA,
            amount: 2000,
            issued_at: new Date('2026-05-23'),
            created_by: world.users.expert1.id,
          },
          select: { id: true },
        });
        return act.id;
      });

      actPaymentId = await userDb(world.users.lawyer1.id, (tx) =>
        rpcConfirmActPaid(tx, {
          actId,
          confirmedAmount: 2000,
          paidAt: '2026-05-23',
          storageKey: `${world.prefix}act-scan.pdf`,
          fileName: 'act-scan.pdf',
          method: 'act',
          note: null,
        }),
      );

      await expect(
        userDb(world.users.owner.id, (tx) =>
          tx.payments.update({ where: { id: actPaymentId }, data: { amount: 1 } }),
        ),
      ).rejects.toThrow();
    });

    it('счёт у act-платежа сменить можно — приход переезжает', async () => {
      const upd = await userDb(world.users.owner.id, (tx) =>
        tx.payments.updateMany({
          where: { id: actPaymentId },
          data: { account_id: accA2 },
        }),
      );
      expect(upd.count).toBe(1);

      const entries = await world.admin.cash_entries.findMany({
        where: { payment_id: actPaymentId },
        select: { account_id: true, amount: true },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.account_id).toBe(accA2);
      expect(Number(entries[0]!.amount)).toBe(2000);
    });
  });

  // ── 8. Справочник счетов для форм (0016) ───────────────────────────────────
  describe('cash_accounts_pick: справочник без денег', () => {
    it('юрист без прав кассы получает список счетов (без остатков), таблица закрыта', async () => {
      // Прямой SELECT из cash_accounts юристу запрещён RLS.
      const direct = await userDb(world.users.lawyer2.id, (tx) =>
        tx.cash_accounts.findMany({ select: { id: true } }),
      );
      expect(direct).toHaveLength(0);

      // В среде без активных счетов справочнику нечего отдавать — обеспечим один.
      const anyActive = await world.admin.cash_accounts.findFirst({
        where: { is_active: true },
        select: { id: true },
      });
      let tempAccount: string | null = null;
      if (!anyActive) {
        tempAccount = await world.admin.cash_accounts
          .create({
            data: {
              name: `${world.prefix}pick`,
              kind: 'bank',
              opening_balance: 0,
              opening_date: new Date('2026-05-01'),
              created_by: world.users.owner.id,
            },
            select: { id: true },
          })
          .then((r) => r.id);
      }

      const picks = await userDb(world.users.lawyer2.id, (tx) => rpcCashAccountsPick(tx));
      expect(picks.length).toBeGreaterThan(0);
      // Только справочные поля — ни остатков, ни дат.
      for (const p of picks) {
        expect(Object.keys(p).sort()).toEqual(['id', 'is_default', 'kind', 'name']);
      }
      // Неактивные счета в справочник не попадают.
      expect(picks.map((p) => p.id)).not.toContain(accA1);

      if (tempAccount) {
        await world.admin.cash_accounts.deleteMany({ where: { id: tempAccount } });
      }
    });
  });

  // ── 9. Отчёты SECURITY INVOKER: RLS режет строки по зрителю ────────────────
  describe('finance_by_case / expenses_by_category под RLS', () => {
    let caseExpense: string;    // 600 по делу A (lawyer1)
    let companyExpense: string; // 700 фирменный (officeKyiv)

    beforeAll(async () => {
      caseExpense = (
        await userDb(world.users.lawyer1.id, (tx) =>
          tx.expenses.create({
            data: {
              case_id: world.caseA,
              category_id: catCourtFee,
              amount: 600,
              spent_at: new Date('2026-05-24'),
              created_by: world.users.lawyer1.id,
            },
            select: { id: true },
          }),
        )
      ).id;
      companyExpense = (
        await userDb(world.users.officeKyiv.id, (tx) =>
          tx.expenses.create({
            data: {
              case_id: null,
              category_id: catOffice,
              amount: 700,
              spent_at: new Date('2026-05-24'),
              created_by: world.users.officeKyiv.id,
            },
            select: { id: true },
          }),
        )
      ).id;
    });

    afterAll(async () => {
      await world.admin.expenses.deleteMany({
        where: { id: { in: [caseExpense, companyExpense] } },
      });
    });

    it('finance_by_case: lawyer1 видит маржу только своего дела', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) =>
        rpcFinanceByCase(tx, { from: null, to: null }),
      );
      const caseIds = rows.map((r) => r.case_id);
      expect(caseIds).toContain(world.caseA);
      expect(caseIds).not.toContain(world.caseB);

      const rowA = rows.find((r) => r.case_id === world.caseA)!;
      expect(rowA.expense).toBe(600);
      expect(rowA.margin).toBe(rowA.income - rowA.expense);
    });

    it('finance_by_case: у lawyer2 чужого дела в отчёте нет', async () => {
      const rows = await userDb(world.users.lawyer2.id, (tx) =>
        rpcFinanceByCase(tx, { from: null, to: null }),
      );
      expect(rows.map((r) => r.case_id)).not.toContain(world.caseA);
    });

    it('expenses_by_category: owner видит фирменную статью, юрист без прав — пусто', async () => {
      const ownerRows = await userDb(world.users.owner.id, (tx) =>
        rpcExpensesByCategory(tx, { from: null, to: null }),
      );
      const office = ownerRows.find((r) => r.category_id === catOffice);
      expect(office).toBeDefined();
      expect(office!.company_total).toBeGreaterThanOrEqual(700);

      // У lawyer2 нет ни view_case_expenses, ни прав кассы → RLS не отдаёт ему
      // НИ ОДНОЙ строки расходов, отчёт пуст.
      const lawyerRows = await userDb(world.users.lawyer2.id, (tx) =>
        rpcExpensesByCategory(tx, { from: null, to: null }),
      );
      expect(lawyerRows).toHaveLength(0);
    });
  });

  // ── 10. Конвертация «витрат»-платежей (/settings/expense-cleanup) ──────────
  // До 0009 траты заводили платежом «плюсом» — это завышало paid_total и ЗП.
  // Ядро convertPaymentsBatchAction: ОДНОЙ транзакцией создать расход с теми же
  // суммой/датой и удалить платёж; отказ на удалении валит всю пачку (нельзя
  // остаться с расходом-дублем при живом платеже). Здесь проверяем этот
  // транзакционный контракт на боевом пути userDb.
  describe('конвертация «витрата»-платежа в расход', () => {
    it('деньги дела и ЗП возвращаются к корректным; приход кассы уходит, расход появляется', async () => {
      const kyivAdmin = world.users.kyivAdmin.id;
      const before = (await world.admin.cases.findUniqueOrThrow({
        where: { id: world.caseA },
        select: { paid_total: true, debt: true },
      }))!;
      const payrollBefore = await userDb(kyivAdmin, (tx) =>
        rpcCasePayroll(tx, { caseId: world.caseA }),
      );

      // Старый «расход плюсом»: платёж 5000 с маркером «витрати».
      const fake = await userDb(kyivAdmin, (tx) =>
        tx.payments.create({
          data: {
            case_id: world.caseA,
            amount: 5000,
            paid_at: new Date('2026-05-25'),
            method: 'готівка',
            note: 'витрати',
            created_by: kyivAdmin,
          },
          select: { id: true },
        }),
      );
      const inflated = (await world.admin.cases.findUniqueOrThrow({
        where: { id: world.caseA },
        select: { paid_total: true },
      }))!;
      expect(Number(inflated.paid_total)).toBe(Number(before.paid_total) + 5000);

      // Конвертация (kyivAdmin: manage_case_expenses + delete_payments по роли).
      const expenseId = await userDb(kyivAdmin, async (tx) => {
        const created = await tx.expenses.create({
          data: {
            case_id: world.caseA,
            category_id: catCourtFee,
            amount: 5000,
            spent_at: new Date('2026-05-25'),
            method: 'cash',
            note: 'витрати',
            created_by: kyivAdmin,
          },
          select: { id: true },
        });
        const del = await tx.payments.deleteMany({ where: { id: fake.id } });
        if (del.count === 0) throw new Error('payment_delete_denied');
        return created.id;
      });

      // Деньги дела вернулись к исходным; ЗП-база — тоже.
      const after = (await world.admin.cases.findUniqueOrThrow({
        where: { id: world.caseA },
        select: { paid_total: true, debt: true },
      }))!;
      expect(Number(after.paid_total)).toBe(Number(before.paid_total));
      expect(Number(after.debt)).toBe(Number(before.debt));
      const payrollAfter = await userDb(kyivAdmin, (tx) =>
        rpcCasePayroll(tx, { caseId: world.caseA }),
      );
      expect(payrollAfter).toEqual(payrollBefore);

      // Касса: приходной строки платежа нет (каскад), расходная — по контракту
      // резолва (среда без счёта по умолчанию → расход без строки кассы).
      expect(
        await world.admin.cash_entries.findMany({ where: { payment_id: fake.id } }),
      ).toHaveLength(0);
      const resolved = await world.admin.$queryRaw<Array<{ id: string | null }>>`
        select private.cash_resolve_account('cash'::text) as id`;
      const outEntries = await world.admin.cash_entries.findMany({
        where: { expense_id: expenseId },
        select: { direction: true, amount: true },
      });
      if (resolved[0]?.id) {
        expect(outEntries).toHaveLength(1);
        expect(outEntries[0]!.direction).toBe('out');
        expect(Number(outEntries[0]!.amount)).toBe(5000);
      } else {
        expect(outEntries).toHaveLength(0);
      }

      await world.admin.expenses.deleteMany({ where: { id: expenseId } }); // cleanup
    });

    it('без delete_payments транзакция откатывается целиком — нет расхода-дубля при живом платеже', async () => {
      const officeKyiv = world.users.officeKyiv.id; // manage_case_expenses есть, delete_payments НЕТ
      const fake = await userDb(world.users.kyivAdmin.id, (tx) =>
        tx.payments.create({
          data: {
            case_id: world.caseA,
            amount: 3000,
            paid_at: new Date('2026-05-26'),
            note: 'витрати',
            created_by: world.users.kyivAdmin.id,
          },
          select: { id: true },
        }),
      );
      const expensesBefore = await world.admin.expenses.count({
        where: { case_id: world.caseA },
      });

      await expect(
        userDb(officeKyiv, async (tx) => {
          await tx.expenses.create({
            data: {
              case_id: world.caseA,
              category_id: catCourtFee,
              amount: 3000,
              spent_at: new Date('2026-05-26'),
              created_by: officeKyiv,
            },
          });
          const del = await tx.payments.deleteMany({ where: { id: fake.id } });
          if (del.count === 0) throw new Error('payment_delete_denied');
        }),
      ).rejects.toThrow('payment_delete_denied');

      // Платёж жив, расход-дубль НЕ создан (транзакция откатилась целиком).
      expect(
        await world.admin.payments.findMany({ where: { id: fake.id } }),
      ).toHaveLength(1);
      expect(
        await world.admin.expenses.count({ where: { case_id: world.caseA } }),
      ).toBe(expensesBefore);

      await world.admin.payments.deleteMany({ where: { id: fake.id } }); // cleanup
    });
  });

  // ── 11. Грант-матрица новых прав (0009: расходы — owner+admin; касса — owner) ─
  describe('выдача прав книги операций', () => {
    it('admin выдаёт права расходов, но НЕ права кассы; owner может и кассу', async () => {
      const kyivAdmin = world.users.kyivAdmin.id;
      const target = world.users.lawyer2.id;

      // admin → view_case_expenses: разрешено (выдают owner И admin).
      await userDb(kyivAdmin, (tx) =>
        tx.public_users.update({
          where: { id: target },
          data: { perm_overrides: { view_case_expenses: true } },
        }),
      );

      // admin → view_cash: owner-only грант (как can_manage_cash и ставки ЗП).
      await expect(
        userDb(kyivAdmin, (tx) =>
          tx.public_users.update({
            where: { id: target },
            data: { perm_overrides: { view_case_expenses: true, view_cash: true } },
          }),
        ),
      ).rejects.toThrow();

      // owner → view_cash: разрешено.
      await userDb(world.users.owner.id, (tx) =>
        tx.public_users.update({
          where: { id: target },
          data: { perm_overrides: { view_cash: true } },
        }),
      );

      // Гигиена: вернуть lawyer2 к дефолтам роли (admin-пул — системный путь).
      await world.admin.public_users.update({
        where: { id: target },
        data: { perm_overrides: {} },
      });
    });
  });

  // ── 12. Справочник статей расходов ─────────────────────────────────────────
  describe('expense_categories: чтение всем, запись manage_expense_categories', () => {
    it('юрист читает встроенные статьи, но не создаёт свои', async () => {
      const seen = await userDb(world.users.lawyer2.id, (tx) =>
        tx.expense_categories.findMany({
          where: { is_builtin: true },
          select: { id: true },
        }),
      );
      expect(seen.length).toBeGreaterThan(0);

      await expect(
        userDb(world.users.lawyer2.id, (tx) =>
          tx.expense_categories.create({
            data: { code: `${world.prefix}hack`, name: 'hack' },
          }),
        ),
      ).rejects.toThrow();
    });

    it('admin ведёт справочник: создание, scope под CHECK, удаление под FK restrict', async () => {
      const kyivAdmin = world.users.kyivAdmin.id;
      const cat = await userDb(kyivAdmin, (tx) =>
        tx.expense_categories.create({
          data: { code: `${world.prefix}cat`, name: 'Тестова стаття', scope: 'company' },
          select: { id: true },
        }),
      );

      // scope правится, но только на допустимые значения (CHECK case|company|both).
      await userDb(kyivAdmin, (tx) =>
        tx.expense_categories.update({ where: { id: cat.id }, data: { scope: 'case' } }),
      );
      await expect(
        userDb(kyivAdmin, (tx) =>
          tx.expense_categories.update({ where: { id: cat.id }, data: { scope: 'weird' } }),
        ),
      ).rejects.toThrow();

      // Статью с расходом удалить нельзя (FK restrict) — сначала расход.
      const exp = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.create({
          data: {
            case_id: null,
            category_id: cat.id,
            amount: 10,
            spent_at: new Date('2026-05-27'),
            created_by: world.users.officeKyiv.id,
          },
          select: { id: true },
        }),
      );
      await expect(
        userDb(kyivAdmin, (tx) =>
          tx.expense_categories.delete({ where: { id: cat.id } }),
        ),
      ).rejects.toThrow();

      await userDb(world.users.officeKyiv.id, (tx) =>
        tx.expenses.deleteMany({ where: { id: exp.id } }),
      );
      await userDb(kyivAdmin, (tx) =>
        tx.expense_categories.delete({ where: { id: cat.id } }),
      );
    });
  });
});
