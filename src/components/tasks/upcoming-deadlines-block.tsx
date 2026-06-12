import Link from 'next/link';
import { Bell, AlertTriangle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskRow } from '@/components/tasks/task-row';
import { getT } from '@/lib/i18n/server';
import type { UpcomingTasks } from '@/lib/tasks/queries';

// Блок «Приближающиеся сроки» на главной (Шаг 10).
// Запрос фильтрует RLS — каждый видит только свои дела (admin — все).
// v3 Сессия 4: две подсекции — «Просроченные (N)» и «Ближайшие 72 часа», чтобы
// просрочки были видны отдельно, а не терялись среди будущих дедлайнов.
// v3 Сессия 11: данные передаёт страница (один вызов listUpcomingTasks на
// дашборд — срез today из того же результата уходит в «Мой день»).
export async function UpcomingDeadlinesBlock({ data }: { data: UpcomingTasks }) {
  const { t } = await getT();
  const { overdue, overdueCount, soon } = data;

  const isEmpty = overdueCount === 0 && soon.length === 0;

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Bell size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.tasks.upcoming.heading}
        </h2>
        <span className="text-[12px] text-text-muted">
          {t.tasks.upcoming.subtitle}
        </span>
        <span className="ml-auto">
          <Link
            href="/tasks?status=open&mode=all"
            className="text-[12px] text-primary hover:underline"
          >
            {t.tasks.upcoming.allTasks}
          </Link>
        </span>
      </div>

      {isEmpty ? (
        <EmptyState title={t.tasks.upcoming.empty} />
      ) : (
        <div>
          {overdueCount > 0 && (
            <section>
              <div className="flex items-center gap-2 px-5 py-2.5 bg-error-bg/40 border-b border-border">
                <AlertTriangle
                  size={14}
                  strokeWidth={2}
                  className="text-error"
                />
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-error">
                  {t.tasks.upcoming.overdueHeading} ({overdueCount})
                </h3>
              </div>
              {overdue.map((task) => (
                <TaskRow key={task.id} task={task} canManage={false} showCase />
              ))}
            </section>
          )}

          {soon.length > 0 && (
            <section>
              <div className="px-5 py-2.5 border-b border-border">
                <h3 className="text-[12px] font-semibold text-text-muted">
                  {t.tasks.upcoming.soonHeading}
                </h3>
              </div>
              {soon.map((task) => (
                <TaskRow key={task.id} task={task} canManage={false} showCase />
              ))}
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
