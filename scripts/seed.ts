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
// Сид создаёт 5 пользователей с известным паролем — катастрофично в чужом окружении.
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

type Role = 'owner' | 'admin' | 'specialist' | 'assistant';
type SpecialistType = 'lawyer' | 'jurist';

type Account = {
  email: string;
  full_name: string;
  role: Role;
  specialist_type?: SpecialistType;
  supervises?: string; // email супервайзера (для assistant)
};

const ACCOUNTS: Account[] = [
  { email: 'owner@yur.local', full_name: 'Влад Владелец', role: 'owner' },
  { email: 'admin@yur.local', full_name: 'Анна Админ', role: 'admin' },
  {
    email: 'lawyer@yur.local',
    full_name: 'Лев Адвокатов',
    role: 'specialist',
    specialist_type: 'lawyer',
  },
  {
    email: 'jurist@yur.local',
    full_name: 'Юрий Юристов',
    role: 'specialist',
    specialist_type: 'jurist',
  },
  {
    email: 'assistant@yur.local',
    full_name: 'Аля Ассистентова',
    role: 'assistant',
    supervises: 'jurist@yur.local',
  },
];

async function ensureAuthUser(email: string): Promise<string> {
  // Постранично ищем существующего пользователя.
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

async function upsertPublicUser(
  id: string,
  acc: Account,
  supervisorId: string | null,
): Promise<void> {
  const { error } = await admin.from('users').upsert(
    {
      id,
      full_name: acc.full_name,
      email: acc.email,
      role: acc.role,
      specialist_type: acc.specialist_type ?? null,
      supervisor_id: supervisorId,
      is_active: true,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

async function seedUsers(): Promise<Map<string, string>> {
  const idByEmail = new Map<string, string>();

  // Сначала auth-пользователи + те, у кого нет supervisor (owner/admin/specialist).
  for (const acc of ACCOUNTS) {
    const id = await ensureAuthUser(acc.email);
    idByEmail.set(acc.email, id);
  }

  // Сначала всех без супервайзера, потом ассистентов — чтобы FK был валиден.
  for (const acc of ACCOUNTS.filter((a) => !a.supervises)) {
    await upsertPublicUser(idByEmail.get(acc.email)!, acc, null);
  }
  for (const acc of ACCOUNTS.filter((a) => a.supervises)) {
    const supId = idByEmail.get(acc.supervises!);
    if (!supId) throw new Error(`Не найден супервайзер ${acc.supervises}`);
    await upsertPublicUser(idByEmail.get(acc.email)!, acc, supId);
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
  const lawyerId = ids.get('lawyer@yur.local')!;
  const juristId = ids.get('jurist@yur.local')!;

  // Клиенты ----------------------------------------------------------
  const ivanov = await getOrCreate<{ id: string }>(
    'clients',
    { email: 'ivanov@example.com' },
    {
      name: 'Иванов Иван Иванович',
      client_kind: 'individual',
      phone: '+380501112233',
      email: 'ivanov@example.com',
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
      created_by: adminId,
    },
  );

  // Дела -------------------------------------------------------------
  const caseLawyer = await getOrCreate<{ id: string }>(
    'cases',
    { number_title: 'CRM-2026-001' },
    {
      number_title: 'CRM-2026-001',
      client_id: ivanov.id,
      responsible_id: lawyerId,
      opened_at: '2026-05-01',
      case_type: 'civil',
      stage: 'in_progress',
      priority: 'normal',
      contract_sum: 30000,
      billing_types: ['fixed'],
      tags: ['imushestvo'],
    },
  );

  const caseJurist = await getOrCreate<{ id: string }>(
    'cases',
    { number_title: 'CRM-2026-002' },
    {
      number_title: 'CRM-2026-002',
      client_id: acme.id,
      responsible_id: juristId,
      opened_at: '2026-05-15',
      case_type: 'corporate',
      stage: 'consultation',
      priority: 'urgent',
      contract_sum: 120000,
      billing_types: ['prepaid', 'hourly'],
      tags: ['corporate'],
    },
  );

  // Задачи и платёж — чтобы было что показать в UI и проверить триггер пересчёта.
  await getOrCreate(
    'tasks',
    { case_id: caseLawyer.id, title: 'Подготовить иск' },
    {
      case_id: caseLawyer.id,
      title: 'Подготовить иск',
      kind: 'task',
      assignee_id: lawyerId,
      created_by: adminId,
      due_at: '2026-06-05T10:00:00Z',
      status: 'open',
    },
  );

  await getOrCreate(
    'tasks',
    { case_id: caseJurist.id, title: 'Заседание по делу ООО Акме' },
    {
      case_id: caseJurist.id,
      title: 'Заседание по делу ООО Акме',
      kind: 'hearing',
      assignee_id: juristId,
      created_by: adminId,
      due_at: '2026-06-10T09:00:00Z',
      status: 'open',
    },
  );

  await getOrCreate(
    'payments',
    { case_id: caseLawyer.id, amount: 10000, paid_at: '2026-05-10' },
    {
      case_id: caseLawyer.id,
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
    console.log(`  ${acc.email.padEnd(24)} → ${acc.role}${acc.specialist_type ? `/${acc.specialist_type}` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
