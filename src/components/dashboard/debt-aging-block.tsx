'use client';

import { CheckCircle2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import type { AgingBuckets } from '@/lib/dashboard/aging';

// Дебиторка по давности (v3 Сессия 9): 4 бакета возраста долга (<30/30-60/60-90/
// 90+ дней). Чем старше долг — тем тревожнее цвет. RLS RPC ограничил выдачу.
export function DebtAgingBlock({ buckets }: { buckets: AgingBuckets }) {
  const { t, fmt } = useI18n();
  const a = t.dashboard.aging;

  const cells: {
    key: keyof AgingBuckets;
    label: string;
    tone: string;
  }[] = [
    { key: 'd0_30', label: a.bucket0_30, tone: 'text-text' },
    { key: 'd30_60', label: a.bucket30_60, tone: 'text-warning' },
    { key: 'd60_90', label: a.bucket60_90, tone: 'text-warning' },
    { key: 'd90_plus', label: a.bucket90_plus, tone: 'text-error' },
  ];

  const total = cells.reduce((s, c) => s + buckets[c.key].sum, 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text">
          {a.title}
        </h2>
      </div>

      {/* Блок живёт в узкой правой колонке — бакеты всегда 2×2. */}
      {total === 0 ? (
        <EmptyState size="sm" icon={CheckCircle2} title={a.empty} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cells.map((c) => {
            const b = buckets[c.key];
            return (
              <div
                key={c.key}
                className="flex flex-col gap-0.5 rounded-lg bg-surface-sunken px-3 py-2.5"
              >
                <span className="text-[11px] uppercase tracking-[0.03em] text-text-subtle">
                  {c.label}
                </span>
                <span className={`text-[16px] font-bold tabular-nums ${c.tone}`}>
                  {formatMoney(b.sum)} ₴
                </span>
                <span className="text-[11px] tabular-nums text-text-muted">
                  {fmt(a.casesCount, { n: b.count })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
