import { History } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { listCaseActivity, resolveActivityNames } from '@/lib/activity-log/queries';
import {
  formatActivity,
  formatActivityTime,
  collectActivityIds,
} from '@/lib/activity-log/format';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47 } from '@/lib/i18n/config';

interface CaseActivityBlockProps {
  caseId: string;
  /** Сколько последних записей показывать. */
  limit?: number;
}

export async function CaseActivityBlock({
  caseId,
  limit = 20,
}: CaseActivityBlockProps) {
  const i18n = await getT();
  const { t, fmt, plural } = i18n;
  const entries = await listCaseActivity(caseId, limit);
  // Резолвим UUID юристов/Експертов/клиентов из записей в имена (Задача 3).
  const { userIds, clientIds } = collectActivityIds(entries);
  const nameById = await resolveActivityNames(userIds, clientIds);

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <History size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">{t.activity.block.title}</h2>
        {entries.length > 0 && (
          <span className="text-[12px] text-text-muted">
            · {plural(t.activity.block.count, entries.length)}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-10 px-6 flex flex-col items-center text-center">
          <p className="text-[13px] text-text-muted max-w-md">
            {t.activity.block.empty}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            const f = formatActivity(i18n, entry, nameById);
            return (
              <li
                key={entry.id}
                className="px-5 py-3 flex items-start gap-3 hover:bg-surface-muted/40 transition-colors"
              >
                <Avatar name={f.actor} size="sm" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-text leading-[1.45]">
                    <span className="font-medium">{f.actor}</span>{' '}
                    <span className="text-text-muted">{f.text}</span>
                  </p>
                  <p
                    className="text-[11px] text-text-subtle font-mono tabular-nums mt-0.5"
                    title={new Date(entry.created_at).toLocaleString(LOCALE_BCP47[i18n.locale])}
                  >
                    {formatActivityTime(i18n, entry.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length === limit && (
        <div className="px-5 py-3 border-t border-border bg-surface-muted/30">
          <p className="text-[11px] text-text-subtle font-medium uppercase tracking-[0.05em]">
            {fmt(t.activity.block.showingLast, { limit })}
          </p>
        </div>
      )}
    </Card>
  );
}
