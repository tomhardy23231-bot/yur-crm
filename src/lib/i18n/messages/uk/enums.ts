import type { EnumsMessages } from '../ru/enums';

// Підписи доменних перелічень українською.
export const enums: EnumsMessages = {
  role: {
    owner: 'Власник',
    admin: 'Адміністратор',
    office_manager: 'Офіс-менеджер',
    lawyer: 'Юрист',
    expert: 'Експерт',
  },

  roleShort: {
    owner: 'Власник',
    admin: 'Адмін',
    office_manager: 'Офіс-менеджер',
    lawyer: 'Юрист',
    expert: 'Експерт',
  },

  caseStage: {
    new_request: 'Нове звернення',
    consultation: 'Консультація',
    in_progress: 'В роботі',
    awaiting_decision: 'Очікування рішення',
    closed: 'Завершено',
  },

  caseType: {
    civil: 'Цивільне',
    criminal: 'Кримінальне',
    corporate: 'Корпоративне',
    administrative: 'Адміністративне',
    family: 'Сімейне',
    labor: 'Трудове',
    other: 'Інше',
  },

  caseCategory: {
    document: 'Документ',
    claim: 'Позов',
    representation: 'Представництво',
  },

  casePriority: {
    normal: 'Звичайний',
    urgent: 'Терміновий',
  },

  billingType: {
    prepaid: 'Передоплата',
    installments: 'Графік розрахунків',
    fixed: 'Фіксована',
    success_fee: 'Гонорар успіху',
  },

  clientKind: {
    individual: 'Фізособа',
    company: 'Компанія',
    entrepreneur: 'ФОП',
  },

  clientSource: {
    website: 'Сайт',
    referral: 'Рекомендація',
    advertising: 'Реклама',
    repeat: 'Повторне звернення',
    other: 'Інше',
  },

  taskKind: {
    task: 'Завдання',
    hearing: 'Засідання',
    deadline: 'Дедлайн',
  },

  // Тип відсутності співробітника (v2 Етап 6).
  absenceKind: {
    vacation: 'Відпустка',
    sick: 'Лікарняний',
    other: 'Відсутність',
  },

  // Вид рахунку каси (v2 Етап 7).
  cashAccountKind: {
    card: 'Картка',
    bank: 'Розрахунковий рахунок',
    cash: 'Готівка',
  },
  // Напрям операції каси.
  cashDirection: {
    in: 'Надходження',
    out: 'Видаток',
  },

  taskStatus: {
    open: 'Відкрита',
    done: 'Завершена',
  },

  docType: {
    contract: 'Договір',
    claim: 'Претензія',
    power_of_attorney: 'Довіреність',
    correspondence: 'Листування',
    act: 'Акт приймання-передачі',
    other: 'Інше',
  },

  ledgerStatus: {
    accrued: 'До виплати',
    paid: 'Виплачено',
  },

  payrollTxKind: {
    payout: 'Виплата',
    bonus: 'Премія',
  },

  roleInCase: {
    lawyer: 'Юрист',
    expert: 'Експерт',
  },

  // Скоуп видимості для admin/office_manager (v2). Виставляє лише власник.
  visibilityScope: {
    department: 'Свій підрозділ',
    all: 'Уся компанія',
  },
  visibilityScopeHint: {
    department: 'Бачить справи та фінанси лише свого підрозділу.',
    all: 'Бачить справи та фінанси всієї компанії.',
  },

  // Режим зарплати співробітника (v2 Етап 4).
  salaryMode: {
    percent: 'Відсоток від оплат',
    fixed: 'Фіксований оклад',
    fixed_percent: 'Оклад + відсоток',
  },
  salaryModeHint: {
    percent: 'Лише % від оплат за справами — поточна модель.',
    fixed: 'Фіксований оклад на місяць; відсоток за справами не нараховується.',
    fixed_percent: 'Оклад на місяць плюс відсоток від оплат за справами.',
  },

  actStatus: {
    issued: 'Виставлено',
    paid: 'Оплачено',
  },
  actCompletion: {
    full: 'Виконано повністю',
    partial: 'Частково',
  },

  // 2026-07-16: складені права розділено — платежі (змінювати/видаляти),
  // користувачі (створювати/ролі та права), каса (бачити/вносити операції).
  capabilityLabel: {
    view_all_cases: 'Бачити всі справи',
    create_cases: 'Створювати справи',
    delete_cases: 'Видаляти справи',
    create_clients: 'Створювати клієнтів',
    delete_clients: 'Видаляти клієнтів',
    delete_documents: 'Видаляти документи',
    edit_payments: 'Змінювати платежі',
    delete_payments: 'Видаляти платежі',
    view_all_payroll: 'Бачити зарплату всіх',
    edit_rate_overrides: 'Змінювати % зарплати у справі',
    create_users: 'Створювати співробітників',
    manage_users: 'Керувати ролями та правами',
    edit_payroll_rates: 'Системні налаштування (ставки)',
    view_cash: 'Бачити касу',
    can_manage_cash: 'Вносити операції каси',
  },

  capabilityHint: {
    view_all_cases:
      'Доступ до всіх справ (і їхніх клієнтів, документів, завдань, платежів), а не лише до своїх.',
    create_cases: 'Заводити нові справи.',
    delete_cases: 'Видаляти справи.',
    create_clients: 'Заводити нових клієнтів.',
    delete_clients: 'Видаляти клієнтів.',
    delete_documents: 'Видаляти документи у справах.',
    edit_payments: 'Змінювати платежі клієнтів.',
    delete_payments: 'Видаляти платежі клієнтів.',
    view_all_payroll: 'Бачити нарахування та виплати зарплати всіх співробітників.',
    edit_rate_overrides: 'Задавати індивідуальний % зарплати в конкретній справі.',
    create_users:
      'Заводити нових співробітників. Власників та адміністраторів створює лише власник.',
    manage_users:
      'Змінювати ролі та персональні права, деактивувати співробітників, призначати підрозділ і посаду.',
    edit_payroll_rates: 'Змінювати базові ставки зарплати за категоріями справ.',
    view_cash: 'Переглядати рахунки, журнал операцій і сальдо-звіт каси.',
    can_manage_cash:
      'Створювати рахунки каси та вносити операції (надходження/видаток); правити й видаляти ручні операції.',
  },
};
