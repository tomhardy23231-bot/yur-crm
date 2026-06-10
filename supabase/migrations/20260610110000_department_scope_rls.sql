-- Юр CRM — v2 Этап 2: RLS по подразделениям (docs/PLAN-V2.md, Этап 2).
--
-- Цель: переключить видимость ДАННЫХ с «staff видит всё» на модель подразделений.
--   • owner — всё, всегда (режим бога, не настраивается, не отключается оверрайдом);
--   • admin/office_manager: visibility_scope='all' ИЛИ department_id IS NULL → всё
--     (ПЕРЕХОДНОЕ правило: после db push весь прод-staff = scope 'department' +
--     department_id NULL — без этого правила он бы «ослеп» до раскидывания людей
--     по подразделениям; см. PROGRESS «заметки для Этапа 2»);
--     иначе → только дела, где подразделение юриста ИЛИ Експерта = их подразделение;
--   • lawyer/expert — БЕЗ изменений: только свои дела (lawyer_id/responsible_id),
--     scope на них не влияет.
--
-- Дело пересекает подразделения: «принадлежит» подразделению И юриста-продажника,
-- И Експерта-исполнителя одновременно — его видят оба руководителя (PLAN-V2).
--
-- ИНВАРИАНТ источника правды: единственный предикат видимости дела —
-- private.case_visible(lawyer_id, responsible_id). Его зовут и политики public.cases,
-- и private.can_see_case → значит documents/tasks/payments/comments/activity_log по
-- делу и storage.objects наследуют новый скоуп АВТОМАТИЧЕСКИ (их политики не трогаем).
--
-- Права-оверрайды (perm_overrides, 20260601100000) сохраняются: «видит всё дела» =
-- private.can('view_all_cases'), «видит ЗП всех» = private.can('view_all_payroll').
-- Здесь мы лишь СКОУПИМ эти права подразделением через visibility_scope. Следствие:
-- выдача view_all_cases юристу теперь тоже скоупится его подразделением (scope по
-- умолчанию 'department'); расширить до всей компании может только owner, выставив
-- scope='all' (consistent с моделью v2).
--
-- НЕ меняем (вне скоупа Этапа 2 — это видимость, не операции):
--   • INSERT/DELETE дел/клиентов (create_cases/delete_cases/create_clients/...);
--   • управление пользователями (can_manage_users), запись выплат, отметку
--     «выплачено» (payroll_ledger update) — скоуп прав admin'а по подразделению на
--     ЗАПИСЬ переезжает в Этап 4;
--   • users SELECT (имена нужны кросс-подразделенческим делам — справочник);
--   • is_staff() на операциях: смена этапа назад, архив, физическое удаление файла,
--     чтение payroll_rates — не зависят от подразделения;
--   • allowlist activity_log (новых действий нет → гоча 23514 не задевается).
--
-- Откат: восстановить предикаты политик/функций из 20260601100000 и 20260526100200
-- (case_visible/can_see_all_cases → обратно private.can('view_all_cases'); payroll-
-- фильтры → is_staff()/can('view_all_payroll')) и удалить новые private.*-функции.
-- Миграция аддитивная: новых таблиц/колонок нет, существующие данные не трогает.

-- ========================================================================
-- 1) Helper-функции скоупа (схема private, SECURITY DEFINER + search_path='')
-- ========================================================================
-- Все читают текущего пользователя по auth.uid() с фильтром is_active = true:
-- деактивированный сотрудник с живым токеном → NULL/false (kill-switch, как
-- active_uid()). Внутри SECURITY DEFINER-функций auth.uid() по-прежнему берёт sub
-- из request.jwt.claims (не зависит от роли исполнителя) — паттерн уже используется
-- существующими хелперами и RPC.

-- 1.1 Подразделение текущего активного пользователя (NULL — вне структуры/неактивен).
create or replace function private.current_user_department()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select department_id
    from public.users
   where id = auth.uid() and is_active = true
$$;

