// Самодостаточные фикстуры для интеграционных тестов (цикл v4 — Neon/Prisma).
// Каждый прогон создаёт изолированный namespace (уникальный runId): свои
// пользователи, клиент и дела через admin-пул (owner БД обходит RLS — это
// системная операция, как сид). Тесты проверяют RLS уже от лица обычных
// пользователей: «сессия» = вызов userDb(userId, tx => …) — ТОТ ЖЕ боевой
// путь (set_config('app.user_id') → auth.uid() шима), что и приложение.
//
// Отличие семантики от прежнего supabase-js: PostgREST возвращал { error }
// объектом, Prisma на отказ RLS КИДАЕТ (P2010/42501 на insert/raw, P2025 на
// update/delete невидимой строки) — отказные ветки тестов ждут reject;
// «SELECT отрезан» остаётся пустым результатом (не ошибкой) в обоих мирах.
import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@/generated/prisma/client';
import { adminDb } from '@/lib/db/admin';
import { userDb, type Db } from '@/lib/db';

export { adminDb, userDb };
export type { Db };

export const hasDbEnv = Boolean(
  process.env.DATABASE_URL_APP && process.env.DATABASE_URL_ADMIN,
);

type UserRef = { id: string; email: string };

export type World = {
  runId: string;
  prefix: string; // 'IT-<runId>-' — фильтр наших дел среди прочих в БД
  admin: PrismaClient;
  users: Record<
    // owner — режим бога (видит/правит всё, для матрицы отпусков Этапа 6);
    // staffAdmin — БЕЗ подразделения (переходное правило «NULL = видит всё»);
    // kyivAdmin/dniproAdmin/lvivAdmin — admin scope='department' своего филиала;
    // allAdmin — admin в Києві, но scope='all' (видит всю компанию);
    // officeKyiv — office_manager Києва (видит отпуска подразделения, но НЕ пишет).
    | 'owner'
    | 'staffAdmin'
    | 'kyivAdmin'
    | 'dniproAdmin'
    | 'lvivAdmin'
    | 'allAdmin'
    | 'officeKyiv'
    | 'lawyer1'
    | 'lawyer2'
    | 'expert1'
    | 'expert2',
    UserRef
  >;
  clientId: string;
  // Привязка участников к подразделениям (для матрицы видимости Этапа 2):
  //   lawyer1 → Київ, expert1 → Дніпро, lawyer2 → Дніпро, expert2 → Львів.
  caseA: string; // lawyer1(Київ) + expert1(Дніпро), representation 25%, оплачено 10000 → видят Київ і Дніпро
  caseB: string; // lawyer2(Дніпро) + expert2(Львів), claim 10%, без оплат → видят Дніпро і Львів
  caseS: string; // lawyer1(Київ) + expert1(Дніпро), document, new_request → видят Київ і Дніпро
};

type Role = 'owner' | 'admin' | 'office_manager' | 'lawyer' | 'expert';

type UserOpts = {
  department?: string | null; // имя подразделения из 0002_baseline_data (null — вне структуры)
  scope?: 'department' | 'all';
};

