// Экран входа, страница «Нет доступа», бренд-блок, выход.

export const auth = {
  brand: 'ЮрКейс',
  brandTagline: 'Legal CRM',

  login: {
    metaTitle: 'Вход — ЮрКейс',
    headingPrefix: 'Вход в',
    headingAccent: 'систему',
    subtitle: 'Внутренний инструмент. Доступ только для сотрудников компании.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@firm.local',
    passwordLabel: 'Пароль',
    passwordPlaceholder: '••••••••',
    submit: 'Войти',
    submitting: 'Входим…',
    showPassword: 'Показать пароль',
    hidePassword: 'Скрыть пароль',
    // Ошибки входа
    fillBoth: 'Заполните email и пароль.',
    failed: 'Не удалось войти. Проверьте email и пароль.',
    inactive: 'Учётная запись неактивна. Обратитесь к администратору.',
  },

  forbidden: {
    metaTitle: 'Нет доступа — ЮрКейс',
    title: 'Нет доступа',
    message:
      'Эта страница недоступна для вашей роли. Если вы считаете, что должны иметь доступ — обратитесь к владельцу аккаунта.',
    backHome: 'На главную',
  },

  logout: 'Выйти',
};

export type AuthMessages = typeof auth;
