'use client';

import { Check, RotateCcw } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  markLedgerPaidAction,
  revertLedgerPaidAction,
} from "@/lib/payroll/actions";
import { LOCALE_BCP47 } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";
import { formatMoney, formatPercent } from "@/lib/utils";
import { type PayrollLedgerEntry } from "@/lib/types/db";

// Блок «Выплаты команде» в карточке дела (P1.3). Показывает зафиксированные
// начисления и статус (начислено/выплачено). Отметку выплаты делает owner/admin.
export function CaseLedgerBlock({
  entries,
  canManage,
  names,
  emptyHint,
}: {
  entries: ReadonlyArray<PayrollLedgerEntry>;
  canManage: boolean;
  /** user_id → имя (юрист/Експерт дела), чтобы показать без лишнего запроса. */
  names: Record<string, string>;
  emptyHint: string;
}) {
  const { t, fmt, locale } = useI18n();
  const dateFmt = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (entries.length === 0) {
    return (
      <div className="border-t border-border px-4 py-2.5">
        <p className="text-[12px] text-text-muted">
          <span className="font-semibold uppercase tracking-[0.05em] text-text-subtle">
            {t.payroll.ledger.labelShort}
          </span>{" "}
          {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-border px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle mb-3">
        {t.payroll.ledger.title}
      </p>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => {
          const name = names[e.user_id] ?? t.common.dash;
          const paid = e.status === "paid";
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-md bg-surface-muted/50 px-3 py-2"
            >
              <Avatar name={name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text truncate">
                  {name}
                </p>
                <p className="text-[12px] text-text-muted">
                  {t.enums.roleInCase[e.role_in_case]} · {formatPercent(e.percent)}% ·{" "}
                  {paid && e.paid_at
                    ? fmt(t.payroll.ledger.paidOn, {
                        date: dateFmt.format(new Date(e.paid_at)),
                      })
                    : fmt(t.payroll.ledger.accruedOn, {
                        date: dateFmt.format(new Date(e.accrued_at)),
                      })}
                </p>
              </div>
              <span className="font-mono text-[14px] font-semibold tabular-nums text-success whitespace-nowrap">
                {formatMoney(e.amount)} ₴
              </span>
              <Badge tone={paid ? "success" : "warning"}>
                {t.enums.ledgerStatus[e.status]}
              </Badge>
              {canManage &&
                (paid ? (
                  <form action={revertLedgerPaidAction}>
                    <input type="hidden" name="ledger_id" value={e.id} />
                    <input type="hidden" name="case_id" value={e.case_id} />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[12px] font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                    >
                      <RotateCcw size={13} strokeWidth={1.75} />
                      {t.payroll.ledger.revert}
                    </button>
                  </form>
                ) : (
                  <form action={markLedgerPaidAction}>
                    <input type="hidden" name="ledger_id" value={e.id} />
                    <input type="hidden" name="case_id" value={e.case_id} />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <Check size={13} strokeWidth={2} />
                      {t.payroll.ledger.markPaid}
                    </button>
                  </form>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
