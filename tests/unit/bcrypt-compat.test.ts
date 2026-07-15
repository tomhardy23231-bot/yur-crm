import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';

// Golden-тест совместимости bcrypt (план v4, гейт сессии 2, риск §6):
// пароли сотрудников ПЕРЕНОСЯТСЯ из GoTrue (auth.users.encrypted_password)
// как есть — все должны войти со старыми паролями после переезда (сессия 7).
//
// GOLDEN_HASH — НАСТОЯЩИЙ хеш, выпущенный GoTrue (локальный Supabase-стек,
// supabase_auth v2, golang.org/x/crypto/bcrypt) для пароля 'test12345!'
// 2026-07-15. Формат $2a$10$ — тот же, что на проде.
// ⚠ До сессии 7 сверить ещё и хеш из СВЕЖЕГО прод-дампа (план: golden-тест
// на реальном прод-хеше) — добавить сюда второй кейс при снятии дампа.

const GOLDEN_PASSWORD = 'test12345!';
const GOLDEN_HASH =
  '$2a$10$4HYQMsFRKfnUCo.88/MyO.mZLXooglSKSa5FcvoqElcMCWO/13Kh2';

describe('bcrypt-совместимость с хешами GoTrue', () => {
  it('верный пароль проходит по перенесённому GoTrue-хешу', async () => {
    expect(await bcrypt.compare(GOLDEN_PASSWORD, GOLDEN_HASH)).toBe(true);
  });

  it('неверный пароль по тому же хешу — отказ', async () => {
    expect(await bcrypt.compare('wrong-password', GOLDEN_HASH)).toBe(false);
    expect(await bcrypt.compare('', GOLDEN_HASH)).toBe(false);
  });

  it('наши новые хеши (bcryptjs, cost 10) — тот же формат $2a/$2b и roundtrip', async () => {
    const hash = await bcrypt.hash(GOLDEN_PASSWORD, 10);
    expect(hash).toMatch(/^\$2[ab]\$10\$/);
    expect(await bcrypt.compare(GOLDEN_PASSWORD, hash)).toBe(true);
  });
});
