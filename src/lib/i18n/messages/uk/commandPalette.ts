import type { CommandPaletteMessages } from '../ru/commandPalette';

// Командна палітра (Cmd/Ctrl-K): пошук + швидкі дії.
export const commandPalette: CommandPaletteMessages = {
  dialogLabel: 'Пошук і команди',
  inputPlaceholder: 'Пошук справ, клієнтів, завдань, документів або команда…',
  empty: 'Нічого не знайдено.',
  searching: 'Шукаю…',

  groupActions: 'Дії',
  groupCases: 'Справи',
  groupClients: 'Клієнти',
  groupTasks: 'Завдання',
  groupDocuments: 'Документи',

  createCase: 'Створити справу',
  createCaseHint: 'Нова справа і клієнт',
  createClient: 'Створити клієнта',
  createClientHint: 'Фізособа або компанія',
  createTask: 'Створити завдання',
  createTaskHint: 'Завдання, засідання або строк',

  navHome: 'Головна',
  navCases: 'Справи',
  navClients: 'Клієнти',
  navTasks: 'Завдання',
  navCalendar: 'Календар',

  footerSelect: 'вибрати',
  footerNavigate: 'навігація',
  footerToggle: 'відкрити/закрити',
  footerHotkeys: 'гарячі клавіші',

  triggerLabel: 'Пошук',
  triggerAria: 'Відкрити глобальний пошук',
};
