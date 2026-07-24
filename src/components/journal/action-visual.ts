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
  Tags,
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
// Визуальный язык истории/журнала: у КАЖДОГО действия — своя иконка (что
// произошло) и тон кружка ПО ОБЛАСТИ действия (о чём событие), чтобы разные
// типы не сливались в один цвет (2026-07-24, замечание владельца):
//   синий — дела и этапы; фиолетовый — клиенты; голубой — документы и акты;
//   зелёный — деньги (платежи, касса, зарплата, оплата актов); оранжевый —
//   задачи; небесный — комментарии; серо-стальной — кадры/доступы/настройки;
//   сиреневый — отпуска; серый — нейтральное.
// Поверх области красный тон «delete» перекрывает удаления и негативные исходы
// (удалено / деактивировано / провал входа / дело без договора) — сильный
// сигнал «убрали/сорвалось». Направление денег (приход/расход) отдельно
// подкрашивает саму сумму в тексте (см. journal-row Money).
// Тона — парой «подложка *-bg + тёмный текст *-fg / *-text» (DESIGN.md §3, AA).
// ============================================================================

export type ActionTone =
  | 'case'
  | 'client'
  | 'document'
  | 'money'
  | 'task'
  | 'comment'
  | 'admin'
  | 'absence'
  | 'delete'
  | 'neutral';

export const TONE_CLASS: Record<ActionTone, string> = {
  case: 'bg-primary-subtle text-primary-pressed',
  client: 'bg-stage-consultation-bg text-stage-consultation-fg',
  document: 'bg-cat-document-bg text-cat-document-fg',
  money: 'bg-success-bg text-success-text',
  task: 'bg-warning-bg text-warning-text',
  comment: 'bg-info-bg text-info-text',
  admin: 'bg-stage-new-bg text-stage-new-fg',
  absence: 'bg-absence-bg text-absence',
  delete: 'bg-error-bg text-error-text',
  neutral: 'bg-surface-sunken text-text-muted',
};

export type ActionVisual = { icon: LucideIcon; tone: ActionTone };

const VISUALS: Record<string, ActionVisual> = {
  // Дела и этапы — синий
  case_created: { icon: Briefcase, tone: 'case' },
  case_updated: { icon: Briefcase, tone: 'case' },
  case_deleted: { icon: Briefcase, tone: 'delete' },
  case_lost: { icon: CircleOff, tone: 'delete' },
  case_archived: { icon: Archive, tone: 'case' },
  case_restored: { icon: ArchiveRestore, tone: 'case' },
  stage_corrected: { icon: ArrowLeftRight, tone: 'case' },

  // Клиенты — фиолетовый
  client_created: { icon: UserPlus, tone: 'client' },
  client_updated: { icon: Users, tone: 'client' },
  client_deleted: { icon: Users, tone: 'delete' },

  // Документы — голубой (cyan)
  document_uploaded: { icon: FileUp, tone: 'document' },
  document_deleted: { icon: FileX, tone: 'delete' },
  document_downloaded: { icon: FileDown, tone: 'document' },

  // Деньги — зелёный (платежи и график)
  payment_created: { icon: Banknote, tone: 'money' },
  payment_updated: { icon: Banknote, tone: 'money' },
  payment_deleted: { icon: Banknote, tone: 'delete' },
  payment_plan_updated: { icon: CalendarClock, tone: 'money' },

  // Задачи — оранжевый
  task_created: { icon: ListChecks, tone: 'task' },
  task_updated: { icon: ListChecks, tone: 'task' },
  task_toggled: { icon: BadgeCheck, tone: 'task' },
  task_deleted: { icon: ListChecks, tone: 'delete' },

  // Акты — голубой как документы (бумага); оплата акта — зелёная (деньги)
  act_created: { icon: FileSpreadsheet, tone: 'document' },
  act_paid: { icon: BadgeCheck, tone: 'money' },
  act_deleted: { icon: FileSpreadsheet, tone: 'delete' },
  act_completion_changed: { icon: FileSpreadsheet, tone: 'document' },

  // Зарплата — зелёный (деньги); сумму выплаты подкрашивает journal-row отдельно
  payroll_paid: { icon: Coins, tone: 'money' },
  payroll_reverted: { icon: Undo2, tone: 'money' },
  payroll_payout: { icon: Coins, tone: 'money' },
  payroll_bonus: { icon: Gift, tone: 'money' },
  payroll_tx_deleted: { icon: Coins, tone: 'delete' },
  payroll_rates_changed: { icon: Percent, tone: 'money' },
  user_salary_changed: { icon: Coins, tone: 'money' },

  // Комментарии — небесный (info)
  comment_added: { icon: MessageSquarePlus, tone: 'comment' },
  comment_edited: { icon: MessageSquare, tone: 'comment' },
  comment_deleted: { icon: MessageSquare, tone: 'delete' },

  // Сотрудники и доступы — серо-стальной (admin)
  user_created: { icon: UserPlus, tone: 'admin' },
  user_role_changed: { icon: UserCog, tone: 'admin' },
  user_deactivated: { icon: UserX, tone: 'delete' },
  user_reactivated: { icon: UserCheck, tone: 'admin' },
  user_permissions_changed: { icon: ShieldCheck, tone: 'admin' },
  user_department_changed: { icon: Building2, tone: 'admin' },
  user_password_reset: { icon: KeyRound, tone: 'admin' },
  user_password_changed: { icon: KeyRound, tone: 'admin' },
  user_email_changed: { icon: AtSign, tone: 'admin' },
  user_invited: { icon: Mail, tone: 'admin' },
  user_deleted: { icon: UserX, tone: 'delete' },

  // Подразделения — серо-стальной
  department_created: { icon: Building2, tone: 'admin' },
  department_renamed: { icon: Building2, tone: 'admin' },
  department_activated: { icon: Building2, tone: 'admin' },
  department_deactivated: { icon: Building2, tone: 'admin' },

  // Входы в систему — серо-стальной; неудачная попытка — красная
  user_login: { icon: LogIn, tone: 'admin' },
  user_login_failed: { icon: ShieldAlert, tone: 'delete' },

  // Отпуска — сиреневый
  absence_created: { icon: Palmtree, tone: 'absence' },
  absence_deleted: { icon: Palmtree, tone: 'delete' },

  // Касса — зелёный (деньги)
  cash_account_created: { icon: Wallet, tone: 'money' },
  cash_account_updated: { icon: Wallet, tone: 'money' },
  cash_entry_created: { icon: Wallet, tone: 'money' },
  cash_entry_updated: { icon: Wallet, tone: 'money' },
  cash_entry_deleted: { icon: Wallet, tone: 'delete' },

  // Реквизиты компании — серо-стальной (настройки)
  org_requisites_updated: { icon: Landmark, tone: 'admin' },

  // Справочник типов дел — серо-стальной (настройки)
  case_type_created: { icon: Tags, tone: 'admin' },
  case_type_renamed: { icon: Tags, tone: 'admin' },
  case_type_activated: { icon: Tags, tone: 'admin' },
  case_type_deactivated: { icon: Tags, tone: 'admin' },
};

const FALLBACK: ActionVisual = { icon: Pencil, tone: 'neutral' };

export function actionVisual(action: string): ActionVisual {
  return VISUALS[action] ?? FALLBACK;
}
