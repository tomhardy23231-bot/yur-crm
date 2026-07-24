import { SettingsNav, type SettingsNavId } from '@/components/settings/settings-nav';
import { requireUser } from '@/lib/auth/require-role';

// Каркас раздела «Настройки» — двухпанельный вид (по референсу владельца):
// слева постоянный рейл разделов, справа — контент выбранного раздела. Под-
// страницы (/settings/*) рендерятся в правой панели без изменений.
//
// Видимость пунктов рейла = та же гейтинг-логика, что была у карточек хаба
// (RLS дублирует защиту на стороне БД). «Язык» — персональная настройка,
// доступна всем и ведёт в профиль.
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireUser();
  const caps = actor.caps;
  const isOwner = actor.profile.role === 'owner';

  const visibleIds: SettingsNavId[] = [];
  if (caps.manage_users || caps.create_users) visibleIds.push('users');
  if (isOwner) visibleIds.push('departments');
  if (caps.manage_case_types) visibleIds.push('caseTypes');
  if (caps.edit_payroll_rates) visibleIds.push('rates');
  if (isOwner) visibleIds.push('requisites');
  visibleIds.push('language');

  return (
    <div className="flex flex-col md:flex-row md:gap-6">
      {/* Desktop — левый рейл разделов на белой панели (sticky, остаётся на
          виду при скролле). Карточка отделяет рейл от серого фона. */}
      <aside className="hidden shrink-0 pl-3 pt-2 sm:pl-4 md:block md:w-64">
        <div className="sticky top-2 rounded-card border border-border bg-surface p-2 shadow-sm">
          <SettingsNav visibleIds={visibleIds} variant="rail" />
        </div>
      </aside>

      {/* Mobile — горизонтальная лента разделов сверху. */}
      <div className="px-3 pt-2 sm:px-4 md:hidden">
        <SettingsNav visibleIds={visibleIds} variant="strip" />
      </div>

      {/* Контент выбранного раздела. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
