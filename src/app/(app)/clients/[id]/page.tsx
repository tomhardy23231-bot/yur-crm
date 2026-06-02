import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHero } from '@/components/ui/card';
import { StageBadge, STAGE_LABELS } from '@/components/ui/stage-badge';
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
import {
  CLIENT_KIND_LABEL,
  CLIENT_SOURCE_LABEL,
  clientKindHasFullName,
} from '@/lib/types/db';

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

const ERROR_MESSAGES: Record<string, string> = {
  has_cases: 'Нельзя удалить клиента: у него есть дела. Сначала закройте или перенесите дела.',
  delete_failed: 'Не удалось удалить клиента. Попробуйте позже.',
  missing_id: 'Не передан идентификатор клиента.',
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const client = await getClient(id);
  if (!client) notFound();

  const cases = await getClientCases(id);
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
        К списку клиентов
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
        <CardHero>
          <Avatar
            name={client.name}
            size="xl"
            className="border-2 border-white/40"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[24px] font-bold leading-tight tracking-[-0.01em] truncate">
              {client.name}
            </p>
            <p className="text-[13px] opacity-90 mt-1">
              {CLIENT_KIND_LABEL[client.client_kind]} · клиент с {DATE_FMT.format(new Date(client.created_at))}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <Button asChild variant="secondary" size="sm" className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25 hover:!border-white/50">
                <Link href={`/clients/${client.id}/edit`}>
                  <Pencil size={14} strokeWidth={1.75} />
                  Редактировать
                </Link>
              </Button>
            )}
            {canDelete && (
              <DeleteClientForm clientId={client.id} clientName={client.name} />
            )}
          </div>
        </CardHero>

        <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2">
          <Section title="Тип клиента">
            <ClientKindBadge kind={client.client_kind} />
          </Section>

          {clientKindHasFullName(client.client_kind) && (
            <Section title="Дата рождения">
              {client.birth_date ? (
                <span className="font-mono text-[13.5px] text-text">
                  {DATE_FMT.format(new Date(client.birth_date))}
                </span>
              ) : (
                <Empty />
              )}
            </Section>
          )}

          <Section title={clientKindHasFullName(client.client_kind) ? 'ИНН' : 'ИНН / ЕДРПОУ'}>
            {client.inn ? (
              <span className="font-mono text-[13.5px] text-text">{client.inn}</span>
            ) : (
              <Empty />
            )}
          </Section>

          <Section title="Номер договора">
            {client.contract_number ? (
              <span className="font-mono text-[13.5px] text-text">{client.contract_number}</span>
            ) : (
              <Empty />
            )}
          </Section>

          <Section title="Телефон">
            {client.phone ? (
              <a
                href={`tel:${client.phone}`}
                className="inline-flex items-center gap-2 font-mono text-[13.5px] text-text hover:text-primary transition-colors"
              >
                <Phone size={14} strokeWidth={1.75} className="text-text-muted" />
                {client.phone}
              </a>
            ) : (
              <Empty />
            )}
          </Section>

          <Section title="E-mail">
            {client.email ? (
              <a
                href={`mailto:${client.email}`}
                className="inline-flex items-center gap-2 font-mono text-[13.5px] text-text hover:text-primary transition-colors"
              >
                <Mail size={14} strokeWidth={1.75} className="text-text-muted" />
                {client.email}
              </a>
            ) : (
              <Empty />
            )}
          </Section>

          <Section title="Адрес">
            {client.address ? (
              <span className="inline-flex items-start gap-2 text-[13.5px] text-text">
                <MapPin size={14} strokeWidth={1.75} className="text-text-muted mt-[3px] shrink-0" />
                {client.address}
              </span>
            ) : (
              <Empty />
            )}
          </Section>

          <Section title="Источник">
            {client.source ? (
              <span className="text-[13.5px] text-text">
                {CLIENT_SOURCE_LABEL[client.source]}
              </span>
            ) : (
              <Empty />
            )}
          </Section>
        </div>

        {client.notes && (
          <div className="px-6 pb-6">
            <Section title="Заметки">
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
            <h2 className="text-[16px] font-semibold text-text">Дела клиента</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              {cases.length === 0
                ? 'У клиента пока нет дел'
                : `Всего: ${cases.length}`}
            </p>
          </div>
          {canCreateCase && (
            <Button asChild size="sm">
              <Link href={`/cases/new?client=${client.id}`}>
                <Plus size={14} strokeWidth={2} />
                Новое дело
              </Link>
            </Button>
          )}
        </div>

        {cases.length === 0 ? (
          <div className="py-10 px-6 text-center">
            <p className="text-[13px] text-text-muted">
              {canCreateCase
                ? 'Заведите первое дело — оно соберёт документы, задачи и финансы.'
                : 'Пока нет дел.'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>Номер / название</TableHead>
                <TableHead>Этап</TableHead>
                <TableHead>Ответственный</TableHead>
                <TableHead>Открыто</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead className="text-right">Долг</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-text">{c.number_title}</TableCell>
                  <TableCell>
                    <StageBadge stage={c.stage} label={STAGE_LABELS[c.stage]} />
                  </TableCell>
                  <TableCell>
                    {c.responsible ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={c.responsible.full_name} size="sm" />
                        <span className="text-[13px] text-text">{c.responsible.full_name}</span>
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px] text-text-muted">
                    {DATE_FMT.format(new Date(c.opened_at))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                    {MONEY_FMT.format(c.contract_sum)} ₴
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums whitespace-nowrap ${c.debt > 0 ? 'text-error' : 'text-text-muted'}`}>
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
      <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function Empty() {
  return <span className="text-[13px] text-text-subtle">—</span>;
}
