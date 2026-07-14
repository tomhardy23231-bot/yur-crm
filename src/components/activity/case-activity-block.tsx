import {
  ArrowLeftRight,
  Banknote,
  FileSpreadsheet,
  FileText,
  History,
  MessageSquare,
  Pencil,
  Plus,
} from 'lucide-react';

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

// Иконка события по `activity_log.action` (каркас: таймлайн с кружками).
// Эвристика по подстроке — действия именуются '<entity>_<verb>'.
function actionIcon(action: string): React.ElementType {
  if (action.includes('payment') || action.includes('payout')) return Banknote;
  if (action.includes('stage')) return ArrowLeftRight;
  if (action.includes('comment')) return MessageSquare;
  if (action.includes('document')) return FileText;
  if (action.includes('act')) return FileSpreadsheet;
  if (action.includes('created')) return Plus;
  return Pencil;
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
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <History size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">{t.activity.block.title}</h2>
        {entries.length > 0 && (
          <span className="text-[12px] text-text-muted">
            · {plural(t.activity.block.count, entries.length)}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <p className="max-w-md text-[13px] text-text-muted">
            {t.activity.block.empty}
          </p>
        </div>
      ) : (
        // Таймлайн (каркас): кружок-иконка + вертикальная линия между записями.
        <ol className="flex flex-col px-3 py-2">
          {entries.map((entry, i) => {
            const f = formatActivity(i18n, entry, nameById);
            const Icon = actionIcon(entry.action);
            const last = i === entries.length - 1;
            return (
              <li
                key={entry.id}
                className="relative flex items-start gap-3 rounded-xl px-2 py-2.5"
              >
                <div className="relative flex flex-col items-center self-stretch">
                  <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-pressed ring-4 ring-surface">
                    <Icon size={13} strokeWidth={2.2} />
                  </span>
                  {!last && (
                    <span
                      className="absolute top-8 h-[calc(100%-0.75rem)] w-px bg-border"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-[13px] leading-snug text-text">
                    <span className="font-semibold">{f.actor}</span>{' '}
                    <span className="text-text-muted">{f.text}</span>
                  </p>
                  <p
                    className="mt-0.5 text-[11px] tabular-nums text-text-subtle"
                    title={new Date(entry.created_at).toLocaleString(
                      LOCALE_BCP47[i18n.locale],
                    )}
                  >
                    {formatActivityTime(i18n, entry.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {entries.length === limit && (
        <div className="border-t border-border bg-surface-muted/30 px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-subtle">
            {fmt(t.activity.block.showingLast, { limit })}
          </p>
        </div>
      )}
    </Card>
  );
}
