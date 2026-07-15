import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/session';
import { LOCALE_COOKIE } from '@/lib/i18n/config';

// POST /logout — единственный путь выхода. GET нарочно не реализуем:
// link prefetch / случайный GET от браузера не должны выкидывать пользователя.
//
// Цикл v4: выход = удаление httpOnly-куки сессии. Серверного состояния у
// сессии нет (скользящий JWT, ревью V2) — отзывать нечего; «выйти со всех
// устройств» достигается сменой пароля (инкремент pwd_version).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  // Сбрасываем язык на дефолт (украинский) — экран входа открывается на нём.
  response.cookies.delete(LOCALE_COOKIE);
  return response;
}
