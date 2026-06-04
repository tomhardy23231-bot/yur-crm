import { LogOut } from 'lucide-react';

// Кнопка выхода: POST на /logout (см. src/app/logout/route.ts).
// Маленькая <form>, не <a>, чтобы случайные GET/prefetch не убивали сессию.
// Иконочная — живёт в тёмном футере сайдбара. label передаётся переведённым.
export function LogoutButton({ label }: { label: string }) {
  return (
    <form action="/logout" method="post" className="shrink-0">
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text hover:text-sidebar-text-strong hover:bg-sidebar-hover-bg transition-colors duration-[80ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <LogOut size={16} strokeWidth={1.75} />
      </button>
    </form>
  );
}
