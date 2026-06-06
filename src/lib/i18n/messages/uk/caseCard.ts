import type { CaseCardMessages } from '../ru/caseCard';

// Картка справи: перегляд, форма (створення/редагування), степер етапів,
// панель дій, видалення, inline-створення клієнта, server actions справ.
export const caseCard: CaseCardMessages = {
  // ── Екран перегляду картки справи (cases/[id]/page.tsx) ──────────────
  detail: {
    errorHasLinks:
      'Не можна видалити справу: до неї прив’язані документи або платежі. Спочатку перемістіть/видаліть пов’язані записи.',
    errorDeleteFailed: 'Не вдалося видалити справу. Спробуйте пізніше.',
    errorMissingId: 'Не передано ідентифікатор справи.',

    brandBadge: 'Справа',
    withoutActBadge: 'без акта',
    withoutActBadgeTitle: 'Справу завершено без акта приймання-передачі',
    missingActWarning:
      'Справу завершено, але акт приймання-передачі виконаних робіт не завантажено.',

    openedAt: 'відкрито',
    closedAt: 'завершено',

    paymentLabel: 'Оплата:',
    opponentLabel: 'Опонент:',
    courtLabel: 'Суд:',
    caseNumberLabel: '№ справи:',

    stageDays: {
      one: 'На поточному етапі {n} день',
      few: 'На поточному етапі {n} дні',
      many: 'На поточному етапі {n} днів',
    },

    rewardTitle: 'Винагорода команди',
    rewardSum: 'Сума',
    rewardPaid: 'Оплачено',
    rewardOverpaid: 'Переплата',
    rewardDebt: 'Борг',
    rateOverridden: 'Ставку перевизначено вручну',

    roleLawyerManager: 'Юрист-менеджер',
    roleExpert: 'Експерт',

    fullyPaid: 'виплачено',
    notPaid: 'не виплачено',
    partiallyPaid: 'виплачено {paid} · залишилося {outstanding} ₴',

    caseFund: 'Фонд по справі',
    myAccrual: 'Моє нарахування',
    paidLabel: 'Виплачено',
    outstandingLabel: 'Залишилося',
    payoutHint:
      'Виплати позначаються в розділі «Фінанси і ЗП» → картка співробітника.',
  },

  // ── Сітка «поле: значення» в шапці (case-info-grid.tsx) ──────────────
  overview: {
    colCase: 'Справа',
    colClient: 'Клієнт',
    colFinance: 'Оплата і суд',

    number: '№ / назва',
    caseType: 'Тип справи',
    category: 'Категорія',
    priority: 'Пріоритет',
    opened: 'Відкрито',
    closed: 'Завершено',
    lawyer: 'Юрист (договір)',
    expert: 'Експерт (виконавець)',

    clientName: 'Клієнт',
    clientKind: 'Тип',
    phone: 'Телефон',
    email: 'E-mail',
    source: 'Джерело',

    billing: 'Тип оплати',
    court: 'Суд',
    opponent: 'Опонент',
    courtCaseNumber: '№ судової справи',

    notSet: 'не вказано',
    dash: '—',
  },

  // ── Панель дій картки (case-action-bar.tsx) ──────────────────────────
  actionBar: {
    backToList: 'До списку справ',
    edit: 'Редагувати',
    sectionOverview: 'Огляд',
    sectionDocuments: 'Документи',
    sectionTasks: 'Завдання',
    sectionComments: 'Коментарі',
    sectionFinance: 'Фінанси',
    sectionHistory: 'Історія',
  },

  // ── Видалення справи (delete-case-form.tsx) ──────────────────────────
  delete: {
    button: 'Видалити',
    confirm:
      'Видалити справу «{title}»? Операція незворотна. Якщо у справи є документи або платежі — видалення буде заблоковано.',
  },

  // ── Степер етапів (case-stage-stepper.tsx) ───────────────────────────
  stepper: {
    confirmCloseWithoutAct:
      'По справі не завантажено акт приймання-передачі виконаних робіт. Завершити справу все одно?',
    moveTo: 'Перевести на етап «{stage}»',
  },

  // ── Прогрес оплати (payment-progress.tsx) ────────────────────────────
  progress: {
    ariaLabel: 'Оплачено по справі',
  },

  // ── Сторінка редагування (cases/[id]/edit/page.tsx) ──────────────────
  edit: {
    backToCase: 'До картки справи',
  },

  // ── Сторінка створення (cases/new/page.tsx) ──────────────────────────
  create: {
    backToClient: 'До клієнта «{name}»',
    backToList: 'До списку',
    submit: 'Створити справу',
  },

  // ── Екран «справа недоступна» (cases/[id]/not-found.tsx) ─────────────
  notFound: {
    backToList: 'До списку справ',
    title: 'Справа недоступна',
    description:
      'Справу не знайдено або у вас немає до неї доступу. Можливо, її веде інший співробітник. Якщо вважаєте, що це помилка — зверніться до адміністратора.',
    goToMyCases: 'Перейти до моїх справ',
  },

  // ── Форма справи (case-form.tsx) ─────────────────────────────────────
  form: {
    sectionBasic: 'Основне',
    sectionFinance: 'Фінанси',
    sectionCourt: 'Судове (якщо застосовно)',
    sectionExtra: 'Додатково',

    numberTitle: 'Номер / назва',
    numberTitlePlaceholder: 'CRM-2026-003 / Позов ТОВ «Ромашка»',
    client: 'Клієнт',
    clientSelectPlaceholder: '— оберіть клієнта —',
    newClient: 'Новий',
    lawyer: 'Юрист (договір)',
    expert: 'Експерт (виконавець)',
    selectPlaceholder: '— оберіть —',
    openedAt: 'Відкрито',
    caseType: 'Тип справи',
    category: 'Категорія (для розрахунку зарплати)',
    subject: 'Предмет договору',
    subjectPlaceholder: 'коротко: стягнення заборгованості, реєстрація ТОВ…',
    stage: 'Етап',
    priority: 'Пріоритет',

    contractSum: 'Сума договору',
    rateOverrideTitle: 'Індивідуальний % зарплати по цій справі',
    rateOverrideHint:
      'Необов’язково. Порожньо → береться ставка категорії. Змінює лише власник/адміністратор.',
    lawyerRate: '% юриста',
    expertRate: '% експерта',
    rateByCategoryPlaceholder: 'за категорією',
    accrualMode: 'Нарахування зарплати',
    billingTypes: 'Тип оплати',

    opponent: 'Опонент',
    opponentPlaceholder: 'ПІБ / назва організації',
    courtCaseNumber: 'Номер судової справи',
    courtCaseNumberPlaceholder: '755/12345/2026',
    court: 'Суд',
    courtPlaceholder: 'Шевченківський районний суд м. Києва',

    tags: 'Теги',
    tagsPlaceholder: 'через кому: vip, hot, recurring',

    cancel: 'Скасувати',
    saving: 'Збереження…',
  },

  // ── Inline-створення клієнта з форми справи (inline-client-create.tsx) ──
  inlineClient: {
    dialogAria: 'Новий клієнт',
    title: 'Новий клієнт',
    closeAria: 'Закрити',

    kind: 'Тип клієнта',
    lastName: 'Прізвище',
    lastNamePlaceholder: 'Іванов',
    firstName: 'Ім’я',
    firstNamePlaceholder: 'Іван',
    middleName: 'По батькові',
    middleNamePlaceholder: 'Іванович',
    birthDate: 'Дата народження',
    name: 'Найменування',
    namePlaceholder: 'ТОВ «Ромашка»',
    innIndividual: 'ІПН',
    innCompany: 'ІПН / ЄДРПОУ',
    innPlaceholder: '1234567890',
    contractNumber: 'Номер договору',
    contractNumberPlaceholder: '№ 2026/001',
    phone: 'Телефон',
    phonePlaceholder: '+38 067 000 00 00',
    email: 'E-mail',
    emailPlaceholder: 'client@example.com',
    source: 'Джерело',
    sourcePlaceholder: '— не вказано —',
    notes: 'Нотатки',
    notesPlaceholder: 'Опціонально',

    cancel: 'Скасувати',
    saving: 'Збереження…',
    submit: 'Створити та обрати',
  },

  // ── Server actions (lib/cases/actions.ts) ────────────────────────────
  actions: {
    noCreatePermission: 'Недостатньо прав для створення справи.',

    checkForm: 'Перевірте поля форми',
    numberRequired: 'Вкажіть номер/назву',
    numberTooLong: 'Занадто довге (макс 200)',
    clientRequired: 'Оберіть клієнта',
    clientInvalid: 'Некоректний ідентифікатор клієнта',
    lawyerRequired: 'Оберіть юриста (договір)',
    idInvalid: 'Некоректний ідентифікатор',
    expertRequired: 'Оберіть Експерта',
    openedAtRequired: 'Вкажіть дату відкриття',
    dateFormat: 'Дата у форматі РРРР-ММ-ДД',
    caseTypeRequired: 'Оберіть тип справи',
    caseTypeInvalid: 'Неприпустимий тип',
    categoryRequired: 'Оберіть категорію',
    categoryInvalid: 'Неприпустима категорія',
    subjectTooLong: 'Занадто довге (макс 300)',
    stageRequired: 'Оберіть етап',
    stageInvalid: 'Неприпустимий етап',
    priorityRequired: 'Оберіть пріоритет',
    priorityInvalid: 'Неприпустимий пріоритет',
    contractSumInvalid: 'Сума — число ≥ 0',
    percentInvalid: 'Відсоток — число від 0 до 100',

    createFailed: 'Не вдалося створити справу.',
    updateFailed: 'Не вдалося зберегти справу.',

    caseInvalid: 'Некоректна справа',
    caseNotFound: 'Справу не знайдено',
    stageChangeFailed: 'Не вдалося змінити етап.',
    stageBackwardForbidden:
      'Повернення на попередній етап дозволено лише адміністратору.',
    stageSkipForbidden:
      'Етапи перемикаються строго по порядку — не можна перестрибнути через етап.',
    stageBackwardFieldError: 'Повернення на попередній етап заборонено',
    stageSkipFieldError: 'Лише наступний етап по порядку',
  },
};
