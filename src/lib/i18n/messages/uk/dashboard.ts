import type { DashboardMessages } from '../ru/dashboard';

// Головна (дашборд): KPI-метрики, воронка, виручка за категоріями, останні
// справи, особисті нарахування та онбординг порожнього стану.
export const dashboard: DashboardMessages = {
  delta: {
    growth: 'зростання',
    decline: 'спад',
  },

  empty: {
    greeting: 'Ласкаво просимо, {name}!',
    staffMessage:
      'Тут з’явиться зведення зі справ, фінансів і строків. Заведіть клієнта та створіть першу справу — дашборд оживе.',
    lawyerMessage:
      'За вами поки немає справ. Заведіть клієнта або дочекайтеся, поки вас призначать на справу.',
    expertMessage:
      'За вами поки немає справ. Вони з’являться тут, щойно вас призначать експертом у справі.',
    newCase: 'Нова справа',
    newClient: 'Новий клієнт',
  },

  kpi: {
    activeCases: 'Активні справи',
    myActiveCases: 'Мої активні справи',
    ofTotal: 'із {total} усього',
    revenue: 'Виручка за місяць',
    salaryFund: 'Фонд зарплат',
    salaryFundContext: 'нараховано за оплатами',
    accruedToMe: 'Нараховано мені',
    accruedToMeContext: '% від оплаченого за справами',
    clientsDebt: 'Заборгованість клієнтів',
    casesDebt: 'Заборгованість за справами',
    debtPaidContext: 'оплачено {paid} ₴',
  },

  funnel: {
    title: 'Воронка справ',
  },

  categoryRevenue: {
    title: 'Виручка за категоріями',
    empty: 'Поки немає оплат — виручка з’явиться тут.',
  },

  recentCases: {
    title: 'Останні справи',
    allLink: 'Усі справи →',
    empty: 'Поки немає справ.',
    colNumberTitle: 'Номер / назва',
    colClient: 'Клієнт',
    colStage: 'Етап',
    colCategory: 'Категорія',
    colSumPayment: 'Сума / оплата',
  },

  earnings: {
    title: 'Мої нарахування',
    subtitle: '· % від оплаченого за справою',
    reportLink: 'Звіт →',
    empty:
      'У вас поки немає справ із нарахуваннями. Вони з’являться, коли за вашими справами надійдуть оплати.',
    colCase: 'Справа',
    colCategory: 'Категорія',
    colStage: 'Етап',
    colPaid: 'Оплачено',
    colPercent: '%',
    colAccrued: 'Нараховано',
    totalAccrued: 'Разом нараховано',
    base: 'база {amount} ₴',
  },
};