-- 1.2 «Безлимитный» скоуп: scope='all' ИЛИ department IS NULL (переходное правило).
-- ВАЖНО — гейт по роли (admin/office_manager): scope_is_all применим ТОЛЬКО к staff.
-- owner покрыт is_owner() выше по стеку; а для lawyer/expert эта ветка НЕ должна
-- срабатывать. Иначе эскалация: admin выдаёт юристу право view_all_cases (это
-- допускает can_grant_cap), у юриста department_id=NULL (дефолт для всех не-owner,
-- ставит только owner) → scope_is_all=true → can_see_all_cases=true → юрист видит
-- ВСЮ компанию вместо своего подразделения (находка аудита, HIGH). С гейтом юрист
-- с NULL-подразделением проваливается в ветку совпадения подразделения case_visible
-- (которая при NULL не матчит ничего) → видит только свои дела, как задумано.
create or replace function private.scope_is_all()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select role in ('admin', 'office_manager')
       and (visibility_scope = 'all' or department_id is null)
      from public.users
     where id = auth.uid() and is_active = true
  ), false)
$$;

-- 1.3 Видит ли пользователь ВСЕ дела компании.
-- owner — всегда. Иначе нужно право view_all_cases И безлимитный scope.
create or replace function private.can_see_all_cases()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner()
      or (private.can('view_all_cases') and private.scope_is_all())
$$;

-- 1.4 ЕДИНЫЙ предикат видимости дела по его юристу/Експерту.
-- Видно, если: видит-всё ИЛИ ты юрист/Експерт этого дела ИЛИ ты руководитель
-- подразделения (view_all_cases), и юрист ЛИБО Експерт дела в твоём подразделении.
-- active_uid() для неактивного = NULL → сравнения с ним дают false (kill-switch).
create or replace function private.case_visible(p_lawyer uuid, p_responsible uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_see_all_cases()
    or p_lawyer = private.active_uid()
    or p_responsible = private.active_uid()
    or (
      private.can('view_all_cases')
      and exists (
        select 1
          from public.users u
         where u.id in (p_lawyer, p_responsible)
           and u.department_id is not null
           and u.department_id = private.current_user_department()
      )
    )
$$;

-- 1.5 Видимость клиента: видит-всё ИЛИ создатель ИЛИ есть видимое дело клиента.
-- Ветка «видимое дело» намеренно НЕ гейтится view_all_cases — case_visible сам
-- вернёт true юристу/Експерту только для ИХ дел (сохраняет прежнее «вижу клиента
-- своего дела»), а руководителю — для дел его подразделения.
create or replace function private.can_see_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_see_all_cases()
    or exists (
      select 1 from public.clients cl
       where cl.id = p_client_id
         and cl.created_by = private.active_uid()
    )
    or exists (
      select 1 from public.cases c
       where c.client_id = p_client_id
         and private.case_visible(c.lawyer_id, c.responsible_id)
    )
$$;

-- 1.6 Видит ли пользователь ЗП ВСЕХ (owner / view_all_payroll + безлимитный scope).
create or replace function private.payroll_see_all()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner()
      or (private.can('view_all_payroll') and private.scope_is_all())
$$;

-- 1.7 Виден ли зрителю ЗП-показатель конкретного сотрудника.
-- Свою ЗП — всегда; «видит ЗП всех» — всех; руководитель подразделения
-- (view_all_payroll) — сотрудников своего подразделения.
create or replace function private.payroll_user_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = private.active_uid()
    or private.payroll_see_all()
    or (
      private.can('view_all_payroll')
      and exists (
        select 1 from public.users u
         where u.id = p_user_id
           and u.department_id is not null
           and u.department_id = private.current_user_department()
      )
    )
$$;

grant execute on function private.current_user_department()  to authenticated;
grant execute on function private.scope_is_all()             to authenticated;
grant execute on function private.can_see_all_cases()        to authenticated;
grant execute on function private.case_visible(uuid, uuid)   to authenticated;
grant execute on function private.can_see_client(uuid)       to authenticated;
grant execute on function private.payroll_see_all()          to authenticated;
grant execute on function private.payroll_user_visible(uuid) to authenticated;

-- ========================================================================
-- 2) can_see_case → через единый предикат case_visible
-- ========================================================================
-- can_write_case по-прежнему делегирует в can_see_case (Phase 1: видеть = писать),
-- его переопределять не нужно — он подхватит новую can_see_case.
create or replace function private.can_see_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.cases c
     where c.id = p_case_id
       and private.case_visible(c.lawyer_id, c.responsible_id)
  )
