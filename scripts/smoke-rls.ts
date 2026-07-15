// scripts/smoke-rls.ts
// Smoke-тест RLS/триггеров против ЖИВОЙ базы (цикл v4 — чистый Postgres/Neon).
// Быстрый ручной прогон после миграций/сида или прод-переезда (сессия 7):
// печатает читаемый PASS/FAIL по секциям, БЕЗ vitest-раннера. Дополняет
// integration-сьют (tests/), не заменяет его.
//
// «Сессия» пользователя = userDb(userId, tx => …) — тот же боевой путь под RLS
// (set_config('app.user_id') → auth.uid() шима), что и приложение. Системные
// операции сетапа/уборки — через adminDb (owner БД обходит RLS, аналог сида).
//
// Семантика Prisma vs прежний PostgREST: отказ RLS на INSERT/raw КИДАЕТ
// (P2010/42501), «строка невидима для UPDATE/DELETE» → updateMany/deleteMany
// возвращают count:0 (тихий no-op, не throw), триггерные/CHECK-ошибки — throw
// с текстом в message.
//
// Покрытие — все ЖИВЫЕ инварианты. НЕ портированы секции payroll_ledger
// (accrual per_payment / revert_payout / гонка «выплата+платёж»): механика
// леджера ЗАМОРОЖЕНА в v3 с12 (триггер cases_sync_ledger снят, accrual_mode —
// поле-призрак) — тестировать нечего.
//
// Данные — из scripts/seed.ts (департаментный скоуп Этапа 2 УЧТЁН):
//   CRM-2026-001 (A): lawyer(Київ) + expert(Дніпро), representation 25%,
//     оплачено 10000 → paid 10000, debt 20000, in_progress. Видят: owner,
//     admin/office(Київ), lawyer, expert.
//   CRM-2026-002 (B): lawyer2(Дніпро) + expert2(Львів), claim 10%, без оплат →
//     debt 120000, consultation, priority urgent. admin/office(Київ) НЕ видят.
//
// ⚠ Рассчитан на СВЕЖИЙ сид (`npm run db:seed` / CI-БД), НЕ на прод-volume:
//   секции жёстко ждут ровно 2 дела. После прод-переезда (с7) — прогонять на
//   отдельной проверочной БД, не на боевой. Прерванный прогон может оставить
//   temp-строки (cleanup после fail() не идёт) → перед повтором `npm run db:seed`.
//   Секция 0 (каталог RLS) от volume НЕ зависит и валидна везде.
//
// Запуск: npm run smoke:rls (после db:migrate + db:seed).
// Требует DATABASE_URL_APP (app_user) и DATABASE_URL_ADMIN (owner).

import { randomUUID } from 'node:crypto';

import { userDb } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';
import { rpcCasePayroll, rpcLogActivity, rpcPayrollBySpecialist } from '@/lib/db/rpc';

const admin = adminDb();

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

// Ожидаем, что промис ОТКЛОНЁН (RLS WITH CHECK / триггер / CHECK). Опционально
// сверяем текст ошибки. Если не бросил — это дыра.
async function expectReject(
  p: Promise<unknown>,
  what: string,
  pattern?: RegExp,
): Promise<void> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pattern && !pattern.test(msg)) {
      fail(`${what}: отклонено, но текст не совпал с ${pattern} — «${msg}»`);
    }
    return;
  }
  fail(`${what}: ожидался отказ, но операция прошла`);
}

async function uid(email: string): Promise<string> {
  const u = await admin.public_users.findFirst({ where: { email }, select: { id: true } });
  if (!u) fail(`нет пользователя ${email} — сид прогнан?`);
  return u.id;
}

async function caseId(numberTitle: string): Promise<string> {
  const c = await admin.cases.findFirst({ where: { number_title: numberTitle }, select: { id: true } });
  if (!c) fail(`нет дела ${numberTitle} — сид прогнан?`);
  return c.id;
}

async function stageOf(id: string): Promise<string> {
  const c = await admin.cases.findUnique({ where: { id }, select: { stage: true } });
  return c!.stage as string;
}

