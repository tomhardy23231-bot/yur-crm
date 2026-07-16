// scripts/seed-demo.ts
// Демо-сид: ЧИСТИТ доменные данные и создаёт 10 разнообразных дел (цикл v4:
// чистый Postgres/Neon, adminDb). МНОГО данных для догфудинга UI: разные этапы,
// категории, истории платежей, долг/переплата, закрытие с актом и без,
// индивидуальные ставки (override), документы.
//
// Запуск: `npm run db:seed:demo` (после db:migrate). Требует DATABASE_URL_ADMIN
// (+ DATABASE_URL_APP для override-ставок от owner под RLS-guard).
//
// Отличие от scripts/seed.ts (минимальный сид для smoke-rls): здесь богатая
// «история». Перед сидом доменные таблицы ОЧИЩАЮТСЯ (cases/clients/payments/
// tasks/documents/…); пользователи-логины пересоздаются (upsert).
//
// ⚠ payroll_ledger в v4 ЗАМОРОЖЕН (v3 с12): accrual_mode — колонка-призрак
//   (убрана из UI/кода уборкой 2026-07-16, осталась в БД с DEFAULT до Phase 2),
//   accrued-строки не создаются, «выплаты» из демо убраны. ЗП догфудится
//   live-отчётом /reports/payroll (payroll_employee_summary), не леджером.

import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import { userDb } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';
import { storage } from '@/lib/storage';

if (process.env.YUR_DB_ENV === 'prod' && process.env.ALLOW_NONLOCAL_SEED !== '1') {
  console.error(
    'Отказ сидить прод (YUR_DB_ENV=prod): демо-сид УДАЛЯЕТ доменные данные. ' +
      'Если осознанно: ALLOW_NONLOCAL_SEED=1 npm run db:seed:demo',
  );
  process.exit(1);
}

const db = adminDb();
const PASSWORD = 'test12345!';

type Role = 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert';
type DocType = 'contract' | 'claim' | 'power_of_attorney' | 'correspondence' | 'act' | 'other';

// Департаменты — как в seed.ts (под матрицу видимости Этапа 2): дело A видят
// Київ+Дніпро, дело B — Дніпро+Львів (реалистичный догфудинг скоупа).
const ACCOUNTS: Array<{ email: string; full_name: string; role: Role; department: string | null }> = [
  { email: 'owner@yur.local', full_name: 'Влад Владелец', role: 'owner', department: null },
  { email: 'admin@yur.local', full_name: 'Анна Админ', role: 'admin', department: 'Київський' },
  { email: 'office@yur.local', full_name: 'Оля Секретарёва', role: 'office_manager', department: 'Київський' },
  { email: 'lawyer@yur.local', full_name: 'Лев Юристов', role: 'lawyer', department: 'Київський' },
  { email: 'lawyer2@yur.local', full_name: 'Лиза Договорова', role: 'lawyer', department: 'Дніпровський' },
  { email: 'expert@yur.local', full_name: 'Эдуард Экспертов', role: 'expert', department: 'Дніпровський' },
  { email: 'expert2@yur.local', full_name: 'Елена Экспертова', role: 'expert', department: 'Львівський' },
];

