// scripts/seed.ts
// Сид тестовых данных для разработки (цикл v4: чистый Postgres/Neon).
//
// Запуск: `npm run db:seed`
// Требует: применённые миграции (`npm run db:migrate`) и .env.local с
// DATABASE_URL_ADMIN (+ DATABASE_URL_ADMIN_DIRECT для миграций).
//
// Идёт через admin-пул (owner БД, обходит RLS) — системная задача по
// CLAUDE.md §2. Идемпотентен: повторный запуск не дублирует данные.

import bcrypt from 'bcryptjs';
import { adminDb } from '@/lib/db/admin';

// Защита от случайного запуска против прода: в Vercel prod задаём
// YUR_DB_ENV=prod, локально/на dev-ветке Neon — dev (см. .env.example).
if (process.env.YUR_DB_ENV === 'prod' && process.env.ALLOW_NONLOCAL_SEED !== '1') {
  console.error(
    'Отказ сидить прод (YUR_DB_ENV=prod): сид создаёт тестовых пользователей ' +
      'с известным паролем. Если это осознанно: ALLOW_NONLOCAL_SEED=1 npm run db:seed',
  );
  process.exit(1);
}

const db = adminDb();

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

// Учётка входа: наша auth.users (замена GoTrue), пароль — bcrypt-хеш.
async function ensureAuthUser(email: string): Promise<string> {
  const existing = await db.auth_users.findFirst({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.auth_users.create({
    data: { email, encrypted_password: bcrypt.hashSync(PASSWORD, 10) },
    select: { id: true },
  });
  return created.id;
}

// Подразделения сидятся миграцией (20260610100000_departments) — здесь только
// читаем их id, чтобы привязать сотрудников.
async function loadDepartmentIds(): Promise<Map<string, string>> {
  const rows = await db.departments.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((d) => [d.name, d.id]));
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

  await db.public_users.upsert({
    where: { id },
    create: {
      id,
      full_name: acc.full_name,
      email: acc.email,
      role: acc.role,
      is_active: true,
      department_id: departmentId,
      position: acc.position,
    },
    update: {
      full_name: acc.full_name,
      email: acc.email,
      role: acc.role,
      is_active: true,
      department_id: departmentId,
      position: acc.position,
    },
  });
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

async function seedDomain(ids: Map<string, string>): Promise<void> {
  const adminId = ids.get('admin@yur.local')!;
  const lawyer1 = ids.get('lawyer@yur.local')!;
  const lawyer2 = ids.get('lawyer2@yur.local')!;
  const expert1 = ids.get('expert@yur.local')!;
  const expert2 = ids.get('expert2@yur.local')!;

  // Клиенты ----------------------------------------------------------
  const ivanov =
    (await db.clients.findFirst({ where: { email: 'ivanov@example.com' } })) ??
    (await db.clients.create({
      data: {
        name: 'Иванов Иван Иванович',
        client_kind: 'individual',
        phone: '+380501112233',
        email: 'ivanov@example.com',
        source: 'referral',
        created_by: adminId,
      },
    }));

  const acme =
    (await db.clients.findFirst({ where: { email: 'legal@acme.example' } })) ??
    (await db.clients.create({
      data: {
        name: 'ООО «Акме»',
        client_kind: 'company',
        phone: '+380441234567',
        email: 'legal@acme.example',
        address: 'г. Киев, ул. Примерная, 1',
        source: 'website',
        created_by: adminId,
      },
    }));

  // Дела -------------------------------------------------------------
  // Case A: юрист lawyer1, Експерт expert1 — изолировано от lawyer2/expert2.
  const caseA =
    (await db.cases.findFirst({ where: { number_title: 'CRM-2026-001' } })) ??
    (await db.cases.create({
      data: {
        number_title: 'CRM-2026-001',
        client_id: ivanov.id,
        lawyer_id: lawyer1,
        responsible_id: expert1,
        opened_at: new Date('2026-05-01'),
        case_type: 'civil',
        category: 'representation',
        subject: 'Представительство в суде по имущественному спору',
        stage: 'in_progress',
        priority: 'normal',
        contract_sum: 30000,
        billing_types: ['fixed'],
        tags: ['imushestvo'],
      },
    }));

  // Case B: юрист lawyer2, Експерт expert2.
  const caseB =
    (await db.cases.findFirst({ where: { number_title: 'CRM-2026-002' } })) ??
    (await db.cases.create({
      data: {
        number_title: 'CRM-2026-002',
        client_id: acme.id,
        lawyer_id: lawyer2,
        responsible_id: expert2,
        opened_at: new Date('2026-05-15'),
        case_type: 'corporate',
        category: 'claim',
        subject: 'Взыскание задолженности по договору поставки',
        stage: 'consultation',
        priority: 'urgent',
        contract_sum: 120000,
        billing_types: ['prepaid', 'installments'],
        tags: ['corporate'],
      },
    }));

  // Задачи и платёж — чтобы было что показать в UI и проверить триггеры.
  if (!(await db.tasks.findFirst({ where: { case_id: caseA.id, title: 'Подготовить иск' } }))) {
    await db.tasks.create({
      data: {
        case_id: caseA.id,
        title: 'Подготовить иск',
        kind: 'task',
        assignee_id: expert1,
        created_by: adminId,
        due_at: new Date('2026-06-05T10:00:00Z'),
        status: 'open',
      },
    });
  }

  if (
    !(await db.tasks.findFirst({
      where: { case_id: caseB.id, title: 'Заседание по делу ООО Акме' },
    }))
  ) {
    await db.tasks.create({
      data: {
        case_id: caseB.id,
        title: 'Заседание по делу ООО Акме',
        kind: 'hearing',
        assignee_id: expert2,
        created_by: adminId,
        due_at: new Date('2026-06-10T09:00:00Z'),
        status: 'open',
      },
    });
  }

  // Платёж по Case A → база для расчёта зарплаты (representation 25%):
  // per_specialist = 10000 × 25% = 2500; total = 5000.
  if (
    !(await db.payments.findFirst({
      where: { case_id: caseA.id, amount: 10000, paid_at: new Date('2026-05-10') },
    }))
  ) {
    await db.payments.create({
      data: {
        case_id: caseA.id,
        amount: 10000,
        paid_at: new Date('2026-05-10'),
        method: 'bank',
        note: 'Аванс по договору',
        created_by: adminId,
      },
    });
  }
}

// Касса (v2 Этап 7): три счёта по образцу ОЛІМП + право can_manage_cash офис-менеджеру
// (для QA не-owner кассира). Заводим ДО seedDomain, чтобы платёж по делу авто-приходом
// попал на дефолтный счёт (Рахунок) через триггер cash_sync_on_payment.
async function seedCash(ids: Map<string, string>): Promise<void> {
  const ownerId = ids.get('owner@yur.local')!;
  const officeId = ids.get('office@yur.local')!;

  const accounts: Array<{
    name: string;
    kind: 'card' | 'bank' | 'cash';
    opening_balance: number;
    is_default: boolean;
  }> = [
    { name: 'Картка ПриватБанк', kind: 'card', opening_balance: 1500, is_default: false },
    { name: 'Рахунок ПриватБанк', kind: 'bank', opening_balance: 139031.19, is_default: true },
    { name: 'Готівка в касі', kind: 'cash', opening_balance: 1500, is_default: false },
  ];
  for (const acc of accounts) {
    if (!(await db.cash_accounts.findFirst({ where: { name: acc.name } }))) {
      await db.cash_accounts.create({
        data: {
          name: acc.name,
          kind: acc.kind,
          opening_balance: acc.opening_balance,
          opening_date: new Date('2026-05-01'),
          is_default: acc.is_default,
          created_by: ownerId,
        },
      });
    }
  }

  // Право управления кассой — офис-менеджеру (merge поверх существующих оверрайдов).
  const u = await db.public_users.findUnique({
    where: { id: officeId },
    select: { perm_overrides: true },
  });
  const prev =
    u?.perm_overrides && typeof u.perm_overrides === 'object' && !Array.isArray(u.perm_overrides)
      ? (u.perm_overrides as Record<string, boolean>)
      : {};
  await db.public_users.update({
    where: { id: officeId },
    data: { perm_overrides: { ...prev, can_manage_cash: true } },
  });
}

async function main(): Promise<void> {
  console.log('Сидим пользователей...');
  const ids = await seedUsers();
  console.log(`  готово: ${ids.size} аккаунтов (пароль для всех: ${PASSWORD})`);

  console.log('Сидим кассу...');
  await seedCash(ids);
  console.log('  готово');

  console.log('Сидим доменные данные...');
  await seedDomain(ids);
  console.log('  готово');

  console.log('\nГотово. Тестовые логины:');
  for (const acc of ACCOUNTS) {
    console.log(`  ${acc.email.padEnd(24)} → ${acc.role}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
