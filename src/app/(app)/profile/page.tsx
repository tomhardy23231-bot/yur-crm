import { Bell, Info, Languages, ShieldCheck, UserRound } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/users/change-password-form';
import { LanguageSwitcher } from '@/components/account/language-switcher';
import { NotificationsCard } from '@/components/account/notifications-card';
import { requireUser } from '@/lib/auth/require-role';
import { getNotifyChannel } from '@/lib/notifications/queries';
import { getT } from '@/lib/i18n/server';

// Задача 6: личный кабинет — профиль + язык интерфейса + смена пароля. Доступен
// любому авторизованному пользователю (requireUser). Здесь же мягкая подсказка
// сменить временный пароль, выданный при создании учётки.
export default async function ProfilePage() {
  const user = await requireUser();
  const { t } = await getT();
  const channel = await getNotifyChannel();
  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? null;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
          {t.account.heading}
        </h1>
        <p className="text-[13px] text-text-muted">{t.account.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {/* Данные пользователя */}
        <section className="flex flex-col gap-3">
          <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-text">
            <UserRound size={16} strokeWidth={1.75} className="text-text-muted" />
            {t.account.profileSection}
          </h2>
          <Card className="flex items-center gap-4 p-5">
            <Avatar name={user.profile.full_name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-text">
                {user.profile.full_name}
              </p>
              <p className="truncate text-[13px] text-text-muted">
                {user.email}
              </p>
            </div>
            <Badge tone="info">{t.enums.role[user.profile.role]}</Badge>
          </Card>
        </section>

        {/* Язык интерфейса */}
        <section className="flex flex-col gap-3">
          <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-text">
            <Languages size={16} strokeWidth={1.75} className="text-text-muted" />
            {t.account.language.section}
          </h2>
          <Card className="flex flex-col gap-3 p-5">
            <p className="text-[13px] text-text-muted">
              {t.account.language.hint}
            </p>
            <LanguageSwitcher />
          </Card>
        </section>

        {/* Уведомления и календарь */}
        <section className="flex flex-col gap-3 lg:col-span-2 lg:max-w-[calc(50%-0.625rem)]">
          <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-text">
            <Bell size={16} strokeWidth={1.75} className="text-text-muted" />
            {t.account.notifications.section}
          </h2>
          <Card className="p-5">
            <NotificationsCard channel={channel} botName={botName} />
          </Card>
        </section>

        {/* Смена пароля */}
        <section className="flex flex-col gap-3 lg:col-span-2 lg:max-w-[calc(50%-0.625rem)]">
          <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-text">
            <ShieldCheck size={16} strokeWidth={1.75} className="text-text-muted" />
            {t.account.password.section}
          </h2>

          {/* Мягкая подсказка про временный пароль */}
          <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-bg px-3 py-2.5 text-[13px] text-info">
            <Info size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>{t.account.password.tempHint}</span>
          </div>

          <Card className="p-5">
            <ChangePasswordForm />
          </Card>
        </section>
      </div>
    </main>
  );
}
