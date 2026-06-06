// Доменные типы, синхронные с public-схемой (см. supabase/migrations).
// `supabase gen types` подключим позже — пока вручную, чтобы не тянуть в Шаге 2
// генератор и не закладываться на структуру, которая ещё будет меняться.

import type { Locale } from '@/lib/i18n/config';

// =====================================================================
// Роли (CLAUDE.md §4, новая Концепция):
//   owner          — владелец / супер-админ (всё + системные настройки);
//   admin          — руководитель подразделения (всё + управление пользователями);
//   office_manager — секретарь (заводит клиентов/дела, видит все финансы);
//   lawyer         — юрист-продажник (заключает договор → cases.lawyer_id);
//   expert         — Експерт-исполнитель (ведёт дело → cases.responsible_id).
// =====================================================================

export type Role = 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert';

export const ALL_ROLES: ReadonlyArray<Role> = [
  'owner',
  'admin',
  'office_manager',
  'lawyer',
  'expert',
];

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  office_manager: 'Офис-менеджер',
  lawyer: 'Юрист',
  expert: 'Эксперт',
};

// Staff — полный доступ к делам/клиентам/финансам (видят всё).
export const STAFF_ROLES: ReadonlyArray<Role> = ['owner', 'admin', 'office_manager'];

// Управление пользователями + деструктивные операции (удаление, правка платежей).
export const MANAGER_ROLES: ReadonlyArray<Role> = ['owner', 'admin'];

// Кто вправе заводить клиентов (Задача 1): все роли, КРОМЕ expert (он работает
// только по назначенным делам). Совпадает с private.can_create_clients() в БД.
export const CLIENT_CREATOR_ROLES: ReadonlyArray<Role> = [
  'owner',
  'admin',
  'office_manager',
  'lawyer',
];

export function canCreateClients(role: Role): boolean {
  return (CLIENT_CREATOR_ROLES as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}

export function isStaff(role: Role): boolean {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}

// Ступенчатые права на управление пользователем (Задача 4 «плюшка владельца»):
//   owner — управляет любой ролью; admin — только office_manager/lawyer/expert
//   (НЕ owner/admin). Совпадает с private.can_manage_target_user в БД (RLS).
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') {
    return (
      targetRole === 'office_manager' ||
      targetRole === 'lawyer' ||
      targetRole === 'expert'
    );
  }
  return false;
}

// Роли, которые актор вправе назначать/создавать (для Select на экране users).
// hasManageUsers по умолчанию выводится из роли (owner/admin); можно передать
// эффективное право manage_users — тогда учитывается выданное персональное право.
export function assignableRoles(
  actorRole: Role,
  hasManageUsers: boolean = (MANAGER_ROLES as readonly Role[]).includes(actorRole),
): Role[] {
  if (!hasManageUsers) return [];
  if (actorRole === 'owner') return [...ALL_ROLES];
  return ['office_manager', 'lawyer', 'expert'];
}

// Cap-aware «может ли актор управлять пользователем с такой ролью» — зеркало
// private.can_manage_target_user (SQL). owner-по-роли → любой; иной обладатель
// права manage_users → только office_manager/lawyer/expert (не owner/admin).
export function canManageTargetUser(
  actorRole: Role,
  actorHasManageUsers: boolean,
  targetRole: Role,
): boolean {
  if (!actorHasManageUsers) return false;
  if (actorRole === 'owner') return true;
  return targetRole !== 'owner' && targetRole !== 'admin';
}

// ────────────────────────────────────────────────────────────────────────
// Персональные права поверх ролей (per-user permission overrides).
// Зеркало supabase/migrations/20260601100000_permission_overrides.sql.
// БД — источник правды (RLS/триггеры зовут private.can/can_grant_cap);
// эти функции нужны для гейтинга UI и предпроверок в server actions.
// ВНИМАНИЕ: CAP_ROLE_DEFAULTS обязан совпадать с private.cap_role_default (SQL).
// ────────────────────────────────────────────────────────────────────────

