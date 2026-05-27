import { Button } from '@/components/ui/button';

// Кнопка выхода: POST на /logout (см. src/app/logout/route.ts).
// Маленькая <form>, не <a>, чтобы случайные GET/prefetch не убивали сессию.
export function LogoutButton() {
  return (
    <form action="/logout" method="post">
      <Button type="submit" variant="secondary" size="sm">
        Выйти
      </Button>
    </form>
  );
}
