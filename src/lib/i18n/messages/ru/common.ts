// Общие строки, переиспользуемые по всему интерфейсу (кнопки, статусы, слова).
// ru — эталон формы; uk/common.ts обязан повторять эти ключи (типизирован).

export const common = {
  // Кнопки и действия
  save: 'Сохранить',
  saving: 'Сохранение…',
  cancel: 'Отмена',
  delete: 'Удалить',
  deleting: 'Удаление…',
  edit: 'Редактировать',
  create: 'Создать',
  add: 'Добавить',
  remove: 'Убрать',
  back: 'Назад',
  close: 'Закрыть',
  confirm: 'Подтвердить',
  apply: 'Применить',
  reset: 'Сбросить',
  retry: 'Повторить',
  open: 'Открыть',
  copy: 'Копировать',
  copied: 'Скопировано',
  download: 'Скачать',
  upload: 'Загрузить',
  print: 'Печать',
  search: 'Поиск',
  filter: 'Фильтр',
  clear: 'Очистить',
  loading: 'Загрузка…',

  // Подтверждения и ответы
  yes: 'Да',
  no: 'Нет',

  // Значения и заглушки
  none: 'Нет',
  all: 'Все',
  notSpecified: 'Не указано',
  dash: '—',
  select: 'Выберите…',
  optional: 'необязательно',
  required: 'обязательно',
  comingSoon: 'скоро',

  // Время
  today: 'Сегодня',
  yesterday: 'Вчера',
  tomorrow: 'Завтра',

  // Состояния списков
  emptyTitle: 'Пусто',
  nothingFound: 'Ничего не найдено',
  total: 'Итого',

  // Соединители (использовать через fmt)
  ofRange: '{from} из {to}',
};

export type CommonMessages = typeof common;
