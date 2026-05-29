import { CommandPaletteProvider } from '@/components/app/command-palette';
import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { requireUser } from '@/lib/auth/require-role';
import { countOpenTasksAssignedTo } from '@/lib/tasks/queries';
import { ROLE_LABEL } from '@/lib/types/db';

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
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar
            userName={user.profile.full_name}
            roleLabel={ROLE_LABEL[user.profile.role]}
            tasksOpen={tasksOpen}
          />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
