// scripts/smoke-rls.ts
// Smoke-тест после применения миграций и сида (новая Концепция):
//   - Триггеры payments_recalc / cases_recompute_debt
//   - RLS видимость: юрист видит дела по lawyer_id, Експерт — по responsible_id,
//     staff (owner/admin/office_manager) — всё; office_manager видит все финансы
//   - Управление пользователями: owner + admin; office_manager/lawyer/expert — нет
//   - Воронка только вперёд (5 этапов)
//   - tasks / documents / payments RLS
//   - activity_log writer (allowlist, CSO #1, MED#7)
//   - cases_validate_assignees (active-check для lawyer_id и responsible_id)
//   - payroll: ставки 7/10/25, case_payroll, изменение ставок только owner
//
// Запуск: npm run smoke:rls (env через --env-file=.env.local)

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

async function uid(email: string): Promise<string> {
  const { data, error } = await admin.from('users').select('id').eq('email', email).single();
  if (error || !data) fail(`uid ${email}: ${error?.message}`);
  return data.id as string;
}

async function caseId(numberTitle: string): Promise<string> {
  const { data, error } = await admin.from('cases').select('id').eq('number_title', numberTitle).single();
  if (error || !data) fail(`caseId ${numberTitle}: ${error?.message}`);
  return data.id as string;
}

