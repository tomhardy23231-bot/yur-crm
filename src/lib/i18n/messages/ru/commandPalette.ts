// Командная палитра (Cmd/Ctrl-K): поиск + быстрые действия.

export const commandPalette = {
  dialogLabel: 'Поиск и команды',
  inputPlaceholder: 'Поиск дел, клиентов, задач, документов или команда…',
  empty: 'Ничего не найдено.',
  searching: 'Ищу…',

  groupActions: 'Действия',
  groupCases: 'Дела',
  groupClients: 'Клиенты',
  groupTasks: 'Задачи',
  groupDocuments: 'Документы',

  createCase: 'Создать дело',
  createCaseHint: 'Новое дело и клиент',
  createClient: 'Создать клиента',
  createClientHint: 'Физлицо или компания',

  navHome: 'Главная',
  navCases: 'Дела',
  navClients: 'Клиенты',
  navTasks: 'Задачи',
  navCalendar: 'Календарь',

  footerSelect: 'выбрать',
  footerNavigate: 'навигация',
  footerToggle: 'открыть/закрыть',

  triggerLabel: 'Поиск',
  triggerAria: 'Открыть глобальный поиск',
};

export type CommandPaletteMessages = typeof commandPalette;
