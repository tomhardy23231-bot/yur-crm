// scripts/seed-demo.ts
// Демо-сид: ЧИСТИТ все доменные данные и создаёт 10 разнообразных дел.
//
// Запуск: `npm run db:seed:demo`
// Требует: поднятый локальный Supabase + .env.local (URL, ANON, SERVICE_ROLE).
//
// Отличие от scripts/seed.ts (минимальный сид для smoke-rls):
//   - здесь МНОГО данных для ручного догфудинга UI: разные этапы, категории,
//     истории платежей, долг/переплата, закрытие с актом и без, per_payment,
//     индивидуальные ставки (override), частичные/полные выплаты в леджере.
//   - перед сидом доменные таблицы ОЧИЩАЮТСЯ (cases/clients/payments/tasks/
//     documents/payroll_ledger/activity_log). Пользователи-логины сохраняются.
//
// service_role КЛЮЧ → в обход RLS. Override-ставки на деле защищены БД-триггером
// (только owner/admin), поэтому их выставляем отдельным клиентом от имени owner.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error(
    'Не заданы NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY в .env.local.',
  );
  process.exit(1);
}

// Защита от случайного запуска против staging/prod.
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(SUPABASE_URL);
if (!IS_LOCAL && process.env.ALLOW_NONLOCAL_SEED !== '1') {
  console.error(
    `Отказ сидить нелокальный Supabase: ${SUPABASE_URL}\n` +
      'Демо-сид УДАЛЯЕТ доменные данные. Если действительно нужно — ALLOW_NONLOCAL_SEED=1 npm run db:seed:demo',
  );
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'test12345!';

type Role = 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert';
type DocType =
  | 'contract' | 'claim' | 'power_of_attorney' | 'correspondence' | 'act' | 'other';

type Account = { email: string; full_name: string; role: Role };

const ACCOUNTS: Account[] = [
  { email: 'owner@yur.local', full_name: 'Влад Владелец', role: 'owner' },
  { email: 'admin@yur.local', full_name: 'Анна Админ', role: 'admin' },
  { email: 'office@yur.local', full_name: 'Оля Секретарёва', role: 'office_manager' },
  { email: 'lawyer@yur.local', full_name: 'Лев Юристов', role: 'lawyer' },
  { email: 'lawyer2@yur.local', full_name: 'Лиза Договорова', role: 'lawyer' },
  { email: 'expert@yur.local', full_name: 'Эдуард Экспертов', role: 'expert' },
  { email: 'expert2@yur.local', full_name: 'Елена Экспертова', role: 'expert' },
];

// ── Пользователи ────────────────────────────────────────────────────────
async function ensureAuthUser(email: string): Promise<string> {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error(`createUser вернул пустой user для ${email}`);
  return data.user.id;
}

async function seedUsers(): Promise<Map<string, string>> {
  const idByEmail = new Map<string, string>();
  for (const acc of ACCOUNTS) {
    const id = await ensureAuthUser(acc.email);
    idByEmail.set(acc.email, id);
    const { error } = await admin.from('users').upsert(
      { id, full_name: acc.full_name, email: acc.email, role: acc.role, is_active: true },
      { onConflict: 'id' },
    );
    if (error) throw error;
  }
  return idByEmail;
}

// ── Очистка доменных данных (FK-безопасный порядок) ─────────────────────
async function wipeDomain(): Promise<void> {
  const tables = [
    'payroll_ledger',
    'activity_log',
    'payments',
    'documents',
    'tasks',
    'cases',
    'clients',
  ];
  for (const t of tables) {
    const { error } = await admin.from(t).delete().not('id', 'is', null);
    if (error) throw new Error(`wipe ${t}: ${error.message}`);
  }
  // Старые объекты в storage (case-documents) станут «сиротами» — безвредно;
  // новые документы получат новые ключи. Полную чистку файлов не делаем.
}

// ── Клиенты ─────────────────────────────────────────────────────────────
type ClientSeed = {
  key: string; name: string; client_kind: 'individual' | 'company';
  phone?: string; email?: string; address?: string;
  source?: 'website' | 'referral' | 'advertising' | 'repeat' | 'other';
  notes?: string;
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

// ── Дела ─────────────────────────────────────────────────────────────────
type SeedPayment = { amount: number; paid_at: string; method?: string; note?: string };
type SeedTask = { title: string; kind: 'task' | 'hearing' | 'deadline'; assignee: 'lawyer' | 'expert'; due_at?: string; status?: 'open' | 'done' };
type SeedDoc = { file_name: string; doc_type: DocType };

type SeedCase = {
  number_title: string;
  clientKey: string;
  lawyer: string; // email
  expert: string; // email
  opened_at: string;
  case_type: 'civil' | 'criminal' | 'corporate' | 'administrative' | 'family' | 'labor' | 'other';
  category: 'document' | 'claim' | 'representation';
  subject?: string;
  stage: 'new_request' | 'consultation' | 'in_progress' | 'awaiting_decision' | 'closed';
  priority: 'normal' | 'urgent';
  contract_sum: number;
  billing_types?: ('prepaid' | 'installments' | 'fixed' | 'success_fee')[];
  tags?: string[];
  accrual_mode?: 'on_completion' | 'per_payment';
  opponent?: string;
  court?: string;
  court_case_number?: string;
  closed_at?: string;
  overrides?: { lawyer?: number; expert?: number };
  payments?: SeedPayment[];
  tasks?: SeedTask[];
  documents?: SeedDoc[];
  payouts?: ('lawyer' | 'expert')[]; // какие роли отметить «выплачено»
};

const L1 = 'lawyer@yur.local';
const L2 = 'lawyer2@yur.local';
const E1 = 'expert@yur.local';
const E2 = 'expert2@yur.local';

const CASES: SeedCase[] = [
  // 1 — [совместимо со smoke-rls] представительство, в работе, частичная оплата → долг.
  {
    number_title: 'CRM-2026-001', clientKey: 'ivanov', lawyer: L1, expert: E1,
    opened_at: '2026-05-01', case_type: 'civil', category: 'representation',
    subject: 'Представительство в суде по имущественному спору',
    stage: 'in_progress', priority: 'normal', contract_sum: 30000,
    billing_types: ['fixed'], tags: ['imushestvo'],
    payments: [{ amount: 10000, paid_at: '2026-05-10', method: 'bank', note: 'Аванс по договору' }],
    tasks: [{ title: 'Подготовить иск', kind: 'task', assignee: 'expert', due_at: '2026-06-05T10:00:00Z' }],
  },
  // 2 — [совместимо со smoke-rls] взыскание, консультация, без оплат, срочное.
  {
    number_title: 'CRM-2026-002', clientKey: 'acme', lawyer: L2, expert: E2,
    opened_at: '2026-05-15', case_type: 'corporate', category: 'claim',
    subject: 'Взыскание задолженности по договору поставки',
    stage: 'consultation', priority: 'urgent', contract_sum: 120000,
    billing_types: ['prepaid', 'installments'], tags: ['corporate'],
    tasks: [{ title: 'Заседание по делу ООО «Акме»', kind: 'hearing', assignee: 'expert', due_at: '2026-06-10T09:00:00Z' }],
  },
  // 3 — закрыто С актом, полностью оплачено, обе выплаты проведены (document 7%).
  {
    number_title: 'CRM-2026-003', clientKey: 'petrenko', lawyer: L1, expert: E2,
    opened_at: '2026-02-03', case_type: 'family', category: 'document',
    subject: 'Брачный договор: составление и сопровождение',
    stage: 'closed', priority: 'normal', contract_sum: 15000, closed_at: '2026-03-20',
    billing_types: ['fixed'], tags: ['family'],
    payments: [{ amount: 15000, paid_at: '2026-02-10', method: 'card', note: 'Оплата полностью' }],
    documents: [
      { file_name: 'Договор_Петренко.pdf', doc_type: 'contract' },
      { file_name: 'Акт_приёма-передачи.pdf', doc_type: 'act' },
    ],
    tasks: [{ title: 'Передать оригиналы клиенту', kind: 'task', assignee: 'lawyer', status: 'done' }],
    payouts: ['lawyer', 'expert'],
  },
  // 4 — закрыто БЕЗ акта (бейдж «без акта»), оплачено, выплаты НЕ проведены (claim 10%).
  {
    number_title: 'CRM-2026-004', clientKey: 'globex', lawyer: L2, expert: E1,
    opened_at: '2026-01-12', case_type: 'corporate', category: 'claim',
    subject: 'Досудебная претензия контрагенту',
    stage: 'closed', priority: 'normal', contract_sum: 40000, closed_at: '2026-02-28',
    billing_types: ['fixed'], tags: ['claim'],
    payments: [{ amount: 40000, paid_at: '2026-01-20', method: 'bank' }],
    // акта намеренно нет → closed_without_act = true
  },
  // 5 — ПЕРЕПЛАТА клиента (оплачено больше суммы договора), ожидание решения.
  {
    number_title: 'CRM-2026-005', clientKey: 'kovalchuk', lawyer: L1, expert: E1,
    opened_at: '2026-04-02', case_type: 'civil', category: 'representation',
    subject: 'Спор о праве собственности на квартиру',
    stage: 'awaiting_decision', priority: 'normal', contract_sum: 10000,
    billing_types: ['prepaid'], tags: ['overpaid', 'imushestvo'],
    payments: [
      { amount: 10000, paid_at: '2026-04-05', method: 'card', note: 'Предоплата' },
      { amount: 3000, paid_at: '2026-05-12', method: 'card', note: 'Доплата (ошибочно больше суммы)' },
    ],
    tasks: [{ title: 'Ожидаем решение суда первой инстанции', kind: 'deadline', assignee: 'expert', due_at: '2026-06-20T00:00:00Z' }],
  },
  // 6 — per_payment: начисление по мере оплат, частичная оплата → долг, к выплате (claim 10%).
  {
    number_title: 'CRM-2026-006', clientKey: 'meridian', lawyer: L2, expert: E2,
    opened_at: '2026-03-18', case_type: 'administrative', category: 'claim',
    subject: 'Обжалование решения налоговой',
    stage: 'in_progress', priority: 'urgent', contract_sum: 60000,
    billing_types: ['installments'], tags: ['tax'], accrual_mode: 'per_payment',
    payments: [
      { amount: 15000, paid_at: '2026-03-25', method: 'bank', note: '1-й транш' },
      { amount: 15000, paid_at: '2026-04-25', method: 'bank', note: '2-й транш' },
    ],
    tasks: [{ title: 'Подать апелляционную жалобу', kind: 'deadline', assignee: 'expert', due_at: '2026-06-01T00:00:00Z' }],
  },
  // 7 — новое обращение, минимум данных, без оплат, срочное (document).
  {
    number_title: 'CRM-2026-007', clientKey: 'sydorenko', lawyer: L1, expert: E2,
    opened_at: '2026-05-26', case_type: 'criminal', category: 'document',
    subject: 'Консультация по уголовному делу',
    stage: 'new_request', priority: 'urgent', contract_sum: 5000, tags: ['new'],
    tasks: [{ title: 'Перезвонить клиенту, согласовать встречу', kind: 'task', assignee: 'lawyer', due_at: '2026-05-28T12:00:00Z' }],
  },
  // 8 — крупное представительство с ИНДИВИДУАЛЬНЫМИ ставками (override 30/15),
  //     судебные реквизиты, частичная оплата → долг.
  {
    number_title: 'CRM-2026-008', clientKey: 'acme', lawyer: L2, expert: E1,
    opened_at: '2026-02-20', case_type: 'corporate', category: 'representation',
    subject: 'Представительство в хозяйственном суде (крупный спор)',
    stage: 'awaiting_decision', priority: 'urgent', contract_sum: 200000,
    billing_types: ['installments', 'success_fee'], tags: ['vip', 'court'],
    opponent: 'ООО «Конкурент»', court: 'Хозяйственный суд г. Киева',
    court_case_number: '910/12345/2026',
    overrides: { lawyer: 30, expert: 15 },
    payments: [
      { amount: 50000, paid_at: '2026-02-25', method: 'bank', note: 'Аванс' },
      { amount: 30000, paid_at: '2026-04-10', method: 'bank', note: '2-й платёж' },
    ],
    tasks: [
      { title: 'Судебное заседание', kind: 'hearing', assignee: 'expert', due_at: '2026-06-15T09:30:00Z' },
      { title: 'Подготовить отзыв на иск', kind: 'deadline', assignee: 'expert', due_at: '2026-06-08T00:00:00Z' },
    ],
    documents: [{ file_name: 'Договор_Акме_представительство.pdf', doc_type: 'contract' }],
  },
  // 9 — трудовой спор, история из 3 платежей (рассрочка), остаётся долг.
  {
    number_title: 'CRM-2026-009', clientKey: 'kovalchuk', lawyer: L1, expert: E1,
    opened_at: '2026-03-01', case_type: 'labor', category: 'claim',
    subject: 'Взыскание невыплаченной зарплаты и компенсации',
    stage: 'in_progress', priority: 'normal', contract_sum: 50000,
    billing_types: ['installments'], tags: ['labor'],
    payments: [
      { amount: 8000, paid_at: '2026-03-05', method: 'card', note: '1/3' },
      { amount: 7000, paid_at: '2026-04-05', method: 'card', note: '2/3' },
      { amount: 5000, paid_at: '2026-05-05', method: 'card', note: '3/3 (частично)' },
    ],
    tasks: [{ title: 'Запросить справку о доходах', kind: 'task', assignee: 'lawyer', status: 'done' }],
  },
  // 10 — закрыто С актом, полностью оплачено; юристу выплачено, эксперту ещё нет
  //      (representation 25%, смешанное состояние леджера).
  {
    number_title: 'CRM-2026-010', clientKey: 'kovalchuk', lawyer: L2, expert: E2,
    opened_at: '2026-01-08', case_type: 'family', category: 'representation',
    subject: 'Раздел имущества при разводе',
    stage: 'closed', priority: 'normal', contract_sum: 90000, closed_at: '2026-04-15',
    billing_types: ['fixed', 'success_fee'], tags: ['family', 'success'],
    payments: [
      { amount: 50000, paid_at: '2026-01-15', method: 'bank', note: 'Аванс' },
      { amount: 40000, paid_at: '2026-03-30', method: 'bank', note: 'Остаток' },
    ],
    documents: [
      { file_name: 'Договор_Ковальчук_развод.pdf', doc_type: 'contract' },
      { file_name: 'Акт_выполненных_работ.pdf', doc_type: 'act' },
    ],
    payouts: ['lawyer'],
  },
];

// ── Вставка одного дела со всей «историей» ──────────────────────────────
async function seedCase(
  c: SeedCase,
  clientIds: Map<string, string>,
  userIds: Map<string, string>,
  ownerClient: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const lawyerId = userIds.get(c.lawyer)!;
  const expertId = userIds.get(c.expert)!;
  const adminId = userIds.get('admin@yur.local')!;

  const { data: caseRow, error: caseErr } = await admin
    .from('cases')
    .insert({
      number_title: c.number_title,
      client_id: clientIds.get(c.clientKey)!,
      lawyer_id: lawyerId,
      responsible_id: expertId,
      opened_at: c.opened_at,
      case_type: c.case_type,
      category: c.category,
      subject: c.subject ?? null,
      stage: c.stage,
      priority: c.priority,
      contract_sum: c.contract_sum,
      billing_types: c.billing_types ?? [],
      tags: c.tags ?? [],
      accrual_mode: c.accrual_mode ?? 'on_completion',
      opponent: c.opponent ?? null,
      court: c.court ?? null,
      court_case_number: c.court_case_number ?? null,
      closed_at: c.closed_at ?? null,
    })
    .select('id')
    .single();
  if (caseErr || !caseRow) throw new Error(`case ${c.number_title}: ${caseErr?.message}`);
  const caseId = caseRow.id as string;

  // Override-ставки — только от имени owner (BD-триггер cases_guard_rate_overrides).
  if (c.overrides) {
    const { error } = await ownerClient
      .from('cases')
      .update({
        lawyer_rate_override: c.overrides.lawyer ?? null,
        expert_rate_override: c.overrides.expert ?? null,
      })
      .eq('id', caseId);
    if (error) throw new Error(`override ${c.number_title}: ${error.message}`);
  }

  // Платежи (триггеры пересчитают paid_total/debt/overpaid и леджер).
  for (const p of c.payments ?? []) {
    const { error } = await admin.from('payments').insert({
      case_id: caseId, amount: p.amount, paid_at: p.paid_at,
      method: p.method ?? null, note: p.note ?? null, created_by: adminId,
    });
    if (error) throw new Error(`payment ${c.number_title}/${p.amount}: ${error.message}`);
  }

  // Задачи.
  for (const t of c.tasks ?? []) {
    const assignee = t.assignee === 'lawyer' ? lawyerId : expertId;
    const { error } = await admin.from('tasks').insert({
      case_id: caseId, title: t.title, kind: t.kind, assignee_id: assignee,
      created_by: adminId, due_at: t.due_at ?? null, status: t.status ?? 'open',
    });
    if (error) throw new Error(`task ${c.number_title}/${t.title}: ${error.message}`);
  }

  // Документы (с заглушкой-файлом в storage, чтобы скачивание работало).
  // Storage-ключ — только ASCII (кириллицу бакет не принимает); оригинальное
  // имя с кириллицей хранится в documents.file_name.
  for (const d of c.documents ?? []) {
    const key = `cases/${caseId}/${crypto.randomUUID()}--${d.doc_type}.txt`;
    const body = new Uint8Array(
      Buffer.from(`Демо-файл «${d.file_name}» по делу ${c.number_title}.\n`),
    );
    const { error: upErr } = await admin.storage
      .from('case-documents')
      .upload(key, body, { contentType: 'text/plain', upsert: false });
    if (upErr) throw new Error(`upload ${c.number_title}/${d.file_name}: ${upErr.message}`);
    const { error } = await admin.from('documents').insert({
      case_id: caseId, file_name: d.file_name, storage_key: key,
      doc_type: d.doc_type, uploaded_by: adminId,
    });
    if (error) throw new Error(`document ${c.number_title}/${d.file_name}: ${error.message}`);
  }

  // Отметки выплат: переводим accrued → paid (как сделал бы owner вручную).
  for (const role of c.payouts ?? []) {
    const { error } = await admin
      .from('payroll_ledger')
      .update({ status: 'paid', paid_at: new Date('2026-05-01T10:00:00Z').toISOString(), paid_by: ownerId })
      .eq('case_id', caseId)
      .eq('role_in_case', role)
      .eq('status', 'accrued');
    if (error) throw new Error(`payout ${c.number_title}/${role}: ${error.message}`);
  }
}

async function main(): Promise<void> {
  console.log('Сидим пользователей...');
  const userIds = await seedUsers();
  console.log(`  готово: ${userIds.size} аккаунтов (пароль: ${PASSWORD})`);

  console.log('Чистим доменные данные...');
  await wipeDomain();
  console.log('  готово (clients/cases/payments/tasks/documents/payroll_ledger/activity_log очищены)');

  // Клиент от имени owner — для выставления override-ставок.
  const ownerClient = createClient(SUPABASE_URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: loginErr } = await ownerClient.auth.signInWithPassword({
    email: 'owner@yur.local', password: PASSWORD,
  });
  if (loginErr) throw new Error(`owner login: ${loginErr.message}`);
  const ownerId = userIds.get('owner@yur.local')!;

  console.log('Создаём клиентов...');
  const clientIds = new Map<string, string>();
  for (const cl of CLIENTS) {
    const { data, error } = await admin.from('clients').insert({
      name: cl.name, client_kind: cl.client_kind, phone: cl.phone ?? null,
      email: cl.email ?? null, address: cl.address ?? null, source: cl.source ?? null,
      notes: cl.notes ?? null, created_by: userIds.get('admin@yur.local')!,
    }).select('id').single();
    if (error || !data) throw new Error(`client ${cl.name}: ${error?.message}`);
    clientIds.set(cl.key, data.id);
  }
  console.log(`  готово: ${clientIds.size} клиентов`);

  console.log('Создаём 10 дел с историями...');
  for (const c of CASES) {
    await seedCase(c, clientIds, userIds, ownerClient, ownerId);
    console.log(`  ✓ ${c.number_title} — ${c.stage}`);
  }

  // Сводка по леджеру.
  const { data: ledger } = await admin
    .from('payroll_ledger')
    .select('status, amount');
  const accrued = (ledger ?? []).filter((l) => l.status === 'accrued')
    .reduce((s, l) => s + Number(l.amount), 0);
  const paid = (ledger ?? []).filter((l) => l.status === 'paid')
    .reduce((s, l) => s + Number(l.amount), 0);

  console.log('\nГотово.');
  console.log(`  Дел: ${CASES.length}, клиентов: ${CLIENTS.length}`);
  console.log(`  Леджер: к выплате ${accrued} ₴, выплачено ${paid} ₴`);
  console.log('\nЛогины (пароль test12345!):');
  for (const acc of ACCOUNTS) console.log(`  ${acc.email.padEnd(24)} → ${acc.role}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
