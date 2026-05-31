import { cookies } from 'next/headers';

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

  // Состояние «свёрнутый сайдбар» — из cookie (читается на сервере → без мигания).
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get('sidebar_collapsed')?.value === '1';

  return (
    <CommandPaletteProvider role={user.profile.role}>
      {/* App-shell: высота вьюпорта, скролл внутри контента → сайдбар и топбар закреплены. */}
      <div className="flex h-dvh overflow-hidden">
        <Sidebar
          userName={user.profile.full_name}
          roleLabel={ROLE_LABEL[user.profile.role]}
          role={user.profile.role}
          counts={{ tasksOpen }}
          defaultCollapsed={sidebarCollapsed}
        />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Topbar
            userName={user.profile.full_name}
            roleLabel={ROLE_LABEL[user.profile.role]}
            tasksOpen={tasksOpen}
          />
          <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
