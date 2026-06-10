// Реквизиты компании-исполнителя (ВИКОНАВЕЦЬ) для печатной формы акта.
// Экран /settings/requisites (owner). ru — эталон.

export const requisites = {
  title: 'Реквизиты компании',
  subtitle: 'Используются в шапке и подвале печатной формы «Рахунок-Акт».',
  backToSettings: 'К настройкам',

  fields: {
    orgName: 'Наименование (ВИКОНАВЕЦЬ)',
    edrpou: 'ЄДРПОУ',
    address: 'Адрес',
    phone: 'Телефон',
    iban: 'IBAN (П/р)',
    bankName: 'Банк',
    mfo: 'МФО',
    taxStatus: 'Налоговый статус',
    taxStatusHint: 'По одной строке. Напр.: «Не є платником ПДВ», «Є платником єдиного податку, 3 група».',
  },

  save: 'Сохранить',
  saving: 'Сохранение…',
  success: 'Реквизиты сохранены.',

  actions: {
    noPermission: 'Менять реквизиты компании может только владелец.',
    orgNameRequired: 'Укажите наименование компании',
    tooLong: 'Слишком длинное значение',
    saveFailed: 'Не удалось сохранить реквизиты. Попробуйте ещё раз.',
  },
};

export type RequisitesMessages = typeof requisites;
