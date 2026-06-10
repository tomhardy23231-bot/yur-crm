-- Юр CRM — v2 Этап 5 (Акты), часть 2: «Рахунок-Акт» как платёжный документ.
--
-- Цикл (docs/PLAN-V2.md, Этап 5): сгенерирован (issued) → выдан клиенту →
-- оплачен (скан с подписями + прописанная сумма → paid) → автоматически создаётся
-- платёж по делу (payments.act_id) → существующие триггеры пересчитывают
-- paid_total/долг, а ЗП (live по paid_total) растёт сама.
--
-- ЗАМОВНИК для печатной формы берётся из карточки клиента: name + clients.inn
-- (РНОКПП для физлица/ФОП, ЄДРПОУ для компании — поле уже существует,
-- 20260602100000). Отдельный tax_id не вводим.
--
-- Доступ (CLAUDE.md §4, PLAN-V2 Этап 5):
--   • видимость — наследуется от дела (private.can_see_case → case_visible);
--   • создание (issued) — Експерт СВОЕГО дела (responsible_id) + staff с доступом
--     к делу (НЕ lawyer-продажник: он подтверждает оплату, а не выписывает акт);
--   • подтверждение оплаты (issued→paid, создаёт платёж) — lawyer СВОЕГО дела +
--     owner/admin (не office_manager: он финансы только читает). Делается АТОМАРНО
--     через SECURITY DEFINER public.confirm_act_paid (собственная проверка прав);
--   • переопределение completion (full/partial) — staff, через public.set_act_completion;
--   • удаление ТОЛЬКО неоплаченного (issued) акта — owner/admin или автор.
--   UPDATE-политики на таблицу НЕ даём (default-deny): статус/скан меняет лишь
--   confirm_act_paid (DEFINER) — это закрывает прямой тамперинг status='paid' в обход
--   создания платежа.
--
-- Миграция аддитивная (новая таблица + новая nullable-колонка payments.act_id).

-- ========================================================================
-- 1) Сквозная нумерация актов (по всей компании) — sequence.
-- ========================================================================
-- Возможны пропуски номеров при откате транзакции — для счетов-актов это
-- допустимо (нумерация монотонна и уникальна; пропуск ≠ дубликат).
create sequence if not exists public.case_act_number_seq;

-- ========================================================================
-- 2) Таблица case_acts
-- ========================================================================
create table public.case_acts (
  id               uuid primary key default gen_random_uuid(),
  -- RESTRICT как у payments/documents: акт — финансово-значимая запись, не теряем
  -- при удалении дела (удаление дела требует ручной разборки связанных записей).
  case_id          uuid not null references public.cases(id) on delete restrict,
  number           integer not null unique default nextval('public.case_act_number_seq'),
  service_name     text not null default 'Юридичні послуги',
  service_period   text,                      -- «Період надання послуг» (опц., из образца)
  amount           numeric(14, 2) not null,   -- сумма к оплате («До оплати»)
  confirmed_amount numeric(14, 2),            -- прописанная при подтверждении сумма
  completion       text,                      -- full | partial (вычисляется при оплате)
  status           text not null default 'issued',
  issued_at        date not null default current_date,
  paid_at          date,
  scan_document_id uuid references public.documents(id) on delete set null,
  note             text,
  created_by       uuid not null references public.users(id) on delete restrict,
  created_at       timestamptz not null default now(),

  constraint case_acts_amount_positive   check (amount > 0),
  constraint case_acts_status_valid       check (status in ('issued', 'paid')),
  constraint case_acts_completion_valid   check (completion is null or completion in ('full', 'partial')),
  constraint case_acts_confirmed_nonneg   check (confirmed_amount is null or confirmed_amount >= 0),
  -- Консистентность статуса: issued → платёжные поля пусты; paid → заполнены.
  constraint case_acts_status_consistency check (
    (status = 'issued'
       and confirmed_amount is null and paid_at is null
       and completion is null and scan_document_id is null)
    or
    (status = 'paid'
       and confirmed_amount is not null and paid_at is not null
       and completion is not null)
  )
);

create index case_acts_case_idx   on public.case_acts(case_id, created_at desc);
create index case_acts_status_idx on public.case_acts(status);

comment on table public.case_acts is
  'Рахунок-Акт (счёт-акт) по делу. issued → paid (скан + сумма → платёж). '
  'completion (full/partial) вычисляется при оплате накопительно по актам дела. '
  'v2 Этап 5.';

-- payments.act_id: оплата, созданная подтверждением акта. Уникальна (один платёж
-- на акт). SET NULL при удалении акта (issued-акт без платежа удалить можно;
-- paid-акт удалять нельзя — см. ниже).
alter table public.payments
  add column if not exists act_id uuid references public.case_acts(id) on delete set null;

create unique index payments_act_id_uniq on public.payments(act_id) where act_id is not null;

-- ========================================================================
-- 3) RLS
-- ========================================================================
alter table public.case_acts enable row level security;

-- SELECT — наследуется от дела.
create policy case_acts_select_via_case
  on public.case_acts
  for select
  to authenticated
  using (private.can_see_case(case_id));

-- INSERT (создание issued-акта) — Експерт своего дела ИЛИ staff с доступом к делу.
-- created_by обязан = текущему активному uid (нельзя приписать чужому).
create policy case_acts_insert
  on public.case_acts
  for insert
  to authenticated
  with check (
    created_by = (select private.active_uid())
    and exists (
      select 1 from public.cases c
       where c.id = case_id
         and private.case_visible(c.lawyer_id, c.responsible_id)
         and (
           private.is_staff()
           or c.responsible_id = (select private.active_uid())
         )
    )
  );

