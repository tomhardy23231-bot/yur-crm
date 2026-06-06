import type { CommentsMessages } from '../ru/comments';

// Коментарі (нотатки) до справи: блок-список, форма додавання, рядок, помилки.
export const comments: CommentsMessages = {
  block: {
    heading: 'Коментарі',
    count: {
      one: '{n} коментар',
      few: '{n} коментарі',
      many: '{n} коментарів',
    },
    emptyCanWrite:
      'Коментарів поки немає. Залиште робочу нотатку — її побачить команда у справі.',
    emptyReadonly: 'Коментарів за цією справою поки немає.',
  },

  form: {
    placeholder: 'Напишіть коментар…',
    submit: 'Додати',
    submitting: 'Збереження…',
  },

  row: {
    deleteAria: 'Видалити коментар',
    unknownAuthor: 'Невідомий автор',
  },

  errors: {
    invalidCase: 'Некоректна справа.',
    empty: 'Введіть текст коментаря.',
    tooLong: 'Занадто довго (макс 5000 символів).',
    createFailed: 'Не вдалося зберегти коментар.',
  },
};
