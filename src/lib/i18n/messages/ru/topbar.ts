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
  titleRates: 'Ставки зарплаты',
  titleUsers: 'Пользователи',
  titleSettings: 'Настройки',
  titleProfile: 'Профиль',
  titleHelp: 'Справка',
  titleFallback: 'ЮрКейс',

  searchButton: 'Поиск по делам, клиентам…',
  searchAria: 'Поиск по делам, клиентам',
  helpAria: 'Справка и обучающий тур',
  notificationsAria: 'Задачи',
  notificationsAriaCount: 'Задачи: {count} открытых',
};

export type TopbarMessages = typeof topbar;
