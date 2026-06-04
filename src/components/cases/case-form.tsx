'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import {
  InlineClientCreate,
  type CreatedClient,
} from '@/components/cases/inline-client-create';
import { useI18n } from '@/lib/i18n/provider';
import type { CaseActionState, CaseFormFields } from '@/lib/cases/actions';
import type { AssigneeOption, ClientOption } from '@/lib/cases/queries';
import {
  ACCRUAL_MODES,
  BILLING_TYPES,
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CASE_STAGES,
  CASE_TYPES,
  type BillingType,
  type Case,
  type CaseStage,
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
  /** Юристы-продажники (lawyer_id). */
  lawyers: AssigneeOption[];
  /** Експерты-исполнители (responsible_id). */
  experts: AssigneeOption[];
  submitLabel: string;
  cancelHref: string;
  /** Подсказать форме умолчания (например, текущего пользователя как Експерта). */
  defaultResponsibleId?: string;
  /** owner/admin — показываем поля индивидуального % (P1.1). */
  canEditRates?: boolean;
  /**
   * Какие этапы показывать в Select. По умолчанию — все 5. Для не-staff
   * передаём только текущий и следующий (Задача 8, CLAUDE.md §7-2). Триггер
   * `cases_validate_stage_forward` всё равно защитит на стороне БД.
   */
  allowedStages?: ReadonlyArray<CaseStage>;
  /** Можно ли создавать клиента «на месте» (Задача 5). Эксперту — нельзя. */
  canCreateClient?: boolean;
}

