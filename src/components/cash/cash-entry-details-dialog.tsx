'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Pencil,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import { cn, formatMoney } from '@/lib/utils';
import {
  deleteCashEntryAction,
  loadCashEntryDetailsAction,
  setCashEntryIncludedAction,
  shiftAccountOpeningDateAction,
} from '@/lib/cash/actions';
import type { CashEntryDetails } from '@/lib/cash/queries';
import type { CashAccount, CashEntryWithCase } from '@/lib/types/db';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import { ExpenseEditForm } from '@/components/expenses/expense-edit-form';
import { PaymentEditForm } from '@/components/payments/payment-edit-form';

import { CashEntryEditForm } from './cash-entry-edit-form';

// Карточка операции кассы (2026-08-04, жалоба клиента: строки журнала были
// «мёртвыми» — ни подробностей, ни правки).
//
// Строка журнала бывает трёх видов, и правка у каждого своя:
//   • ручная операция      → форма кассы (CashEntryEditForm);
//   • приход от платежа    → форма платежа (право edit_payments);
//   • розхід от расхода    → форма расхода (0019).
// Детали тянем ЛЕНИВО: журнал бывает на тысячи строк, а автор и статья нужны
// только той, что открыли.
export function CashEntryDetailsDialog({
  entry,
  open,
  onClose,
  canManage,
  canEditPayments,
  canManageCaseExpenses,
  accounts,
  categories,
  /** Остаток счёта после операции; undefined — операция в сальдо не входит. */
  balance,
}: {
  entry: CashEntryWithCase;
  open: boolean;
  onClose: () => void;
  /** Право can_manage_cash: правка ручных операций, расходов фирмы, «внести в оборот». */
  canManage: boolean;
  /** Право edit_payments: правка платежа-источника. */
  canEditPayments: boolean;
  /** Право manage_case_expenses: правка расхода ПО ДЕЛУ. */
  canManageCaseExpenses: boolean;
  accounts: ReadonlyArray<CashAccount>;
  /** Активные статьи расходов (все области применения). */
  categories: ExpenseCategoryOption[];
  balance?: number;
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [details, setDetails] = useState<CashEntryDetails | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [editing, setEditing] = useState(false);
  const [busy, startBusy] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement>(null);

  // Детали грузим при монтировании — карточка живёт ровно столько, сколько
  // открыта (родитель монтирует её по клику). Так после правки платежа или
  // расхода следующее открытие покажет свежие цифры, а не кэш.
  //
  // Сбой загрузки показываем явно: без этого карточка вечно висела в «Загрузка»,
  // кнопка правки оставалась выключенной, а предупреждение об отсечённой дате
  // молча исчезало (openingDate неизвестен) — то есть экран врал бы о деньгах.
  useEffect(() => {
    startLoading(async () => {
      try {
        const res = await loadCashEntryDetailsAction(entry.id);
        setDetails(res);
        setFailed(res === null);
      } catch {
        setFailed(true);
      }
    });
  }, [entry.id]);

  const close = useCallback(() => {
    setEditing(false);
    onClose();
  }, [onClose]);

  // Страница отрисована раньше, чем открыли карточку: за это время строку могли
  // поправить. Показываем СВЕЖЕЕ, как только оно пришло, — иначе шапка врала бы
  // суммой, а форма отправила бы устаревшие поля поверх чужой правки.
  const row = details?.entry ?? entry;
  const isIn = row.direction === 'in';
  const isAuto = row.payment_id !== null || row.expense_id !== null;
  const payment = details?.payment ?? null;
  const expense = details?.expense ?? null;
  // Расход-зеркало выплаты ЗП правится только через саму выплату.
  const expenseLocked = expense?.payroll_transaction_id != null;

  // Операция отсечена датой начального остатка: в журнале есть, в оборотах нет.
  const openingDate = details?.accountOpeningDate;
  const cutOff =
    openingDate !== undefined &&
    row.entry_date < openingDate &&
    !row.include_before_opening;

  // Право на правку считаем по ИСТОЧНИКУ строки и по тем же ветвям, что и
  // сервер (updateExpenseAction: расход по делу — manage_case_expenses, расход
  // фирмы — can_manage_cash). Иначе смотрящий с view_cash получал бы кнопку
  // «Редактировать», заполненную форму и отказ на сохранении.
  const canEditExpense =
    expense !== null &&
    !expenseLocked &&
    (expense.case_id ? canManageCaseExpenses : canManage);
  const canEditThis = isAuto
    ? payment
      ? canEditPayments
      : canEditExpense
    : canManage;

  const setIncluded = (value: boolean) =>
    startBusy(async () => {
      const res = await setCashEntryIncludedAction(entry.id, value);
      if (res.ok) {
        toast.success(res.message ?? t.cash.actions.included);
        close();
      } else {
        toast.error(res.message ?? t.errors.db.generic);
      }
    });

  const shiftOpening = () =>
    startBusy(async () => {
      const res = await shiftAccountOpeningDateAction(row.account_id, row.entry_date);
      if (res.ok) {
        toast.success(res.message ?? t.cash.actions.openingDateMoved);
        close();
      } else {
        toast.error(res.message ?? t.errors.db.generic);
      }
    });

  const sourceLabel = payment
    ? t.cash.details.sourcePayment
    : expense
      ? expense.case_id
        ? t.cash.details.sourceCaseExpense
        : t.cash.details.sourceCompanyExpense
      : isAuto
        ? t.cash.details.sourceAutoUnknown
        : t.cash.details.sourceManual;

  return (
    <Modal
      open={open}
      onClose={close}
      title={t.cash.details.title}
      closeLabel={t.common.close}
      className="w-[min(620px,95vw)]"
    >
      {/* Шапка: направление, сумма, дата, счёт — то, ради чего строку открыли. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-4">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold',
            isIn ? 'bg-success-bg text-success-text' : 'bg-error-bg text-error-text',
          )}
        >
          {isIn ? (
            <ArrowDownLeft size={11} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <ArrowUpRight size={11} strokeWidth={2.5} aria-hidden="true" />
          )}
          {isIn ? t.cash.report.colInflow : t.cash.report.colOutflow}
        </span>
        <span
          className={cn(
            'font-mono text-[22px] font-bold leading-none tabular-nums',
            isIn ? 'text-success-text' : 'text-error',
          )}
        >
          {isIn ? '+' : '−'}
          {formatMoney(row.amount)} ₴
        </span>
        <span className="ml-auto font-mono text-[13px] tabular-nums text-text-muted">
          {row.entry_date}
        </span>
      </div>

      {editing && details ? (
        <div className="pt-4">
          {payment && canEditPayments ? (
            <PaymentEditForm
              payment={payment}
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                kind: a.kind,
                is_default: a.is_default,
              }))}
              onSuccess={close}
            />
          ) : canEditExpense && expense ? (
            <ExpenseEditForm
              expense={expense}
              categories={categories}
              accounts={accounts}
              onSuccess={close}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <CashEntryEditForm
              entry={row}
              accounts={accounts}
              onSuccess={close}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
      ) : (
        <>
          {failed && (
            <p
              role="alert"
              className="mt-3 rounded-control border border-error/20 bg-error-bg px-3 py-2 text-[12.5px] leading-snug text-error-text"
            >
              {t.cash.details.loadFailed}
            </p>
          )}
          <dl className="flex flex-col divide-y divide-border/60 pt-1">
            <Row label={t.cash.details.description} value={row.description} />
            {expense && (
              <Row label={t.expenses.form.categoryLabel} value={expense.category.label} />
            )}
            {expense?.note && (
              <Row label={t.cash.details.note} value={expense.note} />
            )}
            {payment?.note && <Row label={t.cash.details.note} value={payment.note} />}
            {payment?.client_name && (
              <Row label={t.cash.details.client} value={payment.client_name} />
            )}
            {row.case && (
              <Row
                label={t.cash.details.case}
                value={
                  <Link
                    href={`/cases/${row.case.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {row.case.number_title}
                  </Link>
                }
              />
            )}
            <Row
              label={t.cash.details.account}
              value={details?.entry.account_name ?? accountName(accounts, row.account_id)}
            />
            <Row
              label={t.cash.details.balanceAfter}
              value={
                balance === undefined ? (
                  <span className="text-text-subtle">{t.cash.details.notCounted}</span>
                ) : (
                  <span className="font-mono tabular-nums">{formatMoney(balance)} ₴</span>
                )
              }
            />
            <Row label={t.cash.details.source} value={sourceLabel} />
            <Row
              label={t.cash.details.createdBy}
              value={
                loading && !details ? (
                  <span className="text-text-subtle">{t.common.loading}</span>
                ) : (
                  [details?.entry.creator?.full_name, details?.entry.created_at?.slice(0, 16).replace('T', ' ')]
                    .filter(Boolean)
                    .join(' · ') || '—'
                )
              }
            />
          </dl>

          {/* Операция раньше даты начального остатка счёта — три законных
              исхода, и все три отсюда доступны (владелец, 2026-08-04). */}
          {cutOff && canManage && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-3">
              <p className="flex items-start gap-2 text-[12.5px] leading-snug text-text">
                <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
                <span>{fmt(t.cash.details.cutOffExplain, { date: openingDate! })}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setIncluded(true)}>
                  {t.cash.details.includeAction}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={shiftOpening}>
                  <CalendarClock size={14} strokeWidth={1.75} />
                  {fmt(t.cash.details.shiftOpeningAction, { date: row.entry_date })}
                </Button>
              </div>
              <p className="text-[11.5px] leading-snug text-text-muted">
                {t.cash.details.cutOffHint}
              </p>
            </div>
          )}

          {/* Уже внесённую вручную операцию можно вернуть к общему правилу. */}
          {row.include_before_opening && canManage && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5">
              <span className="text-[12.5px] text-text-muted">
                {t.cash.details.includedNote}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setIncluded(false)}>
                {t.cash.details.excludeAction}
              </Button>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {canEditThis && (
              <Button size="sm" onClick={() => setEditing(true)} disabled={loading || !details}>
                <Pencil size={14} strokeWidth={1.75} />
                {t.common.edit}
              </Button>
            )}
            {/* Удалять из кассы можно только ручную операцию: за авто-строкой
                стоит платёж или расход, они удаляются у себя. */}
            {canManage && !isAuto && (
              <form ref={deleteFormRef} action={deleteCashEntryAction}>
                <input type="hidden" name="id" value={entry.id} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  className="text-error hover:bg-error-bg"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                  {t.common.delete}
                </Button>
              </form>
            )}
            {isAuto && !canEditThis && (
              <p className="text-[12px] text-text-subtle">
                {expenseLocked ? t.cash.details.payrollHint : t.cash.details.autoHint}
              </p>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t.common.confirmTitle}
        description={t.cash.entry.deleteConfirm}
        confirmLabel={t.common.delete}
        tone="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          deleteFormRef.current?.requestSubmit();
          close();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}

function accountName(
  accounts: ReadonlyArray<CashAccount>,
  id: string,
): string {
  return accounts.find((a) => a.id === id)?.name ?? '—';
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-[12px] text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-text">{value}</dd>
    </div>
  );
}
