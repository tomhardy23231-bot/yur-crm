import { CheckSquare, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { createTaskAction } from '@/lib/tasks/actions';
import { listAssignableUsers, listTasksByCase } from '@/lib/tasks/queries';
import type { TaskWithRefs } from '@/lib/types/db';

import { TaskForm } from './task-form';
import { TaskRow } from './task-row';

interface CaseTasksBlockProps {
  caseId: string;
  canWrite: boolean;
  /** Текущий пользователь — для defaultAssignee. */
  currentUserId: string;
}

export async function CaseTasksBlock({
  caseId,
  canWrite,
  currentUserId,
}: CaseTasksBlockProps) {
  const [tasks, assignees] = await Promise.all([
    listTasksByCase(caseId),
    canWrite ? listAssignableUsers() : Promise.resolve([]),
  ]);

  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <CheckSquare size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">Задачи и заседания</h2>
        <span className="text-[12px] text-text-muted">
          · {open.length}{' '}
          {plural(open.length, ['открытая', 'открытых', 'открытых'])}
          {done.length > 0 && ` · ${done.length} завершено`}
        </span>
      </div>

      {canWrite && (
        <details className="group border-b border-border">
          <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:bg-primary-subtle/50 transition-colors w-full">
            <Plus
              size={14}
              strokeWidth={2}
              className="transition-transform group-open:rotate-45"
            />
            Добавить задачу
          </summary>
          <div className="px-5 pb-5 pt-1">
            <TaskForm
              action={createTaskAction}
              assignees={assignees}
              lockedCaseId={caseId}
              defaultAssigneeId={currentUserId}
              submitLabel="Создать"
              compact
            />
          </div>
        </details>
      )}

      {open.length === 0 && done.length === 0 ? (
        <EmptyState canWrite={canWrite} />
      ) : (
        <>
          {open.length > 0 && (
            <div>
              {open.map((t) => (
                <TaskRow key={t.id} task={t} canManage={canWrite} />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <DoneSection tasks={done} canWrite={canWrite} />
          )}
        </>
      )}
    </Card>
  );
}

function DoneSection({
  tasks,
  canWrite,
}: {
  tasks: TaskWithRefs[];
  canWrite: boolean;
}) {
  return (
    <details className="border-t border-border">
      <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-subtle hover:bg-surface-muted/50 transition-colors w-full">
        Завершённые ({tasks.length})
      </summary>
      <div>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} canManage={canWrite} />
        ))}
      </div>
    </details>
  );
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center text-center">
      <p className="text-[13px] text-text-muted max-w-md">
        {canWrite
          ? 'Пока нет задач. Добавьте первую — она появится в общем календаре и в списке задач.'
          : 'Пока нет задач по этому делу.'}
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
