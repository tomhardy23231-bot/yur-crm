import type { AuthMessages } from '../ru/auth';

// Екран входу, сторінка «Немає доступу», бренд-блок, вихід.
export const auth: AuthMessages = {
  brand: 'ЮрКейс',
  brandTagline: 'Legal CRM',

  login: {
    metaTitle: 'Вхід — ЮрКейс',
    headingPrefix: 'Вхід у',
    headingAccent: 'систему',
    subtitle: 'Внутрішній інструмент. Доступ лише для співробітників компанії.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@firm.local',
    passwordLabel: 'Пароль',
    passwordPlaceholder: '••••••••',
    submit: 'Увійти',
    submitting: 'Вхід…',
    showPassword: 'Показати пароль',
    hidePassword: 'Сховати пароль',
    fillBoth: 'Заповніть email і пароль.',
    failed: 'Не вдалося увійти. Перевірте email і пароль.',
    inactive: 'Обліковий запис неактивний. Зверніться до адміністратора.',
    // Брендова панель праворуч (двопанельний логін, ≥ lg)
    panelTitle: 'Справи, клієнти й фінанси — в одній системі',
    panelFeature1: 'Воронка справ і контроль етапів',
    panelFeature2: 'Засідання, строки й календар команди',
    panelFeature3: 'Платежі, каса та зарплата від оплат',
  },

  forbidden: {
    metaTitle: 'Немає доступу — ЮрКейс',
    title: 'Немає доступу',
    message:
      'Ця сторінка недоступна для вашої ролі. Якщо ви вважаєте, що повинні мати доступ — зверніться до власника акаунта.',
    backHome: 'На головну',
  },

  logout: 'Вийти',
};
