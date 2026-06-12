// Карточка дела: просмотр, форма (создание/редактирование), степпер этапов,
// панель действий, удаление, inline-создание клиента, server actions дел.

export const caseCard = {
  // ── Быстрые действия в шапке карточки (v3 Сессия 11) ───────────────
  quickActions: {
    payment: 'Платёж',
    task: 'Задача',
    act: 'Акт',
  },

  // ── Блок «Что дальше» — приоритетные действия по делу (редизайн Волна 1) ──
  whatsNext: {
    heading: 'Что дальше',
    allClear: 'Под контролем — срочных действий нет',
    overdueTasks: {
      one: 'Просрочена {n} задача',
      few: 'Просрочено {n} задачи',
      many: 'Просрочено {n} задач',
    },
    nextLabel: 'Ближайшее',
    dueToday: 'сегодня',
    planOverdue: 'Просрочена доплата {amount} ₴ от {date}',
    planNext: 'Ожидается доплата {amount} ₴ до {date}',
    debtNoPlan: 'Долг {amount} ₴ — график платежей не задан',
    addPlan: 'Добавить график',
    missingAct: 'Нет подписанного акта приёма-передачи',
  },

  // ── Экран просмотра карточки дела (cases/[id]/page.tsx) ──────────────
  detail: {
    // Ошибки удаления/перехода (?error=… в адресе)
    errorHasLinks:
      'Нельзя удалить дело: к нему привязаны документы или платежи. Сначала переместите/удалите связанные записи.',
    errorDeleteFailed: 'Не удалось удалить дело. Попробуйте позже.',
    errorMissingId: 'Не передан идентификатор дела.',
    errorActDeleteFailed: 'Не удалось удалить акт. Попробуйте позже.',
    errorActUpdateFailed: 'Не удалось изменить отметку акта. Попробуйте позже.',
    errorArchiveFailed: 'Не удалось изменить статус архива. Попробуйте позже.',

    // Бренд-плашка и бейджи в шапке
    brandBadge: 'Дело',
    withoutActBadge: 'без акта',
    withoutActBadgeTitle: 'Дело завершено без акта приёма-передачи',
    missingActWarning:
      'Дело завершено, но акт приёма-передачи выполненных работ не загружен.',

    // Мета-строка (тип · дата открытия/закрытия)
    openedAt: 'открыто',
    closedAt: 'завершено',

    // Подписи к реквизитам в шапке
    paymentLabel: 'Оплата:',
    opponentLabel: 'Оппонент:',
    courtLabel: 'Суд:',
    caseNumberLabel: '№ дела:',

    // «N дней на текущем этапе» (U6)
    stageDays: {
      one: 'На текущем этапе {n} день',
      few: 'На текущем этапе {n} дня',
      many: 'На текущем этапе {n} дней',
    },

    // ── Блок «Вознаграждение команды» ──────────────────────────────────
    rewardTitle: 'Вознаграждение команды',
    rewardSum: 'Сумма',
    rewardPaid: 'Оплачено',
    rewardOverpaid: 'Переплата',
    rewardDebt: 'Долг',
    rateOverridden: 'Ставка переопределена вручную',

    // Роли участников вознаграждения
    roleLawyerManager: 'Юрист-менеджер',
    roleExpert: 'Эксперт',

    // Состояния выплаты участнику
    fullyPaid: 'выплачено',
    notPaid: 'не выплачено',
    partiallyPaid: 'выплачено {paid} · осталось {outstanding} ₴',

    // Итог по делу
    caseFund: 'Фонд по делу',
    myAccrual: 'Моё начисление',
    paidLabel: 'Выплачено',
    outstandingLabel: 'Осталось',
    payoutHint:
      'Выплаты отмечаются в разделе «Финансы и ЗП» → карточка сотрудника.',
  },

  // ── Сетка «поле: значение» в шапке (case-info-grid.tsx) ──────────────
  overview: {
    // Заголовки трёх колонок
    colCase: 'Дело',
    colClient: 'Клиент',
    colFinance: 'Оплата и суд',

    // Колонка «Дело»
    number: '№ / название',
    caseType: 'Тип дела',
    category: 'Категория',
    priority: 'Приоритет',
    opened: 'Открыто',
    closed: 'Завершено',
    lawyer: 'Юрист (договор)',
    expert: 'Эксперт (исполнитель)',

    // Колонка «Клиент»
    clientName: 'Клиент',
    clientKind: 'Тип',
    phone: 'Телефон',
    email: 'E-mail',
    source: 'Источник',

    // Колонка «Оплата и суд» (деньги — в шапке и «Вознаграждении команды»)
    billing: 'Тип оплаты',
    court: 'Суд',
    opponent: 'Оппонент',
    courtCaseNumber: '№ судебного дела',

    // Общее
    notSet: 'не указан',
    dash: '—',
  },

  // ── Панель действий карточки (case-action-bar.tsx) ───────────────────
  actionBar: {
    backToList: 'К списку дел',
    edit: 'Редактировать',
    sectionOverview: 'Обзор',
    sectionDocuments: 'Документы',
    sectionTasks: 'Задачи',
    sectionComments: 'Комментарии',
    sectionFinance: 'Финансы',
    sectionHistory: 'История',
    tabsAria: 'Разделы дела',
  },

  // ── Удаление дела (delete-case-form.tsx) ─────────────────────────────
  delete: {
    button: 'Удалить',
    confirm:
      'Удалить дело «{title}»? Операция необратима. Если у дела есть документы или платежи — удаление будет заблокировано.',
  },

  // ── Этап дела: дропдаун (case-stage-dropdown.tsx) ────────────────────
  stepper: {
    confirmCloseWithoutAct:
      'По делу не загружен акт приёма-передачи выполненных работ. Завершить дело всё равно?',
    moveTo: 'Перевести на этап «{stage}»',
    changeStage: 'Сменить этап',
    menuLabel: 'Выбор этапа',
    youAreHere: 'текущий',
  },

  // ── Прогресс оплаты (payment-progress.tsx) ───────────────────────────
  progress: {
    ariaLabel: 'Оплачено по делу',
  },

  // ── Страница редактирования (cases/[id]/edit/page.tsx) ───────────────
  edit: {
    backToCase: 'К карточке дела',
  },

  // ── Страница создания (cases/new/page.tsx) ───────────────────────────
  create: {
    backToClient: 'К клиенту «{name}»',
    backToList: 'К списку',
    submit: 'Создать дело',
  },

  // ── Экран «дело недоступно» (cases/[id]/not-found.tsx) ───────────────
  notFound: {
    backToList: 'К списку дел',
    title: 'Дело недоступно',
    description:
      'Дело не найдено или у вас нет к нему доступа. Возможно, его ведёт другой сотрудник. Если считаете, что это ошибка — обратитесь к администратору.',
    goToMyCases: 'Перейти к моим делам',
  },

  // ── Форма дела (case-form.tsx) ───────────────────────────────────────
  form: {
    // Секции
    sectionBasic: 'Основное',
    sectionFinance: 'Финансы',
    sectionCourt: 'Судебное (если применимо)',
    sectionExtra: 'Дополнительно',

    // Поля
    numberTitle: 'Номер / название',
    numberTitlePlaceholder: 'CRM-2026-003 / Иск ООО «Ромашка»',
    client: 'Клиент',
    clientSelectPlaceholder: '— выберите клиента —',
    newClient: 'Новый',
    lawyer: 'Юрист (договор)',
    expert: 'Эксперт (исполнитель)',
    selectPlaceholder: '— выберите —',
    openedAt: 'Открыто',
    caseType: 'Тип дела',
    category: 'Категория (для расчёта зарплаты)',
    subject: 'Предмет договора',
    subjectPlaceholder: 'кратко: взыскание задолженности, регистрация ООО…',
    stage: 'Этап',
    priority: 'Приоритет',

    contractSum: 'Сумма договора',
    rateOverrideTitle: 'Индивидуальный % зарплаты по этому делу',
    rateOverrideHint:
      'Необязательно. Пусто → берётся ставка категории. Меняет только владелец/администратор.',
    lawyerRate: '% юриста',
    expertRate: '% эксперта',
    rateByCategoryPlaceholder: 'по категории',
    accrualMode: 'Начисление зарплаты',
    billingTypes: 'Тип оплаты',

    opponent: 'Оппонент',
    opponentPlaceholder: 'ФИО / название организации',
    courtCaseNumber: 'Номер судебного дела',
    courtCaseNumberPlaceholder: '755/12345/2026',
    court: 'Суд',
    courtPlaceholder: 'Шевченковский районный суд г. Киева',

    tags: 'Теги',
    tagsPlaceholder: 'через запятую: vip, hot, recurring',

    cancel: 'Отмена',
    saving: 'Сохранение…',
  },

  // ── Inline-создание клиента из формы дела (inline-client-create.tsx) ──
  inlineClient: {
    dialogAria: 'Новый клиент',
    title: 'Новый клиент',
    closeAria: 'Закрыть',

    kind: 'Тип клиента',
    lastName: 'Фамилия',
    lastNamePlaceholder: 'Иванов',
    firstName: 'Имя',
    firstNamePlaceholder: 'Иван',
    middleName: 'Отчество',
    middleNamePlaceholder: 'Иванович',
    birthDate: 'Дата рождения',
    name: 'Наименование',
    namePlaceholder: 'ООО «Ромашка»',
    innIndividual: 'ИНН',
    innCompany: 'ИНН / ЕДРПОУ',
    innPlaceholder: '1234567890',
    contractNumber: 'Номер договора',
    contractNumberPlaceholder: '№ 2026/001',
    phone: 'Телефон',
    phonePlaceholder: '+38 067 000 00 00',
    email: 'E-mail',
    emailPlaceholder: 'client@example.com',
    source: 'Источник',
    sourcePlaceholder: '— не указан —',
    notes: 'Заметки',
    notesPlaceholder: 'Опционально',

    cancel: 'Отмена',
    saving: 'Сохранение…',
    submit: 'Создать и выбрать',
  },

  // ── Server actions (lib/cases/actions.ts) ────────────────────────────
  actions: {
    // Доступ
    noCreatePermission: 'Недостаточно прав для создания дела.',

    // Валидация формы
    checkForm: 'Проверьте поля формы',
    numberRequired: 'Укажите номер/название',
    numberTooLong: 'Слишком длинное (макс 200)',
    clientRequired: 'Выберите клиента',
    clientInvalid: 'Некорректный идентификатор клиента',
    lawyerRequired: 'Выберите юриста (договор)',
    idInvalid: 'Некорректный идентификатор',
    expertRequired: 'Выберите Експерта',
    openedAtRequired: 'Укажите дату открытия',
    dateFormat: 'Дата в формате ГГГГ-ММ-ДД',
    caseTypeRequired: 'Выберите тип дела',
    caseTypeInvalid: 'Недопустимый тип',
    categoryRequired: 'Выберите категорию',
    categoryInvalid: 'Недопустимая категория',
    subjectTooLong: 'Слишком длинное (макс 300)',
    stageRequired: 'Выберите этап',
    stageInvalid: 'Недопустимый этап',
    priorityRequired: 'Выберите приоритет',
    priorityInvalid: 'Недопустимый приоритет',
    contractSumInvalid: 'Сумма — число ≥ 0',
    percentInvalid: 'Процент — число от 0 до 100',

    // Сохранение
    createFailed: 'Не удалось создать дело.',
    updateFailed: 'Не удалось сохранить дело.',

    // Смена этапа
    caseInvalid: 'Некорректное дело',
    caseNotFound: 'Дело не найдено',
    stageChangeFailed: 'Не удалось сменить этап.',
    stageBackwardForbidden:
      'Возврат на предыдущий этап разрешён только администратору.',
    stageSkipForbidden:
      'Этапы переключаются строго по порядку — нельзя перепрыгнуть через этап.',
    stageBackwardFieldError: 'Возврат на предыдущий этап запрещён',
    stageSkipFieldError: 'Только следующий этап по порядку',
  },
};

export type CaseCardMessages = typeof caseCard;
