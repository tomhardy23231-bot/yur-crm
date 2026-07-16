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

  // Тип отсутствия сотрудника (v2 Этап 6).
  absenceKind: {
    vacation: 'Отпуск',
    sick: 'Больничный',
    other: 'Отсутствие',
  },

  // Вид счёта кассы (v2 Этап 7).
  cashAccountKind: {
    card: 'Карта',
    bank: 'Расчётный счёт',
    cash: 'Наличные',
  },
  // Направление операции кассы.
  cashDirection: {
    in: 'Приход',
    out: 'Расход',
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

  payrollTxKind: {
    payout: 'Выплата',
    bonus: 'Премия',
  },

  roleInCase: {
    lawyer: 'Юрист',
    expert: 'Эксперт',
  },

  // Скоуп видимости для admin/office_manager (v2). Выставляет только владелец.
  visibilityScope: {
    department: 'Своё подразделение',
    all: 'Вся компания',
  },
  visibilityScopeHint: {
    department: 'Видит дела и финансы только своего подразделения.',
    all: 'Видит дела и финансы всей компании.',
  },

  // Режим зарплаты сотрудника (v2 Этап 4).
  salaryMode: {
    percent: 'Процент от оплат',
    fixed: 'Фиксированный оклад',
    fixed_percent: 'Оклад + процент',
  },
  salaryModeHint: {
    percent: 'Только % от оплат по делам — текущая модель.',
    fixed: 'Фиксированный оклад в месяц; процент по делам не начисляется.',
    fixed_percent: 'Оклад в месяц плюс процент от оплат по делам.',
  },

  // Статус акта (v2 Этап 5).
  actStatus: {
    issued: 'Выставлен',
    paid: 'Оплачен',
  },
  // Отметка выполнения по акту.
  actCompletion: {
    full: 'Выполнено полностью',
    partial: 'Частично',
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
    can_manage_cash: 'Управление кассой',
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
    can_manage_cash: 'Доступ к кассе: счета, операции (приход/расход) и сальдо-отчёт.',
  },
};

export type EnumsMessages = typeof enums;
