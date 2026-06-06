import { describe, it, expect } from 'vitest';
import { toUserMessage, type DbErrorStrings } from '@/lib/errors';

// Маппинг ошибок БД/RLS → дружелюбный русский текст. Критично: технический
// текст Postgres («row-level security policy…») не должен утечь в UI.

describe('toUserMessage', () => {
  it('нет ошибки → запасной текст', () => {
    expect(toUserMessage(null, 'ок')).toBe('ок');
    expect(toUserMessage(undefined, 'ок')).toBe('ок');
  });

  it('42501 (RLS deny) → «Недостаточно прав…»', () => {
    expect(toUserMessage({ code: '42501' })).toBe('Недостаточно прав для этого действия.');
  });

  it('текст про row-level security → «Недостаточно прав…» (без кода)', () => {
    expect(
      toUserMessage({ message: 'new row violates row-level security policy for table "clients"' }),
    ).toBe('Недостаточно прав для этого действия.');
  });

  it('permission denied → «Недостаточно прав…»', () => {
    expect(toUserMessage({ message: 'permission denied for table cases' })).toBe(
      'Недостаточно прав для этого действия.',
    );
  });

  it('23505 (unique) → «Такая запись уже существует.»', () => {
    expect(toUserMessage({ code: '23505' })).toBe('Такая запись уже существует.');
  });

  it('23503 (FK) → «есть связанные записи.»', () => {
    expect(toUserMessage({ code: '23503' })).toBe('Действие невозможно: есть связанные записи.');
  });

  it('23514 (check) → «Проверьте корректность…»', () => {
    expect(toUserMessage({ code: '23514' })).toBe('Проверьте корректность введённых данных.');
  });

  it('23502 (not null) → «Заполните все обязательные поля.»', () => {
    expect(toUserMessage({ code: '23502' })).toBe('Заполните все обязательные поля.');
  });

  it('неизвестный код → запасной текст, а не дефолтный generic', () => {
    expect(toUserMessage({ code: 'XYZ' }, 'мой фолбэк')).toBe('мой фолбэк');
  });

  it('никогда не возвращает сырой текст Postgres в UI', () => {
    const raw = 'new row violates row-level security policy for table "documents"';
    const msg = toUserMessage({ code: '42501', message: raw });
    expect(msg).not.toContain('row-level security');
    expect(msg).not.toContain('violates');
  });

  it('поддерживает локализованные строки (uk)', () => {
    const uk: DbErrorStrings = {
      generic: 'Не вдалося зберегти.',
      noPermission: 'Недостатньо прав.',
      duplicate: 'Такий запис вже існує.',
      hasRelated: 'Є пов’язані записи.',
      checkData: 'Перевірте дані.',
      requiredFields: 'Заповніть обовʼязкові поля.',
    };
    expect(toUserMessage({ code: '42501' }, undefined, uk)).toBe('Недостатньо прав.');
    expect(toUserMessage({ code: '23505' }, undefined, uk)).toBe('Такий запис вже існує.');
  });
});
