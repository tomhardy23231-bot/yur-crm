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

const PASSWORD = 'test12345!';

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
    'staffAdmin' | 'lawyer1' | 'lawyer2' | 'expert1' | 'expert2',
    UserRef
  >;
  clientId: string;
  caseA: string; // lawyer1 + expert1, representation 25%, contract 30000, оплачено 10000
  caseB: string; // lawyer2 + expert2, claim 10%, contract 120000, без оплат
  caseS: string; // lawyer1 + expert1, document, stage=new_request (тест воронки)
};

type Role = 'admin' | 'lawyer' | 'expert';

export async function createWorld(): Promise<World> {
  const admin = adminClient();
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const prefix = `IT-${runId}-`;

  async function mkUser(slug: string, role: Role): Promise<UserRef> {
    const email = `it-${runId}-${slug}@yur.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    const id = data.user.id;
    const { error: uErr } = await admin
      .from('users')
      .upsert(
        { id, full_name: `IT ${slug} ${runId}`, email, role, is_active: true },
        { onConflict: 'id' },
      );
    if (uErr) throw new Error(`upsert user ${email}: ${uErr.message}`);
    return { id, email };
  }

  const staffAdmin = await mkUser('admin', 'admin');
  const lawyer1 = await mkUser('lawyer1', 'lawyer');
  const lawyer2 = await mkUser('lawyer2', 'lawyer');
  const expert1 = await mkUser('expert1', 'expert');
  const expert2 = await mkUser('expert2', 'expert');

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
    users: { staffAdmin, lawyer1, lawyer2, expert1, expert2 },
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
  await admin.from('payments').delete().in('case_id', caseIds);
  await admin.from('tasks').delete().in('case_id', caseIds);
  await admin.from('cases').delete().in('id', caseIds);
  await admin.from('clients').delete().eq('id', w.clientId);
  await admin.from('users').delete().in('id', userIds);
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}