$$;

-- ========================================================================
-- 3) Политики public.cases — SELECT/UPDATE по case_visible
-- ========================================================================
-- INSERT (create_cases) и DELETE (delete_cases) — без изменений (операции, не скоуп).
drop policy if exists cases_select_visible on public.cases;
create policy cases_select_visible
  on public.cases
  for select
  to authenticated
  using (private.case_visible(lawyer_id, responsible_id));

drop policy if exists cases_update_staff_or_assignee on public.cases;
create policy cases_update_staff_or_assignee
  on public.cases
  for update
  to authenticated
  using      (private.case_visible(lawyer_id, responsible_id))
  with check (private.case_visible(lawyer_id, responsible_id));

-- ========================================================================
-- 4) Политики public.clients — SELECT/UPDATE скоупим по делам подразделения
-- ========================================================================
-- SELECT: видит-всё ИЛИ создатель ИЛИ есть видимое (по подразделению/своё) дело.
drop policy if exists clients_select_visible on public.clients;
create policy clients_select_visible
  on public.clients
  for select
  to authenticated
  using (
    private.can_see_all_cases()
    or created_by = (select private.active_uid())
    or exists (
      select 1 from public.cases c
       where c.client_id = clients.id
         and private.case_visible(c.lawyer_id, c.responsible_id)
    )
  );

-- UPDATE: как SELECT, но ветка «видимое дело» гейтится view_all_cases — чтобы
-- юрист/Експерт (без этого права) сохранили прежнее правило «правлю только клиента,
-- которого создал», а руководитель подразделения мог править клиентов своих дел.
drop policy if exists clients_update_staff_or_creator on public.clients;
create policy clients_update_staff_or_creator
  on public.clients
  for update
  to authenticated
  using (
    private.can_see_all_cases()
    or created_by = (select private.active_uid())
    or (
      private.can('view_all_cases')
      and exists (
        select 1 from public.cases c
         where c.client_id = clients.id
           and private.case_visible(c.lawyer_id, c.responsible_id)
      )
    )
  )
  with check (
    private.can_see_all_cases()
    or created_by = (select private.active_uid())
    or (
      private.can('view_all_cases')
      and exists (
        select 1 from public.cases c
         where c.client_id = clients.id
           and private.case_visible(c.lawyer_id, c.responsible_id)
      )
    )
  );

-- ========================================================================
-- 5) Политика public.activity_log — SELECT
-- ========================================================================
-- Прежнее is_staff() (видел весь журнал) раскладываем по сущностям:
--   • видит-всё (owner/scope='all'/переходный NULL) → весь журнал, как раньше;
--   • дела/клиенты → скоуп по подразделению (can_see_case / can_see_client);
--   • записи по ПОЛЬЗОВАТЕЛЯМ (user_created/role_changed/permissions_changed…) —
--     по праву manage_users: управление пользователями НЕ скоупится подразделением
--     (Этап 2 — про дела/финансы), поэтому аудит юзеров видит тот, кто ими
--     управляет, независимо от своего подразделения. log_activity пишет user-записи
--     под тем же can('manage_users') — чтение и запись симметричны.
-- На деплое переходное правило сохраняет полную видимость всему текущему staff,
-- пока owner не раскидает людей по подразделениям.
drop policy if exists activity_log_select_visible on public.activity_log;
create policy activity_log_select_visible
  on public.activity_log
  for select
  to authenticated
  using (
    private.can_see_all_cases()
    or (entity_type = 'case'   and private.can_see_case(entity_id))
    or (entity_type = 'client' and private.can_see_client(entity_id))
    or (entity_type = 'user'   and private.can('manage_users'))
  );

