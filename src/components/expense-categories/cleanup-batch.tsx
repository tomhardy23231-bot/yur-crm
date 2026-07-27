'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import {
  convertPaymentsBatchAction,
  type BatchConvertState,
} from '@/lib/expenses/cleanup-actions';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import type { CleanupCandidate } from '@/lib/expenses/cleanup';
import { formatMoney } from '@/lib/utils';

const INITIAL: BatchConvertState = { ok: false };

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Массовый разбор исторических «расходов, заведённых платежом». Записей больше
// сотни, поэтому основной сценарий — отметить все однозначные и перевести одной
// кнопкой. Сомнительные (маркер внутри длинного текста) галочкой «отметить все»
// НЕ захватываются: среди них нашлась настоящая оплата на 70 000 ₴.
export function CleanupBatch({
  candidates,
  categories,
}: {
  candidates: CleanupCandidate[];
  categories: ExpenseCategoryOption[];
}) {
  const { t, fmt } = useI18n();
  const c = t.expenseCleanup;
  const toast = useToast();

  const [state, formAction, isPending] = useActionState<BatchConvertState, FormData>(
    convertPaymentsBatchAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  // Изначально отмечены все однозначные — самый частый выбор.
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(candidates.filter((p) => p.exact).map((p) => p.payment_id)),
  );

  const selected = useMemo(
    () => candidates.filter((p) => checked.has(p.payment_id)),
    [candidates, checked],
  );
  const selectedSum = selected.reduce((s, p) => s + p.amount, 0);

  useEffect(() => {
    if (state.ok && state.converted) {
      toast.success(fmt(c.batch.done, { n: String(state.converted) }));
    }
  }, [state.ok, state.converted, toast, fmt, c.batch.done]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {/* Панель действия — липкая, чтобы кнопка была под рукой при длинном списке. */}
      <Card className="sticky top-2 z-10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setChecked(
                new Set(candidates.filter((p) => p.exact).map((p) => p.payment_id)),
              )
            }
          >
            {c.batch.selectAllExact}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setChecked(new Set())}
          >
            {c.batch.clearAll}
          </Button>

          <span className="ml-auto text-[13px] text-text-muted">
            {selected.length > 0
              ? fmt(c.batch.selected, {
                  n: String(selected.length),
                  sum: formatMoney(selectedSum),
                })
              : c.batch.nothingSelected}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-muted">{c.categoryLabel}</span>
            <Select
              name="category_id"
              defaultValue={categories[0]?.id ?? ''}
              required
              className="w-[220px]"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </Select>
          </label>

          <Button
            type="button"
            size="sm"
            disabled={isPending || selected.length === 0}
            onClick={() => setConfirming(true)}
          >
            <ArrowRightLeft size={14} strokeWidth={2} />
            {isPending ? c.batch.submitting : c.batch.submit}
          </Button>
        </div>

        <p className="mt-2 text-[11.5px] text-text-subtle">{c.batch.skipHint}</p>

        {state.message && !state.ok && (
          <p className="mt-2 text-[12px] text-error" role="alert">
            {state.message}
          </p>
        )}
      </Card>

      {/* Отмеченные уходят на сервер скрытыми полями — набор задаёт клиент. */}
      {selected.map((p) => (
        <input key={p.payment_id} type="hidden" name="payment_ids" value={p.payment_id} />
      ))}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {candidates.map((p) => {
            const on = checked.has(p.payment_id);
            return (
              <li
                key={p.payment_id}
                className={`flex items-start gap-3 px-4 py-3 ${on ? '' : 'opacity-60'}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p.payment_id)}
                  aria-label={p.case_number_title}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/cases/${p.case_id}`}
                      className="text-[13.5px] font-semibold text-text transition-colors hover:text-primary-pressed"
                    >
                      {p.case_number_title}
                    </Link>
                    {!p.exact && (
                      <Badge tone="warning" quiet>
                        {c.list.checkBadge}
                      </Badge>
                    )}
                  </span>
                  <p className="mt-0.5 truncate text-[12px] text-text-muted">
                    {[p.method, p.note].filter(Boolean).join(' · ') || '—'}
                    {' · '}
                    {DATE_FMT.format(new Date(p.paid_at + 'T00:00:00Z'))}
                  </p>
                  {!p.exact && (
                    <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-warning-text">
                      <TriangleAlert
                        size={12}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{c.list.checkHint}</span>
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[13.5px] font-bold tabular-nums text-success-text">
                  +{formatMoney(p.amount)} ₴
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <ConfirmDialog
        open={confirming}
        title={c.batch.confirmTitle}
        description={fmt(c.batch.confirmBody, {
          n: String(selected.length),
          sum: formatMoney(selectedSum),
        })}
        confirmLabel={c.batch.submit}
        tone="danger"
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
        onClose={() => setConfirming(false)}
      >
        <p className="text-[13px] leading-relaxed text-warning-text">
          {c.warnPayroll}
        </p>
      </ConfirmDialog>
    </form>
  );
}
