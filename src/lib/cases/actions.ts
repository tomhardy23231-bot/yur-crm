'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  BILLING_TYPES,
  CASE_PRIORITIES,
  CASE_STAGES,
  CASE_TYPES,
  type BillingType,
  type CasePriority,
  type CaseStage,
  type CaseType,
} from '@/lib/types/db';

export type CaseFormFields =
  | 'number_title'
  | 'client_id'
  | 'responsible_id'
  | 'opened_at'
  | 'case_type'
  | 'stage'
  | 'priority'
  | 'contract_sum'
  | 'billing_types'
  | 'opponent'
  | 'court_case_number'
  | 'court'
  | 'tags';

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
function isBillingType(value: string): value is BillingType {
  return (BILLING_TYPES as readonly string[]).includes(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Validated = {
  number_title: string;
  client_id: string;
  responsible_id: string;
  opened_at: string;
  case_type: CaseType;
  stage: CaseStage;
  priority: CasePriority;
  contract_sum: number;
  billing_types: BillingType[];
  opponent: string | null;
  court_case_number: string | null;
  court: string | null;
  tags: string[];
  closed_at: string | null;
};

function todayIso(): string {
  // local date в формате YYYY-MM-DD; БД хранит как date без TZ.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validate(formData: FormData):
  | { ok: true; data: Validated; values: Record<CaseFormFields, string>; selectedBillingTypes: BillingType[] }
  | { ok: false; state: CaseActionState } {
  const number_title = getString(formData, 'number_title');
  const client_id = getString(formData, 'client_id');
  const responsible_id = getString(formData, 'responsible_id');
  const opened_at = getString(formData, 'opened_at');
  const case_type_raw = getString(formData, 'case_type');
  const stage_raw = getString(formData, 'stage');
  const priority_raw = getString(formData, 'priority');
  const contract_sum_raw = getString(formData, 'contract_sum');
  const opponent = getString(formData, 'opponent');
  const court_case_number = getString(formData, 'court_case_number');
  const court = getString(formData, 'court');
  const tags_raw = getString(formData, 'tags');

  const billing_types_raw = formData
    .getAll('billing_types')
    .filter((v): v is string => typeof v === 'string');
  const billing_types = billing_types_raw.filter(isBillingType);

  const values: Record<CaseFormFields, string> = {
    number_title,
    client_id,
    responsible_id,
    opened_at,
    case_type: case_type_raw,
    stage: stage_raw,
    priority: priority_raw,
    contract_sum: contract_sum_raw,
    billing_types: billing_types.join(','),
    opponent,
    court_case_number,
    court,
    tags: tags_raw,
  };

  const fieldErrors: CaseActionState['fieldErrors'] = {};

  if (!number_title) fieldErrors.number_title = 'Укажите номер/название';
  else if (number_title.length > 200)
    fieldErrors.number_title = 'Слишком длинное (макс 200)';

  if (!client_id) fieldErrors.client_id = 'Выберите клиента';
  else if (!UUID_RE.test(client_id))
    fieldErrors.client_id = 'Некорректный идентификатор клиента';

  if (!responsible_id) fieldErrors.responsible_id = 'Выберите ответственного';
  else if (!UUID_RE.test(responsible_id))
    fieldErrors.responsible_id = 'Некорректный идентификатор';

  if (!opened_at) fieldErrors.opened_at = 'Укажите дату открытия';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(opened_at))
    fieldErrors.opened_at = 'Дата в формате ГГГГ-ММ-ДД';

  if (!case_type_raw) fieldErrors.case_type = 'Выберите тип дела';
  else if (!isCaseType(case_type_raw))
    fieldErrors.case_type = 'Недопустимый тип';

  if (!stage_raw) fieldErrors.stage = 'Выберите этап';
  else if (!isCaseStage(stage_raw)) fieldErrors.stage = 'Недопустимый этап';

  if (!priority_raw) fieldErrors.priority = 'Выберите приоритет';
  else if (!isCasePriority(priority_raw))
    fieldErrors.priority = 'Недопустимый приоритет';

  let contract_sum = 0;
  if (contract_sum_raw) {
    // допускаем запятую как разделитель.
    const normalized = contract_sum_raw.replace(',', '.');
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors.contract_sum = 'Сумма — число ≥ 0';
    } else {
      contract_sum = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: {
        ok: false,
        fieldErrors,
        values,
        selectedBillingTypes: billing_types,
        message: 'Проверьте поля формы',
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
      responsible_id,
      opened_at,
      case_type: case_type_raw as CaseType,
      stage,
      priority: priority_raw as CasePriority,
      contract_sum,
      billing_types,
      opponent: opponent || null,
      court_case_number: court_case_number || null,
      court: court || null,
      tags,
      closed_at,
    },
    values,
    selectedBillingTypes: billing_types,
  };
}

export async function createCaseAction(
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  await requireUser();
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .insert(result.data)
    .select('id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      values: result.values,
      selectedBillingTypes: result.selectedBillingTypes,
      message: error?.message ?? 'Не удалось создать дело',
    };
  }

  revalidatePath('/cases');
  revalidatePath(`/clients/${result.data.client_id}`);
  redirect(`/cases/${data.id}`);
}

export async function updateCaseAction(
  caseId: string,
  _prev: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  await requireUser();
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();
  // При смене этапа на/с 'closed' триггеров для closed_at нет — обновляем сами.
  // (CHECK constraint cases_closed_consistency требует синхронности.)
  const { error } = await supabase
    .from('cases')
    .update(result.data)
    .eq('id', caseId);

  if (error) {
    // Шаг 6: триггер `cases_validate_stage_forward` бросает 'stage_backward_forbidden'
    // когда specialist/assistant пытается откатить этап. Подменяем системное
    // сообщение Postgres на человеческое.
    const isStageBackward = error.message?.includes('stage_backward_forbidden');
    return {
      ok: false,
      values: result.values,
      selectedBillingTypes: result.selectedBillingTypes,
      fieldErrors: isStageBackward ? { stage: 'Возврат на предыдущий этап запрещён' } : undefined,
      message: isStageBackward
        ? 'Возврат на предыдущий этап разрешён только администратору.'
        : error.message,
    };
  }

  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/clients/${result.data.client_id}`);
  redirect(`/cases/${caseId}`);
}

export async function deleteCaseAction(formData: FormData): Promise<void> {
  await requireUser();

  const caseId = getString(formData, 'case_id');
  if (!caseId || !UUID_RE.test(caseId)) {
    redirect('/cases?error=missing_id');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('cases').delete().eq('id', caseId);

  if (error) {
    // documents и payments — ON DELETE RESTRICT, tasks — CASCADE.
    // FK 23503 = «есть связанные документы или платежи».
    const isFkViolation = error.code === '23503';
    const param = isFkViolation ? 'has_links' : 'delete_failed';
    redirect(`/cases/${caseId}?error=${param}`);
  }

  revalidatePath('/cases');
  redirect('/cases?deleted=1');
}
