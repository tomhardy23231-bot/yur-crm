import type { PaymentsMessages } from '../ru/payments';

// Платежі у справі: блок-список, форма додавання, рядок платежу, server actions.
export const payments: PaymentsMessages = {
  block: {
    heading: 'Платежі',
    count: {
      one: '{n} платіж',
      few: '{n} платежі',
      many: '{n} платежів',
    },
    overpaid: 'переплата +{amount} ₴',
    overpaidTitle: 'Оплачено більше суми договору',
    total: 'разом',
    addPayment: 'Додати платіж',
    emptyCanWrite:
      'Платежів поки немає. Додайте перше надходження — сума автоматично оновить «Оплачено» і «Борг» у справі.',
    empty: 'Платежів за цією справою поки немає.',
  },

  addDialog: {
    trigger: 'Додати платіж',
    title: 'Новий платіж',
    subtitle: 'Сума автоматично оновить «Оплачено» і «Борг» у справі.',
    close: 'Закрити',
  },

  form: {
    amountLabel: 'Сума, ₴',
    amountPlaceholder: '0.00',
    paidAtLabel: 'Дата оплати',
    methodLabel: 'Метод',
    methodPlaceholder: 'Готівка / Безготівка / Картка',
    noteLabel: 'Коментар',
    notePlaceholder: 'Необов’язково',
    saved: 'Платіж збережено.',
    submit: 'Додати платіж',
    submitting: 'Збереження…',
    amountInvalid: 'Введіть суму більше 0 (до 2 знаків після коми).',
  },

  row: {
    deleteLabel: 'Видалити платіж',
  },

  // Графік платежів (v3 Сесія 9): планові доплати у справі.
  plan: {
    heading: 'Графік платежів',
    navLabel: 'Графік',
    count: {
      one: '{n} позиція',
      few: '{n} позиції',
      many: '{n} позицій',
    },
    addSummary: 'Додати планову доплату',
    empty: 'Планових доплат поки немає. Додайте позиції — система позначить прострочені.',
    emptyReadonly: 'Планових доплат за цією справою немає.',
    covered: 'Покрито {covered} з {total} ₴',
    coveredPartial: 'покрито {covered} ₴',
    colDate: 'Дата',
    colAmount: 'Сума',
    colStatus: 'Статус',
    colNote: 'Примітка',
    statusPaid: 'Оплачено',
    statusPending: 'Очікує',
    statusOverdue: 'Прострочено',
    dueDateLabel: 'Дата доплати',
    amountLabel: 'Сума, ₴',
    noteLabel: 'Примітка',
    notePlaceholder: 'Необов’язково',
    submit: 'Додати',
    submitting: 'Збереження…',
    success: 'Позицію додано.',
    saveFailed: 'Не вдалося зберегти позицію.',
    delete: 'Видалити',
    deleteConfirm: 'Видалити цю позицію графіка? Дію не можна скасувати.',
  },

  errors: {
    caseRequired: 'Не вказано справу',
    caseInvalid: 'Некоректний ідентифікатор справи',
    amountRequired: 'Вкажіть суму',
    amountInvalid: 'Сума має бути більше 0, до 2 знаків після коми',
    dateRequired: 'Вкажіть дату',
    dateInvalid: 'Некоректна дата',
    methodTooLong: 'Занадто довго (макс 80)',
    noteTooLong: 'Занадто довго (макс 500)',
    saveFailed: 'Не вдалося зберегти платіж.',
  },
};
