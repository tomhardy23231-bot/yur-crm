import { Clock, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import {
  getCaseTimeAggregate,
  listTimeEntriesByCase,
} from '@/lib/time-entries/queries';
import { formatMinutes } from '@/lib/time-entries/parse';
import { listTasksByCase } from '@/lib/tasks/queries';

import { TimeEntryForm } from './time-entry-form';
import { TimeEntryRow } from './time-entry-row';

interface CaseTimeEntriesBlockProps {
  caseId: string;
  /** Дефолтная ставка из case.hourly_rate (для prefill формы). */
  defaultHourlyRate: number | null;
  /** Может ли пользователь логировать (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** is_staff (может удалять любые entries; не-staff — только свои). */
  isStaff: boolean;
  /** id текущего пользователя (для проверки «своя запись → можно удалить»). */
  currentUserId: string;
}

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export async function CaseTimeEntriesBlock({
  caseId,
  defaultHourlyRate,
  canWrite,
  isStaff,
  currentUserId,
}: CaseTimeEntriesBlockProps) {
  // Параллельно — entries + агрегаты + список задач для опционального
  // прикрепления в форме.
  const [entries, agg, tasks] = await Promise.all([
    listTimeEntriesByCase(caseId),
    getCaseTimeAggregate(caseId),
    listTasksByCase(caseId),
  ]);

  // Только открытые задачи в выборе формы — закрытые не имеют смысла
  // как контекст логирования времени.
  const openTaskOptions = tasks
    .filter((t) => t.status === 'open')
    .map((t) => ({ id: t.id, title: t.title }));

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Clock size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">Учёт времени</h2>
        <span className="text-[12px] text-text-muted">
          · {entries.length}{' '}
          {plural(entries.length, ['запись', 'записи', 'записей'])}
        </span>

        {agg.total_minutes > 0 && (
          <span className="ml-auto flex items-center gap-3 text-[12.5px] text-text-muted">
            <span>
              всего{' '}
              <span className="font-mono tabular-nums font-semibold text-text">
                {formatMinutes(agg.total_minutes)}
              </span>
            </span>
            {agg.billable_minutes > 0 &&
              agg.billable_minutes !== agg.total_minutes && (
                <span>
                  опл.{' '}
                  <span className="font-mono tabular-nums font-semibold text-text">
                    {formatMinutes(agg.billable_minutes)}
                  </span>
                </span>
              )}
            {agg.billable_amount > 0 && (
              <span>
                ≈{' '}
                <span className="font-mono tabular-nums font-bold text-success">
                  {MONEY_FMT.format(agg.billable_amount)} ₴
                </span>
              </span>
            )}
          </span>
        )}
      </div>

      {canWrite && (
        <details className="group border-b border-border">
          <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:bg-primary-subtle/50 transition-colors w-full">
            <Plus
              size={14}
              strokeWidth={2}
              className="transition-transform group-open:rotate-45"
            />
            Залогировать время
          </summary>
          <div className="px-5 pb-5 pt-1">
            <TimeEntryForm
              caseId={caseId}
              defaultHourlyRate={defaultHourlyRate}
              tasks={openTaskOptions}
            />
          </div>
        </details>
      )}

      {entries.length === 0 ? (
        <EmptyState canWrite={canWrite} />
      ) : (
        <div>
          {entries.map((e) => {
            const ownEntry = e.user_id === currentUserId;
            return (
              <TimeEntryRow
                key={e.id}
                entry={e}
                canDelete={isStaff || ownEntry}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center text-center">
      <p className="text-[13px] text-text-muted max-w-md">
        {canWrite
          ? 'Записей пока нет. Залогируйте первый час работы — сумма автоматически посчитается по ставке дела.'
          : 'По этому делу часы пока не учитывались.'}
      </p>
    </div>
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
