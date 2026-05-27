// Доменные типы, синхронные с public-схемой (см. supabase/migrations).
// `supabase gen types` подключим позже — пока вручную, чтобы не тянуть в Шаге 2
// генератор и не закладываться на структуру, которая ещё будет меняться.

export type Role = 'owner' | 'admin' | 'specialist' | 'assistant';
export type SpecialistType = 'lawyer' | 'jurist';

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  specialist_type: SpecialistType | null;
  supervisor_id: string | null;
  is_active: boolean;
  created_at: string;
};

export const STAFF_ROLES: ReadonlyArray<Role> = ['owner', 'admin', 'specialist', 'assistant'];

export function isStaffRole(value: unknown): value is Role {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

// =====================================================================
// Clients
// =====================================================================

export type ClientKind = 'individual' | 'company';

export const CLIENT_KINDS: ReadonlyArray<ClientKind> = ['individual', 'company'];

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  individual: 'Физлицо',
  company: 'Компания',
};

export type Client = {
  id: string;
  name: string;
  client_kind: ClientKind;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

// =====================================================================
// Cases — центральная сущность (CLAUDE.md §5, §6).
// =====================================================================

export type CaseStage =
  | 'new_request'
  | 'consultation'
  | 'in_progress'
  | 'pretrial'
  | 'litigation'
  | 'awaiting_decision'
  | 'enforcement'
  | 'closed';

export const CASE_STAGES: ReadonlyArray<CaseStage> = [
  'new_request',
  'consultation',
  'in_progress',
  'pretrial',
  'litigation',
  'awaiting_decision',
  'enforcement',
  'closed',
];

export const CASE_STAGE_LABEL: Record<CaseStage, string> = {
  new_request: 'Новое обращение',
  consultation: 'Консультация',
  in_progress: 'В работе',
  pretrial: 'Досудебное',
  litigation: 'Судебное',
  awaiting_decision: 'Ожидание решения',
  enforcement: 'Исполнение',
  closed: 'Завершено',
};

export type CaseType =
  | 'civil'
  | 'criminal'
  | 'corporate'
  | 'administrative'
  | 'family'
  | 'labor'
  | 'other';

export const CASE_TYPES: ReadonlyArray<CaseType> = [
  'civil',
  'criminal',
  'corporate',
  'administrative',
  'family',
  'labor',
  'other',
];

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  civil: 'Гражданское',
  criminal: 'Уголовное',
  corporate: 'Корпоративное',
  administrative: 'Административное',
  family: 'Семейное',
  labor: 'Трудовое',
  other: 'Другое',
};

export type CasePriority = 'normal' | 'urgent';

export const CASE_PRIORITIES: ReadonlyArray<CasePriority> = ['normal', 'urgent'];

export const CASE_PRIORITY_LABEL: Record<CasePriority, string> = {
  normal: 'Обычный',
  urgent: 'Срочный',
};

export type BillingType = 'prepaid' | 'hourly' | 'fixed' | 'success_fee';

export const BILLING_TYPES: ReadonlyArray<BillingType> = [
  'prepaid',
  'hourly',
  'fixed',
  'success_fee',
];

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  prepaid: 'Предоплата',
  hourly: 'Почасовая',
  fixed: 'Фиксированная',
  success_fee: 'За результат',
};

// Используется в /clients/[id] для compact-таблицы дел клиента.
export type CaseSummary = {
  id: string;
  number_title: string;
  stage: CaseStage;
  opened_at: string;
  contract_sum: number;
  debt: number;
  responsible: {
    id: string;
    full_name: string;
  } | null;
};

// Полная сущность дела — для карточки и формы редактирования.
export type Case = {
  id: string;
  number_title: string;
  client_id: string;
  responsible_id: string;
  opened_at: string;
  case_type: CaseType;
  stage: CaseStage;
  priority: CasePriority;
  tags: string[];
  contract_sum: number;
  paid_total: number;
  debt: number;
  billing_types: BillingType[];
  // Phase 2/A — дефолтная почасовая ставка по делу (snapshot копируется
  // в time_entries.hourly_rate при создании entry). NULL = не настроено.
  hourly_rate: number | null;
  opponent: string | null;
  court_case_number: string | null;
  court: string | null;
  closed_at: string | null;
  created_at: string;
};

