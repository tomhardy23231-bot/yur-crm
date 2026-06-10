import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Archive,
  Briefcase,
  Building2,
  Check,
  Clock,
  TriangleAlert,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CategoryBadge } from '@/components/ui/category-badge';
import { CaseStageDropdown } from '@/components/cases/case-stage-dropdown';
import { CaseActionBar } from '@/components/cases/case-action-bar';
import { CaseInfoGrid } from '@/components/cases/case-info-grid';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { CaseActivityBlock } from '@/components/activity/case-activity-block';
import { CaseCommentsBlock } from '@/components/comments/case-comments-block';
import { CaseDocumentsBlock } from '@/components/documents/case-documents-block';
import { CaseActsBlock } from '@/components/acts/case-acts-block';
import { CaseTasksBlock } from '@/components/tasks/case-tasks-block';
import { requireUser } from '@/lib/auth/require-role';
import { cn, daysSince, formatMoney, formatPercent } from '@/lib/utils';
import { getCase } from '@/lib/cases/queries';
import { getCasePayroll, getCasePaidByRole } from '@/lib/payroll/queries';
import { caseHasDocOfType } from '@/lib/documents/queries';
import { getOrgRequisites, requisitesAreUsable } from '@/lib/org/queries';
import { getT } from '@/lib/i18n/server';
import { allowedStagesFor, MANAGER_ROLES, STAFF_ROLES } from '@/lib/types/db';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

