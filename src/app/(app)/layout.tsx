import { CommandPaletteProvider } from '@/components/app/command-palette';
import { OnboardingProvider } from '@/components/onboarding/onboarding-provider';
import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { requireUser } from '@/lib/auth/require-role';
import { countOpenTasksAssignedTo } from '@/lib/tasks/queries';
import { ROLE_LABEL, STAFF_ROLES } from '@/lib/types/db';

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
    <CommandPaletteProvider caps={user.caps}>
      <OnboardingProvider
        ctx={{
          role: user.profile.role,
          isStaff: STAFF_ROLES.includes(user.profile.role),
          caps: user.caps,
        }}
      >
        {/* App-shell: высота вьюпорта, скролл внутри контента → сайдбар и топбар закреплены. */}
        <div className="flex h-dvh overflow-hidden">
          <Sidebar
            userName={user.profile.full_name}
            roleLabel={ROLE_LABEL[user.profile.role]}
            caps={user.caps}
            counts={{ tasksOpen }}
          />
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <Topbar
              userName={user.profile.full_name}
              roleLabel={ROLE_LABEL[user.profile.role]}
              tasksOpen={tasksOpen}
            />
            <div
              data-tour="page-content"
              className="flex-1 min-w-0 overflow-y-auto"
            >
              {children}
            </div>
          </div>
        </div>
      </OnboardingProvider>
    </CommandPaletteProvider>
  );
}
