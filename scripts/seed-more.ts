// scripts/seed-more.ts
// ДОПИСЫВАЕТ ещё N дел (по умолчанию 20) к уже существующим — НЕ чистит базу.
// Нумерация продолжается от текущего максимума CRM-2026-NNN.
//
// Запуск: `npm run db:seed:more`        (добавит 20)
//         `COUNT=30 npm run db:seed:more` (добавит 30)
//
// Сценарии генерируются с ротацией: разные этапы, категории, типы дел,
// приоритеты, истории платежей (долг / переплата / полная оплата), per_payment,
// индивидуальные ставки (override), закрытие с актом и без, частичные выплаты.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error('Не заданы URL / ANON / SERVICE_ROLE в .env.local.');
  process.exit(1);
}
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(SUPABASE_URL);
if (!IS_LOCAL && process.env.ALLOW_NONLOCAL_SEED !== '1') {
  console.error(`Отказ сидить нелокальный Supabase: ${SUPABASE_URL}`);
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = 'test12345!';
const COUNT = Number(process.env.COUNT ?? 20);

type DocType = 'contract' | 'claim' | 'power_of_attorney' | 'correspondence' | 'act' | 'other';
type Stage = 'new_request' | 'consultation' | 'in_progress' | 'awaiting_decision' | 'closed';
type Category = 'document' | 'claim' | 'representation';
type CaseType = 'civil' | 'criminal' | 'corporate' | 'administrative' | 'family' | 'labor' | 'other';

const STAGES: Stage[] = ['new_request', 'consultation', 'in_progress', 'awaiting_decision', 'closed'];
const CATS: Category[] = ['document', 'claim', 'representation'];
const TYPES: CaseType[] = ['civil', 'criminal', 'corporate', 'administrative', 'family', 'labor', 'other'];

const TYPE_LABEL: Record<CaseType, string> = {
  civil: 'гражданское', criminal: 'уголовное', corporate: 'корпоративное',
  administrative: 'административное', family: 'семейное', labor: 'трудовое', other: 'прочее',
};

const SUBJECTS: Record<CaseType, string[]> = {
  civil: ['Спор о взыскании ущерба', 'Защита прав потребителя', 'Признание сделки недействительной'],
  criminal: ['Защита по уголовному делу', 'Обжалование меры пресечения', 'Консультация по уголовному производству'],
  corporate: ['Корпоративный спор участников', 'Сопровождение сделки M&A', 'Взыскание долга с контрагента'],
  administrative: ['Обжалование решения госоргана', 'Спор с налоговой', 'Оспаривание штрафа'],
  family: ['Расторжение брака', 'Раздел имущества супругов', 'Определение места жительства ребёнка'],
  labor: ['Восстановление на работе', 'Взыскание зарплаты', 'Спор о незаконном увольнении'],
  other: ['Юридическая консультация', 'Подготовка договора', 'Прочее правовое сопровождение'],
};

const NEW_CLIENTS = [
  { name: 'ООО «Технопарк»', client_kind: 'company' as const, source: 'website' as const, email: 'info@technopark.example', address: 'г. Харьков, ул. Сумская, 12' },
  { name: 'Бондаренко Тарас Игоревич', client_kind: 'individual' as const, source: 'referral' as const, email: 'bondarenko@example.com', phone: '+380631234500' },
  { name: 'ЧП «Світанок»', client_kind: 'company' as const, source: 'advertising' as const, email: 'office@svitanok.example' },
  { name: 'Лысенко Наталья Олеговна', client_kind: 'individual' as const, source: 'repeat' as const, email: 'lysenko@example.com', phone: '+380671230099' },
];

const pad = (n: number) => String(n).padStart(2, '0');

async function userIdByEmail(): Promise<Map<string, string>> {
  const { data, error } = await admin.from('users').select('id, email');
  if (error) throw error;
  const m = new Map<string, string>();
  for (const u of data ?? []) m.set(u.email as string, u.id as string);
  return m;
}

async function caseCount(): Promise<number> {
  const { count, error } = await admin.from('cases').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// Варьируем заголовки по длине: короткие, средние, длинные (ротация по индексу).
// seq — сквозной номер для уникальности коротких названий.
function buildTitle(
  i: number, seq: number, subject: string, clientName: string, caseType: CaseType,
): string {
  const clientShort = clientName.split(' ')[0]!.replace(/[«»"]/g, '');
  switch (i % 6) {
    case 0: return `${subject} — ${clientName}`;                       // длинное
    case 1: return `Иск №${seq}`;                                       // короткое
    case 2: return `${subject} (${clientShort})`;                       // среднее
    case 3: return `Дело ${seq}`;                                       // короткое
    case 4: return `${subject}: ${clientName}, ${TYPE_LABEL[caseType]} дело`; // длинное
    default: return `${clientShort} · ${subject}`;                      // среднее
  }
}

async function main(): Promise<void> {
  const users = await userIdByEmail();
  const adminId = users.get('admin@yur.local')!;
  const ownerId = users.get('owner@yur.local')!;
  const L = [users.get('lawyer@yur.local')!, users.get('lawyer2@yur.local')!];
  const E = [users.get('expert@yur.local')!, users.get('expert2@yur.local')!];

  // owner-клиент — для override-ставок (BD-триггер запрещает их service_role).
  const ownerClient = createClient(SUPABASE_URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: loginErr } = await ownerClient.auth.signInWithPassword({
    email: 'owner@yur.local', password: PASSWORD,
  });
  if (loginErr) throw new Error(`owner login: ${loginErr.message}`);

  // Дозаводим несколько новых клиентов (для разнообразия), затем берём всех.
  for (const cl of NEW_CLIENTS) {
    const { data: exists } = await admin.from('clients').select('id').eq('name', cl.name).maybeSingle();
    if (exists) continue;
    const { error } = await admin.from('clients').insert({ ...cl, created_by: adminId });
    if (error) throw new Error(`client ${cl.name}: ${error.message}`);
  }
  const { data: allClients, error: clErr } = await admin.from('clients').select('id, name');
  if (clErr) throw clErr;
  const clients = (allClients ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));

  const base = await caseCount();
  console.log(`Добавляем ${COUNT} дел (в базе уже ${base})...`);

  for (let i = 0; i < COUNT; i++) {
    const seq = base + i + 1;
    const stage = STAGES[i % STAGES.length]!;
    const category = CATS[i % CATS.length]!;
    const caseType = TYPES[i % TYPES.length]!;
    const priority = i % 3 === 0 ? 'urgent' : 'normal';
    const lawyerId = L[i % 2]!;
    const expertId = E[Math.floor(i / 2) % 2]!;
    const client = clients[i % clients.length]!;
    const clientId = client.id;
    const subjectPool = SUBJECTS[caseType];
    const subject = subjectPool[i % subjectPool.length]!;
    const numTitle = buildTitle(i, seq, subject, client.name, caseType);
    const contract = 10000 + (i % 12) * 7500; // 10 000 … 92 500
    const openedMonth = (i % 5) + 1;
    const opened_at = `2026-${pad(openedMonth)}-${pad((i % 25) + 1)}`;

    // Особые режимы (ротация по индексу).
    const perPayment = stage === 'in_progress' && i % 6 === 2;
    const overpaidCase = stage === 'awaiting_decision' && i % 4 === 3;
    const overrideCase = i % 7 === 5; // индивидуальные ставки
    const closedWithAct = stage === 'closed' && i % 2 === 0;

    // Платежи по этапу.
    type Pay = { amount: number; paid_at: string; method?: string; note?: string };
    const payments: Pay[] = [];
    const payDate = (mShift: number) => `2026-${pad(Math.min(12, openedMonth + mShift))}-15`;
    if (stage === 'consultation') {
      payments.push({ amount: Math.round(contract * 0.2), paid_at: payDate(0), method: 'card', note: 'Предоплата за консультацию' });
    } else if (stage === 'in_progress') {
      payments.push({ amount: Math.round(contract * 0.3), paid_at: payDate(0), method: 'bank', note: '1-й платёж' });
      payments.push({ amount: Math.round(contract * 0.2), paid_at: payDate(1), method: 'bank', note: '2-й платёж' });
    } else if (stage === 'awaiting_decision') {
      if (overpaidCase) {
        payments.push({ amount: contract, paid_at: payDate(0), method: 'bank', note: 'Оплата по договору' });
        payments.push({ amount: Math.round(contract * 0.15), paid_at: payDate(1), method: 'card', note: 'Доплата (переплата)' });
      } else {
        payments.push({ amount: Math.round(contract * 0.7), paid_at: payDate(0), method: 'bank', note: 'Оплата большей части' });
      }
    } else if (stage === 'closed') {
      payments.push({ amount: contract, paid_at: payDate(0), method: 'bank', note: 'Полная оплата' });
    }
    // new_request — без платежей.

    // Задачи (по этапу).
    type Tk = { title: string; kind: 'task' | 'hearing' | 'deadline'; assignee: string; due_at?: string; status?: 'open' | 'done' };
    const tasks: Tk[] = [];
    if (stage === 'new_request') {
      tasks.push({ title: 'Связаться с клиентом, согласовать встречу', kind: 'task', assignee: lawyerId, due_at: `2026-${pad(openedMonth)}-${pad(((i % 25) + 3))}T12:00:00Z` });
    } else if (stage === 'in_progress') {
      tasks.push({ title: 'Подготовить процессуальные документы', kind: 'task', assignee: expertId, due_at: payDate(2) + 'T10:00:00Z' });
    } else if (stage === 'awaiting_decision') {
      tasks.push({ title: 'Судебное заседание', kind: 'hearing', assignee: expertId, due_at: payDate(2) + 'T09:30:00Z' });
    } else if (stage === 'closed') {
      tasks.push({ title: 'Передать документы клиенту', kind: 'task', assignee: lawyerId, status: 'done' });
    }

    // Документы.
    type Dc = { file_name: string; doc_type: DocType };
    const documents: Dc[] = [];
    if (stage === 'in_progress' || stage === 'awaiting_decision' || stage === 'closed') {
      documents.push({ file_name: `Договор_${seq}.pdf`, doc_type: 'contract' });
    }
    if (closedWithAct) {
      documents.push({ file_name: `Акт_${seq}.pdf`, doc_type: 'act' });
    }

    // ── Вставка дела ──
    const { data: caseRow, error: caseErr } = await admin.from('cases').insert({
      number_title: numTitle, client_id: clientId, lawyer_id: lawyerId, responsible_id: expertId,
      opened_at, case_type: caseType, category, subject, stage, priority, contract_sum: contract,
      billing_types: stage === 'closed' ? ['fixed'] : ['installments'],
      tags: [caseType], accrual_mode: perPayment ? 'per_payment' : 'on_completion',
      opponent: stage === 'awaiting_decision' ? 'Противная сторона' : null,
      court: stage === 'awaiting_decision' ? 'Районный суд' : null,
      court_case_number: stage === 'awaiting_decision' ? `${100 + i}/${2000 + i}/2026` : null,
      closed_at: stage === 'closed' ? '2026-05-20' : null,
    }).select('id').single();
    if (caseErr || !caseRow) throw new Error(`case ${numTitle}: ${caseErr?.message}`);
    const caseId = caseRow.id as string;

    if (overrideCase) {
      const { error } = await ownerClient.from('cases')
        .update({ lawyer_rate_override: 20, expert_rate_override: 12 }).eq('id', caseId);
      if (error) throw new Error(`override ${numTitle}: ${error.message}`);
    }

    for (const p of payments) {
      const { error } = await admin.from('payments').insert({
        case_id: caseId, amount: p.amount, paid_at: p.paid_at, method: p.method ?? null,
        note: p.note ?? null, created_by: adminId,
      });
      if (error) throw new Error(`payment ${numTitle}: ${error.message}`);
    }
    for (const t of tasks) {
      const { error } = await admin.from('tasks').insert({
        case_id: caseId, title: t.title, kind: t.kind, assignee_id: t.assignee,
        created_by: adminId, due_at: t.due_at ?? null, status: t.status ?? 'open',
      });
      if (error) throw new Error(`task ${numTitle}: ${error.message}`);
    }
    for (const d of documents) {
      const key = `cases/${caseId}/${crypto.randomUUID()}--${d.doc_type}.txt`;
      const body = new Uint8Array(Buffer.from(`Демо-файл «${d.file_name}» по делу ${numTitle}.\n`));
      const { error: upErr } = await admin.storage.from('case-documents')
        .upload(key, body, { contentType: 'text/plain', upsert: false });
      if (upErr) throw new Error(`upload ${numTitle}: ${upErr.message}`);
      const { error } = await admin.from('documents').insert({
        case_id: caseId, file_name: d.file_name, storage_key: key, doc_type: d.doc_type, uploaded_by: adminId,
      });
      if (error) throw new Error(`document ${numTitle}: ${error.message}`);
    }

    // Выплаты по закрытым делам: с актом — обе роли paid; без акта — только юристу.
    if (stage === 'closed') {
      const roles = closedWithAct ? ['lawyer', 'expert'] : ['lawyer'];
      for (const role of roles) {
        const { error } = await admin.from('payroll_ledger')
          .update({ status: 'paid', paid_at: new Date('2026-05-22T10:00:00Z').toISOString(), paid_by: ownerId })
          .eq('case_id', caseId).eq('role_in_case', role).eq('status', 'accrued');
        if (error) throw new Error(`payout ${numTitle}/${role}: ${error.message}`);
      }
    }

    console.log(`  ✓ ${numTitle} — ${stage}${perPayment ? ' · per_payment' : ''}${overpaidCase ? ' · переплата' : ''}${overrideCase ? ' · override' : ''}${closedWithAct ? ' · с актом' : stage === 'closed' ? ' · без акта' : ''}`);
  }

  const { count: total } = await admin.from('cases').select('id', { count: 'exact', head: true });
  console.log(`\nГотово. Всего дел в базе: ${total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
