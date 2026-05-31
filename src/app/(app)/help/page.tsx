import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Coins,
  Eye,
  FilePlus,
  FileText,
  GitBranch,
  HelpCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { HelpActions } from '@/components/onboarding/help-actions';
import { requireUser } from '@/lib/auth/require-role';
import { STAFF_ROLES } from '@/lib/types/db';

export const metadata = {
  title: 'Справка — ЮрКейс',
};

// ============================================================================
// Страница «Справка»: подробное описание системы, правила работы с примерами и
// «скриншото-подобными» иллюстрациями, пошаговые инструкции, FAQ и перезапуск
// обучающего тура. Видна всем сотрудникам.
// ============================================================================

const STAGES: ReadonlyArray<{ label: string; varName: string; note: string }> = [
  { label: 'Новое обращение', varName: '--stage-new', note: 'клиент только пришёл' },
  { label: 'Консультация', varName: '--stage-consultation', note: 'оценка и предложение' },
  { label: 'В работе', varName: '--stage-in-progress', note: 'договор заключён' },
  { label: 'Ожидание решения', varName: '--stage-awaiting', note: 'дело у эксперта' },
  { label: 'Завершено', varName: '--stage-closed', note: 'акт подписан, в архив' },
];

const ROLES: ReadonlyArray<{ name: string; tone: string; sees: string }> = [
  { name: 'Владелец', tone: 'var(--info)', sees: 'Всё: все дела, все финансы, пользователи и системные настройки (ставки).' },
  { name: 'Администратор', tone: 'var(--stage-awaiting)', sees: 'Все дела и все финансы, управление пользователями. Без системных настроек.' },
  { name: 'Офис-менеджер', tone: 'var(--primary)', sees: 'Все дела и финансы, заводит клиентов и дела. Не удаляет записи и не правит платежи.' },
  { name: 'Юрист', tone: 'var(--cat-claim)', sees: 'Только свои дела (где он продал договор) и свои личные начисления.' },
  { name: 'Эксперт', tone: 'var(--success)', sees: 'Только свои дела (где он исполнитель) и свои личные начисления.' },
];

const RATES: ReadonlyArray<{ cat: string; pct: string; varName: string }> = [
  { cat: 'Документ', pct: '7%', varName: '--cat-document' },
  { cat: 'Иск', pct: '10%', varName: '--cat-claim' },
  { cat: 'Представительство', pct: '25%', varName: '--cat-representation' },
];

type Faq = { q: string; a: React.ReactNode };

