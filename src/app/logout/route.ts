import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LOCALE_COOKIE } from '@/lib/i18n/config';

// POST /logout — единственный путь выхода. GET нарочно не реализуем:
// link prefetch / случайный GET от браузера не должны выкидывать пользователя.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const response = NextResponse.redirect(url, { status: 303 });
  // Сбрасываем язык на дефолт (украинский) — экран входа открывается на нём.
  response.cookies.delete(LOCALE_COOKIE);
  return response;
}
