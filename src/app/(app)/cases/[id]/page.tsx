import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Archive,
  Ban,
  Building2,
  Calendar,
  CalendarCheck,
  Check,
  Clock,
  TriangleAlert,
  UserRound,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CategoryBadge } from '@/components/ui/category-badge';
import { CaseStageDropdown } from '@/components/cases/case-stage-dropdown';
import { CaseDescriptionBlock } from '@/components/cases/case-description-block';
import { CaseQuickActions } from '@/components/cases/case-quick-actions';
import { CaseActionBar } from '@/components/cases/case-action-bar';
import { PaymentProgress } from '@/components/cases/payment-progress';
import { CaseInfoGrid } from '@/components/cases/case-info-grid';
import { CaseNextActions } from '@/components/cases/case-next-actions';
import { CaseTabs } from '@/components/cases/case-tabs';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { CaseActivityBlock } from '@/components/activity/case-activity-block';
import { CaseCommentsBlock } from '@/components/comments/case-comments-block';
import { CaseDocumentsBlock } from '@/components/documents/case-documents-block';
import { CaseActsBlock } from '@/components/acts/case-acts-block';
import { PaymentPlanBlock } from '@/components/payments/payment-plan-block';
import { PaymentsList } from '@/components/payments/payments-list';
import { CaseTasksBlock } from '@/components/tasks/case-tasks-block';
import { requireUser } from '@/lib/auth/require-role';
import { cn, daysSince, formatMoney, formatPercent } from '@/lib/utils';
import { getCase } from '@/lib/cases/queries';
import { STALE_STAGE_DAYS } from '@/lib/cases/constants';
import { getCasePayroll, getCasePaidByRole } from '@/lib/payroll/queries';
import { caseHasDocOfType, listDocumentsByCase } from '@/lib/documents/queries';
import { listPaymentsByCase } from '@/lib/payments/queries';
import { listActsByCase } from '@/lib/acts/queries';
import { listTasksByCase } from '@/lib/tasks/queries';
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
  const { t, fmt } = await getT();
  const { id } = await params;
  const { error } = await searchParams;

  const c = await getCase(id);
  if (!c) notFound();

  const ERROR_MESSAGES: Record<string, string> = {
    has_links: t.caseCard.detail.errorHasLinks,
    delete_failed: t.caseCard.detail.errorDeleteFailed,
    missing_id: t.caseCard.detail.errorMissingId,
    act_delete_failed: t.caseCard.detail.errorActDeleteFailed,
    act_update_failed: t.caseCard.detail.errorActUpdateFailed,
    archive_failed: t.caseCard.detail.errorArchiveFailed,
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
  // Кнопка-корзинка в списке платежей — право delete_payments (сплит 2026-07-16;
  // edit_payments остаётся за правкой платежей — UI правки пока нет).
  const canManagePay = user.caps.delete_payments;

  // Воронка только вперёд (CLAUDE.md §7-2, Задача 8): staff видит все 5 этапов
  // (может скорректировать), не-staff — только текущий и следующий (без прыжков).
  // БД-триггер защищает в любом случае; это фильтр для UX степпера в шапке.
  const allowedStages = allowedStagesFor(c.stage, isStaff);
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  // Начисление зарплаты (live) + сколько уже выплачено по делу (по ролям) +
  // реквизиты компании (для предупреждения «незаполнены» в блоке актов) +
  // есть ли акт приёма-передачи + данные для счётчиков вкладок.
  const [payroll, paidByRole, org, hasAct, payments, actsList, docsList, tasksList] =
    await Promise.all([
      getCasePayroll(c.id),
      getCasePaidByRole(c.id),
      getOrgRequisites(),
      caseHasDocOfType(c.id, 'act'),
      // Платежи нужны и вкладке «Платежи» (список), и её корешку (счётчик).
      listPaymentsByCase(c.id),
      listActsByCase(c.id),
      listDocumentsByCase(c.id),
      listTasksByCase(c.id),
    ]);
  const requisitesUsable = requisitesAreUsable(org);
  const actsCount = actsList.length;
  const docsCount = docsList.length;
  const tasksOpenCount = tasksList.filter((tk) => tk.status === 'open').length;

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

  // hasAct (см. батч выше) — для мягкого предупреждения «дело закрыто без акта»
  // и для подтверждения при попытке закрыть без акта (степпер).
  const missingAct = c.stage === 'closed' && !hasAct;

  const isClosed = c.stage === 'closed';
  // v3 s7: дело закрыто как «не заключили» (lost) — серый бейдж + причина в шапке.
  const isLost = c.outcome === 'lost';
  // Дело в архиве: этап менять нельзя (нужно сперва восстановить — иначе CHECK
  // cases_archived_requires_closed отвергнет откат). Архивируют только staff.
  const isArchived = c.archived_at != null;
  // U6: дни на текущем этапе (для незакрытых дел) + признак «застоя».
  const stageDays = isClosed ? null : daysSince(c.stage_changed_at);
  const stageStale = stageDays !== null && stageDays >= STALE_STAGE_DAYS;

  // Процент оплаты — для акцент-полосы шапки и карточки «Итого» вкладки платежей.
  const paidPct =
    c.contract_sum > 0
      ? Math.min(100, Math.round((c.paid_total / c.contract_sum) * 100))
      : 0;

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

  // ── Вкладка «Обзор»: рабочая колонка + sticky-сайдбар (по каркасу).
  // Правка владельца 14.07: слева — редактируемое «Описание дела» (+ теги),
  // справа — «Детали дела» над «Вознаграждением команды»; история — только
  // на своей вкладке. ──
  const overviewPanel = (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-4">
        {!isClosed && (
          <CaseNextActions
            caseId={c.id}
            paidTotal={c.paid_total}
            debt={c.debt}
            hasAct={hasAct}
            stage={c.stage}
          />
        )}

        {/* Описание дела: свободный текст (редактируется, журналируется) + теги. */}
        <CaseDescriptionBlock
          caseId={c.id}
          description={c.description}
          tags={c.tags}
          canWrite={canEdit}
        />

        <section id="comments" className="scroll-mt-16">
          <CaseCommentsBlock
            caseId={c.id}
            canWrite={canEdit}
            currentUserId={user.profile.id}
            currentUserName={user.profile.full_name}
            isManager={isManager}
          />
        </section>
      </div>

      {/* Сайдбар: детали дела + вознаграждение команды. */}
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
        {/* Детальная сетка «поле: значение» — одной колонкой в сайдбаре.
            Inline-карандаши: поля дела — по праву записи (не в архиве),
            категория — staff, контакты клиента — staff или автор записи. */}
        <Card className="p-5">
          <CardLabel className="mb-3.5 text-[15px] text-text">{t.caseCard.detail.detailsTitle}</CardLabel>
          <CaseInfoGrid
            c={c}
            stacked
            edit={{
              caseFields: canEdit && !isArchived,
              category: isStaff && !isArchived,
              client:
                !!c.client &&
                (user.caps.view_all_cases ||
                  c.client.created_by === user.profile.id),
            }}
          />
        </Card>

        {payroll && participants.length > 0 && (
          <Card className="p-4">
            <CardLabel className="mb-2.5">
              {t.caseCard.detail.rewardTitle}
            </CardLabel>

            {hasOverride && (
              <p className="mt-2 text-[11px] font-medium text-primary">
                {t.caseCard.detail.rateOverridden}
              </p>
            )}

            <div className="mt-2">
              {participants.map((p) => {
                const fullyPaid = p.amount > 0 && p.outstanding <= 0.001;
                const pct =
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
                        <span className="whitespace-nowrap rounded-md bg-surface-sunken px-2.5 py-1 font-mono text-[14px] font-bold tabular-nums text-text">
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
                          style={{ width: `${pct}%` }}
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
              <span className="font-mono text-[17px] font-extrabold tabular-nums text-text">
                {formatMoney(seeAllPayroll && payroll ? payroll.total : shownReward)} ₴
              </span>
            </div>

            {/* Выплаты больше не «фиксируются при закрытии»: их отмечает
                owner/admin на карточке сотрудника (Финансы и ЗП). */}
            {(() => {
              const shownPaid = participants.reduce(
                (s, p) => s + Math.min(p.paid, p.amount),
                0,
              );
              const shownOutstanding = participants.reduce(
                (s, p) => s + p.outstanding,
                0,
              );
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
  );

  // ── Вкладка «Платежи»: история + «Итого» + график платежей ──
  const paymentsPanel = (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <PaymentsList
            payments={payments}
            caseId={c.id}
            canWrite={canEdit}
            canManage={canManagePay}
            overpaid={c.overpaid}
          />
        </Card>

        <Card className="p-5">
          <CardLabel className="mb-3">{t.caseCard.detail.totalsTitle}</CardLabel>
          <div className="flex flex-col gap-2.5">
            <TotalsRow
              label={t.caseCard.detail.rewardSum}
              value={`${formatMoney(c.contract_sum)} ₴`}
            />
            <TotalsRow
              label={t.caseCard.detail.rewardPaid}
              value={`${formatMoney(c.paid_total)} ₴`}
              tone="success"
            />
            {c.overpaid > 0 ? (
              <TotalsRow
                label={t.caseCard.detail.rewardOverpaid}
                value={`+${formatMoney(c.overpaid)} ₴`}
                tone="info"
              />
            ) : (
              <TotalsRow
                label={t.caseCard.detail.rewardDebt}
                value={`${formatMoney(c.debt)} ₴`}
                tone={c.debt > 0 ? 'error' : 'muted'}
              />
            )}
            <div className="mt-1">
              <PaymentProgress paid={c.paid_total} total={c.contract_sum} />
            </div>
            <p className="text-center text-[11.5px] text-text-subtle">
              {fmt(t.caseCard.detail.totalsPct, { pct: paidPct })}
            </p>
          </div>
        </Card>
      </div>

      <section id="plan" className="scroll-mt-16">
        <PaymentPlanBlock caseId={c.id} paidTotal={c.paid_total} canWrite={canEdit} />
      </section>
    </div>
  );

  return (
    <main className="flex flex-col gap-3 px-3 py-1.5 sm:px-4">
      {/* ── Закреплённая панель: «К списку» + действия над делом ── */}
      <CaseActionBar
        caseId={c.id}
        canEdit={canEdit}
        canDelete={canDelete}
        canArchive={isStaff && (isArchived || isClosed)}
        canMarkLost={
          !isLost &&
          (c.stage === 'new_request' || c.stage === 'consultation') &&
          (isStaff || c.lawyer_id === user.profile.id) &&
          !isArchived
        }
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

      {/* ── Шапка дела (по каркасу): бейджи → заголовок → клиент →
           инфо-плитки → акцент-полоса «Оплата по делу». ──
           overflow-visible: дефолтный overflow-hidden Card обрезал меню
           этап-дропдауна; скругление низа держит сама полоса оплаты. */}
      <Card id="overview" className="scroll-mt-16 overflow-visible">
        <div className="flex flex-col gap-2 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              {/* Бейджи: этап (рабочий дропдаун) · категория · приоритет · статусы. */}
              <div className="flex flex-wrap items-center gap-2">
                <CaseStageDropdown
                  caseId={c.id}
                  stage={c.stage}
                  allowedStages={allowedStages}
                  hasAct={hasAct}
                  canEdit={canEdit && !isArchived}
                />
                <CategoryBadge
                  category={c.category}
                  percent={payroll?.lawyer_percent}
                />
                <PriorityBadge priority={c.priority} />
                {c.closed_without_act && (
                  <Badge tone="warning" title={t.caseCard.detail.withoutActBadgeTitle}>
                    {t.caseCard.detail.withoutActBadge}
                  </Badge>
                )}
                {isLost && (
                  <Badge tone="neutral" className="gap-1" title={t.cases.lost.badgeTitle}>
                    <Ban size={12} strokeWidth={2} />
                    {t.cases.lost.badge}
                  </Badge>
                )}
                {isArchived && (
                  <Badge tone="neutral" className="gap-1">
                    <Archive size={12} strokeWidth={2} />
                    {t.cases.archive.badge}
                  </Badge>
                )}
              </div>

              <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">
                {c.number_title}
              </h1>

              {c.client && (
                <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-muted">
                  {c.client.client_kind === 'company' ? (
                    <Building2 size={13} strokeWidth={1.75} />
                  ) : (
                    <UserRound size={13} strokeWidth={1.75} />
                  )}
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

              {isLost && c.lost_reason && (
                <p className="text-[12px] text-text-subtle">
                  {t.cases.lost.reasonPrefix} {c.lost_reason}
                </p>
              )}
              {isArchived && (
                <p className="text-[12px] text-text-subtle">
                  {t.cases.archive.detailHint}
                </p>
              )}
            </div>

            {/* Быстрые действия (гейтинг — как у форм секций). */}
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
              <CaseQuickActions
                caseId={c.id}
                canAddPayment={canEdit}
                canAddTask={canEdit}
                canAddAct={canCreateActs}
              />
            </div>
          </div>

          {/* Инфо-плитки: Открыто · Дней на этапе/Завершено · Юрист · Эксперт. */}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-2.5 sm:grid-cols-4">
            <InfoTile
              icon={<Calendar size={13} strokeWidth={1.75} />}
              label={t.caseCard.detail.tileOpened}
            >
              <span className="tabular-nums">
                {DATE_FMT.format(new Date(c.opened_at))}
              </span>
            </InfoTile>
            {isClosed ? (
              <InfoTile
                icon={<CalendarCheck size={13} strokeWidth={1.75} />}
                label={t.caseCard.detail.tileClosed}
              >
                <span className="tabular-nums">
                  {c.closed_at
                    ? DATE_FMT.format(new Date(c.closed_at))
                    : t.caseCard.overview.dash}
                </span>
              </InfoTile>
            ) : (
              <InfoTile
                icon={<Clock size={13} strokeWidth={1.75} />}
                label={t.caseCard.detail.tileStageDays}
                warn={stageStale}
              >
                <span className="tabular-nums">
                  {stageDays ?? t.caseCard.overview.dash}
                </span>
              </InfoTile>
            )}
            <InfoTile
              icon={<UserRound size={13} strokeWidth={1.75} />}
              label={t.caseCard.detail.tileLawyer}
            >
              {c.lawyer ? (
                <>
                  <Avatar name={c.lawyer.full_name} size="sm" />
                  <span className="truncate">{c.lawyer.full_name}</span>
                </>
              ) : (
                t.caseCard.overview.dash
              )}
            </InfoTile>
            <InfoTile
              icon={<UserRound size={13} strokeWidth={1.75} />}
              label={t.caseCard.detail.tileExpert}
            >
              {c.responsible ? (
                <>
                  <Avatar name={c.responsible.full_name} size="sm" />
                  <span className="truncate">{c.responsible.full_name}</span>
                </>
              ) : (
                t.caseCard.overview.dash
              )}
            </InfoTile>
          </div>
        </div>

        {/* Акцент-полоса оплаты (каркас): подпись слева, суммы mono справа,
            прогресс во всю ширину. Долг/переплата — чипами рядом с суммами.
            Нижнее скругление своё (внутренний радиус = карточка − 1px бордер),
            т.к. Card здесь overflow-visible ради меню этапов. */}
        <div className="flex flex-col gap-1 rounded-b-[calc(var(--r-card)_-_1px)] border-t border-border bg-primary-softer/40 px-4 py-2 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[12.5px]">
            <span className="font-semibold text-text">
              {t.caseCard.detail.paymentStripTitle}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {c.debt > 0 && (
                <span className="rounded-full bg-error-bg px-2 py-0.5 text-[11px] font-semibold text-error-text">
                  {fmt(t.caseCard.detail.paymentStripDebt, {
                    amount: formatMoney(c.debt),
                  })}
                </span>
              )}
              {c.overpaid > 0 && (
                <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-text">
                  {fmt(t.caseCard.detail.paymentStripOverpaid, {
                    amount: formatMoney(c.overpaid),
                  })}
                </span>
              )}
              <span className="font-mono font-bold tabular-nums text-primary-pressed">
                {formatMoney(c.paid_total)} / {formatMoney(c.contract_sum)} ₴ ·{' '}
                {paidPct}%
              </span>
            </span>
          </div>
          <PaymentProgress paid={c.paid_total} total={c.contract_sum} />
        </div>
      </Card>

      {/* ── Разделы дела: вкладки (обзор — по умолчанию). tabKey = id раздела
           ('tasks'/'acts'/…) для быстрых действий и якорей. ── */}
      <CaseTabs
        ariaLabel={t.caseCard.actionBar.tabsAria}
        defaultTab="overview"
        tabs={[
          {
            key: 'overview',
            label: t.caseCard.actionBar.sectionOverview,
            panel: overviewPanel,
          },
          {
            key: 'tasks',
            label: t.caseCard.actionBar.sectionTasks,
            count: tasksOpenCount,
            panel: (
              <CaseTasksBlock
                caseId={c.id}
                canWrite={canEdit}
                currentUserId={user.profile.id}
              />
            ),
          },
          {
            key: 'payments',
            label: t.caseCard.actionBar.sectionPayments,
            count: payments.length,
            panel: paymentsPanel,
          },
          {
            key: 'acts',
            label: t.acts.block.heading,
            count: actsCount,
            panel: (
              <CaseActsBlock
                caseId={c.id}
                canCreate={canCreateActs}
                canConfirm={canConfirmActs}
                isManager={isManager}
                isStaff={isStaff}
                currentUserId={user.profile.id}
                requisitesUsable={requisitesUsable}
              />
            ),
          },
          {
            key: 'documents',
            label: t.caseCard.actionBar.sectionDocuments,
            count: docsCount,
            panel: (
              <CaseDocumentsBlock
                caseId={c.id}
                canWrite={canEdit}
                canDelete={canDeleteDoc}
              />
            ),
          },
          {
            key: 'history',
            label: t.caseCard.actionBar.sectionHistory,
            panel: <CaseActivityBlock caseId={c.id} limit={20} />,
          },
        ]}
      />
    </main>
  );
}

// Инфо-плитка шапки (каркас): подпись 11px caps с иконкой сверху, значение
// 13.5px semibold снизу (дата/дни — tabular, сотрудник — аватар + имя).
function InfoTile({
  icon,
  label,
  warn = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  /** Подсветить значение как «застой» (дни на этапе ≥ порога). */
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-subtle">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold',
          warn ? 'text-warning' : 'text-text',
        )}
      >
        {children}
      </span>
    </div>
  );
}

// Строка карточки «Итого» вкладки платежей: подпись слева, mono-сумма справа.
function TotalsRow({
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
      ? 'text-success-text'
      : tone === 'error'
        ? 'text-error'
        : tone === 'info'
          ? 'text-info'
          : tone === 'muted'
            ? 'text-text-muted'
            : 'text-text';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-text-muted">{label}</span>
      <span className={cn('font-mono text-[14px] font-bold tabular-nums', valueClass)}>
        {value}
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
    <h2 className={cn('text-[13px] font-extrabold text-text-muted', className)}>
      {children}
    </h2>
  );
}
