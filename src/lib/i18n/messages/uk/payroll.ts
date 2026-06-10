import type { PayrollMessages } from '../ru/payroll';

// Фінанси та зарплата: звіт по ЗП (список співробітників, картка співробітника),
// налаштування ставок, блок виплат команді в картці справи, перемикач місяця,
// модалки виплати/премії та server actions розрахунку зарплати.
export const payroll: PayrollMessages = {
  monthNames: {
    january: 'Січень',
    february: 'Лютий',
    march: 'Березень',
    april: 'Квітень',
    may: 'Травень',
    june: 'Червень',
    july: 'Липень',
    august: 'Серпень',
    september: 'Вересень',
    october: 'Жовтень',
    november: 'Листопад',
    december: 'Грудень',
  },

  report: {
    heading: 'Фінанси та ЗП',
    subtitle:
      'Нараховано, премії та виплати за {month}. «До виплати» — загальний накопичений борг за весь час.',
    summaryReport: 'Зведений звіт',
    configureRates: 'Налаштувати ставки',
    departmentAria: 'Підрозділ',
    allDepartments: 'Усі підрозділи',

    ratesTitle: 'Ставки',
    rateLawyer: 'юрист',
    rateExpert: 'експерт',

    emptyTitle: 'Поки немає даних по зарплаті',
    emptyHint: 'Нарахування з’являться, коли по справах надійдуть оплати.',

    colEmployee: 'Співробітник',
    colEarnedMonth: 'Нараховано за місяць',
    colBonusMonth: 'Премії за місяць',
    colPaidMonth: 'Виплачено за місяць',
    colBalanceTotal: 'До виплати (усього)',

    totalEarnedMonth: 'нараховано за місяць',
    totalPaidMonth: 'виплачено за місяць',
    totalBalanceTotal: 'до виплати всього',
  },

  employee: {
    backToAll: 'До всіх співробітників',
    rolesLawyer: 'юрист — {count}',
    rolesExpert: 'експерт — {count}',
    rolesSuffix: 'справ',
    buildReport: 'Сформувати звіт',

    toPayNow: 'До виплати зараз',
    toPayBreakdown: 'усього · справи {cases} ₴ · премії {bonus} ₴',

    earnedMonth: 'Зароблено за місяць',
    bonusMonth: 'Премії за місяць',
    paidMonth: 'Виплачено за місяць',
    paidMonthCaption: 'справи {cases} · премії {bonus}',

    casesTitle: 'Заробіток по справах — {month}',
    casesCount: { one: '{n} справа', few: '{n} справи', many: '{n} справ' },
    casesEmpty: 'За {month} оплат по справах не було — нарахувань немає.',

    colCase: 'Справа',
    colStage: 'Етап',
    colRole: 'Роль',
    colEarned: 'Зароблено',
    colPayout: 'Виплата',
    colRemaining: 'Залишилось',

    earnedFrom: '{percent}% від {paid} ₴',
    statusPaid: 'Виплачено',
    statusPartial: 'виплачено {amount} ₴',
    statusUnpaid: 'не виплачено',

    bonusesTitle: 'Премії — {month}',
    bonusAccrued: 'нараховано',
    bonusPaid: 'виплачено',
    bonusRemaining: 'залишилось',
    bonusesEmpty:
      'За {month} премій немає. Кнопка «Премія» — нарахувати бонус понад заробіток по справах.',
    badgePaid: 'виплачено',
    badgePartial: 'виплачено {paid} з {amount} ₴',
    badgeUnpaid: 'не виплачено',
    bonusLabel: 'Премія {amount} ₴',

    payoutsTitle: 'Виплати — {month}',
    payoutsEmpty:
      'За {month} виплат не було. Кнопка «Виплата» — позначити, що видали співробітнику (за справи та/або премії).',
    payoutBonusChip: 'премії',
    payoutLabel: 'Виплата {amount} ₴',

    fallbackName: 'Співробітник',
  },

  settings: {
    backToPayroll: 'До зарплати',
    lawyerPercent: 'Юрист, %',
    expertPercent: 'Експерт, %',
    lawyerRateAria: '{category} — ставка юриста, %',
    expertRateAria: '{category} — ставка експерта, %',
    saveRates: 'Зберегти ставки',
    saving: 'Збереження…',
    ratesSaved: 'Ставки збережено.',
    percentRange: 'Відсоток — число від 0 до 100',
    fieldMissing: 'Поле {field} відсутнє',
    lawyerError: 'Юрист, «{category}»: {error}',
    expertError: 'Експерт, «{category}»: {error}',
  },

  ledger: {
    labelShort: 'Виплати:',
    title: 'Виплати команді',
    paidOn: 'виплачено {date}',
    accruedOn: 'нараховано {date}',
    revert: 'Відкотити',
    markPaid: 'Виплачено',
  },

  monthPicker: {
    prev: 'Попередній місяць',
    next: 'Наступний місяць',
  },

  actions: {
    bonusButton: 'Премія',
    payoutButton: 'Виплата',
    deleteAria: 'Видалити',
    deleteConfirm: 'Видалити «{label}»? Дію не можна скасувати.',
    closeAria: 'Закрити',

    payoutTitle: 'Виплата',
    payoutSubtitle: '{name} · позначте, що закриваєте',
    nothingToPay: 'Нема чого виплачувати — немає невиплаченого заробітку та премій.',
    casesToPay: 'Справи до виплати',
    selectAll: 'Вибрати всі',
    unselectAll: 'Зняти всі',
    bonusesHeading: 'Премії',
    unpaidBonuses: 'Невиплачені премії',
    bonusesAside: 'бонуси повз справи',
    payoutDate: 'Дата виплати',
    comment: 'Коментар',
    payoutCommentPlaceholder: 'Напр.: виплата 15-го за червень',
    toPay: 'До виплати:',
    cancel: 'Скасувати',
    saving: 'Збереження…',
    savePayout: 'Зберегти виплату',

    bonusTitle: 'Премія',
    bonusSubtitle: '{name} · бонус понад заробіток по справах',
    amount: 'Сума, ₴',
    date: 'Дата',
    bonusCommentPlaceholder: 'За що премія (необов’язково)',
    saveBonus: 'Зберегти премію',
  },

  mutations: {
    noEmployee: 'Не вказано співробітника.',
    badPayoutDate: 'Вкажіть коректну дату виплати.',
    badAllocations: 'Не вдалося розібрати список справ.',
    nothingSelected: 'Позначте справи або премію для виплати (нема чого виплачувати).',
    payoutCreateFailed: 'Не вдалося створити виплату.',
    payoutSaved: 'Виплату збережено.',
    badBonusAmount: 'Введіть суму більше 0 (до 2 знаків).',
    bonusOutOfRange: 'Сума поза допустимим діапазоном.',
    bonusSaved: 'Премію збережено.',
  },
};
