// Сессии входа (цикл v4, план §4.2, ревью V2) — «скользящий JWT».
//
// ОДНА httpOnly-кука с JWT (HS256, jose). Проверка подписи ЛОКАЛЬНАЯ
// (микросекунды, без сети и БД) — замена сетевому GoTrue, главному тормозу
// прода. Таблицы сессий НЕТ:
//
//  - продление «скользящее»: токену > 24 ч → proxy молча перевыпускает с тем
//    же lat; перевыпуск идемпотентен, гонки параллельных вкладок безвредны
//    (каждая копия токена валидна сама по себе);
//  - инвалидация — через pwd_version: клейм сравнивается с
//    public.users.pwd_version в getCurrentUser (тем же единственным запросом
//    профиля). Смена/выдача пароля инкрементит колонку → все старые токены
//    мертвы. Деактивация (is_active=false) режет там же;
//  - потолок жизни без перелогина — 90 дней от ПЕРВИЧНОГО входа (клейм lat,
//    продлением не обновляется).
//
// Файл общий для proxy (middleware) и server-кода: без 'server-only' и без
// импортов БД — только jose + process.env.AUTH_SECRET.

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'yur_session';

/** 30 дней бездействия — токен истекает сам (exp). */
export const SLIDING_TTL_S = 30 * 24 * 60 * 60;
/** Перевыпускаем токен не чаще раза в сутки (возраст iat). */
export const RENEW_AFTER_S = 24 * 60 * 60;
/** Абсолютный потолок: 90 дней от первичного входа (lat) — потом перелогин. */
export const ABSOLUTE_TTL_S = 90 * 24 * 60 * 60;

export type SessionClaims = {
  /** auth.users.id = public.users.id */
  sub: string;
  email: string;
  /** сверяется с public.users.pwd_version в getCurrentUser */
  pwd_version: number;
  /** login-at: unix-секунды ПЕРВИЧНОГО входа; продление сохраняет прежний */
  lat: number;
  /** unix-секунды выпуска ТЕКУЩЕГО токена */
  iat: number;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET не задан или короче 32 символов (см. .env.example)',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function issueSessionToken(input: {
  sub: string;
  email: string;
  pwdVersion: number;
  /** первичный вход (продление передаёт прежний); дефолт — сейчас */
  lat?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: input.email,
    pwd_version: input.pwdVersion,
    lat: input.lat ?? now,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + SLIDING_TTL_S)
    .sign(getSecretKey());
}

// null = токен не признан (битый / чужая подпись / просрочен / за потолком /
// нет AUTH_SECRET). Все случаи равнозначны «не залогинен» — деталей наружу
// не раскрываем, вызывающий шлёт на /login.
export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });
    const { sub, iat } = payload;
    const email = payload.email;
    const pwdVersion = payload.pwd_version;
    const lat = payload.lat;
    if (
      typeof sub !== 'string' ||
      sub.length === 0 ||
      typeof iat !== 'number' ||
      typeof email !== 'string' ||
      typeof pwdVersion !== 'number' ||
      typeof lat !== 'number'
    ) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (now - lat > ABSOLUTE_TTL_S) return null;
    return { sub, email, pwd_version: pwdVersion, lat, iat };
  } catch {
    return null;
  }
}

/** Пора ли перевыпустить токен (зовёт proxy на каждый запрос). */
export function shouldRenewSession(
  claims: SessionClaims,
  nowS: number = Math.floor(Date.now() / 1000),
): boolean {
  return (
    nowS - claims.iat > RENEW_AFTER_S && nowS - claims.lat <= ABSOLUTE_TTL_S
  );
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SLIDING_TTL_S,
  } as const;
}
