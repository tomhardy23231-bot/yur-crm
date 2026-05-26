// Кнопка выхода: POST на /logout (см. src/app/logout/route.ts).
// Это маленькая <form>, а не <a>, чтобы случайные GET/prefetch не убивали сессию.
export function LogoutButton() {
  return (
    <form action="/logout" method="post">
      <button
        type="submit"
        className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        Выйти
      </button>
    </form>
  );
}
