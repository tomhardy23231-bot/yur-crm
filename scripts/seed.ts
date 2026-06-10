// scripts/seed.ts
// Сид тестовых данных для локальной разработки.
//
// Запуск: `npm run db:seed`
// Требует:
//   - поднятый локальный Supabase (`npx supabase start`)
//   - применённые миграции (`npx supabase db reset` уже это делает)
//   - .env.local с NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY
//
// Использует service_role КЛЮЧ → в обход RLS (CLAUDE.md §2: service_role только
// для системных задач, к которым сид и относится).
//
// Скрипт идемпотентен: повторный запуск не дублирует пользователей и тестовые сущности.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'Не заданы NEXT_PUBLIC_SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY в .env.local.\n' +
      'Запусти `npx supabase status` и скопируй значения в .env.local.',
  );
  process.exit(1);
}

// Защита от случайного запуска против staging/prod (CSO finding #5).
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(SUPABASE_URL);
if (!IS_LOCAL && process.env.ALLOW_NONLOCAL_SEED !== '1') {
  console.error(
    `Отказ сидить нелокальный Supabase: ${SUPABASE_URL}\n` +
      'Сид создаёт тестовых пользователей с известным паролем — это опасно в чужом окружении.\n' +
      'Если действительно нужно (например, dev-ветка Supabase Cloud) — запусти:\n' +
      '  ALLOW_NONLOCAL_SEED=1 npm run db:seed',
  );
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'test12345!';

type Role = 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert';

type Account = {
  email: string;
  full_name: string;
  role: Role;
  // Имя подразделения из миграции 20260610100000_departments (null — вне структуры).
  department: string | null;
  position: string | null;
};

// Два юриста и два Експерта — чтобы smoke-rls мог проверить изоляцию видимости
// (юрист видит дела по lawyer_id, Експерт — по responsible_id).
// Подразделения разложены под матрицу видимости Этапа 2 (PLAN-V2):
//   дело A = Київ продал (lawyer) / Дніпро исполняет (expert) — видят оба руководителя;
//   дело B = Дніпро продал (lawyer2) / Львів исполняет (expert2);
//   admin Киева НЕ должен видеть дело B (после Этапа 2).
const ACCOUNTS: Account[] = [
  { email: 'owner@yur.local', full_name: 'Влад Владелец', role: 'owner', department: null, position: null },
  { email: 'admin@yur.local', full_name: 'Анна Админ', role: 'admin', department: 'Київський', position: 'керівник' },
  { email: 'office@yur.local', full_name: 'Оля Секретарёва', role: 'office_manager', department: 'Київський', position: 'адміністратор' },
  { email: 'lawyer@yur.local', full_name: 'Лев Юристов', role: 'lawyer', department: 'Київський', position: 'юрист ВП' },
  { email: 'lawyer2@yur.local', full_name: 'Лиза Договорова', role: 'lawyer', department: 'Дніпровський', position: 'юрист ВП' },
  { email: 'expert@yur.local', full_name: 'Эдуард Экспертов', role: 'expert', department: 'Дніпровський', position: 'експерт' },
  { email: 'expert2@yur.local', full_name: 'Елена Экспертова', role: 'expert', department: 'Львівський', position: 'експерт' },
];

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
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error(`createUser вернул пустой user для ${email}`);
  return data.user.id;
}

// Подразделения сидятся миграцией (20260610100000_departments) — здесь только
// читаем их id, чтобы привязать сотрудников.
async function loadDepartmentIds(): Promise<Map<string, string>> {
  const { data, error } = await admin.from('departments').select('id, name');
  if (error) throw error;
  return new Map((data ?? []).map((d) => [d.name as string, d.id as string]));
}

