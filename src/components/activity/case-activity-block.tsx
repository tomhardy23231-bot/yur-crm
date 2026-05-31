import { History } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { listCaseActivity, resolveActivityNames } from '@/lib/activity-log/queries';
import {
  formatActivity,
  formatActivityTime,
  collectActivityIds,
} from '@/lib/activity-log/format';

interface CaseActivityBlockProps {
  caseId: string;
  /** Сколько последних записей показывать. */
  limit?: number;
}

export async function CaseActivityBlock({
  caseId,
  limit = 20,
}: CaseActivityBlockProps) {
  const entries = await listCaseActivity(caseId, limit);
  // Резолвим UUID юристов/Експертов/клиентов из записей в имена (Задача 3).
  const { userIds, clientIds } = collectActivityIds(entries);
  const nameById = await resolveActivityNames(userIds, clientIds);

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <History size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">История</h2>
        {entries.length > 0 && (
          <span className="text-[12px] text-text-muted">
            · {entries.length}{' '}
            {plural(entries.length, ['событие', 'события', 'событий'])}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-10 px-6 flex flex-col items-center text-center">
          <p className="text-[13px] text-text-muted max-w-md">
            Изменений по делу пока не было.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            const f = formatActivity(entry, nameById);
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
                    title={new Date(entry.created_at).toLocaleString('ru-RU')}
                  >
                    {formatActivityTime(entry.created_at)}
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
            Показаны {limit} последних событий
          </p>
        </div>
      )}
    </Card>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
