'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Pencil, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import {
  renameDepartmentAction,
  setDepartmentActiveAction,
} from '@/lib/departments/actions';

// Inline-переименование подразделения. Кнопка-карандаш раскрывает поле + сохранить.
// Сервер no-op'ит, если имя не изменилось / занято (тихо). owner-only — родитель
// рендерит контролы только для owner.
export function DepartmentNameControl({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[14px] font-medium text-text">{name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t.departments.rename.title}
          className="text-text-subtle hover:text-text transition-colors"
        >
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      </span>
    );
  }

  return (
    <form
      ref={formRef}
      action={renameDepartmentAction}
      onSubmit={() => setEditing(false)}
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="id" value={id} />
      <Input
        name="name"
        type="text"
        maxLength={100}
        defaultValue={name}
        aria-label={t.departments.rename.ariaLabel}
        autoFocus
        className="h-8 w-[200px]"
      />
      <Button type="submit" variant="secondary" size="sm" aria-label={t.departments.rename.save}>
        <Check size={14} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setEditing(false)}
        aria-label={t.common.cancel}
      >
        <X size={14} strokeWidth={2} />
      </Button>
    </form>
  );
}

// Кнопка скрыть/вернуть подразделение (is_active).
export function DepartmentActiveControl({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  return (
    <form action={setDepartmentActiveAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={isActive ? 'false' : 'true'} />
      <ActiveSubmit isActive={isActive} />
    </form>
  );
}

function ActiveSubmit({ isActive }: { isActive: boolean }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={isActive ? 'ghost' : 'secondary'}
      size="sm"
      disabled={pending}
    >
      {isActive ? t.departments.deactivate : t.departments.activate}
    </Button>
  );
}
