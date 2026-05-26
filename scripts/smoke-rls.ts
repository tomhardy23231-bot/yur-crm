// scripts/smoke-rls.ts
// Smoke-тест после применения миграций и сида:
//   1) Триггер payments_recalc отработал — paid_total/debt корректны
//   2) RLS режет видимость — lawyer не видит дел jurist, и наоборот
//   3) RLS политики на cases UPDATE — specialist не может «угнать» чужое дело
//
// Запуск: npx tsx scripts/smoke-rls.ts (env через --env-file=.env.local)

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = 'test12345!';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

function ok(msg: string) { console.log(`  ✓ ${msg}`); }
function fail(msg: string): never { console.error(`  ✗ ${msg}`); process.exit(1); }

async function asUser(email: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) fail(`login ${email}: ${error.message}`);
  return c;
}

async function main() {
  console.log('1. Триггер payments_recalc:');
  const { data: cases, error: e1 } = await admin.from('cases').select('number_title, contract_sum, paid_total, debt').order('number_title');
  if (e1) fail(e1.message);
  if (!cases || cases.length !== 2) fail(`ожидал 2 дела, получил ${cases?.length}`);
  for (const c of cases) {
    console.log(`    ${c.number_title}: contract=${c.contract_sum} paid=${c.paid_total} debt=${c.debt}`);
  }
  const lawyerCase = cases.find((c) => c.number_title === 'CRM-2026-001')!;
  const juristCase = cases.find((c) => c.number_title === 'CRM-2026-002')!;
  if (Number(lawyerCase.paid_total) !== 10000) fail(`CRM-2026-001 paid_total ожидался 10000, факт ${lawyerCase.paid_total}`);
  if (Number(lawyerCase.debt) !== 20000) fail(`CRM-2026-001 debt ожидался 20000, факт ${lawyerCase.debt}`);
  if (Number(juristCase.paid_total) !== 0) fail(`CRM-2026-002 paid_total ожидался 0, факт ${juristCase.paid_total}`);
  if (Number(juristCase.debt) !== 120000) fail(`CRM-2026-002 debt ожидался 120000 (нет платежей), факт ${juristCase.debt}`);
  ok('paid_total и debt пересчитаны корректно');

  console.log('\n2. RLS — lawyer видит только своё дело:');
  const lawyer = await asUser('lawyer@yur.local');
  const { data: lawyerSees } = await lawyer.from('cases').select('number_title');
  console.log(`    lawyer видит: ${JSON.stringify(lawyerSees?.map((c) => c.number_title))}`);
  if (lawyerSees?.length !== 1 || lawyerSees[0]!.number_title !== 'CRM-2026-001') {
    fail(`lawyer должен видеть только CRM-2026-001, видит ${JSON.stringify(lawyerSees)}`);
  }
  ok('lawyer изолирован от дела jurist');

  console.log('\n3. RLS — jurist видит только своё дело:');
  const jurist = await asUser('jurist@yur.local');
  const { data: juristSees } = await jurist.from('cases').select('number_title');
  console.log(`    jurist видит: ${JSON.stringify(juristSees?.map((c) => c.number_title))}`);
  if (juristSees?.length !== 1 || juristSees[0]!.number_title !== 'CRM-2026-002') {
    fail(`jurist должен видеть только CRM-2026-002, видит ${JSON.stringify(juristSees)}`);
  }
  ok('jurist изолирован от дела lawyer');

  console.log('\n4. RLS — assistant юриста видит ТОЛЬКО дело юриста:');
  const assistant = await asUser('assistant@yur.local');
  const { data: assSees } = await assistant.from('cases').select('number_title');
  console.log(`    assistant видит: ${JSON.stringify(assSees?.map((c) => c.number_title))}`);
  if (assSees?.length !== 1 || assSees[0]!.number_title !== 'CRM-2026-002') {
    fail(`assistant юриста должен видеть только CRM-2026-002, видит ${JSON.stringify(assSees)}`);
  }
  ok('assistant видит дела супервайзера, чужие — нет');

  console.log('\n5. RLS — admin видит всё:');
  const adminUser = await asUser('admin@yur.local');
  const { data: adminSees } = await adminUser.from('cases').select('number_title');
  if (adminSees?.length !== 2) fail(`admin должен видеть 2 дела, видит ${adminSees?.length}`);
  ok(`admin видит все ${adminSees.length} дел`);

  console.log('\n6. RLS — lawyer НЕ может изменить дело jurist:');
  const { error: stealErr } = await lawyer
    .from('cases')
    .update({ priority: 'urgent' })
    .eq('number_title', 'CRM-2026-002');
  // RLS не вернёт ошибку, но и не обновит — проверим через admin:
  const { data: afterSteal } = await admin
    .from('cases')
    .select('priority')
    .eq('number_title', 'CRM-2026-002')
    .single();
  if (afterSteal?.priority !== 'urgent') {
    fail('CRM-2026-002 priority должен остаться urgent после попытки lawyer изменить (исходное значение)');
  }
  // Лучше: специалист пытается обновить специально на 'normal' и проверим что не сработало
  const { error: stealErr2 } = await lawyer
    .from('cases')
    .update({ priority: 'normal' })
    .eq('number_title', 'CRM-2026-002');
  const { data: afterSteal2 } = await admin
    .from('cases')
    .select('priority')
    .eq('number_title', 'CRM-2026-002')
    .single();
  if (afterSteal2?.priority !== 'urgent') {
    fail(`lawyer смог изменить priority дела jurist на ${afterSteal2?.priority}!`);
  }
  ok('попытка lawyer изменить чужое дело молча отвергнута RLS');
  void stealErr; void stealErr2;

  console.log('\n7. RLS — owner управляет users, admin НЕ может:');
  const owner = await asUser('owner@yur.local');
  // admin пытается обновить чужого пользователя
  const { error: adminUpdate } = await adminUser
    .from('users')
    .update({ full_name: 'Hacked by admin' })
    .eq('email', 'lawyer@yur.local');
  const { data: lawyerAfterAdmin } = await admin.from('users').select('full_name').eq('email', 'lawyer@yur.local').single();
  if (lawyerAfterAdmin?.full_name === 'Hacked by admin') {
    fail('admin смог изменить чужого пользователя — RLS дыра');
  }
  ok('admin не может менять users (RLS отвергает)');
  void adminUpdate;

  // owner может
  const { error: ownerUpdate } = await owner
    .from('users')
    .update({ full_name: 'Лев Адвокатов' }) // вернём как было
    .eq('email', 'lawyer@yur.local');
  if (ownerUpdate) fail(`owner update users failed: ${ownerUpdate.message}`);
  ok('owner управляет users');

  console.log('\n8. RLS — payments_select_via_case (admin видит все):');
  const { data: adminPay } = await adminUser.from('payments').select('amount');
  if (!adminPay || adminPay.length !== 1) fail(`admin должен видеть 1 платёж, видит ${adminPay?.length}`);
  ok(`admin видит ${adminPay.length} платёж`);

  console.log('\n   — jurist НЕ видит платёж lawyer (платёж по CRM-2026-001):');
  const { data: juristPay } = await jurist.from('payments').select('amount');
  if (juristPay?.length !== 0) fail(`jurist не должен видеть платежи lawyer, видит ${juristPay?.length}`);
  ok('jurist изолирован от чужих платежей');

  console.log('\n✓ Все RLS-проверки пройдены.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
