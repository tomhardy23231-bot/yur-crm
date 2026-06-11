import { CalendarOff } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import type { Absence, AbsenceKind } from '@/lib/types/db';
import { AbsenceCreateForm } from './absence-create-form';
import { DeleteAbsenceButton } from './delete-absence-button';

const DAY_MS = 86_400_000;

// date 'YYYY-MM-DD' → 'DD.MM.YYYY' без таймзонных сдвигов.
function fmtDate(s: string): string {
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

// Кол-во дней отсутствия (включительно).
function dayCount(starts: string, ends: string): number {
  const a = new Date(starts + 'T00:00:00Z').getTime();
  const b = new Date(ends + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / DAY_MS) + 1);
}

// Положение относительно сегодня — для мягкого статуса.
function position(starts: string, ends: string, today: string): 'current' | 'upcoming' | 'past' {
  if (ends < today) return 'past';
  if (starts > today) return 'upcoming';
  return 'current';
}

// Бейдж типа отсутствия. vacation — фирменный violet-токен (--absence); sick —
// тёплый warning; other — нейтральный.
function KindBadge({ kind, label }: { kind: AbsenceKind; label: string }) {
  if (kind === 'sick') return <Badge tone="warning">{label}</Badge>;
  if (kind === 'other') return <Badge tone="neutral">{label}</Badge>;
  return <Badge className="text-absence bg-absence-bg">{label}</Badge>;
}

export async function AbsencesBlock({
  userId,
  absences,
  canManage,
}: {
  userId: string;
  absences: Absence[];
  canManage: boolean;
}) {
  const { t, plural } = await getT();
  // Сегодня в локальной зоне как YYYY-MM-DD (даты absences — календарные).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const POS_CLASS: Record<'current' | 'upcoming' | 'past', string> = {
    current: 'text-success-text',
    upcoming: 'text-text-muted',
    past: 'text-text-subtle',
  };
  const POS_LABEL: Record<'current' | 'upcoming' | 'past', string> = {
    current: t.absences.block.current,
    upcoming: t.absences.block.upcoming,
    past: t.absences.block.past,
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CalendarOff size={17} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">{t.absences.block.heading}</h2>
        {absences.length > 0 && (
          <span className="text-[12.5px] text-text-muted">
            · {plural(t.absences.block.count, absences.length)}
          </span>
        )}
      </div>

      {absences.length === 0 ? (
        <Card className="px-6 py-8 text-center">
          <p className="text-[13px] text-text-muted">
            {canManage ? t.absences.block.emptyManage : t.absences.block.empty}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {absences.map((a) => {
            const pos = position(a.starts_on, a.ends_on, today);
            const days = dayCount(a.starts_on, a.ends_on);
            const periodText =
              a.starts_on === a.ends_on
                ? fmtDate(a.starts_on)
                : t.absences.block.period
                    .replace('{from}', fmtDate(a.starts_on))
                    .replace('{to}', fmtDate(a.ends_on));
            return (
              <div key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={a.kind} label={t.enums.absenceKind[a.kind]} />
                    <span className="text-[13.5px] font-medium tabular-nums text-text">{periodText}</span>
                    <span className="text-[12px] text-text-subtle">· {plural(t.absences.block.days, days)}</span>
                    <span className={`text-[11px] font-semibold ${POS_CLASS[pos]}`}>{POS_LABEL[pos]}</span>
                  </div>
                  {a.note && <p className="text-[12.5px] text-text-muted">{a.note}</p>}
                </div>
                {canManage && <DeleteAbsenceButton absenceId={a.id} userId={userId} />}
              </div>
            );
          })}
        </Card>
      )}

      {canManage && (
        <Card className="px-4 py-4">
          <AbsenceCreateForm userId={userId} />
        </Card>
      )}
    </section>
  );
}
