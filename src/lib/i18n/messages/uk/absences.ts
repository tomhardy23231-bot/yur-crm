// Відпустки / відсутності (v2 Етап 6): блок на картці співробітника, форма
// додавання, підписи для спільного календаря, серверні екшени.

export const absences = {
  block: {
    heading: 'Відпустки та відсутності',
    count: {
      one: '{n} запис',
      few: '{n} записи',
      many: '{n} записів',
    },
    empty: 'Відсутностей поки немає.',
    emptyManage: 'Відсутностей поки немає. Додайте відпустку, лікарняний або іншу відсутність.',
    add: 'Додати відсутність',
    period: '{from} — {to}',
    current: 'Зараз',
    upcoming: 'Попереду',
    past: 'Завершено',
    days: {
      one: '{n} день',
      few: '{n} дні',
      many: '{n} днів',
    },
    delete: 'Видалити',
    deleteConfirm: 'Видалити цей запис про відсутність?',
  },

  create: {
    kindLabel: 'Тип',
    startLabel: 'З',
    endLabel: 'По',
    noteLabel: 'Коментар',
    notePlaceholder: 'необов’язково',
    submit: 'Додати',
    submitting: 'Додавання…',
    success: 'Відсутність додано.',
  },

  calendar: {
    legend: 'Відсутності',
    dayHeading: 'Відсутності',
  },

  actions: {
    userInvalid: 'Некоректний співробітник',
    kindInvalid: 'Оберіть тип відсутності',
    dateRequired: 'Вкажіть дату',
    dateInvalid: 'Некоректна дата',
    rangeInvalid: 'Дата завершення раніше за дату початку',
    noteTooLong: 'Занадто довгий коментар (макс 500)',
    checkForm: 'Перевірте поля форми',
    noWritePermission:
      'Вносити відсутності може сам співробітник, адміністратор його підрозділу або власник.',
    createFailed: 'Не вдалося додати відсутність. Спробуйте ще раз.',
  },
};

export type AbsencesMessages = typeof absences;