// Дело с join-ом клиента и ответственного — для списка и карточки.
export type CaseWithRefs = Case & {
  client: {
    id: string;
    name: string;
    client_kind: ClientKind;
  } | null;
  responsible: {
    id: string;
    full_name: string;
    specialist_type: SpecialistType | null;
  } | null;
};

// =====================================================================
// Tasks — задачи, заседания, дедлайны (CLAUDE.md §5, §7-5, §8 Phase 1).
// =====================================================================

export type TaskKind = 'task' | 'hearing' | 'deadline';

export const TASK_KINDS: ReadonlyArray<TaskKind> = ['task', 'hearing', 'deadline'];

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  task: 'Задача',
  hearing: 'Заседание',
  deadline: 'Дедлайн',
};

export type TaskStatus = 'open' | 'done';

export const TASK_STATUSES: ReadonlyArray<TaskStatus> = ['open', 'done'];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Открыта',
  done: 'Завершена',
};

export type Task = {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  assignee_id: string;
  created_by: string;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
};

export type TaskWithRefs = Task & {
  assignee: { id: string; full_name: string } | null;
  case: { id: string; number_title: string } | null;
};

// =====================================================================
// Documents — файлы по делу (CLAUDE.md §5, §8 Phase 1).
// =====================================================================

export type DocType =
  | 'contract'
  | 'claim'
  | 'power_of_attorney'
  | 'correspondence'
  | 'other';

export const DOC_TYPES: ReadonlyArray<DocType> = [
  'contract',
  'claim',
  'power_of_attorney',
  'correspondence',
  'other',
];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  contract: 'Договор',
  claim: 'Претензия',
  power_of_attorney: 'Доверенность',
  correspondence: 'Переписка',
  other: 'Прочее',
};

export type DocumentRow = {
  id: string;
  case_id: string;
  file_name: string;
  storage_key: string;
  doc_type: DocType;
  uploaded_by: string;
  uploaded_at: string;
};

export type DocumentWithUploader = DocumentRow & {
  uploader: { id: string; full_name: string } | null;
};

// =====================================================================
// Payments — оплаты по делу (CLAUDE.md §5, §8 Phase 1).
// paid_total и debt пересчитываются триггерами в БД — UI читает их из cases.
// =====================================================================

export type PaymentRow = {
  id: string;
  case_id: string;
  // numeric(14,2): PostgREST отдаёт строкой, нормализуем в number при чтении.
  amount: number;
  // date (не timestamptz) — YYYY-MM-DD.
  paid_at: string;
  method: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

export type PaymentWithCreator = PaymentRow & {
  creator: { id: string; full_name: string } | null;
};

// =====================================================================
// Time entries — учёт времени (CLAUDE.md §9 Q12, Phase 2 / Step A).
// minutes хранятся как int (1ч 30м = 90); UI парсит свободный ввод.
// hourly_rate — snapshot из cases.hourly_rate на момент создания.
// =====================================================================

export type TimeEntryRow = {
  id: string;
  case_id: string;
  task_id: string | null;
  user_id: string;
  spent_at: string;        // date (YYYY-MM-DD)
  minutes: number;          // int, >0 ≤ 24*60
  billable: boolean;
  hourly_rate: number | null;  // numeric(10,2); null = почасово не считается
  note: string | null;
  invoice_id: string | null;   // Phase 2/B placeholder
  created_at: string;
  updated_at: string;
};

export type TimeEntryWithRefs = TimeEntryRow & {
  user: { id: string; full_name: string } | null;
  case: { id: string; number_title: string } | null;
  task: { id: string; title: string } | null;
};

// Агрегаты «по делу» для KPI в карточке дела.
export type CaseTimeAggregate = {
  total_minutes: number;
  billable_minutes: number;
  billable_amount: number;   // сумма billable_minutes/60 × rate
  entries_count: number;
};
