// Платежи по делу: блок-список, форма добавления, строка платежа, server actions.

export const payments = {
  // Блок «Платежи» на карточке дела
  block: {
    heading: 'Платежи',
    // Множественное число для счётчика платежей.
    count: {
      one: '{n} платёж',
      few: '{n} платежа',
      many: '{n} платежей',
    },
    overpaid: 'переплата +{amount} ₴',
    overpaidTitle: 'Оплачено больше суммы договора',
    total: 'итого',
    addPayment: 'Добавить платёж',
    emptyCanWrite:
      'Платежей пока нет. Добавьте первое поступление — сумма автоматически обновит «Оплачено» и «Долг» по делу.',
    empty: 'Платежей по этому делу пока нет.',
  },

  // Форма добавления платежа
  form: {
    amountLabel: 'Сумма, ₴',
    amountPlaceholder: '0.00',
    paidAtLabel: 'Дата оплаты',
    methodLabel: 'Метод',
    methodPlaceholder: 'Наличные / Безнал / Карта',
    noteLabel: 'Комментарий',
    notePlaceholder: 'Опционально',
    saved: 'Платёж сохранён.',
    submit: 'Добавить платёж',
    submitting: 'Сохранение…',
    // Клиентская валидация суммы (до обращения к серверу).
    amountInvalid: 'Введите сумму больше 0 (до 2 знаков после запятой).',
  },

  // Строка платежа
  row: {
    deleteLabel: 'Удалить платёж',
  },

  // Серверный экшен createPaymentAction — валидация и ошибки
  errors: {
    caseRequired: 'Не указано дело',
    caseInvalid: 'Некорректный идентификатор дела',
    amountRequired: 'Укажите сумму',
    amountInvalid: 'Сумма должна быть больше 0, до 2 знаков после запятой',
    dateRequired: 'Укажите дату',
    dateInvalid: 'Некорректная дата',
    methodTooLong: 'Слишком длинно (макс 80)',
    noteTooLong: 'Слишком длинно (макс 500)',
    saveFailed: 'Не удалось сохранить платёж.',
  },
};

export type PaymentsMessages = typeof payments;
