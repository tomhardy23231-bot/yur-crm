import type { TasksMessages } from '../ru/tasks';

// Завдання: загальна сторінка /tasks, блок завдань на картці справи, форма
// завдання, рядок завдання, блок найближчих строків. uk — переклад.
export const tasks: TasksMessages = {
  page: {
    modeMine: 'Мої',
    modeAll: 'Усі',
    statusAria: 'Статус',
    allStatuses: 'Усі статуси',
    reset: 'Скинути',
    calendar: 'Календар',
    paginationAria: 'Пагінація',
    pageInfo: 'Сторінка {page} з {pageCount} · по {pageSize} на сторінці',
    prev: '← Назад',
    next: 'Вперед →',
    groupOverdue: 'Прострочено',
    groupToday: 'Сьогодні',
    groupTomorrow: 'Завтра',
    groupWeek: 'Цього тижня',
    groupLater: 'Пізніше',
    groupNoDate: 'Без строку',
    emptyFilteredTitle: 'Нічого не знайшли',
    emptyTitle: 'Тут будуть завдання',
    emptyFilteredText: 'Спробуйте скинути фільтри.',
    emptyMineText:
      'Завдання, призначені вам, з’являться тут. Створюйте завдання прямо з картки справи.',
    emptyAllText: 'За вашими справами поки немає завдань.',
    // Глобальне створення завдання (v3 Сесія 6): кнопка і заголовок модалки.
    newTask: 'Нове завдання',
  },

  caseBlock: {
    heading: 'Завдання та засідання',
    open: {
      one: '{n} відкрите',
      few: '{n} відкритих',
      many: '{n} відкритих',
    },
    doneCount: '{n} завершено',
    addTask: 'Додати завдання',
    createSubmit: 'Створити',
    doneSection: 'Завершені ({n})',
    emptyWritable:
      'Поки немає завдань. Додайте перше — воно з’явиться в загальному календарі та у списку завдань.',
    emptyReadonly: 'Поки немає завдань за цією справою.',
  },

  form: {
    title: 'Назва',
    createdToast: 'Завдання створено',
    titlePlaceholder: 'Підготувати позов / Засідання / ...',
    // Комбобокс «Справа» у глобальному режимі (без прив’язки до картки справи).
    case: 'Справа',
    caseSelect: '— оберіть справу —',
    caseSearchPlaceholder: 'Пошук справи…',
    caseEmpty: 'Справу не знайдено',
    kind: 'Тип',
    assignee: 'Виконавець',
    assigneeSelect: '— оберіть —',
    due: 'Строк',
    description: 'Опис',
    descriptionPlaceholder: 'Контекст, матеріали, посилання',
    saving: 'Збереження…',
    roleHint: {
      owner: 'власник',
      admin: 'адмін',
      office_manager: 'секретар',
      lawyer: 'юрист',
      expert: 'експерт',
    },
  },

  row: {
    reopenAria: 'Відкрити завдання знову',
    markDoneAria: 'Позначити виконаним',
    deleteAria: 'Видалити завдання',
  },

  upcoming: {
    heading: 'Найближчі строки',
    subtitle: '· найближчі 3 дні',
    allTasks: 'Усі завдання →',
    empty: 'На найближчі 3 дні нічого не заплановано — день під контролем.',
    overdueHeading: 'Прострочені',
    soonHeading: 'Найближчі 72 години',
  },

  errors: {
    checkForm: 'Перевірте поля форми',
    selectCase: 'Оберіть справу',
    invalidCaseId: 'Некоректний ідентифікатор справи',
    enterTitle: 'Вкажіть назву',
    titleTooLong: 'Занадто довга (макс 200)',
    selectKind: 'Оберіть тип',
    invalidKind: 'Неприпустимий тип',
    selectAssignee: 'Оберіть виконавця',
    invalidAssignee: 'Некоректний ідентифікатор',
    invalidDate: 'Некоректна дата',
    hearingNeedsDate: 'Для засідання вкажіть дату та час',
    createFailed: 'Не вдалося створити завдання.',
    updateFailed: 'Не вдалося зберегти завдання.',
  },
};
