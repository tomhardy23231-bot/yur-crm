import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StageBadge } from '@/components/ui/stage-badge';
import { CategoryBadge } from '@/components/ui/category-badge';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { PaymentProgress } from '@/components/cases/payment-progress';
import { ArchiveCaseForm } from '@/components/cases/archive-case-form';
import { getT } from '@/lib/i18n/server';
import { daysSince, formatMoney } from '@/lib/utils';
import { listCases } from '@/lib/cases/queries';
import { STALE_STAGE_DAYS } from '@/lib/cases/constants';

type CaseListItem = Awaited<ReturnType<typeof listCases>>['items'][number];

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Мобильное представление списка дел: вместо широкой таблицы — компактные
// карточки-«строки» (тап → дело). Видно только на < md; на ≥ md рендерится
// обычная таблица. Серверный компонент. Кнопка архива/восстановления (staff) —
// ОТДЕЛЬНОЙ строкой под тап-зоной (не внутри <a>, иначе невалидный HTML).
export async function CaseListMobile({
  items,
  isStaff = false,
  archived = false,
}: {
  items: CaseListItem[];
  isStaff?: boolean;
  archived?: boolean;
}) {
  const { t, plural } = await getT();

  return (
    <ul className="flex flex-col gap-2.5 md:hidden">
      {items.map((c) => {
        const paid = Math.max(0, c.contract_sum - c.debt);
        const days = c.stage !== 'closed' ? daysSince(c.stage_changed_at) : null;
        const stale = days !== null && days >= STALE_STAGE_DAYS;
        // staff: «Восстановить» на вкладке «Архив»; «В архив» — у завершённых дел.
        const showArchive = isStaff && !archived && c.stage === 'closed';
        const showRestore = isStaff && archived;

        return (
          <li key={c.id}>
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <Link
                href={`/cases/${c.id}`}
                className="block p-3.5 transition-colors active:bg-primary-softer"
              >
                {/* Заголовок + этап */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold leading-tight text-text">
                      {c.number_title}
                    </p>
                    {c.client && (
                      <p className="mt-0.5 truncate font-mono text-[11.5px] tabular-nums text-text-muted">
                        {c.client.name}
                      </p>
                    )}
                  </div>
                  <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1">
                    <StageBadge stage={c.stage} pulse={false} />
                    {c.outcome === 'lost' && (
                      <Badge tone="neutral" title={t.cases.lost.badgeTitle}>
                        {t.cases.lost.badge}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Бейджи: категория · приоритет · «без акта» · дни/закрыто */}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <CategoryBadge category={c.category} />
                  <PriorityBadge priority={c.priority} />
                  {c.closed_without_act && (
                    <Badge tone="warning" title={t.cases.row.withoutActTitle}>
                      {t.cases.row.withoutAct}
                    </Badge>
                  )}
                  {archived && c.closed_at ? (
                    <span className="font-mono text-[11px] tabular-nums text-text-subtle">
                      {t.cases.archive.closedAtColumn}:{' '}
                      {DATE_FMT.format(new Date(c.closed_at))}
                    </span>
                  ) : (
                    days !== null && (
                      <span
                        className={`font-mono text-[11px] tabular-nums ${stale ? 'font-medium text-warning' : 'text-text-subtle'}`}
                      >
                        {plural(t.cases.row.stageDays, days)}
                      </span>
                    )
                  )}
                </div>

                {/* Низ: исполнитель слева · деньги справа */}
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    {c.responsible ? (
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Avatar name={c.responsible.full_name} size="sm" shape="square" />
                        <span className="truncate text-[12.5px] text-text">
                          {c.responsible.full_name}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-text-subtle">
                        {t.common.dash}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[14px] font-bold tabular-nums text-text">
                      {formatMoney(c.contract_sum)} ₴
                    </p>
                    {c.overpaid > 0 ? (
                      <p className="font-mono text-[12px] font-medium tabular-nums text-info-text">
                        +{formatMoney(c.overpaid)} ₴
                      </p>
                    ) : (
                      <p
                        className={`font-mono text-[12px] font-medium tabular-nums ${c.debt > 0 ? 'text-error' : 'text-text-subtle'}`}
                      >
                        {t.cases.columns.debt}: {formatMoney(c.debt)} ₴
                      </p>
                    )}
                  </div>
                </div>

                {/* Прогресс оплаты */}
                <PaymentProgress paid={paid} total={c.contract_sum} className="mt-2.5" />
              </Link>

              {/* Действие архива/восстановления — вне <a>: отдельная полоса снизу. */}
              {(showArchive || showRestore) && (
                <div className="flex justify-end border-t border-border px-3.5 py-2">
                  <ArchiveCaseForm
                    caseId={c.id}
                    caseTitle={c.number_title}
                    mode={showRestore ? 'restore' : 'archive'}
                    variant="button"
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
