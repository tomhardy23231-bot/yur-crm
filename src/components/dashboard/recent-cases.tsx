"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StageBadge } from "@/components/ui/stage-badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import type { CaseListItem } from "@/lib/cases/queries";

// Таблица последних дел на дашборде (колонки — макет владельца 2026-07-08):
// Дело (номер/название + клиент подстрокой) · Этап · Сумма · Ответственный
// (аватар Експерта с тултипом). Данные из listCases (RLS-scoped) → специалист
// видит только свои дела. Строка целиком ведёт в карточку дела.
export function RecentCases({ items }: { items: ReadonlyArray<CaseListItem> }) {
  const { t } = useI18n();

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text">
          {t.dashboard.recentCases.title}
        </h2>
        <Link
          href="/cases"
          className="ml-auto text-[12px] font-semibold text-primary hover:text-primary-hover"
        >
          {t.dashboard.recentCases.allLink}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-muted">
          {t.dashboard.recentCases.empty}
        </p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>{t.dashboard.recentCases.colNumberTitle}</TableHead>
                <TableHead>{t.dashboard.recentCases.colStage}</TableHead>
                <TableHead className="text-right">{t.dashboard.recentCases.colSum}</TableHead>
                <TableHead className="text-right">{t.dashboard.recentCases.colResponsible}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} className="group cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/cases/${c.id}`}
                      className="block min-w-0 font-semibold text-text transition-colors hover:text-primary"
                    >
                      <span className="block truncate text-[14px]">{c.number_title}</span>
                      {c.client && (
                        <span className="mt-1 block truncate font-mono text-[11.5px] font-normal text-text-muted">
                          {c.client.name}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {/* Залитый пастельный чип (макет); pulse off — список. */}
                    <StageBadge stage={c.stage} pulse={false} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="whitespace-nowrap font-mono text-[12.5px] font-medium text-text">
                      {formatMoney(c.contract_sum)} ₴
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {c.responsible ? (
                      <Avatar
                        name={c.responsible.full_name}
                        size="md"
                        title={c.responsible.full_name}
                      />
                    ) : (
                      <span className="text-[13px] text-text-subtle">{t.common.dash}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
