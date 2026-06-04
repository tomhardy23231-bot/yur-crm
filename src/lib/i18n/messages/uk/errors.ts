import type { ErrorsMessages } from '../ru/errors';

// Універсальні повідомлення про помилки/збої.
export const errors: ErrorsMessages = {
  serviceUnavailable: 'Сервіс тимчасово недоступний. Спробуйте пізніше.',
  tryAgain: 'Спробуйте ще раз.',
  somethingWrong: 'Щось пішло не так. Спробуйте ще раз.',
  checkForm: 'Перевірте поля форми',
  notFound: 'Не знайдено',
  noAccess: 'Недостатньо прав для цієї дії.',

  db: {
    generic: 'Не вдалося зберегти. Спробуйте ще раз.',
    noPermission: 'Недостатньо прав для цієї дії.',
    duplicate: 'Такий запис уже існує.',
    hasRelated: 'Дія неможлива: є пов’язані записи.',
    checkData: 'Перевірте коректність введених даних.',
    requiredFields: 'Заповніть усі обов’язкові поля.',
  },
};
