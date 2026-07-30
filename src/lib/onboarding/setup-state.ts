import 'server-only';

import { userDb } from '@/lib/db';
import { CLEANUP_MARKERS } from '@/lib/expenses/cleanup-shared';
import type { EffectiveCaps } from '@/lib/types/db';

// =====================================================================
// Мастер настройки учёта (2026-07-30, требование владельца).
//
// Книга операций (миграции 0009–0016) работает только после трёх ручных
// действий: завести счета кассы, синхронизировать старые платежи и разобрать
// траты, которые до 0009 заводили платежом «плюсом». Пока это не сделано,
// цифры врут: оборотка неполная, «оплачено» завышено, а вместе с ним и
// зарплата (её база = paid_total).
//
// Здесь считается, ЧТО ИМЕННО осталось сделать — по данным, а не по таймеру.
// Владелец доводит настройку до конца → шаги закрываются сами, модалка и
// плашка исчезают без выкатки кода.
//
// Стоимость: максимум два SELECT'а в одной транзакции, и только для тех, у
// кого есть права что-то из этого сделать. Функция вызывается из layout'а
// (то есть на каждой навигации), поэтому тяжёлые выборки здесь недопустимы —
// только count'ы.
// =====================================================================

export type SetupStepId = 'accounts' | 'sync' | 'cleanup';

export type SetupStep = {
  id: SetupStepId;
  done: boolean;
  /**
   * Сколько осталось разобрать/синхронизировать — показывается в тексте шага.
   * Для 'accounts' это число счетов с «датой по умолчанию» (см. ниже).
   */
  count: number;
  /** Куда ведёт кнопка шага. */
  href: string;
  /**
   * Шаг нельзя выполнить прямо сейчас — не сделан предыдущий. Пока нет ни
   * одного счёта, синхронизировать платежи некуда (cash_resolve_account
   * вернёт NULL и бэкфилл создаст 0 строк).
   */
  blocked?: boolean;
};

export type AccountingSetupState = {
  /** Только шаги, доступные этому пользователю по правам. */
  steps: SetupStep[];
  doneCount: number;
  totalCount: number;
  /** true — показывать нечего (всё сделано либо прав нет). */
  allDone: boolean;
};

const EMPTY: AccountingSetupState = {
  steps: [],
  doneCount: 0,
  totalCount: 0,
  allDone: true,
};

type CashRow = {
  accounts_active: number;
  accounts_stale_date: number;
  unsynced: number;
};

type CleanupRow = { cleanup: number };

// ILIKE-шаблоны маркеров «витрати» — те же слова, по которым ищет
// /settings/expense-cleanup (cleanup.ts). Здесь нужен только COUNT, поэтому
// считаем на стороне БД, а не тянем строки.
const MARKER_PATTERNS = CLEANUP_MARKERS.map((m) => `%${m}%`);

export async function getAccountingSetupState(
  userId: string,
  caps: EffectiveCaps,
): Promise<AccountingSetupState> {
  // Счета и синхронизация — право кассы; разбор трат — оба права сразу
  // (вносить расходы И удалять платежи), как на самой странице разбора.
  const canCash = caps.can_manage_cash;
  const canCleanup = caps.manage_case_expenses && caps.delete_payments;
  if (!canCash && !canCleanup) return EMPTY;

  let cash: CashRow = { accounts_active: 0, accounts_stale_date: 0, unsynced: 0 };
  let cleanup = 0;

  try {
    await userDb(userId, async (tx) => {
      if (canCash) {
        // opening_date NOT NULL с дефолтом CURRENT_DATE, поэтому «не задана» не
        // бывает. Ищем другое: дата осталась равной дню создания счёта и это не
        // первое число — почти наверняка человек пролистал поле, и месяц
        // посчитается наполовину (ровно жалоба владельца по счёту «Моно»).
        const rows = await tx.$queryRaw<CashRow[]>`
          select
            (select count(*)::int
               from public.cash_accounts
              where is_active) as accounts_active,
            (select count(*)::int
               from public.cash_accounts
              where is_active
                and opening_date = (created_at at time zone 'Europe/Kyiv')::date
                and extract(day from opening_date) <> 1) as accounts_stale_date,
            public.cash_unsynced_payments_count() as unsynced`;
        if (rows[0]) cash = rows[0];
      }

      if (canCleanup) {
        const rows = await tx.$queryRaw<CleanupRow[]>`
          select count(*)::int as cleanup
            from public.payments p
           where p.note ilike any(${MARKER_PATTERNS}::text[])
              or p.method ilike any(${MARKER_PATTERNS}::text[])`;
        cleanup = rows[0]?.cleanup ?? 0;
      }
    });
  } catch (err) {
    // Мастер — подсказка, а не функциональность: упавший счётчик не должен
    // ронять весь app-shell. Молча прячем шаги до следующей навигации.
    console.error('getAccountingSetupState failed:', err);
    return EMPTY;
  }

  const steps: SetupStep[] = [];

  if (canCash) {
    steps.push({
      id: 'accounts',
      // Готово = есть хотя бы один активный счёт и ни у одного не осталась
      // дата создания вместо даты начального остатка.
      done: cash.accounts_active > 0 && cash.accounts_stale_date === 0,
      count: cash.accounts_stale_date,
      href: '/reports/cash',
    });
    steps.push({
      id: 'sync',
      done: cash.unsynced === 0,
      count: cash.unsynced,
      href: '/reports/cash',
      blocked: cash.accounts_active === 0,
    });
  }

  if (canCleanup) {
    steps.push({
      id: 'cleanup',
      done: cleanup === 0,
      count: cleanup,
      href: '/settings/expense-cleanup',
    });
  }

  const doneCount = steps.filter((s) => s.done).length;

  return {
    steps,
    doneCount,
    totalCount: steps.length,
    allDone: doneCount === steps.length,
  };
}
