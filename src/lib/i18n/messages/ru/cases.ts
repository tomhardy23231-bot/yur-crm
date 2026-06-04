// Раздел «Дела»: список (таблица), канбан-доска, фильтры, карточки и бейджи.
// ru — эталон формы; uk/cases.ts повторяет эти ключи (типизирован).

export const cases = {
  // Тулбар списка и доски
  toolbar: {
    board: 'Доска',
    list: 'Список',
    newCase: 'Новое дело',
    reset: 'Сбросить',
    searchPlaceholder: 'Поиск: номер, клиент, оппонент, № суддела, тег…',
    searchAria: 'Поиск дел',
  },

  // Метки и плейсхолдеры фильтров (aria-label селекта + пункт «Все …»)
  filters: {
    typeAria: 'Тип дела',
    allTypes: 'Все типы',
    categoryAria: 'Категория',
    allCategories: 'Все категории',
    expertAria: 'Эксперт',
    allExperts: 'Все эксперты',
    lawyerAria: 'Юрист',
    allLawyers: 'Все юристы',
    clientAria: 'Клиент',
    allClients: 'Все клиенты',
  },

  // Чип «Все» в строке статус-фильтров по этапам
  allStages: 'Все',

  // Уведомления и баннеры списка
  deletedNotice: 'Дело удалено.',
  debtNotice: 'Показаны только дела с непогашенным долгом · ',
  debtShowAll: 'показать все',

  // Заголовки таблицы
  columns: {
    numberTitle: 'Номер / название',
    client: 'Клиент',
    stage: 'Этап',
    type: 'Тип',
    category: 'Категория',
    priority: 'Приоритет',
    expert: 'Эксперт',
    openedAt: 'Открыто',
    sum: 'Сумма',
    debt: 'Долг',
  },

  // Ячейки таблицы (бейджи, подсказки)
  row: {
    withoutAct: 'без акта',
    withoutActTitle: 'Дело завершено без акта приёма-передачи',
    overpaid: 'Переплата клиента',
    // Дни на этапе — множественное число (helper plural)
    stageDays: {
      one: '{n} день на этапе',
      few: '{n} дня на этапе',
      many: '{n} дней на этапе',
    },
    stageDaysTitle: {
      one: 'Дело на текущем этапе {n} день',
      few: 'Дело на текущем этапе {n} дня',
      many: 'Дело на текущем этапе {n} дней',
    },
  },

  // Пагинация
  pagination: {
    aria: 'Пагинация',
    // fmt: { page, pageCount, size }
    info: 'Страница {page} из {pageCount} · по {size} на странице',
    prev: '← Назад',
    next: 'Вперёд →',
  },

  // Пустое состояние списка
  empty: {
    notFoundTitle: 'Ничего не нашли',
    title: 'Здесь будут дела',
    notFoundHint: 'Попробуйте изменить фильтры или сбросить их.',
    staffHint:
      'Создайте первое дело — оно соберёт вокруг себя клиента, документы, задачи и финансы.',
    nonStaffHint:
      'У вас пока нет назначенных дел. Они появятся здесь, когда офис заведёт первое.',
  },

  // Канбан-доска
  board: {
    noResponsible: 'Без ответственного',
    debtTitle: 'Долг по делу',
    noDebtTitle: 'Без долга',
    // aria-label кнопки перевода дела на следующий этап. fmt: { number, stage }
    advanceAria: 'Перевести дело {number} на этап «{stage}»',
  },

  // Колонка доски
  column: {
    aria: 'Колонка {stage}', // fmt: { stage }
    countAria: '{count} дел в колонке', // fmt: { count }
    emptyClosed: 'Пока ничего не завершено',
    empty: 'Пока пусто',
    overflow: 'и ещё {n}…', // fmt: { n }
  },
};

export type CasesMessages = typeof cases;
