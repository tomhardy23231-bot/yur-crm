// Мини-smoke RLS на новом стеке (цикл v4, гейт сессии 1).
// Полный порт smoke-rls.ts (22 секции) — сессия 6; здесь ядро:
//   1) триггеры recalc по сиду; 2) изоляция видимости дел по ролям;
//   3) fail-closed без app.user_id; 4) приватность users.salary_*;
//   5) RPC case_payroll через реестр; 6) запись только в своё дело;
//   7) журнал через rpcLogActivity.
//
// Запуск: npm run smoke:rls:v4 (после db:migrate + db:seed).
// Требует DATABASE_URL_APP (app_user) и DATABASE_URL_ADMIN (owner).

import { userDb } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';
import { rpcCasePayroll, rpcLogActivity } from '@/lib/db/rpc';

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

const admin = adminDb();

async function uid(email: string): Promise<string> {
  const u = await admin.public_users.findFirst({ where: { email }, select: { id: true } });
  if (!u) fail(`нет пользователя ${email} — сид прогнан?`);
  return u.id;
}

async function main() {
  const lawyer1 = await uid('lawyer@yur.local');
  const lawyer2 = await uid('lawyer2@yur.local');
  const expert1 = await uid('expert@yur.local');
  const office = await uid('office@yur.local');
  const owner = await uid('owner@yur.local');

  const caseA = await admin.cases.findFirst({
    where: { number_title: 'CRM-2026-001' },
    select: { id: true, paid_total: true, debt: true },
  });
  const caseB = await admin.cases.findFirst({
    where: { number_title: 'CRM-2026-002' },
    select: { id: true, paid_total: true, debt: true },
  });
  if (!caseA || !caseB) fail('нет дел сида CRM-2026-001/002');

  console.log('1. Триггеры recalc (paid_total/debt из сида):');
  if (Number(caseA.paid_total) !== 10000 || Number(caseA.debt) !== 20000) {
    fail(`дело A: ожидалось paid=10000 debt=20000, факт ${caseA.paid_total}/${caseA.debt}`);
  }
  if (Number(caseB.paid_total) !== 0 || Number(caseB.debt) !== 120000) {
    fail(`дело B: ожидалось paid=0 debt=120000, факт ${caseB.paid_total}/${caseB.debt}`);
  }
  ok('paid_total/debt пересчитаны триггерами');

  console.log('2. Изоляция видимости дел (userDb → RLS):');
  const seen = async (userId: string) =>
    userDb(userId, (tx) => tx.cases.findMany({ select: { number_title: true } }));
  const l1 = await seen(lawyer1);
  if (l1.length !== 1 || l1[0]!.number_title !== 'CRM-2026-001') {
    fail(`lawyer1 должен видеть только дело A, видит: ${JSON.stringify(l1)}`);
  }
  const l2 = await seen(lawyer2);
  if (l2.length !== 1 || l2[0]!.number_title !== 'CRM-2026-002') {
    fail(`lawyer2 должен видеть только дело B, видит: ${JSON.stringify(l2)}`);
  }
  const e1 = await seen(expert1);
  if (e1.length !== 1 || e1[0]!.number_title !== 'CRM-2026-001') {
    fail(`expert1 должен видеть только дело A, видит: ${JSON.stringify(e1)}`);
  }
  const ownerSees = await seen(owner);
  if (ownerSees.length !== 2) fail(`owner должен видеть 2 дела, видит ${ownerSees.length}`);
  // Департаментный скоуп (v2 Этап 2): office_manager Києва видит только дело A
  // (его юрист — Київський); дело B (Дніпро+Львів) ему НЕ видно.
  const officeSees = await seen(office);
  if (officeSees.length !== 1 || officeSees[0]!.number_title !== 'CRM-2026-001') {
    fail(`office_manager (Київ) должен видеть только дело A, видит: ${JSON.stringify(officeSees)}`);
  }
  ok('юристы/Експерт — только свои дела; owner — все; office_manager — своё подразделение');

  console.log('3. Fail-closed без app.user_id:');
  // имитация «забыли обёртку»: транзакция user-пула без set_config
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('@/generated/prisma/client');
  const bare = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_APP!, max: 1 }),
  });
  try {
    const rows = await bare.cases.findMany({ select: { id: true } });
    if (rows.length !== 0) fail(`без контекста видно ${rows.length} дел — RLS дыра!`);
  } finally {
    await bare.$disconnect();
  }
  ok('без set_config запрос возвращает 0 строк (fail-closed)');

  console.log('4. Приватность users.salary_*:');
  try {
    await userDb(owner, (tx) => tx.$queryRaw`select salary_mode from public.users limit 1`);
    fail('salary_mode ЧИТАЕТСЯ под app_user — column-privacy сломана!');
  } catch {
    ok('salary_mode под app_user отвергнут (permission denied)');
  }

  console.log('5. RPC case_payroll через реестр (representation 25%, paid 10000):');
  const payroll = await userDb(lawyer1, (tx) => rpcCasePayroll(tx, { caseId: caseA.id }));
  const p = payroll[0];
  if (!p || p.lawyer_amount !== 2500 || p.expert_amount !== 2500 || p.total !== 5000) {
    fail(`case_payroll: ожидалось 2500/2500/5000, факт ${JSON.stringify(p)}`);
  }
  ok('case_payroll: lawyer=2500, expert=2500, total=5000');

  console.log('6. Запись: своё дело — да, чужое — нет:');
  await userDb(lawyer1, (tx) =>
    tx.cases.updateMany({ where: { id: caseA.id }, data: { priority: 'urgent' } }),
  );
  const aPrio = await admin.cases.findUnique({ where: { id: caseA.id }, select: { priority: true } });
  if (aPrio?.priority !== 'urgent') fail('lawyer1 не смог обновить своё дело');
  const foreign = await userDb(lawyer1, (tx) =>
    tx.cases.updateMany({ where: { id: caseB.id }, data: { priority: 'normal' } }),
  );
  if (foreign.count !== 0) fail('lawyer1 обновил ЧУЖОЕ дело — RLS дыра!');
  await admin.cases.update({ where: { id: caseA.id }, data: { priority: 'normal' } }); // cleanup
  ok('обновление своего дела прошло, чужого — отрезано RLS (0 строк)');

  console.log('7. Журнал через rpcLogActivity:');
  const marker = `smoke-v4-${Math.random().toString(36).slice(2, 10)}`;
  await userDb(lawyer1, (tx) =>
    rpcLogActivity(tx, {
      entityType: 'case',
      entityId: caseA.id,
      action: 'case_updated',
      changes: { _smoke: marker },
    }),
  );
  const logged = await admin.activity_log.findFirst({
    where: { changes: { path: ['_smoke'], equals: marker } },
    select: { id: true, user_id: true },
  });
  if (!logged || logged.user_id !== lawyer1) fail('запись журнала не создана/без автора');
  await admin.activity_log.delete({ where: { id: logged.id } }); // cleanup
  ok('log_activity записал событие с корректным автором');

  console.log('\nSMOKE V4: все проверки зелёные');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => admin.$disconnect());
