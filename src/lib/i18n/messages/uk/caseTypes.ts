import type { CaseTypesMessages } from '../ru/caseTypes';

// Керування довідником типів справ (екран /settings/case-types).
export const caseTypes: CaseTypesMessages = {
  heading: 'Типи справ',
  intro:
    'Класифікація справ (цивільна, кримінальна, військова, пенсійна…). Тип обирають у формі справи і за ним фільтрують списки; на зарплату він не впливає.',

  create: {
    nameLabel: 'Назва типу',
    namePlaceholder: 'Наприклад, Військова',
    submit: 'Додати тип',
    submitting: 'Створення…',
  },
  created: 'Тип справи додано.',

  list: {
    statusActive: 'Активний',
    statusInactive: 'Прихований',
    builtinBadge: 'Вбудований',
    empty: 'Типів справ поки немає.',
    hint: 'Прихований тип зникає з вибору при створенні справ, але в заведених справах зберігається. Вбудовані типи можна приховати, але не перейменувати.',
  },

  rename: {
    ariaLabel: 'Назва типу',
    save: 'Зберегти',
    title: 'Перейменувати',
  },

  deactivate: 'Приховати',
  activate: 'Повернути',

  errors: {
    enterName: 'Вкажіть назву',
    nameTooLong: 'Занадто довго (макс 60)',
    nameTaken: 'Тип з такою назвою вже є',
  },
};