async function ensureAuthUser(email: string): Promise<string> {
  const existing = await db.auth_users.findFirst({ where: { email }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.auth_users.create({
    data: { email, encrypted_password: bcrypt.hashSync(PASSWORD, 10) },
    select: { id: true },
  });
  return created.id;
}

async function seedUsers(): Promise<Map<string, string>> {
  const deps = new Map((await db.departments.findMany({ select: { id: true, name: true } })).map((d) => [d.name, d.id]));
  const idByEmail = new Map<string, string>();
  for (const acc of ACCOUNTS) {
    const id = await ensureAuthUser(acc.email);
    idByEmail.set(acc.email, id);
    const department_id = acc.department ? deps.get(acc.department) ?? null : null;
    await db.public_users.upsert({
      where: { id },
      create: { id, full_name: acc.full_name, email: acc.email, role: acc.role, is_active: true, department_id },
      update: { full_name: acc.full_name, email: acc.email, role: acc.role, is_active: true, department_id },
    });
  }
  return idByEmail;
}

// Очистка доменных данных (FK-безопасный порядок; users/departments/cash_accounts
// не трогаем). Платежи чистим последними из «детей дела» — их удаление каскадит
// авто-строки кассы (cash_entries.payment_id) и требует, чтобы акты уже ушли.
async function wipeDomain(): Promise<void> {
  await db.payout_allocations.deleteMany({});
  await db.payroll_transactions.deleteMany({});
  await db.payroll_ledger.deleteMany({});
  await db.activity_log.deleteMany({});
  await db.case_comments.deleteMany({});
  await db.tasks.deleteMany({});
  await db.documents.deleteMany({});
  await db.payment_plan_items.deleteMany({});
  await db.case_acts.deleteMany({});
  await db.payments.deleteMany({});
  await db.cases.deleteMany({});
  await db.clients.deleteMany({});
}

type ClientSeed = {
  key: string; name: string; client_kind: 'individual' | 'company';
  phone?: string; email?: string; address?: string;
  source?: 'website' | 'referral' | 'advertising' | 'repeat' | 'other'; notes?: string;
};

const CLIENTS: ClientSeed[] = [
  { key: 'ivanov', name: 'Иванов Иван Иванович', client_kind: 'individual', phone: '+380501112233', email: 'ivanov@example.com', source: 'referral', notes: 'Постоянный клиент, два дела.' },
  { key: 'acme', name: 'ООО «Акме»', client_kind: 'company', phone: '+380441234567', email: 'legal@acme.example', address: 'г. Киев, ул. Примерная, 1', source: 'website' },
  { key: 'petrenko', name: 'Петренко Оксана Сергеевна', client_kind: 'individual', phone: '+380671002030', email: 'petrenko@example.com', source: 'advertising' },
  { key: 'globex', name: 'ЗАО «Глобэкс»', client_kind: 'company', phone: '+380442223344', email: 'office@globex.example', address: 'г. Львов, пр. Свободы, 28', source: 'repeat' },
  { key: 'kovalchuk', name: 'Ковальчук Андрей Петрович', client_kind: 'individual', phone: '+380931234567', email: 'kovalchuk@example.com', source: 'website', notes: 'Два дела: трудовой спор и семейное.' },
  { key: 'meridian', name: 'ООО «Меридиан»', client_kind: 'company', phone: '+380445556677', email: 'info@meridian.example', address: 'г. Одесса, ул. Дерибасовская, 5', source: 'other' },
  { key: 'sydorenko', name: 'Сидоренко Мария Владимировна', client_kind: 'individual', phone: '+380681112244', email: 'sydorenko@example.com', source: 'referral' },
];

type SeedPayment = { amount: number; paid_at: string; method?: string; note?: string };
type SeedTask = { title: string; kind: 'task' | 'hearing' | 'deadline'; assignee: 'lawyer' | 'expert'; due_at?: string; status?: 'open' | 'done' };
type SeedDoc = { file_name: string; doc_type: DocType };

type SeedCase = {
  number_title: string; clientKey: string; lawyer: string; expert: string;
  opened_at: string;
  case_type: 'civil' | 'criminal' | 'corporate' | 'administrative' | 'family' | 'labor' | 'other';
  category: 'document' | 'claim' | 'representation';
  subject?: string;
  stage: 'new_request' | 'consultation' | 'in_progress' | 'awaiting_decision' | 'closed';
  priority: 'normal' | 'urgent'; contract_sum: number;
  billing_types?: ('prepaid' | 'installments' | 'fixed' | 'success_fee')[];
  tags?: string[]; opponent?: string; court?: string; court_case_number?: string;
  closed_at?: string; overrides?: { lawyer?: number; expert?: number };
  payments?: SeedPayment[]; tasks?: SeedTask[]; documents?: SeedDoc[];
};

const L1 = 'lawyer@yur.local';
const L2 = 'lawyer2@yur.local';
const E1 = 'expert@yur.local';
const E2 = 'expert2@yur.local';

const CASES: SeedCase[] = [
  { number_title: 'CRM-2026-001', clientKey: 'ivanov', lawyer: L1, expert: E1, opened_at: '2026-05-01', case_type: 'civil', category: 'representation', subject: 'Представительство в суде по имущественному спору', stage: 'in_progress', priority: 'normal', contract_sum: 30000, billing_types: ['fixed'], tags: ['imushestvo'], payments: [{ amount: 10000, paid_at: '2026-05-10', method: 'bank', note: 'Аванс по договору' }], tasks: [{ title: 'Подготовить иск', kind: 'task', assignee: 'expert', due_at: '2026-06-05T10:00:00Z' }] },
  { number_title: 'CRM-2026-002', clientKey: 'acme', lawyer: L2, expert: E2, opened_at: '2026-05-15', case_type: 'corporate', category: 'claim', subject: 'Взыскание задолженности по договору поставки', stage: 'consultation', priority: 'urgent', contract_sum: 120000, billing_types: ['prepaid', 'installments'], tags: ['corporate'], tasks: [{ title: 'Заседание по делу ООО «Акме»', kind: 'hearing', assignee: 'expert', due_at: '2026-06-10T09:00:00Z' }] },
  { number_title: 'CRM-2026-003', clientKey: 'petrenko', lawyer: L1, expert: E2, opened_at: '2026-02-03', case_type: 'family', category: 'document', subject: 'Брачный договор: составление и сопровождение', stage: 'closed', priority: 'normal', contract_sum: 15000, closed_at: '2026-03-20', billing_types: ['fixed'], tags: ['family'], payments: [{ amount: 15000, paid_at: '2026-02-10', method: 'card', note: 'Оплата полностью' }], documents: [{ file_name: 'Договор_Петренко.pdf', doc_type: 'contract' }, { file_name: 'Акт_приёма-передачи.pdf', doc_type: 'act' }], tasks: [{ title: 'Передать оригиналы клиенту', kind: 'task', assignee: 'lawyer', status: 'done' }] },
  { number_title: 'CRM-2026-004', clientKey: 'globex', lawyer: L2, expert: E1, opened_at: '2026-01-12', case_type: 'corporate', category: 'claim', subject: 'Досудебная претензия контрагенту', stage: 'closed', priority: 'normal', contract_sum: 40000, closed_at: '2026-02-28', billing_types: ['fixed'], tags: ['claim'], payments: [{ amount: 40000, paid_at: '2026-01-20', method: 'bank' }] },
  { number_title: 'CRM-2026-005', clientKey: 'kovalchuk', lawyer: L1, expert: E1, opened_at: '2026-04-02', case_type: 'civil', category: 'representation', subject: 'Спор о праве собственности на квартиру', stage: 'awaiting_decision', priority: 'normal', contract_sum: 10000, billing_types: ['prepaid'], tags: ['overpaid', 'imushestvo'], payments: [{ amount: 10000, paid_at: '2026-04-05', method: 'card', note: 'Предоплата' }, { amount: 3000, paid_at: '2026-05-12', method: 'card', note: 'Доплата (ошибочно больше суммы)' }], tasks: [{ title: 'Ожидаем решение суда первой инстанции', kind: 'deadline', assignee: 'expert', due_at: '2026-06-20T00:00:00Z' }] },
  { number_title: 'CRM-2026-006', clientKey: 'meridian', lawyer: L2, expert: E2, opened_at: '2026-03-18', case_type: 'administrative', category: 'claim', subject: 'Обжалование решения налоговой', stage: 'in_progress', priority: 'urgent', contract_sum: 60000, billing_types: ['installments'], tags: ['tax'], payments: [{ amount: 15000, paid_at: '2026-03-25', method: 'bank', note: '1-й транш' }, { amount: 15000, paid_at: '2026-04-25', method: 'bank', note: '2-й транш' }], tasks: [{ title: 'Подать апелляционную жалобу', kind: 'deadline', assignee: 'expert', due_at: '2026-06-01T00:00:00Z' }] },
  { number_title: 'CRM-2026-007', clientKey: 'sydorenko', lawyer: L1, expert: E2, opened_at: '2026-05-26', case_type: 'criminal', category: 'document', subject: 'Консультация по уголовному делу', stage: 'new_request', priority: 'urgent', contract_sum: 5000, tags: ['new'], tasks: [{ title: 'Перезвонить клиенту, согласовать встречу', kind: 'task', assignee: 'lawyer', due_at: '2026-05-28T12:00:00Z' }] },
  { number_title: 'CRM-2026-008', clientKey: 'acme', lawyer: L2, expert: E1, opened_at: '2026-02-20', case_type: 'corporate', category: 'representation', subject: 'Представительство в хозяйственном суде (крупный спор)', stage: 'awaiting_decision', priority: 'urgent', contract_sum: 200000, billing_types: ['installments', 'success_fee'], tags: ['vip', 'court'], opponent: 'ООО «Конкурент»', court: 'Хозяйственный суд г. Киева', court_case_number: '910/12345/2026', overrides: { lawyer: 30, expert: 15 }, payments: [{ amount: 50000, paid_at: '2026-02-25', method: 'bank', note: 'Аванс' }, { amount: 30000, paid_at: '2026-04-10', method: 'bank', note: '2-й платёж' }], tasks: [{ title: 'Судебное заседание', kind: 'hearing', assignee: 'expert', due_at: '2026-06-15T09:30:00Z' }, { title: 'Подготовить отзыв на иск', kind: 'deadline', assignee: 'expert', due_at: '2026-06-08T00:00:00Z' }], documents: [{ file_name: 'Договор_Акме_представительство.pdf', doc_type: 'contract' }] },
  { number_title: 'CRM-2026-009', clientKey: 'kovalchuk', lawyer: L1, expert: E1, opened_at: '2026-03-01', case_type: 'labor', category: 'claim', subject: 'Взыскание невыплаченной зарплаты и компенсации', stage: 'in_progress', priority: 'normal', contract_sum: 50000, billing_types: ['installments'], tags: ['labor'], payments: [{ amount: 8000, paid_at: '2026-03-05', method: 'card', note: '1/3' }, { amount: 7000, paid_at: '2026-04-05', method: 'card', note: '2/3' }, { amount: 5000, paid_at: '2026-05-05', method: 'card', note: '3/3 (частично)' }], tasks: [{ title: 'Запросить справку о доходах', kind: 'task', assignee: 'lawyer', status: 'done' }] },
  { number_title: 'CRM-2026-010', clientKey: 'kovalchuk', lawyer: L2, expert: E2, opened_at: '2026-01-08', case_type: 'family', category: 'representation', subject: 'Раздел имущества при разводе', stage: 'closed', priority: 'normal', contract_sum: 90000, closed_at: '2026-04-15', billing_types: ['fixed', 'success_fee'], tags: ['family', 'success'], payments: [{ amount: 50000, paid_at: '2026-01-15', method: 'bank', note: 'Аванс' }, { amount: 40000, paid_at: '2026-03-30', method: 'bank', note: 'Остаток' }], documents: [{ file_name: 'Договор_Ковальчук_развод.pdf', doc_type: 'contract' }, { file_name: 'Акт_выполненных_работ.pdf', doc_type: 'act' }] },
];

async function seedCase(c: SeedCase, clientIds: Map<string, string>, userIds: Map<string, string>, ownerId: string): Promise<void> {
  const lawyerId = userIds.get(c.lawyer)!;
  const expertId = userIds.get(c.expert)!;
  const adminId = userIds.get('admin@yur.local')!;

  const caseRow = await db.cases.create({
    data: {
      number_title: c.number_title, client_id: clientIds.get(c.clientKey)!,
      lawyer_id: lawyerId, responsible_id: expertId, opened_at: new Date(c.opened_at),
      case_type: c.case_type as never, category: c.category as never, subject: c.subject ?? null,
      stage: c.stage as never, priority: c.priority as never, contract_sum: c.contract_sum,
      billing_types: c.billing_types ?? [], tags: c.tags ?? [], opponent: c.opponent ?? null,
      court: c.court ?? null, court_case_number: c.court_case_number ?? null,
      closed_at: c.closed_at ? new Date(c.closed_at) : null,
    },
    select: { id: true },
  });
  const caseId = caseRow.id;

  // Override-ставки — только от owner (BD-триггер cases_guard_rate_overrides).
  if (c.overrides) {
    await userDb(ownerId, (tx) =>
      tx.cases.updateMany({
        where: { id: caseId },
        data: { lawyer_rate_override: c.overrides!.lawyer ?? null, expert_rate_override: c.overrides!.expert ?? null },
      }),
    );
  }

  for (const p of c.payments ?? []) {
    await db.payments.create({
      data: { case_id: caseId, amount: p.amount, paid_at: new Date(p.paid_at), method: p.method ?? null, note: p.note ?? null, created_by: adminId },
    });
  }
  for (const t of c.tasks ?? []) {
    await db.tasks.create({
      data: { case_id: caseId, title: t.title, kind: t.kind as never, assignee_id: t.assignee === 'lawyer' ? lawyerId : expertId, created_by: adminId, due_at: t.due_at ? new Date(t.due_at) : null, status: (t.status ?? 'open') as never },
    });
  }
  for (const d of c.documents ?? []) {
    const key = `cases/${caseId}/${randomUUID()}--${d.doc_type}.txt`;
    await storage().upload(key, Buffer.from(`Демо-файл «${d.file_name}» по делу ${c.number_title}.\n`), { contentType: 'text/plain' });
    await db.documents.create({
      data: { case_id: caseId, file_name: d.file_name, storage_key: key, doc_type: d.doc_type as never, uploaded_by: adminId },
    });
  }
}

async function main(): Promise<void> {
  console.log('Сидим пользователей...');
  const userIds = await seedUsers();
  console.log(`  готово: ${userIds.size} аккаунтов (пароль: ${PASSWORD})`);

  console.log('Чистим доменные данные...');
  await wipeDomain();
  console.log('  готово');

  const ownerId = userIds.get('owner@yur.local')!;

  console.log('Создаём клиентов...');
  const clientIds = new Map<string, string>();
  for (const cl of CLIENTS) {
    const row = await db.clients.create({
      data: { name: cl.name, client_kind: cl.client_kind as never, phone: cl.phone ?? null, email: cl.email ?? null, address: cl.address ?? null, source: (cl.source ?? null) as never, notes: cl.notes ?? null, created_by: userIds.get('admin@yur.local')! },
      select: { id: true },
    });
    clientIds.set(cl.key, row.id);
  }
  console.log(`  готово: ${clientIds.size} клиентов`);

  console.log('Создаём 10 дел с историями...');
  for (const c of CASES) {
    await seedCase(c, clientIds, userIds, ownerId);
    console.log(`  ✓ ${c.number_title} — ${c.stage}`);
  }

  console.log('\nГотово.');
  console.log(`  Дел: ${CASES.length}, клиентов: ${CLIENTS.length}`);
  console.log('\nЛогины (пароль test12345!):');
  for (const acc of ACCOUNTS) console.log(`  ${acc.email.padEnd(24)} → ${acc.role}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
