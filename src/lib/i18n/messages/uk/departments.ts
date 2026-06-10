// Керування підрозділами та прив'язкою співробітників (екран /settings/departments
// + призначення department/position/visibility_scope). v2 Етап 3.

export const departments = {
  heading: 'Підрозділи',
  intro:
    'Філії компанії. Справу бачать керівники підрозділів її юриста та експерта. Видимість кожного керівника налаштовується персонально.',

  create: {
    nameLabel: 'Назва підрозділу',
    namePlaceholder: 'Наприклад, Харківський',
    submit: 'Додати підрозділ',
    submitting: 'Створення…',
  },
  created: 'Підрозділ створено.',

  list: {
    colName: 'Назва',
    colMembers: 'Співробітників',
    colStatus: 'Статус',
    colActions: 'Дії',
    statusActive: 'Активний',
    statusInactive: 'Прихований',
    totalLabel: 'Усього підрозділів',
    membersOne: '{n} співробітник',
    membersFew: '{n} співробітники',
    membersMany: '{n} співробітників',
    empty: 'Підрозділів поки немає.',
    emptyTeam: 'У підрозділі поки немає співробітників.',
  },

  rename: {
    ariaLabel: 'Назва підрозділу',
    save: 'Зберегти',
    title: 'Перейменувати',
  },

  deactivate: 'Приховати',
  activate: 'Повернути',
  deactivateHint:
    'Прихований підрозділ зникає з фільтрів і форм призначення. Співробітники та дані не змінюються.',

  team: {
    heading: 'Команда',
    colMember: 'Співробітник',
    colRole: 'Роль',
    colPosition: 'Посада',
    colScope: 'Видимість',
    manageHint: 'Призначення співробітників і посад — на екрані «Користувачі та ролі».',
    manageLink: 'Перейти до користувачів',
  },

  assign: {
    button: 'Підрозділ',
    title: 'Підрозділ і посада',
    departmentLabel: 'Підрозділ',
    noDepartment: 'Поза структурою',
    positionLabel: 'Посада',
    positionPlaceholder: 'Наприклад, керівник ВП',
    positionHint: 'Вільний текст. На права доступу не впливає.',
    scopeLabel: 'Видимість',
    scopeOwnerOnly: 'Підрозділ і видимість змінює лише власник.',
    save: 'Зберегти',
    none: 'Поза структурою',
  },

  errors: {
    enterName: 'Вкажіть назву',
    nameTooLong: 'Занадто довго (макс 100)',
    nameTaken: 'Підрозділ із такою назвою вже існує',
  },
};

export type DepartmentsMessages = typeof departments;
