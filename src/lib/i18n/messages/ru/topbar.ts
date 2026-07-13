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
  requisites: 'Реквизиты',
  titleSettings: 'Настройки',
  titleProfile: 'Профиль',
  titleHelp: 'Справка',
  titleFallback: 'ЮрКейс',

  searchButton: 'Поиск по делам, клиентам…',
  searchAria: 'Поиск по делам, клиентам',
  newCase: 'Новое дело',
  notificationsAria: 'Задачи',
  notificationsAriaCount: 'Задачи: {count} открытых',
  // Честный колокольчик (v3 Сессия 6): aria-label/title с разбивкой.
  notificationsDue: 'Просрочено: {overdue}, сегодня: {today}',
};

export type TopbarMessages = typeof topbar;
