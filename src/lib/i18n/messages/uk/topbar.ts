import type { TopbarMessages } from '../ru/topbar';

// Верхній бар: заголовки екранів, пошук, довідка, сповіщення.
export const topbar: TopbarMessages = {
  titleDashboard: 'Дашборд',
  titleCasesBoard: 'Дошка справ',
  titleCaseNew: 'Нова справа',
  titleCaseEdit: 'Редагування справи',
  titleCaseCard: 'Картка справи',
  titleCases: 'Справи',
  titleClientNew: 'Новий клієнт',
  titleClientEdit: 'Редагування клієнта',
  titleClientCard: 'Картка клієнта',
  titleClients: 'Клієнти',
  titleTasks: 'Завдання',
  titleCalendar: 'Календар',
  titlePayroll: 'Фінанси та ЗП',
  cash: 'Каса',
  titleRates: 'Ставки зарплати',
  titleUsers: 'Користувачі',
  departments: 'Підрозділи',
  requisites: 'Реквізити',
  titleSettings: 'Налаштування',
  titleProfile: 'Профіль',
  titleHelp: 'Довідка',
  titleFallback: 'ЮрКейс',

  searchButton: 'Пошук за справами, клієнтами…',
  searchAria: 'Пошук за справами, клієнтами',
  helpAria: 'Довідка та навчальний тур',
  notificationsAria: 'Завдання',
  notificationsAriaCount: 'Завдання: {count} відкритих',
  // Чесний дзвіночок (v3 Сесія 6): aria-label/title з розбивкою.
  notificationsDue: 'Прострочено: {overdue}, сьогодні: {today}',
};
