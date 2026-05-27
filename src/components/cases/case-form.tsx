'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CaseActionState, CaseFormFields } from '@/lib/cases/actions';
import type { ClientOption, SpecialistOption } from '@/lib/cases/queries';
import {
  BILLING_TYPE_LABEL,
  BILLING_TYPES,
  CASE_PRIORITIES,
  CASE_PRIORITY_LABEL,
  CASE_STAGE_LABEL,
  CASE_STAGES,
  CASE_TYPE_LABEL,
  CASE_TYPES,
  type BillingType,
  type Case,
} from '@/lib/types/db';

const INITIAL: CaseActionState = { ok: false };

type Action = (
  prev: CaseActionState,
  formData: FormData,
) => Promise<CaseActionState>;

interface CaseFormProps {
  action: Action;
  caseRow?: Case;
  /** Список клиентов для селекта (когда клиент не зафиксирован). */
  clients?: ClientOption[];
  /** Если задан — клиент жёстко прибит, селект не показывается. */
  lockedClient?: { id: string; name: string };
  specialists: SpecialistOption[];
  submitLabel: string;
  cancelHref: string;
  /** Подсказать форме умолчания (например, текущего пользователя как ответственного). */
  defaultResponsibleId?: string;
}

const SPECIALIST_TYPE_LABEL: Record<'lawyer' | 'jurist', string> = {
  lawyer: 'адвокат',
  jurist: 'юрист',
};

