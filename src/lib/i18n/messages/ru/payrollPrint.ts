// Печатные отчёты по зарплате (route-group (print)): отчёт сотрудника, сводный,
// тулбар, шапка документа, серверная сборка данных (report.ts).

export const payrollPrint = {
  // Тулбар отчёта (кнопки печати/назад).
  toolbar: {
    back: 'Назад',
    downloadPdf: 'Скачать PDF',
  },

  // Шапка документа (бренд, подписи, примечание).
  document: {
    brand: 'ЮрКейс',
    company: 'Юридическая компания',
    note: 'Начисление и выплата заработной платы производятся 15-го числа и в последний день месяца. Все суммы указаны в гривне (₴). Показатель «К выплате» — накопленный остаток задолженности перед сотрудником за всё время на дату формирования отчёта. Документ сформирован автоматически системой ЮрКейс.',
    signatureEmployee: 'Сотрудник',
    signatureManager: 'Руководитель',
    signatureCaption: 'подпись / дата',
  },

  // Страница отчёта сотрудника: мета-реквизиты, заголовок документа.
  employeePage: {
    docKind: 'Отчёт по заработной плате',
    title: 'Отчёт по заработной плате сотрудника',
    subtitle: '{name} · период: {month}',
    roleLawyer: 'юрист — {n}',
    roleExpert: 'эксперт — {n}',
    metaEmployee: 'Сотрудник',
    metaRoles: 'Дела по ролям',
    metaPeriod: 'Период',
    metaGenerated: 'Сформирован',
  },

  // Тело отчёта сотрудника: KPI, метрики, таблицы.
  employee: {
    kpiEarnedMonth: 'Начислено за месяц',
    kpiBonusMonth: 'Премии за месяц',
    kpiPayoutMonth: 'Выплачено за месяц',
    kpiBalance: 'К выплате (всего)',
    kpiBalanceCaption: 'дела {cases} ₴ · премии {bonus} ₴',

    metricCasesMonth: 'Дел за месяц',
    metricClientPaid: 'Поступления клиентов',
    metricContractSum: 'Сумма договоров',
    metricLawyerEarned: 'Начислено как юрист',
    metricExpertEarned: 'Начислено как эксперт',

    casesTitle: 'Дела и начисления',
    casesEmpty: 'За выбранный период оплат по делам не поступало — начислений нет.',
    colCaseClient: 'Дело / клиент',
    colCategoryStage: 'Категория · этап',
    colRoleRate: 'Роль · ставка',
    colClientPaid: 'Оплачено клиентом',
    colEarned: 'Начислено',
    colPaid: 'Выплачено',
    colOutstanding: 'Остаток',
    casesTotal: 'Итого за период',

    paymentsTitle: 'Поступления от клиентов за период',
    colDate: 'Дата',
    colCase: 'Дело',
    colMethod: 'Способ',
    colAmount: 'Сумма',
    paymentsTotal: 'Всего поступлений',

    payoutsTitle: 'Выплаты сотруднику за период',
    payoutsEmpty: 'За выбранный период выплат сотруднику не зафиксировано.',
    colPurpose: 'Назначение',
    bonusLabel: 'Премия',
    payoutsTotal: 'Всего выплачено за период',

    bonusesTitle: 'Премии за период',
    colComment: 'Комментарий',
  },

  // Способ оплаты клиента (нет в общих enums).
  payMethod: {
    cash: 'Наличные',
    card: 'Карта',
    bank: 'Банк. перевод',
    transfer: 'Перевод',
    other: 'Прочее',
  },

  // Страница сводного отчёта: мета-реквизиты, заголовок документа.
  summaryPage: {
    docKind: 'Сводный отчёт по зарплате',
    title: 'Сводный отчёт по заработной плате',
    subtitle: 'Начисления, премии и выплаты по всем сотрудникам · период: {month}',
    metaType: 'Тип',
    metaTypeValue: 'Сводный по всем сотрудникам',
    metaEmployees: 'Сотрудников',
    metaPeriod: 'Период',
    metaGenerated: 'Сформирован',
  },

  // Тело сводного отчёта: KPI, таблица по сотрудникам.
  summary: {
    kpiEmployees: 'Сотрудников',
    kpiEarnedMonth: 'Начислено за месяц',
    kpiBonusMonth: 'Премии за месяц',
    kpiPayoutMonth: 'Выплачено за месяц',
    kpiBalance: 'К выплате (всего)',

    tableTitle: 'Начисления и выплаты по сотрудникам',
    empty: 'За выбранный период данных по заработной плате нет.',
    colEmployee: 'Сотрудник',
    colEarned: 'Начислено за месяц',
    colBonus: 'Премии за месяц',
    colPayout: 'Выплачено за месяц',
    colBalance: 'К выплате (всего)',
    totalRow: 'Итого · {n} чел.',
  },

  // Серверная сборка (report.ts): запасное имя сотрудника.
  fallbackEmployeeName: 'Сотрудник',
};

export type PayrollPrintMessages = typeof payrollPrint;
