// Верхний бар: заголовок по маршруту, поиск, справка, уведомления, пользователь.

export const topbar = {
  // Заголовки экранов (titleForPath).
  titleDashboard: 'Дашборд',
  titleCasesBoard: 'Доска дел',
  titleCaseNew: 'Новое дело',
  titleCaseEdit: 'Редактирование дела',
  titleCaseCard: 'Карточка дела',
  titleCases: 'Дела',
  titleClientNew: 'Новый клиент',
  titleClientEdit: 'Редактирование клиента',
  titleClientCard: 'Карточка клиента',
  titleClients: 'Клиенты',
  titleTasks: 'Задачи',
  titleCalendar: 'Календарь',
  titlePayroll: 'Финансы и ЗП',
  cash: 'Касса',
  titleRates: 'Ставки зарплаты',
  titleUsers: 'Пользователи',
  departments: 'Подразделения',
  caseTypes: 'Типы дел',
  requisites: 'Реквизиты',
  titleSettings: 'Настройки',
  titleProfile: 'Профиль',
  titleHelp: 'Справка',
  titleFallback: 'ЮрКейс',

  searchButton: 'Поиск по делам, клиентам…',
  searchAria: 'Поиск по делам, клиентам',
  newCase: 'Новое дело',
  notificationsAria: 'Уведомления',
  notificationsAriaCount: 'Задачи: {count} открытых',
  // Честный колокольчик (v3 Сессия 6): aria-label/title с разбивкой.
  notificationsDue: 'Просрочено: {overdue}, сегодня: {today}',

  // Попап уведомлений (2026-07-19): окно под колокольчиком вместо перехода.
  notifTitle: 'Уведомления',
  notifAllTasks: 'Все задачи',
  notifEmpty: 'Новых уведомлений нет',
  notifOverdue: 'Просроченные задачи',
  notifToday: 'На сегодня',
  notifPayments: 'Просроченные платежи',
  notifPaymentLine: 'недоплата {amount} ₴ · с {date}',
  notifNoCase: 'без дела',
};

export type TopbarMessages = typeof topbar;