export function CaseForm({
  action,
  caseRow,
  clients,
  lockedClient,
  specialists,
  submitLabel,
  cancelHref,
  defaultResponsibleId,
}: CaseFormProps) {
  const [state, formAction] = useActionState<CaseActionState, FormData>(
    action,
    INITIAL,
  );

  function value(field: CaseFormFields): string {
    if (state.values && state.values[field] !== undefined) {
      return state.values[field] ?? '';
    }
    if (caseRow) {
      switch (field) {
        case 'number_title': return caseRow.number_title;
        case 'client_id': return caseRow.client_id;
        case 'responsible_id': return caseRow.responsible_id;
        case 'opened_at': return caseRow.opened_at;
        case 'case_type': return caseRow.case_type;
        case 'stage': return caseRow.stage;
        case 'priority': return caseRow.priority;
        case 'contract_sum': return String(caseRow.contract_sum);
        case 'opponent': return caseRow.opponent ?? '';
        case 'court_case_number': return caseRow.court_case_number ?? '';
        case 'court': return caseRow.court ?? '';
        case 'tags': return caseRow.tags.join(', ');
        case 'billing_types': return caseRow.billing_types.join(',');
      }
    }
    return '';
  }

  function err(field: CaseFormFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  // Какие billing_types отмечены: после серверной валидации берём из state,
  // иначе из caseRow, иначе пусто.
  const checkedBilling: BillingType[] =
    state.selectedBillingTypes ?? caseRow?.billing_types ?? [];

  const defaultClientId =
    lockedClient?.id ?? value('client_id') ?? '';

  const defaultResponsible =
    value('responsible_id') || defaultResponsibleId || '';

  const defaultOpenedAt = value('opened_at') || todayIso();

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* Базовый блок */}
      <Section title="Основное">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Номер / название"
            htmlFor="number_title"
            error={err('number_title')}
            required
            className="sm:col-span-2"
          >
            <Input
              id="number_title"
              name="number_title"
              defaultValue={value('number_title')}
              autoFocus
              required
              maxLength={200}
              aria-invalid={err('number_title') ? 'true' : undefined}
              placeholder="CRM-2026-003 / Иск ООО «Ромашка»"
            />
          </Field>

          <Field label="Клиент" htmlFor="client_id" error={err('client_id')} required>
            {lockedClient ? (
              <>
                <input
                  type="hidden"
                  name="client_id"
                  value={lockedClient.id}
                />
                <div className="flex items-center gap-2.5 h-10 px-3 rounded-md bg-surface-muted border border-transparent">
                  <Avatar name={lockedClient.name} size="sm" />
                  <span className="text-[13.5px] text-text font-medium truncate">
                    {lockedClient.name}
                  </span>
                </div>
              </>
            ) : (
              <Select
                id="client_id"
                name="client_id"
                defaultValue={defaultClientId}
                required
                aria-invalid={err('client_id') ? 'true' : undefined}
              >
                <option value="">— выберите клиента —</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Ответственный"
            htmlFor="responsible_id"
            error={err('responsible_id')}
            required
          >
            <Select
              id="responsible_id"
              name="responsible_id"
              defaultValue={defaultResponsible}
              required
              aria-invalid={err('responsible_id') ? 'true' : undefined}
            >
              <option value="">— выберите —</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.specialist_type
                    ? ` · ${SPECIALIST_TYPE_LABEL[s.specialist_type]}`
                    : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Открыто" htmlFor="opened_at" error={err('opened_at')} required>
            <Input
              id="opened_at"
              name="opened_at"
              type="date"
              defaultValue={defaultOpenedAt}
              required
              aria-invalid={err('opened_at') ? 'true' : undefined}
              className="font-mono"
            />
          </Field>

          <Field label="Тип дела" htmlFor="case_type" error={err('case_type')} required>
            <Select
              id="case_type"
              name="case_type"
              defaultValue={value('case_type') || 'civil'}
              required
              aria-invalid={err('case_type') ? 'true' : undefined}
            >
              {CASE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CASE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Этап" htmlFor="stage" error={err('stage')} required>
            <Select
              id="stage"
              name="stage"
              defaultValue={value('stage') || 'new_request'}
              required
              aria-invalid={err('stage') ? 'true' : undefined}
            >
              {CASE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {CASE_STAGE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Приоритет" htmlFor="priority" error={err('priority')} required>
            <Select
              id="priority"
              name="priority"
              defaultValue={value('priority') || 'normal'}
              required
              aria-invalid={err('priority') ? 'true' : undefined}
            >
              {CASE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {CASE_PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      {/* Финансы */}
      <Section title="Финансы">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Сумма договора"
            htmlFor="contract_sum"
            error={err('contract_sum')}
          >
            <Input
              id="contract_sum"
              name="contract_sum"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              defaultValue={value('contract_sum') || '0'}
              aria-invalid={err('contract_sum') ? 'true' : undefined}
              className="font-mono"
            />
          </Field>

          <Field
            label="Тип оплаты"
            htmlFor="billing_types"
            error={err('billing_types')}
            className="sm:col-span-2"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" id="billing_types">
              {BILLING_TYPES.map((bt) => (
                <label
                  key={bt}
                  className="inline-flex items-center gap-2 px-3 h-10 rounded-md bg-surface-muted hover:bg-surface border border-transparent hover:border-border cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    name="billing_types"
                    value={bt}
                    defaultChecked={checkedBilling.includes(bt)}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="text-[13px] text-text">
                    {BILLING_TYPE_LABEL[bt]}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* Судебная часть */}
      <Section title="Судебное (если применимо)">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Оппонент"
            htmlFor="opponent"
            error={err('opponent')}
            className="sm:col-span-2"
          >
            <Input
              id="opponent"
              name="opponent"
              defaultValue={value('opponent')}
              placeholder="ФИО / название организации"
            />
          </Field>

          <Field
            label="Номер судебного дела"
            htmlFor="court_case_number"
            error={err('court_case_number')}
          >
            <Input
              id="court_case_number"
              name="court_case_number"
              defaultValue={value('court_case_number')}
              placeholder="755/12345/2026"
              className="font-mono"
            />
          </Field>

          <Field label="Суд" htmlFor="court" error={err('court')}>
            <Input
              id="court"
              name="court"
              defaultValue={value('court')}
              placeholder="Шевченковский районный суд г. Киева"
            />
          </Field>
        </div>
      </Section>

      {/* Дополнительно */}
      <Section title="Дополнительно">
        <Field label="Теги" htmlFor="tags" error={err('tags')}>
          <Textarea
            id="tags"
            name="tags"
            rows={2}
            defaultValue={value('tags')}
            placeholder="через запятую: vip, hot, recurring"
          />
        </Field>
      </Section>

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
        {title}
      </h3>
      {children}
    </div>
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
      <Label
        htmlFor={htmlFor}
        className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
      >
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error" role="alert">
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

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
