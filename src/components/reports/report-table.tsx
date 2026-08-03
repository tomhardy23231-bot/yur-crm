import Link from 'next/link';

import { cn, formatMoney } from '@/lib/utils';
import type { ReportCell, ReportColumn, ReportDoc } from '@/lib/reports/export/types';

// Универсальная таблица отчёта (2026-08-03): рендерит ReportDoc как есть.
//
// Ничего не считает — только раскладывает готовые значения. Это тот же
// документ, что уходит в Excel и в печатную версию, поэтому цифры на экране и
// в выгрузке физически одни и те же.

export function formatReportCell(v: ReportCell, type: ReportColumn['type']): string {
  if (v === null || v === undefined) return '';
  if (type === 'money') return `${formatMoney(Number(v))} ₴`;
  if (type === 'percent') return `${(Number(v) * 100).toFixed(1)}%`;
  if (type === 'number') return String(v);
  return String(v);
}

function isNumeric(type: ReportColumn['type']): boolean {
  return type === 'money' || type === 'number' || type === 'percent';
}

export function ReportTable({
  doc,
  emptyText,
  emptyHint,
  className,
}: {
  doc: ReportDoc;
  emptyText: string;
  emptyHint?: string;
  className?: string;
}) {
  if (doc.rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface px-4 py-10 text-center">
        <p className="text-[13.5px] font-medium text-text">{emptyText}</p>
        {emptyHint && <p className="mt-1 text-[12.5px] text-text-muted">{emptyHint}</p>}
        {(doc.notes ?? []).map((note) => (
          <p key={note} className="mx-auto mt-3 max-w-[560px] text-[12px] text-text-subtle">
            {note}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="list-clip overflow-x-auto rounded-card border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-sunken/60">
              {doc.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-text-subtle',
                    isNumeric(c.type) ? 'text-right' : 'text-left',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {doc.rows.map((row, i) => {
              const first = doc.columns[0];
              const name = first ? row.cells[first.key] : null;
              return (
                <tr
                  key={`${String(name ?? '')}-${i}`}
                  className="transition-colors hover:bg-primary-softer"
                >
                  {doc.columns.map((c, ci) => {
                    const raw = row.cells[c.key] ?? null;
                    const text = formatReportCell(raw, c.type);
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          'px-3 py-2 text-[13px]',
                          isNumeric(c.type)
                            ? 'whitespace-nowrap text-right font-mono tabular-nums'
                            : 'text-text',
                          row.emphasis && 'font-semibold',
                          c.type === 'money' && 'font-semibold',
                        )}
                      >
                        {ci === 0 && row.href ? (
                          <Link href={row.href} className="text-primary hover:underline">
                            {text}
                          </Link>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {doc.totals && (
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-sunken/40">
                {doc.columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-2.5 text-[13px] font-bold',
                      isNumeric(c.type)
                        ? 'whitespace-nowrap text-right font-mono tabular-nums'
                        : 'text-text',
                    )}
                  >
                    {formatReportCell(doc.totals?.[c.key] ?? null, c.type)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(doc.notes ?? []).map((note) => (
        <p key={note} className="px-1 text-[12px] leading-relaxed text-text-subtle">
          {note}
        </p>
      ))}
    </div>
  );
}
