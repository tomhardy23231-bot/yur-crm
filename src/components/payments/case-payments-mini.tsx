import { Trash2 } from 'lucide-react';

import { AddPaymentDialog } from '@/components/payments/add-payment-dialog';
import { getT } from '@/lib/i18n/server';
import { deletePaymentAction } from '@/lib/payments/actions';
import { listPaymentsByCase } from '@/lib/payments/queries';
import { formatMoney } from '@/lib/utils';

interface Props {
  caseId: string;
  /** Может ли добавлять платёж (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Может ли удалять платёж (RLS DELETE = staff). */
  canManage: boolean;
  /** Переплата клиента (max(0, paid_total − contract_sum)). Показываем, если > 0. */
  overpaid?: number;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Компактный список платежей по делу — для колонки «Оплата и суд» в шапке.
// Заменяет отдельную нижнюю секцию: список + итог + добавление в одном месте.
// Серверный компонент: удаление — через server action (form), добавление —
// клиентская модалка AddPaymentDialog. Экшены делают revalidatePath, поэтому
// суммы шапки и «Вознаграждение команды» обновляются сами.
export async function CasePaymentsMini({
  caseId,
  canWrite,
  canManage,
  overpaid = 0,
}: Props) {
  const { t, fmt, plural } = await getT();
  const b = t.payments.block;
  const payments = await listPaymentsByCase(caseId);
  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="mt-4 border-t border-border pt-3">
      {/* Заголовок: «Платежи · N» + итог. */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-text-muted">
          {b.heading}
          <span className="ml-1.5 text-text-subtle">
            {payments.length}
          </span>
        </span>
        {payments.length > 0 && (
          <span className="text-[12px] tabular-nums text-text-muted">
            {b.total}{' '}
            <span className="font-bold text-success">{formatMoney(total)} ₴</span>
          </span>
        )}
      </div>

      {overpaid > 0 && (
        <p
          className="mb-2 inline-flex rounded-full bg-info-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-info"
          title={b.overpaidTitle}
        >
          {fmt(b.overpaid, { amount: formatMoney(overpaid) })}
        </p>
      )}

      {payments.length === 0 ? (
        <p className="mb-2.5 text-[12px] text-text-subtle">
          {canWrite ? b.emptyCanWrite : b.empty}
        </p>
      ) : (
        // Высоту списка ограничиваем — при многих платежах он скроллится внутри
        // (тонкий глобальный скроллбар), а не растягивает шапку вниз. Шапка
        // «Платежи · разом» и кнопка добавления остаются на месте.
        <ul className="mb-3 max-h-60 overflow-y-auto pr-1">
          {payments.map((p) => (
            <li
              key={p.id}
              className="group flex items-center gap-2 border-b border-border py-1.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold tabular-nums text-success">
                    {formatMoney(p.amount)} ₴
                  </span>
                  <span className="text-[11.5px] tabular-nums text-text-subtle">
                    {DATE_FMT.format(new Date(p.paid_at + 'T00:00:00Z'))}
                  </span>
                </div>
                {(p.method || p.note) && (
                  <p className="truncate text-[11.5px] text-text-muted">
                    {[p.method, p.note].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {canManage && (
                <form action={deletePaymentAction} className="shrink-0">
                  <input type="hidden" name="payment_id" value={p.id} />
                  <input type="hidden" name="case_id" value={p.case_id} />
                  <button
                    type="submit"
                    aria-label={t.payments.row.deleteLabel}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-error-bg hover:text-error focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && <AddPaymentDialog caseId={caseId} />}
    </div>
  );
}
