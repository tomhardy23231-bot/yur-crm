import { Sidebar } from '@/components/app/sidebar';
import { requireUser } from '@/lib/auth/require-role';
import { countOpenTasksAssignedTo } from '@/lib/tasks/queries';

// App-shell: общая обёртка для авторизованных страниц.
// requireUser редиректит на /login, если сессии нет — поэтому внутренние
// страницы могут считать пользователя гарантированно активным сотрудником.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const tasksOpen = await countOpenTasksAssignedTo(user.profile.id);

  return (
    <div className="flex flex-1 min-h-full">
      <Sidebar user={user} counts={{ tasksOpen }} />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
