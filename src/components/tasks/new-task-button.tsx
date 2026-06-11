'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { createTaskAction } from '@/lib/tasks/actions';
import { useI18n } from '@/lib/i18n/provider';
import type { AssigneeOption } from '@/lib/tasks/queries';
import type { CaseSelectOption } from '@/lib/cases/queries';

import { TaskForm } from './task-form';

interface NewTaskButtonProps {
  assignees: AssigneeOption[];
  cases: ReadonlyArray<CaseSelectOption>;
  /** Текущий пользователь — исполнитель по умолчанию. */
  currentUserId: string;
  /** Подпись кнопки (локализуется вызывающей серверной страницей). */
  label: string;
  /** Предзаполненный срок (datetime-local) — например, выбранный день календаря. */
  defaultDueAt?: string;
  /** Реагировать на ?new=1 в URL (вход из командной палитры на /tasks). */
  openOnNewParam?: boolean;
  variant?: 'primary' | 'secondary';
}

// Глобальное создание задачи (v3 Сессия 6): кнопка → модалка с TaskForm и
// комбобоксом «Дело». Создание задач разрешено всем ролям (CLAUDE.md §7-6);
// RLS ограничит выбор видимыми делами. После успеха server action сам
// revalidate'ит /tasks, /calendar и карточку дела — остаётся закрыть модалку.
export function NewTaskButton({
  assignees,
  cases,
  currentUserId,
  label,
  defaultDueAt,
  openOnNewParam = false,
  variant = 'primary',
}: NewTaskButtonProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isNewParam = openOnNewParam && searchParams.get('new') === '1';
  const [open, setOpen] = useState(false);
  // Открыта кнопкой ИЛИ параметром URL — без эффекта синхронизации.
  const effectiveOpen = open || isNewParam;

  function close() {
    setOpen(false);
    if (isNewParam) {
      // Снимаем ?new=1, чтобы модалка не вернулась при следующем рендере.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      const s = params.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
      >
        <Plus size={14} strokeWidth={2} />
        {label}
      </Button>

      <Modal
        open={effectiveOpen}
        onClose={close}
        title={t.tasks.page.newTask}
        closeLabel={t.common.close}
      >
        <TaskForm
          action={createTaskAction}
          assignees={assignees}
          cases={cases}
          defaultAssigneeId={currentUserId}
          defaultDueAt={defaultDueAt}
          submitLabel={t.tasks.caseBlock.createSubmit}
          onSuccess={close}
        />
      </Modal>
    </>
  );
}