export async function createWorld(): Promise<World> {
  const admin = adminDb();
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const prefix = `IT-${runId}-`;

  // Подразделения сидятся миграцией 0002_baseline_data — берём их id по имени.
  const depRows = await admin.departments.findMany({
    select: { id: true, name: true },
  });
  const departments = new Map<string, string>(depRows.map((d) => [d.name, d.id]));
  const depId = (name: string): string => {
    const id = departments.get(name);
    if (!id) throw new Error(`Подразделение «${name}» не найдено — миграции применены?`);
    return id;
  };

  async function mkUser(
    slug: string,
    role: Role,
    opts: UserOpts = {},
  ): Promise<UserRef> {
    const id = randomUUID();
    const email = `it-${runId}-${slug}@yur.test`;
    // Учётка входа + профиль одной транзакцией (как createUserAction).
    // Пароль тестам не нужен: «вход» = userDb(id), форму логина проверяет e2e.
    await admin.$transaction([
      admin.auth_users.create({ data: { id, email } }),
      admin.public_users.create({
        data: {
          id,
          full_name: `IT ${slug} ${runId}`,
          email,
          role,
          is_active: true,
          department_id: opts.department ? depId(opts.department) : null,
          visibility_scope: opts.scope ?? 'department',
        },
      }),
    ]);
    return { id, email };
  }

  // owner — режим бога (видит и правит отпуска кого угодно; Этап 6).
  const owner = await mkUser('owner', 'owner');
  // staffAdmin — без подразделения: переходное правило «NULL = видит всё».
  const staffAdmin = await mkUser('admin', 'admin');
  // Скоупленные руководители подразделений (scope='department' по умолчанию).
  const kyivAdmin = await mkUser('kyivadmin', 'admin', { department: 'Київський' });
  const dniproAdmin = await mkUser('dniproadmin', 'admin', { department: 'Дніпровський' });
  const lvivAdmin = await mkUser('lvivadmin', 'admin', { department: 'Львівський' });
  // Admin в Києві, но видит всю компанию (scope='all' перекрывает подразделение).
  const allAdmin = await mkUser('alladmin', 'admin', { department: 'Київський', scope: 'all' });
  // office_manager Києва — для матрицы отпусков: читает отсутствия подразделения, НЕ пишет.
  const officeKyiv = await mkUser('officekyiv', 'office_manager', { department: 'Київський' });
  const lawyer1 = await mkUser('lawyer1', 'lawyer', { department: 'Київський' });
  const lawyer2 = await mkUser('lawyer2', 'lawyer', { department: 'Дніпровський' });
  const expert1 = await mkUser('expert1', 'expert', { department: 'Дніпровський' });
  const expert2 = await mkUser('expert2', 'expert', { department: 'Львівський' });

  const client = await admin.clients.create({
    data: {
      name: `IT Client ${runId}`,
      client_kind: 'individual',
      source: 'referral',
      created_by: staffAdmin.id,
    },
    select: { id: true },
  });

  async function mkCase(
    suffix: string,
    lawyerId: string,
    expertId: string,
    category: 'representation' | 'claim' | 'document',
    contract: number,
    stage: string,
    caseType = 'civil',
  ): Promise<string> {
    const row = await admin.cases.create({
      data: {
        number_title: `${prefix}${suffix}`,
        client_id: client.id,
        lawyer_id: lawyerId,
        responsible_id: expertId,
        opened_at: new Date('2026-05-01'),
        case_type: caseType as never,
        category: category as never,
        stage: stage as never,
        priority: 'normal',
        contract_sum: contract,
      },
      select: { id: true },
    });
    return row.id;
  }

  const caseA = await mkCase('A', lawyer1.id, expert1.id, 'representation', 30000, 'in_progress');
  const caseB = await mkCase('B', lawyer2.id, expert2.id, 'claim', 120000, 'consultation', 'corporate');
  const caseS = await mkCase('S', lawyer1.id, expert1.id, 'document', 5000, 'new_request');

  await admin.payments.create({
    data: {
      case_id: caseA,
      amount: 10000,
      paid_at: new Date('2026-05-10'),
      method: 'bank',
      note: 'IT seed payment',
      created_by: staffAdmin.id,
    },
  });

  return {
    runId,
    prefix,
    admin,
    users: {
      owner,
      staffAdmin,
      kyivAdmin,
      dniproAdmin,
      lvivAdmin,
      allAdmin,
      officeKyiv,
      lawyer1,
      lawyer2,
      expert1,
      expert2,
    },
    clientId: client.id,
    caseA,
    caseB,
    caseS,
  };
}

export async function destroyWorld(w: World): Promise<void> {
  const { admin } = w;
  const caseIds = [w.caseA, w.caseB, w.caseS];
  const userIds = Object.values(w.users).map((u) => u.id);

  // Порядок важен: дети cases стоят on delete restrict.
  await admin.payroll_ledger.deleteMany({ where: { case_id: { in: caseIds } } });
  // case_acts → payments.act_id (set null) → потом сами платежи; акты/документы
  // тоже on delete restrict у cases, поэтому чистим их ДО удаления дел.
  await admin.case_acts.deleteMany({ where: { case_id: { in: caseIds } } });
  await admin.payments.deleteMany({ where: { case_id: { in: caseIds } } });
  await admin.documents.deleteMany({ where: { case_id: { in: caseIds } } });
  await admin.tasks.deleteMany({ where: { case_id: { in: caseIds } } });
  await admin.cases.deleteMany({ where: { id: { in: caseIds } } });
  await admin.clients.deleteMany({ where: { id: w.clientId } });
  // absences (Этап 6): user_id ON DELETE CASCADE, но created_by RESTRICT — чистим до
  // удаления пользователей (и по user_id, и по created_by — на случай чужого автора).
  await admin.absences.deleteMany({ where: { user_id: { in: userIds } } });
  await admin.absences.deleteMany({ where: { created_by: { in: userIds } } });
  // Касса (Этап 7): авто-приходы уже удалены каскадом вместе с payments выше; здесь
  // снимаем ручные операции и счета (created_by → users RESTRICT). Сначала операции
  // (account_id → cash_accounts RESTRICT), потом сами счета.
  await admin.cash_entries.deleteMany({ where: { created_by: { in: userIds } } });
  await admin.cash_accounts.deleteMany({ where: { created_by: { in: userIds } } });
  await admin.public_users.deleteMany({ where: { id: { in: userIds } } });
  await admin.auth_users.deleteMany({ where: { id: { in: userIds } } });
}