type Participant = {
  name: string;
  roleLabel: string;
  roleKey: 'lawyer' | 'expert';
  percent: number;
  amount: number;
  paid: number;
  outstanding: number;
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
  const { t, fmt, plural } = await getT();
  const { id } = await params;
  const { error } = await searchParams;

  const c = await getCase(id);
  if (!c) notFound();

  const ERROR_MESSAGES: Record<string, string> = {
    has_links: t.caseCard.detail.errorHasLinks,
    delete_failed: t.caseCard.detail.errorDeleteFailed,
    missing_id: t.caseCard.detail.errorMissingId,
  };

  // Этапы (откат/прыжок) — по роли staff (БД-триггер guard_stage_forward).
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  // owner/admin могут удалять чужие комментарии (зеркало private.can_manage_users).
  const isManager = MANAGER_ROLES.includes(user.profile.role);
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

  // Воронка только вперёд (CLAUDE.md §7-2, Задача 8): staff видит все 5 этапов
  // (может скорректировать), не-staff — только текущий и следующий (без прыжков).
  // БД-триггер защищает в любом случае; это фильтр для UX степпера в шапке.
  const allowedStages = allowedStagesFor(c.stage, isStaff);
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  // Начисление зарплаты (live) + сколько уже выплачено по делу (по ролям) +
  // реквизиты компании (для предупреждения «незаполнены» в блоке актов).
  const [payroll, paidByRole, org] = await Promise.all([
    getCasePayroll(c.id),
    getCasePaidByRole(c.id),
    getOrgRequisites(),
  ]);
  const requisitesUsable = requisitesAreUsable(org);

  // Акты (v2 Этап 5): выписывает Експерт своего дела + staff; подтверждает оплату
  // юрист дела + owner/admin (зеркало RLS / confirm_act_paid).
  const canCreateActs = isStaff || c.responsible_id === user.profile.id;
  // Подтверждает оплату lawyer дела ИЛИ owner/admin (по роли — зеркало
  // confirm_act_paid, гейт role-only can_manage_users(), не cap-оверрайд).
  const canConfirmActs = isManager || c.lawyer_id === user.profile.id;

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
  // Дело в архиве: этап менять нельзя (нужно сперва восстановить — иначе CHECK
  // cases_archived_requires_closed отвергнет откат). Архивируют только staff.
  const isArchived = c.archived_at != null;
  // U6: дни на текущем этапе (для незакрытых дел) + признак «застоя».
  const stageDays = isClosed ? null : daysSince(c.stage_changed_at);
  const stageStale = stageDays !== null && stageDays >= 14;

  // Участники «вознаграждения», с учётом видимости начислений по роли зрителя.
  const participants: Participant[] = [];
  if (payroll) {
    if ((seeAllPayroll || myRole === 'lawyer') && c.lawyer) {
      const paid = Math.min(paidByRole.lawyer, payroll.lawyer_amount);
      participants.push({
        name: c.lawyer.full_name,
        roleLabel: t.caseCard.detail.roleLawyerManager,
        roleKey: 'lawyer',
        percent: payroll.lawyer_percent,
        amount: payroll.lawyer_amount,
        paid: paidByRole.lawyer,
        outstanding: Math.max(0, payroll.lawyer_amount - paid),
        override: c.lawyer_rate_override != null,
      });
    }
    if ((seeAllPayroll || myRole === 'expert') && c.responsible) {
      const paid = Math.min(paidByRole.expert, payroll.expert_amount);
      participants.push({
        name: c.responsible.full_name,
        roleLabel: t.enums.roleInCase.expert,
        roleKey: 'expert',
        percent: payroll.expert_percent,
        amount: payroll.expert_amount,
        paid: paidByRole.expert,
        outstanding: Math.max(0, payroll.expert_amount - paid),
        override: c.expert_rate_override != null,
      });
    }
  }
  const shownReward = participants.reduce((s, p) => s + p.amount, 0);
  const hasOverride = participants.some((p) => p.override);
  // Есть ли что показать в правом сайдбаре (карточка вознаграждения). Если нет —
  // рабочая колонка раскрывается на всю ширину (нет зияющей пустой колонки).
  const showReward = participants.length > 0;

  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      {/* ── Закреплённая панель: «К списку», навигация по секциям, действия ── */}
      <CaseActionBar
        caseId={c.id}
        canEdit={canEdit}
        canDelete={canDelete}
        canArchive={isStaff && (isArchived || isClosed)}
        archived={isArchived}
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
          {t.caseCard.detail.missingActWarning}
        </div>
      )}

      {/* ── Шапка дела ─────────────────────────────────────────── */}
      <Card id="overview" className="scroll-mt-16 px-4 py-3 sm:px-5 sm:py-3.5">
        {/* Верхняя панель: бейджи + клиент слева, тройка сумм справа (как
            верхняя полоса эталонной карточки заказа). */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-extrabold tracking-[0.01em] text-white shadow-sm"
              style={{
                background: 'var(--grad-brass)',
                boxShadow: 'var(--shadow-brand-badge)',
              }}
            >
              <Briefcase size={12} strokeWidth={2.2} />
              {t.caseCard.detail.brandBadge}
            </span>
            <CategoryBadge category={c.category} percent={payroll?.lawyer_percent} />
            <PriorityBadge priority={c.priority} />
            {c.closed_without_act && (
              <Badge
                tone="warning"
                title={t.caseCard.detail.withoutActBadgeTitle}
              >
                {t.caseCard.detail.withoutActBadge}
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
                  · {t.enums.clientKind[c.client.client_kind]}
                </span>
              </span>
            )}
          </div>

          {/* Деньги «одним взглядом»: договор · оплачено · долг/переплата.
              На мобильных — три равные плитки во всю ширину; на ≥ sm — справа.
              Детальная развёртка — в сетке «Финансы и суд» ниже. */}
          <div className="flex w-full items-stretch gap-2 sm:w-auto sm:shrink-0">
            <MoneyStat
              label={t.caseCard.detail.rewardSum}
              value={formatMoney(c.contract_sum)}
            />
            <MoneyStat
              label={t.caseCard.detail.rewardPaid}
              value={formatMoney(c.paid_total)}
              tone="success"
            />
            {c.overpaid > 0 ? (
              <MoneyStat
                label={t.caseCard.detail.rewardOverpaid}
                value={`+${formatMoney(c.overpaid)}`}
                tone="info"
              />
            ) : (
              <MoneyStat
                label={t.caseCard.detail.rewardDebt}
                value={formatMoney(c.debt)}
                tone={c.debt > 0 ? 'error' : 'muted'}
              />
            )}
          </div>
        </div>

        {/* Заголовок дела + выбор этапа (дропдаун воронки — движение только
            вперёд, CLAUDE.md §6). Редактору кликабелен, остальным read-only. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-text">
            {c.number_title}
          </h1>
          {/* В архиве этап не меняем (read-only пилюля) — сперва «Восстановить». */}
          <CaseStageDropdown
            caseId={c.id}
            stage={c.stage}
            allowedStages={allowedStages}
            hasAct={hasAct}
            canEdit={canEdit && !isArchived}
          />
          {isArchived && (
            <Badge tone="neutral" className="gap-1">
              <Archive size={12} strokeWidth={2} />
              {t.cases.archive.badge}
            </Badge>
          )}
        </div>
        {isArchived && (
          <p className="mt-1.5 text-[12px] text-text-subtle">
            {t.cases.archive.detailHint}
          </p>
        )}

        {/* Мета: тип дела · открыто/завершено · предмет договора · дни на этапе. */}
        <p className="mt-1 text-[12.5px] text-text-muted">
          {t.enums.caseType[c.case_type]} · {t.caseCard.detail.openedAt}{' '}
          {DATE_FMT.format(new Date(c.opened_at))}
          {c.closed_at && (
            <>
              {' '}
              · {t.caseCard.detail.closedAt}{' '}
              {DATE_FMT.format(new Date(c.closed_at))}
            </>
          )}
          {c.subject && <> · {c.subject}</>}
        </p>

        {/* U6: сколько дней дело на текущем этапе (видно «зависшие»). */}
        {stageDays !== null && (
          <p
            className={cn(
              'mt-1.5 inline-flex items-center gap-1.5 text-[12px]',
              stageStale ? 'font-medium text-warning' : 'text-text-subtle',
            )}
          >
            <Clock size={13} strokeWidth={1.75} />
            {plural(t.caseCard.detail.stageDays, stageDays)}
          </p>
        )}

        {c.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Детальная сетка «поле: значение»: Дело · Клиент · Финансы/Суд
            (по эталону карточки заказа). */}
        <div className="mt-4 border-t border-border pt-4">
          <CaseInfoGrid c={c} canWrite={canEdit} canManage={canManagePay} />
        </div>
      </Card>

      {/* ── Ряд A: комментарии · sticky-сайдбар «Вознаграждение команды».
           items-start, чтобы сайдбар мог прилипать. Без начислений — одна
           колонка во всю ширину. ── */}
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-5',
          showReward && 'lg:grid-cols-[1.6fr_1fr]',
        )}
      >
        {/* Левая: комментарии — рядом со sticky-сайдбаром вознаграждения. */}
        <section id="comments" className="scroll-mt-16">
          <CaseCommentsBlock
            caseId={c.id}
            canWrite={canEdit}
            currentUserId={user.profile.id}
            currentUserName={user.profile.full_name}
            isManager={isManager}
          />
        </section>

        {/* Правая: вознаграждение команды — прилипает при скролле рабочей колонки. */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-16 lg:self-start">
          {payroll && participants.length > 0 && (
            <Card className="p-4">
              <CardLabel className="mb-2.5">
                {t.caseCard.detail.rewardTitle}
              </CardLabel>

              {/* Деньги одной строкой (компактнее трёх плиток + прогресса). */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] bg-surface-sunken px-3 py-2 text-[12px] tabular-nums">
                <span className="text-text-muted">
                  {t.caseCard.detail.rewardSum}{' '}
                  <span className="font-bold text-text">
                    {formatMoney(c.contract_sum)} ₴
                  </span>
                </span>
                <span className="text-text-subtle">·</span>
                <span className="text-text-muted">
                  {t.caseCard.detail.rewardPaid}{' '}
                  <span className="font-bold text-success">
                    {formatMoney(c.paid_total)} ₴
                  </span>
                </span>
                <span className="text-text-subtle">·</span>
                <span className="text-text-muted">
                  {c.overpaid > 0
                    ? t.caseCard.detail.rewardOverpaid
                    : t.caseCard.detail.rewardDebt}{' '}
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
                  {t.caseCard.detail.rateOverridden}
                </p>
              )}

              <div className="mt-2">
                {participants.map((p) => {
                  const fullyPaid = p.amount > 0 && p.outstanding <= 0.001;
                  const paidPct =
                    p.amount > 0
                      ? Math.min(100, Math.round((Math.min(p.paid, p.amount) / p.amount) * 100))
                      : 0;
                  return (
                    <div
                      key={p.roleKey}
                      className="border-b border-border py-2 last:border-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar name={p.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-text">
                            {p.name}
                          </p>
                          <p className="text-[11.5px] font-medium text-text-muted">
                            {p.roleLabel} · {formatPercent(p.percent)}%
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="whitespace-nowrap rounded-md bg-surface-sunken px-2.5 py-1 text-[14px] font-bold tabular-nums text-text">
                            {formatMoney(p.amount)} ₴
                          </span>
                          {p.amount > 0 &&
                            (fullyPaid ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                                <Check size={11} strokeWidth={2.5} />
                                {t.caseCard.detail.fullyPaid}
                              </span>
                            ) : p.paid > 0 ? (
                              <span className="whitespace-nowrap text-[11px] font-medium text-warning">
                                {fmt(t.caseCard.detail.partiallyPaid, {
                                  paid: formatMoney(p.paid),
                                  outstanding: formatMoney(p.outstanding),
                                })}
                              </span>
                            ) : (
                              <span className="text-[11px] text-text-subtle">
                                {t.caseCard.detail.notPaid}
                              </span>
                            ))}
                        </div>
                      </div>
                      {/* Прогресс-бар выплаты (бриф §7): доля выплаченного — зелёным. */}
                      {p.amount > 0 && (
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            className="h-full rounded-full bg-success transition-[width] duration-300"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t-2 border-surface-sunken pt-2.5">
                <span className="text-[13px] font-extrabold tracking-[0.01em] text-text">
                  {seeAllPayroll
                    ? t.caseCard.detail.caseFund
                    : t.caseCard.detail.myAccrual}
                </span>
                <span className="text-[17px] font-extrabold tabular-nums text-text">
                  {formatMoney(seeAllPayroll && payroll ? payroll.total : shownReward)} ₴
                </span>
              </div>

              {/* Выплаты больше не «фиксируются при закрытии»: их отмечает
                  owner/admin на карточке сотрудника (Финансы и ЗП). */}
              {(() => {
                const shownPaid = participants.reduce((s, p) => s + Math.min(p.paid, p.amount), 0);
                const shownOutstanding = participants.reduce((s, p) => s + p.outstanding, 0);
                return (
                  <div className="mt-2 flex items-center justify-between rounded-[8px] bg-surface-sunken px-3 py-2 text-[12px] tabular-nums">
                    <span className="text-text-muted">
                      {t.caseCard.detail.paidLabel}{' '}
                      <span className="font-bold text-success">
                        {formatMoney(shownPaid)} ₴
                      </span>
                    </span>
                    <span className="text-text-muted">
                      {t.caseCard.detail.outstandingLabel}{' '}
                      <span className="font-bold text-warning">
                        {formatMoney(shownOutstanding)} ₴
                      </span>
                    </span>
                  </div>
                );
              })()}
              <p className="mt-2 text-[11px] leading-snug text-text-subtle">
                {t.caseCard.detail.payoutHint}
              </p>
            </Card>
          )}
        </aside>
      </div>

      {/* ── Ряд B: акты, документы и задачи во всю ширину (раньше тут были
           комментарии; поменяли местами с рабочей колонкой выше). ── */}
      <div className="flex flex-col gap-5">
        {/* Акты (Рахунок-Акт) — v2 Этап 5 */}
        <section id="acts" className="scroll-mt-16">
          <CaseActsBlock
            caseId={c.id}
            canCreate={canCreateActs}
            canConfirm={canConfirmActs}
            isManager={isManager}
            isStaff={isStaff}
            currentUserId={user.profile.id}
            requisitesUsable={requisitesUsable}
          />
        </section>

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

      {/* ── Ряд C: история — во всю ширину рабочего лотка (в пределах max-width). ── */}
      <section id="history" className="scroll-mt-16">
        <CaseActivityBlock caseId={c.id} />
      </section>
    </main>
  );
}

// Компактная плитка суммы для верхней полосы шапки (договор / оплачено / долг).
// Подпись сверху, моноширинное значение снизу — как итоговые суммы на эталоне.
function MoneyStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'error' | 'info' | 'muted';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'error'
        ? 'text-error'
        : tone === 'info'
          ? 'text-info'
          : tone === 'muted'
            ? 'text-text-muted'
            : 'text-text';
  return (
    <div className="flex flex-1 flex-col items-end rounded-[8px] bg-surface-sunken px-2.5 py-1.5 sm:min-w-[88px] sm:flex-none sm:px-3">
      <span className="text-[10px] font-medium uppercase tracking-[0.03em] text-text-subtle">
        {label}
      </span>
      <span
        className={cn(
          'text-[14px] font-bold tabular-nums',
          valueClass,
        )}
      >
        {value} ₴
      </span>
    </div>
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

