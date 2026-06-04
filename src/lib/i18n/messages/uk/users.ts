import type { UsersMessages } from '../ru/users';

// Управління користувачами, ролями та персональними правами доступу
// (екран /settings/users + форми створення/редагування + server actions).
export const users: UsersMessages = {
  heading: 'Користувачі та ролі',
  introOwner: 'Створюйте співробітників, призначайте ролі та персональні права.',
  introManager:
    'Ви можете заводити та змінювати ролі офіс-менеджерів, юристів та експертів, а також їхні персональні права. Власників та адміністраторів змінює лише власник.',

  table: {
    colUser: 'Співробітник',
    colRole: 'Роль',
    colStatus: 'Статус',
    colPerms: 'Права',
    colAction: 'Дія',
    statusActive: 'Активний',
    statusInactive: 'Деактивований',
    totalLabel: 'Усього співробітників',
  },

  footnote:
    'Деактивація не видаляє дані: співробітник втрачає доступ, але його справи, платежі та нарахування зберігаються. Роль та персональні права змінюються за правилами доступу — адміністратор не керує власниками та адмінами.',

  create: {
    nameLabel: 'Ім’я',
    namePlaceholder: 'Іван Петров',
    emailLabel: 'Email',
    emailPlaceholder: 'user@company.ru',
    roleLabel: 'Роль',
    rolePlaceholder: '— оберіть —',
    submit: 'Додати користувача',
    submitting: 'Створення…',
    successTitle: 'Користувача створено.',
    successHint: 'Передайте співробітнику дані для входу (показані один раз):',
    tempPasswordLabel: 'Тимчасовий пароль:',
    changeHint: 'Попросіть змінити пароль під час першого входу.',
  },

  perms: {
    sectionToggle: 'Персональні права (необов’язково)',
    createHint:
      'За замовчуванням права успадковуються від ролі. Тут можна точково дозволити або заборонити окремі дії.',
    editIntroPrefix: 'Персональні права для',
    editIntroSuffix: '. «Успадковує» — як у ролі за замовчуванням.',
    button: 'Права',
    buttonCount: 'Права ({n})',
    noneEditable: 'Для цієї ролі немає прав, які ви можете налаштувати.',
    inherit: 'Успадковує ({state})',
    stateAllowed: 'дозволено',
    stateDenied: 'заборонено',
    grant: 'Дозволено',
    revoke: 'Заборонено',
  },

  row: {
    roleSelectAria: 'Роль користувача',
    reactivateFirst: 'Спочатку реактивуйте співробітника, щоб змінити роль',
    self: 'це ви',
    deactivate: 'Деактивувати',
    reactivate: 'Реактивувати',
  },

  errors: {
    noManageUsers: 'Недостатньо прав для управління користувачами.',
    enterName: 'Вкажіть ім’я',
    nameTooLong: 'Занадто довго (макс 120)',
    enterEmail: 'Вкажіть email',
    invalidEmail: 'Некоректний email',
    selectRole: 'Оберіть роль',
    invalidRole: 'Некоректна роль',
    noPermsForRole: 'Недостатньо прав для створення ролі «{role}».',
    emailExists: 'Користувач із таким email вже існує',
    createFailed: 'Не вдалося створити користувача. Спробуйте ще раз.',
    saveProfileFailed: 'Не вдалося зберегти профіль користувача.',
  },
};
