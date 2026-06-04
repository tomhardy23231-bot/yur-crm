import type { DocumentsMessages } from '../ru/documents';

// Документи у справі: блок на картці справи, рядок документа, форма завантаження,
// серверні екшени (завантаження/видалення).
export const documents: DocumentsMessages = {
  block: {
    heading: 'Документи',
    fileCount: {
      one: '{n} файл',
      few: '{n} файли',
      many: '{n} файлів',
    },
    uploadSummary: 'Завантажити документ',
    emptyCanWrite:
      'Документів поки немає. Завантажте договір, претензію або довіреність — файл буде доступний усім, хто бачить цю справу.',
    emptyReadonly: 'Документів у цій справі поки немає.',
  },

  row: {
    download: 'Завантажити',
    deleteDocument: 'Видалити документ',
  },

  upload: {
    fileLabel: 'Файл',
    docTypeLabel: 'Тип документа',
    success: 'Файл завантажено.',
    sizeHint: 'До 25 МБ. Заборонені виконувані файли (.exe, .bat, .ps1 тощо).',
    submitting: 'Завантаження…',
    submit: 'Завантажити',
  },

  actions: {
    caseRequired: 'Не вказано справу',
    caseInvalid: 'Некоректний ідентифікатор справи',
    docTypeRequired: 'Оберіть тип документа',
    docTypeInvalid: 'Неприпустимий тип',
    fileRequired: 'Оберіть файл',
    fileTooLarge: 'Файл більший за 25 МБ',
    fileNameTooLong: 'Занадто довге ім’я файлу (макс 200)',
    fileForbidden: 'Цей тип файлу завантажувати не можна',
    checkForm: 'Перевірте поля форми',
    uploadFailed: 'Не вдалося завантажити файл.',
    saveFailed: 'Не вдалося зберегти документ. Спробуйте ще раз.',
  },
};
