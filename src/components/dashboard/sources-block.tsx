'use client';

import { Compass } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import { CLIENT_SOURCE_LABEL, type ClientSource } from '@/lib/types/db';
import type { SourceRow } from '@/lib/dashboard/queries';

// Источники клиентов за месяц (v3 Сессия 7): откуда пришли + сколько дел и оплат.
// Подписи source — существующие enum-ключи; неизвестный код / 'other' → «Другое».
export function SourcesBlock({ rows }: { rows: SourceRow[] }) {
  const { t } = useI18n();

  const label = (s: string): string =>
    s in CLIENT_SOURCE_LABEL
      ? t.enums.clientSource[s as ClientSource]
      : t.dashboard.sources.otherSource;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Compass size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.dashboard.sources.title}
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-text-subtle">
          {t.dashboard.sources.empty}
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.03em] text-text-subtle">
              <th className="py-1.5 font-medium">{t.dashboard.sources.colSource}</th>
              <th className="py-1.5 text-right font-medium">
                {t.dashboard.sources.colClients}
              </th>
              <th className="py-1.5 text-right font-medium">
                {t.dashboard.sources.colCases}
              </th>
              <th className="py-1.5 text-right font-medium">
                {t.dashboard.sources.colPaid}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 text-text">{label(r.source)}</td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">
                  {r.clients}
                </td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">
                  {r.cases}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-text">
                  {formatMoney(r.paid)} ₴
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
