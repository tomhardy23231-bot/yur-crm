import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StageBadge } from '@/components/ui/stage-badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ClientKindBadge } from '@/components/clients/client-kind-badge';
import { DeleteClientForm } from '@/components/clients/delete-client-form';
import { getClient, getClientCases } from '@/lib/clients/queries';
import { requireUser } from '@/lib/auth/require-role';
import { clientKindHasFullName } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';

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

export default async function ClientDetailPage({
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

  const ERROR_MESSAGES: Record<string, string> = {
    has_cases: t.clients.detail.errorHasCases,
    delete_failed: t.clients.detail.errorDeleteFailed,
    missing_id: t.clients.detail.errorMissingId,
  };

  const client = await getClient(id);
  if (!client) notFound();

  const cases = await getClientCases(id);
  // Мини-статы шапки — суммы из уже загруженного массива дел (без новых запросов).
  const totalContractSum = cases.reduce((sum, c) => sum + c.contract_sum, 0);
  const totalDebt = cases.reduce((sum, c) => sum + c.debt, 0);
  // RLS UPDATE = view_all_cases ИЛИ автор записи. Если ни то, ни другое —
  // скрываем «Редактировать», чтобы не показывать кнопку, действие которой откажет.
  const canEdit = user.caps.view_all_cases || client.created_by === user.profile.id;
  const canDelete = user.caps.delete_clients;
  // Заводить дело по клиенту — обладатель права create_cases.
  const canCreateCase = user.caps.create_cases;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />
        {t.clients.detail.backToList}
      </Link>

      {errorMessage && (
        <div
          role="alert"
          className="text-[13px] text-error bg-error-bg border border-error/20 rounded-md px-3 py-2"
        >
          {errorMessage}
        </div>
      )}

      <Card>
        {/* Светлая шапка (бриф §7): без золотого баннера — аватар + имя + мета,
            действия справа (удаление — красная второстепенная). Аватар круглый —
            квадрат зарезервирован за таблицами (DESIGN.md). */}
        <div className="flex flex-wrap items-center gap-4 px-6 pt-5 pb-4">
          <Avatar name={client.name} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">
              {client.name}
            </h1>
            {/* Тип клиента — залитая пилюля под именем (язык каркаса), мета —
                только «клиент с DATE». */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ClientKindBadge kind={client.client_kind} quiet={false} />
              <p className="text-[13px] text-text-muted">
                {t.clients.detail.clientSince}{' '}
                {DATE_FMT.format(new Date(client.created_at))}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/clients/${client.id}/edit`}>
                  <Pencil size={14} strokeWidth={1.75} />
                  {t.clients.detail.edit}
                </Link>
              </Button>
            )}
            {canDelete && (
              <DeleteClientForm clientId={client.id} clientName={client.name} />
            )}
          </div>
        </div>

        {/* Мини-статы «Дел / На сумму / Долг» — фирменная композиция карточки
            клиента из каркаса; считаются из уже загруженного массива cases. */}
        <div className="grid grid-cols-3 gap-2 border-t border-border px-6 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wide text-text-subtle">
              {t.clients.detail.statCases}
            </span>
            <span className="font-mono text-[14px] font-bold tabular-nums text-primary-pressed">
              {cases.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wide text-text-subtle">
              {t.clients.detail.statSum}
            </span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-text">
              {MONEY_FMT.format(totalContractSum)} ₴
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-wide text-text-subtle">
              {t.clients.detail.statDebt}
            </span>
            <span
              className={`font-mono text-[13px] font-semibold tabular-nums ${totalDebt > 0 ? 'text-error' : 'text-text-muted'}`}
            >
              {MONEY_FMT.format(totalDebt)} ₴
            </span>
          </div>
        </div>

        {/* Реквизиты: показываем ТОЛЬКО заполненные поля — пустых «—» больше нет
            (редизайн Волна 3). Карточка сжимается к содержимому, дела всплывают выше.
            Тип клиента здесь не дублируем — он уже пилюлей в шапке. */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-border p-6 sm:grid-cols-2">
          {clientKindHasFullName(client.client_kind) && client.birth_date && (
            <Section title={t.clients.detail.sectionBirthDate}>
              <span className="text-[13.5px] text-text">
                {DATE_FMT.format(new Date(client.birth_date))}
              </span>
            </Section>
          )}

          {client.inn && (
            <Section
              title={
                clientKindHasFullName(client.client_kind)
                  ? t.clients.detail.sectionInn
                  : t.clients.detail.sectionInnEdrpou
              }
            >
              <span className="font-mono text-[13px] tabular-nums text-text">{client.inn}</span>
            </Section>
          )}

          {client.contract_number && (
            <Section title={t.clients.detail.sectionContractNumber}>
              <span className="font-mono text-[13px] tabular-nums text-text">{client.contract_number}</span>
            </Section>
          )}

          {client.phone && (
            <Section title={t.clients.detail.sectionPhone}>
              <a
                href={`tel:${client.phone}`}
                className="inline-flex items-center gap-2 font-mono text-[13px] tabular-nums text-text hover:text-primary transition-colors"
              >
                <Phone size={14} strokeWidth={1.75} className="text-text-muted" />
                {client.phone}
              </a>
            </Section>
          )}

          {client.email && (
            <Section title={t.clients.detail.sectionEmail}>
              <a
                href={`mailto:${client.email}`}
                className="inline-flex items-center gap-2 text-[13.5px] text-text hover:text-primary transition-colors"
              >
                <Mail size={14} strokeWidth={1.75} className="text-text-muted" />
                {client.email}
              </a>
            </Section>
          )}

          {client.address && (
            <Section title={t.clients.detail.sectionAddress}>
              <span className="inline-flex items-start gap-2 text-[13.5px] text-text">
                <MapPin size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-muted" />
                {client.address}
              </span>
            </Section>
          )}

          {client.source && (
            <Section title={t.clients.detail.sectionSource}>
              <span className="text-[13.5px] text-text">
                {t.enums.clientSource[client.source]}
              </span>
            </Section>
          )}
        </div>

        {client.notes && (
          <div className="px-6 pb-6">
            <Section title={t.clients.detail.sectionNotes}>
              <p className="text-[13.5px] text-text leading-[1.6] whitespace-pre-wrap">
                {client.notes}
              </p>
            </Section>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-[16px] font-semibold text-text">{t.clients.detail.casesTitle}</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              {cases.length === 0
                ? t.clients.detail.casesNone
                : fmt(t.clients.detail.casesTotal, { count: cases.length })}
            </p>
          </div>
          {canCreateCase && (
            <Button asChild size="sm">
              <Link href={`/cases/new?client=${client.id}`}>
                <Plus size={14} strokeWidth={2} />
                {t.clients.detail.newCase}
              </Link>
            </Button>
          )}
        </div>

        {cases.length === 0 ? (
          <div className="py-10 px-6 text-center">
            <p className="text-[13px] text-text-muted">
              {canCreateCase
                ? t.clients.detail.casesEmptyCanCreate
                : t.clients.detail.casesEmpty}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>{t.clients.detail.colNumberTitle}</TableHead>
                <TableHead>{t.clients.detail.colStage}</TableHead>
                <TableHead>{t.clients.detail.colResponsible}</TableHead>
                <TableHead>{t.clients.detail.colOpened}</TableHead>
                <TableHead className="text-right">{t.clients.detail.colSum}</TableHead>
                <TableHead className="text-right">{t.clients.detail.colDebt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <Link
                      href={`/cases/${c.id}`}
                      className="font-semibold text-text transition-colors hover:text-primary"
                    >
                      {c.number_title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={c.stage} label={t.enums.caseStage[c.stage]} quiet />
                  </TableCell>
                  <TableCell>
                    {c.responsible ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={c.responsible.full_name} size="sm" shape="square" />
                        <span className="text-[13px] text-text">{c.responsible.full_name}</span>
                      </span>
                    ) : (
                      <Empty label={t.common.dash} />
                    )}
                  </TableCell>
                  <TableCell className="text-[12.5px] tabular-nums text-text-muted">
                    {DATE_FMT.format(new Date(c.opened_at))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums whitespace-nowrap">
                    {MONEY_FMT.format(c.contract_sum)} ₴
                  </TableCell>
                  <TableCell className={`text-right font-mono text-[13px] tabular-nums whitespace-nowrap ${c.debt > 0 ? 'text-error' : 'text-text-muted'}`}>
                    {MONEY_FMT.format(c.debt)} ₴
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </Card>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[12px] font-medium text-text-muted">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <span className="text-[13px] text-text-subtle">{label}</span>;
}
