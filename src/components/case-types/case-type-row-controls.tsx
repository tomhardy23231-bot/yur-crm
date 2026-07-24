'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Pencil, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import {
  renameCaseTypeAction,
  setCaseTypeActiveAction,
} from '@/lib/case-types/actions';

// Inline-переименование типа дела. Встроенные типы (is_builtin) переименовать
// нельзя — их лейбл берётся из словаря; показываем только название. Права держит
// RLS/экшен (cap manage_case_types) — родитель рендерит контролы только тем, кто
// вправе (страница за requireCap).
export function CaseTypeNameControl({
  id,
  name,
  isBuiltin,
}: {
  id: string;
  name: string;
  isBuiltin: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (isBuiltin) {
    return <span className="text-[14px] font-medium text-text">{name}</span>;
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[14px] font-medium text-text">{name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t.caseTypes.rename.title}
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
      action={renameCaseTypeAction}
      onSubmit={() => setEditing(false)}
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="id" value={id} />
      <Input
        name="name"
        type="text"
        maxLength={60}
        defaultValue={name}
        aria-label={t.caseTypes.rename.ariaLabel}
        autoFocus
        className="h-8 w-[200px]"
      />
      <Button type="submit" variant="secondary" size="sm" aria-label={t.caseTypes.rename.save}>
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

// Кнопка скрыть/вернуть тип дела (is_active).
export function CaseTypeActiveControl({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  return (
    <form action={setCaseTypeActiveAction}>
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
      {isActive ? t.caseTypes.deactivate : t.caseTypes.activate}
    </Button>
  );
}
