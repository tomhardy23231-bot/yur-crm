import Link from 'next/link';

import { CategoryBadge } from '@/components/ui/category-badge';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { BillingTypesBadges } from '@/components/cases/billing-types-badges';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import type { CaseWithRefs } from '@/lib/types/db';

// Плотная сетка «поле: значение» в шапке дела — по эталону карточки заказа (3
// колонки: Дело · Клиент · Финансы/Суд). Серверный компонент: только отображение,
// интерактив (tel/mailto) — обычные ссылки. Значения берём из join'а getCase.

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Сетка пары label/value: подпись слева (auto), значение справа (1fr). Все ряды
// колонки делят одну dl-сетку, поэтому подписи выровнены по вертикали.
const DL_CLASS = 'grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5';

export async function CaseInfoGrid({
  c,
  stacked = false,
}: {
  c: CaseWithRefs;
  /** true — колонки одна под другой (узкий сайдбар «Обзора»), false — сетка 2–3 колонки. */
  stacked?: boolean;
}) {
  const { t } = await getT();
  const o = t.caseCard.overview;
  const dash = o.dash;

  const client = c.client;
  // Телефон/e-mail показываем как текст: телефонии и почтового модуля пока нет,
  // поэтому никаких действий «Позвонить/Написать» (добавим, когда подключим).
  const phone = client?.phone?.trim() || null;
  const email = client?.email?.trim() || null;

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-8 gap-y-6',
        !stacked && 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {/* ── Колонка «Дело» ─────────────────────────────────────────── */}
      <Column title={o.colCase}>
        <dl className={DL_CLASS}>
          <Field label={o.number}>{c.number_title}</Field>
          {c.subject && <Field label={o.subject}>{c.subject}</Field>}
          <Field label={o.caseType}>{t.enums.caseType[c.case_type]}</Field>
          <Field label={o.category}>
            <CategoryBadge category={c.category} quiet />
          </Field>
          <Field label={o.priority}>
            <PriorityBadge priority={c.priority} />
          </Field>
          <Field label={o.opened} mono>
            {DATE_FMT.format(new Date(c.opened_at))}
          </Field>
          {c.closed_at && (
            <Field label={o.closed} mono>
              {DATE_FMT.format(new Date(c.closed_at))}
            </Field>
          )}
          <Field label={o.lawyer}>{c.lawyer?.full_name ?? dash}</Field>
          <Field label={o.expert}>{c.responsible?.full_name ?? dash}</Field>
        </dl>
      </Column>

      {/* ── Колонка «Клиент» ───────────────────────────────────────── */}
      <Column title={o.colClient}>
        <dl className={DL_CLASS}>
          <Field label={o.clientName}>
            {client ? (
              <Link
                href={`/clients/${client.id}`}
                className="font-semibold text-text transition-colors hover:text-primary"
              >
                {client.name}
              </Link>
            ) : (
              dash
            )}
          </Field>
          {client && (
            <Field label={o.clientKind}>
              {t.enums.clientKind[client.client_kind]}
            </Field>
          )}
          <Field label={o.phone} mono>
            {phone ?? dash}
          </Field>
          <Field label={o.email}>
            {email ? <span className="break-all">{email}</span> : dash}
          </Field>
          <Field label={o.source}>
            {client?.source ? t.enums.clientSource[client.source] : o.notSet}
          </Field>
        </dl>
      </Column>

      {/* ── Колонка «Оплата и суд» ──────────────────────────────────
          Деньги (сумма/оплачено/долг) тут НЕ дублируем — они в полосе оплаты
          шапки, в «Итого» вкладки платежей и в «Вознаграждении команды».
          Здесь только тип оплаты и судебные реквизиты; сами платежи —
          на вкладке «Платежи». */}
      <Column title={o.colFinance}>
        <dl className={DL_CLASS}>
          <Field label={o.billing}>
            <BillingTypesBadges types={c.billing_types} />
          </Field>
          {c.court && <Field label={o.court}>{c.court}</Field>}
          {c.opponent && <Field label={o.opponent}>{c.opponent}</Field>}
          {c.court_case_number && (
            <Field label={o.courtCaseNumber} mono>
              {c.court_case_number}
            </Field>
          )}
        </dl>
      </Column>
    </div>
  );
}

// Колонка сетки: заголовок (caps) + переданное содержимое (dl с полями и, для
// клиента, кнопки действий под ним).
function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2.5 text-[12px] font-semibold text-text-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

// Пара «подпись : значение» — два прямых грид-ребёнка dl (dt+dd), чтобы подписи
// колонки были выровнены друг под другом.
function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="whitespace-nowrap pt-px text-[12px] text-text-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          'min-w-0 text-[12.5px] font-medium text-text',
          mono && 'tabular-nums',
        )}
      >
        {children}
      </dd>
    </>
  );
}
