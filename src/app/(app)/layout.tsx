import { CommandPaletteProvider } from '@/components/app/command-palette';
import { Sidebar } from '@/components/app/sidebar';
import { requireUser } from '@/lib/auth/require-role';
import { countOpenTasksAssignedTo } from '@/lib/tasks/queries';

// App-shell: общая обёртка для авторизованных страниц.
// requireUser редиректит на /login, если сессии нет — поэтому внутренние
// страницы могут считать пользователя гарантированно активным сотрудником.
//
// CommandPaletteProvider оборачивает всё — global Cmd+K listener + Dialog портал.
// Палитра принимает role для гейтинга действий (создать дело — staff-only).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const tasksOpen = await countOpenTasksAssignedTo(user.profile.id);

  return (
    <CommandPaletteProvider role={user.profile.role}>
      <div className="flex flex-1 min-h-full">
        <Sidebar user={user} counts={{ tasksOpen }} />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </CommandPaletteProvider>
  );
}
