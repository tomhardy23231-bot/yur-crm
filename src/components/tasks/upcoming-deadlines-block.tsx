import Link from 'next/link';
import { Bell } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { TaskRow } from '@/components/tasks/task-row';
import { listUpcomingTasks } from '@/lib/tasks/queries';

interface UpcomingDeadlinesBlockProps {
  /** Горизонт в часах (по умолчанию 72ч). */
  hoursAhead?: number;
  /** Лимит карточек. */
  limit?: number;
}

// Блок «Приближающиеся сроки» на главной (Шаг 10).
// Запрос фильтрует RLS — каждый видит только свои дела (admin — все).
export async function UpcomingDeadlinesBlock({
  hoursAhead = 72,
  limit = 10,
}: UpcomingDeadlinesBlockProps = {}) {
  const upcoming = await listUpcomingTasks({ hoursAhead, limit });

  return (
    <Card className="max-w-3xl">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Bell size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          Приближающиеся сроки
        </h2>
        <span className="text-[12px] text-text-muted">· ближайшие 3 дня</span>
        <span className="ml-auto">
          <Link
            href="/tasks?status=open&mode=all"
            className="text-[12px] text-primary hover:underline"
          >
            Все задачи →
          </Link>
        </span>
      </div>

      {upcoming.length === 0 ? (
        <div className="py-10 px-6 flex flex-col items-center text-center">
          <p className="text-[13px] text-text-muted max-w-md">
            На ближайшие 3 дня ничего не запланировано — день под контролем.
          </p>
        </div>
      ) : (
        <div>
          {upcoming.map((t) => (
            <TaskRow key={t.id} task={t} canManage={false} showCase />
          ))}
        </div>
      )}
    </Card>
  );
}
