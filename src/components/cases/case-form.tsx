'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
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
import { clearFlashToast, flashToast } from '@/components/ui/toast';
import {
  InlineClientCreate,
  type CreatedClient,
} from '@/components/cases/inline-client-create';
import {
  ConflictWarning,
  useConflictCheck,
} from '@/components/cases/conflict-warning';
import { useI18n } from '@/lib/i18n/provider';
import type { CaseActionState, CaseFormFields } from '@/lib/cases/actions';
import type { AssigneeOption, ClientOption } from '@/lib/cases/queries';
import { todayIso } from '@/lib/validation';
import {
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
  /**
   * Дело в архиве: этап заблокирован на 'closed' (через allowedStages=['closed'])
   * — показываем эту подсказку под полем этапа. undefined → не в архиве.
   */
  stageLockedHint?: string;
  /** Можно ли создавать клиента «на месте» (Задача 5). Эксперту — нельзя. */
  canCreateClient?: boolean;
  /**
   * v3 s1: текущий пользователь — staff (owner/admin/office_manager)? В режиме
   * РЕДАКТИРОВАНИЯ не-staff не меняет ЗП-определяющие поля (категория, сумма
   * договора, клиент, юрист, эксперт) — они блокируются. По умолчанию true:
   * создание и прочие вызовы формы поведения не меняют. Реальная защита — БД-триггер
   * cases_guard_financial_fields; здесь — UX.
   */
  isStaff?: boolean;
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
  stageLockedHint,
  canEditRates = false,
  canCreateClient = false,
  isStaff = true,
}: CaseFormProps) {
  const { t } = useI18n();
  const stageOptions = allowedStages ?? CASE_STAGES;
  // v3 s1: в режиме редактирования (есть caseRow) не-staff финансовые поля не правит.
  const lockFinancial = Boolean(caseRow) && !isStaff;
  // Успешный action делает redirect (карточка дела) — flash-тост «Сохранено»
  // показывает провайдер уже на новой странице; ошибка валидации снимает flash.
  const [state, formAction] = useActionState<CaseActionState, FormData>(
    async (prev, formData) => {
      flashToast('success', t.common.saved);
      return action(prev, formData);
    },
    INITIAL,
  );
  useEffect(() => {
    if (!state.ok && (state.message || state.fieldErrors)) clearFlashToast();
  }, [state]);
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
        case 'dual_rate_override':
          return caseRow.dual_rate_override == null
            ? ''
            : String(caseRow.dual_rate_override);
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

  // v3 s1: следим за выбором юриста/эксперта — предупреждение о совпадении
  // ролей (0007: начисление одинарное) + переключение полей ставок на dual.
  const [lawyerId, setLawyerId] = useState<string>(defaultLawyer);
  const [responsibleId, setResponsibleId] = useState<string>(defaultResponsible);
  const sameLawyerExpert = Boolean(lawyerId) && lawyerId === responsibleId;

  // v3 s7: конфликт-чек по оппоненту — только при создании дела (не при правке).
  const isCreate = !caseRow;
  const conflict = useConflictCheck();

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {/* v3 s4: optimistic locking — версия дела на момент открытия формы. Сервер
          отклонит сохранение, если дело успели изменить параллельно. */}
      {caseRow && (
        <input type="hidden" name="base_updated_at" value={caseRow.updated_at} />
      )}
      {/* Базовый блок */}
      <Section index={1} title={t.caseCard.form.sectionBasic} hint={t.caseCard.form.sectionBasicHint}>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field
            label={t.caseCard.form.numberTitle}
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
                <div className="flex items-center gap-2.5 h-10 px-3 rounded-control border border-border bg-surface-sunken/40">
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
                  disabled={lockFinancial}
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
                {canCreateClient && !lockFinancial && (
                  // Синяя CTA (фидбек 14.07) — создание клиента «на месте».
                  <Button
                    type="button"
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
            <LockedHint show={lockFinancial} text={t.cases.financialFieldStaffOnly} />
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
              onChange={(e) => setLawyerId(e.currentTarget.value)}
              required
              disabled={lockFinancial}
              aria-invalid={err('lawyer_id') ? 'true' : undefined}
            >
              <option value="">{t.caseCard.form.selectPlaceholder}</option>
              {lawyers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
            <LockedHint show={lockFinancial} text={t.cases.financialFieldStaffOnly} />
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
              onChange={(e) => setResponsibleId(e.currentTarget.value)}
              required
              disabled={lockFinancial}
              aria-invalid={err('responsible_id') ? 'true' : undefined}
            >
              <option value="">{t.caseCard.form.selectPlaceholder}</option>
              {experts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
            <LockedHint show={lockFinancial} text={t.cases.financialFieldStaffOnly} />
            {sameLawyerExpert && (
              <p className="mt-1 text-[11.5px] text-warning">
                {t.cases.sameLawyerExpertWarning}
              </p>
            )}
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
              className=""
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
              disabled={lockFinancial}
              aria-invalid={err('category') ? 'true' : undefined}
            >
              {CASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.enums.caseCategory[c]}
                </option>
              ))}
            </Select>
            <LockedHint show={lockFinancial} text={t.cases.financialFieldStaffOnly} />
          </Field>

          <Field
            label={t.caseCard.form.subject}
            htmlFor="subject"
            error={err('subject')}
            className="sm:col-span-2"
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
            {stageLockedHint && (
              <p className="mt-1 text-[11px] text-text-subtle">
                {stageLockedHint}
              </p>
            )}
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
      <Section index={2} title={t.caseCard.form.sectionFinance} hint={t.caseCard.form.sectionFinanceHint}>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
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
              readOnly={lockFinancial}
              aria-invalid={err('contract_sum') ? 'true' : undefined}
              className={lockFinancial ? 'opacity-60 cursor-not-allowed' : ''}
            />
            <LockedHint show={lockFinancial} text={t.cases.financialFieldStaffOnly} />
          </Field>

          {canEditRates && (
            <div className="sm:col-span-2 flex flex-col gap-2 rounded-xl border border-border bg-surface-sunken/40 p-4">
              <p className="text-[12px] text-text-muted">
                {t.caseCard.form.rateOverrideTitle}
              </p>
              <p className="text-[12px] text-text-subtle">
                {sameLawyerExpert
                  ? t.caseCard.form.dualRateHint
                  : t.caseCard.form.rateOverrideHint}
              </p>
              {sameLawyerExpert ? (
                <>
                  {/* Роли совмещены: начисление одинарное — правится только
                      dual-ставка. Ставки ролей не показываем, но сохраняем
                      (fallback greatest и возврат в силу при разъезде ролей). */}
                  <input
                    type="hidden"
                    name="lawyer_rate_override"
                    defaultValue={value('lawyer_rate_override')}
                  />
                  <input
                    type="hidden"
                    name="expert_rate_override"
                    defaultValue={value('expert_rate_override')}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label={t.caseCard.form.dualRate}
                      htmlFor="dual_rate_override"
                      error={err('dual_rate_override')}
                    >
                      <Input
                        id="dual_rate_override"
                        name="dual_rate_override"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={value('dual_rate_override')}
                        placeholder={t.caseCard.form.rateByCategoryPlaceholder}
                        aria-invalid={err('dual_rate_override') ? 'true' : undefined}
                        className=""
                      />
                    </Field>
                  </div>
                </>
              ) : (
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
                      className=""
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
                      className=""
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          <Field
            label={t.caseCard.form.billingTypes}
            htmlFor="billing_types"
            error={err('billing_types')}
            className="sm:col-span-2"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" id="billing_types">
              {BILLING_TYPES.map((bt) => (
                <label
                  key={bt}
                  className="inline-flex items-center gap-2 px-3 h-10 rounded-control border border-border bg-surface hover:border-primary-border hover:bg-primary-softer cursor-pointer transition-colors"
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
      <Section index={3} title={t.caseCard.form.sectionCourt} hint={t.caseCard.form.sectionCourtHint}>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field
            label={t.caseCard.form.opponent}
            htmlFor="opponent"
            error={err('opponent')}
          >
            <Input
              id="opponent"
              name="opponent"
              defaultValue={value('opponent')}
              placeholder={t.caseCard.form.opponentPlaceholder}
              onBlur={
                isCreate
                  ? (e) => conflict.check({ name: e.currentTarget.value })
                  : undefined
              }
            />
            {isCreate && (
              <ConflictWarning
                matches={conflict.matches}
                message={t.cases.conflictWarning}
              />
            )}
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
              className=""
            />
          </Field>

          <Field
            label={t.caseCard.form.court}
            htmlFor="court"
            error={err('court')}
            className="sm:col-span-2"
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
      <Section index={4} title={t.caseCard.form.sectionExtra} hint={t.caseCard.form.sectionExtraHint}>
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
          className="text-sm text-error-text bg-error-bg border border-error/15 rounded-control px-3 py-2"
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
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

// Секция-карточка формы (редизайн 14.07): номер шага + заголовок + подсказка,
// что здесь заполнять — форма читается сверху вниз без догадок.
function Section({
  index,
  title,
  hint,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3 border-b border-border pb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[13px] font-bold tabular-nums text-primary-pressed">
          {index}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight text-text">{title}</h3>
          {hint && <p className="mt-0.5 text-[12.5px] text-text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
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
      {/* Подпись тёмная и заметная (фидбек 14.07: серые лейблы было не прочесть). */}
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-text">
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

// v3 s1: серая подсказка под заблокированным финансовым полем (не-staff в edit).
function LockedHint({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return <p className="mt-1 text-[11px] text-text-subtle">{text}</p>;
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

