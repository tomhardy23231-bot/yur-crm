import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  Clock,
  Pencil,
  Scale,
  TriangleAlert,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StageBadge } from '@/components/ui/stage-badge';
import { CategoryBadge } from '@/components/ui/category-badge';
import { StageStepper } from '@/components/cases/stage-stepper';
import { BillingTypesBadges } from '@/components/cases/billing-types-badges';
import { PaymentProgress } from '@/components/cases/payment-progress';
import { CaseLedgerBlock } from '@/components/payroll/case-ledger-block';
import { DeleteCaseForm } from '@/components/cases/delete-case-form';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { CaseActivityBlock } from '@/components/activity/case-activity-block';
import { CaseDocumentsBlock } from '@/components/documents/case-documents-block';
import { CasePaymentsBlock } from '@/components/payments/case-payments-block';
import { CaseTasksBlock } from '@/components/tasks/case-tasks-block';
import { requireUser } from '@/lib/auth/require-role';
import { cn, formatMoney, formatPercent } from '@/lib/utils';
import { getCase } from '@/lib/cases/queries';
import { getCasePayroll, listLedgerByCase } from '@/lib/payroll/queries';
import { caseHasDocOfType } from '@/lib/documents/queries';
import {
  CASE_CATEGORY_LABEL,
  CASE_TYPE_LABEL,
  CLIENT_KIND_LABEL,
  STAFF_ROLES,
} from '@/lib/types/db';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const ERROR_MESSAGES: Record<string, string> = {
  has_links:
    'Нельзя удалить дело: к нему привязаны документы или платежи. Сначала переместите/удалите связанные записи.',
  delete_failed: 'Не удалось удалить дело. Попробуйте позже.',
  missing_id: 'Не передан идентификатор дела.',
};

