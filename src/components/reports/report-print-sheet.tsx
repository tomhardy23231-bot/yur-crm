import { formatReportCell } from './report-table';
import type { ReportColumn, ReportDoc } from '@/lib/reports/export/types';

// Печатный лист отчёта (2026-08-03). Белая страница-документ; @media print в
// globals.css превращает .report-sheet в A4 (см. route-group (print)).
//
// Палитра — «серьёзный документ», как у печатных отчётов ЗП: собственные
// значения вместо токенов темы, потому что лист печатается на бумаге и не
// должен зависеть от светлой/тёмной раскладки экрана.
const DOC = {
  ink: '#1b2a26',
  body: '#33403b',
  muted: '#6b756f',
  subtle: '#98a09b',
  hair: '#dcd9cf',
  hairStrong: '#b7beb9',
  accent: '#2563EB',
  head: '#f2f4f3',
};

function isNumeric(type: ReportColumn['type']): boolean {
  return type === 'money' || type === 'number' || type === 'percent';
}

export function ReportPrintSheet({ doc }: { doc: ReportDoc }) {
  return (
    <article
      className="report-sheet mx-auto w-full max-w-[1100px] px-6 py-9 sm:px-12 sm:py-11"
      style={{ color: DOC.body }}
    >
      {/* Шапка: реквизиты фирмы, название отчёта, период. */}
      <header className="flex flex-col gap-4">
        {doc.org && (
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[13px] font-bold" style={{ color: DOC.ink }}>
              {doc.org.name}
            </p>
            {doc.org.edrpou && (
              <p className="text-[11px] tabular-nums" style={{ color: DOC.muted }}>
                ЄДРПОУ {doc.org.edrpou}
              </p>
            )}
          </div>
        )}
        <div style={{ height: 3, background: DOC.accent }} />
        <div className="flex flex-col gap-1">
          <h1
            className="text-[22px] font-extrabold leading-tight tracking-tight"
            style={{ color: DOC.ink }}
          >
            {doc.title}
          </h1>
          <p className="text-[13.5px]" style={{ color: DOC.muted }}>
            {doc.periodLabel}
          </p>
        </div>
      </header>

      {/* Таблица */}
      {doc.rows.length === 0 ? (
        <p className="mt-8 text-[13px]" style={{ color: DOC.muted }}>
          —
        </p>
      ) : (
        <table className="mt-7 w-full border-collapse">
          <thead>
            <tr>
              {doc.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide ${
                    isNumeric(c.type) ? 'text-right' : 'text-left'
                  }`}
                  style={{
                    color: DOC.ink,
                    background: DOC.head,
                    borderBottom: `1px solid ${DOC.hairStrong}`,
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.rows.map((row, i) => (
              <tr key={i} className="break-inside-avoid">
                {doc.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2.5 py-1.5 text-[11.5px] ${
                      isNumeric(c.type) ? 'text-right tabular-nums' : 'text-left'
                    } ${row.emphasis ? 'font-bold' : ''}`}
                    style={{ borderBottom: `1px solid ${DOC.hair}` }}
                  >
                    {formatReportCell(row.cells[c.key] ?? null, c.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {doc.totals && (
            <tfoot>
              <tr className="break-inside-avoid">
                {doc.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2.5 py-2 text-[12px] font-bold ${
                      isNumeric(c.type) ? 'text-right tabular-nums' : 'text-left'
                    }`}
                    style={{
                      color: DOC.ink,
                      borderTop: `2px solid ${DOC.hairStrong}`,
                      borderBottom: `1px solid ${DOC.hairStrong}`,
                    }}
                  >
                    {formatReportCell(doc.totals?.[c.key] ?? null, c.type)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {/* Сноски и подпись формирования */}
      <footer
        className="break-inside-avoid mt-8 flex flex-col gap-2 pt-5"
        style={{ borderTop: `1px solid ${DOC.hair}` }}
      >
        {(doc.notes ?? []).map((note) => (
          <p key={note} className="text-[10.5px] leading-relaxed" style={{ color: DOC.muted }}>
            {note}
          </p>
        ))}
        <p className="text-[10px]" style={{ color: DOC.subtle }}>
          {doc.generatedAt}
          {doc.generatedBy ? ` · ${doc.generatedBy}` : ''}
        </p>
      </footer>
    </article>
  );
}