export const CAPABILITIES = [
  'view_all_cases',
  'create_cases',
  'delete_cases',
  'create_clients',
  'delete_clients',
  'delete_documents',
  'edit_payments',
  'view_all_payroll',
  'edit_rate_overrides',
  'manage_users',
  'edit_payroll_rates',
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type PermOverrides = Partial<Record<Capability, boolean>>;
export type EffectiveCaps = Record<Capability, boolean>;

// Дефолт права по роли — ЕДИНСТВЕННЫЙ источник в TS (сверен с SQL cap_role_default).
// Record<Capability, ...> заставляет перечислить все права (иначе ошибка типов).
export const CAP_ROLE_DEFAULTS: Record<Capability, readonly Role[]> = {
  view_all_cases: ['owner', 'admin', 'office_manager'],
  create_cases: ['owner', 'admin', 'office_manager'],
  delete_cases: ['owner', 'admin'],
  create_clients: ['owner', 'admin', 'office_manager', 'lawyer'],
  delete_clients: ['owner', 'admin'],
  delete_documents: ['owner', 'admin'],
  edit_payments: ['owner', 'admin'],
  view_all_payroll: ['owner', 'admin', 'office_manager'],
  edit_rate_overrides: ['owner', 'admin'],
  manage_users: ['owner', 'admin'],
  edit_payroll_rates: ['owner'],
};

// Право, которое выдаёт ТОЛЬКО владелец (системные настройки).
export const OWNER_ONLY_CAPABILITIES: readonly Capability[] = ['edit_payroll_rates'];

// Подписи прав для UI настроек (русский).
export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_all_cases: 'Видеть все дела',
  create_cases: 'Создавать дела',
  delete_cases: 'Удалять дела',
  create_clients: 'Создавать клиентов',
  delete_clients: 'Удалять клиентов',
  delete_documents: 'Удалять документы',
  edit_payments: 'Изменять и удалять платежи',
  view_all_payroll: 'Видеть зарплату всех',
  edit_rate_overrides: 'Менять % зарплаты на деле',
  manage_users: 'Управление пользователями',
  edit_payroll_rates: 'Системные настройки (ставки)',
};

export const CAPABILITY_HINTS: Record<Capability, string> = {
  view_all_cases:
    'Доступ ко всем делам (и их клиентам, документам, задачам, платежам), а не только к своим.',
  create_cases: 'Заводить новые дела.',
  delete_cases: 'Удалять дела.',
  create_clients: 'Заводить новых клиентов.',
  delete_clients: 'Удалять клиентов.',
  delete_documents: 'Удалять документы по делам.',
  edit_payments: 'Изменять и удалять платежи клиентов.',
  view_all_payroll: 'Видеть начисления и выплаты зарплаты всех сотрудников.',
  edit_rate_overrides: 'Задавать индивидуальный % зарплаты на конкретном деле.',
  manage_users: 'Создавать сотрудников и менять их роли и права.',
  edit_payroll_rates: 'Менять базовые ставки зарплаты по категориям дел.',
};

// Дефолт права по роли. Зеркало private.cap_role_default.
export function capRoleDefault(cap: Capability, role: Role): boolean {
  return CAP_ROLE_DEFAULTS[cap].includes(role);
}

// Эффективное право: оверрайд (если задан и булев) важнее дефолта роли.
export function effectiveCap(
  cap: Capability,
  role: Role,
  overrides: PermOverrides | null | undefined,
): boolean {
  const ov = overrides?.[cap];
  if (typeof ov === 'boolean') return ov;
  return capRoleDefault(cap, role);
}

// Полная карта эффективных прав (для CurrentUser.caps).
export function resolveCaps(
  role: Role,
  overrides: PermOverrides | null | undefined,
): EffectiveCaps {
  return Object.fromEntries(
    CAPABILITIES.map((cap) => [cap, effectiveCap(cap, role, overrides)]),
  ) as EffectiveCaps;
}

// Может ли актор ВЫДАТЬ/СНЯТЬ право cap целевому пользователю.
// Зеркало private.can_grant_cap (UI-предпроверка; финальный страж — БД-триггер).
export function canGrantCapability(
  cap: Capability,
  actorRole: Role,
  actorCaps: EffectiveCaps,
  targetRole: Role,
  isSelf: boolean,
): boolean {
  if (isSelf) return false; // нельзя править свои права
  if (!canManageTargetUser(actorRole, actorCaps.manage_users, targetRole)) {
    return false; // вне зоны управления / нет manage_users
  }
  if (cap === 'edit_payroll_rates' && actorRole !== 'owner') return false; // owner-only
  if (cap === 'manage_users' && actorRole !== 'owner' && actorRole !== 'admin') {
    return false; // manage_users выдают только owner/admin по роли
  }
  if (actorRole !== 'owner' && !actorCaps[cap]) return false; // анти-амплификация
  return true;
}

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  // Персональные права поверх роли (tri-state по ключу). Пусто {} = как у роли.
  perm_overrides: PermOverrides;
  // Язык интерфейса (двуязычный UI). Дефолт 'uk'. Меняется в профиле.
  language: Locale;
};

