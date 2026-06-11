import { FileSpreadsheet, Plus, Download, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getT } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/utils';
import { listActsByCase } from '@/lib/acts/queries';

import { ActCreateForm } from './act-create-form';
import { ActConfirmForm } from './act-confirm-form';
import { DeleteActButton, ActCompletionForm } from './act-row-controls';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DATE_FMT.format(d);
}

interface CaseActsBlockProps {
  caseId: string;
  /** Может выписать акт (Експерт своего дела / staff). */
  canCreate: boolean;
  /** Может подтвердить оплату (юрист дела / owner / admin). */
  canConfirm: boolean;
  /** owner/admin — может удалить любой issued-акт; иначе удаляет только свой. */
  isManager: boolean;
  /** staff — может переопределить отметку выполнения. */
  isStaff: boolean;
  currentUserId: string;
  /** Заполнены ли реквизиты компании (иначе печать будет неполной). */
  requisitesUsable: boolean;
}

export async function CaseActsBlock({
  caseId,
  canCreate,
  canConfirm,
  isManager,
  isStaff,
  currentUserId,
  requisitesUsable,
}: CaseActsBlockProps) {
  const { t, fmt, plural } = await getT();
  const acts = await listActsByCase(caseId);

  return (
    <Card id="acts" className="scroll-mt-20">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <FileSpreadsheet size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">{t.acts.block.heading}</h2>
        <span className="text-[12px] text-text-muted">· {plural(t.acts.block.count, acts.length)}</span>
      </div>

      {canCreate && !requisitesUsable && (
        <div className="flex items-center gap-2 border-b border-border bg-warning-bg px-5 py-2.5 text-[12.5px] text-warning">
          <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0" />
          {t.acts.block.requisitesWarning}
        </div>
      )}

      {canCreate && (
        // id — для кнопки «+ Акт» в шапке карточки (раскрытие формы, v3 s11).
        <details id="act-create-details" className="group border-b border-border">
          <summary className="inline-flex w-full cursor-pointer list-none items-center gap-2 px-5 py-3 text-[13px] font-medium text-primary transition-colors hover:bg-primary-subtle/50">
            <Plus size={14} strokeWidth={2} className="transition-transform group-open:rotate-45" />
            {t.acts.block.createSummary}
          </summary>
          <div className="px-5 pb-5 pt-1">
            <ActCreateForm caseId={caseId} />
          </div>
        </details>
      )}

      {acts.length === 0 ? (
        <EmptyState
          title={canCreate ? t.acts.block.empty : t.acts.block.emptyReadonly}
        />
      ) : (
        <div className="divide-y divide-border">
          {acts.map((a) => {
            const isIssued = a.status === 'issued';
            const isPaid = a.status === 'paid';
            const canDeleteThis = isIssued && (isManager || a.created_by === currentUserId);
            return (
              <div key={a.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-text">
                        {fmt(t.acts.block.number, { n: a.number })}
                      </span>
                      <Badge tone={isPaid ? 'success' : 'neutral'} quiet>
                        {t.enums.actStatus[a.status]}
                      </Badge>
                      {isPaid && a.completion && (
                        <Badge tone={a.completion === 'full' ? 'success' : 'warning'} quiet>
                          {t.enums.actCompletion[a.completion]}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-text-muted">
                      {fmt(t.acts.block.issuedAt, { date: fmtDate(a.issued_at) })}
                      {' · '}
                      {t.acts.block.amount}{' '}
                      <span className="font-semibold tabular-nums text-text">{formatMoney(a.amount)} ₴</span>
                      {isPaid && a.confirmed_amount != null && (
                        <>
                          {' · '}
                          {fmt(t.acts.block.paidAt, { date: fmtDate(a.paid_at) })}
                          {' · '}
                          {t.acts.block.confirmedAmount}{' '}
                          <span className="font-semibold tabular-nums text-success">
                            {formatMoney(a.confirmed_amount)} ₴
                          </span>
                        </>
                      )}
                    </p>
                    {a.scan && (
                      <p className="mt-0.5 text-[11.5px] text-text-subtle">
                        {t.acts.block.scan}: {a.scan.file_name}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <a
                      href={`/cases/${caseId}/acts/${a.id}/xlsx`}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary transition-colors hover:underline"
                    >
                      <Download size={13} strokeWidth={2} />
                      {t.acts.block.download}
                    </a>
                    {canDeleteThis && <DeleteActButton caseId={caseId} actId={a.id} />}
                  </div>
                </div>

                {isIssued && canConfirm && (
                  <details className="group mt-2">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-success transition-colors hover:underline">
                      <Plus size={13} strokeWidth={2} className="transition-transform group-open:rotate-45" />
                      {t.acts.block.confirmPaid}
                    </summary>
                    <div className="mt-2 rounded-lg bg-surface-sunken p-3">
                      <ActConfirmForm caseId={caseId} actId={a.id} defaultAmount={a.amount} />
                    </div>
                  </details>
                )}

                {isPaid && isStaff && (
                  <div className="mt-2">
                    <ActCompletionForm caseId={caseId} actId={a.id} current={a.completion} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
