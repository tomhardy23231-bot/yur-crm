import Link from "next/link";
import { Briefcase } from "lucide-react";

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
import { PaymentProgress } from "@/components/cases/payment-progress";
import { formatMoney } from "@/lib/utils";
import type { CaseListItem } from "@/lib/cases/queries";

// Таблица последних дел на дашборде. Данные приходят из listCases (RLS-scoped),
// поэтому специалист видит только свои дела.
export function RecentCases({ items }: { items: ReadonlyArray<CaseListItem> }) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Briefcase size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[15px] font-semibold text-text">Последние дела</h2>
        <Link
          href="/cases"
          className="ml-auto text-[12px] text-primary hover:underline"
        >
          Все дела →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-muted">
          Пока нет дел.
        </p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>Номер / название</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Этап</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead className="text-right">Сумма / оплата</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => {
                const paid = Math.max(0, c.contract_sum - c.debt);
                return (
                  <TableRow key={c.id} className="group cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/cases/${c.id}`}
                        className="font-medium text-text transition-colors group-hover:text-primary"
                      >
                        {c.number_title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[13px] text-text-muted">
                      {c.client?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={c.stage} />
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={c.category} />
                    </TableCell>
                    <TableCell>
                      <div className="ml-auto flex w-40 flex-col items-end gap-1">
                        <span className="font-mono text-[12.5px] tabular-nums text-text">
                          {formatMoney(c.contract_sum)} ₴
                        </span>
                        <PaymentProgress
                          paid={paid}
                          total={c.contract_sum}
                          className="w-full"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
