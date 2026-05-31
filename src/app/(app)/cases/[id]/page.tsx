import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Briefcase,
  Building2,
  Clock,
  TriangleAlert,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CategoryBadge } from '@/components/ui/category-badge';
import { StageStepper } from '@/components/cases/stage-stepper';
import { CaseStageStepper } from '@/components/cases/case-stage-stepper';
import { CaseActionBar } from '@/components/cases/case-action-bar';
import { BillingTypesBadges } from '@/components/cases/billing-types-badges';
import { CaseLedgerBlock } from '@/components/payroll/case-ledger-block';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { CaseActivityBlock } from '@/components/activity/case-activity-block';
import { CaseDocumentsBlock } from '@/components/documents/case-documents-block';
import { CasePaymentsBlock } from '@/components/payments/case-payments-block';
import { CaseTasksBlock } from '@/components/tasks/case-tasks-block';
import { requireUser } from '@/lib/auth/require-role';
import { cn, daysSince, formatMoney, formatPercent, pluralDays } from '@/lib/utils';
import { getCase } from '@/lib/cases/queries';
import { getCasePayroll, listLedgerByCase } from '@/lib/payroll/queries';
import { caseHasDocOfType } from '@/lib/documents/queries';
import {
  allowedStagesFor,
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

  // Этапы (откат/прыжок) — по роли staff (БД-триггер guard_stage_forward).
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  // Видимость зарплаты по делу — по праву view_all_payroll (иначе только своё).
  const seeAllPayroll = user.caps.view_all_payroll;
  // RLS UPDATE = view_all_cases OR lawyer_id/responsible_id = uid. Маскируем Edit.
  const canEdit =
    user.caps.view_all_cases ||
    c.responsible_id === user.profile.id ||
    c.lawyer_id === user.profile.id;
  const canDelete = user.caps.delete_cases;
  const canDeleteDoc = user.caps.delete_documents;
  const canManagePay = user.caps.edit_payments;
  // Отметка «выплачено»/откат в леджере — owner/admin по роли (не настраиваемое право).
  const canManageLedger =
    user.profile.role === 'owner' || user.profile.role === 'admin';

  // Воронка только вперёд (CLAUDE.md §7-2, Задача 8): staff видит все 5 этапов
  // (может скорректировать), не-staff — только текущий и следующий (без прыжков).
  // БД-триггер защищает в любом случае; это фильтр для UX степпера в шапке.
  const allowedStages = allowedStagesFor(c.stage, isStaff);
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

  // Есть ли акт приёма-передачи. Нужен и для мягкого предупреждения (дело уже
  // закрыто без акта), и для подтверждения при попытке закрыть без акта (степпер).
  const hasAct = await caseHasDocOfType(c.id, 'act');
  const missingAct = c.stage === 'closed' && !hasAct;

  const isClosed = c.stage === 'closed';
  // U6: дни на текущем этапе (для незакрытых дел) + признак «застоя».
  const stageDays = isClosed ? null : daysSince(c.stage_changed_at);
  const stageStale = stageDays !== null && stageDays >= 14;

  // Участники «вознаграждения», с учётом видимости начислений по роли зрителя.
  const participants: Participant[] = [];
  if (payroll) {
    if ((seeAllPayroll || myRole === 'lawyer') && c.lawyer) {
      participants.push({
        name: c.lawyer.full_name,
        roleLabel: 'Юрист-менеджер',
        percent: payroll.lawyer_percent,
        amount: payroll.lawyer_amount,
        override: c.lawyer_rate_override != null,
      });
    }
    if ((seeAllPayroll || myRole === 'expert') && c.responsible) {
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
      {/* ── Закреплённая панель: «К списку», навигация по секциям, действия ── */}
      <CaseActionBar
        caseId={c.id}
        canEdit={canEdit}
        canDelete={canDelete}
        caseTitle={c.number_title}
      />

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
      <Card id="overview" className="scroll-mt-16 px-4 py-3 sm:px-5 sm:py-3.5">
        {/* Верхняя панель: мета слева, этап + действия справа — одна линия */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-extrabold tracking-[0.01em] text-white shadow-sm"
              style={{
                background: 'var(--grad-brass)',
                boxShadow: 'var(--shadow-brand-badge)',
              }}
            >
              <Briefcase size={12} strokeWidth={2.2} />
              Дело
            </span>
            <CategoryBadge category={c.category} percent={payroll?.lawyer_percent} />
            <PriorityBadge priority={c.priority} />
            {c.closed_without_act && (
              <Badge
                tone="warning"
                title="Дело завершено без акта приёма-передачи"
              >
                без акта
              </Badge>
            )}
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

          {/* Мета (тип · дата · предмет) переехала сюда из-под заголовка —
              экономит отдельную строку по высоте. Текущий этап виден в степпере
              ниже, отдельный бейдж не нужен. Действия — в панели сверху. */}
          <p className="text-[12.5px] text-text-muted">
            {CASE_TYPE_LABEL[c.case_type]} · открыто{' '}
            {DATE_FMT.format(new Date(c.opened_at))}
            {c.closed_at && (
              <> · завершено {DATE_FMT.format(new Date(c.closed_at))}</>
            )}
            {c.subject && <> · {c.subject}</>}
          </p>
        </div>

        {/* Заголовок дела */}
        <h1 className="mt-2 text-[20px] font-bold leading-tight tracking-[-0.01em] text-text">
          {c.number_title}
        </h1>

        {c.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Уникальные поля бывшего блока «Реквизиты» (тип оплаты + суд) —
            всё остальное там дублировало шапку. Показываем, только когда есть. */}
        {(c.billing_types.length > 0 ||
          c.opponent ||
          c.court ||
          c.court_case_number) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-text-muted">
            {c.billing_types.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-text-subtle">Оплата:</span>
                <BillingTypesBadges types={c.billing_types} />
              </span>
            )}
            {c.opponent && (
              <span>
                <span className="text-text-subtle">Оппонент:</span> {c.opponent}
              </span>
            )}
            {c.court && (
              <span>
                <span className="text-text-subtle">Суд:</span> {c.court}
              </span>
            )}
            {c.court_case_number && (
              <span>
                <span className="text-text-subtle">№ дела:</span>{' '}
                <span className="font-mono tabular-nums">
                  {c.court_case_number}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Степпер воронки — движение только вперёд (CLAUDE.md §6).
            Редактору кликабелен (смена этапа), остальным — read-only. */}
        <div className="mt-2.5">
          {canEdit ? (
            <CaseStageStepper
              caseId={c.id}
              stage={c.stage}
              allowedStages={allowedStages}
              hasAct={hasAct}
            />
          ) : (
            <StageStepper stage={c.stage} />
          )}
        </div>

        {/* U6: сколько дней дело на текущем этапе (видно «зависшие»). */}
        {stageDays !== null && (
          <p
            className={cn(
              'mt-1.5 inline-flex items-center gap-1.5 text-[12px]',
              stageStale ? 'font-medium text-warning' : 'text-text-subtle',
            )}
          >
            <Clock size={13} strokeWidth={1.75} />
            На текущем этапе {stageDays} {pluralDays(stageDays)}
          </p>
        )}
      </Card>

      {/* ── Две колонки ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.9fr_1fr]">
        {/* Левая: документы + задачи. Бывший блок «Реквизиты дела» удалён —
            уникальные поля (тип оплаты, суд) перенесены в шапку, остальное
            дублировало её. */}
        <div className="flex flex-col gap-5">
          {/* Документы (Шаг 8) */}
          <section id="documents" className="scroll-mt-16">
            <CaseDocumentsBlock
              caseId={c.id}
              canWrite={canEdit}
              canDelete={canDeleteDoc}
            />
          </section>

          {/* Задачи и заседания (Шаг 7) */}
          <section id="tasks" className="scroll-mt-16">
            <CaseTasksBlock
              caseId={c.id}
              canWrite={canEdit}
              currentUserId={user.profile.id}
            />
          </section>
        </div>

        {/* Правая: вознаграждение команды (с составом команды внутри) */}
        <div className="flex flex-col gap-5">
          {payroll && participants.length > 0 && (
            <Card className="p-4">
              <CardLabel className="mb-2.5">Вознаграждение команды</CardLabel>

              {/* Деньги одной строкой (компактнее трёх плиток + прогресса). */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] bg-surface-sunken px-3 py-2 font-mono text-[12px] tabular-nums">
                <span className="text-text-muted">
                  Сумма{' '}
                  <span className="font-bold text-text">
                    {formatMoney(c.contract_sum)} ₴
                  </span>
                </span>
                <span className="text-text-subtle">·</span>
                <span className="text-text-muted">
                  Оплачено{' '}
                  <span className="font-bold text-success">
                    {formatMoney(c.paid_total)} ₴
                  </span>
                </span>
                <span className="text-text-subtle">·</span>
                <span className="text-text-muted">
                  {c.overpaid > 0 ? 'Переплата' : 'Долг'}{' '}
                  <span
                    className={cn(
                      'font-bold',
                      c.overpaid > 0
                        ? 'text-info'
                        : c.debt > 0
                          ? 'text-error'
                          : 'text-text-muted',
                    )}
                  >
                    {c.overpaid > 0
                      ? `+${formatMoney(c.overpaid)} ₴`
                      : `${formatMoney(c.debt)} ₴`}
                  </span>
                </span>
              </div>

              {hasOverride && (
                <p className="mt-2 text-[11px] font-medium text-primary">
                  Ставка переопределена вручную
                </p>
              )}

              <div className="mt-2">
                {participants.map((p) => (
                  <div
                    key={p.roleLabel}
                    className="flex items-center gap-2.5 border-b border-border py-2 last:border-0"
                  >
                    <Avatar name={p.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-text">
                        {p.name}
                      </p>
                      <p className="text-[11.5px] font-medium text-text-muted">
                        {p.roleLabel} · {formatPercent(p.percent)}%
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-md bg-success-bg px-2.5 py-1 font-mono text-[14px] font-bold tabular-nums text-success">
                      {formatMoney(p.amount)} ₴
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t-2 border-surface-sunken pt-2.5">
                <span className="text-[13px] font-extrabold tracking-[0.01em] text-text">
                  {seeAllPayroll ? 'Фонд по делу' : 'Моё начисление'}
                </span>
                <span className="font-mono text-[17px] font-extrabold tabular-nums text-text">
                  {formatMoney(seeAllPayroll && payroll ? payroll.total : shownReward)} ₴
                </span>
              </div>

              {/* Зафиксированные начисления/выплаты (P1.3). */}
              <div className="-mx-4 mt-3">
                <CaseLedgerBlock
                  entries={ledger}
                  canManage={canManageLedger}
                  names={ledgerNames}
                  emptyHint={ledgerEmptyHint}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Во всю ширину: платежи и история ───────────────────── */}
      <section id="finance" className="scroll-mt-16">
        <CasePaymentsBlock
          caseId={c.id}
          canWrite={canEdit}
          canManage={canManagePay}
          overpaid={c.overpaid}
        />
      </section>

      <section id="history" className="scroll-mt-16">
        <CaseActivityBlock caseId={c.id} />
      </section>
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

