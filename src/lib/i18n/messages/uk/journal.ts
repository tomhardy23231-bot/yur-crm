import type { JournalMessages } from '../ru/journal';

// Сторінка «Журнал» (/journal) — глобальна стрічка активності.
export const journal: JournalMessages = {
  metaTitle: 'Журнал — ЮрКейс',
  title: 'Журнал',
  subtitle: 'Усе, що відбувається в системі: хто, що і коли зробив.',

  scopeOwner: 'Ви бачите всі події компанії, включно з касою, ставками, відпустками та входами в систему.',
  scopeStaff: 'Ви бачите події у справах і клієнтах у своїй зоні доступу.',
  scopeSelf: 'Ви бачите події у своїх справах.',

  filters: {
    userAria: 'Співробітник',
    allUsers: 'Усі співробітники',
    groupAria: 'Тип події',
    allGroups: 'Усі події',
    fromLabel: 'З',
    toLabel: 'по',
    fromAria: 'Дата: з',
    toAria: 'Дата: по',
    reset: 'Скинути',
  },

  groups: {
    cases: 'Справи та етапи',
    finance: 'Платежі та акти',
    payroll: 'Зарплата і премії',
    docs: 'Документи',
    tasks: 'Завдання',
    comments: 'Коментарі',
    clients: 'Клієнти',
    team: 'Співробітники та доступи',
    security: 'Входи в систему',
    cash: 'Каса',
    absences: 'Відпустки',
  },

  today: 'Сьогодні',
  yesterday: 'Вчора',

  dayCount: {
    one: '{n} подія',
    few: '{n} події',
    many: '{n} подій',
  },

  empty: {
    title: 'Поки порожньо',
    hint: 'Події з’являтимуться тут у міру роботи: справи, платежі, документи, завдання — усе буде зібрано в одну стрічку.',
    filteredTitle: 'Нічого не знайшли',
    filteredHint: 'Змініть фільтри або скиньте їх.',
  },

  showMore: 'Показати ще',
  shownCount: 'Показано подій: {n}',

  rich: {
    forAmount: 'на суму',
    cashIn: 'вніс(ла) прихід у касу',
    cashOut: 'вніс(ла) витрату з каси',
    cashDeleted: 'видалив(ла) операцію каси',
    txDeletedPayout: 'видалив(ла) виплату зарплати',
    txDeletedBonus: 'видалив(ла) премію',
    actNo: 'акт №{n}',
    completionLabel: 'Виконання:',
    stageLabel: 'Етап:',
    reasonLabel: 'Причина:',
    periodLabel: 'Період:',
    rateLawyer: 'юрист',
    rateExpert: 'експерт',
  },
};
