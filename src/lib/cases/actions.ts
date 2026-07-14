'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireCap, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { diffChanges } from '@/lib/activity-log/diff';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import type { Messages } from '@/lib/i18n/messages';
import { UUID_RE, todayIso } from '@/lib/validation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  ACCRUAL_MODES,
  BILLING_TYPES,
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CASE_STAGES,
  CASE_TYPES,
  STAFF_ROLES,
  type AccrualMode,
  type BillingType,
  type CaseCategory,
  type CasePriority,
  type CaseStage,
  type CaseType,
} from '@/lib/types/db';

export type CaseFormFields =
  | 'number_title'
  | 'client_id'
  | 'lawyer_id'
  | 'responsible_id'
  | 'opened_at'
  | 'case_type'
  | 'category'
  | 'subject'
  | 'stage'
  | 'priority'
  | 'contract_sum'
  | 'billing_types'
  | 'lawyer_rate_override'
  | 'expert_rate_override'
  | 'accrual_mode'
  | 'opponent'
  | 'court_case_number'
  | 'court'
  | 'tags';

// Переопределения % по делу (P1.1). Применяются ТОЛЬКО owner/admin; для прочих
// ролей не попадают в payload (а БД-триггер cases_guard_rate_overrides — жёсткая
// защита). null → ставка категории.
export type RateOverrides = {
  lawyer_rate_override: number | null;
  expert_rate_override: number | null;
};

export type CaseActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CaseFormFields, string>>;
  values?: Partial<Record<CaseFormFields, string>>;
  selectedBillingTypes?: BillingType[];
};

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}
function isCaseStage(value: string): value is CaseStage {
  return (CASE_STAGES as readonly string[]).includes(value);
}
function isCasePriority(value: string): value is CasePriority {
  return (CASE_PRIORITIES as readonly string[]).includes(value);
}
function isCaseCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
}
function isBillingType(value: string): value is BillingType {
  return (BILLING_TYPES as readonly string[]).includes(value);
}

type Validated = {
  number_title: string;
  client_id: string;
  lawyer_id: string;
  responsible_id: string;
  opened_at: string;
  case_type: CaseType;
  category: CaseCategory;
  subject: string | null;
  stage: CaseStage;
  priority: CasePriority;
  contract_sum: number;
  billing_types: BillingType[];
  accrual_mode: AccrualMode;
  opponent: string | null;
  court_case_number: string | null;
  court: string | null;
  tags: string[];
  closed_at: string | null;
};

function isAccrualMode(value: string): value is AccrualMode {
  return (ACCRUAL_MODES as readonly string[]).includes(value);
}

