import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Coins, Palette, ShieldCheck, Users, ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeSwitcher, type Theme } from '@/components/app/theme-switcher';
import { requireUser } from '@/lib/auth/require-role';

// Хаб настроек — единый вход в администрирование. Доступен обладателям права
// управления пользователями ИЛИ системных настроек (ставок). Каждая карточка
// дополнительно гейтится своим правом; RLS дублирует защиту на стороне БД.
export default async function SettingsPage() {
  const actor = await requireUser();
  const canManageUsers = actor.caps.manage_users;
  const canEditRates = actor.caps.edit_payroll_rates;
  if (!canManageUsers && !canEditRates) redirect('/forbidden');

  const theme: Theme =
    (await cookies()).get('theme')?.value === 'brass' ? 'brass' : 'teal';

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      {/* Оформление — цветовая тема */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <Palette size={16} strokeWidth={1.75} className="text-text-muted" />
          Оформление
        </h2>
        <Card className="p-5">
          <p className="mb-3.5 text-[13px] text-text-muted">
            Цветовая тема интерфейса. Выбор сохраняется в этом браузере.
          </p>
          <ThemeSwitcher current={theme} />
        </Card>
      </section>

      {/* Доступные настройки */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {canEditRates && (
          <Link
            href="/settings/payroll"
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Coins size={20} strokeWidth={1.75} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">
                Ставки зарплаты
              </span>
              <span className="block text-[13px] text-text-muted">
                Проценты по категориям, раздельно для юриста и эксперта.
              </span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className="text-text-subtle transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}

        {canManageUsers && (
          <Link
            href="/settings/users"
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Users size={20} strokeWidth={1.75} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">
                Пользователи и роли
              </span>
              <span className="block text-[13px] text-text-muted">
                Управление сотрудниками и правами доступа.
              </span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className="text-text-subtle transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </section>

      {/* Сводный список прав (P3.1) */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-text-muted" />
          Кто что может
        </h2>
        <Card className="overflow-hidden">
          <CapRow
            title="Системные настройки (ставки зарплаты)"
            owner
            admin={false}
          />
          <CapRow title="Управление пользователями и ролями" owner admin />
          <CapRow
            title="Удаление дел / клиентов / документов, правка платежей"
            owner
            admin
          />
          <CapRow title="Все дела и все финансы (сводки)" owner admin staff />
          <CapRow
            title="Индивидуальный % зарплаты на деле"
            owner
            admin
            last
          />
        </Card>
        <p className="text-[12px] text-text-subtle">
          «Офис-менеджер» видит все дела и финансы, но не удаляет записи, не
          правит платежи и не управляет пользователями. «Юрист» и «Эксперт»
          видят только свои дела и начисления.
        </p>
      </section>
    </main>
  );
}

function CapRow({
  title,
  owner,
  admin,
  staff,
  last,
}: {
  title: string;
  owner?: boolean;
  admin?: boolean;
  staff?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 ${last ? '' : 'border-b border-border'}`}
    >
      <span className="flex-1 text-[13.5px] text-text">{title}</span>
      <Roles owner={owner} admin={admin} staff={staff} />
    </div>
  );
}

function Roles({
  owner,
  admin,
  staff,
}: {
  owner?: boolean;
  admin?: boolean;
  staff?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {owner && <Badge tone="info">Владелец</Badge>}
      {admin && <Badge tone="neutral">Админ</Badge>}
      {staff && <Badge tone="neutral">Офис-менеджер</Badge>}
    </span>
  );
}