-- ========================================================================
-- 6) Политики ЗП-таблиц — SELECT по payroll_user_visible
-- ========================================================================
-- payroll_ledger: «staff видит все начисления» → скоуп по подразделению.
-- payroll_ledger_select_own оставляем (избыточно, payroll_user_visible уже включает
-- «своё», но безвредно); update_managers (отметка «выплачено») — без изменений.
drop policy if exists payroll_ledger_select_staff on public.payroll_ledger;
create policy payroll_ledger_select_staff
  on public.payroll_ledger
  for select
  to authenticated
  using (private.payroll_user_visible(user_id));

-- payroll_transactions: «staff видит все движения» → скоуп. select_own оставляем,
-- write_managers (создание выплат/премий) — без изменений (запись = Этап 4).
drop policy if exists payroll_transactions_select_staff on public.payroll_transactions;
create policy payroll_transactions_select_staff
  on public.payroll_transactions
  for select
  to authenticated
  using (private.payroll_user_visible(user_id));

-- payout_allocations: видимость аллокации = видимость ЗП владельца выплаты.
-- Заменяет прежнее «is_staff() ИЛИ моя выплата» (payroll_user_visible включает «своё»).
drop policy if exists payout_allocations_select on public.payout_allocations;
create policy payout_allocations_select
  on public.payout_allocations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.payroll_transactions t
       where t.id = payout_allocations.transaction_id
         and private.payroll_user_visible(t.user_id)
    )
  );

