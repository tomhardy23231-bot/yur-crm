import { requireCap } from '@/lib/auth/require-role';
import { buildSummaryReport } from '@/lib/payroll/report';
import { normalizeMonth, monthParam } from '@/lib/payroll/month';
import { ReportDocument, type DocMeta } from '@/components/payroll/report/report-document';
import { SummaryReportBody } from '@/components/payroll/report/summary-report';
import { ReportToolbar } from '@/components/payroll/report/report-toolbar';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47 } from '@/lib/i18n/config';

export default async function SummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Сводный отчёт за всех — только для тех, кто видит всю зарплату.
  await requireCap('view_all_payroll');
  const { t, fmt, locale } = await getT();
  const { month: monthRaw } = await searchParams;
  const month = normalizeMonth(monthRaw);

  const report = await buildSummaryReport(month);
  const generatedAt = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const meta: DocMeta[] = [
    { label: t.payrollPrint.summaryPage.metaType, value: t.payrollPrint.summaryPage.metaTypeValue },
    { label: t.payrollPrint.summaryPage.metaEmployees, value: String(report.rows.length) },
    { label: t.payrollPrint.summaryPage.metaPeriod, value: report.monthLabel },
    { label: t.payrollPrint.summaryPage.metaGenerated, value: generatedAt },
  ];

  return (
    <>
      <ReportToolbar backHref={`/reports/payroll?month=${monthParam(month)}`} month={month} />
      <ReportDocument
        docKind={t.payrollPrint.summaryPage.docKind}
        docNumber={`№ ЗП-СВОД-${monthParam(month)}`}
        title={t.payrollPrint.summaryPage.title}
        subtitle={fmt(t.payrollPrint.summaryPage.subtitle, { month: report.monthLabel })}
        meta={meta}
      >
        <SummaryReportBody report={report} />
      </ReportDocument>
    </>
  );
}
