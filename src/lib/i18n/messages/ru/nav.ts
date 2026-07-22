// Навигация: боковой рейл (полное название + микро-подпись) и пункт «Справка».

export const nav = {
  home: 'Главная',
  homeShort: 'Главная',
  clients: 'Клиенты',
  clientsShort: 'Клиенты',
  cases: 'Дела',
  casesShort: 'Дела',
  tasks: 'Задачи',
  tasksShort: 'Задачи',
  calendar: 'Календарь',
  calendarShort: 'Календарь',
  payroll: 'Финансы и ЗП',
  payrollShort: 'Финансы',
  documents: 'Документы',
  documentsShort: 'Документы',
  finance: 'Касса',
  financeShort: 'Касса',
  journal: 'Журнал',
  journalShort: 'Журнал',
  settings: 'Настройки',
  settingsShort: 'Настройки',
  help: 'Справка',
  helpShort: 'Справка',

  // Мобильная нижняя навигация: вкладка «Ещё» открывает шторку со всем остальным.
  more: 'Ещё',
  moreShort: 'Ещё',
  profile: 'Профиль',
  menuAria: 'Открыть меню',
  moreSheetTitle: 'Меню',

  // Тултип у пунктов-«заглушек»: «{label} — скоро».
  comingSoonTooltip: '{label} — скоро',

  // Бренд-марка и низ сайдбара
  brandHomeAria: 'ЮрКейс — на главную',
  brandTitle: 'ЮрКейс — Legal CRM',
  profileAria: 'Профиль и безопасность',
};

export type NavMessages = typeof nav;
