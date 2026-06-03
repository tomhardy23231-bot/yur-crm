import Link from "next/link";
import { Briefcase } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StageBadge } from "@/components/ui/stage-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import {
  StatusFilterStrip,
  type StatusChip,
} from "@/components/ui/status-filter-strip";
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
import { CASE_STAGE_LABEL, type CaseStage } from "@/lib/types/db";
import type { CaseListItem } from "@/lib/cases/queries";
import type { FunnelEntry } from "@/lib/dashboard/queries";

// Цвет точки этапа для статус-чипов.
const STAGE_DOT: Record<CaseStage, string> = {
  new_request: "bg-stage-new",
  consultation: "bg-stage-consultation",
  in_progress: "bg-stage-in-progress",
  awaiting_decision: "bg-stage-awaiting",
  closed: "bg-stage-closed",
};

// Таблица последних дел на дашборде. Данные из listCases (RLS-scoped) → специалист
// видит только свои дела. Над таблицей — строка статус-фильтров (бриф §6), бейджи
// в таблице — тихие (бриф §3.4).
export function RecentCases({
  items,
  funnel,
}: {
  items: ReadonlyArray<CaseListItem>;
  funnel?: ReadonlyArray<FunnelEntry>;
}) {
  const chips: StatusChip[] | null = funnel
    ? [
        {
          key: "all",
          label: "Все",
          count: funnel.reduce((s, f) => s + f.count, 0),
          href: "/cases",
        },
        ...funnel.map((f) => ({
          key: f.stage,
          label: CASE_STAGE_LABEL[f.stage],
          count: f.count,
          dotClass: STAGE_DOT[f.stage],
          href: `/cases?stage=${f.stage}`,
        })),
      ]
    : null;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Briefcase size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[15px] font-semibold text-text">Последние дела</h2>
        <Link
          href="/cases"
          className="ml-auto text-[12px] font-semibold text-primary hover:text-primary-hover"
        >
          Все дела →
        </Link>
      </div>

      {chips && (
        <StatusFilterStrip chips={chips} className="border-b border-border px-5 py-3" />
      )}

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
                        className="font-semibold text-primary transition-colors hover:text-primary-hover"
                      >
                        {c.number_title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {c.client ? (
                        <span className="inline-flex items-center gap-2.5">
                          <Avatar name={c.client.name} size="sm" shape="square" />
                          <span className="text-[13px] text-text-muted">
                            {c.client.name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-text-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={c.stage} quiet />
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={c.category} quiet />
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
