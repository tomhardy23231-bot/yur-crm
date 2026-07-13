'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import type { OverduePaymentRow } from '@/lib/dashboard/queries';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

// Просроченные доплаты (v3 Сессия 9): топ-N плановых позиций с истёкшим сроком и
// недооплатой. Ссылки ведут на карточки дел. RLS RPC уже ограничил выдачу «по
// своим» для специалиста (блок рендерится на staff-дашборде).
export function OverduePaymentsBlock({ rows }: { rows: OverduePaymentRow[] }) {
  const { t } = useI18n();
  const o = t.dashboard.overdue;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-text">
          {o.title}
        </h2>
      </div>

      {rows.length === 0 ? (
        <EmptyState size="sm" icon={CheckCircle2} title={o.empty} />
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.03em] text-text-subtle">
              <th className="py-1.5 font-medium">{o.colCase}</th>
              <th className="py-1.5 text-right font-medium">{o.colDue}</th>
              <th className="py-1.5 text-right font-medium">{o.colShortfall}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.caseId}-${r.dueDate}`} className="border-b border-border/60 last:border-0">
                <td className="py-1.5">
                  <Link
                    href={`/cases/${r.caseId}`}
                    className="font-medium text-text transition-colors hover:text-primary"
                  >
                    {r.numberTitle}
                  </Link>
                </td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">
                  {fmtDate(r.dueDate)}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-error">
                  {formatMoney(r.shortfall)} ₴
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
