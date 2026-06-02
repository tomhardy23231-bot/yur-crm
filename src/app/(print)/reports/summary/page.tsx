import { requireCap } from '@/lib/auth/require-role';
import { buildSummaryReport } from '@/lib/payroll/report';
import { normalizeMonth, monthParam } from '@/lib/payroll/month';
import { ReportDocument, type DocMeta } from '@/components/payroll/report/report-document';
import { SummaryReportBody } from '@/components/payroll/report/summary-report';
import { ReportToolbar } from '@/components/payroll/report/report-toolbar';

const GENERATED_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function SummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Сводный отчёт за всех — только для тех, кто видит всю зарплату.
  await requireCap('view_all_payroll');
  const { month: monthRaw } = await searchParams;
  const month = normalizeMonth(monthRaw);

  const report = await buildSummaryReport(month);
  const generatedAt = GENERATED_FMT.format(new Date());

  const meta: DocMeta[] = [
    { label: 'Тип', value: 'Сводный по всем сотрудникам' },
    { label: 'Сотрудников', value: String(report.rows.length) },
    { label: 'Период', value: report.monthLabel },
    { label: 'Сформирован', value: generatedAt },
  ];

  return (
    <>
      <ReportToolbar backHref={`/reports/payroll?month=${monthParam(month)}`} month={month} />
      <ReportDocument
        docKind="Сводный отчёт по зарплате"
        docNumber={`№ ЗП-СВОД-${monthParam(month)}`}
        title="Сводный отчёт по заработной плате"
        subtitle={`Начисления, премии и выплаты по всем сотрудникам · период: ${report.monthLabel}`}
        meta={meta}
      >
        <SummaryReportBody report={report} />
      </ReportDocument>
    </>
  );
}
