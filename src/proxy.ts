import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Next.js 16 переименовал middleware в Proxy — этот файл выполняет роль
// прежнего middleware.ts: на каждый запрос рефрешит сессию Supabase, чтобы
// серверные компоненты получали уже актуальный JWT в cookies.
//
// Это «optimistic check»: финальное решение о доступе принимают серверные
// компоненты через createSupabaseServerClient + getUser (см. lib/auth/*).

const PUBLIC_PATHS = new Set(['/login', '/forbidden']);

// Машина-к-машине роуты OnlyOffice Document Server: у DS нет пользовательской
// сессии — он авторизуется собственным JWT (content-токен на скачивание файла,
// подпись на callback сохранения). НЕ редиректим их на /login, иначе DS получит
// HTML логина вместо файла и не сможет ни открыть, ни сохранить документ. Сами
// роуты проверяют JWT внутри (см. content/route.ts, oo-callback/route.ts).
const OO_MACHINE_PATH =
  /^\/api\/documents\/[0-9a-f-]{36}\/(content|oo-callback)$/i;

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
  if (PUBLIC_PATHS.has(path) || OO_MACHINE_PATH.test(path)) {
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

  // Проверяем сессию через getClaims(): при асимметричных JWT-ключах подпись
  // валидируется ЛОКАЛЬНО по кэшированному JWKS — без сетевого round-trip к
  // Auth-серверу на КАЖДЫЙ запрос (главный системный тормоз). При симметричном
  // ключе (HS256) getClaims внутри откатывается на getUser() — поведение не
  // ухудшается. ВАЖНО: вызываем БЕЗ аргумента — тогда внутри идёт getSession(),
  // который рефрешит протухший токен, и setAll выше обновляет cookie. Передать
  // токен явно — значит отключить рефреш и ловить throw на истёкшем exp.
  //
  // getClaims может бросить НЕ-AuthError (сбой fetch JWKS, кривой alg, ошибка
  // WebCrypto). Непойманный throw в Edge-middleware = 500 на каждый маршрут,
  // поэтому fail-closed: любой сбой проверки трактуем как «не залогинен» → /login
  // (старый getUser возвращал ошибку, а не падал — сохраняем это поведение).
  let claims: { sub?: string } | null = null;
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    claims = claimsData?.claims ?? null;
  } catch {
    claims = null;
  }

  // Не залогинен или сбой проверки → шлём на /login (публичные пути отсеяны выше).
  if (!claims?.sub) {
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
