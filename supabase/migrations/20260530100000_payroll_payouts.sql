-- Юр CRM — Учёт фактических выплат зарплаты + корректное доначисление (Задачи 1, 2, 5).
--
-- Контекст и проблемы, которые закрываем:
--   Задача 1 (критично): при on_completion строка леджера фиксировалась срезом
--     paid_total на момент закрытия и больше не пересчитывалась. Если клиент
--     доплачивал после закрытия — доплата не попадала в зарплату.
--   Задача 2 (критично): при смене lawyer_id/responsible_id строка прежнего
--     специалиста оставалась «осиротевшей» → задвоение в сводном отчёте.
--   Задача 5 (бизнес): начисление (accrued) ≠ факт выплаты (paid). Нужно явно
--     фиксировать, КТО и КОГДА отметил выплату; авто-синхронизация НИКОГДА не
--     должна сама ставить paid.
--
-- Новая модель строк леджера на дело×специалиста×роль:
--   - всегда максимум ОДНА строка status='accrued' — это ОСТАТОК к начислению
--     (target − уже выплачено). Пересчитывается под актуальный paid_total даже
--     если дело уже closed.
--   - ноль или несколько строк status='paid' — исторические факты выплат,
--     задним числом НЕ переписываются. При доплате клиента создаётся новая
--     accrued-строка на разницу (новый target минус уже выплаченное).
--   target роли = round(paid_total × эффективная ставка / 100).
--
-- Уникальность (case_id, user_id, role_in_case) СНЯТА — теперь на роль×дело
-- допустимо несколько строк (одна accrued + N paid). Целостность держим логикой
-- в private.upsert_ledger_entry / private.sync_case_ledger.

-- ========================================================================
-- 1) Снимаем unique-ограничение, добавляем учёт «кто отметил выплату»
-- ========================================================================

alter table public.payroll_ledger
  drop constraint if exists payroll_ledger_case_id_user_id_role_in_case_key;

-- Кто отметил выплату (owner/admin). NULL для accrued-строк и после отката.
alter table public.payroll_ledger
  add column paid_by uuid references public.users(id) on delete set null;

comment on column public.payroll_ledger.paid_by is
  'Кто (owner/admin) отметил строку выплаченной. NULL пока accrued или после отката. Задача 5.';

-- Частичный индекс: на дело×роль не больше одной accrued-строки. Это инвариант
-- модели (остаток к начислению — единственная активная запись), а заодно защита
-- от гонок при параллельных пересчётах.
create unique index payroll_ledger_one_accrued_idx
  on public.payroll_ledger (case_id, user_id, role_in_case)
  where status = 'accrued';

-- ========================================================================
-- 2) upsert_ledger_entry — поддержка доначислений (Задача 1)
-- ========================================================================
-- Приводит остаток к начислению (accrued) к величине target − уже выплачено:
--   - target  = round(p_base × p_percent / 100, 2);
--   - v_paid  = сумма amount всех paid-строк (case×user×role);
--   - v_rem   = target − v_paid (остаток).
-- Логика:
--   v_rem > 0  → обновить существующую accrued-строку до v_rem
--                (или вставить новую, если её нет);
--   v_rem <= 0 → удалить accrued-строку (всё уже выплачено / ставку срезали).
-- paid-строки НЕ трогаются ни при каких условиях.

create or replace function private.upsert_ledger_entry(
  p_case_id uuid,
  p_user_id uuid,
  p_role    text,
  p_base    numeric,
  p_percent numeric,
  p_actor   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target numeric(14, 2);
  v_paid   numeric(14, 2);
  v_rem    numeric(14, 2);
  v_rows   integer;
begin
  v_target := round(p_base * p_percent / 100, 2);

  -- Сколько роли уже физически выплачено по этому делу (исторические paid).
  select coalesce(sum(amount), 0)
    into v_paid
    from public.payroll_ledger
   where case_id = p_case_id
     and user_id = p_user_id
     and role_in_case = p_role
     and status = 'paid';

  v_rem := v_target - v_paid;

  if v_rem > 0 then
    -- Обновляем единственную accrued-строку под актуальный остаток…
    update public.payroll_ledger
       set base_amount = p_base,
           percent     = p_percent,
           amount      = v_rem
     where case_id = p_case_id
       and user_id = p_user_id
       and role_in_case = p_role
       and status = 'accrued';
    get diagnostics v_rows = row_count;

    -- …или создаём новую (первое начисление либо доплата после выплаты).
    if v_rows = 0 then
      insert into public.payroll_ledger
        (case_id, user_id, role_in_case, base_amount, percent, amount, created_by)
      values
        (p_case_id, p_user_id, p_role, p_base, p_percent, v_rem, p_actor);
    end if;
  else
    -- Остатка нет (всё выплачено или ставку понизили) — accrued не нужен.
    delete from public.payroll_ledger
     where case_id = p_case_id
       and user_id = p_user_id
       and role_in_case = p_role
       and status = 'accrued';
  end if;
end;
$$;

-- ========================================================================
-- 3) sync_case_ledger — пересчёт + чистка «осиротевших» строк (Задача 2)
-- ========================================================================
-- Доначисление после закрытия (Задача 1): убираем гейт «только если ещё не
-- closed» — accrued-остаток должен пересчитываться и для уже закрытого дела,
-- когда растёт paid_total. Гейт «когда вообще начислять» остаётся:
--   per_payment — всегда; on_completion — только когда дело closed.

