'use client';

import { Scale } from 'lucide-react';

import { useI18n } from '@/lib/i18n/provider';

// Палитра серьёзного документа (без «леденцовых» заливок). Едина для всех блоков.
export const DOC = {
  ink: '#1b2a26',
  body: '#33403b',
  muted: '#6b756f',
  subtle: '#98a09b',
  hair: '#dcd9cf',
  hairStrong: '#b7beb9',
  accent: '#0D9488',
  accentDark: '#0a6b62',
  green: '#15803d',
  amber: '#b45309',
  paper: '#faf9f5',
};

export type DocMeta = { label: string; value: string };

// Полноширинный документ-отчёт. На экране — белая страница (не «карточка на сером»),
// при печати @media print делает её A4. Шапка в стиле официального документа:
// бренд-строка, заголовок, мета-сетка (как реквизиты), затем тело.
export function ReportDocument({
  docKind,
  docNumber,
  title,
  subtitle,
  meta,
  children,
  footer,
}: {
  docKind: string;
  docNumber: string;
  title: string;
  subtitle?: string;
  meta: DocMeta[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <article
      className="report-sheet mx-auto w-full max-w-[1100px] px-6 py-9 sm:px-12 sm:py-11"
      style={{ color: DOC.body }}
    >
      {/* Бренд-строка */}
      <header className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-md"
              style={{ background: DOC.accent, color: '#fff' }}
              aria-hidden="true"
            >
              <Scale size={20} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[15px] font-extrabold leading-tight tracking-tight" style={{ color: DOC.ink }}>
                {t.payrollPrint.document.brand}
              </p>
              <p className="text-[11px]" style={{ color: DOC.muted }}>
                {t.payrollPrint.document.company}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: DOC.muted }}>
              {docKind}
            </p>
            <p className="font-mono text-[12px] font-medium tabular-nums" style={{ color: DOC.ink }}>
              {docNumber}
            </p>
          </div>
        </div>
        <div style={{ height: 3, background: DOC.accent }} />
      </header>

      {/* Заголовок */}
      <div className="mt-6 flex flex-col gap-1">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight" style={{ color: DOC.ink }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13.5px]" style={{ color: DOC.muted }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Мета-сетка (реквизиты) */}
      <dl
        className="mt-5 grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4"
        style={{ borderTop: `1px solid ${DOC.hair}`, borderBottom: `1px solid ${DOC.hair}` }}
      >
        {meta.map((m, i) => (
          <div
            key={m.label}
            className="flex flex-col gap-0.5 py-3"
            style={i > 0 ? { borderLeft: undefined } : undefined}
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: DOC.subtle }}>
              {m.label}
            </dt>
            <dd className="text-[13px] font-medium" style={{ color: DOC.ink }}>
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 flex flex-col gap-8">{children}</div>

      {footer ?? <ReportSignatures />}
    </article>
  );
}

export function ReportSignatures() {
  const { t } = useI18n();
  return (
    <footer
      className="report-footer break-inside-avoid mt-9 flex flex-col gap-6 pt-6"
      style={{ borderTop: `1px solid ${DOC.hair}` }}
    >
      <p className="text-[10.5px] leading-relaxed" style={{ color: DOC.muted }}>
        {t.payrollPrint.document.note}
      </p>
      <div className="flex items-end justify-between gap-10">
        <SignatureLine label={t.payrollPrint.document.signatureEmployee} />
        <SignatureLine label={t.payrollPrint.document.signatureManager} />
      </div>
    </footer>
  );
}

function SignatureLine({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <div className="flex-1">
      <div style={{ height: 30, borderBottom: `1px solid ${DOC.hairStrong}` }} />
      <p className="mt-1.5 text-[10.5px]" style={{ color: DOC.muted }}>
        {label} · {t.payrollPrint.document.signatureCaption}
      </p>
    </div>
  );
}
