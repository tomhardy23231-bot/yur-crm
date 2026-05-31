-- Юр CRM — Атомарный откат выплаты со слиянием в остаток (Проблема 1, критично).
--
-- Баг: revertLedgerPaidAction откатывал строку простым update paid → accrued,
--   не учитывая, что по той же (case_id, user_id, role_in_case) уже может
--   существовать ДРУГАЯ accrued-строка (остаток после доплаты клиента). Тогда на
--   роль×дело возникали ДВЕ accrued-строки → нарушение частичного уникального
--   индекса payroll_ledger_one_accrued_idx → откат падал с непонятной ошибкой.
--
-- Воспроизведение:
--   1) Дело «иск» 10%, оплачено 60 000 → у эксперта accrued = 6 000.
--   2) Owner отмечает выплаченной → paid = 6 000, accrued больше нет.
--   3) Клиент доплачивает 40 000 (paid_total = 100 000). Триггер: target = 10 000,
--      уже выплачено 6 000 → создаётся новая accrued = 4 000.
--   4) Owner откатывает первую выплату (6 000) → две accrued (6 000 и 4 000) →
--      нарушение индекса.
--
-- Решение: public.revert_payout(p_ledger_id) — одна транзакция (SECURITY DEFINER):
--   - проверяет, что строка существует и имеет status='paid';
--   - права только owner/admin (private.can_manage_users()), иначе исключение;
--   - если по роли×делу уже есть accrued-строка — СЛИВАЕТ: прибавляет сумму
--     откатываемой строки к существующей accrued и удаляет исходную paid-строку
--     (второй accrued не создаётся → индекс цел);
--   - если accrued-строки нет — переводит paid-строку обратно в accrued, сбрасывая
--     paid_at / paid_by;
--   - в конце вызывает private.sync_case_ledger(case_id) — приводит остаток к
--     инварианту «accrued = target − выплачено» под актуальный paid_total/ставку
--     (надёжнее ручной арифметики). Слияние выше делает функцию money-safe и в том
--     случае, когда sync по режиму/этапу пропускает пересчёт.

create or replace function public.revert_payout(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case     uuid;
  v_user     uuid;
  v_role     text;
  v_amount   numeric(14, 2);
  v_status   text;
  v_existing uuid;
begin
  -- Права: откат — финансовая/деструктивная операция, только owner/admin.
  if not private.can_manage_users() then
    raise exception 'revert_payout: insufficient privileges'
      using errcode = '42501';
  end if;

  -- Снимок откатываемой строки + блокировка от гонок.
  select case_id, user_id, role_in_case, amount, status
    into v_case, v_user, v_role, v_amount, v_status
    from public.payroll_ledger
   where id = p_ledger_id
   for update;

  if not found then
    raise exception 'revert_payout: ledger row % not found', p_ledger_id
      using errcode = 'P0002';
  end if;

  if v_status <> 'paid' then
    raise exception 'revert_payout: row % is not paid (status=%)', p_ledger_id, v_status
      using errcode = 'P0001';
  end if;

  -- Уже есть accrued-остаток по этой роли×делу?
  select id
    into v_existing
    from public.payroll_ledger
   where case_id = v_case
     and user_id = v_user
     and role_in_case = v_role
     and status = 'accrued'
   for update;

  if v_existing is not null then
    -- Слияние: возвращаемую сумму прибавляем к существующему остатку, а исходную
    -- paid-строку удаляем — иначе получилось бы две accrued → нарушение индекса.
    update public.payroll_ledger
       set amount = amount + v_amount
     where id = v_existing;

    delete from public.payroll_ledger
     where id = p_ledger_id;
  else
    -- Остатка нет — переводим paid-строку обратно в accrued.
    update public.payroll_ledger
       set status  = 'accrued',
           paid_at = null,
           paid_by = null
     where id = p_ledger_id;
  end if;

  -- Приводим остаток к target − выплачено (надёжнее ручной арифметики; безопасно
  -- даже при изменившихся paid_total/ставке). Если режим/этап не велит начислять,
  -- sync — no-op, и корректный результат уже обеспечен слиянием выше.
  perform private.sync_case_ledger(v_case);
end;
$$;

grant execute on function public.revert_payout(uuid) to authenticated;

comment on function public.revert_payout(uuid) is
  'Атомарный откат выплаты paid → accrued со слиянием в существующий остаток '
  '(защита от дублей accrued / нарушения payroll_ledger_one_accrued_idx). '
  'Права owner/admin (private.can_manage_users). Проблема 1.';

-- ========================================================================
-- Регрессия log_activity: восстанавливаем MED#7-ветку (is_staff bypass для
-- *_deleted), потерянную при переопределении функции в 20260530100000.
-- ========================================================================
-- Контекст: 20260527150000 (MED#7) добавил пропуск can_see_case для
-- 'case_deleted'/'client_deleted' (после delete строки уже нет → can_see_case
-- = false → лог молча терялся; deleteCaseAction логирует ПОСЛЕ delete). Позже
-- 20260530100000 (Задача 5) переписал log_activity, добавив в allowlist
-- payroll_paid/payroll_reverted, но НЕЧАЯННО выкинул MED#7-ветку — admin снова
-- не может записать case_deleted после удаления дела (ломается аудит-трейл и
-- smoke-тест MED#7). Здесь объединяем оба фикса: MED#7-ветка + payroll-actions
-- в allowlist. Табличный CHECK (activity_log_action_check) уже включает оба
-- payroll-действия (выставлен в 20260530100000) — его не трогаем.

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
  v_is_delete_action boolean;
begin
  if p_entity_type is null or p_entity_id is null or p_action is null then
    return;
  end if;

  -- CSO #1: allowlist actions (+payroll_paid/payroll_reverted — Задача 5).
  -- 'stage_corrected' исключён — пишется только триггером (rpc = подделка).
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

  -- CSO #1: size cap на changes.
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

  -- MED#7: для уничтожающих действий entity уже не существует — can_see_case
  -- вернёт false. Разрешаем запись для is_staff (RLS DELETE на cases/clients
  -- уже is_staff-only, server-actions дублируют requireRole).
  v_is_delete_action := p_action in ('case_deleted', 'client_deleted');

  if v_is_delete_action then
    if not private.is_staff() then
      return;
    end if;
  else
    if p_entity_type = 'case' and not private.can_see_case(p_entity_id) then
      return;
    end if;

    if p_entity_type = 'client' and not private.is_staff() then
      return;
    end if;
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  -- Логирование никогда не должно ломать основную операцию.
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'Шаг 10 + CSO #1 + MED#7 + Задача 5: SECURITY DEFINER, allowlist '
  '(+payroll_paid/payroll_reverted), size cap 8 КБ, is_staff bypass для *_deleted. '
  'MED#7-ветку восстановили после регрессии в 20260530100000 (Проблема 1, миграция fix_revert_merge).';