function validate(
  formData: FormData,
  t: Messages,
):
  | {
      ok: true;
      data: Validated;
      overrides: RateOverrides;
      values: Record<CaseFormFields, string>;
      selectedBillingTypes: BillingType[];
    }
  | { ok: false; state: CaseActionState } {
  const number_title = getString(formData, 'number_title');
  const client_id = getString(formData, 'client_id');
  const lawyer_id = getString(formData, 'lawyer_id');
  const responsible_id = getString(formData, 'responsible_id');
  const opened_at = getString(formData, 'opened_at');
  const case_type_raw = getString(formData, 'case_type');
  const category_raw = getString(formData, 'category');
  const subject = getString(formData, 'subject');
  const stage_raw = getString(formData, 'stage');
  const priority_raw = getString(formData, 'priority');
  const contract_sum_raw = getString(formData, 'contract_sum');
  const opponent = getString(formData, 'opponent');
  const court_case_number = getString(formData, 'court_case_number');
  const court = getString(formData, 'court');
  const tags_raw = getString(formData, 'tags');
  const lawyer_rate_override_raw = getString(formData, 'lawyer_rate_override');
  const expert_rate_override_raw = getString(formData, 'expert_rate_override');
  const accrual_mode_raw = getString(formData, 'accrual_mode');

  const billing_types_raw = formData
    .getAll('billing_types')
    .filter((v): v is string => typeof v === 'string');
  const billing_types = billing_types_raw.filter(isBillingType);

  const values: Record<CaseFormFields, string> = {
    number_title,
    client_id,
    lawyer_id,
    responsible_id,
    opened_at,
    case_type: case_type_raw,
    category: category_raw,
    subject,
    stage: stage_raw,
    priority: priority_raw,
    contract_sum: contract_sum_raw,
    billing_types: billing_types.join(','),
    lawyer_rate_override: lawyer_rate_override_raw,
    expert_rate_override: expert_rate_override_raw,
    accrual_mode: accrual_mode_raw,
    opponent,
    court_case_number,
    court,
    tags: tags_raw,
  };

  const fieldErrors: Partial<Record<CaseFormFields, string>> = {};

  const a = t.caseCard.actions;

  if (!number_title) fieldErrors.number_title = a.numberRequired;
  else if (number_title.length > 200)
    fieldErrors.number_title = a.numberTooLong;

  if (!client_id) fieldErrors.client_id = a.clientRequired;
  else if (!UUID_RE.test(client_id))
    fieldErrors.client_id = a.clientInvalid;

  if (!lawyer_id) fieldErrors.lawyer_id = a.lawyerRequired;
  else if (!UUID_RE.test(lawyer_id))
    fieldErrors.lawyer_id = a.idInvalid;

  if (!responsible_id) fieldErrors.responsible_id = a.expertRequired;
  else if (!UUID_RE.test(responsible_id))
    fieldErrors.responsible_id = a.idInvalid;

  if (!opened_at) fieldErrors.opened_at = a.openedAtRequired;
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(opened_at))
    fieldErrors.opened_at = a.dateFormat;

  if (!case_type_raw) fieldErrors.case_type = a.caseTypeRequired;
  else if (!isCaseType(case_type_raw))
    fieldErrors.case_type = a.caseTypeInvalid;

  if (!category_raw) fieldErrors.category = a.categoryRequired;
  else if (!isCaseCategory(category_raw))
    fieldErrors.category = a.categoryInvalid;

  if (subject && subject.length > 300)
    fieldErrors.subject = a.subjectTooLong;

  if (!stage_raw) fieldErrors.stage = a.stageRequired;
  else if (!isCaseStage(stage_raw)) fieldErrors.stage = a.stageInvalid;

  if (!priority_raw) fieldErrors.priority = a.priorityRequired;
  else if (!isCasePriority(priority_raw))
    fieldErrors.priority = a.priorityInvalid;

  let contract_sum = 0;
  if (contract_sum_raw) {
    // допускаем запятую как разделитель.
    const normalized = contract_sum_raw.replace(',', '.');
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors.contract_sum = a.contractSumInvalid;
    } else {
      contract_sum = n;
    }
  }

  // Override % по делу (P1.1): пусто → null; иначе число 0..100.
  function parseOverride(
    raw: string,
    field: 'lawyer_rate_override' | 'expert_rate_override',
  ): number | null {
    if (!raw) return null;
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      fieldErrors[field] = a.percentInvalid;
      return null;
    }
    return n;
  }
  const lawyer_rate_override = parseOverride(
    lawyer_rate_override_raw,
    'lawyer_rate_override',
  );
  const expert_rate_override = parseOverride(
    expert_rate_override_raw,
    'expert_rate_override',
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: {
        ok: false,
        fieldErrors,
        values,
        selectedBillingTypes: billing_types,
        message: a.checkForm,
      },
    };
  }

  // TS не выводит type guards из объекта — утверждаем вручную после проверок выше.
  const stage = stage_raw as CaseStage;
  const closed_at = stage === 'closed' ? todayIso() : null;

  const tags = tags_raw
    ? tags_raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  return {
    ok: true,
    data: {
      number_title,
      client_id,
      lawyer_id,
      responsible_id,
      opened_at,
      case_type: case_type_raw as CaseType,
      category: category_raw as CaseCategory,
      subject: subject || null,
      stage,
      priority: priority_raw as CasePriority,
      contract_sum,
      billing_types,
      accrual_mode: isAccrualMode(accrual_mode_raw)
        ? accrual_mode_raw
        : 'on_completion',
      opponent: opponent || null,
      court_case_number: court_case_number || null,
      court: court || null,
      tags,
      closed_at,
    },
    overrides: { lawyer_rate_override, expert_rate_override },
    values,
    selectedBillingTypes: billing_types,
  };
}

