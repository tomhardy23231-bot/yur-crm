// Подписи доменных перечислений (роли, этапы, типы и т.д.). Заменяют *_LABEL
// карты из lib/types/db.ts. Ключи строго совпадают со значениями enum в коде/БД.

export const enums = {
  role: {
    owner: 'Владелец',
    admin: 'Администратор',
    office_manager: 'Офис-менеджер',
    lawyer: 'Юрист',
    expert: 'Эксперт',
  },

  // Короткая форма для бейджей таблицы прав на хабе настроек.
  roleShort: {
    owner: 'Владелец',
    admin: 'Админ',
    office_manager: 'Офис-менеджер',
    lawyer: 'Юрист',
    expert: 'Эксперт',
  },

  caseStage: {
    new_request: 'Новое обращение',
    consultation: 'Консультация',
    in_progress: 'В работе',
    awaiting_decision: 'Ожидание решения',
    closed: 'Завершено',
  },

  caseType: {
    civil: 'Гражданское',
    criminal: 'Уголовное',
    corporate: 'Корпоративное',
    administrative: 'Административное',
    family: 'Семейное',
    labor: 'Трудовое',
    other: 'Другое',
  },

  caseCategory: {
    document: 'Документ',
    claim: 'Иск',
    representation: 'Представительство',
  },

  casePriority: {
    normal: 'Обычный',
    urgent: 'Срочный',
  },

  billingType: {
    prepaid: 'Предоплата',
    installments: 'График расчётов',
    fixed: 'Фиксированная',
    success_fee: 'Гонорар успеха',
  },

  clientKind: {
    individual: 'Физлицо',
    company: 'Компания',
    entrepreneur: 'ФОП',
  },

  clientSource: {
    website: 'Сайт',
    referral: 'Рекомендация',
    advertising: 'Реклама',
    repeat: 'Повторное обращение',
    other: 'Другое',
  },

  taskKind: {
    task: 'Задача',
    hearing: 'Заседание',
    deadline: 'Дедлайн',
  },

  taskStatus: {
    open: 'Открыта',
    done: 'Завершена',
  },

  docType: {
    contract: 'Договор',
    claim: 'Претензия',
    power_of_attorney: 'Доверенность',
    correspondence: 'Переписка',
    act: 'Акт приёма-передачи',
    other: 'Прочее',
  },

  ledgerStatus: {
    accrued: 'К выплате',
    paid: 'Выплачено',
  },

  accrualMode: {
    on_completion: 'При завершении дела',
    per_payment: 'По мере оплат',
  },

  payrollTxKind: {
    payout: 'Выплата',
    bonus: 'Премия',
  },

  roleInCase: {
    lawyer: 'Юрист',
    expert: 'Эксперт',
  },

  // Персональные права (per-user capability overrides) — экран настроек.
  capabilityLabel: {
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
  },

  capabilityHint: {
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
  },
};

export type EnumsMessages = typeof enums;
