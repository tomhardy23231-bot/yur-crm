// Сборка словарей обоих языков. ru — эталон формы (Messages = typeof ru);
// uk типизирован как Messages, поэтому TypeScript требует совпадения всех
// ключей — недопереведённый ключ = ошибка компиляции, а не «дыра» в UI.

import { ru } from './ru';
import { uk } from './uk';

import type { Locale } from '../config';

export type Messages = typeof ru;

export function getMessages(locale: Locale): Messages {
  return locale === 'ru' ? ru : uk;
}

export { ru, uk };
