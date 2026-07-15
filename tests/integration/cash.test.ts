import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasDbEnv,
  createWorld,
  destroyWorld,
  userDb,
  type World,
} from '../helpers/fixtures';
import { rpcConfirmActPaid } from '@/lib/db/rpc';

// Интеграционные тесты кассы (v2 Этап 7). Доступ — по праву can_manage_cash
// (по умолчанию только owner; выдаёт точечно тоже только owner). Проверяем:
//   • видимость счетов/операций по cap (owner и обладатель права — да; юрист — нет);
//   • АВТОПРИХОД: платёж по делу (method='bank') создаёт cash_entries(in) на счёт,
//     удаление платежа снимает строку (FK cascade);
//   • ручные операции: пишет/удаляет только cash-manager, payment_id обязан быть NULL,
//     авто-приход (payment_id NOT NULL) пользователю на UPDATE/DELETE не отдаётся;
//   • выдача права can_manage_cash — только владельцем (owner-only грант).

const suite = hasDbEnv ? describe : describe.skip;

if (!hasDbEnv) {
  console.warn('[integration:cash] Пропущено: нет DATABASE_URL_* в .env.local.');
}

suite('Юр CRM — касса (RLS Этап 7)', () => {
  let world: World;
  let bankAccountId: string;

  beforeAll(async () => {
    world = await createWorld();

    // Выдаём office_manager (Київ) право управлять кассой (admin-пул, auth.uid() IS NULL
    // в триггере guard_perm_overrides_change → «системный путь», гвард не мешает).
    await world.admin.public_users.update({
      where: { id: world.users.officeKyiv.id },
      data: { perm_overrides: { can_manage_cash: true } },
    });

    // Счёт «банк» (kind='bank') — method='bank'/'act' автоприхода ляжет на него.
    // БД общая (Neon dev): уже засеян дефолтный bank-счёт («Рахунок...», is_default=true) —
    // private.cash_resolve_account сортирует is_default DESC, поэтому он ВСЕГДА выигрывает
    // тай-брейк у любого нашего non-default счёта того же kind. Переиспользуем то, что
    // реально резолвится (не трогая/не создавая дублей), заводим свой ТОЛЬКО если в этой
    // среде вообще нет активного bank-счёта (пустая БД, напр. другая ветка/CI).
    const existingBank = await world.admin.cash_accounts.findFirst({
      where: { kind: 'bank', is_active: true },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      select: { id: true },
    });
    if (existingBank) {
      bankAccountId = existingBank.id;
    } else {
      const acc = await world.admin.cash_accounts.create({
        data: {
          name: `${world.prefix}bank`,
          kind: 'bank',
          opening_balance: 1000,
          opening_date: new Date('2026-05-01'),
          is_default: false,
          created_by: world.users.owner.id,
        },
        select: { id: true },
      });
      bankAccountId = acc.id;
    }
  });

  afterAll(async () => {
    if (world) await destroyWorld(world);
  });

  // ── Видимость по праву (SELECT) ───────────────────────────────────
  describe('видимость по can_manage_cash', () => {
    it('owner видит счёт кассы', async () => {
      const rows = await userDb(world.users.owner.id, (tx) =>
        tx.cash_accounts.findMany({ where: { id: bankAccountId }, select: { id: true } }),
      );
      expect(rows).toHaveLength(1);
    });

    it('обладатель права (office_manager+cap) видит счёт', async () => {
      const rows = await userDb(world.users.officeKyiv.id, (tx) =>
        tx.cash_accounts.findMany({ where: { id: bankAccountId }, select: { id: true } }),
      );
      expect(rows).toHaveLength(1);
    });

    it('юрист без права НЕ видит счета', async () => {
      const rows = await userDb(world.users.lawyer1.id, (tx) =>
        tx.cash_accounts.findMany({ where: { id: bankAccountId }, select: { id: true } }),
      );
      expect(rows).toHaveLength(0);
    });

    it('юрист без права НЕ может завести счёт', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.cash_accounts.create({
            data: {
              name: `${world.prefix}hack`,
              kind: 'cash',
              opening_balance: 0,
              opening_date: new Date('2026-05-01'),
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ── Автоприход платежа ────────────────────────────────────────────
  describe('автоприход платежа по делу', () => {
    it('платёж method=bank создаёт cash_entries(in) на счёт; удаление платежа снимает строку', async () => {
      // Юрист дела A вносит платёж (его сессия; can_write_case(A) = true).
      const paymentId = await userDb(world.users.lawyer1.id, async (tx) => {
        const pay = await tx.payments.create({
          data: {
            case_id: world.caseA,
            amount: 1234.5,
            paid_at: new Date('2026-05-12'),
            method: 'bank',
            note: `${world.prefix}auto`,
            created_by: world.users.lawyer1.id,
          },
          select: { id: true },
        });
        return pay.id;
      });

      // Авто-строка кассы (читаем admin-пулом — мимо RLS).
      const entries = await world.admin.cash_entries.findMany({
        where: { payment_id: paymentId },
        select: {
          account_id: true,
          direction: true,
          amount: true,
          payment_id: true,
          created_by: true,
        },
      });
      expect(entries).toHaveLength(1);
      const e = entries[0]!;
      expect(e.account_id).toBe(bankAccountId);
      expect(e.direction).toBe('in');
      expect(Number(e.amount)).toBe(1234.5);
      expect(e.created_by).toBe(world.users.lawyer1.id);

      // Удаляем платёж (owner — can edit_payments) → строка кассы исчезает (FK cascade).
      await userDb(world.users.owner.id, (tx) =>
        tx.payments.delete({ where: { id: paymentId } }),
      );
      const after = await world.admin.cash_entries.findMany({
        where: { payment_id: paymentId },
        select: { id: true },
      });
      expect(after).toHaveLength(0);
    });

    it('подтверждение акта (method=act) создаёт авто-приход на банковский счёт', async () => {
      // Експерт дела A выписывает акт (responsible_id), owner подтверждает оплату —
      // confirm_act_paid создаёт payment с method='act' → триггер кладёт приход на bank.
      const actId = await userDb(world.users.expert1.id, async (tx) => {
        const act = await tx.case_acts.create({
          data: {
            case_id: world.caseA,
            amount: 2000,
            issued_at: new Date('2026-05-20'),
            created_by: world.users.expert1.id,
          },
          select: { id: true },
        });
        return act.id;
      });

      const paymentId = await userDb(world.users.owner.id, (tx) =>
        rpcConfirmActPaid(tx, {
          actId,
          confirmedAmount: 2000,
          paidAt: '2026-05-20',
          storageKey: `${world.prefix}scan.pdf`,
          fileName: 'scan.pdf',
          method: 'act',
          note: null,
        }),
      );

      const entries = await world.admin.cash_entries.findMany({
        where: { payment_id: paymentId },
        select: { account_id: true, direction: true, amount: true },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.account_id).toBe(bankAccountId);
      expect(entries[0]!.direction).toBe('in');
      expect(Number(entries[0]!.amount)).toBe(2000);

      // Чистим платёж явно: иначе destroyWorld (case_acts до payments) упал бы —
      // при удалении акта FK payments.act_id→case_acts (ON DELETE SET NULL) обнулял бы
      // act_id оплаченного платежа, а это как раз запрещает payments_guard_act_payment.
      // BEFORE DELETE-триггер case_acts_revert_on_payment_delete сначала вернёт акт в
      // issued (act_id снят и там), только потом удаляем сам платёж — без конфликта.
      await world.admin.payments.delete({ where: { id: paymentId } });
    });
  });

  // ── Ручные операции ───────────────────────────────────────────────
  describe('ручные операции', () => {
    it('cash-manager вносит ручную операцию (payment_id NULL)', async () => {
      await userDb(world.users.officeKyiv.id, (tx) =>
        tx.cash_entries.create({
          data: {
            account_id: bankAccountId,
            entry_date: new Date('2026-05-13'),
            direction: 'out',
            amount: 500,
            description: `${world.prefix}rent`,
            created_by: world.users.officeKyiv.id,
          },
        }),
      );
    });

    it('юрист без права НЕ может внести операцию', async () => {
      await expect(
        userDb(world.users.lawyer1.id, (tx) =>
          tx.cash_entries.create({
            data: {
              account_id: bankAccountId,
              entry_date: new Date('2026-05-13'),
              direction: 'out',
              amount: 100,
              description: `${world.prefix}hack`,
              created_by: world.users.lawyer1.id,
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('cash-manager НЕ может подсунуть payment_id вручную (with_check payment_id IS NULL)', async () => {
      // Заведём настоящий платёж (admin-пул), чтобы payment_id ссылался на существующую строку.
      const pay = await world.admin.payments.create({
        data: {
          case_id: world.caseA,
          amount: 10,
          paid_at: new Date('2026-05-14'),
          method: 'card',
          note: `${world.prefix}fk`,
          created_by: world.users.owner.id,
        },
        select: { id: true },
      });

      await expect(
        userDb(world.users.officeKyiv.id, (tx) =>
          tx.cash_entries.create({
            data: {
              account_id: bankAccountId,
              entry_date: new Date('2026-05-14'),
              direction: 'in',
              amount: 10,
              description: `${world.prefix}spoof`,
              payment_id: pay.id,
              created_by: world.users.officeKyiv.id,
            },
          }),
        ),
      ).rejects.toThrow();

      await world.admin.payments.delete({ where: { id: pay.id } });
    });

    it('cash-manager НЕ может удалить авто-приход (payment_id NOT NULL) — no-op', async () => {
      // Создаём авто-приход через платёж (admin-пул).
      const pay = await world.admin.payments.create({
        data: {
          case_id: world.caseA,
          amount: 77,
          paid_at: new Date('2026-05-15'),
          method: 'bank',
          note: `${world.prefix}auto2`,
          created_by: world.users.owner.id,
        },
        select: { id: true },
      });
      const paymentId = pay.id;

      // RLS не пустил (USING payment_id IS NULL гейт скрывает строку) → Prisma кидает
      // (P2025 — «запись для delete не найдена», т.к. строка невидима под RLS); авто-строка цела.
      await expect(
        userDb(world.users.officeKyiv.id, (tx) =>
          tx.cash_entries.delete({ where: { payment_id: paymentId } }),
        ),
      ).rejects.toThrow();

      const still = await world.admin.cash_entries.findMany({
        where: { payment_id: paymentId },
        select: { id: true },
      });
      expect(still).toHaveLength(1);

      await world.admin.payments.delete({ where: { id: paymentId } }); // чистим (cascade)
    });

    it('cash-manager удаляет свою ручную операцию', async () => {
      const insId = await userDb(world.users.officeKyiv.id, async (tx) => {
        const ins = await tx.cash_entries.create({
          data: {
            account_id: bankAccountId,
            entry_date: new Date('2026-05-16'),
            direction: 'out',
            amount: 42,
            description: `${world.prefix}del-manual`,
            created_by: world.users.officeKyiv.id,
          },
          select: { id: true },
        });
        await tx.cash_entries.delete({ where: { id: ins.id } });
        return ins.id;
      });

      const after = await world.admin.cash_entries.findMany({
        where: { id: insId },
        select: { id: true },
      });
      expect(after).toHaveLength(0);
    });
  });

  // ── Выдача права can_manage_cash — только владелец ────────────────
  describe('грант права can_manage_cash', () => {
    it('admin (manage_users) НЕ может выдать can_manage_cash юристу', async () => {
      await expect(
        userDb(world.users.kyivAdmin.id, (tx) =>
          tx.public_users.update({
            where: { id: world.users.lawyer1.id },
            data: { perm_overrides: { can_manage_cash: true } },
          }),
        ),
      ).rejects.toThrow(); // guard_perm_overrides_change → can_grant_cap=false
    });

    it('owner выдаёт can_manage_cash', async () => {
      await userDb(world.users.owner.id, (tx) =>
        tx.public_users.update({
          where: { id: world.users.expert2.id },
          data: { perm_overrides: { can_manage_cash: true } },
        }),
      );
    });
  });
});
