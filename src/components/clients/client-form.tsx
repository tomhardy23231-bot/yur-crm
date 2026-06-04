'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import type { ClientActionState, ClientFormFields } from '@/lib/clients/actions';
import {
  CLIENT_KINDS,
  CLIENT_SOURCES,
  clientKindHasFullName,
  type Client,
  type ClientKind,
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
  const { t } = useI18n();
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
        case 'last_name': return client.last_name ?? '';
        case 'first_name': return client.first_name ?? '';
        case 'middle_name': return client.middle_name ?? '';
        case 'birth_date': return client.birth_date ?? '';
        case 'inn': return client.inn ?? '';
        case 'contract_number': return client.contract_number ?? '';
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

  // Тип клиента контролируем стейтом: от него зависит, показывать ФИО (физлицо/ФОП)
  // или единое «Наименование» (компания).
  const [kind, setKind] = useState<ClientKind>(
    (value('client_kind') || 'individual') as ClientKind,
  );
  const hasFullName = clientKindHasFullName(kind);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t.clients.form.kindLabel} htmlFor="client_kind" error={err('client_kind')} required>
          <Select
            id="client_kind"
            name="client_kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ClientKind)}
            aria-invalid={err('client_kind') ? 'true' : undefined}
          >
            {CLIENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.enums.clientKind[k]}
              </option>
            ))}
          </Select>
        </Field>

        {hasFullName ? (
          <>
            <Field label={t.clients.form.lastName} htmlFor="last_name" error={err('last_name')} required>
              <Input
                id="last_name"
                name="last_name"
                defaultValue={value('last_name')}
                autoFocus
                required
                maxLength={100}
                aria-invalid={err('last_name') ? 'true' : undefined}
                placeholder={t.clients.form.lastNamePlaceholder}
              />
            </Field>
            <Field label={t.clients.form.firstName} htmlFor="first_name" error={err('first_name')} required>
              <Input
                id="first_name"
                name="first_name"
                defaultValue={value('first_name')}
                required
                maxLength={100}
                aria-invalid={err('first_name') ? 'true' : undefined}
                placeholder={t.clients.form.firstNamePlaceholder}
              />
            </Field>
            <Field label={t.clients.form.middleName} htmlFor="middle_name" error={err('middle_name')}>
              <Input
                id="middle_name"
                name="middle_name"
                defaultValue={value('middle_name')}
                maxLength={100}
                aria-invalid={err('middle_name') ? 'true' : undefined}
                placeholder={t.clients.form.middleNamePlaceholder}
              />
            </Field>
            <Field label={t.clients.form.birthDate} htmlFor="birth_date" error={err('birth_date')}>
              <Input
                id="birth_date"
                name="birth_date"
                type="date"
                defaultValue={value('birth_date')}
                aria-invalid={err('birth_date') ? 'true' : undefined}
                className="font-mono"
              />
            </Field>
          </>
        ) : (
          <Field
            label={t.clients.form.companyName}
            htmlFor="name"
            error={err('name')}
            required
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={value('name')}
              autoFocus
              required
              maxLength={200}
              aria-invalid={err('name') ? 'true' : undefined}
              placeholder={t.clients.form.companyNamePlaceholder}
            />
          </Field>
        )}

        <Field
          label={hasFullName ? t.clients.form.inn : t.clients.form.innEdrpou}
          htmlFor="inn"
          error={err('inn')}
        >
          <Input
            id="inn"
            name="inn"
            defaultValue={value('inn')}
            inputMode="numeric"
            maxLength={12}
            aria-invalid={err('inn') ? 'true' : undefined}
            placeholder={t.clients.form.innPlaceholder}
            className="font-mono"
          />
        </Field>

        <Field label={t.clients.form.contractNumber} htmlFor="contract_number" error={err('contract_number')}>
          <Input
            id="contract_number"
            name="contract_number"
            defaultValue={value('contract_number')}
            maxLength={100}
            aria-invalid={err('contract_number') ? 'true' : undefined}
            placeholder={t.clients.form.contractNumberPlaceholder}
            className="font-mono"
          />
        </Field>

        <Field label={t.clients.form.phone} htmlFor="phone" error={err('phone')}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={value('phone')}
            placeholder={t.clients.form.phonePlaceholder}
            className="font-mono"
          />
        </Field>

        <Field label={t.clients.form.email} htmlFor="email" error={err('email')}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={value('email')}
            placeholder={t.clients.form.emailPlaceholder}
            aria-invalid={err('email') ? 'true' : undefined}
            className="font-mono"
          />
        </Field>

        <Field label={t.clients.form.address} htmlFor="address" error={err('address')}>
          <Input
            id="address"
            name="address"
            defaultValue={value('address')}
            placeholder={t.clients.form.addressPlaceholder}
          />
        </Field>

        <Field label={t.clients.form.source} htmlFor="source" error={err('source')}>
          <Select
            id="source"
            name="source"
            defaultValue={value('source')}
            aria-invalid={err('source') ? 'true' : undefined}
          >
            <option value="">{t.clients.form.sourceNone}</option>
            {CLIENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t.enums.clientSource[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.clients.form.notes} htmlFor="notes" error={err('notes')} className="sm:col-span-2 lg:col-span-3">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={value('notes')}
            placeholder={t.clients.form.notesPlaceholder}
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
        <SubmitButton label={submitLabel} savingLabel={t.common.saving} />
        <Button asChild variant="ghost" type="button">
          <Link href={cancelHref}>{t.common.cancel}</Link>
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

function SubmitButton({ label, savingLabel }: { label: string; savingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? savingLabel : label}
    </Button>
  );
}
