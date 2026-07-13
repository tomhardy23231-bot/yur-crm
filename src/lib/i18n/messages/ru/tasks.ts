// Задачи: общая страница /tasks, блок задач на карточке дела, форма задачи,
// строка задачи, блок приближающихся сроков. ru — эталон.

export const tasks = {
  // Общая страница /tasks
  page: {
    modeMine: 'Мои',
    modeAll: 'Все',
    statusAria: 'Статус',
    allStatuses: 'Все статусы',
    reset: 'Сбросить',
    calendar: 'Календарь',
    paginationAria: 'Пагинация',
    // {page} из {pageCount} · по {pageSize} на странице
    pageInfo: 'Страница {page} из {pageCount} · по {pageSize} на странице',
    prev: '← Назад',
    next: 'Вперёд →',
    // Группы по дням
    groupOverdue: 'Просрочено',
    groupToday: 'Сегодня',
    groupTomorrow: 'Завтра',
    groupWeek: 'На этой неделе',
    groupLater: 'Позже',
    groupNoDate: 'Без срока',
    // Пустые состояния
    emptyFilteredTitle: 'Ничего не нашли',
    emptyTitle: 'Здесь будут задачи',
    emptyFilteredText: 'Попробуйте сбросить фильтры.',
    emptyMineText:
      'Задачи, назначенные вам, появятся здесь. Создавайте задачи прямо из карточки дела.',
    emptyAllText: 'По вашим делам пока нет задач.',
    // Глобальное создание задачи (v3 Сессия 6): кнопка и заголовок модалки.
    newTask: 'Новая задача',
  },

  // Блок задач на карточке дела
  caseBlock: {
    heading: 'Задачи и заседания',
    open: {
      one: '{n} открытая',
      few: '{n} открытых',
      many: '{n} открытых',
    },
    // ` · {n} завершено`
    doneCount: '{n} завершено',
    addTask: 'Добавить задачу',
    createSubmit: 'Создать',
    // ` ({n})`
    doneSection: 'Завершённые ({n})',
    emptyWritable:
      'Пока нет задач. Добавьте первую — она появится в общем календаре и в списке задач.',
    emptyReadonly: 'Пока нет задач по этому делу.',
  },

  // Форма создания/редактирования задачи
  form: {
    title: 'Название',
    createdToast: 'Задача создана',
    titlePlaceholder: 'Подготовить иск / Заседание / ...',
    // Комбобокс «Дело» в глобальном режиме (без привязки к карточке дела).
    case: 'Дело',
    caseSelect: '— выберите дело —',
    caseSearchPlaceholder: 'Поиск дела…',
    caseEmpty: 'Дело не найдено',
    kind: 'Тип',
    assignee: 'Исполнитель',
    assigneeSelect: '— выберите —',
    due: 'Срок',
    description: 'Описание',
    descriptionPlaceholder: 'Контекст, материалы, ссылки',
    saving: 'Сохранение…',
    // Подсказки ролей в списке исполнителей
    roleHint: {
      owner: 'владелец',
      admin: 'админ',
      office_manager: 'секретарь',
      lawyer: 'юрист',
      expert: 'эксперт',
    },
  },

  // Строка задачи
  row: {
    reopenAria: 'Открыть задачу заново',
    markDoneAria: 'Отметить выполненной',
    deleteAria: 'Удалить задачу',
  },

  // Блок «Приближающиеся сроки» на главной (рестайл 2026-07-08: компактные
  // строки с «через N дней» вместо подсекций-таблиц).
  upcoming: {
    heading: 'Приближающиеся сроки',
    subtitle: '· ближайшие 3 дня',
    allTasks: 'Все задачи →',
    empty: 'На ближайшие 3 дня ничего не запланировано — день под контролем.',
    dueToday: 'сегодня',
    inDays: { one: 'через {n} день', few: 'через {n} дня', many: 'через {n} дней' },
    overdueDays: {
      one: 'просрочено {n} день',
      few: 'просрочено {n} дня',
      many: 'просрочено {n} дней',
    },
    moreOverdue: 'и ещё {n} просроченных →',
  },

  // Ошибки валидации формы (server action actions.ts)
  errors: {
    checkForm: 'Проверьте поля формы',
    selectCase: 'Выберите дело',
    invalidCaseId: 'Некорректный идентификатор дела',
    enterTitle: 'Укажите название',
    titleTooLong: 'Слишком длинное (макс 200)',
    selectKind: 'Выберите тип',
    invalidKind: 'Недопустимый тип',
    selectAssignee: 'Выберите исполнителя',
    invalidAssignee: 'Некорректный идентификатор',
    invalidDate: 'Некорректная дата',
    hearingNeedsDate: 'Для заседания укажите дату и время',
    createFailed: 'Не удалось создать задачу.',
    updateFailed: 'Не удалось сохранить задачу.',
  },
};

export type TasksMessages = typeof tasks;
