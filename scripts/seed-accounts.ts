// scripts/seed-accounts.ts
// Создаёт ТОЛЬКО тестовые учётки (без демо-данных) — для «пустой» системы на проде.
//
// Запуск (против облачного Supabase):
//   node --env-file=.env.cloud --import tsx scripts/seed-accounts.ts
//
// Требует в env: NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.
// Использует service_role / secret-ключ → в обход RLS (только админ-операция).
// Идемпотентно: повторный запуск не дублирует пользователей, лишь обновляет роль/имя.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Не заданы NEXT_PUBLIC_SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Единый пароль для всех тестовых учёток (отдаём клиенту).
const PASSWORD = 'DemoYur2026!';

type Role = 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert';
type Account = { email: string; full_name: string; role: Role };

const ACCOUNTS: Account[] = [
  { email: 'owner@yur.local', full_name: 'Владелец (owner)', role: 'owner' },
  { email: 'admin@yur.local', full_name: 'Администратор (admin)', role: 'admin' },
  { email: 'office@yur.local', full_name: 'Офис-менеджер', role: 'office_manager' },
  { email: 'lawyer@yur.local', full_name: 'Юрист (продажник)', role: 'lawyer' },
  { email: 'expert@yur.local', full_name: 'Эксперт (исполнитель)', role: 'expert' },
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

async function upsertPublicUser(id: string, acc: Account): Promise<void> {
  const { error } = await admin.from('users').upsert(
    { id, full_name: acc.full_name, email: acc.email, role: acc.role, is_active: true },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

async function main(): Promise<void> {
  console.log(`Целевой Supabase: ${SUPABASE_URL}`);
  console.log('Создаю/обновляю тестовые учётки...\n');
  for (const acc of ACCOUNTS) {
    const id = await ensureAuthUser(acc.email);
    await upsertPublicUser(id, acc);
    console.log(`  ✓ ${acc.email.padEnd(22)} → ${acc.role}`);
  }
  console.log(`\nГотово. Пароль для всех: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
