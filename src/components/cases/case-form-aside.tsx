import { ListChecks, Percent, UsersRound } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { CategoryBadge } from '@/components/ui/category-badge';
import { getPayrollRates } from '@/lib/payroll/queries';
import { getT } from '@/lib/i18n/server';
import { formatPercent } from '@/lib/utils';

// ============================================================================
// Сайдбар-помощник формы дела (решение владельца 14.07): заполняет пустое
// место справа пользой — реальные ставки вознаграждения по категориям
// (payroll_rates, RLS отдаёт всем активным), роли участников и «что дальше».
// Показывается только на широких экранах (xl+), на узких форма во всю ширину.
// ============================================================================

export async function CaseFormAside() {
  const { t } = await getT();
  const a = t.caseCard.formAside;
  const rates = await getPayrollRates();

  return (
    <aside className="sticky top-12 hidden min-w-0 flex-col gap-4 self-start xl:flex">
      {/* Ставки по категориям — живые значения из настроек. */}
      <Card className="p-4">
        <AsideTitle icon={<Percent size={13} strokeWidth={2.2} />}>
          {a.ratesTitle}
        </AsideTitle>
        <p className="mt-1 text-[12px] text-text-muted">{a.ratesHint}</p>
        <ul className="mt-2">
          {rates.map((r) => (
            <li
              key={r.category}
              className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0"
            >
              <CategoryBadge category={r.category} quiet />
              <span className="whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums text-text">
                {formatPercent(r.lawyer_percent)}% / {formatPercent(r.expert_percent)}%
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] leading-snug text-text-subtle">
          {a.ratesFootnote}
        </p>
      </Card>

      {/* Роли: юрист-продажник vs эксперт-исполнитель. */}
      <Card className="p-4">
        <AsideTitle icon={<UsersRound size={13} strokeWidth={2.2} />}>
          {a.rolesTitle}
        </AsideTitle>
        <dl className="mt-2 flex flex-col gap-2.5">
          <div>
            <dt className="text-[12.5px] font-semibold text-text">
              {a.roleLawyerTitle}
            </dt>
            <dd className="text-[12px] leading-snug text-text-muted">
              {a.roleLawyerText}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] font-semibold text-text">
              {a.roleExpertTitle}
            </dt>
            <dd className="text-[12px] leading-snug text-text-muted">
              {a.roleExpertText}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Что произойдёт после создания. */}
      <Card className="p-4">
        <AsideTitle icon={<ListChecks size={13} strokeWidth={2.2} />}>
          {a.nextTitle}
        </AsideTitle>
        <ol className="mt-2 flex flex-col gap-2">
          {[a.next1, a.next2, a.next3].map((text, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[11px] font-bold tabular-nums text-primary-pressed">
                {i + 1}
              </span>
              <span className="text-[12px] leading-snug text-text-muted">
                {text}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </aside>
  );
}

// Заголовок карточки-подсказки: тинт-иконка + caps-подпись.
function AsideTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.05em] text-text-muted">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-subtle text-primary-pressed">
        {icon}
      </span>
      {children}
    </h3>
  );
}
