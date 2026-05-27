import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Building2,
  CheckSquare,
  ChevronLeft,
  FileText,
  Gavel,
  Hash,
  Landmark,
  Pencil,
  User,
  Wallet,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHero } from '@/components/ui/card';
import { StageBadge, STAGE_LABELS } from '@/components/ui/stage-badge';
import { BillingTypesBadges } from '@/components/cases/billing-types-badges';
import { DeleteCaseForm } from '@/components/cases/delete-case-form';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { requireUser } from '@/lib/auth/require-role';
import { getCase } from '@/lib/cases/queries';
import {
  CASE_TYPE_LABEL,
  CLIENT_KIND_LABEL,
} from '@/lib/types/db';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const SPECIALIST_TYPE_LABEL: Record<'lawyer' | 'jurist', string> = {
  lawyer: 'Адвокат',
  jurist: 'Юрист',
};

const ERROR_MESSAGES: Record<string, string> = {
  has_links:
    'Нельзя удалить дело: к нему привязаны документы или платежи. Сначала переместите/удалите связанные записи.',
  delete_failed: 'Не удалось удалить дело. Попробуйте позже.',
  missing_id: 'Не передан идентификатор дела.',
};

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const c = await getCase(id);
  if (!c) notFound();

  const isStaff =
    user.profile.role === 'owner' || user.profile.role === 'admin';
  // RLS UPDATE = staff OR responsible_id = uid. Маскируем кнопку Edit под это.
  const canEdit = isStaff || c.responsible_id === user.profile.id;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12 max-w-5xl">
      <Link
        href="/cases"
        className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />К списку дел
      </Link>

      {errorMessage && (
        <div
          role="alert"
          className="text-[13px] text-error bg-error-bg border border-error/20 rounded-md px-3 py-2"
        >
          {errorMessage}
        </div>
      )}

      {/* Шапка */}
      <Card>
        <CardHero>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/15 border-2 border-white/40 shrink-0">
            <Hash size={20} strokeWidth={2} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[24px] font-bold leading-tight tracking-[-0.01em] truncate">
              {c.number_title}
            </p>
            <p className="text-[13px] opacity-90 mt-1">
              {CASE_TYPE_LABEL[c.case_type]} · открыто{' '}
              {DATE_FMT.format(new Date(c.opened_at))}
              {c.closed_at && (
                <>
                  {' '}· завершено {DATE_FMT.format(new Date(c.closed_at))}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25 hover:!border-white/50"
              >
                <Link href={`/cases/${c.id}/edit`}>
                  <Pencil size={14} strokeWidth={1.75} />
                  Редактировать
                </Link>
              </Button>
            )}
            {isStaff && (
              <DeleteCaseForm caseId={c.id} caseTitle={c.number_title} />
            )}
          </div>
        </CardHero>

        <div className="px-6 py-4 flex flex-wrap items-center gap-2 border-b border-border bg-surface-muted/50">
          <StageBadge stage={c.stage} label={STAGE_LABELS[c.stage]} />
          <PriorityBadge priority={c.priority} />
          {c.tags.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2">
          <Section title="Клиент" icon={Building2}>
            {c.client ? (
              <Link
                href={`/clients/${c.client.id}`}
                className="inline-flex items-center gap-2.5 group"
              >
                <Avatar name={c.client.name} size="sm" />
                <span className="flex flex-col">
                  <span className="font-medium text-text group-hover:text-primary transition-colors">
                    {c.client.name}
                  </span>
                  <span className="text-[12px] text-text-muted">
                    {CLIENT_KIND_LABEL[c.client.client_kind]}
                  </span>
                </span>
              </Link>
            ) : (
              <Empty />
            )}
          </Section>

          <Section title="Ответственный" icon={User}>
            {c.responsible ? (
              <span className="inline-flex items-center gap-2.5">
                <Avatar name={c.responsible.full_name} size="sm" />
                <span className="flex flex-col">
                  <span className="font-medium text-text">
                    {c.responsible.full_name}
                  </span>
                  {c.responsible.specialist_type && (
                    <span className="text-[12px] text-text-muted">
                      {SPECIALIST_TYPE_LABEL[c.responsible.specialist_type]}
                    </span>
                  )}
                </span>
              </span>
            ) : (
              <Empty />
            )}
          </Section>

          {(c.opponent || c.court || c.court_case_number) && (
            <>
              {c.opponent && (
                <Section title="Оппонент" icon={User}>
                  <span className="text-[13.5px] text-text">{c.opponent}</span>
                </Section>
              )}

              {c.court && (
                <Section title="Суд" icon={Landmark}>
                  <span className="text-[13.5px] text-text">{c.court}</span>
                </Section>
              )}

              {c.court_case_number && (
                <Section title="Номер судебного дела" icon={Gavel}>
                  <span className="font-mono text-[13.5px] text-text">
                    {c.court_case_number}
                  </span>
                </Section>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Финансы */}
      <Card>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Wallet size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[16px] font-semibold text-text">Финансы</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <KPI label="Сумма договора" value={MONEY_FMT.format(c.contract_sum)} />
          <KPI label="Оплачено" value={MONEY_FMT.format(c.paid_total)} tone="success" />
          <KPI
            label="Долг"
            value={MONEY_FMT.format(c.debt)}
            tone={c.debt > 0 ? 'error' : 'muted'}
          />
        </div>
        <div className="px-5 py-4 border-t border-border">
          <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle mb-2">
            Тип оплаты
          </p>
          <BillingTypesBadges types={c.billing_types} />
        </div>
      </Card>

      {/* Заглушки под Шаги 7-8 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <SoonCard
          icon={FileText}
          title="Документы"
          hint="Договор, доверенности, претензии — загрузка появится на Шаге 8."
        />
        <SoonCard
          icon={CheckSquare}
          title="Задачи и заседания"
          hint="Календарь, дедлайны, ответственные — Шаг 7."
        />
        <SoonCard
          icon={Wallet}
          title="Платежи"
          hint="История платежей по делу — Шаг 7."
        />
      </div>
    </main>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
        <Icon size={12} strokeWidth={1.75} />
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'error' | 'muted';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'error'
        ? 'text-error'
        : tone === 'muted'
          ? 'text-text-muted'
          : 'text-text';
  return (
    <div className="p-5 flex flex-col gap-1.5">
      <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
        {label}
      </p>
      <p className={`text-[22px] font-bold font-mono ${valueClass}`}>{value}</p>
    </div>
  );
}

function SoonCard({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} strokeWidth={1.75} className="text-text-muted" />
        <h3 className="text-[14px] font-semibold text-text">{title}</h3>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
          скоро
        </span>
      </div>
      <p className="text-[12.5px] text-text-muted leading-[1.5]">{hint}</p>
    </Card>
  );
}

function Empty() {
  return <span className="text-[13px] text-text-subtle">—</span>;
}
