import { CommandPaletteProvider } from '@/components/app/command-palette';
import { OnboardingProvider } from '@/components/onboarding/onboarding-provider';
import { Sidebar } from '@/components/app/sidebar';
import { BottomNav } from '@/components/app/bottom-nav';
import { Topbar } from '@/components/app/topbar';
import { requireUser } from '@/lib/auth/require-role';
import { countOpenTasksAssignedTo } from '@/lib/tasks/queries';
import { STAFF_ROLES } from '@/lib/types/db';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { LocaleProvider } from '@/lib/i18n/provider';

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

  // Локаль и словарь активного языка — отдаём в клиентский провайдер (в бандл
  // уходит только активный язык). roleLabel переводим через словарь.
  const locale = await getLocale();
  const messages = getMessages(locale);
  const roleLabel = messages.enums.role[user.profile.role];

  return (
    <LocaleProvider locale={locale} messages={messages}>
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
              roleLabel={roleLabel}
              caps={user.caps}
              counts={{ tasksOpen }}
            />
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <Topbar
                userName={user.profile.full_name}
                roleLabel={roleLabel}
                tasksOpen={tasksOpen}
              />
              <div
                data-tour="page-content"
                className="flex-1 min-w-0 overflow-y-auto pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0"
              >
                {children}
              </div>
            </div>

            {/* Нижняя навигация — только на мобильных (< md), где скрыт боковой рейл. */}
            <BottomNav
              caps={user.caps}
              counts={{ tasksOpen }}
              userName={user.profile.full_name}
              roleLabel={roleLabel}
            />
          </div>
        </OnboardingProvider>
      </CommandPaletteProvider>
    </LocaleProvider>
  );
}
