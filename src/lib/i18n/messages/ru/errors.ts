// Универсальные сообщения об ошибках/сбоях, общие для server actions и форм.

export const errors = {
  serviceUnavailable: 'Сервис временно недоступен. Попробуйте позже.',
  tryAgain: 'Попробуйте ещё раз.',
  somethingWrong: 'Что-то пошло не так. Попробуйте ещё раз.',
  checkForm: 'Проверьте поля формы',
  notFound: 'Не найдено',
  noAccess: 'Недостаточно прав для этого действия.',

  // Маппинг ошибок БД (передаётся в dbErrorMessage/toUserMessage как strings).
  db: {
    generic: 'Не удалось сохранить. Попробуйте ещё раз.',
    noPermission: 'Недостаточно прав для этого действия.',
    duplicate: 'Такая запись уже существует.',
    hasRelated: 'Действие невозможно: есть связанные записи.',
    checkData: 'Проверьте корректность введённых данных.',
    requiredFields: 'Заполните все обязательные поля.',
  },
};

export type ErrorsMessages = typeof errors;
