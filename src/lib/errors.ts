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

// Локализуемые сообщения для маппинга кодов БД. Передаются из словаря
// (t.errors.db). Дефолт — русский, для обратной совместимости с ещё не
// переведёнными вызовами.
export type DbErrorStrings = {
  generic: string;
  noPermission: string;
  duplicate: string;
  hasRelated: string;
  checkData: string;
  requiredFields: string;
};

const RU_DB_ERRORS: DbErrorStrings = {
  generic: 'Не удалось сохранить. Попробуйте ещё раз.',
  noPermission: 'Недостаточно прав для этого действия.',
  duplicate: 'Такая запись уже существует.',
  hasRelated: 'Действие невозможно: есть связанные записи.',
  checkData: 'Проверьте корректность введённых данных.',
  requiredFields: 'Заполните все обязательные поля.',
};

// Запасные сообщения по умолчанию (back-compat для прямых импортов).
export const GENERIC_SAVE_ERROR = RU_DB_ERRORS.generic;
export const NO_PERMISSION_ERROR = RU_DB_ERRORS.noPermission;

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
  fallback?: string,
  strings: DbErrorStrings = RU_DB_ERRORS,
): string {
  const fb = fallback ?? strings.generic;
  if (!error) return fb;
  const code = (error.code ?? '').toString();
  const msg = (error.message ?? '').toLowerCase();

  if (
    code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('violates row-level security') ||
    msg.includes('permission denied')
  ) {
    return strings.noPermission;
  }
  if (code === '23505') return strings.duplicate;
  if (code === '23503') return strings.hasRelated;
  if (code === '23514') return strings.checkData;
  if (code === '23502') return strings.requiredFields;

  return fb;
}

// Логирует технические детали на сервере и возвращает дружелюбное сообщение.
// scope — короткая метка места (например 'createClientAction') для отладки.
// strings — локализованные тексты (t.errors.db); по умолчанию русский.
export function dbErrorMessage(
  scope: string,
  error: DbErrorLike,
  fallback?: string,
  strings: DbErrorStrings = RU_DB_ERRORS,
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
  return toUserMessage(error, fallback, strings);
}