// =====================================================================
// Clients
// =====================================================================

// entrepreneur — ФОП (фізична особа-підприємець), отдельный статус для Украины.
export type ClientKind = 'individual' | 'company' | 'entrepreneur';

export const CLIENT_KINDS: ReadonlyArray<ClientKind> = [
  'individual',
  'company',
  'entrepreneur',
];

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  individual: 'Физлицо',
  company: 'Компания',
  entrepreneur: 'ФОП',
};

// Источник клиента (новая Концепция, раздел 7).
export type ClientSource =
  | 'website'
  | 'referral'
  | 'advertising'
  | 'repeat'
  | 'other';

export const CLIENT_SOURCES: ReadonlyArray<ClientSource> = [
  'website',
  'referral',
  'advertising',
  'repeat',
  'other',
];

export const CLIENT_SOURCE_LABEL: Record<ClientSource, string> = {
  website: 'Сайт',
  referral: 'Рекомендация',
  advertising: 'Реклама',
  repeat: 'Повторное обращение',
  other: 'Другое',
};

export type Client = {
  id: string;
  name: string;
  client_kind: ClientKind;
  // ФИО раздельно — для физлиц/ФОП. У компаний пустые, отображаемое имя = name.
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  inn: string | null;
  contract_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: ClientSource | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

// У физлица и ФОП есть ФИО (раздельные поля); у компании — только наименование.
export function clientKindHasFullName(kind: ClientKind): boolean {
  return kind === 'individual' || kind === 'entrepreneur';
}

// =====================================================================
// Cases — центральная сущность (CLAUDE.md §5, §6).
// =====================================================================

export type CaseStage =
  | 'new_request'
  | 'consultation'
  | 'in_progress'
  | 'awaiting_decision'
  | 'closed';

export const CASE_STAGES: ReadonlyArray<CaseStage> = [
  'new_request',
  'consultation',
  'in_progress',
  'awaiting_decision',
  'closed',
];

export const CASE_STAGE_LABEL: Record<CaseStage, string> = {
  new_request: 'Новое обращение',
  consultation: 'Консультация',
  in_progress: 'В работе',
  awaiting_decision: 'Ожидание решения',
  closed: 'Завершено',
};

// Этапы, на которые роль может перевести дело с текущего (Задача 8):
//   staff — все 5 (могут скорректировать/перескочить/откатить — §7-2);
//   не-staff — только ТЕКУЩИЙ и строго СЛЕДУЮЩИЙ (без прыжков и отката).
// БД-триггер cases_validate_stage_forward — жёсткая защита; это UI-фильтр.
export function allowedStagesFor(
  current: CaseStage,
  staff: boolean,
): CaseStage[] {
  if (staff) return [...CASE_STAGES];
  const idx = CASE_STAGES.indexOf(current);
  if (idx < 0) return [...CASE_STAGES];
  return CASE_STAGES.slice(idx, idx + 2); // текущий + следующий
}

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

// Категория дела (новая Концепция, раздел 3) — основа расчёта % зарплаты.
// Конкретные проценты лежат в public.payroll_rates (по умолчанию 7/10/25).
export type CaseCategory = 'document' | 'claim' | 'representation';

export const CASE_CATEGORIES: ReadonlyArray<CaseCategory> = [
  'document',
  'claim',
  'representation',
];

export const CASE_CATEGORY_LABEL: Record<CaseCategory, string> = {
  document: 'Документ',
  claim: 'Иск',
  representation: 'Представительство',
};

export type CasePriority = 'normal' | 'urgent';

export const CASE_PRIORITIES: ReadonlyArray<CasePriority> = ['normal', 'urgent'];

export const CASE_PRIORITY_LABEL: Record<CasePriority, string> = {
  normal: 'Обычный',
  urgent: 'Срочный',
};

// Схема расчётов (новая Концепция, раздел 7). Почасовая оплата удалена.
export type BillingType = 'prepaid' | 'installments' | 'fixed' | 'success_fee';

export const BILLING_TYPES: ReadonlyArray<BillingType> = [
  'prepaid',
  'installments',
  'fixed',
  'success_fee',
];

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  prepaid: 'Предоплата',
  installments: 'График расчётов',
  fixed: 'Фиксированная',
  success_fee: 'Гонорар успеха',
};

