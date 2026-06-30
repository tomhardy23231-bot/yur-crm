import 'server-only';

// Короткий читаемый временный пароль для нового сотрудника.
// Алфавит без неоднозначных символов (нет 0/o, 1/l/i) — удобно продиктовать.
// 6 символов проходят минимум Supabase (password_min_length=6). Сотрудник
// при желании меняет пароль сам в профиле.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
