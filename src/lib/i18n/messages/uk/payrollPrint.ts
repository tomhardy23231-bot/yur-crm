import type { PayrollPrintMessages } from '../ru/payrollPrint';

// Друковані звіти по зарплаті (route-group (print)): звіт співробітника, зведений,
// тулбар, шапка документа, серверна збірка даних (report.ts).
export const payrollPrint: PayrollPrintMessages = {
  toolbar: {
    back: 'Назад',
    downloadPdf: 'Завантажити PDF',
  },

  document: {
    brand: 'ЮрКейс',
    company: 'Юридична компанія',
    note: 'Нарахування та виплата заробітної плати здійснюються 15-го числа та в останній день місяця. Усі суми вказані у гривні (₴). Показник «До виплати» — накопичений залишок заборгованості перед співробітником за весь час на дату формування звіту. Документ сформовано автоматично системою ЮрКейс.',
    signatureEmployee: 'Співробітник',
    signatureManager: 'Керівник',
    signatureCaption: 'підпис / дата',
  },

  employeePage: {
    docKind: 'Звіт по заробітній платі',
    title: 'Звіт по заробітній платі співробітника',
    subtitle: '{name} · період: {month}',
    roleLawyer: 'юрист — {n}',
    roleExpert: 'експерт — {n}',
    metaEmployee: 'Співробітник',
    metaRoles: 'Справи за ролями',
    metaPeriod: 'Період',
    metaGenerated: 'Сформовано',
  },

  employee: {
    kpiEarnedMonth: 'Нараховано за місяць',
    kpiBonusMonth: 'Премії за місяць',
    kpiPayoutMonth: 'Виплачено за місяць',
    kpiBalance: 'До виплати (всього)',
    kpiBalanceCaption: 'справи {cases} ₴ · премії {bonus} ₴',

    metricCasesMonth: 'Справ за місяць',
    metricClientPaid: 'Надходження клієнтів',
    metricContractSum: 'Сума договорів',
    metricLawyerEarned: 'Нараховано як юрист',
    metricExpertEarned: 'Нараховано як експерт',

    casesTitle: 'Справи та нарахування',
    casesEmpty: 'За обраний період оплат по справах не надходило — нарахувань немає.',
    colCaseClient: 'Справа / клієнт',
    colCategoryStage: 'Категорія · етап',
    colRoleRate: 'Роль · ставка',
    colClientPaid: 'Оплачено клієнтом',
    colEarned: 'Нараховано',
    colPaid: 'Виплачено',
    colOutstanding: 'Залишок',
    casesTotal: 'Разом за період',

    paymentsTitle: 'Надходження від клієнтів за період',
    colDate: 'Дата',
    colCase: 'Справа',
    colMethod: 'Спосіб',
    colAmount: 'Сума',
    paymentsTotal: 'Усього надходжень',

    payoutsTitle: 'Виплати співробітнику за період',
    payoutsEmpty: 'За обраний період виплат співробітнику не зафіксовано.',
    colPurpose: 'Призначення',
    bonusLabel: 'Премія',
    payoutsTotal: 'Усього виплачено за період',

    bonusesTitle: 'Премії за період',
    colComment: 'Коментар',
  },

  payMethod: {
    cash: 'Готівка',
    card: 'Картка',
    bank: 'Банк. переказ',
    transfer: 'Переказ',
    other: 'Інше',
  },

  summaryPage: {
    docKind: 'Зведений звіт по зарплаті',
    title: 'Зведений звіт по заробітній платі',
    subtitle: 'Нарахування, премії та виплати по всіх співробітниках · період: {month}',
    metaType: 'Тип',
    metaTypeValue: 'Зведений по всіх співробітниках',
    metaEmployees: 'Співробітників',
    metaPeriod: 'Період',
    metaGenerated: 'Сформовано',
  },

  summary: {
    kpiEmployees: 'Співробітників',
    kpiEarnedMonth: 'Нараховано за місяць',
    kpiBonusMonth: 'Премії за місяць',
    kpiPayoutMonth: 'Виплачено за місяць',
    kpiBalance: 'До виплати (всього)',

    tableTitle: 'Нарахування та виплати по співробітниках',
    empty: 'За обраний період даних по заробітній платі немає.',
    colEmployee: 'Співробітник',
    colEarned: 'Нараховано за місяць',
    colBonus: 'Премії за місяць',
    colPayout: 'Виплачено за місяць',
    colBalance: 'До виплати (всього)',
    totalRow: 'Разом · {n} осіб',
  },

  fallbackEmployeeName: 'Співробітник',
};