create or replace function private.sync_case_ledger(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat    public.case_category;
  v_paid   numeric(14, 2);
  v_stage  public.case_stage;
  v_mode   public.accrual_mode;
  v_lawyer uuid;
  v_expert uuid;
  v_lo     numeric(5, 2);
  v_eo     numeric(5, 2);
  v_lp     numeric(5, 2);
  v_ep     numeric(5, 2);
  v_actor  uuid;
begin
  select category, paid_total, stage, accrual_mode, lawyer_id, responsible_id,
         lawyer_rate_override, expert_rate_override
    into v_cat, v_paid, v_stage, v_mode, v_lawyer, v_expert, v_lo, v_eo
    from public.cases
   where id = p_case_id;
  if not found then
    return;
  end if;

  -- Задача 2: удаляем accrued-строки специалистов, которые больше НЕ являются
  -- текущими lawyer_id/responsible_id (например, после переназначения). paid
  -- (фактически выплаченное) — историческая правда, её не трогаем. Делаем это
  -- независимо от режима/этапа: осиротевший accrued не должен «висеть».
  delete from public.payroll_ledger
   where case_id = p_case_id
     and status = 'accrued'
     and (
       (role_in_case = 'lawyer' and user_id is distinct from v_lawyer)
       or (role_in_case = 'expert' and user_id is distinct from v_expert)
     );

  -- Начисляем, если режим per_payment ИЛИ дело завершено. ВАЖНО (Задача 1):
  -- closed-дело тоже проходит — чтобы доплата после закрытия дописалась.
  if not (v_mode = 'per_payment' or v_stage = 'closed') then
    return;
  end if;

  select lawyer_percent, expert_percent
    into v_lp, v_ep
    from public.payroll_rates
   where category = v_cat;

  v_actor := auth.uid();  -- кто инициировал (может быть NULL для системных операций)

  perform private.upsert_ledger_entry(
    p_case_id, v_lawyer, 'lawyer', v_paid, coalesce(v_lo, v_lp), v_actor);
  perform private.upsert_ledger_entry(
    p_case_id, v_expert, 'expert', v_paid, coalesce(v_eo, v_ep), v_actor);
end;
$$;

-- Триггер cases_sync_ledger и функция-обёртка cases_sync_ledger_trigger
-- остаются прежними (создаются в 20260529130000_payroll_ledger.sql) — они уже
-- ловят нужные колонки (paid_total, stage, accrual_mode, ставки, назначения).

-- ========================================================================
-- 4) activity_log: разрешаем payroll-события (Задача 5 — пишем в журнал)
-- ========================================================================
-- Отметка выплаты / откат — финансовые действия, должны попадать в журнал дела.
-- entity_type='case', entity_id = дело строки леджера.

alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'case_created', 'case_updated', 'case_deleted', 'stage_corrected',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted'
  ));

create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_changes     jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if p_entity_type is null or p_entity_id is null or p_action is null then
    return;
  end if;

  -- allowlist actions. 'stage_corrected' специально не входит — пишется только
  -- триггером, прямой rpc с этим action = подделка → silent skip.
  if p_action not in (
    'case_created', 'case_updated', 'case_deleted',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted'
  ) then
    return;
  end if;

  -- size cap на changes — защита от спама большими jsonb-payload'ами.
  if p_changes is not null and octet_length(p_changes::text) > 8192 then
    return;
  end if;

  v_uid := private.active_uid();
  if v_uid is null then
    return;
  end if;

  if p_entity_type not in ('case', 'client') then
    return;
  end if;

  if p_entity_type = 'case' and not private.can_see_case(p_entity_id) then
    return;
  end if;

  if p_entity_type = 'client' and not private.is_staff() then
    return;
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  -- Логирование никогда не должно ломать основную операцию.
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'Шаг 10 + CSO #1 + Задача 5: SECURITY DEFINER, allowlist (+payroll_paid/payroll_reverted), size cap 8 КБ. Видимость через private.can_see_case / private.is_staff.';

-- ========================================================================
-- 5) payroll_payout_by_specialist() — сводка по леджеру (Задача 5)
-- ========================================================================
-- Разделяет суммы по сотруднику×роли: начислено всего (accrued+paid),
-- выплачено (paid), к выплате (accrued — остаток). SECURITY INVOKER → RLS
-- payroll_ledger режет строки (staff видит всё, специалист — своё).

create or replace function public.payroll_payout_by_specialist()
returns table (
  user_id      uuid,
  full_name    text,
  role_in_case text,
  total        numeric,  -- начислено всего (accrued + paid)
  paid         numeric,  -- выплачено
  outstanding  numeric   -- к выплате (остаток, status='accrued')
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.user_id,
    u.full_name,
    l.role_in_case,
    coalesce(sum(l.amount), 0)                                            as total,
    coalesce(sum(l.amount) filter (where l.status = 'paid'), 0)           as paid,
    coalesce(sum(l.amount) filter (where l.status = 'accrued'), 0)        as outstanding
  from public.payroll_ledger l
  join public.users u on u.id = l.user_id
  group by l.user_id, u.full_name, l.role_in_case
  order by outstanding desc, paid desc, u.full_name asc;
$$;

grant execute on function public.payroll_payout_by_specialist() to authenticated;

comment on function public.payroll_payout_by_specialist() is
  'Сводка по леджеру: начислено всего / выплачено / к выплате (остаток) по сотруднику×роли. SECURITY INVOKER → RLS payroll_ledger. Задача 5.';
