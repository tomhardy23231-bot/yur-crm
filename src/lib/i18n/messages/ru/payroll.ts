// Финансы и зарплата: отчёт по ЗП (список сотрудников, карточка сотрудника),
// настройка ставок, блок выплат команде в карточке дела, переключатель месяца,
// модалки выплаты/премии и server actions расчёта зарплаты.

export const payroll = {
  // Названия месяцев (капитализированы — подпись «Июнь 2026»). Индекс 0 = январь.
  monthNames: {
    january: 'Январь',
    february: 'Февраль',
    march: 'Март',
    april: 'Апрель',
    may: 'Май',
    june: 'Июнь',
    july: 'Июль',
    august: 'Август',
    september: 'Сентябрь',
    october: 'Октябрь',
    november: 'Ноябрь',
    december: 'Декабрь',
  },

  // ── Отчёт по ЗП: список сотрудников (/reports/payroll) ──────────────────
  report: {
    heading: 'Финансы и ЗП',
    // fmt: {month} — подпись месяца «Июнь 2026».
    subtitle:
      'Начислено, премии и выплаты за {month}. «К выплате» — общий накопленный долг за всё время.',
    summaryReport: 'Сводный отчёт',
    configureRates: 'Настроить ставки',

    ratesTitle: 'Ставки',
    rateLawyer: 'юрист',
    rateExpert: 'эксперт',

    emptyTitle: 'Пока нет данных по зарплате',
    emptyHint: 'Начисления появятся, когда по делам поступят оплаты.',

    colEmployee: 'Сотрудник',
    colEarnedMonth: 'Начислено за месяц',
    colBonusMonth: 'Премии за месяц',
    colPaidMonth: 'Выплачено за месяц',
    colBalanceTotal: 'К выплате (всего)',

    totalEarnedMonth: 'начислено за месяц',
    totalPaidMonth: 'выплачено за месяц',
    totalBalanceTotal: 'к выплате всего',
  },

  // ── Карточка сотрудника (/reports/payroll/[userId]) ─────────────────────
  employee: {
    backToAll: 'Ко всем сотрудникам',
    // fmt: {count} — число дел (роль).
    rolesLawyer: 'юрист — {count}',
    rolesExpert: 'эксперт — {count}',
    rolesSuffix: 'дел',
    buildReport: 'Сформировать отчёт',

    toPayNow: 'К выплате сейчас',
    // fmt: {cases} {bonus} — суммы (форматируются кодом).
    toPayBreakdown: 'всего · дела {cases} ₴ · премии {bonus} ₴',

    earnedMonth: 'Заработано за месяц',
    bonusMonth: 'Премии за месяц',
    paidMonth: 'Выплачено за месяц',
    // fmt: {cases} {bonus} — суммы.
    paidMonthCaption: 'дела {cases} · премии {bonus}',

    // Дела
    // fmt: {month} — подпись месяца.
    casesTitle: 'Заработок по делам — {month}',
    casesCount: { one: '{n} дело', few: '{n} дела', many: '{n} дел' },
    // fmt: {month} — подпись месяца.
    casesEmpty: 'За {month} оплат по делам не было — начислений нет.',

    colCase: 'Дело',
    colStage: 'Этап',
    colRole: 'Роль',
    colEarned: 'Заработано',
    colPayout: 'Выплата',
    colRemaining: 'Осталось',

    // fmt: {percent} {paid} — процент и база (суммы).
    earnedFrom: '{percent}% от {paid} ₴',
    statusPaid: 'Выплачено',
    // fmt: {amount} — сумма.
    statusPartial: 'выплачено {amount} ₴',
    statusUnpaid: 'не выплачено',

    // Премии
    // fmt: {month} — подпись месяца.
    bonusesTitle: 'Премии — {month}',
    bonusAccrued: 'начислено',
    bonusPaid: 'выплачено',
    bonusRemaining: 'осталось',
    // fmt: {month} — подпись месяца.
    bonusesEmpty:
      'За {month} премий нет. Кнопка «Премия» — начислить бонус сверх заработка по делам.',
    badgePaid: 'выплачено',
    // fmt: {paid} {amount} — суммы.
    badgePartial: 'выплачено {paid} из {amount} ₴',
    badgeUnpaid: 'не выплачено',
    // fmt: {amount} — сумма.
    bonusLabel: 'Премия {amount} ₴',

    // История выплат
    // fmt: {month} — подпись месяца.
    payoutsTitle: 'Выплаты — {month}',
    // fmt: {month} — подпись месяца.
    payoutsEmpty:
      'За {month} выплат не было. Кнопка «Выплата» — отметить, что выдали сотруднику (за дела и/или премии).',
    payoutBonusChip: 'премии',
    // fmt: {amount} — сумма.
    payoutLabel: 'Выплата {amount} ₴',

    fallbackName: 'Сотрудник',
  },

  // ── Настройка ставок (/settings/payroll) ────────────────────────────────
  settings: {
    backToPayroll: 'К зарплате',
    lawyerPercent: 'Юрист, %',
    expertPercent: 'Эксперт, %',
    // fmt: {category} — название категории дела.
    lawyerRateAria: '{category} — ставка юриста, %',
    expertRateAria: '{category} — ставка эксперта, %',
    saveRates: 'Сохранить ставки',
    saving: 'Сохранение…',
    // Server action updatePayrollRatesAction
    ratesSaved: 'Ставки сохранены.',
    percentRange: 'Процент — число от 0 до 100',
    // fmt: {field} — имя поля формы.
    fieldMissing: 'Поле {field} отсутствует',
    // fmt: {category} {error} — категория и текст ошибки.
    lawyerError: 'Юрист, «{category}»: {error}',
    expertError: 'Эксперт, «{category}»: {error}',
  },

  // ── Блок «Выплаты команде» в карточке дела ──────────────────────────────
  ledger: {
    labelShort: 'Выплаты:',
    title: 'Выплаты команде',
    // fmt: {date} — дата.
    paidOn: 'выплачено {date}',
    accruedOn: 'начислено {date}',
    revert: 'Откатить',
    markPaid: 'Выплачено',
  },

  // ── Переключатель месяца ────────────────────────────────────────────────
  monthPicker: {
    prev: 'Предыдущий месяц',
    next: 'Следующий месяц',
  },

  // ── Модалки выплаты и премии (payroll-actions) ──────────────────────────
  actions: {
    bonusButton: 'Премия',
    payoutButton: 'Выплата',
    deleteAria: 'Удалить',
    // fmt: {label} — подпись движения.
    deleteConfirm: 'Удалить «{label}»? Действие необратимо.',
    closeAria: 'Закрыть',

    // Модалка выплаты
    payoutTitle: 'Выплата',
    // fmt: {name} — имя сотрудника.
    payoutSubtitle: '{name} · отметьте, что закрываете',
    nothingToPay: 'Нечего выплачивать — нет невыплаченного заработка и премий.',
    casesToPay: 'Дела к выплате',
    selectAll: 'Выбрать все',
    unselectAll: 'Снять все',
    bonusesHeading: 'Премии',
    unpaidBonuses: 'Невыплаченные премии',
    bonusesAside: 'бонусы мимо дел',
    payoutDate: 'Дата выплаты',
    comment: 'Комментарий',
    payoutCommentPlaceholder: 'Напр.: выплата 15-го за июнь',
    toPay: 'К выплате:',
    cancel: 'Отмена',
    saving: 'Сохранение…',
    savePayout: 'Сохранить выплату',

    // Модалка премии
    bonusTitle: 'Премия',
    // fmt: {name} — имя сотрудника.
    bonusSubtitle: '{name} · бонус сверх заработка по делам',
    amount: 'Сумма, ₴',
    date: 'Дата',
    bonusCommentPlaceholder: 'За что премия (опционально)',
    saveBonus: 'Сохранить премию',
  },

  // ── Server actions: движения зарплаты (createPayout/createBonus и др.) ───
  mutations: {
    noEmployee: 'Не указан сотрудник.',
    badPayoutDate: 'Укажите корректную дату выплаты.',
    badAllocations: 'Не удалось разобрать список дел.',
    nothingSelected: 'Отметьте дела или премию для выплаты (нечего выплачивать).',
    payoutCreateFailed: 'Не удалось создать выплату.',
    payoutSaved: 'Выплата сохранена.',
    badBonusAmount: 'Введите сумму больше 0 (до 2 знаков).',
    bonusOutOfRange: 'Сумма вне допустимого диапазона.',
    bonusSaved: 'Премия сохранена.',
  },
};

export type PayrollMessages = typeof payroll;