// Создать пользователя (auth.users + public.users) для сетапа отдельных секций.
async function mkUser(
  role: 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert',
  opts: { active?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const email = `smoke-${id.slice(0, 8)}@yur.local`;
  await admin.$transaction([
    admin.auth_users.create({ data: { id, email } }),
    admin.public_users.create({
      data: { id, full_name: `Smoke ${role}`, email, role, is_active: opts.active ?? true },
    }),
  ]);
  return id;
}

async function rmUser(id: string): Promise<void> {
  await admin.public_users.deleteMany({ where: { id } });
  await admin.auth_users.deleteMany({ where: { id } });
}

async function main() {
  const owner = await uid('owner@yur.local');
  const adminU = await uid('admin@yur.local');
  const office = await uid('office@yur.local');
  const lawyer1 = await uid('lawyer@yur.local');
  const lawyer2 = await uid('lawyer2@yur.local');
  const expert1 = await uid('expert@yur.local');
  const expert2 = await uid('expert2@yur.local');

  const caseA = await caseId('CRM-2026-001');
  const caseB = await caseId('CRM-2026-002');
  const client = await admin.clients.findFirst({ select: { id: true } });
  if (!client) fail('нет ни одного клиента — сид прогнан?');

  // ── 0. Каталог RLS: все доменные таблицы под защитой ───────────────────────
  // Схема пересобрана из очищенного слепка — дропнутый ENABLE RLS/политика на
  // любой таблице уехал бы незаметно. Гейт по каталогу сильнее спот-проверок.
  console.log('0. Каталог RLS (RLS включён + политики есть):');
  {
    const expected = [
      'cases', 'clients', 'payments', 'tasks', 'documents', 'case_acts',
      'case_comments', 'cash_accounts', 'cash_entries', 'payment_plan_items',
      'absences', 'user_notify_channels', 'payroll_transactions',
      'payout_allocations', 'payroll_ledger', 'payroll_rates', 'org_requisites',
      'departments', 'users', 'activity_log',
    ];
    const rows = await admin.$queryRaw<Array<{ tablename: string; rls: boolean; policies: number }>>`
      select c.relname as tablename, c.relrowsecurity as rls,
        (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = any(${expected})`;
    const seen = new Map(rows.map((r) => [r.tablename, r]));
    for (const t of expected) {
      const r = seen.get(t);
      if (!r) fail(`таблица public.${t} отсутствует в каталоге`);
      if (!r.rls) fail(`таблица public.${t}: RLS ВЫКЛЮЧЕН (relrowsecurity=false)`);
      if (Number(r.policies) === 0) fail(`таблица public.${t}: нет ни одной RLS-политики`);
    }
  }
  ok('RLS включён и политики присутствуют на 20 доменных таблицах');

  // ── 1. Триггеры recalc (paid_total/debt из сида) ───────────────────────────
  console.log('1. Триггеры recalc (paid_total/debt):');
  {
    const a = await admin.cases.findUnique({ where: { id: caseA }, select: { paid_total: true, debt: true } });
    const b = await admin.cases.findUnique({ where: { id: caseB }, select: { paid_total: true, debt: true } });
    if (Number(a!.paid_total) !== 10000 || Number(a!.debt) !== 20000) {
      fail(`дело A: ожидалось paid=10000 debt=20000, факт ${a!.paid_total}/${a!.debt}`);
    }
    if (Number(b!.paid_total) !== 0 || Number(b!.debt) !== 120000) {
      fail(`дело B: ожидалось paid=0 debt=120000, факт ${b!.paid_total}/${b!.debt}`);
    }
  }
  ok('paid_total/debt пересчитаны триггерами');

  // ── 2. Изоляция видимости дел (userDb → RLS) ───────────────────────────────
  console.log('2. Изоляция видимости дел по ролям:');
  const seen = (userId: string) =>
    userDb(userId, (tx) => tx.cases.findMany({ select: { number_title: true } }));
  const only = (rows: { number_title: string }[], n: string) =>
    rows.length === 1 && rows[0]!.number_title === n;
  {
    if (!only(await seen(lawyer1), 'CRM-2026-001')) fail('lawyer1 должен видеть только дело A');
    if (!only(await seen(expert1), 'CRM-2026-001')) fail('expert1 должен видеть только дело A');
    if (!only(await seen(lawyer2), 'CRM-2026-002')) fail('lawyer2 должен видеть только дело B');
    if (!only(await seen(expert2), 'CRM-2026-002')) fail('expert2 должен видеть только дело B');
    if ((await seen(owner)).length !== 2) fail('owner должен видеть 2 дела');
    // Департаментный скоуп (Этап 2): admin/office Києва видят только дело A.
    if (!only(await seen(adminU), 'CRM-2026-001')) fail('admin(Київ) должен видеть только дело A (не B)');
    if (!only(await seen(office), 'CRM-2026-001')) fail('office(Київ) должен видеть только дело A (не B)');
  }
  ok('юрист/Експерт — только свои; owner — все; admin/office — своё подразделение');

  // ── 3. Fail-closed без app.user_id ─────────────────────────────────────────
  console.log('3. Fail-closed без обёртки userDb:');
  {
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
  }
  ok('без set_config запрос возвращает 0 строк (fail-closed)');

  // ── 4. Приватность users.salary_* ──────────────────────────────────────────
  console.log('4. Приватность users.salary_*:');
  await expectReject(
    userDb(owner, (tx) => tx.$queryRaw`select salary_mode from public.users limit 1`),
    'чтение salary_mode под app_user',
  );
  await expectReject(
    userDb(owner, (tx) => tx.$queryRaw`select salary_fixed_amount from public.users limit 1`),
    'чтение salary_fixed_amount под app_user',
  );
  ok('salary_mode/salary_fixed_amount под app_user отвергнуты (column privilege)');

  // ── 5. RPC case_payroll через реестр ───────────────────────────────────────
  console.log('5. case_payroll (representation 25%, paid 10000):');
  {
    const p = (await userDb(lawyer1, (tx) => rpcCasePayroll(tx, { caseId: caseA })))[0];
    if (!p || p.lawyer_amount !== 2500 || p.expert_amount !== 2500 || p.total !== 5000) {
      fail(`case_payroll: ожидалось 2500/2500/5000, факт ${JSON.stringify(p)}`);
    }
  }
  ok('case_payroll: lawyer=2500, expert=2500, total=5000');

  // ── 6. Запись: своё дело — да, чужое — нет; override под guard ──────────────
  console.log('6. Запись в дело (своё/чужое) + guard override:');
  {
    await userDb(lawyer1, (tx) => tx.cases.updateMany({ where: { id: caseA }, data: { priority: 'urgent' } }));
    const a = await admin.cases.findUnique({ where: { id: caseA }, select: { priority: true } });
    if (a?.priority !== 'urgent') fail('lawyer1 не смог обновить своё дело');
    const foreign = await userDb(lawyer1, (tx) =>
      tx.cases.updateMany({ where: { id: caseB }, data: { priority: 'normal' } }),
    );
    if (foreign.count !== 0) fail('lawyer1 обновил ЧУЖОЕ дело — RLS дыра!');
    await admin.cases.update({ where: { id: caseA }, data: { priority: 'normal' } }); // cleanup
    // специалист не может менять rate_override своего дела (guard-триггер).
    await expectReject(
      userDb(lawyer1, (tx) => tx.cases.update({ where: { id: caseA }, data: { lawyer_rate_override: 50 } })),
      'lawyer1 меняет rate_override',
      /override/i,
    );
  }
  ok('своё дело правится, чужое отрезано (0 строк), override под guard-триггером');

  // ── 7. Управление users: owner/admin да, office/lawyer/expert нет ──────────
  console.log('7. Управление пользователями (кто может менять users):');
  {
    const orig = (await admin.public_users.findUnique({ where: { id: lawyer1 }, select: { full_name: true } }))!.full_name;
    // admin может (не скоупится по подразделению).
    await userDb(adminU, (tx) => tx.public_users.updateMany({ where: { id: lawyer1 }, data: { full_name: 'Изменено админом' } }));
    let now = (await admin.public_users.findUnique({ where: { id: lawyer1 }, select: { full_name: true } }))!.full_name;
    if (now !== 'Изменено админом') fail('admin должен мочь менять users');
    // owner может.
    await userDb(owner, (tx) => tx.public_users.updateMany({ where: { id: lawyer1 }, data: { full_name: orig } }));
    // office / lawyer / expert — не могут (updateMany → 0 строк).
    for (const [id, who] of [[office, 'office'], [lawyer2, 'lawyer'], [expert1, 'expert']] as const) {
      const r = await userDb(id, (tx) => tx.public_users.updateMany({ where: { id: lawyer1 }, data: { full_name: `hack-${who}` } }));
      if (r.count !== 0) fail(`${who} смог менять users — RLS дыра`);
    }
    now = (await admin.public_users.findUnique({ where: { id: lawyer1 }, select: { full_name: true } }))!.full_name;
    if (now !== orig) fail('строка lawyer1 всё же изменена не-менеджером');
  }
  ok('owner/admin управляют users; office/lawyer/expert — отрезаны');

  // ── 8. Воронка: назад запрещено, вперёд +1 можно, staff откат + лог ────────
  console.log('8. Воронка этапов (только вперёд; staff-коррекция):');
  {
    const original = await stageOf(caseA);
    // setup/cleanup этапов — через userDb(owner): триггер stage_forward глушит
    // откат назад даже под adminDb (owner БД обходит RLS, НЕ триггеры); staff с
    // app.user_id получает is_staff-bypass в самом триггере.
    await userDb(owner, (tx) => tx.cases.updateMany({ where: { id: caseA }, data: { stage: 'in_progress' } }));
    // lawyer1 назад → stage_backward_forbidden.
    await expectReject(
      userDb(lawyer1, (tx) => tx.cases.update({ where: { id: caseA }, data: { stage: 'consultation' } })),
      'lawyer1 откат этапа', /stage_backward_forbidden/,
    );
    // lawyer1 вперёд +1 → ok.
    await userDb(lawyer1, (tx) => tx.cases.update({ where: { id: caseA }, data: { stage: 'awaiting_decision' } }));
    if ((await stageOf(caseA)) !== 'awaiting_decision') fail('lawyer1 не смог двинуть этап вперёд');
    // admin откат awaiting_decision → consultation → ok + запись stage_corrected.
    const before = await admin.activity_log.count({
      where: { entity_type: 'case', entity_id: caseA, action: 'stage_corrected' },
    });
    await userDb(adminU, (tx) => tx.cases.update({ where: { id: caseA }, data: { stage: 'consultation' } }));
    const after = await admin.activity_log.count({
      where: { entity_type: 'case', entity_id: caseA, action: 'stage_corrected' },
    });
    if (after !== before + 1) fail(`ожидалась +1 запись stage_corrected, было ${before}, стало ${after}`);
    await userDb(owner, (tx) => tx.cases.updateMany({ where: { id: caseA }, data: { stage: original as never } })); // cleanup
  }
  ok('назад запрещено; вперёд +1 можно; staff откатывает с записью stage_corrected');

  // ── 9. Запрет «прыжков» этапов (строго +1 для не-staff) ────────────────────
  console.log('9. Запрет прыжков по этапам:');
  {
    const original = await stageOf(caseA);
    await userDb(owner, (tx) => tx.cases.updateMany({ where: { id: caseA }, data: { stage: 'new_request', closed_at: null } }));
    await expectReject(
      userDb(lawyer1, (tx) => tx.cases.update({ where: { id: caseA }, data: { stage: 'in_progress' } })),
      'lawyer1 прыжок этапа', /stage_skip_forbidden/,
    );
    await userDb(lawyer1, (tx) => tx.cases.update({ where: { id: caseA }, data: { stage: 'consultation' } }));
    if ((await stageOf(caseA)) !== 'consultation') fail('lawyer1 не смог сделать шаг +1');
    // staff может перескочить (с записью stage_corrected).
    const before = await admin.activity_log.count({
      where: { entity_type: 'case', entity_id: caseA, action: 'stage_corrected' },
    });
    await userDb(adminU, (tx) => tx.cases.update({ where: { id: caseA }, data: { stage: 'awaiting_decision' } }));
    const after = await admin.activity_log.count({
      where: { entity_type: 'case', entity_id: caseA, action: 'stage_corrected' },
    });
    if (after !== before + 1) fail('staff-прыжок не записал stage_corrected');
    await userDb(owner, (tx) => tx.cases.updateMany({ where: { id: caseA }, data: { stage: original as never } })); // cleanup
  }
  ok('не-staff — строго +1 (прыжок отвергнут); staff перескакивает с логом');

  // ── 10. tasks RLS (через дело) ─────────────────────────────────────────────
  console.log('10. tasks RLS:');
  {
    const l1Tasks = await userDb(lawyer1, (tx) => tx.tasks.findMany({ select: { case_id: true } }));
    if (l1Tasks.some((t) => t.case_id !== caseA)) fail('lawyer1 видит task чужого дела');
    // создать на своё дело — ok.
    const created = await userDb(lawyer1, (tx) =>
      tx.tasks.create({
        data: { case_id: caseA, title: 'smoke task', kind: 'task', assignee_id: lawyer1, created_by: lawyer1 },
        select: { id: true },
      }),
    );
    // forged created_by — WITH CHECK отвергает.
    await expectReject(
      userDb(lawyer1, (tx) =>
        tx.tasks.create({ data: { case_id: caseA, title: 'forged', kind: 'task', assignee_id: lawyer1, created_by: expert2 } }),
      ),
      'lawyer1 forged created_by в task',
    );
    // task на чужое дело — can_write_case отвергает.
    await expectReject(
      userDb(lawyer1, (tx) =>
        tx.tasks.create({ data: { case_id: caseB, title: 'foreign', kind: 'task', assignee_id: lawyer1, created_by: lawyer1 } }),
      ),
      'lawyer1 task на чужое дело',
    );
    await admin.tasks.delete({ where: { id: created.id } }); // cleanup
  }
  ok('lawyer1 видит/создаёт task только по своему делу; forged/чужое — отвергнуты');

  // ── 11. documents RLS (storage-слой — отдельно, не в БД) ────────────────────
  console.log('11. documents RLS:');
  {
    const key = `cases/${caseA}/${randomUUID()}--smoke.txt`;
    const doc = await userDb(lawyer1, (tx) =>
      tx.documents.create({
        data: { case_id: caseA, file_name: 'smoke.txt', storage_key: key, doc_type: 'act', uploaded_by: lawyer1 },
        select: { id: true },
      }),
    );
    // lawyer1 НЕ может удалить (DELETE = owner/admin).
    const l1Del = await userDb(lawyer1, (tx) => tx.documents.deleteMany({ where: { id: doc.id } }));
    if (l1Del.count !== 0) fail('lawyer1 смог удалить документ — DELETE = owner/admin');
    // office НЕ может удалить.
    const offDel = await userDb(office, (tx) => tx.documents.deleteMany({ where: { id: doc.id } }));
    if (offDel.count !== 0) fail('office смог удалить документ — DELETE = owner/admin');
    // expert2 (чужой) не видит документ.
    const e2Docs = await userDb(expert2, (tx) => tx.documents.findMany({ where: { case_id: caseA }, select: { id: true } }));
    if (e2Docs.length !== 0) fail('expert2 видит документы чужого дела');
    // admin удаляет.
    const admDel = await userDb(adminU, (tx) => tx.documents.deleteMany({ where: { id: doc.id } }));
    if (admDel.count !== 1) fail('admin не смог удалить документ');
  }
  ok('lawyer1 создаёт doc; DELETE только owner/admin; expert2 изолирован');

  // ── 12. payments RLS + триггеры recalc ─────────────────────────────────────
  console.log('12. payments RLS + recalc (дело A):');
  {
    const a0 = (await admin.cases.findUnique({ where: { id: caseA }, select: { paid_total: true, debt: true } }))!;
    // admin (видит A, менеджер) INSERT 5000 → recalc.
    const pay = await userDb(adminU, (tx) =>
      tx.payments.create({
        data: { case_id: caseA, amount: 5000, paid_at: new Date('2026-05-27'), method: 'Наличные', created_by: adminU },
        select: { id: true },
      }),
    );
    const a1 = (await admin.cases.findUnique({ where: { id: caseA }, select: { paid_total: true, debt: true } }))!;
    if (Number(a1.paid_total) !== Number(a0.paid_total) + 5000) fail('recalc после INSERT неверен (paid)');
    // lawyer1 forged created_by → WITH CHECK.
    await expectReject(
      userDb(lawyer1, (tx) =>
        tx.payments.create({ data: { case_id: caseA, amount: 1, paid_at: new Date('2026-05-27'), created_by: expert2 } }),
      ),
      'lawyer1 forged created_by в payment',
    );
    // lawyer1 / office НЕ могут UPDATE платёж (managers-only).
    const l1Upd = await userDb(lawyer1, (tx) => tx.payments.updateMany({ where: { id: pay.id }, data: { note: 'hack-l' } }));
    if (l1Upd.count !== 0) fail('lawyer1 смог UPDATE payment — managers-only');
    const offUpd = await userDb(office, (tx) => tx.payments.updateMany({ where: { id: pay.id }, data: { note: 'hack-o' } }));
    if (offUpd.count !== 0) fail('office смог UPDATE payment — managers-only');
    // admin DELETE → recalc откат.
    const del = await userDb(adminU, (tx) => tx.payments.deleteMany({ where: { id: pay.id } }));
    if (del.count !== 1) fail('admin не смог удалить payment');
    const a2 = (await admin.cases.findUnique({ where: { id: caseA }, select: { paid_total: true, debt: true } }))!;
    if (Number(a2.paid_total) !== Number(a0.paid_total) || Number(a2.debt) !== Number(a0.debt)) {
      fail('recalc после DELETE не вернул исходные paid/debt');
    }
  }
  ok('admin INSERT/DELETE → recalc; forged created_by и UPDATE не-менеджером отвергнуты');

  // ── 13. activity_log writer (allowlist) ────────────────────────────────────
  console.log('13. activity_log allowlist:');
  {
    const run = `smoke-${randomUUID()}`;
    const logged = async (marker: string) =>
      admin.activity_log.findFirst({ where: { changes: { path: ['_m'], equals: marker } }, select: { user_id: true } });
    // lawyer1 на своё дело — ok.
    await userDb(lawyer1, (tx) => rpcLogActivity(tx, { entityType: 'case', entityId: caseA, action: 'case_updated', changes: { _m: `${run}-ok` } }));
    const okRow = await logged(`${run}-ok`);
    if (!okRow || okRow.user_id !== lawyer1) fail('lawyer1 не записал лог на своё дело');
    // lawyer1 на чужое дело — silent skip.
    await userDb(lawyer1, (tx) => rpcLogActivity(tx, { entityType: 'case', entityId: caseB, action: 'case_updated', changes: { _m: `${run}-foreign` } }));
    if (await logged(`${run}-foreign`)) fail('lawyer1 записал лог на чужое дело — дыра');
    // non-allowlisted action — silent skip.
    await userDb(lawyer1, (tx) => rpcLogActivity(tx, { entityType: 'case', entityId: caseA, action: 'evil_fake_action', changes: { _m: `${run}-evil` } }));
    if (await logged(`${run}-evil`)) fail('non-allowlisted action записался — дыра');
    // stage_corrected через rpc (обходя триггер) — silent skip.
    await userDb(lawyer1, (tx) => rpcLogActivity(tx, { entityType: 'case', entityId: caseA, action: 'stage_corrected', changes: { _m: `${run}-stage` } }));
    if (await logged(`${run}-stage`)) fail('stage_corrected через rpc пробит — дыра');
    await admin.activity_log.deleteMany({ where: { changes: { path: ['_m'], string_starts_with: run } } });
  }
  ok('lawyer лог только на своё дело; non-allowlisted и stage_corrected через rpc — skip');

  // ── 14. cases_validate_assignees (active-check) ────────────────────────────
  console.log('14. cases_validate_assignees (неактивный юрист/Експерт):');
  {
    const inactive = await mkUser('expert', { active: false });
    await expectReject(
      userDb(owner, (tx) =>
        tx.cases.create({
          data: {
            number_title: `SMOKE-INACT-R-${inactive.slice(0, 8)}`, client_id: client.id,
            lawyer_id: lawyer1, responsible_id: inactive, opened_at: new Date('2026-05-27'),
            case_type: 'civil', category: 'document', stage: 'new_request', priority: 'normal', contract_sum: 0,
          },
        }),
      ),
      'INSERT с неактивным responsible', /not active|inactive/i,
    );
    await expectReject(
      userDb(owner, (tx) =>
        tx.cases.create({
          data: {
            number_title: `SMOKE-INACT-L-${inactive.slice(0, 8)}`, client_id: client.id,
            lawyer_id: inactive, responsible_id: expert1, opened_at: new Date('2026-05-27'),
            case_type: 'civil', category: 'document', stage: 'new_request', priority: 'normal', contract_sum: 0,
          },
        }),
      ),
      'INSERT с неактивным lawyer', /not active|inactive/i,
    );
    await rmUser(inactive);
  }
  ok('неактивный lawyer_id/responsible_id отвергнут триггером');

  // ── 15. log_activity case_deleted после delete (is_staff bypass) ───────────
  console.log('15. case_deleted после удаления дела (staff-bypass):');
  {
    const run = `smoke-del-${randomUUID()}`;
    const tmp = await admin.cases.create({
      data: {
        number_title: run, client_id: client.id, lawyer_id: lawyer1, responsible_id: expert1,
        opened_at: new Date('2026-05-27'), case_type: 'civil', category: 'document',
        stage: 'new_request', priority: 'normal', contract_sum: 0,
      },
      select: { id: true },
    });
    await admin.cases.delete({ where: { id: tmp.id } });
    const logged = async (marker: string) =>
      admin.activity_log.findFirst({ where: { changes: { path: ['_m'], equals: marker } }, select: { id: true } });
    // admin может записать case_deleted про удалённое дело (is_staff bypass).
    await userDb(adminU, (tx) => rpcLogActivity(tx, { entityType: 'case', entityId: tmp.id, action: 'case_deleted', changes: { _m: `${run}-admin` } }));
    if (!(await logged(`${run}-admin`))) fail('admin не смог записать case_deleted');
    // lawyer1 — не может.
    await userDb(lawyer1, (tx) => rpcLogActivity(tx, { entityType: 'case', entityId: tmp.id, action: 'case_deleted', changes: { _m: `${run}-lawyer` } }));
    if (await logged(`${run}-lawyer`)) fail('lawyer записал case_deleted — bypass пробит');
    await admin.activity_log.deleteMany({ where: { changes: { path: ['_m'], string_starts_with: run } } });
  }
  ok('admin пишет case_deleted про удалённое дело; lawyer — skip');

  // ── 16. Payroll: ставки, сводка, изменение ставок ──────────────────────────
  console.log('16. Payroll — ставки/сводка/права:');
  {
    const rates = await admin.payroll_rates.findMany({ select: { category: true, lawyer_percent: true, expert_percent: true } });
    const rm = new Map(rates.map((r) => [r.category, [Number(r.lawyer_percent), Number(r.expert_percent)]]));
    if (String(rm.get('document')) !== '7,7' || String(rm.get('claim')) !== '10,10' || String(rm.get('representation')) !== '25,25') {
      fail(`payroll_rates ожидались 7/10/25 (lawyer=expert), факт: ${JSON.stringify(rates)}`);
    }
    // payroll_by_specialist: lawyer1 видит только свои строки; staff — многих.
    const l1 = await userDb(lawyer1, (tx) => rpcPayrollBySpecialist(tx));
    if (l1.length === 0 || l1.some((r) => r.user_id !== lawyer1)) fail('payroll_by_specialist: lawyer1 видит чужие строки');
    const staff = await userDb(owner, (tx) => rpcPayrollBySpecialist(tx));
    if (new Set(staff.map((r) => r.user_id)).size < 2) fail('payroll_by_specialist: staff должен видеть многих');
    // office НЕ может менять ставки (owner-only write) → 0 строк.
    const offRate = await userDb(office, (tx) => tx.payroll_rates.updateMany({ where: { category: 'document' }, data: { lawyer_percent: 99 } }));
    if (offRate.count !== 0) fail('office смог менять ставку — owner-only');
    if (Number((await admin.payroll_rates.findUnique({ where: { category: 'document' }, select: { lawyer_percent: true } }))!.lawyer_percent) !== 7) {
      fail('ставка document изменена не-owner');
    }
    // owner может.
    await userDb(owner, (tx) => tx.payroll_rates.update({ where: { category: 'document' }, data: { lawyer_percent: 8 } }));
    await userDb(owner, (tx) => tx.payroll_rates.update({ where: { category: 'document' }, data: { lawyer_percent: 7 } })); // restore
  }
  ok('ставки 7/10/25; сводка фильтруется по зрителю; ставки меняет только owner');

  // ── 17. overpaid (переплата клиента) ───────────────────────────────────────
  console.log('17. overpaid при переплате (дело B):');
  {
    const pay = await userDb(owner, (tx) =>
      tx.payments.create({ data: { case_id: caseB, amount: 130000, paid_at: new Date('2026-05-28'), created_by: owner }, select: { id: true } }),
    );
    const over = (await admin.cases.findUnique({ where: { id: caseB }, select: { debt: true, overpaid: true } }))!;
    if (Number(over.overpaid) !== 10000 || Number(over.debt) !== 0) fail(`ожидался overpaid=10000 debt=0, факт ${JSON.stringify(over)}`);
    await userDb(owner, (tx) => tx.payments.deleteMany({ where: { id: pay.id } }));
    const reset = (await admin.cases.findUnique({ where: { id: caseB }, select: { debt: true, overpaid: true } }))!;
    if (Number(reset.overpaid) !== 0 || Number(reset.debt) !== 120000) fail('откат переплаты не вернул overpaid=0 debt=120000');
  }
  ok('переплата → overpaid=10000, debt=0; откат возвращает 0/120000');

  // ── 18. closed_without_act (мягкое предупреждение) ─────────────────────────
  console.log('18. closed_without_act (закрытие без акта):');
  {
    const c = await admin.cases.create({
      data: {
        number_title: `SMOKE-ACT-${randomUUID().slice(0, 8)}`, client_id: client.id, lawyer_id: lawyer1, responsible_id: expert1,
        opened_at: new Date('2026-05-28'), case_type: 'civil', category: 'document', stage: 'closed',
        closed_at: new Date('2026-05-28'), priority: 'normal', contract_sum: 0,
      },
      select: { id: true, closed_without_act: true },
    });
    if (!c.closed_without_act) fail('закрытие без акта не помечено closed_without_act');
    await admin.documents.create({
      data: { case_id: c.id, file_name: 'act.txt', storage_key: `cases/${c.id}/${randomUUID()}--act.txt`, doc_type: 'act', uploaded_by: owner },
    });
    if ((await admin.cases.findUnique({ where: { id: c.id }, select: { closed_without_act: true } }))!.closed_without_act) {
      fail('догрузка акта не сбросила closed_without_act');
    }
    await admin.documents.deleteMany({ where: { case_id: c.id } });
    await admin.cases.delete({ where: { id: c.id } });
  }
  ok('закрытие без акта → флаг true; догрузка documents(act) → флаг false');

  // ── 19. Управление users: ступенчатые права (owner vs admin) ───────────────
  console.log('19. Ступенчатые права управления users:');
  {
    // admin НЕ может повысить юриста до admin (WITH CHECK новой роли).
    await expectReject(
      userDb(adminU, (tx) => tx.public_users.updateMany({ where: { id: lawyer1 }, data: { role: 'admin' } })),
      'admin повышает юриста до admin',
    );
    if ((await admin.public_users.findUnique({ where: { id: lawyer1 }, select: { role: true } }))!.role !== 'lawyer') {
      fail('роль lawyer1 всё же поднята');
    }
    // admin НЕ может менять строку владельца (USING на старую роль) → 0 строк.
    const ownRow = await userDb(adminU, (tx) => tx.public_users.updateMany({ where: { id: owner }, data: { full_name: 'hacked owner' } }));
    if (ownRow.count !== 0) fail('admin изменил строку владельца — дыра');
    // admin НЕ может менять admin-строки (в т.ч. свою) → 0 строк.
    const admRow = await userDb(adminU, (tx) => tx.public_users.updateMany({ where: { id: adminU }, data: { full_name: 'self edit' } }));
    if (admRow.count !== 0) fail('admin изменил admin-строку — дыра');
    // owner МОЖЕТ назначать/снимать admin-уровень.
    await userDb(owner, (tx) => tx.public_users.update({ where: { id: office }, data: { role: 'admin' } }));
    await userDb(owner, (tx) => tx.public_users.update({ where: { id: office }, data: { role: 'office_manager' } })); // restore
    // admin МОЖЕТ создать не-админскую роль, но НЕ admin.
    const nu = randomUUID();
    const nuEmail = `smoke-nu-${nu.slice(0, 8)}@yur.local`;
    await admin.auth_users.create({ data: { id: nu, email: nuEmail } });
    await expectReject(
      userDb(adminU, (tx) => tx.public_users.create({ data: { id: nu, full_name: 'NewAdmin', email: nuEmail, role: 'admin', is_active: true } })),
      'admin создаёт admin-пользователя',
    );
    await userDb(adminU, (tx) => tx.public_users.create({ data: { id: nu, full_name: 'NewLawyer', email: nuEmail, role: 'lawyer', is_active: true } }));
    await rmUser(nu);
  }
  ok('admin не трогает owner/admin-строки и не создаёт admin; owner может всё');

  // ── 20. Клиенты: юрист создаёт и видит, эксперт — нет ──────────────────────
  console.log('20. Создание клиента (юрист да, эксперт нет):');
  {
    const created = await userDb(lawyer1, (tx) =>
      tx.clients.create({ data: { name: `SMOKE Client ${randomUUID().slice(0, 8)}`, client_kind: 'individual', created_by: lawyer1 }, select: { id: true } }),
    );
    const sees = await userDb(lawyer1, (tx) => tx.clients.findUnique({ where: { id: created.id }, select: { id: true } }));
    if (!sees) fail('юрист не видит созданного клиента (RETURNING/SELECT-политика)');
    await expectReject(
      userDb(expert1, (tx) => tx.clients.create({ data: { name: 'Expert Client', client_kind: 'individual', created_by: expert1 } })),
      'expert создаёт клиента',
    );
    await admin.clients.delete({ where: { id: created.id } });
  }
  ok('юрист создаёт клиента и сразу видит; эксперт создать не может');

  // ── 21. Идемпотентность платежа (unique idempotency_key) ───────────────────
  console.log('21. Идемпотентность платежа (unique key):');
  {
    const key = randomUUID();
    const first = await userDb(owner, (tx) =>
      tx.payments.create({ data: { case_id: caseB, amount: 1234.5, paid_at: new Date('2026-05-28'), created_by: owner, idempotency_key: key }, select: { id: true } }),
    );
    await expectReject(
      userDb(owner, (tx) =>
        tx.payments.create({ data: { case_id: caseB, amount: 1234.5, paid_at: new Date('2026-05-28'), created_by: owner, idempotency_key: key } }),
      ),
      'повтор платежа с тем же idempotency_key',
    );
    const rows = await admin.payments.findMany({ where: { idempotency_key: key }, select: { id: true } });
    if (rows.length !== 1) fail(`ожидалась 1 строка с ключом, факт ${rows.length}`);
    await admin.payments.delete({ where: { id: first.id } });
  }
  ok('дубль по idempotency_key отвергнут; ровно одна строка платежа');

  console.log('\nSMOKE RLS: все проверки зелёные ✓');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => admin.$disconnect());
