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
import type { PersonalEarning } from "@/lib/dashboard/queries";

// Личный блок начислений специалиста (юрист/Эксперт): по каждому его делу —
// категория, оплачено клиентом, процент и начислено (% × оплачено).
export function PersonalEarnings({
  earnings,
}: {
  earnings: ReadonlyArray<PersonalEarning>;
}) {
  const totalEarned = earnings.reduce((sum, e) => sum + e.earned, 0);
  const totalPaidBase = earnings.reduce((sum, e) => sum + e.paid_total, 0);

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Wallet size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[15px] font-semibold text-text">Мои начисления</h2>
        <span className="text-[12px] text-text-muted">
          · % от оплаченного по делу
        </span>
        <Link
          href="/reports/payroll"
          className="ml-auto text-[12px] text-primary hover:underline"
        >
          Отчёт →
        </Link>
      </div>

      {earnings.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-muted">
          У вас пока нет дел с начислениями. Они появятся, когда по вашим делам
          поступят оплаты.
        </p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>Дело</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Этап</TableHead>
                <TableHead className="text-right">Оплачено</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Начислено</TableHead>
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
                  <TableCell className="whitespace-nowrap text-right font-mono text-[13px] tabular-nums text-text-muted">
                    {formatMoney(e.paid_total)} ₴
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums text-text-muted">
                    {formatPercent(e.percent)}%
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-semibold tabular-nums text-success">
                    {formatMoney(e.earned)} ₴
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-muted/50 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-subtle">
              Итого начислено
            </span>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-[12px] tabular-nums text-text-muted">
                база {formatMoney(totalPaidBase)} ₴
              </span>
              <span className="font-mono text-[15px] font-bold tabular-nums text-success">
                {formatMoney(totalEarned)} ₴
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
