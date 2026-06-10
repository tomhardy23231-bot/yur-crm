import type { RequisitesMessages } from '../ru/requisites';

// Реквізити компанії-виконавця для друкованої форми акта. uk — дзеркало.
export const requisites: RequisitesMessages = {
  title: 'Реквізити компанії',
  subtitle: 'Використовуються в шапці та підвалі друкованої форми «Рахунок-Акт».',
  backToSettings: 'До налаштувань',

  fields: {
    orgName: 'Найменування (ВИКОНАВЕЦЬ)',
    edrpou: 'ЄДРПОУ',
    address: 'Адреса',
    phone: 'Телефон',
    iban: 'IBAN (П/р)',
    bankName: 'Банк',
    mfo: 'МФО',
    taxStatus: 'Податковий статус',
    taxStatusHint: 'По одному рядку. Напр.: «Не є платником ПДВ», «Є платником єдиного податку, 3 група».',
  },

  save: 'Зберегти',
  saving: 'Збереження…',
  success: 'Реквізити збережено.',

  actions: {
    noPermission: 'Змінювати реквізити компанії може лише власник.',
    orgNameRequired: 'Вкажіть найменування компанії',
    tooLong: 'Надто довге значення',
    saveFailed: 'Не вдалося зберегти реквізити. Спробуйте ще раз.',
  },
};
