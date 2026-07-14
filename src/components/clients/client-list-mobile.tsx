import Link from 'next/link';
import { Briefcase, Mail, Phone } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { ClientKindBadge } from '@/components/clients/client-kind-badge';
import { getT } from '@/lib/i18n/server';
import { listClients } from '@/lib/clients/queries';

type ClientListItem = Awaited<ReturnType<typeof listClients>>['items'][number];

// Мобильное представление списка клиентов: компактные карточки вместо таблицы.
// Видно только на < md. Серверный компонент.
export async function ClientListMobile({ items }: { items: ClientListItem[] }) {
  const { t } = await getT();

  return (
    <ul className="flex flex-col gap-2.5 md:hidden">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={`/clients/${c.id}`}
            className="block rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-colors active:bg-primary-softer"
          >
            <div className="flex items-center gap-3">
              <Avatar name={c.name} size="lg" shape="square" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-tight text-text">
                  {c.name}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <ClientKindBadge kind={c.client_kind} />
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-text-muted"
                    title={t.clients.list.colCases}
                  >
                    <Briefcase size={11} strokeWidth={1.85} />
                    {c.cases_count}
                  </span>
                </div>
              </div>
            </div>

            {(c.phone || c.email) && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-2.5 text-[12.5px] text-text-muted">
                {c.phone && (
                  <span className="inline-flex items-center gap-2">
                    <Phone size={13} strokeWidth={1.85} className="shrink-0 text-text-subtle" />
                    <span className="font-mono text-[12px] tabular-nums">{c.phone}</span>
                  </span>
                )}
                {c.email && (
                  <span className="inline-flex items-center gap-2">
                    <Mail size={13} strokeWidth={1.85} className="shrink-0 text-text-subtle" />
                    <span className="truncate">{c.email}</span>
                  </span>
                )}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
