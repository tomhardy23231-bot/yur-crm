import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Next.js 16 переименовал middleware в Proxy — этот файл выполняет роль
// прежнего middleware.ts: на каждый запрос рефрешит сессию Supabase, чтобы
// серверные компоненты получали уже актуальный JWT в cookies.
//
// Это «optimistic check»: финальное решение о доступе принимают серверные
// компоненты через createSupabaseServerClient + getUser (см. lib/auth/*).

const PUBLIC_PATHS = new Set(['/login', '/forbidden']);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Публичные пути (/login, /forbidden) НЕ трогаем сессией Supabase.
  // Причина: при протухшем refresh-токене getUser() инициирует refresh,
  // @supabase/ssr пересоздаёт ответ через NextResponse.next({ request }),
  // и для POST-запроса (Server Action логина) это РОНЯЕТ тело запроса →
  // loginAction получает пустую FormData → «Заполните email и пароль».
  // Логину сессия не нужна (страница сама зовёт getCurrentUser), поэтому
  // просто пропускаем — тело POST остаётся целым, login работает даже со
  // старой кукой (успешный вход перезапишет её свежей).
  if (PUBLIC_PATHS.has(path)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // На локалке без env — пропускаем, страницы упадут с понятной ошибкой.
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Сначала кладём cookies в request — чтобы downstream SSR увидел их
        // уже в этом же рендере, без следующего навигационного раунда.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // ВАЖНО: getUser() (а не getSession()) — он контактирует с Auth-сервером
  // и валидирует токен; getSession() читает cookie без проверки и не годится
  // для решений о доступе (см. @supabase/ssr README).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Не залогинен → шлём на /login (публичные пути уже отсеяны выше).
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  // Редирект /login → / для залогиненных делается НА /login странице, а не
  // здесь: страница имеет доступ к getCurrentUser (фильтр по is_active),
  // proxy — нет. Иначе деактивированный пользователь с ещё валидным JWT
  // попадёт в цикл / ↔ /login (главная редиректит на /login, потому что
  // is_active=false, proxy редиректит обратно на /, потому что JWT валидный).

  return response;
}

export const config = {
  // Прокидываем Proxy на всё, кроме статики и Next-внутренностей.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
