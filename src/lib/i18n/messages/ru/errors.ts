// Универсальные сообщения об ошибках/сбоях, общие для server actions и форм.

export const errors = {
  serviceUnavailable: 'Сервис временно недоступен. Попробуйте позже.',
  tryAgain: 'Попробуйте ещё раз.',
  somethingWrong: 'Что-то пошло не так. Попробуйте ещё раз.',
  checkForm: 'Проверьте поля формы',
  notFound: 'Не найдено',
  noAccess: 'Недостаточно прав для этого действия.',

  // Error-границы и 404 (Сессия 5: global-error / (app)/error.tsx / not-found).
  boundaryTitle: 'Что-то пошло не так',
  boundaryText:
    'Произошла ошибка при загрузке страницы. Можно попробовать снова или вернуться на главную.',
  boundaryRetry: 'Попробовать снова',
  boundaryHome: 'На главную',
  notFoundTitle: 'Страница не найдена',
  notFoundText: 'Возможно, ссылка устарела или страница была перемещена.',

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