export async function createCaseAction(
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.caps.create_cases) {
    return { ok: false, message: t.caseCard.actions.noCreatePermission };
  }
  const result = validate(formData, t);
  if (!result.ok) return result.state;

  // Override % задаёт только обладатель права edit_rate_overrides; иначе поля не
  // шлём вовсе (БД-триггер cases_guard_rate_overrides отверг бы non-null override).
  const insertPayload = user.caps.edit_rate_overrides
    ? { ...result.data, ...result.overrides }
    : result.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      values: result.values,
      selectedBillingTypes: result.selectedBillingTypes,
      message: dbErrorMessage(
        'createCaseAction',
        error,
        t.caseCard.actions.createFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: data.id,
    action: 'case_created',
    changes: {
      after: {
        number_title: result.data.number_title,
        case_type: result.data.case_type,
        category: result.data.category,
        stage: result.data.stage,
        priority: result.data.priority,
        contract_sum: result.data.contract_sum,
      },
    },
  });

  revalidatePath('/cases');
  revalidatePath(`/clients/${result.data.client_id}`);
  redirect(`/cases/${data.id}`);
}

const CASE_DIFF_FIELDS = [
  'number_title',
  'client_id',
  'lawyer_id',
  'responsible_id',
  'opened_at',
  'case_type',
  'category',
  'subject',
  'stage',
  'priority',
  'contract_sum',
  'billing_types',
  'lawyer_rate_override',
  'expert_rate_override',
  'accrual_mode',
  'opponent',
  'court_case_number',
  'court',
  'tags',
] as const;

type CaseDiffShape = {
  number_title: string;
  client_id: string;
  lawyer_id: string;
  responsible_id: string;
  opened_at: string;
  case_type: CaseType;
  category: CaseCategory;
  subject: string | null;
  stage: CaseStage;
  priority: CasePriority;
  contract_sum: number;
  billing_types: BillingType[];
  lawyer_rate_override: number | null;
  expert_rate_override: number | null;
  accrual_mode: AccrualMode;
  opponent: string | null;
  court_case_number: string | null;
  court: string | null;
  tags: string[];
};