// Когда зарплата фиксируется в леджере (P2.1).
export type AccrualMode = 'on_completion' | 'per_payment';

export const ACCRUAL_MODES: ReadonlyArray<AccrualMode> = [
  'on_completion',
  'per_payment',
];

export const ACCRUAL_MODE_LABEL: Record<AccrualMode, string> = {
  on_completion: 'При завершении дела',
  per_payment: 'По мере оплат',
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
  // lawyer_id     — юрист, заключивший договор; responsible_id — Експерт-исполнитель.
  lawyer_id: string;
  responsible_id: string;
  opened_at: string;
  case_type: CaseType;
  category: CaseCategory;
  subject: string | null;
  stage: CaseStage;
  priority: CasePriority;
  tags: string[];
  contract_sum: number;
  paid_total: number;
  debt: number;
  // Дериватив: max(0, paid_total − contract_sum). Переплата клиента (Задача 3).
  overpaid: number;
  billing_types: BillingType[];
  // Индивидуальные % по делу (null → ставка категории). Меняет только owner/admin.
  lawyer_rate_override: number | null;
  expert_rate_override: number | null;
  accrual_mode: AccrualMode;
  opponent: string | null;
  court_case_number: string | null;
  court: string | null;
  closed_at: string | null;
  // true, если дело closed без документа doc_type='act' (Задача 4). Мягкая пометка.
  closed_without_act: boolean;
  // Момент входа в текущий этап — для «N дней на этапе» (U6).
  stage_changed_at: string;
  created_at: string;
};

// Дело с join-ом клиента, юриста и Експерта — для списка и карточки.
export type CaseWithRefs = Case & {
  client: {
    id: string;
    name: string;
    client_kind: ClientKind;
    // Контакты клиента — для блока «Клиент» в карточке (тел./email + действия).
    phone: string | null;
    email: string | null;
    source: ClientSource | null;
  } | null;
  lawyer: {
    id: string;
    full_name: string;
  } | null;
  responsible: {
    id: string;
    full_name: string;
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
// Comments — заметки сотрудников к делу (рядом с задачами). Доступ
// наследуется от дела (RLS, миграция 20260606130000_case_comments).
// =====================================================================

export type CaseComment = {
  id: string;
  case_id: string;
  author_id: string;
  body: string;
  created_at: string;
  // NULL — не редактировался; иначе время последней правки тела.
  updated_at: string | null;
};

export type CaseCommentWithAuthor = CaseComment & {
  author: { id: string; full_name: string } | null;
};

// =====================================================================
// Documents — файлы по делу (CLAUDE.md §5, §8 Phase 1).
// =====================================================================

export type DocType =
  | 'contract'
  | 'claim'
  | 'power_of_attorney'
  | 'correspondence'
  | 'act'
  | 'other';

export const DOC_TYPES: ReadonlyArray<DocType> = [
  'contract',
  'claim',
  'power_of_attorney',
  'correspondence',
  'act',
  'other',
];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  contract: 'Договор',
  claim: 'Претензия',
  power_of_attorney: 'Доверенность',
  correspondence: 'Переписка',
  act: 'Акт приёма-передачи',
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
  /** Время последнего изменения файла (правка через OnlyOffice). Опц. — есть
   *  не во всех выборках; нужен для версионного ключа редактора. */
  updated_at?: string | null;
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
  // Ключ идемпотентности отправки формы (Задача 2). Уникален среди не-NULL;
  // защищает от дубля платежа при мульти-сабмите. В UI не отображается.
  idempotency_key: string | null;
};

export type PaymentWithCreator = PaymentRow & {
  creator: { id: string; full_name: string } | null;
};

// =====================================================================
// Payroll — зарплата в % от оплат по делу (новая Концепция).
// Каждый из юриста (lawyer_id) и Експерта (responsible_id) получает полный
// категорийный % от cases.paid_total. Проценты — в public.payroll_rates.
// =====================================================================

export type PayrollRate = {
  category: CaseCategory;
  // numeric(5,2) → нормализуем в number. Раздельно для юриста и Експерта
  // (дефолты равны 7/10/25; переопределяются на деле через *_rate_override).
  lawyer_percent: number;
  expert_percent: number;
  updated_at: string;
};

// Результат public.case_payroll(case_id). Эффективная ставка каждой роли =
// coalesce(per-case override, дефолт категории).
export type CasePayroll = {
  category: CaseCategory;
  lawyer_percent: number;
  lawyer_amount: number;
  expert_percent: number;
  expert_amount: number;
  total: number; // lawyer_amount + expert_amount
};

// Строка отчёта public.payroll_by_specialist().
export type PayrollBySpecialist = {
  user_id: string;
  full_name: string;
  role_in_case: 'lawyer' | 'expert';
  case_count: number;
  paid_base: number;
  earned: number;
};

// Запись леджера начислений/выплат (P1.3).
export type LedgerStatus = 'accrued' | 'paid';

// U2: «accrued» = зафиксировано в леджере, но ещё не выплачено → «К выплате»
// (однозначно и согласовано с колонкой «К выплате» в отчёте). «paid» = «Выплачено».
export const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  accrued: 'К выплате',
  paid: 'Выплачено',
};

