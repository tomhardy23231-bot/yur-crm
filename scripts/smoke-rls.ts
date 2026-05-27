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

  console.log('\n9. Шаг 6 — воронка только вперёд (cases_validate_stage_forward):');
  // Все stage-операции делаем через adminUser (HTTP с JWT) — service_role обошёл бы
  // RLS, но триггер всё равно срабатывает и под service_role auth.uid()=NULL →
  // is_staff()=false → backward бросит. Поэтому пишем как реальный admin.
  // `admin` (service_role) используем только для read-проверок.
  const { data: caseBefore, error: caseBeforeErr } = await admin
    .from('cases')
    .select('id, stage')
    .eq('number_title', 'CRM-2026-001')
    .single();
  if (caseBeforeErr || !caseBefore) fail(`не нашёл CRM-2026-001: ${caseBeforeErr?.message}`);
  const originalStage = caseBefore.stage as string;
  const caseId = caseBefore.id;

  // Гарантируем стартовое состояние in_progress, чтобы у lawyer было «куда откатывать».
  // adminUser staff → может двигать в любую сторону. Если уже там — триггер обрежет no-op.
  const { error: setupErr } = await adminUser
    .from('cases')
    .update({ stage: 'in_progress' })
    .eq('id', caseId);
  if (setupErr) fail(`setup (in_progress) не удался: ${setupErr.message}`);
  ok('setup: CRM-2026-001 переведён в in_progress');

  // Lawyer пробует откатить на consultation → триггер должен бросить ошибку.
  const { error: lawyerBackErr } = await lawyer
    .from('cases')
    .update({ stage: 'consultation' })
    .eq('id', caseId);
  if (!lawyerBackErr || !lawyerBackErr.message.includes('stage_backward_forbidden')) {
    fail(`lawyer должен получить stage_backward_forbidden, получил: ${lawyerBackErr?.message ?? 'no error'}`);
  }
  const { data: afterLawyerBack } = await admin
    .from('cases').select('stage').eq('id', caseId).single();
  if (afterLawyerBack?.stage !== 'in_progress') {
    fail(`lawyer не должен был откатить stage, факт: ${afterLawyerBack?.stage}`);
  }
  ok('lawyer не может откатить stage (триггер бросил stage_backward_forbidden)');

  // Lawyer двигает вперёд на pretrial → должно сработать.
  const { error: lawyerFwdErr } = await lawyer
    .from('cases')
    .update({ stage: 'pretrial' })
    .eq('id', caseId);
  if (lawyerFwdErr) fail(`lawyer не смог двинуть вперёд: ${lawyerFwdErr.message}`);
  const { data: afterLawyerFwd } = await admin
    .from('cases').select('stage').eq('id', caseId).single();
  if (afterLawyerFwd?.stage !== 'pretrial') {
    fail(`lawyer должен был двинуть в pretrial, факт: ${afterLawyerFwd?.stage}`);
  }
  ok('lawyer двинул stage вперёд (pretrial)');

  // Admin откатывает обратно на consultation → ок + запись в activity_log.
  const { count: beforeCount } = await admin
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'case')
    .eq('entity_id', caseId)
    .eq('action', 'stage_corrected');

  const { error: adminBackErr } = await adminUser
    .from('cases')
    .update({ stage: 'consultation' })
    .eq('id', caseId);
  if (adminBackErr) fail(`admin не смог откатить: ${adminBackErr.message}`);
  const { data: afterAdminBack } = await admin
    .from('cases').select('stage').eq('id', caseId).single();
  if (afterAdminBack?.stage !== 'consultation') {
    fail(`admin должен был откатить в consultation, факт: ${afterAdminBack?.stage}`);
  }
  ok('admin откатил stage назад (pretrial → consultation)');

  const { count: afterCount, data: logRows } = await admin
    .from('activity_log')
    .select('changes, action', { count: 'exact' })
    .eq('entity_type', 'case')
    .eq('entity_id', caseId)
    .eq('action', 'stage_corrected')
    .order('created_at', { ascending: false });
  if ((afterCount ?? 0) !== (beforeCount ?? 0) + 1) {
    fail(`в activity_log ожидалась +1 запись stage_corrected, было ${beforeCount}, стало ${afterCount}`);
  }
  const lastChanges = logRows?.[0]?.changes as { from?: string; to?: string } | undefined;
  if (lastChanges?.from !== 'pretrial' || lastChanges?.to !== 'consultation') {
    fail(`activity_log changes ожидались {from:pretrial,to:consultation}, факт: ${JSON.stringify(lastChanges)}`);
  }
  ok('activity_log получил запись stage_corrected с {from,to}');

  // Cleanup: возвращаем исходный stage. Если назад — добавит ещё одну stage_corrected запись (это ок).
  const { error: cleanupErr } = await adminUser
    .from('cases')
    .update({ stage: originalStage })
    .eq('id', caseId);
  if (cleanupErr) fail(`cleanup не удался: ${cleanupErr.message}`);
  ok(`cleanup: CRM-2026-001 возвращён в ${originalStage}`);

  console.log('\n10. Шаг 7 — tasks RLS (через дело):');
  // ids тех, кто нам нужен
  const { data: lawyerProfile } = await admin
    .from('users').select('id').eq('email', 'lawyer@yur.local').single();
  const { data: juristProfile } = await admin
    .from('users').select('id').eq('email', 'jurist@yur.local').single();
  const lawyerUid = lawyerProfile!.id as string;
  const juristUid = juristProfile!.id as string;

  const { data: lawyerCaseRow } = await admin
    .from('cases').select('id').eq('number_title', 'CRM-2026-001').single();
  const { data: juristCaseRow } = await admin
    .from('cases').select('id').eq('number_title', 'CRM-2026-002').single();
  const lawyerCaseId = lawyerCaseRow!.id as string;
  const juristCaseId = juristCaseRow!.id as string;

  // 10.1 — lawyer видит ровно task'и своего дела (isolation, не строгое число —
  // QA может оставлять test-task; важно что НЕ видно чужих).
  const { data: lawyerTasks } = await lawyer
    .from('tasks')
    .select('id, title, case_id');
  if (!lawyerTasks || lawyerTasks.length === 0) {
    fail(`lawyer должен видеть свои task'и, видит ${lawyerTasks?.length}`);
  }
  const foreignTask = lawyerTasks.find((t) => t.case_id !== lawyerCaseId);
  if (foreignTask) {
    fail(`lawyer видит task с чужим case_id: ${foreignTask.case_id}`);
  }
  ok(`lawyer видит ${lawyerTasks.length} task — все по своему делу`);

  // 10.2 — jurist НЕ видит task lawyer.
  const { data: juristTasks } = await jurist
    .from('tasks').select('id').eq('case_id', lawyerCaseId);
  if (juristTasks?.length !== 0) {
    fail(`jurist не должен видеть task на CRM-2026-001, видит ${juristTasks?.length}`);
  }
  ok('jurist изолирован от task чужого дела');

  // 10.3 — lawyer создаёт task на своё дело с правильным created_by.
  const { data: created, error: createErr } = await lawyer
    .from('tasks')
    .insert({
      case_id: lawyerCaseId,
      title: 'smoke: проверка создания',
      kind: 'task',
      assignee_id: lawyerUid,
      created_by: lawyerUid,
    })
    .select('id')
    .single();
  if (createErr || !created) {
    fail(`lawyer не смог создать task на своё дело: ${createErr?.message}`);
  }
  const newTaskId = created.id as string;
  ok('lawyer создал task на своё дело');

  // 10.4 — lawyer пробует создать task с created_by=juristUid → WITH CHECK fail.
  const { error: forgedErr } = await lawyer
    .from('tasks')
    .insert({
      case_id: lawyerCaseId,
      title: 'smoke: forged created_by',
      kind: 'task',
      assignee_id: lawyerUid,
      created_by: juristUid,
    });
  if (!forgedErr) {
    fail('lawyer смог приписать created_by чужому юзеру — RLS дыра');
  }
  ok('lawyer не может приписать created_by чужому юзеру (WITH CHECK отверг)');

  // 10.5 — lawyer пробует создать task на ЧУЖОЕ дело → can_write_case fail.
  const { error: foreignCaseErr } = await lawyer
    .from('tasks')
    .insert({
      case_id: juristCaseId,
      title: 'smoke: foreign case',
      kind: 'task',
      assignee_id: lawyerUid,
      created_by: lawyerUid,
    });
  if (!foreignCaseErr) {
    fail('lawyer смог создать task на дело jurist — RLS дыра');
  }
  ok('lawyer не может создать task на чужое дело (can_write_case отверг)');

  // 10.6 — lawyer toggle статус новой task open → done.
  const { error: toggleErr } = await lawyer
    .from('tasks').update({ status: 'done' }).eq('id', newTaskId);
  if (toggleErr) fail(`lawyer не смог обновить status своей task: ${toggleErr.message}`);
  const { data: afterToggle } = await admin
    .from('tasks').select('status').eq('id', newTaskId).single();
  if (afterToggle?.status !== 'done') {
    fail(`status должен был стать done, факт: ${afterToggle?.status}`);
  }
  ok('lawyer переключил status своей task (open → done)');

  // 10.7 — cleanup: удалить созданную task.
  const { error: cleanupTaskErr } = await admin.from('tasks').delete().eq('id', newTaskId);
  if (cleanupTaskErr) fail(`cleanup task не удался: ${cleanupTaskErr.message}`);
  ok('cleanup: smoke-task удалена');

  console.log('\n11. Шаг 8 — documents + storage RLS:');
  // 11.1 — lawyer загружает в свой бакет (cases/<lawyerCaseId>/<key>).
  const storageKey = `cases/${lawyerCaseId}/${crypto.randomUUID()}--smoke.txt`;
  const payload = new Uint8Array(Buffer.from('smoke-test content'));
  const { error: uploadErr } = await lawyer.storage
    .from('case-documents')
    .upload(storageKey, payload, { contentType: 'text/plain', upsert: false });
  if (uploadErr) fail(`lawyer не смог загрузить в своё дело: ${uploadErr.message}`);
  ok('lawyer upload в storage свого дела');

  // 11.2 — lawyer пробует загрузить в чужое дело — storage RLS должен отказать.
  const foreignKey = `cases/${juristCaseId}/${crypto.randomUUID()}--foreign.txt`;
  const { error: foreignUploadErr } = await lawyer.storage
    .from('case-documents')
    .upload(foreignKey, payload, { contentType: 'text/plain', upsert: false });
  if (!foreignUploadErr) {
    // cleanup на всякий случай
    await admin.storage.from('case-documents').remove([foreignKey]);
    fail('lawyer смог загрузить в чужое дело — storage RLS дыра');
  }
  ok('lawyer не может загрузить в чужое дело (storage RLS отверг)');

  // 11.3 — lawyer создаёт row в documents с правильным uploaded_by.
  const { data: docCreated, error: docInsertErr } = await lawyer
    .from('documents')
    .insert({
      case_id: lawyerCaseId,
      file_name: 'smoke.txt',
      storage_key: storageKey,
      doc_type: 'other',
      uploaded_by: lawyerUid,
    })
    .select('id')
    .single();
  if (docInsertErr || !docCreated) {
    fail(`lawyer не смог создать documents row: ${docInsertErr?.message}`);
  }
  const newDocId = docCreated.id as string;
  ok('lawyer создал row в documents');

  // 11.4 — lawyer пробует подделать uploaded_by = juristUid → WITH CHECK fail.
  const { error: forgedUploadedByErr } = await lawyer
    .from('documents')
    .insert({
      case_id: lawyerCaseId,
      file_name: 'forged.txt',
      storage_key: `cases/${lawyerCaseId}/forged-${crypto.randomUUID()}.txt`,
      doc_type: 'other',
      uploaded_by: juristUid,
    });
  if (!forgedUploadedByErr) {
    fail('lawyer смог приписать uploaded_by чужому юзеру — documents RLS дыра');
  }
  ok('lawyer не может приписать uploaded_by чужому юзеру (WITH CHECK отверг)');

  // 11.5 — jurist НЕ видит document lawyer.
  const { data: juristDocsView } = await jurist
    .from('documents').select('id').eq('case_id', lawyerCaseId);
  if (juristDocsView?.length !== 0) {
    fail(`jurist не должен видеть документы lawyer, видит ${juristDocsView?.length}`);
  }
  ok('jurist изолирован от документов чужого дела');

  // 11.6 — jurist пробует удалить document lawyer — DELETE staff-only.
  const { error: juristDeleteErr } = await jurist
    .from('documents').delete().eq('id', newDocId);
  const { data: afterJuristDelete } = await admin
    .from('documents').select('id').eq('id', newDocId).maybeSingle();
  if (!afterJuristDelete) {
    fail('jurist смог удалить document lawyer — RLS дыра (DELETE должен быть staff-only)');
  }
  ok('jurist не может удалить document (DELETE staff-only)');
  void juristDeleteErr;

  // 11.7 — admin удаляет document + storage object.
  const { error: adminDocDeleteErr } = await adminUser
    .from('documents').delete().eq('id', newDocId);
  if (adminDocDeleteErr) fail(`admin не смог удалить document: ${adminDocDeleteErr.message}`);
  const { error: adminStorageDeleteErr } = await adminUser.storage
    .from('case-documents').remove([storageKey]);
  if (adminStorageDeleteErr) fail(`admin не смог удалить storage object: ${adminStorageDeleteErr.message}`);
  ok('admin удалил document + storage object');

  console.log('\n12. Шаг 9 — payments RLS + триггеры:');
  // 12.0 — забираем seed-платёж lawyer'a и admin uid для последующих проверок.
  const { data: adminProfile } = await admin
    .from('users').select('id').eq('email', 'admin@yur.local').single();
  const adminUid = adminProfile!.id as string;

  const { data: seedPayments } = await admin
    .from('payments').select('id, amount').eq('case_id', lawyerCaseId);
  if (!seedPayments || seedPayments.length !== 1) {
    fail(`ожидался 1 seed-платёж на lawyerCase, получили ${seedPayments?.length}`);
  }
  const lawyerSeedPaymentId = seedPayments[0]!.id as string;

  // 12.1 — admin INSERT 5000 на juristCase → триггеры обновили paid_total и debt.
  const { data: newPay, error: insErr } = await adminUser
    .from('payments')
    .insert({
      case_id: juristCaseId,
      amount: 5000,
      paid_at: '2026-05-27',
      method: 'Наличные',
      note: 'smoke recalc',
      created_by: adminUid,
    })
    .select('id')
    .single();
  if (insErr || !newPay) fail(`admin INSERT payment failed: ${insErr?.message}`);
  const newPayId = newPay.id as string;

  const { data: juristCaseAfter } = await admin
    .from('cases').select('paid_total, debt')
    .eq('id', juristCaseId).single();
  if (Number(juristCaseAfter!.paid_total) !== 5000) {
    fail(`paid_total после INSERT ожидался 5000, факт ${juristCaseAfter!.paid_total}`);
  }
  if (Number(juristCaseAfter!.debt) !== 115000) {
    fail(`debt после INSERT ожидался 115000, факт ${juristCaseAfter!.debt}`);
  }
  ok('payments_recalc + cases_recompute_debt отработали (paid=5000, debt=115000)');

  // 12.2 — jurist пробует подделать created_by = lawyerUid → WITH CHECK fail.
  const { error: forgedPayErr } = await jurist
    .from('payments')
    .insert({
      case_id: juristCaseId,
      amount: 1,
      paid_at: '2026-05-27',
      created_by: lawyerUid,
    });
  if (!forgedPayErr) {
    fail('jurist смог приписать created_by чужому юзеру — payments RLS дыра');
  }
  ok('jurist не может приписать created_by чужому юзеру (WITH CHECK отверг)');

  // 12.3 — lawyer пробует UPDATE/DELETE своего же платежа — RLS staff-only.
  const { error: lawyerUpdErr } = await lawyer
    .from('payments').update({ note: 'hacked' }).eq('id', lawyerSeedPaymentId);
  void lawyerUpdErr; // RLS возвращает empty, не ошибку
  const { data: afterLawyerUpd } = await admin
    .from('payments').select('note').eq('id', lawyerSeedPaymentId).single();
  if (afterLawyerUpd!.note === 'hacked') {
    fail('lawyer смог UPDATE payment — RLS дыра (UPDATE должен быть staff-only)');
  }
  ok('lawyer не может UPDATE payment (staff-only)');

  const { error: lawyerDelErr } = await lawyer
    .from('payments').delete().eq('id', lawyerSeedPaymentId);
  void lawyerDelErr;
  const { data: afterLawyerDel } = await admin
    .from('payments').select('id').eq('id', lawyerSeedPaymentId).maybeSingle();
  if (!afterLawyerDel) {
    fail('lawyer смог DELETE payment — RLS дыра (DELETE должен быть staff-only)');
  }
  ok('lawyer не может DELETE payment (staff-only)');

  // 12.4 — admin может UPDATE.
  const { error: adminUpdErr } = await adminUser
    .from('payments').update({ note: 'corrected' }).eq('id', lawyerSeedPaymentId);
  if (adminUpdErr) fail(`admin не смог UPDATE payment: ${adminUpdErr.message}`);
  ok('admin может UPDATE payment');

  // 12.5 — admin DELETE юристового платежа → триггер откатил paid_total/debt.
  const { error: adminDelErr } = await adminUser
    .from('payments').delete().eq('id', newPayId);
  if (adminDelErr) fail(`admin не смог DELETE payment: ${adminDelErr.message}`);

  const { data: juristCaseFinal } = await admin
    .from('cases').select('paid_total, debt')
    .eq('id', juristCaseId).single();
  if (Number(juristCaseFinal!.paid_total) !== 0) {
    fail(`paid_total после DELETE ожидался 0, факт ${juristCaseFinal!.paid_total}`);
  }
  if (Number(juristCaseFinal!.debt) !== 120000) {
    fail(`debt после DELETE ожидался 120000, факт ${juristCaseFinal!.debt}`);
  }
  ok('admin DELETE + триггеры откатили paid_total/debt (paid=0, debt=120000)');

  // 12.6 — cleanup: откатываем note seed-платежа.
  await adminUser
    .from('payments').update({ note: null }).eq('id', lawyerSeedPaymentId);
  ok('cleanup: seed-платёж восстановлен');

  console.log('\n13. Шаг 10 + CSO #1 — activity_log writer (public.log_activity):');
  // После CSO #1 (20260527120000) writer имеет allowlist на action — используем
  // настоящие имена действий из allowlist, smoke-записи метим уникальным
  // _smoke_run в changes для precise-cleanup'а.
  const SMOKE_RUN_ID = `smoke-${Date.now()}`;

  // 13.1 — lawyer пишет лог на СВОЁ дело (action из allowlist) — ok.
  const { error: lawyerLogErr } = await lawyer.rpc('log_activity', {
    p_entity_type: 'case',
    p_entity_id: lawyerCaseId,
    p_action: 'case_updated',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'lawyer-ok', by: 'lawyer' },
  });
  if (lawyerLogErr) fail(`lawyer rpc log_activity failed: ${lawyerLogErr.message}`);
  const { data: lawyerOwnLog } = await admin
    .from('activity_log')
    .select('user_id, action, changes')
    .eq('changes->>_smoke_marker', 'lawyer-ok')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (!lawyerOwnLog) fail('запись lawyer log не появилась в activity_log');
  if (lawyerOwnLog.user_id !== lawyerUid) {
    fail(`activity_log.user_id ожидался ${lawyerUid}, факт ${lawyerOwnLog.user_id}`);
  }
  ok('lawyer записал событие на своё дело (user_id = lawyerUid, action из allowlist)');

  // 13.2 — lawyer пишет лог на ЧУЖОЕ дело — silent skip (can_see_case=false).
  const { error: lawyerForeignLogErr } = await lawyer.rpc('log_activity', {
    p_entity_type: 'case',
    p_entity_id: juristCaseId,
    p_action: 'case_updated',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'lawyer-forbidden' },
  });
  if (lawyerForeignLogErr) {
    fail(`rpc log_activity не должен бросать на чужое дело, упал: ${lawyerForeignLogErr.message}`);
  }
  const { data: forbiddenLog } = await admin
    .from('activity_log')
    .select('id')
    .eq('changes->>_smoke_marker', 'lawyer-forbidden')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (forbiddenLog) {
    fail('lawyer смог записать событие на чужое дело — log_activity дыра');
  }
  ok('lawyer не может записать событие на чужое дело (silent skip)');

  // 13.3 — admin записывает client-событие (allowlist client_updated) — ok.
  const { data: someClient } = await admin
    .from('clients').select('id').limit(1).single();
  const clientId = someClient!.id as string;
  const { error: adminClientLogErr } = await adminUser.rpc('log_activity', {
    p_entity_type: 'client',
    p_entity_id: clientId,
    p_action: 'client_updated',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'admin-client', ok: 1 },
  });
  if (adminClientLogErr) fail(`admin client log failed: ${adminClientLogErr.message}`);
  const { data: adminClientLog } = await admin
    .from('activity_log')
    .select('user_id')
    .eq('changes->>_smoke_marker', 'admin-client')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (!adminClientLog) fail('admin client log не появился');
  if (adminClientLog.user_id !== adminUid) {
    fail(`admin client log user_id ожидался ${adminUid}, факт ${adminClientLog.user_id}`);
  }
  ok('admin записал событие entity_type=client (user_id = adminUid)');

  // 13.4 — lawyer не может записать client-событие (silent, не staff).
  const { error: lawyerClientErr } = await lawyer.rpc('log_activity', {
    p_entity_type: 'client',
    p_entity_id: clientId,
    p_action: 'client_updated',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'lawyer-client-forbidden' },
  });
  if (lawyerClientErr) {
    fail(`rpc должен быть silent для client+lawyer, упал: ${lawyerClientErr.message}`);
  }
  const { data: lawyerClientLog } = await admin
    .from('activity_log')
    .select('id')
    .eq('changes->>_smoke_marker', 'lawyer-client-forbidden')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (lawyerClientLog) {
    fail('lawyer смог записать client-событие — staff-only нарушен');
  }
  ok('lawyer не может писать client-журнал (silent skip, staff-only)');

  // 13.5 (NEW, CSO #1) — non-allowlisted action — silent skip.
  // Защита от подделки журнала кастомным action-именем через rpc.
  const { error: bogusActionErr } = await lawyer.rpc('log_activity', {
    p_entity_type: 'case',
    p_entity_id: lawyerCaseId,
    p_action: 'evil_fake_action',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'evil-action' },
  });
  if (bogusActionErr) {
    fail(`evil_fake_action rpc должен быть silent, упал: ${bogusActionErr.message}`);
  }
  const { data: evilLog } = await admin
    .from('activity_log')
    .select('id')
    .eq('changes->>_smoke_marker', 'evil-action')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (evilLog) fail('CSO #1: allowlist пробит — non-allowlisted action записался');
  ok('CSO #1: non-allowlisted action отвергается allowlist (silent skip)');

  // 13.6 (NEW, CSO #1) — 'stage_corrected' через rpc — silent skip.
  // Этот action пишет только триггер cases_validate_stage_forward;
  // rpc-вызов с ним = попытка подделки и игнорируется.
  const { error: fakeStageErr } = await lawyer.rpc('log_activity', {
    p_entity_type: 'case',
    p_entity_id: lawyerCaseId,
    p_action: 'stage_corrected',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'fake-stage', from: 'closed', to: 'new_request' },
  });
  if (fakeStageErr) {
    fail(`stage_corrected rpc должен быть silent, упал: ${fakeStageErr.message}`);
  }
  const { data: fakeStageLog } = await admin
    .from('activity_log')
    .select('id')
    .eq('changes->>_smoke_marker', 'fake-stage')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (fakeStageLog) fail('CSO #1: stage_corrected через rpc пробит — подделка возможна');
  ok('CSO #1: stage_corrected недоступен через rpc (пишет только триггер)');

  // 13.7 — lawyer SELECT activity_log: видит свои case-события + ничего по чужим / клиентам.
  const { data: lawyerVisibleLog } = await lawyer
    .from('activity_log')
    .select('action, entity_type, entity_id, changes')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!lawyerVisibleLog) fail('lawyer не получил список activity_log');
  const lawyerSeenSmoke = lawyerVisibleLog.find(
    (r) => (r.changes as { _smoke_marker?: string } | null)?._smoke_marker === 'lawyer-ok',
  );
  if (!lawyerSeenSmoke) fail('lawyer не видит свою же запись в activity_log');
  const lawyerSawForeignCase = lawyerVisibleLog.find(
    (r) => r.entity_type === 'case' && r.entity_id !== lawyerCaseId,
  );
  if (lawyerSawForeignCase) {
    fail(`lawyer видит запись по чужому делу: ${JSON.stringify(lawyerSawForeignCase)}`);
  }
  const lawyerSawClient = lawyerVisibleLog.find((r) => r.entity_type === 'client');
  if (lawyerSawClient) fail('lawyer не должен видеть client-записи (staff-only)');
  ok('lawyer видит только свои case-события в activity_log');

  // 13.8 — admin SELECT видит всё (включая client-записи).
  const { data: adminVisibleLog } = await adminUser
    .from('activity_log')
    .select('action, entity_type, changes')
    .eq('changes->>_smoke_marker', 'admin-client')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID);
  if (!adminVisibleLog || adminVisibleLog.length === 0) {
    fail('admin не видит client-записи, которые сам создал');
  }
  ok('admin видит client-записи (is_staff=true)');

  // 13.9 — cleanup: удаляем все записи текущего SMOKE_RUN_ID через service_role.
  const { error: cleanupLogErr } = await admin
    .from('activity_log')
    .delete()
    .eq('changes->>_smoke_run', SMOKE_RUN_ID);
  if (cleanupLogErr) fail(`cleanup activity_log failed: ${cleanupLogErr.message}`);
  ok(`cleanup: записи ${SMOKE_RUN_ID} удалены`);

  console.log('\n14. Внешнее ревью MED#4 — cases_validate_responsible проверяет is_active:');
  // 14.1 — создаём временного НЕАКТИВНОГО специалиста.
  const inactiveEmail = `inactive-spec-${SMOKE_RUN_ID}@yur.local`;
  const { data: inactiveAuth, error: inactiveAuthErr } = await admin.auth.admin.createUser({
    email: inactiveEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (inactiveAuthErr || !inactiveAuth.user) {
    fail(`MED#4 setup: auth admin create failed: ${inactiveAuthErr?.message}`);
  }
  const inactiveUid = inactiveAuth.user.id;
  const { error: inactiveProfErr } = await admin.from('users').insert({
    id: inactiveUid,
    full_name: 'Smoke Inactive Specialist',
    email: inactiveEmail,
    role: 'specialist',
    specialist_type: 'lawyer',
    is_active: false,
  });
  if (inactiveProfErr) fail(`MED#4 setup profile: ${inactiveProfErr.message}`);

  // 14.2 — admin (staff, INSERT cases разрешён по RLS) пытается создать дело
  // с неактивным responsible — триггер cases_validate_responsible должен бросить.
  const { data: anyClient } = await admin
    .from('clients').select('id').limit(1).single();
  if (!anyClient) fail('MED#4: нет клиента в БД для setup');
  const { error: badInsertErr } = await adminUser
    .from('cases')
    .insert({
      number_title: `SMOKE-INACT-${SMOKE_RUN_ID}`,
      client_id: anyClient.id,
      responsible_id: inactiveUid,
      opened_at: '2026-05-27',
      case_type: 'civil',
      stage: 'new_request',
      priority: 'normal',
      contract_sum: 0,
    });
  if (!badInsertErr) {
    fail('MED#4: INSERT cases с неактивным responsible_id прошёл — триггер молчит');
  }
  if (!/not active|inactive/i.test(badInsertErr.message)) {
    fail(`MED#4: ожидалось "not active/inactive" в ошибке, получено: ${badInsertErr.message}`);
  }
  ok('MED#4: INSERT cases с неактивным responsible отвергнут триггером');

  // 14.3 — cleanup: удалить временного специалиста.
  const { error: delInactErr } = await admin.from('users').delete().eq('id', inactiveUid);
  if (delInactErr) fail(`MED#4 cleanup users: ${delInactErr.message}`);
  const { error: delInactAuthErr } = await admin.auth.admin.deleteUser(inactiveUid);
  if (delInactAuthErr) fail(`MED#4 cleanup auth: ${delInactAuthErr.message}`);
  ok('cleanup: временный неактивный специалист удалён');

  console.log('\n15. Внешнее ревью MED#7 — log_activity для *_deleted после delete (is_staff bypass):');
  // 15.1 — service_role создаёт временный case (минуя all RLS).
  const { data: tempCase, error: tempCaseErr } = await admin
    .from('cases')
    .insert({
      number_title: `SMOKE-DEL-${SMOKE_RUN_ID}`,
      client_id: anyClient.id,
      responsible_id: lawyerUid,
      opened_at: '2026-05-27',
      case_type: 'civil',
      stage: 'new_request',
      priority: 'normal',
      contract_sum: 0,
    })
    .select('id')
    .single();
  if (tempCaseErr || !tempCase) fail(`MED#7 setup: ${tempCaseErr?.message}`);
  const tempCaseId = tempCase.id as string;

  // 15.2 — admin (is_staff) удаляет case → can_see_case(tempCaseId)=false после.
  const { error: tempDelErr } = await adminUser
    .from('cases').delete().eq('id', tempCaseId);
  if (tempDelErr) fail(`MED#7: admin не смог delete: ${tempDelErr.message}`);

  // 15.3 — admin log_activity 'case_deleted' ПОСЛЕ delete должен записать
  // (раньше: silent skip из-за can_see_case=false; теперь is_staff bypass).
  const { error: adminDelLogErr } = await adminUser.rpc('log_activity', {
    p_entity_type: 'case',
    p_entity_id: tempCaseId,
    p_action: 'case_deleted',
    p_changes: {
      _smoke_run: SMOKE_RUN_ID,
      _smoke_marker: 'med7-admin-del',
      number_title: `SMOKE-DEL-${SMOKE_RUN_ID}`,
    },
  });
  if (adminDelLogErr) fail(`MED#7 admin rpc: ${adminDelLogErr.message}`);
  const { data: adminDelLog } = await admin
    .from('activity_log')
    .select('id')
    .eq('changes->>_smoke_marker', 'med7-admin-del')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (!adminDelLog) {
    fail('MED#7: admin не смог записать case_deleted после delete (is_staff bypass не работает)');
  }
  ok('MED#7: admin записал case_deleted ПОСЛЕ delete entity (is_staff bypass)');

  // 15.4 — lawyer (не staff) пытается записать case_deleted — silent skip.
  // Защита: bypass работает ТОЛЬКО для is_staff, не для всех authenticated.
  const { error: lawyerDelLogErr } = await lawyer.rpc('log_activity', {
    p_entity_type: 'case',
    p_entity_id: tempCaseId,
    p_action: 'case_deleted',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'med7-lawyer-attempt' },
  });
  if (lawyerDelLogErr) {
    fail(`MED#7 lawyer rpc должен быть silent: ${lawyerDelLogErr.message}`);
  }
  const { data: lawyerDelLog } = await admin
    .from('activity_log')
    .select('id')
    .eq('changes->>_smoke_marker', 'med7-lawyer-attempt')
    .eq('changes->>_smoke_run', SMOKE_RUN_ID)
    .maybeSingle();
  if (lawyerDelLog) {
    fail('MED#7: lawyer записал case_deleted — is_staff-only bypass пробит');
  }
  ok('MED#7: lawyer не может писать case_deleted (silent skip, не staff)');

  // 15.5 — cleanup: записи MED#7 (по SMOKE_RUN_ID).
  const { error: med7CleanupErr } = await admin
    .from('activity_log')
    .delete()
    .eq('changes->>_smoke_run', SMOKE_RUN_ID);
  if (med7CleanupErr) fail(`MED#7 cleanup: ${med7CleanupErr.message}`);
  ok('cleanup: MED#7 записи удалены');

  console.log('\n16. Phase 2/A — time_entries RLS:');

  // 16.1 — lawyer создаёт entry на СВОЁ дело.
  const { data: lawyerEntry, error: lawyerEntryErr } = await lawyer
    .from('time_entries')
    .insert({
      case_id: lawyerCaseId,
      user_id: lawyerUid,
      spent_at: '2026-05-27',
      minutes: 90,
      billable: true,
      hourly_rate: 1500,
      note: 'smoke: подготовка иска',
    })
    .select('id')
    .single();
  if (lawyerEntryErr || !lawyerEntry) {
    fail(`lawyer не смог создать time_entry: ${lawyerEntryErr?.message}`);
  }
  const lawyerEntryId = lawyerEntry.id as string;
  ok('lawyer создал time_entry на своё дело');

  // 16.2 — lawyer пытается приписать user_id чужому юзеру → WITH CHECK отверг.
  const { error: forgedUserErr } = await lawyer
    .from('time_entries')
    .insert({
      case_id: lawyerCaseId,
      user_id: juristUid, // forged
      spent_at: '2026-05-27',
      minutes: 30,
    });
  if (!forgedUserErr) {
    fail('lawyer смог приписать user_id чужому юзеру — RLS дыра');
  }
  ok('lawyer не может приписать user_id чужому (WITH CHECK отверг)');

  // 16.3 — lawyer пытается создать entry на ЧУЖОЕ дело → can_write_case отверг.
  const { error: foreignCaseTimeErr } = await lawyer
    .from('time_entries')
    .insert({
      case_id: juristCaseId,
      user_id: lawyerUid,
      spent_at: '2026-05-27',
      minutes: 30,
    });
  if (!foreignCaseTimeErr) {
    fail('lawyer смог создать entry на дело jurist — RLS дыра');
  }
  ok('lawyer не может создать entry на чужое дело (can_write_case отверг)');

  // 16.4 — jurist НЕ видит time_entries lawyer (RLS SELECT через case).
  const { data: juristSeesTime } = await jurist
    .from('time_entries')
    .select('id')
    .eq('case_id', lawyerCaseId);
  if (juristSeesTime && juristSeesTime.length > 0) {
    fail(`jurist видит entries на чужом деле: ${juristSeesTime.length}`);
  }
  ok('jurist изолирован от time_entries чужого дела');

  // 16.5 — assistant видит entries на деле супервайзера (jurist) и
  //        может писать свои часы на это дело.
  const { data: assistantEntry, error: assistantEntryErr } = await assistant
    .from('time_entries')
    .insert({
      case_id: juristCaseId,
      user_id: 'assistant-uid-placeholder', // заменим ниже
      spent_at: '2026-05-27',
      minutes: 45,
      note: 'smoke: помощник логирует',
    })
    .select('id');
  // Сначала получим реальный uid ассистента, потом вставим заново.
  // (Делаем чище: сначала uid, потом insert.)
  void assistantEntry; void assistantEntryErr;
  const { data: assistantProfile } = await admin
    .from('users').select('id').eq('email', 'assistant@yur.local').single();
  const assistantUid = assistantProfile!.id as string;

  const { data: assistantEntryOk, error: assistantInsertErr } = await assistant
    .from('time_entries')
    .insert({
      case_id: juristCaseId,
      user_id: assistantUid,
      spent_at: '2026-05-27',
      minutes: 45,
      billable: false,
      note: 'smoke: помощник логирует на дело супервайзера',
    })
    .select('id')
    .single();
  if (assistantInsertErr || !assistantEntryOk) {
    fail(`assistant не смог записать entry на дело супервайзера: ${assistantInsertErr?.message}`);
  }
  const assistantEntryId = assistantEntryOk.id as string;
  ok('assistant записал entry на дело супервайзера (jurist)');

  // 16.6 — assistant ВИДИТ свой entry + entries jurist на том же деле.
  const { data: assistantVisible } = await assistant
    .from('time_entries').select('id, user_id').eq('case_id', juristCaseId);
  if (!assistantVisible || assistantVisible.length === 0) {
    fail('assistant не видит свои entries на деле супервайзера');
  }
  ok(`assistant видит ${assistantVisible.length} entries на деле супервайзера`);

  // 16.7 — lawyer обновляет СВОЙ entry → ok.
  const { error: ownUpdateErr } = await lawyer
    .from('time_entries').update({ minutes: 120, note: 'updated by self' }).eq('id', lawyerEntryId);
  if (ownUpdateErr) {
    fail(`lawyer не смог обновить свой entry: ${ownUpdateErr.message}`);
  }
  const { data: afterOwn } = await admin
    .from('time_entries').select('minutes').eq('id', lawyerEntryId).single();
  if (Number(afterOwn?.minutes) !== 120) {
    fail(`свой entry не обновился, факт: ${afterOwn?.minutes}`);
  }
  ok('lawyer обновил свой entry (60 → 120 min)');

  // 16.8 — lawyer пытается обновить entry АССИСТЕНТА → silent fail (RLS owner_or_staff).
  const { error: foreignUpdErr } = await lawyer
    .from('time_entries').update({ minutes: 1 }).eq('id', assistantEntryId);
  void foreignUpdErr; // RLS возвращает 0 rows без ошибки
  const { data: afterForeignUpd } = await admin
    .from('time_entries').select('minutes').eq('id', assistantEntryId).single();
  if (Number(afterForeignUpd?.minutes) !== 45) {
    fail(`lawyer смог обновить чужой entry, факт: ${afterForeignUpd?.minutes}`);
  }
  ok('lawyer не может обновить чужой entry (owner_or_staff отверг)');

  // 16.9 — lawyer пытается удалить entry АССИСТЕНТА → silent fail.
  const { error: foreignDelErr } = await lawyer
    .from('time_entries').delete().eq('id', assistantEntryId);
  void foreignDelErr;
  const { data: assistantStillExists } = await admin
    .from('time_entries').select('id').eq('id', assistantEntryId).maybeSingle();
  if (!assistantStillExists) {
    fail('lawyer смог удалить чужой entry');
  }
  ok('lawyer не может удалить чужой entry (owner_or_staff отверг)');

  // 16.10 — admin может удалить ЛЮБОЙ entry (is_staff bypass).
  const { error: adminDelEntryErr } = await adminUser
    .from('time_entries').delete().eq('id', assistantEntryId);
  if (adminDelEntryErr) {
    fail(`admin не смог удалить чужой entry: ${adminDelEntryErr.message}`);
  }
  ok('admin удалил entry ассистента (is_staff bypass)');

  // 16.11 — CHECK: minutes ≤ 0 → constraint reject.
  const { error: zeroMinErr } = await lawyer
    .from('time_entries')
    .insert({ case_id: lawyerCaseId, user_id: lawyerUid, spent_at: '2026-05-27', minutes: 0 });
  if (!zeroMinErr || !/minutes/i.test(zeroMinErr.message)) {
    fail(`minutes=0 должен отвергаться CHECK, факт: ${zeroMinErr?.message}`);
  }
  ok('CHECK minutes > 0 работает');

  // 16.12 — CHECK: minutes > 24*60 → reject.
  const { error: tooBigErr } = await lawyer
    .from('time_entries')
    .insert({ case_id: lawyerCaseId, user_id: lawyerUid, spent_at: '2026-05-27', minutes: 24 * 60 + 1 });
  if (!tooBigErr || !/minutes/i.test(tooBigErr.message)) {
    fail(`minutes > 24h должен отвергаться, факт: ${tooBigErr?.message}`);
  }
  ok('CHECK minutes ≤ 24h работает');

  // 16.13 — cleanup своего entry.
  const { error: cleanupLawyerEntryErr } = await admin
    .from('time_entries').delete().eq('id', lawyerEntryId);
  if (cleanupLawyerEntryErr) fail(`cleanup lawyer entry: ${cleanupLawyerEntryErr.message}`);
  ok('cleanup: lawyer entry удалён');

  console.log('\n✓ Все RLS-проверки пройдены.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