export default async function HelpPage() {
  const user = await requireUser();
  const isStaff = STAFF_ROLES.includes(user.profile.role);

  const visibility = isStaff
    ? 'Вы — сотрудник офиса: видите все дела компании и все финансы.'
    : user.profile.role === 'lawyer'
      ? 'Вы — юрист: видите дела, где назначены продавцом договора, и свои начисления.'
      : 'Вы — эксперт: видите дела, где назначены исполнителем, и свои начисления.';

  const faqs: Faq[] = [
    {
      q: 'Как создать новое дело?',
      a: (
        <>
          Откройте раздел <b>«Дела»</b> и нажмите <b>«Новое дело»</b>. Укажите
          номер/название, клиента, юриста и эксперта, категорию (от неё зависит
          процент зарплаты) и сумму договора. Дело сразу появится в списке и на
          доске.
        </>
      ),
    },
    {
      q: 'Кто какие дела видит?',
      a: (
        <>
          {visibility} Юрист и эксперт видят только свои дела и не видят дел друг
          друга. Эти правила действуют и в интерфейсе, и в самой базе данных.
        </>
      ),
    },
    {
      q: 'Как считается зарплата?',
      a: (
        <>
          Зарплата — это <b>процент от оплаченной клиентом суммы</b> по делу.
          Процент зависит от категории: документ&nbsp;— 7%, иск&nbsp;— 10%,
          представительство&nbsp;— 25%. Полный процент получает и юрист, и
          эксперт. Всё считается автоматически; начисления видны в карточке дела
          и в разделе <b>«Финансы и ЗП»</b>.
        </>
      ),
    },
    {
      q: 'Как двигать дело по этапам?',
      a: (
        <>
          В карточке дела вверху — воронка из 5 этапов. Кликните по следующему
          этапу, чтобы перевести дело дальше. Движение возможно только вперёд:
          это сохраняет порядок и историю. Исправить ошибочный этап может только
          сотрудник офиса.
        </>
      ),
    },
    {
      q: 'Как загрузить документ или акт?',
      a: (
        <>
          В карточке дела есть блок <b>«Документы»</b> — загрузите файл и укажите
          его тип (договор, иск, доверенность, переписка, акт). Акт
          приёма-передачи прикладывают перед закрытием дела.
        </>
      ),
    },
    {
      q: 'Как внести платёж клиента?',
      a: (
        <>
          В карточке дела, в блоке <b>«Платежи и финансы»</b>, добавьте платёж
          (сумма, дата, способ). Система сама пересчитает «оплачено» и «долг» и
          обновит начисления зарплаты.
        </>
      ),
    },
    {
      q: 'Как быстро что-то найти?',
      a: (
        <>
          Нажмите <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> в любом месте — откроется поиск
          по делам, клиентам, задачам и документам. Та же кнопка есть в верхней
          панели.
        </>
      ),
    },
    {
      q: 'Что такое «акт» и зачем он нужен?',
      a: (
        <>
          Акт приёма-передачи выполненных работ — документ, который прикладывают
          к делу перед его завершением. Если дело закрыто без акта, система
          покажет мягкое предупреждение (но не заблокирует закрытие).
        </>
      ),
    },
    ...(isStaff
      ? [
          {
            q: 'Как добавить сотрудника или изменить права?',
            a: (
              <>
                Раздел <b>«Настройки» → «Пользователи и роли»</b> (доступен
                владельцу и администратору). Там можно завести сотрудника,
                назначить роль и при необходимости выдать персональные права.
              </>
            ),
          },
          {
            q: 'Как изменить цветовую тему?',
            a: (
              <>
                Раздел <b>«Настройки» → «Оформление»</b>. Выбор темы сохраняется
                в текущем браузере.
              </>
            ),
          },
        ]
      : []),
  ];

  const principles: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
    { icon: Briefcase, title: 'Дело — в центре', text: 'Договор и есть дело. Вокруг него — клиент, документы, задачи, команда и деньги.' },
    { icon: GitBranch, title: 'Воронка из 5 этапов', text: 'От нового обращения до завершения. Движение только вперёд — порядок и история в чистоте.' },
    { icon: Coins, title: 'Зарплата = % от оплат', text: 'Процент от оплаченного клиентом, по категории дела. Считается автоматически.' },
    { icon: ShieldCheck, title: 'Доступ по ролям', text: 'Каждый видит ровно своё. Права заложены и в интерфейсе, и в базе данных.' },
  ];

  return (
    <main className="flex flex-col gap-7 px-3 py-2 sm:px-4">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <Card
        className="relative overflow-hidden border-0 px-6 py-7 sm:px-8"
        style={{ backgroundImage: 'var(--grad-brass)' }}
      >
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm">
              <HelpCircle size={26} strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-white">
                Справка и обучение
              </h1>
              <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-white/90">
                ЮрКейс — CRM для юридической компании. Ниже — как всё работает: правила,
                примеры, пошаговые инструкции и интерактивный тур по каждому разделу.
              </p>
            </div>
          </div>
          <HelpActions />
        </div>
      </Card>

      {/* ── Ключевые принципы ─────────────────────────────────── */}
      <Section icon={Sparkles} title="Как всё устроено">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {principles.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} className="flex flex-col gap-2.5 p-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="text-[14px] font-bold text-text">{p.title}</h3>
                <p className="text-[13px] leading-relaxed text-text-muted">{p.text}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ── Воронка из 5 этапов (визуальный пример) ────────────── */}
      <Section icon={GitBranch} title="Путь дела: 5 этапов">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          {/* Иллюстрация-степпер (как в карточке дела) */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-1">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex flex-1 items-center gap-1">
                <div
                  className="flex flex-1 flex-col items-center gap-1 rounded-[10px] px-2 py-2.5 text-center"
                  style={{ background: `var(${s.varName}-bg)` }}
                >
                  <span
                    className="text-[12.5px] font-bold leading-tight"
                    style={{ color: `var(${s.varName})` }}
                  >
                    {s.label}
                  </span>
                  <span className="text-[11px] leading-tight text-text-muted">{s.note}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <ArrowRight
                    size={15}
                    strokeWidth={2}
                    className="hidden shrink-0 text-text-subtle sm:block"
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            Этап двигается <b className="text-text">только вперёд</b> — кликом по следующему
            шагу в карточке дела. Это сохраняет порядок и честную историю. Ошибочно
            выставленный этап может поправить только сотрудник офиса — и это запишется в
            журнал изменений.
          </p>
        </Card>
      </Section>

      {/* ── Роли и доступ (пример: кто что видит) ──────────────── */}
      <Section icon={ShieldCheck} title="Кто что видит">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ROLES.map((r) => (
            <Card key={r.name} className="flex items-start gap-3.5 p-4">
              <span
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: r.tone }}
                aria-hidden="true"
              >
                <Eye size={17} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-bold text-text">{r.name}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">{r.sees}</p>
              </div>
            </Card>
          ))}
        </div>
        <Callout>
          {visibility} Это правило работает и в интерфейсе, и в самой базе данных — данные
          клиентов защищены на самом глубоком уровне.
        </Callout>
      </Section>

      {/* ── Зарплата: формула + живой пример ───────────────────── */}
      <Section icon={Coins} title="Зарплата: процент от оплат">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Ставки по категориям */}
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-text-muted">
              Ставки по категориям
            </h3>
            <div className="flex flex-col gap-2">
              {RATES.map((r) => (
                <div
                  key={r.cat}
                  className="flex items-center justify-between rounded-[10px] px-3.5 py-2.5"
                  style={{ background: `var(${r.varName}-bg)` }}
                >
                  <span className="text-[14px] font-semibold" style={{ color: `var(${r.varName})` }}>
                    {r.cat}
                  </span>
                  <span
                    className="font-mono text-[18px] font-extrabold tabular-nums"
                    style={{ color: `var(${r.varName})` }}
                  >
                    {r.pct}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* «Скриншото-подобный» пример расчёта */}
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-text-muted">
              Пример расчёта
            </h3>
            <div className="rounded-[10px] border border-border bg-surface-muted/60 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-md bg-cat-claim-bg px-2 py-0.5 font-semibold text-cat-claim">
                  Иск · 10%
                </span>
                <span className="text-text-muted">Дело CRM-2026-007</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[13px] tabular-nums">
                <span className="text-text-muted">
                  Сумма <span className="font-bold text-text">100 000 ₴</span>
                </span>
                <span className="text-text-muted">
                  Оплачено <span className="font-bold text-success">60 000 ₴</span>
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <PayRow role="Юрист" base="60 000 ₴ × 10%" amount="6 000 ₴" />
                <PayRow role="Эксперт" base="60 000 ₴ × 10%" amount="6 000 ₴" />
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-text-muted">
              База — <b className="text-text">оплаченная</b> сумма (не вся сумма договора).
              Полный процент получает <b className="text-text">каждый</b> — и юрист, и эксперт.
              Внесёте новый платёж — начисления пересчитаются сами.
            </p>
          </Card>
        </div>
      </Section>

      {/* ── Пошагово: завести клиента / создать дело ───────────── */}
      <Section icon={FilePlus} title="С чего начать">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Steps
            icon={UserPlus}
            title="Завести клиента"
            steps={[
              <>Раздел <b>«Клиенты»</b> → кнопка <b>«Добавить клиента»</b>.</>,
              <>Имя, тип (<b>физлицо</b> или <b>компания</b>), телефон и e-mail.</>,
              <>Укажите <b>источник</b> — откуда пришёл клиент (сайт, рекомендация…).</>,
              <>Нажмите <b>«Создать клиента»</b> — он появится в списке.</>,
            ]}
          />
          <Steps
            icon={Briefcase}
            title="Создать дело"
            steps={[
              <>Раздел <b>«Дела»</b> → кнопка <b>«Новое дело»</b>.</>,
              <>Номер/название и <b>клиент</b> (или заведите нового прямо в форме).</>,
              <><b>Юрист-продажник</b> и <b>эксперт-исполнитель</b>.</>,
              <><b>Категория</b> и <b>сумма договора</b> — основа для расчётов.</>,
              <>Нажмите <b>«Создать дело»</b> — карточка готова к работе.</>,
            ]}
          />
        </div>
      </Section>

      {/* ── Документы / Платежи / Сроки ────────────────────────── */}
      <Section icon={FileText} title="Внутри дела">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniCard
            icon={FileText}
            title="Документы"
            text="Договор, иск, доверенность, переписка и акт приёма-передачи. Файл виден всем, кто видит дело."
          />
          <MiniCard
            icon={Wallet}
            title="Платежи и долг"
            text="Добавляйте поступления — «оплачено» и «долг» по делу пересчитаются автоматически."
          />
          <MiniCard
            icon={CalendarClock}
            title="Задачи и сроки"
            text="Задачи, заседания и дедлайны попадают в общий календарь и в напоминания."
          />
        </div>
      </Section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <Section icon={Search} title="Частые вопросы">
        <Card className="overflow-hidden">
          {faqs.map((f, i) => (
            <details
              key={f.q}
              className={`group ${i < faqs.length - 1 ? 'border-b border-border' : ''}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[14px] font-semibold text-text transition-colors hover:bg-surface-muted">
                {f.q}
                <span className="text-text-subtle transition-transform duration-200 group-open:rotate-45">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <div className="px-5 pb-4 pt-0 text-[13.5px] leading-relaxed text-text-muted">
                {f.a}
              </div>
            </details>
          ))}
        </Card>
        <p className="text-[12.5px] text-text-subtle">
          Не нашли ответ? Запустите интерактивный тур кнопкой вверху — он проведёт по
          каждому разделу и покажет, что где находится, прямо в живом интерфейсе.
        </p>
      </Section>
    </main>
  );
}

// ============================================================================
// Внутренние UI-частники страницы
// ============================================================================

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="inline-flex items-center gap-2 text-[16px] font-bold text-text">
        <Icon size={17} strokeWidth={1.75} className="text-text-muted" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-primary-border bg-primary-subtle px-4 py-3 text-[13px] font-medium leading-relaxed text-primary-pressed">
      {children}
    </div>
  );
}

function PayRow({ role, base, amount }: { role: string; base: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-semibold text-text">{role}</span>
      <span className="font-mono text-[12px] text-text-subtle">{base}</span>
      <span className="ml-auto whitespace-nowrap rounded-md bg-success-bg px-2.5 py-1 font-mono text-[14px] font-bold tabular-nums text-success">
        {amount}
      </span>
    </div>
  );
}

function Steps({
  icon: Icon,
  title,
  steps,
}: {
  icon: LucideIcon;
  title: string;
  steps: React.ReactNode[];
}) {
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-text">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <Icon size={17} strokeWidth={1.75} />
        </span>
        {title}
      </h3>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-fg">
              {i + 1}
            </span>
            <span className="text-[13.5px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text">
              {s}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MiniCard({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <h3 className="text-[14px] font-bold text-text">{title}</h3>
      <p className="text-[13px] leading-relaxed text-text-muted">{text}</p>
    </Card>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-text">
      {children}
    </kbd>
  );
}
