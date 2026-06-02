import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { buildEmployeeReport } from '@/lib/payroll/report';
import { normalizeMonth, monthParam } from '@/lib/payroll/month';
import { ReportDocument, type DocMeta } from '@/components/payroll/report/report-document';
import { EmployeeReportBody } from '@/components/payroll/report/employee-report';
import { ReportToolbar } from '@/components/payroll/report/report-toolbar';

const GENERATED_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function EmployeeReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { userId } = await params;
  const { month: monthRaw } = await searchParams;
  const month = normalizeMonth(monthRaw);

  // Сотрудник видит только свой отчёт; staff с view_all_payroll — любой.
  const seeAll = user.caps.view_all_payroll;
  if (!seeAll && userId !== user.profile.id) redirect('/forbidden');

  const report = await buildEmployeeReport(userId, month);
  const generatedAt = GENERATED_FMT.format(new Date());

  const roleBits: string[] = [];
  if (report.lawyerCount > 0) roleBits.push(`юрист — ${report.lawyerCount}`);
  if (report.expertCount > 0) roleBits.push(`эксперт — ${report.expertCount}`);
  const roleText = roleBits.length > 0 ? roleBits.join(' · ') : '—';

  const meta: DocMeta[] = [
    { label: 'Сотрудник', value: report.fullName },
    { label: 'Дела по ролям', value: roleText },
    { label: 'Период', value: report.monthLabel },
    { label: 'Сформирован', value: generatedAt },
  ];

  return (
    <>
      <ReportToolbar
        backHref={`/reports/payroll/${userId}?month=${monthParam(month)}`}
        month={month}
      />
      <ReportDocument
        docKind="Отчёт по заработной плате"
        docNumber={`№ ЗП-${monthParam(month)}`}
        title="Отчёт по заработной плате сотрудника"
        subtitle={`${report.fullName} · период: ${report.monthLabel}`}
        meta={meta}
      >
        <EmployeeReportBody report={report} />
      </ReportDocument>
    </>
  );
}
