'use client';

import { Target } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import type { ConversionStats } from '@/lib/dashboard/queries';

// Конверсия воронки в договор (v3 Сессия 7) — компактный блок под воронкой.
// «X% (reached/created), потеряно N». Считается из уже загруженных дел дашборда.
export function ConversionBlock({ stats }: { stats: ConversionStats }) {
  const { t, fmt } = useI18n();
  const pct =
    stats.created > 0 ? Math.round((stats.reached / stats.created) * 100) : 0;

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <Target size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.dashboard.conversion.title}
        </h2>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[28px] font-extrabold tabular-nums text-text">
          {pct}%
        </span>
        <span className="text-[12.5px] tabular-nums text-text-muted">
          {fmt(t.dashboard.conversion.ratio, {
            reached: stats.reached,
            created: stats.created,
          })}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] tabular-nums text-text-subtle">
        {fmt(t.dashboard.conversion.lost, { n: stats.lost })}
      </p>
    </Card>
  );
}
