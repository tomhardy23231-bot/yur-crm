import type { ClientsMessages } from '../ru/clients';

// Клієнти (довірителі): список, картка, форма створення/редагування,
// видалення, server actions.
export const clients: ClientsMessages = {
  list: {
    deletedNotice: 'Клієнта видалено.',
    tableAria: 'Список клієнтів',
    kindFilterLabel: 'Тип клієнта',
    addClient: 'Додати клієнта',
    colClient: 'Клієнт',
    colKind: 'Тип',
    colPhone: 'Телефон',
    colEmail: 'E-mail',
    colCases: 'Справ',
    colCreated: 'Створений',
    colActions: 'Дії',
    actionOpen: 'Відкрити в новій вкладці',
    actionEdit: 'Редагувати',
    paginationLabel: 'Пагінація',
    pageInfo: 'Сторінка {page} з {pageCount} · по {pageSize} на сторінці',
    prev: '← Назад',
    next: 'Уперед →',
    countInfo: '{count} з {total}',
    emptyFilteredTitle: 'Нічого не знайшли',
    emptyTitle: 'Тут будуть ваші клієнти',
    emptyFilteredHint:
      'Спробуйте змінити пошук або фільтри. Якщо клієнт має бути видимим — перевірте, що у вас є пов’язана з ним справа.',
    emptyHint:
      'Заведіть першого клієнта — потім додасте йому справу, документи та фінанси.',
  },

  search: {
    placeholder: 'Пошук за іменем, телефоном, e-mail…',
    ariaLabel: 'Пошук клієнтів',
  },

  new: {
    backToList: 'До списку',
    submit: 'Створити клієнта',
  },

  detail: {
    backToList: 'До списку клієнтів',
    errorHasCases:
      'Не можна видалити клієнта: у нього є справи. Спочатку закрийте або перенесіть справи.',
    errorDeleteFailed: 'Не вдалося видалити клієнта. Спробуйте пізніше.',
    errorMissingId: 'Не передано ідентифікатор клієнта.',
    clientSince: 'клієнт з',
    edit: 'Редагувати',
    statCases: 'Справ',
    statSum: 'На суму',
    statDebt: 'Борг',
    sectionKind: 'Тип клієнта',
    sectionBirthDate: 'Дата народження',
    sectionInn: 'ІПН',
    sectionInnEdrpou: 'ІПН / ЄДРПОУ',
    sectionContractNumber: 'Номер договору',
    sectionPhone: 'Телефон',
    sectionEmail: 'E-mail',
    sectionAddress: 'Адреса',
    sectionSource: 'Джерело',
    sectionNotes: 'Нотатки',
    casesTitle: 'Справи клієнта',
    casesNone: 'У клієнта поки немає справ',
    casesTotal: 'Усього: {count}',
    newCase: 'Нова справа',
    casesEmptyCanCreate:
      'Заведіть першу справу — вона збере документи, завдання та фінанси.',
    casesEmpty: 'Поки немає справ.',
    colNumberTitle: 'Номер / назва',
    colStage: 'Етап',
    colResponsible: 'Відповідальний',
    colOpened: 'Відкрито',
    colSum: 'Сума',
    colDebt: 'Борг',
  },

  edit: {
    backToCard: 'До картки клієнта',
    submit: 'Зберегти зміни',
  },

  form: {
    kindLabel: 'Тип клієнта',
    lastName: 'Прізвище',
    lastNamePlaceholder: 'Іванов',
    firstName: 'Ім’я',
    firstNamePlaceholder: 'Іван',
    middleName: 'По батькові',
    middleNamePlaceholder: 'Іванович',
    birthDate: 'Дата народження',
    companyName: 'Найменування',
    companyNamePlaceholder: 'ТОВ «Ромашка»',
    inn: 'ІПН',
    innEdrpou: 'ІПН / ЄДРПОУ',
    innPlaceholder: '1234567890',
    contractNumber: 'Номер договору',
    contractNumberPlaceholder: '№ 2026/001',
    phone: 'Телефон',
    phonePlaceholder: '+38 067 000 00 00',
    email: 'E-mail',
    emailPlaceholder: 'client@example.com',
    address: 'Адреса',
    addressPlaceholder: 'м. Київ, вул. Хрещатик, 1',
    source: 'Джерело',
    sourceNone: '— не вказано —',
    notes: 'Нотатки',
    notesPlaceholder: 'Будь-яка внутрішня інформація про клієнта',
  },

  delete: {
    confirm:
      'Видалити клієнта «{name}»? Операція незворотна. Якщо у клієнта є справи — видалення буде заблоковано.',
  },

  actions: {
    selectKind: 'Оберіть тип',
    invalidKind: 'Неприпустимий тип',
    enterLastName: 'Вкажіть прізвище',
    enterFirstName: 'Вкажіть ім’я',
    tooLong100: 'Занадто довго (макс 100)',
    enterName: 'Вкажіть найменування',
    nameTooLong: 'Занадто довге (макс 200)',
    invalidDate: 'Невірна дата',
    futureDate: 'Дата в майбутньому',
    invalidInn: 'ІПН — лише цифри (8–12)',
    invalidEmail: 'Схоже на помилку в e-mail',
    invalidSource: 'Неприпустиме джерело',
    noCreatePermission: 'Недостатньо прав для створення клієнта.',
    createFailed: 'Не вдалося створити клієнта.',
    noEditPermission:
      'Недостатньо прав: клієнта може змінити автор запису або співробітник з доступом до всіх справ.',
    updateFailed: 'Не вдалося зберегти зміни клієнта.',
  },

  // v3 Сесія 7: конфлікт-чек інтересів / дублікат при створенні клієнта.
  conflictWarning: 'Можливий конфлікт інтересів або дублікат клієнта:',
};
