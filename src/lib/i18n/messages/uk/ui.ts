import type { UiMessages } from '../ru/ui';

// Загальні UI-примітиви (таблиці, сортування тощо).
export const ui: UiMessages = {
  sort: {
    label: 'Сортувати за: {column}, {state}',
    ascending: 'за зростанням',
    descending: 'за спаданням',
    none: 'без сортування',
  },

  // Гарячі клавіші (v3 Сесія 11): шпаргалка «?» + блок у /help.
  hotkeys: {
    title: 'Гарячі клавіші',
    searchAction: 'Пошук і команди',
    newCaseAction: 'Нова справа',
    newTaskAction: 'Нове завдання',
    helpAction: 'Ця шпаргалка',
    closeAction: 'Закрити вікно або меню',
    hint: 'Працюють на будь-якому екрані, коли фокус не в полі вводу.',
  },
};
