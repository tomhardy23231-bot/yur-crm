import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ABSOLUTE_TTL_S,
  RENEW_AFTER_S,
  SLIDING_TTL_S,
  issueSessionToken,
  shouldRenewSession,
  verifySessionToken,
  type SessionClaims,
} from '@/lib/auth/session';

// Скользящий JWT (цикл v4, план §4.2, ревью V2): матрица из плана —
// выпуск/проверка, продление, потолок 90 дней, pwd_version в клеймах,
// чужая подпись/битый токен → null (fail-closed).

const SECRET = 'unit-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const USER = {
  sub: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b',
  email: 'owner@yur.local',
  pwdVersion: 3,
};

const DAY_S = 24 * 60 * 60;

describe('session (скользящий JWT)', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AUTH_SECRET;
  });

  function nowS(): number {
    return Math.floor(Date.now() / 1000);
  }

  it('roundtrip: выпуск → проверка, клеймы на месте, lat = момент входа', async () => {
    const issuedAt = nowS();
    const token = await issueSessionToken(USER);
    const claims = await verifySessionToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe(USER.sub);
    expect(claims!.email).toBe(USER.email);
    expect(claims!.pwd_version).toBe(USER.pwdVersion);
    expect(claims!.iat).toBe(issuedAt);
    expect(claims!.lat).toBe(issuedAt); // первичный вход = сейчас
  });

  it('продление сохраняет переданный lat (первичный вход не двигается)', async () => {
    const originalLogin = nowS() - 10 * DAY_S;
    const token = await issueSessionToken({ ...USER, lat: originalLogin });
    const claims = await verifySessionToken(token);
    expect(claims!.lat).toBe(originalLogin);
    expect(claims!.iat).toBe(nowS());
  });

  it('битый токен → null', async () => {
    expect(await verifySessionToken('garbage.token.here')).toBeNull();
    const token = await issueSessionToken(USER);
    expect(await verifySessionToken(token.slice(0, -4) + 'AAAA')).toBeNull();
  });

  it('подпись чужим секретом → null', async () => {
    const token = await issueSessionToken(USER);
    process.env.AUTH_SECRET = 'another-secret-0123456789abcdefghijklmnop';
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('без AUTH_SECRET: выпуск кидает, проверка возвращает null', async () => {
    delete process.env.AUTH_SECRET;
    await expect(issueSessionToken(USER)).rejects.toThrow(/AUTH_SECRET/);
    expect(await verifySessionToken('whatever')).toBeNull();
  });

  it('токен истекает через 30 дней бездействия (exp)', async () => {
    const token = await issueSessionToken(USER);
    vi.setSystemTime(new Date(Date.now() + (SLIDING_TTL_S - 60) * 1000));
    expect(await verifySessionToken(token)).not.toBeNull();
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000 + 60_000));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('потолок 90 дней от ПЕРВИЧНОГО входа: свежий iat не спасает', async () => {
    // Токен перевыпущен только что, но первичный вход был 91 день назад.
    const token = await issueSessionToken({
      ...USER,
      lat: nowS() - (ABSOLUTE_TTL_S + DAY_S),
    });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('внутри потолка (89 дней) токен валиден', async () => {
    const token = await issueSessionToken({
      ...USER,
      lat: nowS() - (ABSOLUTE_TTL_S - DAY_S),
    });
    expect(await verifySessionToken(token)).not.toBeNull();
  });

  describe('shouldRenewSession', () => {
    function claims(overrides: Partial<SessionClaims>): SessionClaims {
      const now = nowS();
      return {
        sub: USER.sub,
        email: USER.email,
        pwd_version: USER.pwdVersion,
        iat: now,
        lat: now,
        ...overrides,
      };
    }

    it('свежий токен (моложе суток) — не продлеваем', () => {
      expect(shouldRenewSession(claims({ iat: nowS() - RENEW_AFTER_S + 60 }))).toBe(
        false,
      );
    });

    it('токену больше суток — продлеваем', () => {
      expect(
        shouldRenewSession(
          claims({ iat: nowS() - RENEW_AFTER_S - 60, lat: nowS() - 5 * DAY_S }),
        ),
      ).toBe(true);
    });

    it('за потолком 90 дней — НЕ продлеваем (пусть умирает)', () => {
      expect(
        shouldRenewSession(
          claims({
            iat: nowS() - 2 * DAY_S,
            lat: nowS() - (ABSOLUTE_TTL_S + DAY_S),
          }),
        ),
      ).toBe(false);
    });
  });
});
