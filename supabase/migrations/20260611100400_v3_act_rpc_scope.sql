-- Юр CRM — v3 Сессия 1 (БД-безопасность), задача 1.5.
--
-- Две правки SECURITY DEFINER-функций актов (тела скопированы ЦЕЛИКОМ из
-- 20260610160000_case_acts.sql, изменения помечены «v3 s1»):
--
--   1) confirm_act_paid:
--      • анти-дедлок/сериализация: ранний FOR UPDATE на строке дела (тот же лок,
--        что теперь берёт recalc_case_totals и параллельное подтверждение по делу —
--        единый порядок взятия локов: акт → дело → recalc дела, без перекрёстных
--        ожиданий);
--      • скоуп: к проверке прав (owner/admin ИЛИ юрист дела) добавлена видимость дела
--        private.case_visible(lawyer_id, responsible_id) — раньше admin ЧУЖОГО
--        подразделения мог подтвердить оплату акта по делу, которого не видит.
--   2) set_act_completion: is_staff() → is_staff() AND case_visible(...) — staff правит
--      completion только по видимым ему делам (тот же скоуп подразделения).

-- ========================================================================
-- confirm_act_paid — атомарное подтверждение оплаты (со скоупом и локом дела).
-- ========================================================================
create or replace function public.confirm_act_paid(
  p_act_id            uuid,
  p_confirmed_amount  numeric,
  p_paid_at           date,
  p_storage_key       text,
  p_file_name         text,
  p_method            text default null,
  p_note              text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid;
  v_case_id     uuid;
  v_lawyer      uuid;
  v_responsible uuid;   -- v3 s1: нужен для case_visible
  v_status      text;
  v_doc_id      uuid;
  v_payment_id  uuid;
begin
  v_uid := private.active_uid();
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- v3 s1: добираем responsible_id для проверки видимости дела.
  select a.case_id, a.status, c.lawyer_id, c.responsible_id
    into v_case_id, v_status, v_lawyer, v_responsible
    from public.case_acts a
    join public.cases c on c.id = a.case_id
   where a.id = p_act_id
   for update of a;

  if v_case_id is null then
    raise exception 'act % not found', p_act_id using errcode = 'P0002';
  end if;

  -- v3 s1: ранний лок строки дела — сериализация с recalc_case_totals и с
  -- параллельным подтверждением по этому же делу (анти-дедлок, единый порядок локов).
  perform 1 from public.cases where id = v_case_id for update;

  -- Право: (lawyer этого дела ИЛИ owner/admin по роли) И дело видимо зрителю.
  -- v3 s1: добавлен case_visible — admin чужого подразделения дело не подтвердит.
  if not ((private.can_manage_users() or v_lawyer = v_uid)
          and private.case_visible(v_lawyer, v_responsible)) then
    raise exception 'insufficient privilege to confirm act' using errcode = '42501';
  end if;

  if v_status <> 'issued' then
    raise exception 'act % is not in issued status', p_act_id using errcode = 'P0001';
  end if;

  if p_confirmed_amount is null or p_confirmed_amount <= 0 then
    raise exception 'confirmed amount must be positive' using errcode = '22023';
  end if;
  if p_paid_at is null then
    raise exception 'paid_at is required' using errcode = '22023';
  end if;
  if p_storage_key is null or p_file_name is null then
    raise exception 'scan is required' using errcode = '22023';
  end if;

  -- 1) Скан → documents (doc_type='act'); атомарно с платежом.
  insert into public.documents (case_id, file_name, storage_key, doc_type, uploaded_by)
  values (v_case_id, p_file_name, p_storage_key, 'act', v_uid)
  returning id into v_doc_id;

  -- 2) Платёж по делу (триггеры пересчитают paid_total/долг; ЗП растёт сама).
  insert into public.payments (case_id, amount, paid_at, method, note, created_by, act_id)
  values (v_case_id, p_confirmed_amount, p_paid_at, p_method, p_note, v_uid, p_act_id)
  returning id into v_payment_id;

  -- 3) Акт → paid (completion — временный placeholder, нормализуется ниже; CHECK
  --    требует not null при paid).
  update public.case_acts
     set status           = 'paid',
         confirmed_amount = p_confirmed_amount,
         paid_at          = p_paid_at,
         scan_document_id = v_doc_id,
         completion       = 'partial'
   where id = p_act_id;

  -- 4) Пересчёт completion всех оплаченных актов дела (включая текущий).
  perform private.recompute_case_act_completions(v_case_id);

  -- 5) Журнал (entity_type='case' → запись попадает в историю дела).
  perform public.log_activity(
    'case', v_case_id, 'act_paid',
    jsonb_build_object('act_id', p_act_id, 'payment_id', v_payment_id, 'amount', p_confirmed_amount)
  );

  return v_payment_id;
end;
$$;

grant execute on function public.confirm_act_paid(uuid, numeric, date, text, text, text, text) to authenticated;

comment on function public.confirm_act_paid(uuid, numeric, date, text, text, text, text) is
  'Атомарно подтверждает оплату акта: проверка прав (lawyer дела / owner / admin по '
  'роли) И видимость дела (case_visible) → documents(скан) → payment(act_id) → акт paid '
  '→ пересчёт completion дела → журнал. v2 Этап 5; v3 s1: скоуп + лок дела.';

-- ========================================================================
-- set_act_completion — ручное переопределение full/partial (staff + видимость).
-- ========================================================================
create or replace function public.set_act_completion(
  p_act_id     uuid,
  p_completion text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status      text;
  v_lawyer      uuid;   -- v3 s1: для case_visible
  v_responsible uuid;   -- v3 s1: для case_visible
begin
  -- v3 s1: добираем участников дела для проверки видимости.
  select a.status, c.lawyer_id, c.responsible_id
    into v_status, v_lawyer, v_responsible
    from public.case_acts a
    join public.cases c on c.id = a.case_id
   where a.id = p_act_id;
  if v_status is null then
    raise exception 'act % not found', p_act_id using errcode = 'P0002';
  end if;

  -- v3 s1: staff И дело видимо зрителю (скоуп подразделения).
  if not (private.is_staff() and private.case_visible(v_lawyer, v_responsible)) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  if p_completion not in ('full', 'partial') then
    raise exception 'invalid completion' using errcode = '22023';
  end if;
  if v_status <> 'paid' then
    raise exception 'completion applies to paid acts only' using errcode = 'P0001';
  end if;

  update public.case_acts set completion = p_completion where id = p_act_id;
end;
$$;

grant execute on function public.set_act_completion(uuid, text) to authenticated;

comment on function public.set_act_completion(uuid, text) is
  'Ручное переопределение completion (full/partial) оплаченного акта. staff + '
  'видимость дела (case_visible). v2 Этап 5; v3 s1: скоуп подразделения.';
