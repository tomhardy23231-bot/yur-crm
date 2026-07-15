import { NextResponse, type NextRequest } from 'next/server';

import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
  shouldRenewSession,
  verifySessionToken,
} from '@/lib/auth/session';

// Next.js 16 переименовал middleware в Proxy — этот файл выполняет роль
// прежнего middleware.ts.
//
// Цикл v4: сессия — наш «скользящий JWT» (lib/auth/session.ts). Проверка
// ЛОКАЛЬНАЯ: подпись HS256 без сети и без БД — сетевых round-trip'ов GoTrue
// больше нет. Это «optimistic check»: финальное решение о доступе принимают
// серверные компоненты через getCurrentUser (там же is_active и pwd_version,
// один запрос профиля под RLS).
//
// ⚠ Урок прежнего proxy (v3, логин ломался): НЕ пересоздавать request
// (NextResponse.next({ request })) — для POST server-action это роняет тело
// запроса. Здесь request не трогаем ВООБЩЕ: читаем cookie, максимум ставим
// Set-Cookie на ответ (продление). Требование закреплено e2e auth.spec.

const PUBLIC_PATHS = new Set(['/login', '/forbidden']);

// Машина-к-машине роуты OnlyOffice Document Server: у DS нет пользовательской
// сессии — он авторизуется собственным JWT (content-токен на скачивание файла,
// подпись на callback сохранения). НЕ редиректим их на /login, иначе DS получит
// HTML логина вместо файла и не сможет ни открыть, ни сохранить документ. Сами
// роуты проверяют JWT внутри (см. content/route.ts, oo-callback/route.ts).
const OO_MACHINE_PATH =
  /^\/api\/documents\/[0-9a-f-]{36}\/(content|oo-callback)$/i;

// v3 Сессия 8: машина-к-машине роуты уведомлений/календаря. У внешних клиентов
// (Telegram, Vercel Cron, календарное приложение) нет нашей сессии — они
// авторизуются своим секретом/токеном ВНУТРИ роута. Не редиректим на /login.
const NOTIFY_MACHINE_PATH =
  /^\/api\/(telegram\/webhook|cron\/reminders|calendar\/[^/]+)$/i;

// Цикл v4 сессия 5: стрим-роут ЛОКАЛЬНОГО storage-провайдера (dev). Авторизуется
// HMAC-подписью в query, а не сессией — зеркало presigned URL S3/R2 (файл
// отдаётся по краткоживущей подписанной ссылке без нашей куки). На проде
// (STORAGE_PROVIDER=s3) роут не используется — редирект идёт прямо в R2.
const LOCAL_STORAGE_PATH = '/api/storage/local';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Публичные и machine-пути пропускаем как есть (см. урок выше: даже
  // безобидная работа с request на POST /login роняла FormData экшена).
  if (
    PUBLIC_PATHS.has(path) ||
    path === LOCAL_STORAGE_PATH ||
    OO_MACHINE_PATH.test(path) ||
    NOTIFY_MACHINE_PATH.test(path)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  // Не залогинен / токен не признан → на /login (fail-closed: сбой проверки
  // неотличим от отсутствия сессии).
  if (!claims) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  // Скользящее продление: токену больше суток → перевыпуск с прежним lat
  // (первичный вход), локально, без БД. Идемпотентно (ревью V2): параллельные
  // вкладки могут перевыпустить каждая свою копию — обе валидны, гонок нет.
  // Downstream текущего запроса продолжает жить со старой кукой — она ещё
  // валидна, прокидывать свежую в request не нужно (и нельзя — см. урок).
  if (shouldRenewSession(claims)) {
    const fresh = await issueSessionToken({
      sub: claims.sub,
      email: claims.email,
      pwdVersion: claims.pwd_version,
      lat: claims.lat,
    });
    response.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions());
  }

  // Редирект /login → / для залогиненных делается НА /login странице, а не
  // здесь: страница имеет доступ к getCurrentUser (фильтр по is_active и
  // pwd_version), proxy — нет. Иначе деактивированный пользователь с ещё
  // валидным JWT попал бы в цикл / ↔ /login.

  return response;
}

export const config = {
  // Прокидываем Proxy на всё, кроме статики и Next-внутренностей.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