export function CaseForm({
  action,
  caseRow,
  clients,
  lockedClient,
  lawyers,
  experts,
  submitLabel,
  cancelHref,
  defaultResponsibleId,
  allowedStages,
  canEditRates = false,
  canCreateClient = false,
}: CaseFormProps) {
  const { t } = useI18n();
  const stageOptions = allowedStages ?? CASE_STAGES;
  const [state, formAction] = useActionState<CaseActionState, FormData>(
    action,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useShakeInvalidFields(formRef, state);

  // Задача 5: список клиентов и выбранный клиент — управляемые, чтобы созданный
  // «на месте» клиент сразу добавлялся в селект и выбирался.
  const [clientOptions, setClientOptions] = useState<ClientOption[]>(
    clients ?? [],
  );
  const [showNewClient, setShowNewClient] = useState(false);
  const initialClientId =
    (state.values?.client_id ?? caseRow?.client_id) || '';
  const [selectedClientId, setSelectedClientId] =
    useState<string>(initialClientId);

  function handleClientCreated(client: CreatedClient) {
    setClientOptions((prev) =>
      prev.some((c) => c.id === client.id)
        ? prev
        : [...prev, { id: client.id, name: client.name, client_kind: client.client_kind }].sort(
            (a, b) => a.name.localeCompare(b.name, 'ru'),
          ),
    );
    setSelectedClientId(client.id);
    setShowNewClient(false);
  }

  function value(field: CaseFormFields): string {
    if (state.values && state.values[field] !== undefined) {
      return state.values[field] ?? '';
    }
    if (caseRow) {
      switch (field) {
        case 'number_title': return caseRow.number_title;
        case 'client_id': return caseRow.client_id;
        case 'lawyer_id': return caseRow.lawyer_id;
        case 'responsible_id': return caseRow.responsible_id;
        case 'opened_at': return caseRow.opened_at;
        case 'case_type': return caseRow.case_type;
        case 'category': return caseRow.category;
        case 'subject': return caseRow.subject ?? '';
        case 'stage': return caseRow.stage;
        case 'priority': return caseRow.priority;
        case 'contract_sum': return String(caseRow.contract_sum);
        case 'lawyer_rate_override':
          return caseRow.lawyer_rate_override == null
            ? ''
            : String(caseRow.lawyer_rate_override);
        case 'expert_rate_override':
          return caseRow.expert_rate_override == null
            ? ''
            : String(caseRow.expert_rate_override);
        case 'accrual_mode': return caseRow.accrual_mode;
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

  const defaultResponsible =
    value('responsible_id') || defaultResponsibleId || '';

  const defaultLawyer = value('lawyer_id') || '';

  const defaultOpenedAt = value('opened_at') || todayIso();

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      {/* Базовый блок */}
      <Section title={t.caseCard.form.sectionBasic}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={t.caseCard.form.numberTitle}
            htmlFor="number_title"
            error={err('number_title')}
            required
            className="sm:col-span-2 lg:col-span-3"
          >
            <Input
              id="number_title"
              name="number_title"
              defaultValue={value('number_title')}
              autoFocus
              required
              maxLength={200}
              aria-invalid={err('number_title') ? 'true' : undefined}
              placeholder={t.caseCard.form.numberTitlePlaceholder}
            />
          </Field>

          <Field
            label={t.caseCard.form.client}
            htmlFor="client_id"
            error={err('client_id')}
            required
          >
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
              <div className="flex items-center gap-2">
                <Select
                  id="client_id"
                  name="client_id"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.currentTarget.value)}
                  required
                  aria-invalid={err('client_id') ? 'true' : undefined}
                  className="flex-1"
                >
                  <option value="">
                    {t.caseCard.form.clientSelectPlaceholder}
                  </option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {canCreateClient && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setShowNewClient(true)}
                  >
                    <Plus size={14} strokeWidth={2} />
                    {t.caseCard.form.newClient}
                  </Button>
                )}
              </div>
            )}
          </Field>

          <Field
            label={t.caseCard.form.lawyer}
            htmlFor="lawyer_id"
            error={err('lawyer_id')}
            required
          >
            <Select
              id="lawyer_id"
              name="lawyer_id"
              defaultValue={defaultLawyer}
              required
              aria-invalid={err('lawyer_id') ? 'true' : undefined}
            >
              <option value="">{t.caseCard.form.selectPlaceholder}</option>
              {lawyers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.form.expert}
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
              <option value="">{t.caseCard.form.selectPlaceholder}</option>
              {experts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.form.openedAt}
            htmlFor="opened_at"
            error={err('opened_at')}
            required
          >
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

          <Field
            label={t.caseCard.form.caseType}
            htmlFor="case_type"
            error={err('case_type')}
            required
          >
            <Select
              id="case_type"
              name="case_type"
              defaultValue={value('case_type') || 'civil'}
              required
              aria-invalid={err('case_type') ? 'true' : undefined}
            >
              {CASE_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {t.enums.caseType[ct]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.form.category}
            htmlFor="category"
            error={err('category')}
            required
          >
            <Select
              id="category"
              name="category"
              defaultValue={value('category') || 'document'}
              required
              aria-invalid={err('category') ? 'true' : undefined}
            >
              {CASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.enums.caseCategory[c]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.form.subject}
            htmlFor="subject"
            error={err('subject')}
            className="sm:col-span-2 lg:col-span-3"
          >
            <Input
              id="subject"
              name="subject"
              defaultValue={value('subject')}
              maxLength={300}
              placeholder={t.caseCard.form.subjectPlaceholder}
            />
          </Field>

          <Field
            label={t.caseCard.form.stage}
            htmlFor="stage"
            error={err('stage')}
            required
          >
            <Select
              id="stage"
              name="stage"
              defaultValue={value('stage') || stageOptions[0] || 'new_request'}
              required
              aria-invalid={err('stage') ? 'true' : undefined}
            >
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {t.enums.caseStage[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.form.priority}
            htmlFor="priority"
            error={err('priority')}
            required
          >
            <Select
              id="priority"
              name="priority"
              defaultValue={value('priority') || 'normal'}
              required
              aria-invalid={err('priority') ? 'true' : undefined}
            >
              {CASE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t.enums.casePriority[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      {/* Финансы */}
      <Section title={t.caseCard.form.sectionFinance}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={t.caseCard.form.contractSum}
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

          {canEditRates && (
            <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-2 rounded-md border border-border bg-surface-muted/40 p-4">
              <p className="text-[12px] uppercase tracking-[0.04em] text-text-muted">
                {t.caseCard.form.rateOverrideTitle}
              </p>
              <p className="text-[12px] text-text-subtle">
                {t.caseCard.form.rateOverrideHint}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={t.caseCard.form.lawyerRate}
                  htmlFor="lawyer_rate_override"
                  error={err('lawyer_rate_override')}
                >
                  <Input
                    id="lawyer_rate_override"
                    name="lawyer_rate_override"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={value('lawyer_rate_override')}
                    placeholder={t.caseCard.form.rateByCategoryPlaceholder}
                    aria-invalid={err('lawyer_rate_override') ? 'true' : undefined}
                    className="font-mono"
                  />
                </Field>
                <Field
                  label={t.caseCard.form.expertRate}
                  htmlFor="expert_rate_override"
                  error={err('expert_rate_override')}
                >
                  <Input
                    id="expert_rate_override"
                    name="expert_rate_override"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={value('expert_rate_override')}
                    placeholder={t.caseCard.form.rateByCategoryPlaceholder}
                    aria-invalid={err('expert_rate_override') ? 'true' : undefined}
                    className="font-mono"
                  />
                </Field>
              </div>
            </div>
          )}

          <Field
            label={t.caseCard.form.accrualMode}
            htmlFor="accrual_mode"
            error={err('accrual_mode')}
          >
            <Select
              id="accrual_mode"
              name="accrual_mode"
              defaultValue={value('accrual_mode') || 'on_completion'}
              aria-invalid={err('accrual_mode') ? 'true' : undefined}
            >
              {ACCRUAL_MODES.map((m) => (
                <option key={m} value={m}>
                  {t.enums.accrualMode[m]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.caseCard.form.billingTypes}
            htmlFor="billing_types"
            error={err('billing_types')}
            className="sm:col-span-2 lg:col-span-3"
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
                    {t.enums.billingType[bt]}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* Судебная часть */}
      <Section title={t.caseCard.form.sectionCourt}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={t.caseCard.form.opponent}
            htmlFor="opponent"
            error={err('opponent')}
            className="sm:col-span-2 lg:col-span-1"
          >
            <Input
              id="opponent"
              name="opponent"
              defaultValue={value('opponent')}
              placeholder={t.caseCard.form.opponentPlaceholder}
            />
          </Field>

          <Field
            label={t.caseCard.form.courtCaseNumber}
            htmlFor="court_case_number"
            error={err('court_case_number')}
          >
            <Input
              id="court_case_number"
              name="court_case_number"
              defaultValue={value('court_case_number')}
              placeholder={t.caseCard.form.courtCaseNumberPlaceholder}
              className="font-mono"
            />
          </Field>

          <Field
            label={t.caseCard.form.court}
            htmlFor="court"
            error={err('court')}
          >
            <Input
              id="court"
              name="court"
              defaultValue={value('court')}
              placeholder={t.caseCard.form.courtPlaceholder}
            />
          </Field>
        </div>
      </Section>

      {/* Дополнительно */}
      <Section title={t.caseCard.form.sectionExtra}>
        <Field label={t.caseCard.form.tags} htmlFor="tags" error={err('tags')}>
          <Textarea
            id="tags"
            name="tags"
            rows={2}
            defaultValue={value('tags')}
            placeholder={t.caseCard.form.tagsPlaceholder}
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
          <Link href={cancelHref}>{t.caseCard.form.cancel}</Link>
        </Button>
      </div>
      </form>

      {showNewClient && (
        <InlineClientCreate
          onClose={() => setShowNewClient(false)}
          onCreated={handleClientCreated}
        />
      )}
    </>
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
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t.caseCard.form.saving : label}
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
