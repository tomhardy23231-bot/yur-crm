// Общие UI-примитивы (таблицы, сортировка и т.п.).

export const ui = {
  // Сортируемый заголовок таблицы — доступная подпись для скринридеров.
  sort: {
    label: 'Сортировать по: {column}, {state}',
    ascending: 'по возрастанию',
    descending: 'по убыванию',
    none: 'нет сортировки',
  },
};

export type UiMessages = typeof ui;
