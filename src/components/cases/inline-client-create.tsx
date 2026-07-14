'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createClientInlineAction,
  type ClientFormFields,
  type InlineClientState,
} from '@/lib/clients/actions';
import { useI18n } from '@/lib/i18n/provider';
import {
  CLIENT_KINDS,
  CLIENT_SOURCES,
  clientKindHasFullName,
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
  const { t } = useI18n();
  const [state, formAction] = useActionState(createClientInlineAction, INITIAL);
  // Тип клиента определяет, показывать ФИО (физлицо/ФОП) или «Наименование» (компания).
  const [kind, setKind] = useState<ClientKind>('individual');
  const hasFullName = clientKindHasFullName(kind);

  // Успех → отдаём клиента родителю (он подставит в селект и закроет модалку).
  useEffect(() => {
    if (state.ok && state.client) {
      onCreated(state.client);
    }
  }, [state, onCreated]);

  function err(field: ClientFormFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  // Канон модалок — общий ui/modal.tsx (подложка bg-overlay + blur, rounded-modal,
  // шапка с крестиком, ESC/фокус-ловушка внутри Modal).
  return (
    <Modal
      open
      onClose={onClose}
      title={t.caseCard.inlineClient.title}
      closeLabel={t.caseCard.inlineClient.closeAria}
    >
        <form action={formAction} className="flex flex-col gap-3">
          <Field
            label={t.caseCard.inlineClient.kind}
            htmlFor="ic-kind"
            error={err('client_kind')}
            required
          >
            <Select
              id="ic-kind"
              name="client_kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ClientKind)}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label={t.caseCard.inlineClient.lastName}
                  htmlFor="ic-last"
                  error={err('last_name')}
                  required
                >
                  <Input
                    id="ic-last"
                    name="last_name"
                    autoFocus
                    required
                    maxLength={100}
                    aria-invalid={err('last_name') ? 'true' : undefined}
                    placeholder={t.caseCard.inlineClient.lastNamePlaceholder}
                  />
                </Field>
                <Field
                  label={t.caseCard.inlineClient.firstName}
                  htmlFor="ic-first"
                  error={err('first_name')}
                  required
                >
                  <Input
                    id="ic-first"
                    name="first_name"
                    required
                    maxLength={100}
                    aria-invalid={err('first_name') ? 'true' : undefined}
                    placeholder={t.caseCard.inlineClient.firstNamePlaceholder}
                  />
                </Field>
                <Field
                  label={t.caseCard.inlineClient.middleName}
                  htmlFor="ic-middle"
                  error={err('middle_name')}
                >
                  <Input
                    id="ic-middle"
                    name="middle_name"
                    maxLength={100}
                    aria-invalid={err('middle_name') ? 'true' : undefined}
                    placeholder={t.caseCard.inlineClient.middleNamePlaceholder}
                  />
                </Field>
                <Field
                  label={t.caseCard.inlineClient.birthDate}
                  htmlFor="ic-birth"
                  error={err('birth_date')}
                >
                  <Input
                    id="ic-birth"
                    name="birth_date"
                    type="date"
                    className=""
                    aria-invalid={err('birth_date') ? 'true' : undefined}
                  />
                </Field>
              </div>
            </>
          ) : (
            <Field
              label={t.caseCard.inlineClient.name}
              htmlFor="ic-name"
              error={err('name')}
              required
            >
              <Input
                id="ic-name"
                name="name"
                autoFocus
                required
                maxLength={200}
                aria-invalid={err('name') ? 'true' : undefined}
                placeholder={t.caseCard.inlineClient.namePlaceholder}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={
                hasFullName
                  ? t.caseCard.inlineClient.innIndividual
                  : t.caseCard.inlineClient.innCompany
              }
              htmlFor="ic-inn"
              error={err('inn')}
            >
              <Input
                id="ic-inn"
                name="inn"
                inputMode="numeric"
                maxLength={12}
                className=""
                aria-invalid={err('inn') ? 'true' : undefined}
                placeholder={t.caseCard.inlineClient.innPlaceholder}
              />
            </Field>
            <Field
              label={t.caseCard.inlineClient.contractNumber}
              htmlFor="ic-contract"
              error={err('contract_number')}
            >
              <Input
                id="ic-contract"
                name="contract_number"
                maxLength={100}
                className=""
                aria-invalid={err('contract_number') ? 'true' : undefined}
                placeholder={t.caseCard.inlineClient.contractNumberPlaceholder}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={t.caseCard.inlineClient.phone}
              htmlFor="ic-phone"
              error={err('phone')}
            >
              <Input
                id="ic-phone"
                name="phone"
                type="tel"
                className=""
                placeholder={t.caseCard.inlineClient.phonePlaceholder}
              />
            </Field>
            <Field
              label={t.caseCard.inlineClient.email}
              htmlFor="ic-email"
              error={err('email')}
            >
              <Input
                id="ic-email"
                name="email"
                type="email"
                className=""
                placeholder={t.caseCard.inlineClient.emailPlaceholder}
                aria-invalid={err('email') ? 'true' : undefined}
              />
            </Field>
          </div>

          <Field
            label={t.caseCard.inlineClient.source}
            htmlFor="ic-source"
            error={err('source')}
          >
            <Select id="ic-source" name="source" defaultValue="">
              <option value="">{t.caseCard.inlineClient.sourcePlaceholder}</option>
              {CLIENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t.enums.clientSource[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.inlineClient.notes}
            htmlFor="ic-notes"
            error={err('notes')}
          >
            <Textarea
              id="ic-notes"
              name="notes"
              rows={2}
              placeholder={t.caseCard.inlineClient.notesPlaceholder}
            />
          </Field>

          {state.message && !state.ok && (
            <p
              role="alert"
              className="rounded-control border border-error/15 bg-error-bg px-3 py-2 text-sm text-error-text"
            >
              {state.message}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.caseCard.inlineClient.cancel}
            </Button>
            <SaveButton />
          </div>
        </form>
    </Modal>
  );
}

function SaveButton() {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t.caseCard.inlineClient.saving : t.caseCard.inlineClient.submit}
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
        className="text-[12px] text-text-muted"
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