-- DELETE — только неоплаченный (issued) акт; owner/admin ИЛИ автор записи.
-- (paid-акт нельзя: за ним стоит платёж/долг/ЗП.)
create policy case_acts_delete_issued
  on public.case_acts
  for delete
  to authenticated
  using (
    status = 'issued'
    and (
      private.can_manage_users()
      or created_by = (select private.active_uid())
    )
  );

-- UPDATE-политики НЕТ намеренно → прямой UPDATE из пользовательской сессии запрещён.
-- Все изменения paid-акта проходят через SECURITY DEFINER функции ниже.

-- ========================================================================
-- 4) recompute_case_act_completions — пересчёт completion оплаченных актов дела.
-- ========================================================================
-- Накопительно по дате оплаты: акт делает дело «полностью» (full), как только сумма
-- оплат по актам (по порядку paid_at, включая его) покрывает contract_sum; иначе
-- partial. ЕДИНЫЙ источник правды completion — зовётся из confirm_act_paid и из
-- триггера реверта при удалении платежа (иначе у соседних оплаченных актов
-- completion оставался бы устаревшим). contract_sum=0 (не задана) → full.
-- Внутренний хелпер: вызывается только из SECURITY DEFINER функций/триггеров
-- (выполняются как владелец), пользователю напрямую не нужен → без grant.
create or replace function private.recompute_case_act_completions(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract numeric(14, 2);
  v_run      numeric(14, 2) := 0;
  rec        record;
begin
  select contract_sum into v_contract from public.cases where id = p_case_id;
  for rec in
    select id, confirmed_amount
      from public.case_acts
     where case_id = p_case_id and status = 'paid'
     order by paid_at asc, created_at asc, number asc
  loop
    v_run := v_run + coalesce(rec.confirmed_amount, 0);
    update public.case_acts
       set completion = case when v_run >= coalesce(v_contract, 0) then 'full' else 'partial' end
     where id = rec.id;
  end loop;
end;
$$;

-- ========================================================================
-- 5) confirm_act_paid — атомарное подтверждение оплаты.
-- ========================================================================
-- В одной транзакции: проверка прав → INSERT documents (скан) → INSERT payments
-- (act_id) → акт в paid → пересчёт completion дела → журнал. SECURITY DEFINER
-- (обходит RLS на documents/case_acts/payments), поэтому проверку прав делаем явно:
-- подтверждать может lawyer СВОЕГО дела ИЛИ owner/admin (роль, не override —
-- зеркало проверки в серверном действии). Скан загружается в Storage серверным
-- действием ДО вызова; documents-строку создаём здесь (внутри транзакции), чтобы
-- при ошибке не оставалось осиротевшей записи (откат action чистит лишь Storage-файл).
-- FOR UPDATE на акте сериализует параллельные подтверждения (доп. к unique-индексу).
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
  v_uid        uuid;
  v_case_id    uuid;
  v_lawyer     uuid;
  v_status     text;
  v_doc_id     uuid;
  v_payment_id uuid;
begin
  v_uid := private.active_uid();
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select a.case_id, a.status, c.lawyer_id
    into v_case_id, v_status, v_lawyer
    from public.case_acts a
    join public.cases c on c.id = a.case_id
   where a.id = p_act_id
   for update of a;

  if v_case_id is null then
    raise exception 'act % not found', p_act_id using errcode = 'P0002';
  end if;

  -- Право: lawyer этого дела ИЛИ owner/admin (по роли).
  if not (private.can_manage_users() or v_lawyer = v_uid) then
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
  'роли) → documents(скан) → payment(act_id) → акт paid → пересчёт completion дела → '
  'журнал. v2 Этап 5.';

-- ========================================================================
-- 6) set_act_completion — ручное переопределение full/partial (staff).
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
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  if p_completion not in ('full', 'partial') then
    raise exception 'invalid completion' using errcode = '22023';
  end if;

  select status into v_status from public.case_acts where id = p_act_id;
  if v_status is null then
    raise exception 'act % not found', p_act_id using errcode = 'P0002';
  end if;
  if v_status <> 'paid' then
    raise exception 'completion applies to paid acts only' using errcode = 'P0001';
  end if;

  update public.case_acts set completion = p_completion where id = p_act_id;
end;
$$;

grant execute on function public.set_act_completion(uuid, text) to authenticated;

comment on function public.set_act_completion(uuid, text) is
  'Ручное переопределение completion (full/partial) оплаченного акта. staff-only. v2 Этап 5.';

-- ========================================================================
-- 7) Реверт акта при удалении его платежа (целостность paid-акта).
-- ========================================================================
-- Если owner/admin удалит платёж, созданный подтверждением акта (payments.act_id),
-- акт возвращается в issued (иначе остаётся «оплачен» без платежа). FK act_id уже
-- SET NULL, но саму строку акта надо привести к консистентному issued-состоянию,
-- а у ОСТАЛЬНЫХ оплаченных актов дела пересчитать completion (иначе у акта, который
-- стал full за счёт удалённого платежа, осталась бы устаревшая отметка).
create or replace function private.case_acts_revert_on_payment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
begin
  if old.act_id is not null then
    select case_id into v_case_id from public.case_acts where id = old.act_id;
    update public.case_acts
       set status           = 'issued',
           confirmed_amount = null,
           paid_at          = null,
           completion       = null,
           scan_document_id = null
     where id = old.act_id;
    if v_case_id is not null then
      perform private.recompute_case_act_completions(v_case_id);
    end if;
  end if;
  return old;
end;
$$;

-- BEFORE DELETE: чтобы FK payments.act_id (SET NULL) не обнулил old.act_id раньше,
-- чем мы его прочитаем (в BEFORE old ещё содержит исходное значение).
create trigger case_acts_revert_on_payment_delete
before delete on public.payments
for each row execute function private.case_acts_revert_on_payment_delete();
