import { Info, ShieldCheck, UserRound } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/users/change-password-form';
import { requireUser } from '@/lib/auth/require-role';
import { ROLE_LABEL } from '@/lib/types/db';

// Задача 6: личный кабинет — профиль + смена пароля. Доступен любому
// авторизованному пользователю (requireUser). Здесь же мягкая подсказка
// сменить временный пароль, выданный при создании учётки.
export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <main className="flex max-w-2xl flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
          Профиль и безопасность
        </h1>
        <p className="text-[13px] text-text-muted">
          Ваши данные и смена пароля.
        </p>
      </div>

      {/* Данные пользователя */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <UserRound size={16} strokeWidth={1.75} className="text-text-muted" />
          Профиль
        </h2>
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={user.profile.full_name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-text">
              {user.profile.full_name}
            </p>
            <p className="truncate font-mono text-[13px] text-text-muted">
              {user.email}
            </p>
          </div>
          <Badge tone="info">{ROLE_LABEL[user.profile.role]}</Badge>
        </Card>
      </section>

      {/* Смена пароля */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-text-muted" />
          Смена пароля
        </h2>

        {/* Мягкая подсказка про временный пароль */}
        <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-bg px-3 py-2.5 text-[13px] text-info">
          <Info size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            Если вы вошли с временным паролем, выданным администратором,
            рекомендуем сразу задать свой собственный пароль.
          </span>
        </div>

        <Card className="p-5">
          <ChangePasswordForm />
        </Card>
      </section>
    </main>
  );
}
