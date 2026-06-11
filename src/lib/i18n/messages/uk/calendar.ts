import type { CalendarMessages } from '../ru/calendar';

// Календар засідань і строків: сітка місяця, навігація, легенда, обраний день.
export const calendar: CalendarMessages = {
  listButton: 'Список',

  weekdays: {
    mon: 'Пн',
    tue: 'Вт',
    wed: 'Ср',
    thu: 'Чт',
    fri: 'Пт',
    sat: 'Сб',
    sun: 'Нд',
  },

  months: {
    january: 'січень',
    february: 'лютий',
    march: 'березень',
    april: 'квітень',
    may: 'травень',
    june: 'червень',
    july: 'липень',
    august: 'серпень',
    september: 'вересень',
    october: 'жовтень',
    november: 'листопад',
    december: 'грудень',
  },

  prevMonth: 'Попередній місяць',
  nextMonth: 'Наступний місяць',

  hide: 'Сховати',
  // Кнопка створення завдання на обраний день (v3 Сесія 6).
  addTask: 'Завдання',
  noTasksDay: 'У цей день немає завдань.',
  noTasksMonth: 'У цьому місяці немає завдань із призначеним строком.',

  taskCount: {
    one: '{n} завдання',
    few: '{n} завдання',
    many: '{n} завдань',
  },
};
