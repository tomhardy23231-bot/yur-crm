import type { CasesMessages } from '../ru/cases';

// Розділ «Справи»: список (таблиця), канбан-дошка, фільтри, картки та бейджі.
export const cases: CasesMessages = {
  toolbar: {
    board: 'Дошка',
    list: 'Список',
    newCase: 'Нова справа',
    reset: 'Скинути',
    searchPlaceholder: 'Пошук: номер, клієнт, опонент, № судової справи, тег…',
    searchAria: 'Пошук справ',
  },

  filters: {
    stageAria: 'Етап',
    allStages: 'Усі етапи',
    typeAria: 'Тип справи',
    allTypes: 'Усі типи',
    categoryAria: 'Категорія',
    allCategories: 'Усі категорії',
    expertAria: 'Експерт',
    allExperts: 'Усі експерти',
    lawyerAria: 'Юрист',
    allLawyers: 'Усі юристи',
    clientAria: 'Клієнт',
    allClients: 'Усі клієнти',
    departmentAria: 'Підрозділ',
    allDepartments: 'Усі підрозділи',
  },

  tableAria: 'Список справ',

  deletedNotice: 'Справу видалено.',
  debtNotice: 'Показано лише справи з непогашеним боргом · ',
  debtShowAll: 'показати всі',

  columns: {
    numberTitle: 'Номер / назва',
    client: 'Клієнт',
    stage: 'Етап',
    type: 'Тип',
    category: 'Категорія',
    priority: 'Пріоритет',
    expert: 'Експерт',
    openedAt: 'Відкрито',
    sum: 'Сума',
    debt: 'Борг',
    actions: 'Дії',
  },

  row: {
    withoutAct: 'без акта',
    withoutActTitle: 'Справу завершено без акта приймання-передачі',
    overpaid: 'Переплата клієнта',
    actionOpen: 'Відкрити в новій вкладці',
    actionHistory: 'Історія змін',
    actionEdit: 'Редагувати',
    stageDays: {
      one: '{n} день на етапі',
      few: '{n} дні на етапі',
      many: '{n} днів на етапі',
    },
    stageDaysTitle: {
      one: 'Справа на поточному етапі {n} день',
      few: 'Справа на поточному етапі {n} дні',
      many: 'Справа на поточному етапі {n} днів',
    },
  },

  pagination: {
    aria: 'Пагінація',
    info: 'Сторінка {page} з {pageCount} · по {size} на сторінці',
    prev: '← Назад',
    next: 'Вперед →',
  },

  empty: {
    notFoundTitle: 'Нічого не знайшли',
    title: 'Тут будуть справи',
    notFoundHint: 'Спробуйте змінити фільтри або скинути їх.',
    staffHint:
      'Створіть першу справу — вона збере навколо себе клієнта, документи, завдання та фінанси.',
    nonStaffHint:
      'У вас поки немає призначених справ. Вони з’являться тут, коли офіс заведе першу.',
  },

  board: {
    noResponsible: 'Без відповідального',
    debtTitle: 'Борг у справі',
    noDebtTitle: 'Без боргу',
    advanceAria: 'Перевести справу {number} на етап «{stage}»',
  },

  column: {
    aria: 'Колонка {stage}',
    countAria: '{count} справ у колонці',
    emptyClosed: 'Поки нічого не завершено',
    empty: 'Поки порожньо',
    overflow: 'і ще {n}…',
  },

  tabs: {
    aria: 'Вкладки списку справ',
    active: 'Активні',
    archive: 'Архів',
  },

  archive: {
    closedAtColumn: 'Закрито',
    closedFromLabel: 'Закрито з',
    closedToLabel: 'по',
    closedFromAria: 'Дата закриття: з',
    closedToAria: 'Дата закриття: по',
    dateFilterReset: 'Скинути дати',
    archiveAction: 'В архів',
    restoreAction: 'Відновити',
    confirmArchive: 'Надіслати справу «{title}» в архів?',
    confirmRestore: 'Повернути справу «{title}» з архіву до активного списку?',
    badge: 'В архіві',
    emptyTitle: 'Архів порожній',
    emptyHint:
      'Завершені справи з’являться тут після того, як ви надішлете їх в архів кнопкою «В архів».',
    emptyFilteredHint:
      'За вибраним періодом закриття нічого не знайшли. Змініть дати або скиньте фільтр.',
    detailBadge: 'Справа в архіві',
    detailHint:
      'Справа в архіві. Щоб змінити етап, спершу відновіть її.',
  },
};
