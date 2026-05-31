'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { UserPlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createClientInlineAction,
  type ClientFormFields,
  type InlineClientState,
} from '@/lib/clients/actions';
import {
  CLIENT_KINDS,
  CLIENT_KIND_LABEL,
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  type ClientKind,
} from '@/lib/types/db';

const INITIAL: InlineClientState = { ok: false };

export type CreatedClient = {
  id: string;
  name: string;
  client_kind: ClientKind;
};

// Задача 5: модалка создания клиента «на месте» из формы дела. Монтируется
// родителем только когда открыта (свежий useActionState на каждый показ).
export function InlineClientCreate({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (client: CreatedClient) => void;
}) {
  const [state, formAction] = useActionState(createClientInlineAction, INITIAL);

  // Успех → отдаём клиента родителю (он подставит в селект и закроет модалку).
  useEffect(() => {
    if (state.ok && state.client) {
      onCreated(state.client);
    }
  }, [state, onCreated]);

  // ESC закрывает модалку.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function err(field: ClientFormFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Новый клиент"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
            <UserPlus size={16} strokeWidth={1.75} className="text-primary" />
            Новый клиент
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-md p-1 text-text-subtle transition-colors hover:bg-surface-muted hover:text-text"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          <Field label="Имя или наименование" htmlFor="ic-name" error={err('name')} required>
            <Input
              id="ic-name"
              name="name"
              autoFocus
              required
              maxLength={200}
              aria-invalid={err('name') ? 'true' : undefined}
              placeholder="Иванов Иван Иванович / ООО «Ромашка»"
            />
          </Field>

          <Field label="Тип клиента" htmlFor="ic-kind" error={err('client_kind')} required>
            <Select id="ic-kind" name="client_kind" defaultValue="individual">
              {CLIENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CLIENT_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Телефон" htmlFor="ic-phone" error={err('phone')}>
              <Input
                id="ic-phone"
                name="phone"
                type="tel"
                className="font-mono"
                placeholder="+38 067 000 00 00"
              />
            </Field>
            <Field label="E-mail" htmlFor="ic-email" error={err('email')}>
              <Input
                id="ic-email"
                name="email"
                type="email"
                className="font-mono"
                placeholder="client@example.com"
                aria-invalid={err('email') ? 'true' : undefined}
              />
            </Field>
          </div>

          <Field label="Источник" htmlFor="ic-source" error={err('source')}>
            <Select id="ic-source" name="source" defaultValue="">
              <option value="">— не указан —</option>
              {CLIENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Заметки" htmlFor="ic-notes" error={err('notes')}>
            <Textarea
              id="ic-notes"
              name="notes"
              rows={2}
              placeholder="Опционально"
            />
          </Field>

          {state.message && !state.ok && (
            <p
              role="alert"
              className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error"
            >
              {state.message}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <SaveButton />
          </div>
        </form>
      </div>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Сохранение…' : 'Создать и выбрать'}
    </Button>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
      >
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
