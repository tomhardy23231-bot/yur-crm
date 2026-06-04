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