async function upsertPublicUser(
  id: string,
  acc: Account,
  departments: Map<string, string>,
): Promise<void> {
  let departmentId: string | null = null;
  if (acc.department) {
    const found = departments.get(acc.department);
    if (!found) throw new Error(`Подразделение «${acc.department}» не найдено — миграции применены?`);
    departmentId = found;
  }

  const { error } = await admin.from('users').upsert(
    {
      id,
      full_name: acc.full_name,
      email: acc.email,
      role: acc.role,
      is_active: true,
      department_id: departmentId,
      position: acc.position,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

async function seedUsers(): Promise<Map<string, string>> {
  const departments = await loadDepartmentIds();
  const idByEmail = new Map<string, string>();
  for (const acc of ACCOUNTS) {
    const id = await ensureAuthUser(acc.email);
    idByEmail.set(acc.email, id);
    await upsertPublicUser(id, acc, departments);
  }
  return idByEmail;
}

async function getOrCreate<T extends { id: string }>(
  table: string,
  match: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data: existing, error: selErr } = await admin
    .from(table)
    .select('*')
    .match(match)
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing as T;

  const { data: created, error: insErr } = await admin
    .from(table)
    .insert(payload)
    .select('*')
    .single();
  if (insErr) throw insErr;
  return created as T;
}

async function seedDomain(ids: Map<string, string>): Promise<void> {
  const adminId = ids.get('admin@yur.local')!;
  const lawyer1 = ids.get('lawyer@yur.local')!;
  const lawyer2 = ids.get('lawyer2@yur.local')!;
  const expert1 = ids.get('expert@yur.local')!;
  const expert2 = ids.get('expert2@yur.local')!;

  // Клиенты ----------------------------------------------------------
  const ivanov = await getOrCreate<{ id: string }>(
    'clients',
    { email: 'ivanov@example.com' },
    {
      name: 'Иванов Иван Иванович',
      client_kind: 'individual',
      phone: '+380501112233',
      email: 'ivanov@example.com',
      source: 'referral',
      created_by: adminId,
    },
  );

  const acme = await getOrCreate<{ id: string }>(
    'clients',
    { email: 'legal@acme.example' },
    {
      name: 'ООО «Акме»',
      client_kind: 'company',
      phone: '+380441234567',
      email: 'legal@acme.example',
      address: 'г. Киев, ул. Примерная, 1',
      source: 'website',
      created_by: adminId,
    },
  );

  // Дела -------------------------------------------------------------
  // Case A: юрист lawyer1, Експерт expert1 — изолировано от lawyer2/expert2.
  const caseA = await getOrCreate<{ id: string }>(
    'cases',
    { number_title: 'CRM-2026-001' },
    {
      number_title: 'CRM-2026-001',
      client_id: ivanov.id,
      lawyer_id: lawyer1,
      responsible_id: expert1,
      opened_at: '2026-05-01',
      case_type: 'civil',
      category: 'representation',
      subject: 'Представительство в суде по имущественному спору',
      stage: 'in_progress',
      priority: 'normal',
      contract_sum: 30000,
      billing_types: ['fixed'],
      tags: ['imushestvo'],
    },
  );

  // Case B: юрист lawyer2, Експерт expert2.
  const caseB = await getOrCreate<{ id: string }>(
    'cases',
    { number_title: 'CRM-2026-002' },
    {
      number_title: 'CRM-2026-002',
      client_id: acme.id,
      lawyer_id: lawyer2,
      responsible_id: expert2,
      opened_at: '2026-05-15',
      case_type: 'corporate',
      category: 'claim',
      subject: 'Взыскание задолженности по договору поставки',
      stage: 'consultation',
      priority: 'urgent',
      contract_sum: 120000,
      billing_types: ['prepaid', 'installments'],
      tags: ['corporate'],
    },
  );

  // Задачи и платёж — чтобы было что показать в UI и проверить триггеры.
  await getOrCreate(
    'tasks',
    { case_id: caseA.id, title: 'Подготовить иск' },
    {
      case_id: caseA.id,
      title: 'Подготовить иск',
      kind: 'task',
      assignee_id: expert1,
      created_by: adminId,
      due_at: '2026-06-05T10:00:00Z',
      status: 'open',
    },
  );

  await getOrCreate(
    'tasks',
    { case_id: caseB.id, title: 'Заседание по делу ООО Акме' },
    {
      case_id: caseB.id,
      title: 'Заседание по делу ООО Акме',
      kind: 'hearing',
      assignee_id: expert2,
      created_by: adminId,
      due_at: '2026-06-10T09:00:00Z',
      status: 'open',
    },
  );

  // Платёж по Case A → база для расчёта зарплаты (representation 25%):
  // per_specialist = 10000 × 25% = 2500; total = 5000.
  await getOrCreate(
    'payments',
    { case_id: caseA.id, amount: 10000, paid_at: '2026-05-10' },
    {
      case_id: caseA.id,
      amount: 10000,
      paid_at: '2026-05-10',
      method: 'bank',
      note: 'Аванс по договору',
      created_by: adminId,
    },
  );
}

async function main(): Promise<void> {
  console.log('Сидим пользователей...');
  const ids = await seedUsers();
  console.log(`  готово: ${ids.size} аккаунтов (пароль для всех: ${PASSWORD})`);

  console.log('Сидим доменные данные...');
  await seedDomain(ids);
  console.log('  готово');

  console.log('\nГотово. Тестовые логины:');
  for (const acc of ACCOUNTS) {
    console.log(`  ${acc.email.padEnd(24)} → ${acc.role}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