type Participant = {
  name: string;
  roleLabel: 'Юрист-менеджер' | 'Эксперт';
  percent: number;
  amount: number;
  override: boolean;
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

  const isStaff = STAFF_ROLES.includes(user.profile.role);
  // RLS UPDATE = staff OR lawyer_id/responsible_id = uid. Маскируем кнопку Edit.
  const canEdit =
    isStaff ||
    c.responsible_id === user.profile.id ||
    c.lawyer_id === user.profile.id;
  // Удаление дела — только owner/admin (RLS cases_delete_managers).
  const canDelete = user.profile.role === 'owner' || user.profile.role === 'admin';
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  // Начисление зарплаты (live) + зафиксированные записи леджера (P1.3).
  const [payroll, ledger] = await Promise.all([
    getCasePayroll(c.id),
    listLedgerByCase(c.id),
  ]);

  // Имена для строк леджера (берём из join'ов дела, без лишних запросов).
  const ledgerNames: Record<string, string> = {};
  if (c.lawyer) ledgerNames[c.lawyer.id] = c.lawyer.full_name;
  if (c.responsible) ledgerNames[c.responsible.id] = c.responsible.full_name;

  const ledgerEmptyHint =
    c.accrual_mode === 'per_payment'
      ? 'Начисляется по мере оплат.'
      : c.stage === 'closed'
        ? 'Начислений нет (нет оплат по делу).'
        : 'Начисление зафиксируется при завершении дела.';

  // Роль зрителя в этом деле — чтобы не-staff видел ТОЛЬКО своё начисление,
  // а не сумму/ставку коллеги (CLAUDE.md §4: «свои начисления»).
  const myRole: 'lawyer' | 'expert' | null =
    c.lawyer_id === user.profile.id
      ? 'lawyer'
      : c.responsible_id === user.profile.id
        ? 'expert'
        : null;

  // Мягкое предупреждение: дело завершено, но акт приёма-передачи не загружен.
  const missingAct =
    c.stage === 'closed' ? !(await caseHasDocOfType(c.id, 'act')) : false;

  const isClosed = c.stage === 'closed';

  // Участники «вознаграждения», с учётом видимости начислений по роли зрителя.
  const participants: Participant[] = [];
  if (payroll) {
    if ((isStaff || myRole === 'lawyer') && c.lawyer) {
      participants.push({
        name: c.lawyer.full_name,
        roleLabel: 'Юрист-менеджер',
        percent: payroll.lawyer_percent,
        amount: payroll.lawyer_amount,
        override: c.lawyer_rate_override != null,
      });
    }
    if ((isStaff || myRole === 'expert') && c.responsible) {
      participants.push({
        name: c.responsible.full_name,
        roleLabel: 'Эксперт',
        percent: payroll.expert_percent,
        amount: payroll.expert_amount,
        override: c.expert_rate_override != null,
      });
    }
  }
  const shownReward = participants.reduce((s, p) => s + p.amount, 0);
  const hasOverride = participants.some((p) => p.override);

  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      <Link
        href="/cases"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-muted shadow-sm transition-colors hover:border-border-strong hover:text-text"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />К списку дел
      </Link>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-error/20 bg-error-bg px-3 py-2 text-[13px] text-error"
        >
          {errorMessage}
        </div>
      )}

      {missingAct && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning-bg px-3 py-2 text-[13px] text-warning">
          <TriangleAlert size={15} strokeWidth={1.75} className="shrink-0" />
          Дело завершено, но акт приёма-передачи выполненных работ не загружен.
        </div>
      )}

      {/* ── Шапка дела ─────────────────────────────────────────── */}
      <Card className="p-4 sm:p-5">
        {/* Верхняя панель: мета слева, этап + действия справа — одна линия */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-extrabold tracking-[0.01em] text-white shadow-sm"
              style={{
                background: 'var(--grad-brass)',
                boxShadow:
                  '0 2px 8px rgba(184,138,62,.32), inset 0 1px 0 rgba(255,255,255,.2)',
              }}
            >
              <Briefcase size={12} strokeWidth={2.2} />
              Дело
            </span>
            <CategoryBadge category={c.category} percent={payroll?.lawyer_percent} />
            <PriorityBadge priority={c.priority} />
            {c.client && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
                <Building2 size={14} strokeWidth={1.75} />
                <Link
                  href={`/clients/${c.client.id}`}
                  className="font-medium text-text transition-colors hover:text-primary"
                >
                  {c.client.name}
                </Link>
                <span className="text-text-subtle">
                  · {CLIENT_KIND_LABEL[c.client.client_kind]}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden text-[11px] text-text-subtle sm:inline">
              Текущий этап
            </span>
            <StageBadge stage={c.stage} />
            {(canEdit || canDelete) && (
              <div className="flex items-center gap-2 border-l border-border pl-2.5">
                {canEdit && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/cases/${c.id}/edit`}>
                      <Pencil size={14} strokeWidth={1.75} />
                      Редактировать
                    </Link>
                  </Button>
                )}
                {canDelete && (
                  <DeleteCaseForm caseId={c.id} caseTitle={c.number_title} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Заголовок дела */}
        <h1 className="mt-3 text-[20px] font-bold leading-tight tracking-[-0.01em] text-text">
          {c.number_title}
        </h1>

        <p className="mt-1 text-[12.5px] text-text-muted">
          {CASE_TYPE_LABEL[c.case_type]} · открыто{' '}
          {DATE_FMT.format(new Date(c.opened_at))}
          {c.closed_at && (
            <> · завершено {DATE_FMT.format(new Date(c.closed_at))}</>
          )}
          {c.subject && <> · {c.subject}</>}
        </p>
        {c.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Степпер воронки — движение только вперёд (CLAUDE.md §6). */}
        <div className="mt-3.5">
          <StageStepper stage={c.stage} />
        </div>
      </Card>

      {/* ── Две колонки ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Левая: реквизиты + документы + задачи */}
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <CardLabel className="mb-1">Реквизиты дела</CardLabel>
            <KV k="Доверитель">
              {c.client ? (
                <Link
                  href={`/clients/${c.client.id}`}
                  className="text-text transition-colors hover:text-primary"
                >
                  {c.client.name}
                </Link>
              ) : (
                <Empty />
              )}
            </KV>
            <KV k="Тип дела">{CASE_TYPE_LABEL[c.case_type]}</KV>
            <KV k="Категория">{CASE_CATEGORY_LABEL[c.category]}</KV>
            <KV k="Сумма по договору">
              <span className="font-mono tabular-nums">
                {formatMoney(c.contract_sum)} ₴
              </span>
            </KV>
            <KV k="Оплачено клиентом">
              <span className="font-mono tabular-nums text-success">
                {formatMoney(c.paid_total)} ₴
              </span>
            </KV>
            <KV k="Долг">
              <span
                className={cn(
                  'font-mono tabular-nums',
                  c.debt > 0 ? 'text-error' : 'text-text-muted',
                )}
              >
                {formatMoney(c.debt)} ₴
              </span>
            </KV>
            {c.opponent && <KV k="Оппонент">{c.opponent}</KV>}
            {c.court && <KV k="Суд">{c.court}</KV>}
            {c.court_case_number && (
              <KV k="№ судебного дела">
                <span className="font-mono tabular-nums">
                  {c.court_case_number}
                </span>
              </KV>
            )}

            <div className="pt-3.5">
              <PaymentProgress
                paid={c.paid_total}
                total={c.contract_sum}
                showLabel
              />
            </div>

            <div className="mt-3.5 border-t border-border pt-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-subtle">
                Тип оплаты
              </p>
              <BillingTypesBadges types={c.billing_types} />
            </div>
          </Card>

          {/* Документы (Шаг 8) */}
          <CaseDocumentsBlock
            caseId={c.id}
            canWrite={canEdit}
            canDelete={canDelete}
          />

          {/* Задачи и заседания (Шаг 7) */}
          <CaseTasksBlock
            caseId={c.id}
            canWrite={canEdit}
            currentUserId={user.profile.id}
          />
        </div>

        {/* Правая: вознаграждение команды + команда дела */}
        <div className="flex flex-col gap-5">
          {payroll && participants.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <CardLabel>Вознаграждение команды</CardLabel>
                <Scale size={16} strokeWidth={1.75} className="text-text-subtle" />
              </div>

              <div className="flex gap-2">
                <RewardStat label="Сумма дела">
                  {formatMoney(c.contract_sum)} ₴
                </RewardStat>
                <RewardStat label="Оплачено" valueClassName="text-success">
                  {formatMoney(c.paid_total)} ₴
                </RewardStat>
                <RewardStat
                  label="Долг"
                  valueClassName={c.debt > 0 ? 'text-error' : 'text-text-muted'}
                >
                  {formatMoney(c.debt)} ₴
                </RewardStat>
              </div>

              <p className="mt-3 text-[12px] text-text-muted">
                Процент от оплаченного клиентом — каждому участнику отдельно
                {hasOverride && (
                  <span className="font-medium text-primary">
                    {' '}
                    · ставка переопределена вручную
                  </span>
                )}
              </p>

              <div className="mt-1">
                {participants.map((p) => (
                  <div
                    key={p.roleLabel}
                    className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
                  >
                    <Avatar name={p.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-text">
                        {p.name}
                      </p>
                      <p className="text-[11.5px] font-medium text-text-muted">
                        {p.roleLabel} · {formatPercent(p.percent)}% ×{' '}
                        {formatMoney(c.paid_total)} ₴
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-md bg-success-bg px-2.5 py-1 font-mono text-[14px] font-bold tabular-nums text-success">
                      {formatMoney(p.amount)} ₴
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t-2 border-surface-sunken pt-3">
                <span className="text-[13.5px] font-extrabold tracking-[0.01em] text-text">
                  {isStaff ? 'Фонд по делу' : 'Моё начисление'}
                </span>
                <span className="font-mono text-[19px] font-extrabold tabular-nums text-text">
                  {formatMoney(isStaff && payroll ? payroll.total : shownReward)} ₴
                </span>
              </div>

              <div
                className={cn(
                  'mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[12.5px] font-semibold',
                  isClosed
                    ? 'bg-success-bg text-success'
                    : 'bg-warning-bg text-warning',
                )}
              >
                {isClosed ? (
                  <Check size={15} strokeWidth={2} />
                ) : (
                  <Clock size={15} strokeWidth={1.75} />
                )}
                {isClosed
                  ? 'Дело завершено — начисления к выплате'
                  : 'Начислится к выплате после завершения дела'}
              </div>

              {/* Зафиксированные начисления/выплаты (P1.3). */}
              <div className="-mx-5 mt-4">
                <CaseLedgerBlock
                  entries={ledger}
                  canManage={canDelete}
                  names={ledgerNames}
                  emptyHint={ledgerEmptyHint}
                />
              </div>
            </Card>
          )}

          {/* Команда дела */}
          <Card className="p-5">
            <CardLabel className="mb-3">Команда дела</CardLabel>
            <TeamRow
              name={c.lawyer?.full_name}
              roleLabel="Юрист (договор)"
              roleClass="text-cat-representation"
            />
            <TeamRow
              name={c.responsible?.full_name}
              roleLabel="Эксперт (исполнитель)"
              roleClass="text-cat-claim"
            />
          </Card>
        </div>
      </div>

      {/* ── Во всю ширину: платежи и история ───────────────────── */}
      <CasePaymentsBlock caseId={c.id} canWrite={canEdit} canManage={canDelete} />

      <CaseActivityBlock caseId={c.id} />
    </main>
  );
}

// Заголовок секции карточки (caps, как «card-title-sm» в эталоне).
function CardLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        'text-[13px] font-extrabold uppercase tracking-[0.04em] text-text-muted',
        className,
      )}
    >
      {children}
    </h2>
  );
}

// Строка «ключ — значение» в реквизитах.
function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="shrink-0 text-[13px] text-text-muted">{k}</span>
      <span className="text-right text-[13.5px] font-semibold text-text">
        {children}
      </span>
    </div>
  );
}

// Мини-бокс статистики в блоке вознаграждения (сумма / оплачено / долг).
function RewardStat({
  label,
  children,
  valueClassName,
}: {
  label: string;
  children: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex-1 rounded-[10px] bg-surface-sunken px-3 py-2">
      <p className="text-[11px] font-semibold text-text-subtle">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-[15px] font-bold tabular-nums text-text',
          valueClassName,
        )}
      >
        {children}
      </p>
    </div>
  );
}

// Строка участника команды (аватар + имя + роль).
function TeamRow({
  name,
  roleLabel,
  roleClass,
}: {
  name: string | undefined;
  roleLabel: string;
  roleClass: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
      {name ? (
        <>
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-text">
              {name}
            </p>
            <p className={cn('text-[12.5px] font-semibold', roleClass)}>
              {roleLabel}
            </p>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-text-subtle">{roleLabel}: не назначен</p>
      )}
    </div>
  );
}

function Empty() {
  return <span className="text-[13px] text-text-subtle">—</span>;
}
