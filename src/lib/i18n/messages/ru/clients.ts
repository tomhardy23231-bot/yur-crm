// Клиенты (доверители): список, карточка, форма создания/редактирования,
// удаление, server actions. ru — эталон (текущий UI).

export const clients = {
  // Список клиентов (/clients)
  list: {
    deletedNotice: 'Клиент удалён.',
    // Доступное имя региона списка клиентов (role=table) для скринридеров.
    tableAria: 'Список клиентов',
    kindFilterLabel: 'Тип клиента',
    addClient: 'Добавить клиента',
    // Колонки таблицы
    colClient: 'Клиент',
    colKind: 'Тип',
    colPhone: 'Телефон',
    colEmail: 'E-mail',
    colCases: 'Дел',
    colCreated: 'Создан',
    colActions: 'Действия',
    // Иконки-действия в строке (открыть · редактировать)
    actionOpen: 'Открыть в новой вкладке',
    actionEdit: 'Редактировать',
    // Пагинация
    paginationLabel: 'Пагинация',
    pageInfo: 'Страница {page} из {pageCount} · по {pageSize} на странице',
    prev: '← Назад',
    next: 'Вперёд →',
    // Пустые состояния
    emptyFilteredTitle: 'Ничего не нашли',
    emptyTitle: 'Здесь будут ваши клиенты',
    emptyFilteredHint:
      'Попробуйте изменить поиск или фильтры. Если клиент должен быть видим — проверьте, что у вас есть связанное с ним дело.',
    emptyHint:
      'Заведите первого клиента — затем добавите ему дело, документы и финансы.',
  },

  // Поиск (clients-search.tsx)
  search: {
    placeholder: 'Поиск по имени, телефону, e-mail…',
    ariaLabel: 'Поиск клиентов',
  },

  // Создание клиента (/clients/new)
  new: {
    backToList: 'К списку',
    submit: 'Создать клиента',
  },

  // Карточка клиента (/clients/[id])
  detail: {
    backToList: 'К списку клиентов',
    // Ошибки удаления (через ?error=…)
    errorHasCases:
      'Нельзя удалить клиента: у него есть дела. Сначала закройте или перенесите дела.',
    errorDeleteFailed: 'Не удалось удалить клиента. Попробуйте позже.',
    errorMissingId: 'Не передан идентификатор клиента.',
    // Шапка
    clientSince: 'клиент с',
    edit: 'Редактировать',
    // Секции
    sectionKind: 'Тип клиента',
    sectionBirthDate: 'Дата рождения',
    sectionInn: 'ИНН',
    sectionInnEdrpou: 'ИНН / ЕДРПОУ',
    sectionContractNumber: 'Номер договора',
    sectionPhone: 'Телефон',
    sectionEmail: 'E-mail',
    sectionAddress: 'Адрес',
    sectionSource: 'Источник',
    sectionNotes: 'Заметки',
    // Блок «Дела клиента»
    casesTitle: 'Дела клиента',
    casesNone: 'У клиента пока нет дел',
    casesTotal: 'Всего: {count}',
    newCase: 'Новое дело',
    casesEmptyCanCreate:
      'Заведите первое дело — оно соберёт документы, задачи и финансы.',
    casesEmpty: 'Пока нет дел.',
    // Колонки таблицы дел
    colNumberTitle: 'Номер / название',
    colStage: 'Этап',
    colResponsible: 'Ответственный',
    colOpened: 'Открыто',
    colSum: 'Сумма',
    colDebt: 'Долг',
  },

  // Редактирование клиента (/clients/[id]/edit)
  edit: {
    backToCard: 'К карточке клиента',
    submit: 'Сохранить изменения',
  },

  // Форма клиента (client-form.tsx)
  form: {
    kindLabel: 'Тип клиента',
    lastName: 'Фамилия',
    lastNamePlaceholder: 'Иванов',
    firstName: 'Имя',
    firstNamePlaceholder: 'Иван',
    middleName: 'Отчество',
    middleNamePlaceholder: 'Иванович',
    birthDate: 'Дата рождения',
    companyName: 'Наименование',
    companyNamePlaceholder: 'ООО «Ромашка»',
    inn: 'ИНН',
    innEdrpou: 'ИНН / ЕДРПОУ',
    innPlaceholder: '1234567890',
    contractNumber: 'Номер договора',
    contractNumberPlaceholder: '№ 2026/001',
    phone: 'Телефон',
    phonePlaceholder: '+38 067 000 00 00',
    email: 'E-mail',
    emailPlaceholder: 'client@example.com',
    address: 'Адрес',
    addressPlaceholder: 'г. Киев, ул. Крещатик, 1',
    source: 'Источник',
    sourceNone: '— не указан —',
    notes: 'Заметки',
    notesPlaceholder: 'Любая внутренняя информация о клиенте',
  },

  // Удаление клиента (delete-client-form.tsx)
  delete: {
    confirm:
      'Удалить клиента «{name}»? Операция необратима. Если у клиента есть дела — удаление будет заблокировано.',
  },

  // Server actions (actions.ts) — ошибки валидации и БД
  actions: {
    selectKind: 'Выберите тип',
    invalidKind: 'Недопустимый тип',
    enterLastName: 'Укажите фамилию',
    enterFirstName: 'Укажите имя',
    tooLong100: 'Слишком длинно (макс 100)',
    enterName: 'Укажите наименование',
    nameTooLong: 'Слишком длинное (макс 200)',
    invalidDate: 'Неверная дата',
    futureDate: 'Дата в будущем',
    invalidInn: 'ИНН — только цифры (8–12)',
    invalidEmail: 'Похоже на ошибку в e-mail',
    invalidSource: 'Недопустимый источник',
    noCreatePermission: 'Недостаточно прав для создания клиента.',
    createFailed: 'Не удалось создать клиента.',
    noEditPermission:
      'Недостаточно прав: клиента может изменить автор записи или сотрудник с доступом ко всем делам.',
    updateFailed: 'Не удалось сохранить изменения клиента.',
  },
};

export type ClientsMessages = typeof clients;
