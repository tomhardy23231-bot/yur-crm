import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PayrollEmployeeSummary } from '@/lib/types/db';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Мобильное представление отчёта /reports/payroll (v3 Сессия 6): вместо широкой
// таблицы — карточки сотрудников (тап → карточка сотрудника). Видно на < md;
// на ≥ md рендерится таблица. По образцу case-list-mobile. Серверный компонент:
// подразделения дочитываем сами (в RPC-сводке их нет; users.department_id — в
// безопасном гранте колонок).
export async function PayrollListMobile({
  rows,
}: {
  rows: PayrollEmployeeSummary[];
}) {
  const { t } = await getT();

  // user_id → название подразделения (PostgREST join может вернуть массив).
  const deptByUser = new Map<string, string>();
  if (rows.length > 0) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('users')
      .select('id, department:department_id(name)')
      .in('id', rows.map((r) => r.user_id));
    for (const row of data ?? []) {
      const r = row as unknown as {
        id: string;
        department: { name: string } | ReadonlyArray<{ name: string }> | null;
      };
      const dept = Array.isArray(r.department)
        ? (r.department[0] ?? null)
        : r.department;
      if (dept?.name) deptByUser.set(r.id, dept.name);
    }
  }

  return (
    <ul className="flex flex-col gap-2.5 md:hidden">
      {rows.map((r) => {
        const dept = deptByUser.get(r.user_id);
        return (
          <li key={r.user_id}>
            <Link
              href={`/reports/payroll/${r.user_id}`}
              className="block overflow-hidden rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-colors active:bg-primary-softer"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={r.full_name} size="sm" shape="square" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold leading-tight text-text">
                      {r.full_name}
                    </span>
                    {dept && (
                      <span className="block truncate text-[12px] text-text-muted">
                        {dept}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.75}
                  className="shrink-0 text-text-subtle"
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <MoneyCell
                  label={t.payroll.report.colEarnedMonth}
                  value={`${MONEY.format(r.earned + r.bonus)} ₴`}
                />
                <MoneyCell
                  label={t.payroll.report.colPaidMonth}
                  value={`${MONEY.format(r.payout)} ₴`}
                  tone="text-success-text"
                />
                <MoneyCell
                  label={t.payroll.report.colBalanceTotal}
                  value={`${MONEY.format(r.balance)} ₴`}
                  tone="text-warning-text"
                />
              </div>

              {r.salary_mode !== 'percent' && (
                <p className="mt-2.5 text-[12px] tabular-nums text-text-muted">
                  {t.payroll.report.colFixedMonth}:{' '}
                  <span className="font-mono font-semibold text-text">
                    {MONEY.format(r.fixed)} ₴
                  </span>
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MoneyCell({
  label,
  value,
  tone = 'text-text',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
        {label}
      </span>
      <span className={`truncate font-mono text-[13px] font-bold tabular-nums ${tone}`}>
        {value}
      </span>
    </span>
  );
}
