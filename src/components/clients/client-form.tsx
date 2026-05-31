'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import type { ClientActionState, ClientFormFields } from '@/lib/clients/actions';
import {
  CLIENT_KIND_LABEL,
  CLIENT_KINDS,
  CLIENT_SOURCE_LABEL,
  CLIENT_SOURCES,
  type Client,
} from '@/lib/types/db';

const INITIAL: ClientActionState = { ok: false };

type Action = (
  prev: ClientActionState,
  formData: FormData,
) => Promise<ClientActionState>;

interface ClientFormProps {
  action: Action;
  /** Если задан — режим редактирования: подставляются значения из клиента. */
  client?: Client;
  submitLabel: string;
  cancelHref: string;
}

export function ClientForm({ action, client, submitLabel, cancelHref }: ClientFormProps) {
  const [state, formAction] = useActionState<ClientActionState, FormData>(
    action,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useShakeInvalidFields(formRef, state);

  // Приоритет: то, что прислал action (после ошибки валидации) → исходный клиент.
  function value(field: ClientFormFields): string {
    if (state.values && state.values[field] !== undefined) {
      return state.values[field] ?? '';
    }
    if (client) {
      switch (field) {
        case 'name': return client.name;
        case 'client_kind': return client.client_kind;
        case 'phone': return client.phone ?? '';
        case 'email': return client.email ?? '';
        case 'address': return client.address ?? '';
        case 'source': return client.source ?? '';
        case 'notes': return client.notes ?? '';
      }
    }
    return '';
  }

  function err(field: ClientFormFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Имя или наименование" htmlFor="name" error={err('name')} required>
          <Input
            id="name"
            name="name"
            defaultValue={value('name')}
            autoFocus
            required
            maxLength={200}
            aria-invalid={err('name') ? 'true' : undefined}
            placeholder="Иванов Иван Иванович / ООО «Ромашка»"
          />
        </Field>

        <Field label="Тип клиента" htmlFor="client_kind" error={err('client_kind')} required>
          <Select
            id="client_kind"
            name="client_kind"
            defaultValue={value('client_kind') || 'individual'}
            aria-invalid={err('client_kind') ? 'true' : undefined}
          >
            {CLIENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {CLIENT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Телефон" htmlFor="phone" error={err('phone')}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={value('phone')}
            placeholder="+38 067 000 00 00"
            className="font-mono"
          />
        </Field>

        <Field label="E-mail" htmlFor="email" error={err('email')}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={value('email')}
            placeholder="client@example.com"
            aria-invalid={err('email') ? 'true' : undefined}
            className="font-mono"
          />
        </Field>

        <Field label="Адрес" htmlFor="address" error={err('address')}>
          <Input
            id="address"
            name="address"
            defaultValue={value('address')}
            placeholder="г. Киев, ул. Крещатик, 1"
          />
        </Field>

        <Field label="Источник" htmlFor="source" error={err('source')}>
          <Select
            id="source"
            name="source"
            defaultValue={value('source')}
            aria-invalid={err('source') ? 'true' : undefined}
          >
            <option value="">— не указан —</option>
            {CLIENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Заметки" htmlFor="notes" error={err('notes')} className="sm:col-span-2">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={value('notes')}
            placeholder="Любая внутренняя информация о клиенте"
            rows={4}
          />
        </Field>
      </div>

      {state.message && !state.fieldErrors && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <SubmitButton label={submitLabel} />
        <Button asChild variant="ghost" type="button">
          <Link href={cancelHref}>Отмена</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={htmlFor} className="text-[12px] uppercase tracking-[0.04em] text-text-muted">
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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Сохранение…' : label}
    </Button>
  );
}
