import Link from 'next/link';

import { CategoryBadge } from '@/components/ui/category-badge';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { BillingTypesBadges } from '@/components/cases/billing-types-badges';
import { InlineEditField } from '@/components/cases/inline-edit-field';
import { updateCaseFieldAction, type CaseInlineField } from '@/lib/cases/actions';
import {
  updateClientFieldAction,
  type ClientInlineField,
} from '@/lib/clients/actions';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import {
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CLIENT_SOURCES,
  type CaseWithRefs,
} from '@/lib/types/db';
import { caseTypeLabeler, listActiveCaseTypes } from '@/lib/cases/case-types';

// Плотная сетка «поле: значение» в шапке дела — по эталону карточки заказа (3
// колонки: Дело · Клиент · Финансы/Суд). Серверный компонент: отображение +
// (по запросу владельца 2026-07-19) inline-карандаши на ключевых полях; сами
// редакторы — клиентские листья InlineEditField, server actions привязываются
// к полю здесь (bind), журналирование — внутри экшенов.

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Сетка пары label/value: подпись слева (auto), значение справа (1fr). Все ряды
// колонки делят одну dl-сетку, поэтому подписи выровнены по вертикали.
const DL_CLASS = 'grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5';

// Гейты inline-правки (вычисляет карточка дела): без пропа грид read-only.
export type CaseInfoGridEdit = {
  /** Право править дело (RLS UPDATE) — №/предмет/тип/приоритет. */
  caseFields: boolean;
  /** Категория — ЗП-определяющее поле, только staff. */
  category: boolean;
  /** Контакты клиента — staff (view_all_cases) или автор записи. */
  client: boolean;
};

export async function CaseInfoGrid({
  c,
  stacked = false,
  edit,
}: {
  c: CaseWithRefs;
  /** true — колонки одна под другой (узкий сайдбар «Обзора»), false — сетка 2–3 колонки. */
  stacked?: boolean;
  edit?: CaseInfoGridEdit;
}) {
  const { t } = await getT();
  const o = t.caseCard.overview;
  const dash = o.dash;

  const client = c.client;
  // Телефон/e-mail показываем как текст: телефонии и почтового модуля пока нет,
  // поэтому никаких действий «Позвонить/Написать» (добавим, когда подключим).
  const phone = client?.phone?.trim() || null;
  const email = client?.email?.trim() || null;

  // Server actions, привязанные к сущности и полю (в клиент уходит (value)=>…).
  const caseField = (field: CaseInlineField) =>
    updateCaseFieldAction.bind(null, c.id, field);
  const clientField = (field: ClientInlineField) =>
    updateClientFieldAction.bind(null, client?.id ?? '', c.id, field);

  // Тип дела — из справочника (активные); лейбл текущего типа резолвим отдельно
  // (встроенные — из словаря, кастомные — свой name). Если тип дела скрыт, всё
  // равно добавляем его опцией, чтобы не «терять» текущее значение при правке.
  const activeCaseTypes = await listActiveCaseTypes();
  const caseTypeLabel = (await caseTypeLabeler())(c.case_type);
  const caseTypeOptions = (
    activeCaseTypes.some((o) => o.code === c.case_type)
      ? activeCaseTypes
      : [...activeCaseTypes, { code: c.case_type, label: caseTypeLabel }]
  ).map((o) => ({ value: o.code, label: o.label }));
  const categoryOptions = CASE_CATEGORIES.map((v) => ({
    value: v,
    label: t.enums.caseCategory[v],
  }));
  const priorityOptions = CASE_PRIORITIES.map((v) => ({
    value: v,
    label: t.enums.casePriority[v],
  }));
  const sourceOptions = [
    { value: '', label: o.notSet },
    ...CLIENT_SOURCES.map((v) => ({ value: v, label: t.enums.clientSource[v] })),
  ];

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
          <Field label={o.number}>
            {edit?.caseFields ? (
              <InlineEditField
                label={o.number}
                value={c.number_title}
                required
                maxLength={200}
                action={caseField('number_title')}
              >
                {c.number_title}
              </InlineEditField>
            ) : (
              c.number_title
            )}
          </Field>
          {(c.subject || edit?.caseFields) && (
            <Field label={o.subject}>
              {edit?.caseFields ? (
                <InlineEditField
                  label={o.subject}
                  value={c.subject ?? ''}
                  maxLength={300}
                  action={caseField('subject')}
                >
                  {c.subject ?? dash}
                </InlineEditField>
              ) : (
                c.subject
              )}
            </Field>
          )}
          <Field label={o.caseType}>
            {edit?.caseFields ? (
              <InlineEditField
                label={o.caseType}
                value={c.case_type}
                options={caseTypeOptions}
                action={caseField('case_type')}
              >
                {caseTypeLabel}
              </InlineEditField>
            ) : (
              caseTypeLabel
            )}
          </Field>
          <Field label={o.category}>
            {edit?.category ? (
              <InlineEditField
                label={o.category}
                value={c.category}
                options={categoryOptions}
                action={caseField('category')}
              >
                <CategoryBadge category={c.category} quiet />
              </InlineEditField>
            ) : (
              <CategoryBadge category={c.category} quiet />
            )}
          </Field>
          <Field label={o.priority}>
            {edit?.caseFields ? (
              <InlineEditField
                label={o.priority}
                value={c.priority}
                options={priorityOptions}
                action={caseField('priority')}
              >
                <PriorityBadge priority={c.priority} />
              </InlineEditField>
            ) : (
              <PriorityBadge priority={c.priority} />
            )}
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
            {client && edit?.client ? (
              <InlineEditField
                label={o.phone}
                value={client.phone ?? ''}
                inputType="tel"
                maxLength={100}
                action={clientField('phone')}
              >
                {phone ?? dash}
              </InlineEditField>
            ) : (
              (phone ?? dash)
            )}
          </Field>
          <Field label={o.email}>
            {client && edit?.client ? (
              <InlineEditField
                label={o.email}
                value={client.email ?? ''}
                inputType="email"
                maxLength={200}
                action={clientField('email')}
              >
                {email ? <span className="break-all">{email}</span> : dash}
              </InlineEditField>
            ) : email ? (
              <span className="break-all">{email}</span>
            ) : (
              dash
            )}
          </Field>
          <Field label={o.source}>
            {client && edit?.client ? (
              <InlineEditField
                label={o.source}
                value={client.source ?? ''}
                options={sourceOptions}
                action={clientField('source')}
              >
                {client.source ? t.enums.clientSource[client.source] : o.notSet}
              </InlineEditField>
            ) : client?.source ? (
              t.enums.clientSource[client.source]
            ) : (
              o.notSet
            )}
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
      <h3 className="mb-2.5 text-[14px] font-semibold text-text">
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
      <dt className="whitespace-nowrap pt-px text-[14px] text-text">
        {label}
      </dt>
      <dd
        className={cn(
          'min-w-0 text-[14.5px] font-medium text-text',
          mono && 'tabular-nums',
        )}
      >
        {children}
      </dd>
    </>
  );
}
