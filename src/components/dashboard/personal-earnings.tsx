"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { StageBadge } from "@/components/ui/stage-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney, formatPercent } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import type { PersonalEarning } from "@/lib/dashboard/queries";

// Личный блок начислений специалиста (юрист/Эксперт): по каждому его делу —
// категория, оплачено клиентом, процент и начислено (% × оплачено).
export function PersonalEarnings({
  earnings,
}: {
  earnings: ReadonlyArray<PersonalEarning>;
}) {
  const { t, fmt } = useI18n();
  const totalEarned = earnings.reduce((sum, e) => sum + e.earned, 0);
  const totalPaidBase = earnings.reduce((sum, e) => sum + e.paid_total, 0);

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Wallet size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[15px] font-semibold text-text">{t.dashboard.earnings.title}</h2>
        <span className="text-[12px] text-text-muted">
          {t.dashboard.earnings.subtitle}
        </span>
        <Link
          href="/reports/payroll"
          className="ml-auto text-[12px] text-primary hover:underline"
        >
          {t.dashboard.earnings.reportLink}
        </Link>
      </div>

      {earnings.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-muted">
          {t.dashboard.earnings.empty}
        </p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>{t.dashboard.earnings.colCase}</TableHead>
                <TableHead>{t.dashboard.earnings.colCategory}</TableHead>
                <TableHead>{t.dashboard.earnings.colStage}</TableHead>
                <TableHead className="text-right">{t.dashboard.earnings.colPaid}</TableHead>
                <TableHead className="text-right">{t.dashboard.earnings.colPercent}</TableHead>
                <TableHead className="text-right">{t.dashboard.earnings.colAccrued}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {earnings.map((e) => (
                <TableRow key={e.id} className="group cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/cases/${e.id}`}
                      className="font-medium text-text transition-colors group-hover:text-primary"
                    >
                      {e.number_title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={e.category} percent={e.percent} />
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={e.stage} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-text-muted">
                    {formatMoney(e.paid_total)} ₴
                  </TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums text-text-muted">
                    {formatPercent(e.percent)}%
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-success">
                    {formatMoney(e.earned)} ₴
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-muted/50 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-subtle">
              {t.dashboard.earnings.totalAccrued}
            </span>
            <div className="flex items-baseline gap-4">
              <span className="text-[12px] tabular-nums text-text-muted">
                {fmt(t.dashboard.earnings.base, { amount: formatMoney(totalPaidBase) })}
              </span>
              <span className="text-[15px] font-bold tabular-nums text-success">
                {formatMoney(totalEarned)} ₴
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