export async function updateCaseAction(
  caseId: string,
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const user = await requireUser();
  const { t } = await getT();
  const result = validate(formData, t);
  if (!result.ok) return result.state;

  const canEditRates = user.caps.edit_rate_overrides;
  // v3 s1: staff (owner/admin/office_manager) — единственные, кто меняет
  // ЗП-определяющие поля дела (зеркало БД-триггера cases_guard_financial_fields).
  const isStaffUser = STAFF_ROLES.includes(user.profile.role);
  const supabase = await createSupabaseServerClient();

  // Снапшот до правки — для diff'а в activity_log. RLS отрежет невидимое →
  // before=null → лог не запишется (это ок, тогда и update упадёт).
  // PostgREST не выводит row-type из строкового select — поэтому ручной cast.
  type CaseBeforeRow = {
    number_title: string;
    client_id: string;
    lawyer_id: string;
    responsible_id: string;
    opened_at: string;
    case_type: string;
    category: string;
    subject: string | null;
    stage: string;
    closed_at: string | null;
    archived_at: string | null;
    priority: string;
    contract_sum: number | string;
    billing_types: string[] | null;
    lawyer_rate_override: number | string | null;
    expert_rate_override: number | string | null;
    accrual_mode: string;
    opponent: string | null;
    court_case_number: string | null;
    court: string | null;
    tags: string[] | null;
  };
  const { data: beforeRaw } = await supabase
    .from('cases')
    .select(
      'number_title, client_id, lawyer_id, responsible_id, opened_at, case_type, category, subject, stage, closed_at, archived_at, ' +
        'priority, contract_sum, billing_types, lawyer_rate_override, expert_rate_override, accrual_mode, opponent, court_case_number, court, tags',
    )
    .eq('id', caseId)
    .maybeSingle();
  const before = beforeRaw as CaseBeforeRow | null;

  // Дело в архиве → этап менять нельзя (CHECK cases_archived_requires_closed
  // отвергнет уход из 'closed' при archived_at IS NOT NULL). Возвращаем понятную
  // ошибку на поле этапа вместо сырого 23514. Прочие поля архивного дела править
  // можно (этап в форме редактирования и так заблокирован на 'closed').
  if (before && before.archived_at != null && result.data.stage !== 'closed') {
    return {
      ok: false,
      values: result.values,
      selectedBillingTypes: result.selectedBillingTypes,
      fieldErrors: { stage: t.cases.archive.detailHint },
      message: t.cases.archive.detailHint,
    };
  }

  // v3 s1: не-staff (юрист/Експерт) не меняет ЗП-определяющие поля дела. UI их
  // блокирует, но форс-POST или гонка прав ловятся здесь дружелюбной ошибкой ДО
  // похода в БД (там тот же запрет — триггер cases_guard_financial_fields). Если
  // значения совпали с before — поля не попадут в SET (ниже), триггер не дёргаем.
  if (!isStaffUser && before) {
    const ff: Partial<Record<CaseFormFields, string>> = {};
    if (result.data.category !== before.category)
      ff.category = t.cases.financialFieldStaffOnly;
    if (result.data.contract_sum !== Number(before.contract_sum ?? 0))
      ff.contract_sum = t.cases.financialFieldStaffOnly;
    if (result.data.lawyer_id !== before.lawyer_id)
      ff.lawyer_id = t.cases.financialFieldStaffOnly;
    if (result.data.responsible_id !== before.responsible_id)
      ff.responsible_id = t.cases.financialFieldStaffOnly;
    if (result.data.client_id !== before.client_id)
      ff.client_id = t.cases.financialFieldStaffOnly;
    if (Object.keys(ff).length > 0) {
      return {
        ok: false,
        values: result.values,
        selectedBillingTypes: result.selectedBillingTypes,
        fieldErrors: ff,
        message: t.cases.financialFieldStaffOnly,
      };
    }
  }

  // closed_at — историческая дата закрытия. Если дело уже было закрыто, любая
  // правка admin'ом не должна перезаписывать оригинальный closed_at на сегодня
  // (validate() ставит todayIso() безусловно при stage='closed'). Сохраняем
  // before.closed_at для no-op closed→closed; для переходов из/в closed
  // оставляем поведение validate (today при входе в closed, null при выходе).
  const basePayload: Validated =
    before && before.stage === 'closed' && result.data.stage === 'closed'
      ? { ...result.data, closed_at: before.closed_at }
      : result.data;

  // Override % мержим только для owner/admin; иначе колонки не трогаем (иначе
  // guard-триггер отклонил бы изменение от не-менеджера).
  const updatePayload: Partial<Validated> & Partial<RateOverrides> = canEditRates
    ? { ...basePayload, ...result.overrides }
    : { ...basePayload };

  // v3 s1: не-staff не меняет финансовые поля — убираем их из SET (значения сверены
  // с before выше; иначе BEFORE UPDATE OF впустую дёргает guard-триггер).
  if (!isStaffUser) {
    delete updatePayload.category;
    delete updatePayload.contract_sum;
    delete updatePayload.lawyer_id;
    delete updatePayload.responsible_id;
    delete updatePayload.client_id;
  }

  // При смене этапа на/с 'closed' триггеров для closed_at нет — обновляем сами.
  // (CHECK constraint cases_closed_consistency требует синхронности.)
  // v3 s4: optimistic locking — обновляем строку только если updated_at совпал с
  // тем, что форма прочитала при открытии (.eq('updated_at', base)). Рассинхрон →
  // 0 строк → ниже «дело изменено». Пустой base (нет hidden) → без проверки.
  const baseUpdatedAt = getString(formData, 'base_updated_at');
  let updateQuery = supabase
    .from('cases')
    .update(updatePayload)
    .eq('id', caseId);
  if (baseUpdatedAt) {
    updateQuery = updateQuery.eq('updated_at', baseUpdatedAt);
  }
  const { data: updatedRows, error } = await updateQuery.select('id');

  if (error) {
    // Триггер `cases_validate_stage_forward` бросает 'stage_backward_forbidden'
    // (откат) или 'stage_skip_forbidden' (прыжок через этап, Задача 8) для
    // юриста/Експерта. Подменяем системное сообщение Postgres на человеческое.
    const isStageBackward = error.message?.includes('stage_backward_forbidden');
    const isStageSkip = error.message?.includes('stage_skip_forbidden');
    const stageMsg = isStageBackward
      ? t.caseCard.actions.stageBackwardForbidden
      : isStageSkip
        ? t.caseCard.actions.stageSkipForbidden
        : null;
    const stageFieldErr = isStageBackward
      ? t.caseCard.actions.stageBackwardFieldError
      : isStageSkip
        ? t.caseCard.actions.stageSkipFieldError
        : null;
    return {
      ok: false,
      values: result.values,
      selectedBillingTypes: result.selectedBillingTypes,
      fieldErrors: stageFieldErr ? { stage: stageFieldErr } : undefined,
      message:
        stageMsg ??
        dbErrorMessage(
          'updateCaseAction',
          error,
          t.caseCard.actions.updateFailed,
          t.errors.db,
        ),
    };
  }

  // v3 s4: при заданном base ни одной обновлённой строки → дело изменено
  // параллельно (updated_at уже другой). Просим обновить страницу — чужую правку
  // не теряем. (RLS-невидимое/несуществующее дело тоже даст 0 — корректный отказ.)
  if (baseUpdatedAt && (updatedRows == null || updatedRows.length === 0)) {
    return {
      ok: false,
      values: result.values,
      selectedBillingTypes: result.selectedBillingTypes,
      message: t.cases.concurrentEdit,
    };
  }

  // Diff'им пользовательские поля, включая stage (v3 s2: смена этапа из полной
  // формы тоже попадает в журнал как case_updated; откат назад дополнительно
  // пишет 'stage_corrected' триггером cases_validate_stage_forward).
  if (before) {
    const beforeShape: CaseDiffShape = {
      number_title: String(before.number_title ?? ''),
      client_id: String(before.client_id ?? ''),
      lawyer_id: String(before.lawyer_id ?? ''),
      responsible_id: String(before.responsible_id ?? ''),
      opened_at: String(before.opened_at ?? ''),
      case_type: before.case_type as CaseType,
      category: before.category as CaseCategory,
      subject: (before.subject as string | null) ?? null,
      stage: before.stage as CaseStage,
      priority: before.priority as CasePriority,
      contract_sum: Number(before.contract_sum ?? 0),
      billing_types: (before.billing_types ?? []) as BillingType[],
      lawyer_rate_override:
        before.lawyer_rate_override == null ? null : Number(before.lawyer_rate_override),
      expert_rate_override:
        before.expert_rate_override == null ? null : Number(before.expert_rate_override),
      accrual_mode: before.accrual_mode as AccrualMode,
      opponent: (before.opponent as string | null) ?? null,
      court_case_number: (before.court_case_number as string | null) ?? null,
      court: (before.court as string | null) ?? null,
      tags: (before.tags ?? []) as string[],
    };
    const afterShape: Partial<CaseDiffShape> = {
      number_title: result.data.number_title,
      client_id: result.data.client_id,
      lawyer_id: result.data.lawyer_id,
      responsible_id: result.data.responsible_id,
      opened_at: result.data.opened_at,
      case_type: result.data.case_type,
      category: result.data.category,
      subject: result.data.subject,
      stage: result.data.stage,
      priority: result.data.priority,
      contract_sum: result.data.contract_sum,
      billing_types: result.data.billing_types,
      // Override меняет только менеджер; иначе after = before (нет diff).
      lawyer_rate_override: canEditRates
        ? result.overrides.lawyer_rate_override
        : beforeShape.lawyer_rate_override,
      expert_rate_override: canEditRates
        ? result.overrides.expert_rate_override
        : beforeShape.expert_rate_override,
      accrual_mode: result.data.accrual_mode,
      opponent: result.data.opponent,
      court_case_number: result.data.court_case_number,
      court: result.data.court,
      tags: result.data.tags,
    };
    const diff = diffChanges(beforeShape, afterShape, CASE_DIFF_FIELDS);
    if (diff) {
      await logActivity({
        entity_type: 'case',
        entity_id: caseId,
        action: 'case_updated',
        changes: { diff },
      });
    }
  }

  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/clients/${result.data.client_id}`);
  redirect(`/cases/${caseId}`);
}

// ── Быстрая смена этапа прямо на карточке (без полной формы) ──────────────
// Лёгкий action под inline-select в шапке дела. Правило «только вперёд» и
// логирование отката (`stage_corrected`) обеспечивает БД-триггер
// cases_validate_stage_forward; здесь синхронизируем только closed_at
// (CHECK cases_closed_consistency — отдельного триггера для него нет).
export type StageActionState = { ok: boolean; message?: string };

export async function updateCaseStageAction(
  caseId: string,
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  await requireUser();
  const { t } = await getT();

  if (!UUID_RE.test(caseId))
    return { ok: false, message: t.caseCard.actions.caseInvalid };

  const stage_raw = getString(formData, 'stage');
  if (!isCaseStage(stage_raw))
    return { ok: false, message: t.caseCard.actions.stageInvalid };
  const stage = stage_raw as CaseStage;

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from('cases')
    .select('stage, closed_at, client_id, archived_at')
    .eq('id', caseId)
    .maybeSingle<{
      stage: string;
      closed_at: string | null;
      client_id: string;
      archived_at: string | null;
    }>();

  // RLS отрезала дело (или его нет) → ничего не делаем.
  if (!before) return { ok: false, message: t.caseCard.actions.caseNotFound };
  if (before.stage === stage) return { ok: true }; // no-op

  // Дело в архиве → менять этап нельзя (иначе CHECK cases_archived_requires_closed
  // отвергнет переход из closed). Понятное сообщение вместо сырого 23514.
  if (before.archived_at != null && stage !== 'closed') {
    return { ok: false, message: t.cases.archive.detailHint };
  }

  // closed_at синхронен stage='closed'. При входе в closed ставим сегодня;
  // при выходе — null. (Если дело уже было закрыто — сюда не попадём из-за
  // no-op выше, кроме staff-отката, где closed_at всё равно надо снять.)
  const closed_at = stage === 'closed' ? todayIso() : null;

  const { error } = await supabase
    .from('cases')
    .update({ stage, closed_at })
    .eq('id', caseId);

  if (error) {
    const isStageBackward = error.message?.includes('stage_backward_forbidden');
    const isStageSkip = error.message?.includes('stage_skip_forbidden');
    return {
      ok: false,
      message: isStageBackward
        ? t.caseCard.actions.stageBackwardForbidden
        : isStageSkip
          ? t.caseCard.actions.stageSkipForbidden
          : dbErrorMessage(
              'updateCaseStageAction',
              error,
              t.caseCard.actions.stageChangeFailed,
              t.errors.db,
            ),
    };
  }

  // v3 s2: смена этапа из шапки дела тоже пишется в журнал (§7-9). Формат —
  // как в advanceCaseStageAction (case_updated с diff по stage).
  await logActivity({
    entity_type: 'case',
    entity_id: caseId,
    action: 'case_updated',
    changes: { diff: { stage: { from: before.stage, to: stage } } },
  });

  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  if (before.client_id) revalidatePath(`/clients/${before.client_id}`);
  return { ok: true };
}

// ── Описание дела: inline-редактирование с карточки (правка 2026-07-14) ───
// Право записи — RLS UPDATE cases (can_write_case: юрист/Експерт дела или
// видит-всё). Правка журналируется как case_updated с diff по description
// (значения усечены — поле может быть длинным).
export type DescriptionActionState = { ok: boolean; message?: string };

// Усечение значения для diff'а журнала (полный текст хранится в самом деле).
function clipForDiff(s: string | null): string | null {
  if (s === null) return null;
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

export async function updateCaseDescriptionAction(
  caseId: string,
  _prev: DescriptionActionState,
  formData: FormData,
): Promise<DescriptionActionState> {
  await requireUser();
  const { t } = await getT();

  if (!UUID_RE.test(caseId))
    return { ok: false, message: t.caseCard.actions.caseInvalid };

  const raw = String(formData.get('description') ?? '').trim();
  const description = raw ? raw : null;
  if (description && description.length > 5000)
    return { ok: false, message: t.caseCard.actions.descriptionTooLong };

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from('cases')
    .select('description')
    .eq('id', caseId)
    .maybeSingle<{ description: string | null }>();
  if (!before) return { ok: false, message: t.caseCard.actions.caseNotFound };
  if ((before.description ?? null) === description) return { ok: true }; // no-op

  const { error } = await supabase
    .from('cases')
    .update({ description })
    .eq('id', caseId);
  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(
        'updateCaseDescriptionAction',
        error,
        t.caseCard.actions.updateFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: caseId,
    action: 'case_updated',
    changes: {
      diff: {
        description: {
          from: clipForDiff(before.description),
          to: clipForDiff(description),
        },
      },
    },
  });

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

// ── Закрыть дело как «не заключили» (lost) — v3 Сессия 7 ──────────────────
// Дело с этапа new_request|consultation закрывается без договора. Право (staff или
// юрист дела + видимость) и журнал (case_lost) — внутри SECURITY DEFINER
// public.close_case_lost. Здесь — UX-валидация и человеческие сообщения ошибок.
export type CloseLostState = { ok: boolean; message?: string };

export async function closeCaseLostAction(
  caseId: string,
  reason: string,
): Promise<CloseLostState> {
  await requireUser();
  const { t } = await getT();

  if (!UUID_RE.test(caseId))
    return { ok: false, message: t.caseCard.actions.caseInvalid };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('close_case_lost', {
    p_case_id: caseId,
    p_reason: reason.trim().slice(0, 500),
  });

  if (error) {
    // RPC бросает: 'lost outcome is only…' (этап уже после контракта),
    // 'not allowed' (42501 — нет прав/не видит), иначе системный сбой.
    const msg = error.message ?? '';
    if (msg.includes('lost outcome is only'))
      return { ok: false, message: t.cases.lost.errorOnlyBeforeContract };
    if (msg.includes('not allowed') || error.code === '42501')
      return { ok: false, message: t.cases.lost.errorNotAllowed };
    return {
      ok: false,
      message: dbErrorMessage(
        'closeCaseLostAction',
        error,
        t.cases.lost.errorFailed,
        t.errors.db,
      ),
    };
  }

  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

export async function deleteCaseAction(formData: FormData): Promise<void> {
  // RLS DELETE = private.can('delete_cases'); UI скрывает кнопку. Но без gate на
  // сервере пользователь без права, форсящий POST вручную, прошёл бы мимо
  // silent-RLS-deny и получил фейковый `case_deleted` в activity_log.
  await requireCap('delete_cases');

  const caseId = getString(formData, 'case_id');
  if (!caseId || !UUID_RE.test(caseId)) {
    redirect('/cases?error=missing_id');
  }

  const supabase = await createSupabaseServerClient();

  // Снапшот для лога. После DELETE строки уже нет, но миграция MED#7
  // расширила log_activity: для 'case_deleted' проверка идёт через is_staff()
  // (RLS DELETE и так staff-only + requireRole выше), не через can_see_case.
  // Поэтому логируем ПОСЛЕ delete — при FK-violation фейковая запись не
  // создаётся (раньше: лог писался до delete и оставался при ошибке).
  const { data: before } = await supabase
    .from('cases')
    .select('number_title, stage, client_id')
    .eq('id', caseId)
    .maybeSingle();

  const { error } = await supabase.from('cases').delete().eq('id', caseId);

  if (error) {
    // documents и payments — ON DELETE RESTRICT, tasks — CASCADE.
    // FK 23503 = «есть связанные документы или платежи».
    const isFkViolation = error.code === '23503';
    const param = isFkViolation ? 'has_links' : 'delete_failed';
    redirect(`/cases/${caseId}?error=${param}`);
  }

  if (before) {
    await logActivity({
      entity_type: 'case',
      entity_id: caseId,
      action: 'case_deleted',
      changes: {
        before: {
          number_title: before.number_title,
          stage: before.stage,
        },
      },
    });
  }

  revalidatePath('/cases');
  redirect('/cases?deleted=1');
}

// ── Архив дела (вкладка «Архив») ──────────────────────────────────────────
// Архивирование отделено от воронки: дело лежит в архиве по cases.archived_at,
// а не по этапу. Правила (миграция 20260607120000_cases_archive):
//   • в архив можно отправить ТОЛЬКО завершённое дело (stage='closed');
//   • архивируют/восстанавливают только staff (owner/admin/office_manager);
//   • archived_by проставляет БД-триггер cases_guard_archive из active_uid().
// requireUser + STAFF_ROLES здесь — UX-гард; настоящая защита — БД-триггер.
// bare void action под кнопку-форму в строке списка; redirect'а нет — остаёмся
// с текущими фильтрами/страницей, список освежается revalidatePath.

async function setCaseArchived(
  formData: FormData,
  archive: boolean,
): Promise<void> {
  const user = await requireUser();

  const caseId = getString(formData, 'case_id');
  if (!UUID_RE.test(caseId)) return;
  // UX-гард: кнопки и так показываем только staff, но форс-POST не пройдёт.
  if (!STAFF_ROLES.includes(user.profile.role)) return;

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from('cases')
    .select('number_title, stage, archived_at, client_id')
    .eq('id', caseId)
    .maybeSingle<{
      number_title: string;
      stage: string;
      archived_at: string | null;
      client_id: string;
    }>();

  // RLS отрезала дело / его нет — тихо (как advanceCaseStageAction на гонке).
  if (!before) {
    revalidatePath('/cases');
    return;
  }

  // No-op: уже в нужном состоянии. Архивировать незакрытое дело нельзя
  // (CHECK cases_archived_requires_closed; кнопку и так не показываем).
  const alreadyInTarget = archive
    ? before.archived_at !== null
    : before.archived_at === null;
  if (alreadyInTarget || (archive && before.stage !== 'closed')) {
    revalidatePath('/cases');
    return;
  }

  // archived_by ставит триггер; здесь — только флаг времени / снятие.
  const { error } = await supabase
    .from('cases')
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', caseId);

  if (error) {
    // Не молчим: ошибку показываем на карточке дела (зеркало deleteCaseAction).
    // Штатные отказы (не staff / не closed) отсечены выше, до UPDATE, — сюда
    // долетает только нештатный сбой.
    console.error('setCaseArchived failed:', error.message);
    redirect(`/cases/${caseId}?error=archive_failed`);
  }

  await logActivity({
    entity_type: 'case',
    entity_id: caseId,
    action: archive ? 'case_archived' : 'case_restored',
    changes: {
      before: { number_title: before.number_title, stage: before.stage },
    },
  });

  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  if (before.client_id) revalidatePath(`/clients/${before.client_id}`);
}

export async function archiveCaseAction(formData: FormData): Promise<void> {
  await setCaseArchived(formData, true);
}

export async function unarchiveCaseAction(formData: FormData): Promise<void> {
  await setCaseArchived(formData, false);
}

// Канбан-доска: продвинуть дело на следующий этап (только вперёд).
// Триггер cases_validate_stage_forward сам отвергает откаты; здесь мы
// разрешаем вызов только если current_stage в БД совпадает с переданным
// (защита от race-кликов между rerender'ами). Принципиально: bare action
// без useActionState — кнопка-форма на карточке.
export async function advanceCaseStageAction(formData: FormData): Promise<void> {
  await requireUser();

  const caseId = getString(formData, 'case_id');
  const fromStage = getString(formData, 'from_stage');
  if (!UUID_RE.test(caseId)) return;
  if (!isCaseStage(fromStage)) return;

  const fromIdx = CASE_STAGES.indexOf(fromStage);
  if (fromIdx < 0 || fromIdx >= CASE_STAGES.length - 1) return;
  const toStage = CASE_STAGES[fromIdx + 1]!;

  const supabase = await createSupabaseServerClient();

  // Re-read для DB-truth: между рендером доски и кликом этап мог уже
  // продвинуться другим пользователем. Тогда наш UPDATE из устаревшего
  // fromStage просто промахнётся (.eq('stage', fromStage)) — rows=0, тихо.
  const updates: Record<string, unknown> = { stage: toStage };
  if (toStage === 'closed') {
    // CHECK constraint cases_closed_consistency требует closed_at при stage=closed.
    updates.closed_at = new Date().toISOString().slice(0, 10);
  }

  const { error, count } = await supabase
    .from('cases')
    .update(updates, { count: 'exact' })
    .eq('id', caseId)
    .eq('stage', fromStage);

  if (error || !count) {
    // Триггер не должен отвергать движение вперёд. RLS / устаревший stage —
    // тихо: не показываем ошибку (это staff-операция, доска ререндерится).
    revalidatePath('/cases/board');
    return;
  }

  await logActivity({
    entity_type: 'case',
    entity_id: caseId,
    action: 'case_updated',
    changes: { diff: { stage: { from: fromStage, to: toStage } } },
  });

  revalidatePath('/cases/board');
  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
}
