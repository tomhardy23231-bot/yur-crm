import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { buildEmployeeReport } from '@/lib/payroll/report';
import { normalizeMonth, monthParam } from '@/lib/payroll/month';
import { ReportDocument, type DocMeta } from '@/components/payroll/report/report-document';
import { EmployeeReportBody } from '@/components/payroll/report/employee-report';
import { ReportToolbar } from '@/components/payroll/report/report-toolbar';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47 } from '@/lib/i18n/config';

export default async function EmployeeReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { t, fmt, locale } = await getT();
  const { userId } = await params;
  const { month: monthRaw } = await searchParams;
  const month = normalizeMonth(monthRaw);

  // Сотрудник видит только свой отчёт; staff с view_all_payroll — любой.
  const seeAll = user.caps.view_all_payroll;
  if (!seeAll && userId !== user.profile.id) redirect('/forbidden');

  const report = await buildEmployeeReport(userId, month);
  const generatedAt = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const roleBits: string[] = [];
  if (report.lawyerCount > 0)
    roleBits.push(fmt(t.payrollPrint.employeePage.roleLawyer, { n: report.lawyerCount }));
  if (report.expertCount > 0)
    roleBits.push(fmt(t.payrollPrint.employeePage.roleExpert, { n: report.expertCount }));
  const roleText = roleBits.length > 0 ? roleBits.join(' · ') : t.common.dash;

  const meta: DocMeta[] = [
    { label: t.payrollPrint.employeePage.metaEmployee, value: report.fullName },
    { label: t.payrollPrint.employeePage.metaRoles, value: roleText },
    { label: t.payrollPrint.employeePage.metaPeriod, value: report.monthLabel },
    { label: t.payrollPrint.employeePage.metaGenerated, value: generatedAt },
  ];

  return (
    <>
      <ReportToolbar
        backHref={`/reports/payroll/${userId}?month=${monthParam(month)}`}
        month={month}
      />
      <ReportDocument
        docKind={t.payrollPrint.employeePage.docKind}
        docNumber={`№ ЗП-${monthParam(month)}`}
        title={t.payrollPrint.employeePage.title}
        subtitle={fmt(t.payrollPrint.employeePage.subtitle, {
          name: report.fullName,
          month: report.monthLabel,
        })}
        meta={meta}
      >
        <EmployeeReportBody report={report} />
      </ReportDocument>
    </>
  );
}
