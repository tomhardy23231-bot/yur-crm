'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn, formatMoney } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { ReportTable } from '@/components/reports/report-table';
import { ReportExportButtons } from '@/components/reports/export-buttons';
import type { ReportDoc } from '@/lib/reports/export/types';
import type { Period } from '@/lib/reports/period';
import type { CashIncomeDim } from '@/lib/db/rpc';
import type { CashReportKind } from '@/lib/reports/cash/documents';

// Панель отчёта кассы за период (2026-08-03): заголовок, выгрузка, таблица.
//
// Данные приходят готовым ReportDoc с сервера — панель ничего не считает.
// Кнопки ведут на тот же документ в другом формате: Excel — файлом,
// «Друк» — печатной страницей, из которой браузер делает PDF.

const DIMS: CashIncomeDim[] = ['case', 'client', 'lawyer', 'expert', 'method', 'account'];

export function CashReportPanel({
  doc,
  kind,
  period,
  hint,
  dim,
  chart = false,
}: {
  doc: ReportDoc;
  kind: CashReportKind;
  period: Period;
  hint: string;
  /** Активный разрез — только для вкладки «Доходы». */
  dim?: CashIncomeDim;
  /** Показать столбиковую диаграмму над таблицей (движение по месяцам). */
  chart?: boolean;
}) {
  const { t } = useI18n();
  const r = t.cash.reports;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Разрез живёт в URL: ссылку на «доходы по клиентам» можно переслать.
  const setDim = (next: CashIncomeDim) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('dim', next);
    params.set('from', period.from);
    params.set('to', period.to);
    router.push(`${pathname}?${params.toString()}`);
  };

  const dimLabels: Record<CashIncomeDim, string> = {
    case: r.dimCase,
    client: r.dimClient,
    lawyer: r.dimLawyer,
    expert: r.dimExpert,
    method: r.dimMethod,
    account: r.dimAccount,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Шапка отчёта: что это + выгрузка. */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-text">{doc.title}</h3>
          <p className="mt-0.5 text-[12px] text-text-muted">{hint}</p>
        </div>
        <ReportExportButtons kind={kind} period={period} dim={dim} />
      </div>

      {/* Переключатель разреза — только у доходов. */}
      {dim && (
        <div
          role="tablist"
          aria-label={r.dimAria}
          className="flex flex-wrap items-center gap-1.5"
        >
          {DIMS.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === dim}
              onClick={() => setDim(d)}
              className={cn(
                'inline-flex h-7 items-center rounded-chip border px-2.5 text-[12px] font-medium transition-colors',
                d === dim
                  ? 'border-primary-border bg-primary-softer text-primary-pressed'
                  : 'border-border bg-surface text-text-muted hover:border-primary-border hover:text-primary-pressed',
              )}
            >
              {dimLabels[d]}
            </button>
          ))}
        </div>
      )}

      {chart && doc.rows.length > 0 && <FlowChart doc={doc} />}

      <ReportTable
        doc={doc}
        emptyText={r.empty}
        emptyHint={kind === 'income' ? undefined : r.emptyHint}
      />
    </div>
  );
}

// Столбиковая диаграмма движения по месяцам. Без библиотеки: две полосы на
// месяц, высота — доля от максимума. Достаточно, чтобы увидеть форму года.
function FlowChart({ doc }: { doc: ReportDoc }) {
  const { t } = useI18n();
  const r = t.cash.reports;
  const rows = doc.rows;
  const max = Math.max(
    ...rows.map((row) =>
      Math.max(Number(row.cells.inflow ?? 0), Number(row.cells.outflow ?? 0)),
    ),
    1,
  );

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-4 pb-3">
        <Legend className="bg-success" label={r.colInflow} />
        <Legend className="bg-error" label={r.colOutflow} />
      </div>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: 132 }}>
        {rows.map((row, i) => {
          const inflow = Number(row.cells.inflow ?? 0);
          const outflow = Number(row.cells.outflow ?? 0);
          const label = String(row.cells.month ?? '');
          return (
            <div key={i} className="flex min-w-[38px] flex-1 flex-col items-center gap-1">
              <div className="flex h-[100px] w-full items-end justify-center gap-[3px]">
                <Bar
                  value={inflow}
                  max={max}
                  className="bg-success"
                  title={`${label} · ${r.colInflow}: ${formatMoney(inflow)} ₴`}
                />
                <Bar
                  value={outflow}
                  max={max}
                  className="bg-error"
                  title={`${label} · ${r.colOutflow}: ${formatMoney(outflow)} ₴`}
                />
              </div>
              {/* Подпись месяца: в году их 12 — оставляем только начало. */}
              <span className="w-full truncate text-center text-[10px] text-text-subtle">
                {label.split(' ')[0]?.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({
  value,
  max,
  className,
  title,
}: {
  value: number;
  max: number;
  className: string;
  title: string;
}) {
  // Ненулевая сумма всегда рисует хотя бы полоску в 2px: иначе маленький
  // месяц выглядел бы как «ничего не было».
  const h = value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span
      title={title}
      className={cn('w-[10px] shrink-0 rounded-t-sm', className)}
      style={{ height: `${h}%` }}
      aria-hidden="true"
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted">
      <span className={cn('h-2.5 w-2.5 rounded-sm', className)} aria-hidden="true" />
      {label}
    </span>
  );
}
