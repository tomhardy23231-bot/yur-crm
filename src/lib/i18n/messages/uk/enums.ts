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

  accrualMode: {
    on_completion: 'При завершенні справи',
    per_payment: 'У міру оплат',
  },

  payrollTxKind: {
    payout: 'Виплата',
    bonus: 'Премія',
  },

  roleInCase: {
    lawyer: 'Юрист',
    expert: 'Експерт',
  },

  capabilityLabel: {
    view_all_cases: 'Бачити всі справи',
    create_cases: 'Створювати справи',
    delete_cases: 'Видаляти справи',
    create_clients: 'Створювати клієнтів',
    delete_clients: 'Видаляти клієнтів',
    delete_documents: 'Видаляти документи',
    edit_payments: 'Змінювати та видаляти платежі',
    view_all_payroll: 'Бачити зарплату всіх',
    edit_rate_overrides: 'Змінювати % зарплати у справі',
    manage_users: 'Керування користувачами',
    edit_payroll_rates: 'Системні налаштування (ставки)',
  },

  capabilityHint: {
    view_all_cases:
      'Доступ до всіх справ (і їхніх клієнтів, документів, завдань, платежів), а не лише до своїх.',
    create_cases: 'Заводити нові справи.',
    delete_cases: 'Видаляти справи.',
    create_clients: 'Заводити нових клієнтів.',
    delete_clients: 'Видаляти клієнтів.',
    delete_documents: 'Видаляти документи у справах.',
    edit_payments: 'Змінювати та видаляти платежі клієнтів.',
    view_all_payroll: 'Бачити нарахування та виплати зарплати всіх співробітників.',
    edit_rate_overrides: 'Задавати індивідуальний % зарплати в конкретній справі.',
    manage_users: 'Створювати співробітників і змінювати їхні ролі та права.',
    edit_payroll_rates: 'Змінювати базові ставки зарплати за категоріями справ.',
  },
};