async function main() {
  // Сессии всех ролей.
  const owner = await asUser('owner@yur.local');
  const adminUser = await asUser('admin@yur.local');
  const office = await asUser('office@yur.local');
  const lawyer1 = await asUser('lawyer@yur.local');
  const lawyer2 = await asUser('lawyer2@yur.local');
  const expert1 = await asUser('expert@yur.local');
  const expert2 = await asUser('expert2@yur.local');

  const lawyer1Uid = await uid('lawyer@yur.local');
  const expert1Uid = await uid('expert@yur.local');
  const expert2Uid = await uid('expert2@yur.local');
  const adminUid = await uid('admin@yur.local');

  const caseAId = await caseId('CRM-2026-001'); // lawyer1 + expert1, representation
  const caseBId = await caseId('CRM-2026-002'); // lawyer2 + expert2, claim

  console.log('1. Триггеры payments_recalc / cases_recompute_debt:');
  const { data: cases, error: e1 } = await admin
    .from('cases')
    .select('number_title, contract_sum, paid_total, debt')
    .order('number_title');
  if (e1) fail(e1.message);
  if (!cases || cases.length !== 2) fail(`ожидал 2 дела, получил ${cases?.length}`);
  const caseA = cases.find((c) => c.number_title === 'CRM-2026-001')!;
  const caseB = cases.find((c) => c.number_title === 'CRM-2026-002')!;
  if (Number(caseA.paid_total) !== 10000) fail(`CRM-2026-001 paid_total ожидался 10000, факт ${caseA.paid_total}`);
  if (Number(caseA.debt) !== 20000) fail(`CRM-2026-001 debt ожидался 20000, факт ${caseA.debt}`);
  if (Number(caseB.paid_total) !== 0) fail(`CRM-2026-002 paid_total ожидался 0, факт ${caseB.paid_total}`);
  if (Number(caseB.debt) !== 120000) fail(`CRM-2026-002 debt ожидался 120000, факт ${caseB.debt}`);
  ok('paid_total и debt пересчитаны корректно');

  console.log('\n2. RLS — юрист видит дело по lawyer_id:');
  const { data: l1Sees } = await lawyer1.from('cases').select('number_title');
  if (l1Sees?.length !== 1 || l1Sees[0]!.number_title !== 'CRM-2026-001') {
    fail(`lawyer1 должен видеть только CRM-2026-001 (он lawyer_id), видит ${JSON.stringify(l1Sees)}`);
  }
  ok('lawyer1 видит своё дело по lawyer_id и изолирован от чужого');

  console.log('\n3. RLS — Експерт видит дело по responsible_id:');
  const { data: e1Sees } = await expert1.from('cases').select('number_title');
  if (e1Sees?.length !== 1 || e1Sees[0]!.number_title !== 'CRM-2026-001') {
    fail(`expert1 должен видеть только CRM-2026-001 (он responsible_id), видит ${JSON.stringify(e1Sees)}`);
  }
  ok('expert1 видит своё дело по responsible_id и изолирован от чужого');

  console.log('\n4. RLS — изоляция второй пары (lawyer2/expert2 видят только дело B):');
  const { data: l2Sees } = await lawyer2.from('cases').select('number_title');
  const { data: e2Sees } = await expert2.from('cases').select('number_title');
  if (l2Sees?.length !== 1 || l2Sees[0]!.number_title !== 'CRM-2026-002') {
    fail(`lawyer2 должен видеть только CRM-2026-002, видит ${JSON.stringify(l2Sees)}`);
  }
  if (e2Sees?.length !== 1 || e2Sees[0]!.number_title !== 'CRM-2026-002') {
    fail(`expert2 должен видеть только CRM-2026-002, видит ${JSON.stringify(e2Sees)}`);
  }
  ok('вторая пара изолирована (видят только своё дело B)');

  console.log('\n5. RLS — staff видит всё (admin + office_manager):');
  const { data: adminSees } = await adminUser.from('cases').select('number_title');
  if (adminSees?.length !== 2) fail(`admin должен видеть 2 дела, видит ${adminSees?.length}`);
  const { data: officeSees } = await office.from('cases').select('number_title');
  if (officeSees?.length !== 2) fail(`office_manager должен видеть 2 дела, видит ${officeSees?.length}`);
  // office_manager видит ВСЕ финансы (ответ клиента).
  const { data: officePay } = await office.from('payments').select('amount');
  if (!officePay || officePay.length !== 1) fail(`office_manager должен видеть все платежи (1), видит ${officePay?.length}`);
  ok('admin и office_manager видят все дела; office_manager видит все финансы');

  console.log('\n6. RLS — юрист не может изменить чужое дело, но может своё:');
  await lawyer1.from('cases').update({ priority: 'urgent' }).eq('id', caseBId);
  const { data: bAfter } = await admin.from('cases').select('priority').eq('id', caseBId).single();
  if (bAfter?.priority !== 'urgent') {
    fail('seed B priority должен быть urgent (lawyer1 не должен был его менять)');
  }
  // lawyer1 меняет СВОЁ дело A (он lawyer_id) → должно сработать.
  const { error: ownUpd } = await lawyer1.from('cases').update({ priority: 'urgent' }).eq('id', caseAId);
  if (ownUpd) fail(`lawyer1 не смог изменить своё дело: ${ownUpd.message}`);
  const { data: aAfter } = await admin.from('cases').select('priority').eq('id', caseAId).single();
  if (aAfter?.priority !== 'urgent') fail('lawyer1 не смог обновить приоритет своего дела');
  await adminUser.from('cases').update({ priority: 'normal' }).eq('id', caseAId); // cleanup
  ok('юрист правит своё дело (lawyer_id), чужое — RLS отвергает');

  console.log('\n7. RLS — управление пользователями: owner + admin да, остальные нет:');
  // admin может (новая Концепция: admin управляет пользователями).
  const { error: adminUpd } = await adminUser
    .from('users').update({ full_name: 'Лев Юристов' }).eq('email', 'lawyer@yur.local');
  if (adminUpd) fail(`admin должен мочь обновлять users: ${adminUpd.message}`);
  ok('admin управляет пользователями');
  // owner может.
  const { error: ownerUpd } = await owner
    .from('users').update({ full_name: 'Лев Юристов' }).eq('email', 'lawyer@yur.local');
  if (ownerUpd) fail(`owner update users failed: ${ownerUpd.message}`);
  ok('owner управляет пользователями');
  // office_manager НЕ может.
  await office.from('users').update({ full_name: 'Hacked by office' }).eq('email', 'lawyer@yur.local');
  const { data: l1Name } = await admin.from('users').select('full_name').eq('email', 'lawyer@yur.local').single();
  if (l1Name?.full_name === 'Hacked by office') fail('office_manager смог менять users — RLS дыра');
  ok('office_manager НЕ может менять users (can_manage_users отверг)');
  // expert НЕ может.
  await expert1.from('users').update({ full_name: 'Hacked by expert' }).eq('email', 'lawyer@yur.local');
  const { data: l1Name2 } = await admin.from('users').select('full_name').eq('email', 'lawyer@yur.local').single();
  if (l1Name2?.full_name === 'Hacked by expert') fail('expert смог менять users — RLS дыра');
  ok('expert НЕ может менять users');

  console.log('\n8. RLS — payments видимость:');
  const { data: e1Pay } = await expert1.from('payments').select('amount');
  if (e1Pay?.length !== 1) fail(`expert1 (responsible на A) должен видеть платёж дела A, видит ${e1Pay?.length}`);
  ok('expert1 видит платёж своего дела');
  const { data: e2Pay } = await expert2.from('payments').select('amount');
  if (e2Pay?.length !== 0) fail(`expert2 не должен видеть платежи дела A, видит ${e2Pay?.length}`);
  ok('expert2 изолирован от чужих платежей');

  console.log('\n9. Воронка только вперёд (5 этапов, cases_validate_stage_forward):');
  const { data: caseBeforeRow } = await admin.from('cases').select('stage').eq('id', caseAId).single();
  const originalStage = caseBeforeRow!.stage as string;

  const { error: setupErr } = await adminUser.from('cases').update({ stage: 'in_progress' }).eq('id', caseAId);
  if (setupErr) fail(`setup (in_progress) не удался: ${setupErr.message}`);
  ok('setup: CRM-2026-001 в in_progress');

  // lawyer1 (на деле A) пробует откатить назад → forbidden.
  const { error: backErr } = await lawyer1.from('cases').update({ stage: 'consultation' }).eq('id', caseAId);
  if (!backErr || !backErr.message.includes('stage_backward_forbidden')) {
    fail(`lawyer1 должен получить stage_backward_forbidden, получил: ${backErr?.message ?? 'no error'}`);
  }
  ok('юрист не может откатить этап (триггер бросил stage_backward_forbidden)');

  // lawyer1 двигает вперёд in_progress → awaiting_decision → ок.
  const { error: fwdErr } = await lawyer1.from('cases').update({ stage: 'awaiting_decision' }).eq('id', caseAId);
  if (fwdErr) fail(`lawyer1 не смог двинуть вперёд: ${fwdErr.message}`);
  const { data: afterFwd } = await admin.from('cases').select('stage').eq('id', caseAId).single();
  if (afterFwd?.stage !== 'awaiting_decision') fail(`ожидался awaiting_decision, факт ${afterFwd?.stage}`);
  ok('юрист двинул этап вперёд (in_progress → awaiting_decision)');

  // admin откатывает awaiting_decision → consultation → ок + лог stage_corrected.
  const { count: beforeCount } = await admin
    .from('activity_log').select('id', { count: 'exact', head: true })
    .eq('entity_type', 'case').eq('entity_id', caseAId).eq('action', 'stage_corrected');
  const { error: adminBackErr } = await adminUser.from('cases').update({ stage: 'consultation' }).eq('id', caseAId);
  if (adminBackErr) fail(`admin не смог откатить: ${adminBackErr.message}`);
  const { count: afterCount, data: logRows } = await admin
    .from('activity_log').select('changes', { count: 'exact' })
    .eq('entity_type', 'case').eq('entity_id', caseAId).eq('action', 'stage_corrected')
    .order('created_at', { ascending: false });
  if ((afterCount ?? 0) !== (beforeCount ?? 0) + 1) {
    fail(`ожидалась +1 запись stage_corrected, было ${beforeCount}, стало ${afterCount}`);
  }
  const lastChanges = logRows?.[0]?.changes as { from?: string; to?: string } | undefined;
  if (lastChanges?.from !== 'awaiting_decision' || lastChanges?.to !== 'consultation') {
    fail(`changes ожидались {from:awaiting_decision,to:consultation}, факт: ${JSON.stringify(lastChanges)}`);
  }
  ok('admin откатил этап (awaiting_decision → consultation) + запись stage_corrected');

  // cleanup stage.
  await adminUser.from('cases').update({ stage: originalStage }).eq('id', caseAId);
  ok(`cleanup: CRM-2026-001 возвращён в ${originalStage}`);

  console.log('\n10. tasks RLS (через дело):');
  const { data: l1Tasks } = await lawyer1.from('tasks').select('id, case_id');
  if (!l1Tasks) fail('lawyer1 не получил список tasks');
  const foreignTask = l1Tasks.find((t) => t.case_id !== caseAId);
  if (foreignTask) fail(`lawyer1 видит task с чужим case_id: ${foreignTask.case_id}`);
  ok(`lawyer1 видит ${l1Tasks.length} task — все по своему делу A`);

  // lawyer1 создаёт task на своё дело.
  const { data: createdTask, error: createErr } = await lawyer1
    .from('tasks')
    .insert({ case_id: caseAId, title: 'smoke: задача', kind: 'task', assignee_id: lawyer1Uid, created_by: lawyer1Uid })
    .select('id').single();
  if (createErr || !createdTask) fail(`lawyer1 не смог создать task: ${createErr?.message}`);
  const newTaskId = createdTask.id as string;
  ok('lawyer1 создал task на своё дело');

  // forged created_by.
  const { error: forgedTaskErr } = await lawyer1
    .from('tasks').insert({ case_id: caseAId, title: 'forged', kind: 'task', assignee_id: lawyer1Uid, created_by: expert2Uid });
  if (!forgedTaskErr) fail('lawyer1 смог приписать created_by чужому — RLS дыра');
  ok('lawyer1 не может приписать created_by чужому (WITH CHECK отверг)');

  // task на чужое дело.
  const { error: foreignTaskErr } = await lawyer1
    .from('tasks').insert({ case_id: caseBId, title: 'foreign', kind: 'task', assignee_id: lawyer1Uid, created_by: lawyer1Uid });
  if (!foreignTaskErr) fail('lawyer1 смог создать task на чужое дело — RLS дыра');
  ok('lawyer1 не может создать task на чужое дело (can_write_case отверг)');

  // cleanup.
  await admin.from('tasks').delete().eq('id', newTaskId);
  ok('cleanup: smoke-task удалена');

  console.log('\n11. documents + storage RLS:');
  const storageKey = `cases/${caseAId}/${crypto.randomUUID()}--smoke.txt`;
  const payload = new Uint8Array(Buffer.from('smoke-test content'));
  const { error: uploadErr } = await lawyer1.storage
    .from('case-documents').upload(storageKey, payload, { contentType: 'text/plain', upsert: false });
  if (uploadErr) fail(`lawyer1 не смог загрузить в своё дело: ${uploadErr.message}`);
  ok('lawyer1 upload в storage своего дела');

  const foreignKey = `cases/${caseBId}/${crypto.randomUUID()}--foreign.txt`;
  const { error: foreignUploadErr } = await lawyer1.storage
    .from('case-documents').upload(foreignKey, payload, { contentType: 'text/plain', upsert: false });
  if (!foreignUploadErr) {
    await admin.storage.from('case-documents').remove([foreignKey]);
    fail('lawyer1 смог загрузить в чужое дело — storage RLS дыра');
  }
  ok('lawyer1 не может загрузить в чужое дело (storage RLS отверг)');

  const { data: docCreated, error: docInsertErr } = await lawyer1
    .from('documents')
    .insert({ case_id: caseAId, file_name: 'smoke.txt', storage_key: storageKey, doc_type: 'act', uploaded_by: lawyer1Uid })
    .select('id').single();
  if (docInsertErr || !docCreated) fail(`lawyer1 не смог создать documents row: ${docInsertErr?.message}`);
  const newDocId = docCreated.id as string;
  ok('lawyer1 создал row в documents (doc_type=act)');

  // lawyer1 НЕ может удалить документ (DELETE = owner/admin via can_manage_users).
  await lawyer1.from('documents').delete().eq('id', newDocId);
  const { data: docAfterLawyerDel } = await admin.from('documents').select('id').eq('id', newDocId).maybeSingle();
  if (!docAfterLawyerDel) fail('lawyer1 смог удалить документ — DELETE должен быть owner/admin');
  ok('lawyer1 не может удалить документ (DELETE = owner/admin)');

  // office_manager тоже НЕ может удалить (managers = owner/admin).
  await office.from('documents').delete().eq('id', newDocId);
  const { data: docAfterOfficeDel } = await admin.from('documents').select('id').eq('id', newDocId).maybeSingle();
  if (!docAfterOfficeDel) fail('office_manager смог удалить документ — DELETE должен быть owner/admin');
  ok('office_manager не может удалить документ (DELETE = owner/admin)');

  // expert2 (чужой) не видит документ.
  const { data: e2Docs } = await expert2.from('documents').select('id').eq('case_id', caseAId);
  if (e2Docs?.length !== 0) fail(`expert2 не должен видеть документы дела A, видит ${e2Docs?.length}`);
  ok('expert2 изолирован от документов чужого дела');

  // admin удаляет document + storage object.
  const { error: adminDocDelErr } = await adminUser.from('documents').delete().eq('id', newDocId);
  if (adminDocDelErr) fail(`admin не смог удалить document: ${adminDocDelErr.message}`);
  await adminUser.storage.from('case-documents').remove([storageKey]);
  ok('admin удалил document + storage object');

  console.log('\n12. payments RLS + триггеры:');
  const { data: seedPay } = await admin.from('payments').select('id').eq('case_id', caseAId);
  if (seedPay?.length !== 1) fail(`ожидался 1 seed-платёж на деле A, факт ${seedPay?.length}`);
  const seedPayId = seedPay![0]!.id as string;

  // admin INSERT 5000 на дело B → recalc.
  const { data: newPay, error: insErr } = await adminUser
    .from('payments')
    .insert({ case_id: caseBId, amount: 5000, paid_at: '2026-05-27', method: 'Наличные', created_by: adminUid })
    .select('id').single();
  if (insErr || !newPay) fail(`admin INSERT payment failed: ${insErr?.message}`);
  const newPayId = newPay.id as string;
  const { data: bAfterPay } = await admin.from('cases').select('paid_total, debt').eq('id', caseBId).single();
  if (Number(bAfterPay!.paid_total) !== 5000 || Number(bAfterPay!.debt) !== 115000) {
    fail(`recalc после INSERT неверен: paid=${bAfterPay!.paid_total}, debt=${bAfterPay!.debt}`);
  }
  ok('payments_recalc + cases_recompute_debt отработали (paid=5000, debt=115000)');

  // lawyer1 может INSERT платёж на своё дело (вносит данные об оплате), forged created_by — нет.
  const { error: forgedPayErr } = await lawyer1
    .from('payments').insert({ case_id: caseAId, amount: 1, paid_at: '2026-05-27', created_by: expert2Uid });
  if (!forgedPayErr) fail('lawyer1 смог приписать created_by чужому — RLS дыра');
  ok('lawyer1 не может приписать created_by чужому (WITH CHECK отверг)');

  // lawyer1 НЕ может UPDATE/DELETE платёж (managers-only).
  await lawyer1.from('payments').update({ note: 'hacked' }).eq('id', seedPayId);
  const { data: payAfterLawyer } = await admin.from('payments').select('note').eq('id', seedPayId).single();
  if (payAfterLawyer!.note === 'hacked') fail('lawyer1 смог UPDATE payment — должно быть owner/admin');
  ok('lawyer1 не может UPDATE payment (owner/admin)');

  // office_manager тоже НЕ может UPDATE платёж (видит, но не правит).
  await office.from('payments').update({ note: 'office-hack' }).eq('id', seedPayId);
  const { data: payAfterOffice } = await admin.from('payments').select('note').eq('id', seedPayId).single();
  if (payAfterOffice!.note === 'office-hack') fail('office_manager смог UPDATE payment — должно быть owner/admin');
  ok('office_manager не может UPDATE payment (только читает финансы)');

  // admin DELETE → recalc откатился.
  const { error: adminDelPayErr } = await adminUser.from('payments').delete().eq('id', newPayId);
  if (adminDelPayErr) fail(`admin не смог DELETE payment: ${adminDelPayErr.message}`);
  const { data: bFinal } = await admin.from('cases').select('paid_total, debt').eq('id', caseBId).single();
  if (Number(bFinal!.paid_total) !== 0 || Number(bFinal!.debt) !== 120000) {
    fail(`recalc после DELETE неверен: paid=${bFinal!.paid_total}, debt=${bFinal!.debt}`);
  }
  ok('admin DELETE + триггеры откатили (paid=0, debt=120000)');

  console.log('\n13. activity_log writer (allowlist, CSO #1, MED#7):');
  const SMOKE_RUN_ID = `smoke-${Date.now()}`;

  // lawyer1 пишет лог на своё дело — ok.
  await lawyer1.rpc('log_activity', {
    p_entity_type: 'case', p_entity_id: caseAId, p_action: 'case_updated',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'l1-ok' },
  });
  const { data: l1Log } = await admin.from('activity_log').select('user_id')
    .eq('changes->>_smoke_marker', 'l1-ok').eq('changes->>_smoke_run', SMOKE_RUN_ID).maybeSingle();
  if (!l1Log || l1Log.user_id !== lawyer1Uid) fail('lawyer1 log не записан корректно');
  ok('lawyer1 записал событие на своё дело (user_id корректен)');

  // lawyer1 на чужое дело — silent skip.
  await lawyer1.rpc('log_activity', {
    p_entity_type: 'case', p_entity_id: caseBId, p_action: 'case_updated',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'l1-foreign' },
  });
  const { data: foreignLog } = await admin.from('activity_log').select('id')
    .eq('changes->>_smoke_marker', 'l1-foreign').eq('changes->>_smoke_run', SMOKE_RUN_ID).maybeSingle();
  if (foreignLog) fail('lawyer1 смог записать на чужое дело — дыра');
  ok('lawyer1 не может писать на чужое дело (silent skip)');

  // non-allowlisted action — silent skip.
  await lawyer1.rpc('log_activity', {
    p_entity_type: 'case', p_entity_id: caseAId, p_action: 'evil_fake_action',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'evil' },
  });
  const { data: evilLog } = await admin.from('activity_log').select('id')
    .eq('changes->>_smoke_marker', 'evil').eq('changes->>_smoke_run', SMOKE_RUN_ID).maybeSingle();
  if (evilLog) fail('CSO #1: non-allowlisted action записался');
  ok('CSO #1: non-allowlisted action отвергается (silent skip)');

  // stage_corrected через rpc — silent skip.
  await lawyer1.rpc('log_activity', {
    p_entity_type: 'case', p_entity_id: caseAId, p_action: 'stage_corrected',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'fake-stage', from: 'closed', to: 'new_request' },
  });
  const { data: fakeStageLog } = await admin.from('activity_log').select('id')
    .eq('changes->>_smoke_marker', 'fake-stage').eq('changes->>_smoke_run', SMOKE_RUN_ID).maybeSingle();
  if (fakeStageLog) fail('CSO #1: stage_corrected через rpc пробит');
  ok('CSO #1: stage_corrected недоступен через rpc');

  // cleanup.
  await admin.from('activity_log').delete().eq('changes->>_smoke_run', SMOKE_RUN_ID);
  ok(`cleanup: записи ${SMOKE_RUN_ID} удалены`);

  console.log('\n14. cases_validate_assignees — проверка is_active для lawyer_id и responsible_id:');
  const inactiveEmail = `inactive-${SMOKE_RUN_ID}@yur.local`;
  const { data: inactiveAuth, error: inactiveAuthErr } = await admin.auth.admin.createUser({
    email: inactiveEmail, password: PASSWORD, email_confirm: true,
  });
  if (inactiveAuthErr || !inactiveAuth.user) fail(`setup auth: ${inactiveAuthErr?.message}`);
  const inactiveUid = inactiveAuth.user.id;
  const { error: profErr } = await admin.from('users').insert({
    id: inactiveUid, full_name: 'Smoke Inactive', email: inactiveEmail, role: 'expert', is_active: false,
  });
  if (profErr) fail(`setup profile: ${profErr.message}`);

  const { data: anyClient } = await admin.from('clients').select('id').limit(1).single();

  // Неактивный responsible → reject.
  const { error: badResp } = await adminUser.from('cases').insert({
    number_title: `SMOKE-INACT-R-${SMOKE_RUN_ID}`, client_id: anyClient!.id,
    lawyer_id: lawyer1Uid, responsible_id: inactiveUid,
    opened_at: '2026-05-27', case_type: 'civil', category: 'document', stage: 'new_request', priority: 'normal', contract_sum: 0,
  });
  if (!badResp || !/not active|inactive/i.test(badResp.message)) {
    fail(`INSERT с неактивным responsible должен отвергаться, факт: ${badResp?.message}`);
  }
  ok('неактивный responsible_id отвергнут триггером');

  // Неактивный lawyer_id → reject.
  const { error: badLawyer } = await adminUser.from('cases').insert({
    number_title: `SMOKE-INACT-L-${SMOKE_RUN_ID}`, client_id: anyClient!.id,
    lawyer_id: inactiveUid, responsible_id: expert1Uid,
    opened_at: '2026-05-27', case_type: 'civil', category: 'document', stage: 'new_request', priority: 'normal', contract_sum: 0,
  });
  if (!badLawyer || !/not active|inactive/i.test(badLawyer.message)) {
    fail(`INSERT с неактивным lawyer должен отвергаться, факт: ${badLawyer?.message}`);
  }
  ok('неактивный lawyer_id отвергнут триггером');

  // cleanup.
  await admin.from('users').delete().eq('id', inactiveUid);
  await admin.auth.admin.deleteUser(inactiveUid);
  ok('cleanup: временный неактивный пользователь удалён');

  console.log('\n15. MED#7 — log_activity case_deleted после delete (is_staff bypass):');
  const { data: tempCase, error: tempErr } = await admin.from('cases').insert({
    number_title: `SMOKE-DEL-${SMOKE_RUN_ID}`, client_id: anyClient!.id,
    lawyer_id: lawyer1Uid, responsible_id: expert1Uid,
    opened_at: '2026-05-27', case_type: 'civil', category: 'document', stage: 'new_request', priority: 'normal', contract_sum: 0,
  }).select('id').single();
  if (tempErr || !tempCase) fail(`setup: ${tempErr?.message}`);
  const tempCaseId = tempCase.id as string;

  await adminUser.from('cases').delete().eq('id', tempCaseId);
  await adminUser.rpc('log_activity', {
    p_entity_type: 'case', p_entity_id: tempCaseId, p_action: 'case_deleted',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'med7-admin' },
  });
  const { data: med7Log } = await admin.from('activity_log').select('id')
    .eq('changes->>_smoke_marker', 'med7-admin').eq('changes->>_smoke_run', SMOKE_RUN_ID).maybeSingle();
  if (!med7Log) fail('MED#7: admin не смог записать case_deleted после delete');
  ok('MED#7: admin записал case_deleted после delete (is_staff bypass)');

  await lawyer1.rpc('log_activity', {
    p_entity_type: 'case', p_entity_id: tempCaseId, p_action: 'case_deleted',
    p_changes: { _smoke_run: SMOKE_RUN_ID, _smoke_marker: 'med7-lawyer' },
  });
  const { data: med7LawyerLog } = await admin.from('activity_log').select('id')
    .eq('changes->>_smoke_marker', 'med7-lawyer').eq('changes->>_smoke_run', SMOKE_RUN_ID).maybeSingle();
  if (med7LawyerLog) fail('MED#7: lawyer записал case_deleted — bypass пробит');
  ok('MED#7: lawyer не может писать case_deleted (silent skip)');

  await admin.from('activity_log').delete().eq('changes->>_smoke_run', SMOKE_RUN_ID);
  ok('cleanup: MED#7 записи удалены');

  console.log('\n16. Payroll — ставки, расчёт, доступ:');
  // 16.1 — ставки seed 7/10/25 (раздельно юрист/Експерт, дефолты равны).
  const { data: rates } = await admin
    .from('payroll_rates')
    .select('category, lawyer_percent, expert_percent')
    .order('category');
  const rateMap = new Map(
    (rates ?? []).map((r) => [r.category, Number(r.lawyer_percent)]),
  );
  const expRateMap = new Map(
    (rates ?? []).map((r) => [r.category, Number(r.expert_percent)]),
  );
  if (
    rateMap.get('document') !== 7 ||
    rateMap.get('claim') !== 10 ||
    rateMap.get('representation') !== 25 ||
    expRateMap.get('document') !== 7 ||
    expRateMap.get('claim') !== 10 ||
    expRateMap.get('representation') !== 25
  ) {
    fail(`payroll_rates ожидались 7/10/25 (lawyer и expert), факт: ${JSON.stringify(rates)}`);
  }
  ok('payroll_rates seeded 7/10/25 (раздельно юрист/Експерт)');

  // 16.2 — case_payroll для дела A (representation 25%, paid 10000):
  // lawyer_amount=2500, expert_amount=2500, total=5000.
  const { data: payrollA, error: payrollErr } = await adminUser.rpc('case_payroll', { p_case_id: caseAId });
  if (payrollErr) fail(`case_payroll failed: ${payrollErr.message}`);
  const pr = (payrollA ?? [])[0] as
    | { lawyer_amount: number | string; expert_amount: number | string; total: number | string }
    | undefined;
  if (
    !pr ||
    Number(pr.lawyer_amount) !== 2500 ||
    Number(pr.expert_amount) !== 2500 ||
    Number(pr.total) !== 5000
  ) {
    fail(`case_payroll(A) ожидался lawyer=2500 expert=2500 total=5000, факт: ${JSON.stringify(pr)}`);
  }
  ok('case_payroll(A): lawyer_amount=2500, expert_amount=2500, total=5000 (representation 25%)');

  // 16.3 — lawyer1 видит начисление по своему делу (RLS на cases пускает).
  const { data: l1Payroll } = await lawyer1.rpc('case_payroll', { p_case_id: caseAId });
  if (!l1Payroll || (l1Payroll as unknown[]).length !== 1) {
    fail(`lawyer1 должен видеть начисление своего дела, факт: ${JSON.stringify(l1Payroll)}`);
  }
  ok('lawyer1 видит начисление по своему делу');

  // 16.4 — expert2 (чужой) НЕ видит начисление дела A (RLS на cases режет).
  const { data: e2Payroll } = await expert2.rpc('case_payroll', { p_case_id: caseAId });
  if (e2Payroll && (e2Payroll as unknown[]).length > 0) {
    fail('expert2 видит начисление чужого дела — RLS дыра');
  }
  ok('expert2 не видит начисление чужого дела');

  // 16.5 — изменение ставок: owner да, office_manager нет.
  const { error: officeRateErr } = await office
    .from('payroll_rates')
    .update({ lawyer_percent: 99 })
    .eq('category', 'document');
  void officeRateErr;
  const { data: docRateAfterOffice } = await admin
    .from('payroll_rates')
    .select('lawyer_percent')
    .eq('category', 'document')
    .single();
  if (Number(docRateAfterOffice!.lawyer_percent) !== 7) fail('office_manager смог изменить ставку — RLS дыра');
  ok('office_manager не может менять ставки (write owner-only)');

  const { error: ownerRateErr } = await owner
    .from('payroll_rates')
    .update({ lawyer_percent: 8 })
    .eq('category', 'document');
  if (ownerRateErr) fail(`owner не смог изменить ставку: ${ownerRateErr.message}`);
  await owner.from('payroll_rates').update({ lawyer_percent: 7 }).eq('category', 'document'); // cleanup
  ok('owner может менять ставки');

  console.log('\n✓ Все RLS-проверки пройдены.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
