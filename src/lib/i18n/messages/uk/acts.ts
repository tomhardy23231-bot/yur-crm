import type { ActsMessages } from '../ru/acts';

// Акти (Рахунок-Акт) на картці справи. uk — дзеркало еталонного словника.
export const acts: ActsMessages = {
  block: {
    heading: 'Акти',
    count: {
      one: '{n} акт',
      few: '{n} акти',
      many: '{n} актів',
    },
    createSummary: 'Виписати акт',
    empty:
      'Актів за цією справою поки немає. Випишіть «Рахунок-Акт», видайте клієнту, потім підтвердьте оплату — платіж за справою створиться автоматично.',
    emptyReadonly: 'Актів за цією справою поки немає.',
    number: 'Рахунок-Акт №{n}',
    issuedAt: 'видано {date}',
    paidAt: 'оплачено {date}',
    amount: 'Сума',
    confirmedAmount: 'Оплачено',
    scan: 'Скан',
    download: 'Завантажити XLSX',
    confirmPaid: 'Підтвердити оплату',
    delete: 'Видалити акт',
    deleteConfirm: 'Видалити неоплачений акт?',
    requisitesWarning:
      'Реквізити компанії не заповнені — друкована форма буде неповною. Заповніть їх у Налаштуваннях → Реквізити компанії.',
  },

  create: {
    serviceNameLabel: 'Послуга',
    serviceNamePlaceholder: 'Юридичні послуги',
    amountLabel: 'Сума, ₴',
    servicePeriodLabel: 'Період послуг',
    servicePeriodPlaceholder: 'необов’язково',
    noteLabel: 'Примітка',
    notePlaceholder: 'необов’язково',
    submit: 'Виписати',
    submitting: 'Створення…',
    success: 'Акт виписано.',
  },

  confirm: {
    summary: 'Підтвердити оплату',
    amountLabel: 'Оплачена сума, ₴',
    paidAtLabel: 'Дата оплати',
    scanLabel: 'Скан з підписом / печаткою',
    hint: 'Скан обов’язковий. Після підтвердження за справою створиться платіж на оплачену суму, перерахується борг і зарплата.',
    submit: 'Підтвердити',
    submitting: 'Підтвердження…',
    success: 'Оплату підтверджено, платіж створено.',
  },

  completion: {
    label: 'Позначка виконання',
    save: 'Зберегти',
    saving: 'Збереження…',
    success: 'Позначку оновлено.',
  },

  actions: {
    caseRequired: 'Не вказано справу',
    caseInvalid: 'Некоректний ідентифікатор справи',
    actRequired: 'Не вказано акт',
    actInvalid: 'Некоректний ідентифікатор акта',
    amountRequired: 'Вкажіть суму',
    amountInvalid: 'Некоректна сума',
    serviceNameRequired: 'Вкажіть послугу',
    serviceNameTooLong: 'Надто довга назва (макс 200)',
    periodTooLong: 'Надто довгий період (макс 120)',
    noteTooLong: 'Надто довга примітка (макс 500)',
    dateRequired: 'Вкажіть дату',
    dateInvalid: 'Некоректна дата',
    scanRequired: 'Додайте скан підтвердження',
    completionInvalid: 'Недопустима позначка',
    checkForm: 'Перевірте поля форми',
    noCreatePermission: 'Виписувати акти можуть експерт за своєю справою та співробітники з доступом до справи.',
    noConfirmPermission: 'Підтвердити оплату можуть юрист цієї справи, адміністратор або власник.',
    alreadyPaid: 'Цей акт уже оплачено.',
    createFailed: 'Не вдалося виписати акт. Спробуйте ще раз.',
    confirmFailed: 'Не вдалося підтвердити оплату. Спробуйте ще раз.',
    scanUploadFailed: 'Не вдалося завантажити скан.',
  },
};