export type PayrollLedgerEntry = {
  id: string;
  case_id: string;
  user_id: string;
  role_in_case: 'lawyer' | 'expert';
  base_amount: number;
  percent: number;
  amount: number;
  status: LedgerStatus;
  accrued_at: string;
  paid_at: string | null;
  // Кто (owner/admin) отметил выплату. NULL пока accrued / после отката (Задача 5).
  paid_by: string | null;
};

// Запись леджера с join'ами сотрудника и дела — для отчёта выплат.
export type PayrollLedgerWithRefs = PayrollLedgerEntry & {
  user: { id: string; full_name: string } | null;
  case: { id: string; number_title: string } | null;
};

// Строка сводки по леджеру (public.payroll_payout_by_specialist): начислено
// всего / выплачено / к выплате (остаток). Задача 5.
export type PayrollPayoutBySpecialist = {
  user_id: string;
  full_name: string;
  role_in_case: 'lawyer' | 'expert';
  total: number;
  paid: number;
  outstanding: number;
};

// ============================================================================
// Ручные движения зарплаты (правка №1): выплаты с распределением по делам и премии.
// «Начислено» считается вживую; «выплачено»/«премии» — записи payroll_transactions.
// ============================================================================

export type PayrollTxKind = 'payout' | 'bonus';

export const PAYROLL_TX_KIND_LABEL: Record<PayrollTxKind, string> = {
  payout: 'Выплата',
  bonus: 'Премия',
};

// Роль сотрудника в деле (для разбивки заработка). Уже встречается выше как
// inline-тип; выносим лейблы сюда для переиспользования в отчёте ЗП.
export type RoleInCase = 'lawyer' | 'expert';

export const ROLE_IN_CASE_LABEL: Record<RoleInCase, string> = {
  lawyer: 'Юрист',
  expert: 'Эксперт',
};

// Строка списка сотрудников в отчёте ЗП (public.payroll_employee_summary).
export type PayrollEmployeeSummary = {
  user_id: string;
  full_name: string;
  earned: number;   // начислено за дела (live, обе роли)
  bonus: number;    // премии (+)
  payout: number;   // выплачено (−)
  balance: number;  // earned + bonus − payout = «к выплате»
};

// Строка разбивки по делам в карточке сотрудника (public.payroll_employee_cases).
export type PayrollEmployeeCase = {
  case_id: string;
  number_title: string;
  stage: CaseStage;
  role_in_case: RoleInCase;
  paid_total: number;
  percent: number;
  earned: number;       // paid_total × percent (live)
  paid: number;         // сумма аллокаций выплат по делу+роли
  outstanding: number;  // earned − paid (что ещё не выплачено)
};

// Движение зарплаты (payroll_transactions) с аллокациями по делам (для истории).
export type PayrollTransaction = {
  id: string;
  user_id: string;
  kind: PayrollTxKind;
  amount: number;
  comment: string | null;
  occurred_on: string;
  created_at: string;
  // Дела, вошедшие в выплату (для kind=payout). Для bonus — пустой массив.
  allocations: ReadonlyArray<{
    case_id: string;
    number_title: string;
    role_in_case: RoleInCase;
    amount: number;
  }>;
};
