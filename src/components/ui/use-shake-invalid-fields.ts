'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Трясёт все поля с `aria-invalid="true"` внутри формы при каждом изменении
 * `signal`. Передавай объект состояния из `useActionState` как `signal`: он
 * получает НОВУЮ ссылку на каждый сабмит, поэтому повторная отправка с той же
 * ошибкой тоже перезапускает тряску.
 *
 * Цвет бордера при ошибке задаётся отдельно через `aria-invalid:border-error`
 * (см. `input.tsx`) — этот хук owns только «тряску» (transform).
 *
 * Уважает `prefers-reduced-motion` (класс `.shake` обнулён в globals.css).
 */
export function useShakeInvalidFields(
  formRef: RefObject<HTMLFormElement | null>,
  signal: unknown,
): void {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const invalid = form.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
    invalid.forEach((el) => {
      el.classList.remove('shake');
      // Принудительный reflow — иначе один и тот же класс не перезапустит анимацию.
      void el.offsetWidth;
      el.classList.add('shake');
    });
  }, [formRef, signal]);
}
