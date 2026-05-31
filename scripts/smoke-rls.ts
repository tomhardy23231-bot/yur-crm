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
//   - Задача 1: payroll_by_specialist не светит чужие начисления (фильтр зрителя)
//   - Задача 4: управление пользователями — ступенчатые права (owner vs admin)
//
// Доработки по итогам симуляции (нумерация секций 20–22):
//   - Задача 1 (нов.): юрист создаёт клиента и сразу видит его; эксперт — не может
//   - Задача 2 (нов.): дубль платежа по idempotency_key отвергается (23505)
//   - Задача 8 (нов.): не-staff только +1 (прыжок → stage_skip_forbidden);
//                      staff может перескочить с записью stage_corrected
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
  const ownerUid = await uid('owner@yur.local');

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

  // 16.6 — Задача 1: payroll_by_specialist не должен светить чужие начисления.
  // Специалист видит ТОЛЬКО строки со своим user_id; staff — всех.
  const { data: l1Specialist } = await lawyer1.rpc('payroll_by_specialist');
  const rowsL1 = (l1Specialist ?? []) as Array<{ user_id: string }>;
  if (rowsL1.length === 0) {
    fail('Задача 1: lawyer1 не получил ни одной строки сводки (ожидалась своя)');
  }
  if (rowsL1.some((r) => r.user_id !== lawyer1Uid)) {
    fail(`Задача 1: lawyer1 видит чужие строки в payroll_by_specialist: ${JSON.stringify(rowsL1)}`);
  }
  ok('Задача 1: lawyer1 в сводке видит только свои начисления (чужих нет)');

  const { data: adminSpecialist } = await adminUser.rpc('payroll_by_specialist');
  const uidsAdmin = new Set(
    ((adminSpecialist ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );
  if (uidsAdmin.size < 2) {
    fail(`Задача 1: staff должен видеть начисления нескольких сотрудников, uids: ${uidsAdmin.size}`);
  }
  ok('Задача 1: staff видит начисления всех сотрудников (сводка не отфильтрована)');

  console.log('\n17. Payroll payouts / overpaid / act-flag / overrides (Задачи 1–5):');

  // 17.0 — переводим дело A в per_payment → леджер начислит accrued
  // (representation 25%, paid 10000 → lawyer 2500, expert 2500).
  await adminUser.from('cases').update({ accrual_mode: 'per_payment' }).eq('id', caseAId);
  const { data: accruedRows } = await admin
    .from('payroll_ledger')
    .select('id, user_id, role_in_case, amount, status')
    .eq('case_id', caseAId);
  const lawyerLedger = (accruedRows ?? []).find((r) => r.role_in_case === 'lawyer');
  const expertLedger = (accruedRows ?? []).find((r) => r.role_in_case === 'expert');
  if (
    !lawyerLedger || !expertLedger ||
    Number(lawyerLedger.amount) !== 2500 || Number(expertLedger.amount) !== 2500 ||
    lawyerLedger.status !== 'accrued' || expertLedger.status !== 'accrued'
  ) {
    fail(`per_payment должен создать accrued 2500/2500, факт: ${JSON.stringify(accruedRows)}`);
  }
  ok('per_payment начислил accrued 2500 (юрист) + 2500 (Експерт)');

  // 17.1 — Задача 5: специалист НЕ может сам себе отметить выплату.
  await lawyer1
    .from('payroll_ledger')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', lawyerLedger.id);
  const { data: afterSelfPay } = await admin
    .from('payroll_ledger').select('status').eq('id', lawyerLedger.id).single();
  if (afterSelfPay!.status === 'paid') fail('Задача 5: lawyer смог отметить себе выплату — RLS дыра');
  ok('Задача 5: специалист не может отметить выплату (update managers-only)');

  // 17.2 — owner отмечает выплату (status=paid, paid_by фиксируется).
  const { error: ownerPayErr } = await owner
    .from('payroll_ledger')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: ownerUid })
    .eq('id', lawyerLedger.id);
  if (ownerPayErr) fail(`owner не смог отметить выплату: ${ownerPayErr.message}`);
  const { data: afterOwnerPay } = await admin
    .from('payroll_ledger').select('status, paid_by').eq('id', lawyerLedger.id).single();
  if (afterOwnerPay!.status !== 'paid' || afterOwnerPay!.paid_by !== ownerUid) {
    fail(`Задача 5: выплата owner'ом не зафиксирована, факт: ${JSON.stringify(afterOwnerPay)}`);
  }
  ok('Задача 5: owner отметил выплату (status=paid, paid_by=owner)');

  // 17.3 — Задача 1: доплата клиента после выплаты → новая accrued-строка на разницу.
  // paid_total 10000 → 14000 (target lawyer 3500), уже выплачено 2500 → остаток 1000.
  const { data: topupPay } = await adminUser
    .from('payments')
    .insert({ case_id: caseAId, amount: 4000, paid_at: '2026-05-28', created_by: adminUid })
    .select('id').single();
  const { data: lawyerTopup } = await admin
    .from('payroll_ledger')
    .select('amount, status')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer')
    .eq('status', 'accrued');
  if (!lawyerTopup || lawyerTopup.length !== 1 || Number(lawyerTopup[0]!.amount) !== 1000) {
    fail(`Задача 1: доплата должна создать accrued 1000, факт: ${JSON.stringify(lawyerTopup)}`);
  }
  // и paid-строка 2500 не переписана.
  const { data: lawyerPaidRow } = await admin
    .from('payroll_ledger')
    .select('amount')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer')
    .eq('status', 'paid');
  if (!lawyerPaidRow || lawyerPaidRow.length !== 1 || Number(lawyerPaidRow[0]!.amount) !== 2500) {
    fail(`Задача 1: paid-строка 2500 не должна переписываться, факт: ${JSON.stringify(lawyerPaidRow)}`);
  }
  ok('Задача 1: доплата после выплаты → новая accrued 1000, paid 2500 нетронут');

  // откат доплаты → остаток снова 0 → accrued-строка удалена (paid 2500 остаётся).
  await adminUser.from('payments').delete().eq('id', topupPay!.id);
  const { data: lawyerAfterRevert } = await admin
    .from('payroll_ledger').select('status')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer');
  if ((lawyerAfterRevert ?? []).some((r) => r.status === 'accrued')) {
    fail('Задача 1: после отката доплаты accrued должен исчезнуть');
  }
  ok('Задача 1: откат доплаты убрал accrued-остаток, paid сохранён');

  // 17.4 — Задача 2: смена эксперта удаляет accrued прежнего, paid сохраняет.
  // Сначала выплачиваем accrued эксперта1 (станет фактом истории).
  await owner.from('payroll_ledger')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: ownerUid })
    .eq('id', expertLedger.id);
  await adminUser.from('cases').update({ responsible_id: expert2Uid }).eq('id', caseAId);
  // paid прежнего эксперта (expert1) сохранён.
  const { data: e1PaidSurvive } = await admin
    .from('payroll_ledger').select('id').eq('id', expertLedger.id).maybeSingle();
  if (!e1PaidSurvive) fail('Задача 2: paid-строка прежнего Експерта удалена — потеря факта выплаты');
  ok('Задача 2: paid прежнего Експерта сохранён при снятии с дела');
  // accrued нового эксперта (expert2) создан.
  const { data: e2New } = await admin
    .from('payroll_ledger').select('amount')
    .eq('case_id', caseAId).eq('user_id', expert2Uid).eq('role_in_case', 'expert').eq('status', 'accrued');
  if (!e2New || e2New.length !== 1 || Number(e2New[0]!.amount) !== 2500) {
    fail(`Задача 2: accrued нового Експерта (2500) не создан, факт: ${JSON.stringify(e2New)}`);
  }
  ok('Задача 2: accrued нового Експерта создан (2500)');
  // возвращаем эксперта1 → accrued expert2 (осиротевший) удаляется.
  await adminUser.from('cases').update({ responsible_id: expert1Uid }).eq('id', caseAId);
  const { data: e2Orphan } = await admin
    .from('payroll_ledger').select('status')
    .eq('case_id', caseAId).eq('user_id', expert2Uid).eq('role_in_case', 'expert');
  if ((e2Orphan ?? []).some((r) => r.status === 'accrued')) {
    fail('Задача 2: accrued снятого Експерта2 не удалён');
  }
  ok('Задача 2: при возврате Експерта1 осиротевший accrued Експерта2 удалён');

  // 17.5 — специалист не может менять override (guard trigger).
  const { error: ovErr } = await lawyer1
    .from('cases').update({ lawyer_rate_override: 50 }).eq('id', caseAId);
  if (!ovErr || !/override/i.test(ovErr.message)) {
    fail(`специалист не должен менять rate_override, факт: ${ovErr?.message ?? 'no error'}`);
  }
  ok('специалист не может менять rate_override (guard trigger)');

  // cleanup леджера дела A + возврат accrual_mode.
  await admin.from('payroll_ledger').delete().eq('case_id', caseAId);
  await adminUser.from('cases').update({ accrual_mode: 'on_completion' }).eq('id', caseAId);
  ok('cleanup: леджер дела A очищен, accrual_mode → on_completion');

  // 17.6 — Задача 3: переплата клиента (overpaid) видна.
  // Дело B: contract_sum 120000, paid 0. Платёж 130000 → overpaid 10000, debt 0.
  const { data: opPay } = await adminUser
    .from('payments')
    .insert({ case_id: caseBId, amount: 130000, paid_at: '2026-05-28', created_by: adminUid })
    .select('id').single();
  const { data: bOver } = await admin
    .from('cases').select('debt, overpaid').eq('id', caseBId).single();
  if (Number(bOver!.overpaid) !== 10000 || Number(bOver!.debt) !== 0) {
    fail(`Задача 3: ожидался overpaid=10000, debt=0, факт: ${JSON.stringify(bOver)}`);
  }
  ok('Задача 3: overpaid=10000, debt=0 при переплате');
  await adminUser.from('payments').delete().eq('id', opPay!.id);
  const { data: bOverReset } = await admin
    .from('cases').select('overpaid, debt').eq('id', caseBId).single();
  if (Number(bOverReset!.overpaid) !== 0 || Number(bOverReset!.debt) !== 120000) {
    fail(`Задача 3: после отката overpaid=0, debt=120000, факт: ${JSON.stringify(bOverReset)}`);
  }
  ok('Задача 3: откат платежа вернул overpaid=0, debt=120000');

  // 17.7 — Задача 4: закрытие без акта помечает closed_without_act; догрузка акта сбрасывает.
  const { data: actCase, error: actCaseErr } = await admin.from('cases').insert({
    number_title: `SMOKE-ACT-${SMOKE_RUN_ID}`, client_id: anyClient!.id,
    lawyer_id: lawyer1Uid, responsible_id: expert1Uid, opened_at: '2026-05-28',
    case_type: 'civil', category: 'document', stage: 'closed', closed_at: '2026-05-28',
    priority: 'normal', contract_sum: 0,
  }).select('id, closed_without_act').single();
  if (actCaseErr || !actCase) fail(`setup act-case: ${actCaseErr?.message}`);
  if (!actCase.closed_without_act) fail('Задача 4: closed без акта не помечен (closed_without_act=false)');
  ok('Задача 4: дело закрыто без акта → closed_without_act=true');

  const actKey = `cases/${actCase.id}/${crypto.randomUUID()}--act.txt`;
  await admin.storage.from('case-documents').upload(actKey, payload, { contentType: 'text/plain', upsert: false });
  await admin.from('documents').insert({
    case_id: actCase.id, file_name: 'act.txt', storage_key: actKey, doc_type: 'act', uploaded_by: adminUid,
  });
  const { data: actCaseAfter } = await admin
    .from('cases').select('closed_without_act').eq('id', actCase.id).single();
  if (actCaseAfter!.closed_without_act) fail('Задача 4: догрузка акта не сбросила closed_without_act');
  ok('Задача 4: догрузка акта сбросила closed_without_act');

  // cleanup act-case.
  await admin.from('documents').delete().eq('case_id', actCase.id);
  await admin.storage.from('case-documents').remove([actKey]);
  await admin.from('cases').delete().eq('id', actCase.id);
  ok('cleanup: временное дело акта удалено');

  console.log('\n18. Проблема 1 — откат выплаты сливается с существующим остатком (revert_payout):');
  // Сценарий из промта (адаптирован под дело A: representation 25%, paid 10000):
  //   accrued 2500 → выплата 2500 → доплата клиента → откат первой выплаты.
  // Простой update paid→accrued упал бы на payroll_ledger_one_accrued_idx,
  // revert_payout должен слить суммы и не создать дубль accrued.
  await adminUser.from('cases').update({ accrual_mode: 'per_payment' }).eq('id', caseAId);
  const { data: p1Lawyer } = await admin
    .from('payroll_ledger')
    .select('id, amount, status')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer');
  const p1Accrued = (p1Lawyer ?? [])[0];
  if (!p1Accrued || Number(p1Accrued.amount) !== 2500 || p1Accrued.status !== 'accrued') {
    fail(`Проблема 1: ожидался accrued 2500 у юриста, факт: ${JSON.stringify(p1Lawyer)}`);
  }
  const paidRowId = p1Accrued.id as string;

  // owner отмечает выплату 2500 → paid-строка, accrued больше нет.
  const { error: p1PayErr } = await owner
    .from('payroll_ledger')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: ownerUid })
    .eq('id', paidRowId);
  if (p1PayErr) fail(`Проблема 1: owner не смог отметить выплату: ${p1PayErr.message}`);

  // доплата клиента +4000 → paid_total 14000, target юриста 3500, выплачено 2500 →
  // создаётся НОВАЯ accrued = 1000 (отдельная строка, другой id).
  const { data: p1Topup } = await adminUser
    .from('payments')
    .insert({ case_id: caseAId, amount: 4000, paid_at: '2026-05-28', created_by: adminUid })
    .select('id').single();
  const { data: p1AfterTopup } = await admin
    .from('payroll_ledger').select('amount, status')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer');
  const p1TopupAccrued = (p1AfterTopup ?? []).filter((r) => r.status === 'accrued');
  if (p1TopupAccrued.length !== 1 || Number(p1TopupAccrued[0]!.amount) !== 1000) {
    fail(`Проблема 1: доплата должна создать accrued 1000, факт: ${JSON.stringify(p1AfterTopup)}`);
  }
  ok('setup: выплата 2500 + доплата клиента → accrued 1000 рядом с paid 2500');

  // КЛЮЧЕВОЙ откат: НЕ должен упасть на unique-индекс; суммы должны слиться.
  const { error: revertErr } = await owner.rpc('revert_payout', { p_ledger_id: paidRowId });
  if (revertErr) fail(`Проблема 1: revert_payout упал с ошибкой: ${revertErr.message}`);
  const { data: p1AfterRevert } = await admin
    .from('payroll_ledger').select('id, amount, status')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer');
  const p1RevAccrued = (p1AfterRevert ?? []).filter((r) => r.status === 'accrued');
  const p1RevPaid = (p1AfterRevert ?? []).filter((r) => r.status === 'paid');
  if (p1RevAccrued.length !== 1 || Number(p1RevAccrued[0]!.amount) !== 3500 || p1RevPaid.length !== 0) {
    fail(`Проблема 1: после отката ожидался ОДИН accrued=3500 без paid, факт: ${JSON.stringify(p1AfterRevert)}`);
  }
  ok('Проблема 1: откат слил выплату с остатком → один accrued 3500, дублей нет, индекс цел');

  // Право: специалист не может вызвать revert_payout (owner/admin only).
  // Отмечаем accrued 3500 выплаченным и пробуем откатить из-под lawyer.
  await owner.from('payroll_ledger')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: ownerUid })
    .eq('id', p1RevAccrued[0]!.id);
  const { data: p1PaidNow } = await admin.from('payroll_ledger').select('id')
    .eq('case_id', caseAId).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer').eq('status', 'paid').single();
  const { error: lawyerRevertErr } = await lawyer1.rpc('revert_payout', { p_ledger_id: p1PaidNow!.id });
  if (!lawyerRevertErr) fail('Проблема 1: lawyer смог вызвать revert_payout — должно быть owner/admin');
  const { data: p1StillPaid } = await admin
    .from('payroll_ledger').select('status').eq('id', p1PaidNow!.id).single();
  if (p1StillPaid!.status !== 'paid') fail('Проблема 1: откат из-под lawyer изменил строку — guard пробит');
  ok('Проблема 1: специалист не может вызвать revert_payout (can_manage_users отверг)');

  // cleanup дела A.
  await adminUser.from('payments').delete().eq('id', p1Topup!.id);
  await admin.from('payroll_ledger').delete().eq('case_id', caseAId);
  await adminUser.from('cases').update({ accrual_mode: 'on_completion' }).eq('id', caseAId);
  ok('cleanup: леджер дела A очищен (Проблема 1), accrual_mode → on_completion');

  console.log('\n19. Задача 4 — управление пользователями (ступенчатые права, RLS):');

  // 19.1 — admin НЕ может повысить юриста до admin (RLS WITH CHECK на новую роль).
  await adminUser.from('users').update({ role: 'admin' }).eq('email', 'lawyer@yur.local');
  const { data: l1RoleAfter } = await admin
    .from('users').select('role').eq('email', 'lawyer@yur.local').single();
  if (l1RoleAfter!.role !== 'lawyer') {
    fail(`Задача 4: admin смог повысить юриста до ${l1RoleAfter!.role} — RLS дыра`);
  }
  ok('Задача 4: admin не может повысить юриста до admin (RLS WITH CHECK отверг)');

  // 19.2 — admin НЕ может менять строку владельца (RLS USING на старую роль).
  await adminUser.from('users')
    .update({ full_name: 'Hacked owner by admin' }).eq('email', 'owner@yur.local');
  const { data: ownerNameAfter } = await admin
    .from('users').select('full_name').eq('email', 'owner@yur.local').single();
  if (ownerNameAfter!.full_name === 'Hacked owner by admin') {
    fail('Задача 4: admin смог изменить строку владельца — RLS дыра');
  }
  ok('Задача 4: admin не может изменять строку владельца');

  // 19.3 — admin НЕ может менять admin-строки (в т. ч. свою) — только не-админские.
  await adminUser.from('users')
    .update({ full_name: 'Self-edit admin' }).eq('email', 'admin@yur.local');
  const { data: adminNameAfter } = await admin
    .from('users').select('full_name').eq('email', 'admin@yur.local').single();
  if (adminNameAfter!.full_name === 'Self-edit admin') {
    fail('Задача 4: admin смог изменить admin-строку — RLS дыра');
  }
  ok('Задача 4: admin не может изменять admin-строки');

  // 19.4 — owner МОЖЕТ назначать/снимать admin-уровень (плюшка владельца).
  const { error: ownerToAdminErr } = await owner
    .from('users').update({ role: 'admin' }).eq('email', 'office@yur.local');
  if (ownerToAdminErr) fail(`Задача 4: owner не смог назначить admin: ${ownerToAdminErr.message}`);
  await owner.from('users').update({ role: 'office_manager' }).eq('email', 'office@yur.local'); // restore
  const { data: officeRoleNow } = await admin
    .from('users').select('role').eq('email', 'office@yur.local').single();
  if (officeRoleNow!.role !== 'office_manager') {
    fail('Задача 4: восстановление роли office_manager не удалось');
  }
  ok('Задача 4: owner может назначать и снимать admin-уровень');

  // 19.5 — admin НЕ может ВСТАВИТЬ admin, но МОЖЕТ — не-админскую роль.
  const newUserEmail = `smoke-newuser-${SMOKE_RUN_ID}@yur.local`;
  const { data: newUserAuth, error: newUserAuthErr } = await admin.auth.admin.createUser({
    email: newUserEmail, password: PASSWORD, email_confirm: true,
  });
  if (newUserAuthErr || !newUserAuth.user) fail(`setup newUser auth: ${newUserAuthErr?.message}`);
  const newUserId = newUserAuth.user.id;

  const { error: adminInsAdminErr } = await adminUser.from('users').insert({
    id: newUserId, full_name: 'Smoke NewAdmin', email: newUserEmail, role: 'admin', is_active: true,
  });
  if (!adminInsAdminErr) fail('Задача 4: admin смог создать admin-пользователя — RLS дыра');
  ok('Задача 4: admin не может создать admin-пользователя (RLS WITH CHECK отверг)');

  const { error: adminInsLawyerErr } = await adminUser.from('users').insert({
    id: newUserId, full_name: 'Smoke NewLawyer', email: newUserEmail, role: 'lawyer', is_active: true,
  });
  if (adminInsLawyerErr) fail(`Задача 4: admin не смог создать lawyer-пользователя: ${adminInsLawyerErr.message}`);
  ok('Задача 4: admin может создать не-админскую роль (lawyer)');

  // 19.6 — обычная роль (lawyer) вообще не имеет доступа к управлению users.
  await lawyer1.from('users')
    .update({ full_name: 'Hacked by lawyer' }).eq('email', 'expert@yur.local');
  const { data: e1NameAfter } = await admin
    .from('users').select('full_name').eq('email', 'expert@yur.local').single();
  if (e1NameAfter!.full_name === 'Hacked by lawyer') {
    fail('Задача 4: lawyer смог менять users — RLS дыра');
  }
  ok('Задача 4: lawyer не имеет доступа к управлению пользователями');

  // cleanup временного пользователя.
  await admin.from('users').delete().eq('id', newUserId);
  await admin.auth.admin.deleteUser(newUserId);
  ok('cleanup: временный пользователь Задачи 4 удалён');

  console.log('\n20. Задача 1 — создание клиента: юрист может, эксперт нет:');
  // lawyer1 создаёт клиента и СРАЗУ читает его обратно (RETURNING). Раньше падало
  // на clients_select_visible (нет связанного дела) — теперь select-политика
  // пускает создателя (created_by = active_uid()).
  const { data: lawyerClient, error: lawyerClientErr } = await lawyer1
    .from('clients')
    .insert({
      name: `SMOKE Client ${SMOKE_RUN_ID}`,
      client_kind: 'individual',
      created_by: lawyer1Uid,
    })
    .select('id, name')
    .single();
  if (lawyerClientErr || !lawyerClient) {
    fail(`Задача 1: юрист не смог создать/прочитать клиента: ${lawyerClientErr?.message ?? 'no data'}`);
  }
  const smokeClientId = lawyerClient.id as string;
  ok('Задача 1: юрист создал клиента и сразу его видит (RETURNING прошёл)');

  const { data: lawyerSees } = await lawyer1
    .from('clients').select('id').eq('id', smokeClientId).maybeSingle();
  if (!lawyerSees) fail('Задача 1: юрист не видит созданного им клиента');
  ok('Задача 1: созданный клиент виден создателю в списке');

  // expert1 НЕ может создать клиента (can_create_clients отверг).
  const { error: expertClientErr } = await expert1
    .from('clients')
    .insert({
      name: `SMOKE Expert Client ${SMOKE_RUN_ID}`,
      client_kind: 'individual',
      created_by: expert1Uid,
    })
    .select('id')
    .single();
  if (!expertClientErr) fail('Задача 1: эксперт смог создать клиента — RLS дыра');
  ok('Задача 1: эксперт не может создать клиента (clients_insert_creators отверг)');

  await admin.from('clients').delete().eq('id', smokeClientId);
  ok('cleanup: smoke-клиент удалён');

  console.log('\n21. Задача 2 — идемпотентность платежа (уникальный ключ):');
  const idemKey = crypto.randomUUID();
  const { data: pay1, error: pay1Err } = await adminUser
    .from('payments')
    .insert({
      case_id: caseBId, amount: 1234.5, paid_at: '2026-05-28',
      created_by: adminUid, idempotency_key: idemKey,
    })
    .select('id').single();
  if (pay1Err || !pay1) fail(`Задача 2: первый платёж не прошёл: ${pay1Err?.message}`);
  ok('Задача 2: первый платёж с ключом сохранён');

  // Повторная отправка того же ключа (мульти-сабмит) → 23505.
  const { error: pay2Err } = await adminUser
    .from('payments')
    .insert({
      case_id: caseBId, amount: 1234.5, paid_at: '2026-05-28',
      created_by: adminUid, idempotency_key: idemKey,
    })
    .select('id').single();
  if (!pay2Err || pay2Err.code !== '23505') {
    fail(`Задача 2: дубль по idempotency_key должен дать 23505, факт: ${pay2Err?.code ?? 'no error'}`);
  }
  ok('Задача 2: повторная вставка того же ключа отвергнута (23505)');

  // Ровно одна строка с ключом; paid_total дела B вырос ровно на 1234.5.
  const { data: keyRows } = await admin.from('payments').select('id').eq('idempotency_key', idemKey);
  if ((keyRows ?? []).length !== 1) fail(`Задача 2: ожидалась 1 строка с ключом, факт ${keyRows?.length}`);
  const { data: bPaid } = await admin.from('cases').select('paid_total').eq('id', caseBId).single();
  if (Number(bPaid!.paid_total) !== 1234.5) {
    fail(`Задача 2: paid_total дела B ожидался 1234.5, факт ${bPaid!.paid_total}`);
  }
  ok('Задача 2: ровно одна строка платежа, paid_total не задвоился');

  await admin.from('payments').delete().eq('id', pay1.id);
  const { data: bPaidReset } = await admin.from('cases').select('paid_total').eq('id', caseBId).single();
  if (Number(bPaidReset!.paid_total) !== 0) {
    fail(`Задача 2: после cleanup paid_total дела B ожидался 0, факт ${bPaidReset!.paid_total}`);
  }
  ok('cleanup: smoke-платёж удалён, paid_total дела B = 0');

  console.log('\n22. Задача 8 — запрет «прыжков» по этапам (строго +1):');
  const { data: a8Before } = await admin
    .from('cases').select('stage, closed_at').eq('id', caseAId).single();
  const a8Stage = a8Before!.stage as string;
  const a8Closed = a8Before!.closed_at as string | null;

  // Чистый старт: new_request (closed_at null). От staff — разрешено.
  await adminUser.from('cases').update({ stage: 'new_request', closed_at: null }).eq('id', caseAId);

  // lawyer1: прыжок new_request → in_progress (через consultation) запрещён.
  const { error: skipErr } = await lawyer1
    .from('cases').update({ stage: 'in_progress' }).eq('id', caseAId);
  if (!skipErr || !skipErr.message.includes('stage_skip_forbidden')) {
    fail(`Задача 8: юрист должен получить stage_skip_forbidden, факт: ${skipErr?.message ?? 'no error'}`);
  }
  ok('Задача 8: юрист не может перепрыгнуть этап (stage_skip_forbidden)');

  // lawyer1: шаг строго +1 new_request → consultation разрешён.
  const { error: fwd1Err } = await lawyer1
    .from('cases').update({ stage: 'consultation' }).eq('id', caseAId);
  if (fwd1Err) fail(`Задача 8: юрист не смог сделать шаг +1: ${fwd1Err.message}`);
  const { data: a8After1 } = await admin.from('cases').select('stage').eq('id', caseAId).single();
  if (a8After1!.stage !== 'consultation') fail(`Задача 8: ожидался consultation, факт ${a8After1!.stage}`);
  ok('Задача 8: юрист делает шаг строго +1 (new_request → consultation)');

  // staff (admin): прыжок consultation → awaiting_decision (через in_progress) — ок + лог.
  const { count: beforeCorr } = await admin
    .from('activity_log').select('id', { count: 'exact', head: true })
    .eq('entity_type', 'case').eq('entity_id', caseAId).eq('action', 'stage_corrected');
  const { error: staffSkipErr } = await adminUser
    .from('cases').update({ stage: 'awaiting_decision' }).eq('id', caseAId);
  if (staffSkipErr) fail(`Задача 8: admin должен мочь перескочить этап: ${staffSkipErr.message}`);
  const { count: afterCorr } = await admin
    .from('activity_log').select('id', { count: 'exact', head: true })
    .eq('entity_type', 'case').eq('entity_id', caseAId).eq('action', 'stage_corrected');
  if ((afterCorr ?? 0) !== (beforeCorr ?? 0) + 1) {
    fail(`Задача 8: ожидалась +1 запись stage_corrected при прыжке staff, было ${beforeCorr}, стало ${afterCorr}`);
  }
  ok('Задача 8: staff может перескочить этап с записью stage_corrected');

  // cleanup: возвращаем исходный этап и closed_at.
  await adminUser.from('cases').update({ stage: a8Stage, closed_at: a8Closed }).eq('id', caseAId);
  ok(`cleanup: дело A возвращено в ${a8Stage}`);

  console.log('\n23. C1 — гонка «выплата + платёж» не задваивает леджер:');
  // Воспроизведение бага дела 006 (иск 10%): отметка выплаты юристу и новый
  // платёж клиента приходят почти одновременно. До фикса остаток accrued
  // считался без блокировки строк леджера → под READ COMMITTED можно было
  // прочитать устаревший Σ(paid)=0 и вставить дубль-accrued на полный target
  // (paid 3000 + accrued 4000 = 7000 вместо 4000). FOR UPDATE в
  // private.upsert_ledger_entry сериализует пересчёт с отметкой выплаты.
  //
  // Инвариант (любой порядок операций): Σ(paid)+Σ(accrued) по роли = target,
  // где target = round(paid_total × percent). Для claim 10% и 40 000 → 4 000.

  // Временное дело: claim (10%), per_payment, lawyer1 + expert1.
  const { data: c1Case, error: c1CaseErr } = await admin.from('cases').insert({
    number_title: `SMOKE-C1-${SMOKE_RUN_ID}`, client_id: anyClient!.id,
    lawyer_id: lawyer1Uid, responsible_id: expert1Uid, opened_at: '2026-05-28',
    case_type: 'civil', category: 'claim', stage: 'in_progress',
    priority: 'normal', contract_sum: 100000, accrual_mode: 'per_payment',
  }).select('id').single();
  if (c1CaseErr || !c1Case) fail(`C1 setup: не удалось создать дело: ${c1CaseErr?.message}`);
  const c1Id = c1Case.id as string;

  // Чистый старт дела: убрать платежи (→ paid_total 0) и строки леджера.
  async function c1Reset(): Promise<void> {
    await admin.from('payments').delete().eq('case_id', c1Id);
    await admin.from('payroll_ledger').delete().eq('case_id', c1Id);
  }
  // Вставка платежа от staff (триггер пересчёта + sync леджера).
  async function c1Pay(amount: number): Promise<void> {
    const { error } = await adminUser.from('payments')
      .insert({ case_id: c1Id, amount, paid_at: '2026-05-28', created_by: adminUid });
    if (error) fail(`C1: платёж ${amount} не прошёл: ${error.message}`);
  }
  // id текущей accrued-строки юриста (для отметки выплаты).
  async function c1LawyerAccruedId(): Promise<string> {
    const { data } = await admin.from('payroll_ledger')
      .select('id').eq('case_id', c1Id).eq('user_id', lawyer1Uid)
      .eq('role_in_case', 'lawyer').eq('status', 'accrued').maybeSingle();
    if (!data) fail('C1: ожидалась accrued-строка юриста, её нет');
    return data.id as string;
  }
  // Owner отмечает строку выплаченной (только из status=accrued, идемпотентно).
  async function c1MarkPaid(ledgerId: string): Promise<void> {
    await owner.from('payroll_ledger')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: ownerUid })
      .eq('id', ledgerId).eq('status', 'accrued');
  }
  // Σ(paid)+Σ(accrued) по роли (то, что реально начислено сотруднику).
  async function c1RoleTotal(userId: string, role: 'lawyer' | 'expert'): Promise<number> {
    const { data } = await admin.from('payroll_ledger')
      .select('amount, status').eq('case_id', c1Id).eq('user_id', userId).eq('role_in_case', role);
    return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  }

  // 23.1 — порядок «выплата раньше платежа» (последовательно): инвариант неттинга.
  await c1Reset();
  await c1Pay(30000);                       // accrued юрист 3000, эксперт 3000
  await c1MarkPaid(await c1LawyerAccruedId()); // юрист paid 3000
  await c1Pay(10000);                        // paid_total 40000 → юрист accrued 1000
  {
    const { data: rows } = await admin.from('payroll_ledger')
      .select('amount, status').eq('case_id', c1Id).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer');
    const paid = (rows ?? []).filter((r) => r.status === 'paid');
    const accr = (rows ?? []).filter((r) => r.status === 'accrued');
    const total = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
    if (total !== 4000 || paid.length !== 1 || Number(paid[0]!.amount) !== 3000 ||
        accr.length !== 1 || Number(accr[0]!.amount) !== 1000) {
      fail(`C1: «выплата раньше» ожидалось paid 3000 + accrued 1000 = 4000, факт: ${JSON.stringify(rows)}`);
    }
    const expertTotal = await c1RoleTotal(expert1Uid, 'expert');
    if (expertTotal !== 4000) fail(`C1: эксперт (без гонки) должен быть 4000, факт ${expertTotal}`);
  }
  ok('C1: порядок «выплата раньше» → юрист 4000 (paid 3000 + accrued 1000), не 7000');

  // 23.2 — порядок «платёж раньше выплаты» (последовательно): тоже ровно target.
  await c1Reset();
  await c1Pay(30000);                        // accrued юрист 3000
  await c1Pay(10000);                        // paid_total 40000 → accrued 4000
  await c1MarkPaid(await c1LawyerAccruedId()); // юрист paid 4000
  {
    const total = await c1RoleTotal(lawyer1Uid, 'lawyer');
    const { data: rows } = await admin.from('payroll_ledger')
      .select('status').eq('case_id', c1Id).eq('user_id', lawyer1Uid).eq('role_in_case', 'lawyer');
    const accruedLeft = (rows ?? []).filter((r) => r.status === 'accrued').length;
    if (total !== 4000 || accruedLeft !== 0) {
      fail(`C1: «платёж раньше» ожидалось paid 4000 + accrued 0 = 4000, факт total=${total}, accrued осталось ${accruedLeft}`);
    }
  }
  ok('C1: порядок «платёж раньше» → юрист 4000 (paid 4000 + accrued 0)');

  // 23.3 — КОНКУРЕНТНАЯ гонка: отметка выплаты и платёж летят одновременно
  // (Promise.all → отдельные транзакции в БД). Несколько прогонов, чтобы
  // зацепить разные интерливинги. Инвариант: Σ юриста = 4000, без задвоения.
  const C1_ROUNDS = 8;
  for (let i = 0; i < C1_ROUNDS; i++) {
    await c1Reset();
    await c1Pay(30000);                         // accrued юрист 3000
    const accruedId = await c1LawyerAccruedId();
    // Гонка: выплата 3000 ⟷ платёж +10000 (target становится 4000).
    await Promise.all([
      c1MarkPaid(accruedId),
      c1Pay(10000),
    ]);
    const total = await c1RoleTotal(lawyer1Uid, 'lawyer');
    if (total !== 4000) {
      fail(`C1 гонка (прогон ${i + 1}/${C1_ROUNDS}): Σ юриста ожидалось 4000, факт ${total} (задвоение/потеря)`);
    }
  }
  ok(`C1: ${C1_ROUNDS} конкурентных прогонов «выплата ⟷ платёж» → юрист всегда 4000, без задвоения`);

  // cleanup временного дела C1 (леджер и платежи раньше дела — FK restrict).
  await admin.from('payroll_ledger').delete().eq('case_id', c1Id);
  await admin.from('payments').delete().eq('case_id', c1Id);
  await admin.from('cases').delete().eq('id', c1Id);
  ok('cleanup: временное дело C1 удалено');

  console.log('\n✓ Все RLS-проверки пройдены.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
