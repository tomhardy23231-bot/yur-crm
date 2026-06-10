// Самодостаточные фикстуры для интеграционных тестов.
// Каждый прогон создаёт изолированный namespace (уникальный runId): свои
// пользователи, клиент и дела через service_role (в обход RLS — это системная
// операция, как сид). Тесты проверяют RLS уже от лица обычных сессий.
// destroyWorld убирает за собой в порядке, учитывающем on delete restrict
// (payments/payroll_ledger → cases → client → users → auth users).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const hasSupabaseEnv = Boolean(URL && ANON && SERVICE);

export const PASSWORD = 'test12345!';

export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Вход обычным пользователем (anon-клиент + JWT) — чтобы работал RLS.
export async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

type UserRef = { id: string; email: string };

export type World = {
  runId: string;
  prefix: string; // 'IT-<runId>-' — фильтр наших дел среди прочих в БД
  admin: SupabaseClient;
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
  department?: string | null; // имя подразделения из миграции 20260610100000 (null — вне структуры)
  scope?: 'department' | 'all';
};

export async function createWorld(): Promise<World> {
  const admin = adminClient();
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const prefix = `IT-${runId}-`;

  // Подразделения сидятся миграцией 20260610100000 — берём их id по имени.
  const { data: depRows, error: depErr } = await admin
    .from('departments')
    .select('id, name');
  if (depErr) throw new Error(`load departments: ${depErr.message}`);
  const departments = new Map<string, string>((depRows ?? []).map((d) => [d.name, d.id]));
  const depId = (name: string): string => {
    const id = departments.get(name);
    if (!id) throw new Error(`Подразделение «${name}» не найдено — миграции применены?`);
    return id;
  };

  async function mkUser(slug: string, role: Role, opts: UserOpts = {}): Promise<UserRef> {
    const email = `it-${runId}-${slug}@yur.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    const id = data.user.id;
    // service_role → RLS и guard_user_visibility_fields в обход (auth.uid() IS NULL),
    // поэтому department_id/visibility_scope проставляются напрямую (как в seed.ts).
    const { error: uErr } = await admin.from('users').upsert(
      {
        id,
        full_name: `IT ${slug} ${runId}`,
        email,
        role,
        is_active: true,
        department_id: opts.department ? depId(opts.department) : null,
        visibility_scope: opts.scope ?? 'department',
      },
      { onConflict: 'id' },
    );
    if (uErr) throw new Error(`upsert user ${email}: ${uErr.message}`);
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

  const { data: client, error: cErr } = await admin
    .from('clients')
    .insert({
      name: `IT Client ${runId}`,
      client_kind: 'individual',
      source: 'referral',
      created_by: staffAdmin.id,
    })
    .select('id')
    .single();
  if (cErr || !client) throw new Error(`client: ${cErr?.message}`);

  async function mkCase(
    suffix: string,
    lawyerId: string,
    expertId: string,
    category: 'representation' | 'claim' | 'document',
    contract: number,
    stage: string,
    caseType = 'civil',
  ): Promise<string> {
    const { data, error } = await admin
      .from('cases')
      .insert({
        number_title: `${prefix}${suffix}`,
        client_id: client!.id,
        lawyer_id: lawyerId,
        responsible_id: expertId,
        opened_at: '2026-05-01',
        case_type: caseType,
        category,
        stage,
        priority: 'normal',
        contract_sum: contract,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`case ${suffix}: ${error?.message}`);
    return data.id as string;
  }

  const caseA = await mkCase('A', lawyer1.id, expert1.id, 'representation', 30000, 'in_progress');
  const caseB = await mkCase('B', lawyer2.id, expert2.id, 'claim', 120000, 'consultation', 'corporate');
  const caseS = await mkCase('S', lawyer1.id, expert1.id, 'document', 5000, 'new_request');

  const { error: pErr } = await admin.from('payments').insert({
    case_id: caseA,
    amount: 10000,
    paid_at: '2026-05-10',
    method: 'bank',
    note: 'IT seed payment',
    created_by: staffAdmin.id,
  });
  if (pErr) throw new Error(`payment: ${pErr.message}`);

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
  await admin.from('payroll_ledger').delete().in('case_id', caseIds);
  // case_acts → payments.act_id (set null) → потом сами платежи; акты/документы
  // тоже on delete restrict у cases, поэтому чистим их ДО удаления дел.
  await admin.from('case_acts').delete().in('case_id', caseIds);
  await admin.from('payments').delete().in('case_id', caseIds);
  await admin.from('documents').delete().in('case_id', caseIds);
  await admin.from('tasks').delete().in('case_id', caseIds);
  await admin.from('cases').delete().in('id', caseIds);
  await admin.from('clients').delete().eq('id', w.clientId);
  // absences (Этап 6): user_id ON DELETE CASCADE, но created_by RESTRICT — чистим до
  // удаления пользователей (и по user_id, и по created_by — на случай чужого автора).
  await admin.from('absences').delete().in('user_id', userIds);
  await admin.from('absences').delete().in('created_by', userIds);
  // Касса (Этап 7): авто-приходы уже удалены каскадом вместе с payments выше; здесь
  // снимаем ручные операции и счета (created_by → users RESTRICT). Сначала операции
  // (account_id → cash_accounts RESTRICT), потом сами счета.
  await admin.from('cash_entries').delete().in('created_by', userIds);
  await admin.from('cash_accounts').delete().in('created_by', userIds);
  await admin.from('users').delete().in('id', userIds);
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}
