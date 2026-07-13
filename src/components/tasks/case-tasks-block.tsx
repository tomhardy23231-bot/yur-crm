import { CheckSquare, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getT } from '@/lib/i18n/server';
import { createTaskAction } from '@/lib/tasks/actions';
import { listAssignableUsers, listTasksByCase } from '@/lib/tasks/queries';
import type { Messages } from '@/lib/i18n/messages';
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
  const { t, plural, fmt } = await getT();
  const [tasks, assignees] = await Promise.all([
    listTasksByCase(caseId),
    canWrite ? listAssignableUsers() : Promise.resolve([]),
  ]);

  const open = tasks.filter((task) => task.status === 'open');
  const done = tasks.filter((task) => task.status === 'done');

  return (
    // id="tasks" — якорь для гайд-тура (case-tasks); это вкладка по умолчанию.
    <Card id="tasks" className="scroll-mt-20">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <CheckSquare size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.tasks.caseBlock.heading}
        </h2>
        <span className="text-[12px] text-text-muted">
          · {plural(t.tasks.caseBlock.open, open.length)}
          {done.length > 0 &&
            ` · ${fmt(t.tasks.caseBlock.doneCount, { n: done.length })}`}
        </span>
      </div>

      {canWrite && (
        // id — для кнопки «+ Задача» в шапке карточки (раскрытие формы, v3 s11).
        <details id="task-create-details" className="group border-b border-border">
          <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:bg-primary-subtle/50 transition-colors w-full">
            <Plus
              size={14}
              strokeWidth={2}
              className="transition-transform group-open:rotate-45"
            />
            {t.tasks.caseBlock.addTask}
          </summary>
          <div className="px-5 pb-5 pt-1">
            <TaskForm
              action={createTaskAction}
              assignees={assignees}
              lockedCaseId={caseId}
              defaultAssigneeId={currentUserId}
              submitLabel={t.tasks.caseBlock.createSubmit}
              compact
            />
          </div>
        </details>
      )}

      {open.length === 0 && done.length === 0 ? (
        <EmptyState
          title={
            canWrite
              ? t.tasks.caseBlock.emptyWritable
              : t.tasks.caseBlock.emptyReadonly
          }
        />
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
            <DoneSection tasks={done} canWrite={canWrite} t={t} fmt={fmt} />
          )}
        </>
      )}
    </Card>
  );
}

function DoneSection({
  tasks,
  canWrite,
  t,
  fmt,
}: {
  tasks: TaskWithRefs[];
  canWrite: boolean;
  t: Messages;
  fmt: (template: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <details className="border-t border-border">
      <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-subtle hover:bg-primary-softer transition-colors w-full">
        {fmt(t.tasks.caseBlock.doneSection, { n: tasks.length })}
      </summary>
      <div>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} canManage={canWrite} />
        ))}
      </div>
    </details>
  );
}

