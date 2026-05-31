// Юр CRM — Задача 3: дружелюбные сообщения об ошибках вместо сырых ошибок БД/RLS.
//
// Пользователю нельзя показывать технические детали Postgres/PostgREST вроде
// «new row violates row-level security policy for table "clients"» — это пугает и
// неинформативно. Здесь сопоставляем коды/тексты ошибок с понятными русскими
// сообщениями. Технические детали логируются на сервере (toUserMessage → console),
// в UI уходит только дружелюбный текст.
//
// Используется в server actions: вместо `message: error.message` ставим
// `message: dbErrorMessage('scope', error, 'запасной текст')`.

export type DbErrorLike =
  | { code?: string | null; message?: string | null; details?: string | null }
  | null
  | undefined;

// Запасные сообщения по умолчанию.
export const GENERIC_SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.';
export const NO_PERMISSION_ERROR = 'Недостаточно прав для этого действия.';

// Сопоставляет ошибку БД с дружелюбным сообщением (без логирования).
// PostgREST/Postgres SQLSTATE:
//   42501 — insufficient_privilege (часто RLS deny на запись);
//   23505 — unique_violation;
//   23503 — foreign_key_violation;
//   23514 — check_violation;
//   23502 — not_null_violation;
//   P0001 — наши raise (stage_*) — их подменяют на местах вызова, здесь общий текст.
export function toUserMessage(
  error: DbErrorLike,
  fallback: string = GENERIC_SAVE_ERROR,
): string {
  if (!error) return fallback;
  const code = (error.code ?? '').toString();
  const msg = (error.message ?? '').toLowerCase();

  if (
    code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('violates row-level security') ||
    msg.includes('permission denied')
  ) {
    return NO_PERMISSION_ERROR;
  }
  if (code === '23505') return 'Такая запись уже существует.';
  if (code === '23503') {
    return 'Действие невозможно: есть связанные записи.';
  }
  if (code === '23514') return 'Проверьте корректность введённых данных.';
  if (code === '23502') return 'Заполните все обязательные поля.';

  return fallback;
}

// Логирует технические детали на сервере и возвращает дружелюбное сообщение.
// scope — короткая метка места (например 'createClientAction') для отладки.
export function dbErrorMessage(
  scope: string,
  error: DbErrorLike,
  fallback: string = GENERIC_SAVE_ERROR,
): string {
  if (error) {
    // Технические детали — только в серверный лог, не в UI.
    console.error(
      `[${scope}]`,
      (error.code ?? '').toString(),
      error.message ?? '',
      error.details ?? '',
    );
  }
  return toUserMessage(error, fallback);
}
