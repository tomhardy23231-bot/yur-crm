import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, TriangleAlert } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/utils';
import { listCleanupCandidates } from '@/lib/expenses/cleanup';
import { listActiveExpenseCategories } from '@/lib/expenses/categories';
import { CleanupBatch } from '@/components/expense-categories/cleanup-batch';

// Разовый разбор старых «расходов, заведённых платежом плюсом» (миграция 0009).
// Требует ОБА права: вносить расходы и удалять платежи — фактически owner или
// керівник підрозділу.
export default async function ExpenseCleanupPage() {
  const user = await requireCap('manage_case_expenses');
  if (!user.caps.delete_payments) redirect('/forbidden');

  const { t, plural } = await getT();
  const c = t.expenseCleanup;
  const [candidates, categories] = await Promise.all([
    listCleanupCandidates(),
    listActiveExpenseCategories(),
  ]);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/settings"
        className="inline-flex w-fit items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {t.nav.settings}
      </Link>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text">{c.heading}</h2>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-[13px] text-text-muted">{c.intro}</p>

          {/* Два необратимых последствия — до, а не после конвертации. */}
          <div className="flex flex-col gap-2 rounded-control border border-warning/20 bg-warning-bg/60 px-4 py-3">
            <Warn text={c.warnCash} />
            <Warn text={c.warnPayroll} />
          </div>
        </div>
      </Card>

      {categories.length === 0 ? (
        <p className="text-[13px] text-text-muted">{c.noCategories}</p>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-text-muted">{c.list.empty}</p>
          <p className="text-[12px] text-text-subtle">{c.list.emptyHint}</p>
        </div>
      ) : (
        <>
          <p className="text-[12.5px] text-text-subtle">
            {plural(c.list.found, candidates.length)} ·{' '}
            <span className="font-mono font-semibold tabular-nums text-text">
              {formatMoney(candidates.reduce((s, p) => s + p.amount, 0))} ₴
            </span>
          </p>
          <CleanupBatch candidates={candidates} categories={categories} />
        </>
      )}
    </main>
  );
}

function Warn({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] text-warning-text">
      <TriangleAlert
        size={14}
        strokeWidth={2}
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <span>{text}</span>
    </p>
  );
}
