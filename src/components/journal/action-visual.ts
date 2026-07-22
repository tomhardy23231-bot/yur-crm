import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  AtSign,
  BadgeCheck,
  Banknote,
  Building2,
  Briefcase,
  CalendarClock,
  CircleOff,
  Coins,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FileX,
  Gift,
  KeyRound,
  Landmark,
  ListChecks,
  LogIn,
  Mail,
  MessageSquare,
  MessageSquarePlus,
  Palmtree,
  Pencil,
  Percent,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

// ============================================================================
// Визуальный язык журнала (/journal): у КАЖДОГО действия — своя иконка (что
// произошло) и семантический тон кружка (какого рода действие):
//   зелёный — создано/деньги пришли; синий — изменено; красный — удалено/
//   тревога; оранжевый — зарплата/выплаты; голубой — просмотр/вход/скачивание;
//   фиолетовый — отпуска; серый — нейтральное.
// Тона — парой «подложка *-bg + тёмный текст *-text» (DESIGN.md §3, AA).
// ============================================================================

export type ActionTone =
  | 'create'
  | 'update'
  | 'delete'
  | 'money'
  | 'payout'
  | 'view'
  | 'absence'
  | 'neutral';

export const TONE_CLASS: Record<ActionTone, string> = {
  create: 'bg-success-bg text-success-text',
  update: 'bg-primary-subtle text-primary-pressed',
  delete: 'bg-error-bg text-error-text',
  money: 'bg-success-bg text-success-text',
  payout: 'bg-warning-bg text-warning-text',
  view: 'bg-info-bg text-info-text',
  absence: 'bg-absence-bg text-absence',
  neutral: 'bg-surface-sunken text-text-muted',
};

export type ActionVisual = { icon: LucideIcon; tone: ActionTone };

const VISUALS: Record<string, ActionVisual> = {
  // Дела
  case_created: { icon: Briefcase, tone: 'create' },
  case_updated: { icon: Briefcase, tone: 'update' },
  case_deleted: { icon: Briefcase, tone: 'delete' },
  case_lost: { icon: CircleOff, tone: 'delete' },
  case_archived: { icon: Archive, tone: 'neutral' },
  case_restored: { icon: ArchiveRestore, tone: 'update' },
  stage_corrected: { icon: ArrowLeftRight, tone: 'update' },

  // Клиенты
  client_created: { icon: UserPlus, tone: 'create' },
  client_updated: { icon: Users, tone: 'update' },
  client_deleted: { icon: Users, tone: 'delete' },

  // Документы
  document_uploaded: { icon: FileUp, tone: 'create' },
  document_deleted: { icon: FileX, tone: 'delete' },
  document_downloaded: { icon: FileDown, tone: 'view' },

  // Платежи и график
  payment_created: { icon: Banknote, tone: 'money' },
  payment_updated: { icon: Banknote, tone: 'update' },
  payment_deleted: { icon: Banknote, tone: 'delete' },
  payment_plan_updated: { icon: CalendarClock, tone: 'update' },

  // Задачи
  task_created: { icon: ListChecks, tone: 'create' },
  task_updated: { icon: ListChecks, tone: 'update' },
  task_toggled: { icon: BadgeCheck, tone: 'update' },
  task_deleted: { icon: ListChecks, tone: 'delete' },

  // Акты
  act_created: { icon: FileSpreadsheet, tone: 'create' },
  act_paid: { icon: BadgeCheck, tone: 'money' },
  act_deleted: { icon: FileSpreadsheet, tone: 'delete' },
  act_completion_changed: { icon: FileSpreadsheet, tone: 'update' },

  // Зарплата
  payroll_paid: { icon: Coins, tone: 'payout' },
  payroll_reverted: { icon: Undo2, tone: 'payout' },
  payroll_payout: { icon: Coins, tone: 'payout' },
  payroll_bonus: { icon: Gift, tone: 'payout' },
  payroll_tx_deleted: { icon: Coins, tone: 'delete' },
  payroll_rates_changed: { icon: Percent, tone: 'payout' },
  user_salary_changed: { icon: Coins, tone: 'payout' },

  // Комментарии
  comment_added: { icon: MessageSquarePlus, tone: 'create' },
  comment_edited: { icon: MessageSquare, tone: 'update' },
  comment_deleted: { icon: MessageSquare, tone: 'delete' },

  // Сотрудники и доступы
  user_created: { icon: UserPlus, tone: 'create' },
  user_role_changed: { icon: UserCog, tone: 'update' },
  user_deactivated: { icon: UserX, tone: 'delete' },
  user_reactivated: { icon: UserCheck, tone: 'create' },
  user_permissions_changed: { icon: ShieldCheck, tone: 'update' },
  user_department_changed: { icon: Building2, tone: 'update' },
  user_password_reset: { icon: KeyRound, tone: 'update' },
  user_password_changed: { icon: KeyRound, tone: 'update' },
  user_email_changed: { icon: AtSign, tone: 'update' },
  user_invited: { icon: Mail, tone: 'create' },
  user_deleted: { icon: UserX, tone: 'delete' },

  // Подразделения
  department_created: { icon: Building2, tone: 'create' },
  department_renamed: { icon: Building2, tone: 'update' },
  department_activated: { icon: Building2, tone: 'create' },
  department_deactivated: { icon: Building2, tone: 'delete' },

  // Входы в систему
  user_login: { icon: LogIn, tone: 'view' },
  user_login_failed: { icon: ShieldAlert, tone: 'delete' },

  // Отпуска
  absence_created: { icon: Palmtree, tone: 'absence' },
  absence_deleted: { icon: Palmtree, tone: 'delete' },

  // Касса
  cash_account_created: { icon: Wallet, tone: 'create' },
  cash_account_updated: { icon: Wallet, tone: 'update' },
  cash_entry_created: { icon: Wallet, tone: 'money' },
  cash_entry_updated: { icon: Wallet, tone: 'update' },
  cash_entry_deleted: { icon: Wallet, tone: 'delete' },

  // Реквизиты компании
  org_requisites_updated: { icon: Landmark, tone: 'update' },
};

const FALLBACK: ActionVisual = { icon: Pencil, tone: 'neutral' };

export function actionVisual(action: string): ActionVisual {
  return VISUALS[action] ?? FALLBACK;
}
