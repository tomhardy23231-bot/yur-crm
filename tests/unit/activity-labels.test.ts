import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { activity as ruActivity } from '@/lib/i18n/messages/ru/activity';
import { activity as ukActivity } from '@/lib/i18n/messages/uk/activity';

// Страж подписей журнала (2026-08-03).
//
// ЗАЧЕМ. Список действий журнала живёт в БД (CHECK activity_log_action_check), а
// подписи — в словарях i18n. Связи между ними нет, поэтому новое действие в
// миграции легко уезжает на прод без перевода: пользователь видит сырой код
// вроде «дія: expense_created» (так и случилось с книгой операций 0009–0016).
// Тест сверяет allowlist из миграций со словарями и падает раньше прода.

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

/**
 * Все action-коды из CHECK-ограничений журнала. Берём ОБЪЕДИНЕНИЕ по всем
 * миграциям: по конвенции проекта каждая новая миграция повторяет весь прежний
 * allowlist, поэтому объединение не может недобрать (а лишнего в нём не бывает
 * — коды не удаляются).
 */
function allowlistFromMigrations(): string[] {
  const codes = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    let at = sql.indexOf('activity_log_action_check');
    while (at !== -1) {
      const end = sql.indexOf('])))', at);
      if (end === -1) break;
      const block = sql.slice(at, end);
      for (const m of block.matchAll(/'([a-z_]+)'::text/g)) {
        codes.add(m[1]!);
      }
      at = sql.indexOf('activity_log_action_check', end);
    }
  }
  return [...codes].sort();
}

describe('подписи действий журнала', () => {
  const codes = allowlistFromMigrations();

  it('allowlist вычитан из миграций', () => {
    // Защита от «тест зелёный, потому что ничего не нашёл».
    expect(codes.length).toBeGreaterThan(50);
    expect(codes).toContain('case_created');
    expect(codes).toContain('expense_created');
  });

  it('у каждого действия есть русская подпись', () => {
    const map = ruActivity.action as Record<string, string>;
    const missing = codes.filter((c) => !map[c]);
    expect(missing, `нет подписи в ru/activity.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('у каждого действия есть украинская подпись', () => {
    const map = ukActivity.action as Record<string, string>;
    const missing = codes.filter((c) => !map[c]);
    expect(missing, `нет подписи в uk/activity.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('словари не разошлись по набору ключей', () => {
    const ru = Object.keys(ruActivity.action).sort();
    const uk = Object.keys(ukActivity.action).sort();
    expect(uk).toEqual(ru);
  });

  it('подписи непустые', () => {
    const map = ruActivity.action as Record<string, string>;
    const blank = codes.filter((c) => !map[c]?.trim());
    expect(blank).toEqual([]);
  });
});
