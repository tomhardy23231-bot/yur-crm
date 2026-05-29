import Link from 'next/link';
import { Coins, ShieldCheck, Users, ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requireRole } from '@/lib/auth/require-role';

// Хаб системных настроек — ТОЛЬКО владелец (CLAUDE.md §4: системные настройки
// = owner-exclusive). RLS на payroll_rates дублирует защиту на уровне БД.
export default async function SettingsPage() {
  await requireRole(['owner']);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4 max-w-5xl">
      <p className="text-[13px] text-text-muted">
        Системные настройки доступны только владельцу.
      </p>

      {/* Доступные настройки */}
      <section className="flex flex-col gap-3">
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

        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm opacity-80">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-muted text-text-muted">
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
          <Badge tone="neutral">скоро</Badge>
        </div>
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