-- ========================================================================
-- 7) ЗП-отчёты (SECURITY DEFINER RPC) — фильтр зрителя по payroll_user_visible
-- ========================================================================
-- Тела идентичны живым версиям (payroll_by_specialist — 20260601100000;
-- *_summary/*_cases — 20260601120000). Меняется ТОЛЬКО строка «фильтр зрителя»:
-- is_staff()/can('view_all_payroll') OR self  →  private.payroll_user_visible(uid).

-- 7.1 payroll_by_specialist() — сводка начислений по сотрудникам/ролям.
create or replace function public.payroll_by_specialist()
returns table (
  user_id      uuid,
  full_name    text,
  role_in_case text,
  case_count   bigint,
  paid_base    numeric,
  earned       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with attributed as (
    select
      c.lawyer_id                                       as uid,
      'lawyer'::text                                    as role_in_case,
      c.paid_total,
      coalesce(c.lawyer_rate_override, r.lawyer_percent) as percent
    from public.cases c
    join public.payroll_rates r on r.category = c.category
    union all
    select
      c.responsible_id,
      'expert'::text,
      c.paid_total,
      coalesce(c.expert_rate_override, r.expert_percent)
    from public.cases c
    join public.payroll_rates r on r.category = c.category
  )
  select
    a.uid                                                       as user_id,
    u.full_name,
    a.role_in_case,
    count(*)                                                    as case_count,
    coalesce(sum(a.paid_total), 0)                              as paid_base,
    coalesce(sum(round(a.paid_total * a.percent / 100, 2)), 0)  as earned
  from attributed a
  join public.users u on u.id = a.uid
  -- v2 Этап 2: свои строки + сотрудники в зоне видимости (сам / видит-всех / своё подразделение).
  where private.payroll_user_visible(a.uid)
  group by a.uid, u.full_name, a.role_in_case
  order by earned desc, u.full_name asc;
$$;

grant execute on function public.payroll_by_specialist() to authenticated;

-- 7.2 payroll_employee_summary(p_month) — список сотрудников с итогами за месяц.
create or replace function public.payroll_employee_summary(p_month date default null)
returns table (
  user_id   uuid,
  full_name text,
  earned    numeric,
  bonus     numeric,
  payout    numeric,
  balance   numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  month_pay as (
    select p.case_id, sum(p.amount) as paid_month
      from public.payments p
     where p_month is null
        or (p.paid_at >= p_month and p.paid_at < (p_month + interval '1 month'))
     group by p.case_id
  ),
  assigned_month as (
    select c.lawyer_id as uid,
           round(coalesce(mp.paid_month, 0) * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
    union all
    select c.responsible_id,
           round(coalesce(mp.paid_month, 0) * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
  ),
  earned_month as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_month group by uid
  ),
  assigned_all as (
    select c.lawyer_id as uid,
           round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
    union all
    select c.responsible_id,
           round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
  ),
  earned_all as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_all group by uid
  ),
  tx_month as (
    select user_id,
           coalesce(sum(amount) filter (where kind = 'bonus'), 0)  as bonus,
           coalesce(sum(amount) filter (where kind = 'payout'), 0) as payout
      from public.payroll_transactions
     where p_month is null
        or (occurred_on >= p_month and occurred_on < (p_month + interval '1 month'))
     group by user_id
  ),
  tx_all as (
    select user_id,
           coalesce(sum(amount) filter (where kind = 'bonus'), 0)  as bonus,
           coalesce(sum(amount) filter (where kind = 'payout'), 0) as payout
      from public.payroll_transactions
     group by user_id
  )
  select
    u.id,
    u.full_name,
    coalesce(em.earned, 0) as earned,
    coalesce(tm.bonus, 0)  as bonus,
    coalesce(tm.payout, 0) as payout,
    coalesce(ea.earned, 0) + coalesce(ta.bonus, 0) - coalesce(ta.payout, 0) as balance
  from public.users u
  left join earned_month em on em.uid = u.id
  left join earned_all   ea on ea.uid = u.id
  left join tx_month     tm on tm.user_id = u.id
  left join tx_all       ta on ta.user_id = u.id
  -- v2 Этап 2: зритель видит свою строку + сотрудников в зоне видимости.
  where private.payroll_user_visible(u.id)
    and (ea.uid is not null or ta.user_id is not null)  -- причастные к ЗП за всё время
  order by balance desc, u.full_name asc;
$$;

grant execute on function public.payroll_employee_summary(date) to authenticated;

-- 7.3 payroll_employee_cases(p_user_id, p_month) — разбивка по делам сотрудника.
create or replace function public.payroll_employee_cases(
  p_user_id uuid,
  p_month   date default null
)
returns table (
  case_id      uuid,
  number_title text,
  stage        public.case_stage,
  role_in_case text,
  paid_total   numeric,
  percent      numeric,
  earned       numeric,
  paid         numeric,
  outstanding  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with month_pay as (
    select p.case_id, sum(p.amount) as paid_month
      from public.payments p
     where p_month is null
        or (p.paid_at >= p_month and p.paid_at < (p_month + interval '1 month'))
     group by p.case_id
  ),
  buckets as (
    select c.id as case_id, c.number_title, c.stage, 'lawyer'::text as role_in_case,
           case when p_month is null then c.paid_total else coalesce(mp.paid_month, 0) end as base,
           coalesce(c.lawyer_rate_override, r.lawyer_percent) as percent
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
     where c.lawyer_id = p_user_id
    union all
    select c.id, c.number_title, c.stage, 'expert'::text,
           case when p_month is null then c.paid_total else coalesce(mp.paid_month, 0) end,
           coalesce(c.expert_rate_override, r.expert_percent)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
     where c.responsible_id = p_user_id
  ),
  alloc as (
    select a.case_id, a.role_in_case, coalesce(sum(a.amount), 0) as paid
      from public.payout_allocations a
      join public.payroll_transactions t on t.id = a.transaction_id
     where t.user_id = p_user_id
       and (p_month is null
            or (t.occurred_on >= p_month and t.occurred_on < (p_month + interval '1 month')))
     group by a.case_id, a.role_in_case
  )
  select
    b.case_id,
    b.number_title,
    b.stage,
    b.role_in_case,
    b.base as paid_total,
    b.percent,
    round(b.base * b.percent / 100, 2)                        as earned,
    coalesce(al.paid, 0)                                      as paid,
    round(b.base * b.percent / 100, 2) - coalesce(al.paid, 0) as outstanding
  from buckets b
  left join alloc al
    on al.case_id = b.case_id and al.role_in_case = b.role_in_case
  -- v2 Этап 2: разбивку по чужому сотруднику видит только зритель в его зоне видимости.
  where private.payroll_user_visible(p_user_id)
  order by outstanding desc, b.number_title asc;
$$;

grant execute on function public.payroll_employee_cases(uuid, date) to authenticated;
