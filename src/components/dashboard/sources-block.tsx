'use client';

import { Compass } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import { CLIENT_SOURCE_LABEL, type ClientSource } from '@/lib/types/db';
import type { SourceRow } from '@/lib/dashboard/queries';

// Категориальная палитра сегментов — те же токены, что у аватаров
// (--avatar-1..6: blue/violet/rose/amber/teal/slate, AA-затемнены в v3 s10).
const PALETTE = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-4)',
  'var(--avatar-5)',
  'var(--avatar-3)',
  'var(--avatar-6)',
] as const;

// Источники клиентов за месяц (v3 Сессия 7; рестайл по макету владельца
// 2026-07-08): цветная полоса-распределение по числу клиентов + легенда
// «точка · источник · клиентов · %», дела и оплаты — подстрокой.
export function SourcesBlock({ rows }: { rows: SourceRow[] }) {
  const { t, fmt, plural } = useI18n();

  const label = (s: string): string =>
    s in CLIENT_SOURCE_LABEL
      ? t.enums.clientSource[s as ClientSource]
      : t.dashboard.sources.otherSource;

  // От большего к меньшему — полоса и легенда читаются как рейтинг.
  const sorted = [...rows].sort((a, b) => b.clients - a.clients);
  const totalClients = sorted.reduce((sum, r) => sum + r.clients, 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-text">
          {t.dashboard.sources.title}
        </h2>
      </div>

      {sorted.length === 0 || totalClients === 0 ? (
        <EmptyState size="sm" icon={Compass} title={t.dashboard.sources.empty} />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="flex h-2 w-full gap-[3px] overflow-hidden"
          >
            {sorted.map((r, i) => (
              <div
                key={r.source}
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((r.clients / totalClients) * 100, 2)}%`,
                  background: PALETTE[i % PALETTE.length],
                }}
              />
            ))}
          </div>

          {/* Легенда как на макете: точка · источник · клиентов · %.
              Дела и оплаты — в тултипе строки (title). */}
          <ul className="mt-3.5 flex flex-col">
            {sorted.map((r, i) => {
              const pct = Math.round((r.clients / totalClients) * 100);
              return (
                <li
                  key={r.source}
                  title={`${plural(t.dashboard.sources.clientsCount, r.clients)} · ${fmt(
                    t.dashboard.sources.casesPaidLine,
                    { cases: r.cases, paid: formatMoney(r.paid) },
                  )}`}
                  className="flex items-center gap-2.5 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                  />
                  <p className="min-w-0 flex-1 truncate text-[13.5px] leading-tight text-text">
                    {label(r.source)}
                  </p>
                  <span className="shrink-0 font-mono text-[13px] font-semibold text-text">
                    {r.clients}
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-text-muted">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
