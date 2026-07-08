# ПЛАН v3 — «Hardening & Product» (цикл по аудиту 2026-06-11)

> **Источник правды текущего цикла разработки.** Составлен по результатам
> мультиагентного аудита 2026-06-11 (8 аудиторов, 97 находок, 6 подтверждённых
> high-проблем). Цикл = **12 сессий, каждая сессия = отдельный диалог.**
> Исполнитель сессий — агент Claude (Opus): следуй этому файлу ДОСЛОВНО,
> не придумывай ничего сверх написанного. Если что-то в коде не совпадает
> с описанием — остановись и спроси пользователя, не додумывай.

---

## Протокол сессии «ПРОДОЛЖАЙ»

Пользователь начинает сессию словом **«ПРОДОЛЖАЙ»**. Агент обязан:

1. Прочитать `CLAUDE.md` ЦЕЛИКОМ (роли §4, модель §5, правила §7).
2. Прочитать этот файл: **статус-таблицу** ниже и раздел СВОЕЙ сессии
   (первая со статусом ⬜). Затем — последнюю запись `docs/PROGRESS.md`.
3. Выполнить `git status` — увидишь МНОГО незакоммиченных файлов от прошлых
   сессий. **Это норма цикла v3** (коммиты только в финальной сессии 12). Ничего не
   откатывать, не stash'ить, не коммитить.
4. Выполнять ТОЛЬКО свою сессию. Следующую в том же диалоге НЕ начинать.
5. В конце сессии — чеклист DoD (ниже) + отметить сессию в статус-таблице
   (✅ + дата) + добавить запись в `docs/PROGRESS.md` **со списком всех
   созданных/изменённых файлов** (по этим спискам сессия 11 соберёт коммиты).

### Жёсткие запреты (весь цикл, сессии 1–11)

- ❌ `git add` / `git commit` / `git push` / `git reset` / `git checkout -- ` /
  `git stash` — НИКАКИХ git-мутаций. Git только на чтение (status/diff/log).
- ❌ `npx supabase db push` (прод не трогаем до сессии 12 и «ок» пользователя).
- ❌ Не менять файлы вне скоупа своей сессии. Если нашёл баг чужой зоны —
  запиши в PROGRESS в раздел «Найдено попутно», не чини.
- ❌ Не запускать review-скилы (/review, /cso, /qa) — экономия токенов,
  общий смотр будет в сессии 12.
- ❌ `npm run build` НЕ запускать (долго) — только в сессии 12.
- ❌ Не реализовывать «вне скоупа» (см. раздел в конце файла).

### Чеклист DoD каждой сессии

- [ ] `npx tsc --noEmit` — 0 ошибок;
- [ ] `npm run lint` — 0 ошибок/предупреждений;
- [ ] `npm test` — все юнит-тесты зелёные (включая новые);
- [ ] если в сессии есть миграции: `npx supabase db reset` проходит чисто,
      затем `npm run db:seed`; если затронута RLS/права — прогнать
      `npm run test:integration` (нужен запущенный локальный Supabase);
- [ ] статус-таблица ниже обновлена (✅ + дата + 1 строка итога);
- [ ] запись в `docs/PROGRESS.md`: что сделано, СПИСОК ФАЙЛОВ, отклонения
      от плана, «Найдено попутно», открытые хвосты.

### Окружение (важно)

- Локальный Supabase на нестандартных портах — смотри `npx supabase status`
  (исторически API на :48321). Если стек не запущен: `npx supabase start`
  (нужен Docker Desktop). **Если Docker не стартует/падает** — не дебажь
  дольше 5 минут: зафиксируй в PROGRESS «integration пропущены, Docker down»,
  прогони unit и продолжай (известная Windows-грабля, лечится ребутом).
- Dev-сервер: `npm run dev` (исторически на :3001). Для большинства сессий
  запускать НЕ нужно — только если явно сказано.
- После `db reset` данные пусты: `npm run db:seed` создаёт юзеров
  (owner@yur.local / test12345!) и счета кассы; `npm run db:seed:demo` — демо-данные.
- Среда Windows / PowerShell. Пути с пробелом и кириллицей
  (`C:\Users\HP\Desktop\Юр система`) — всегда в кавычках.

### Подводные камни БД (читать перед КАЖДОЙ миграцией)

1. **Allowlist activity_log (грабля №1 проекта).** Любая миграция, добавляющая
   новое действие журнала, пересоздаёт `activity_log_action_check` и функцию
   `private.log_activity`. Делать ТОЛЬКО так: найди ПОСЛЕДНЮЮ по имени миграцию
   в `supabase/migrations`, содержащую `activity_log_action_check`
   (на старте цикла это `20260610170000_activity_log_act_actions.sql`),
   скопируй её СПИСОК ДЕЙСТВИЙ ЦЕЛИКОМ и добавь новые. Никогда не пиши список
   «от базы» — потеряешь действия, добавленные предыдущими сессиями v3,
   и `db push` на прод упадёт с 23514.
2. **Пересоздание функций.** Меняя существующую функцию/триггер
   (`recalc_case_totals`, `cases_validate_stage_forward`, `log_activity`…),
   найди её ПОСЛЕДНЮЮ версию в миграциях (поиск по имени, бери файл с самым
   большим timestamp), скопируй тело ЦЕЛИКОМ и внеси точечную правку.
   Не восстанавливай старые версии.
3. Все новые функции в схеме `private` — `security definer set search_path = ''`
   + явные схемы (`public.cases`, не `cases`). SECURITY DEFINER обязан САМ
   проверять права внутри (`private.can(...)` / `private.is_staff()` и т.п.).
   Функции для отчётов, где должна работать RLS вызывающего, —
   `security invoker` (это пишется явно в задаче).
4. **Колонки `users` приватны.** На `users` снят табличный SELECT и выдан
   grant на безопасный СПИСОК колонок. Новую колонку в `users` НЕ добавлять
   без добавления её в grant (см. миграцию `20260610140000_user_salary_modes.sql`).
   В этом цикле мы в `users` колонок НЕ добавляем (для Telegram — отдельная таблица).
5. Имена миграций: `npx supabase migration new <name>` — CLI сам поставит
   timestamp. Имена в плане условные, важен ПОРЯДОК внутри сессии.
6. `numeric(14,2)` суммы; в TS суммы парсить существующими регэксп-парсерами
   (не `parseFloat`).

---

## Статус сессий

| # | Сессия | Статус | Дата | Итог |
|---|--------|--------|------|------|
| 1 | БД-безопасность: гард финансовых полей, гонки, скоуп DEFINER-функций | ✅ | 2026-06-11 | 6 миграций (гард фин-полей дела, лок recalc, неизменяемость act-платежа, пересчёт completion при смене суммы, скоуп+лок confirm_act_paid/set_act_completion, удаление доков по видимости) + TS-зеркало updateCaseAction + UI-блок формы + 2 ключа i18n + 6 integration. tsc/lint 0, unit 93/93, integration 91/91 (чистый reset) |
| 2 | Журнал и целостность: allowlist, лог этапа, выплаты, чеки, индексы | ✅ | 2026-06-11 | 3 миграции (allowlist +payment_updated/act_deleted/payroll_payout; целостность выплат: uniq-индекс + Σ аллокаций ≤ amount + принадлежность дел в create_payout + запрет DELETE rates; чеки inn/closed_at + uniq имя счёта + непересечение отпусков + 11 FK-индексов) + лог смены этапа (updateCaseStageAction + stage в diff) + честные действия журнала (payroll_payout/act_deleted/comment case_id из БД) + 3 ветки формата + i18n (ru/uk) + overlap-хэндлинг отпусков + 5 integration. tsc/lint 0, unit 93/93, integration 96/96 (после восстановления env-грантов) |
| 3 | Касса: SQL-сальдо, бэкфилл, потолок 1000 строк | ✅ | 2026-06-11 | 1 миграция (3 RPC: cash_balances_before / cash_backfill_payments / cash_unsynced_payments_count — SECURITY DEFINER + cap-гейт внутри) + getCashReportData переписан на «месяц + SQL-перенос остатка + truncated», баннер бэкфилла (window.confirm, TODO→s5), entriesFromOpening (opening_date-фильтр), countCasesByStage → 5 head-count, доска .limit(600). tsc/lint 0, unit 95/95, integration 99/99 (чистый reset) |
| 4 | Дашборд и перф: агрегаты, водопады, Киев-время, optimistic locking | ✅ | 2026-06-11 | 3 миграции (2 RPC дашборда SECURITY INVOKER: payment_months поток + stock_months накопит. снимки по месяцам; optimistic-lock updated_at + touch-триггер; RLS-хоистинг политик cases через case_dept_visible + (select …) initplan) + getDashboardAnalytics на SQL (без выкачки payments/cases) + getDashboardCases .limit+truncated + Promise.all-водопады (3 файла) + kyivToday/kyivMonth (Киев-TZ) + просрочки/72ч + driver.js dynamic + listClients .limit(1000) + i18n + 1 unit + 1 integration. tsc/lint 0, unit 100/100, integration 103/103 (RLS-матрица цела → хоистинг без отката) |
| 5 | Отказоустойчивость UI: error.tsx, ConfirmDialog, мелкие UX-фиксы | ✅ | 2026-06-11 | 3 error-границы (global-error — изолир. `<html><body>` + инлайн-стили; `(app)/error.tsx` — локаль из cookie; корневой not-found) + `ConfirmDialog` (8 `window.confirm` заменены: дело/архив/акт/клиент/отпуск/выплата/бэкфилл/степпер) + «Акты» в навигации карточки (DOM-порядок) + ФОП в фильтре клиентов из CLIENT_KINDS + заголовки топбара (касса/подразделения/реквизиты) + удалён мёртвый пункт «Документы» + 3 молчаливых action'а → `?error=` (act delete/completion, archive) + STALE_STAGE_DAYS в constants.ts. tsc/lint 0, unit 100/100. Без миграций |
| 6 | UX: глобальная задача, колокольчик, loading, мобильные отчёты, доска | ✅ | 2026-06-11 | Глобальная «Новая задача» (TaskForm + cmdk-комбобокс дела ≤300, ui/combobox.tsx; кнопки на /tasks и в панели дня календаря с предзаполненным сроком; палитра → /tasks?new=1) + честный колокольчик (просрочено/сегодня по Киеву, 2 head-count, красная/брендовая точка, title с разбивкой) + loading.tsx (generic (app) + карточка дела + payroll + cash; ListingSkeleton → карточки-строки) + мобильные отчёты (payroll-list-mobile, касса: details-карточки дней) + паритет фильтров доски (категория/подразделение, basePath в CasesFilterSelect — фильтры с доски больше не уводят на список, q катается с подписью). 6.6 пропущен (опциональный). tsc/lint 0, unit 100/100. Без миграций |
| 7 | Продукт: исход «не заключили», конверсия, источники, конфликт-чек | ✅ | 2026-06-11 | 4 миграции (cases.outcome/lost_reason + RPC close_case_lost + lost-ветка триггера этапов; allowlist +case_lost; RPC dashboard_sources invoker; RPC conflict_check definer, 3 ветки) + closeCaseLostAction + кнопка «Не заключили»/бейдж/причина (карточка + список + моб) + конверсия и источники на staff-дашборде + конфликт-чек (route /api/conflict-check + blur форм клиента/дела) + словари ru/uk + 3 unit + 4 integration. tsc/lint 0, unit 103/103, integration 107/107 (чистый reset; cash.test конфликтует с сидовыми кассами — попутно) |
| 8 | Продукт: Telegram-напоминания + ICS-календарь | ✅ | 2026-06-11 | 1 миграция (user_notify_channels + 4 self-RLS + RPC notify_reissue_calendar_token, invoker, DB-random токен) + чистая логика buildDigest/buildIcs (+9 юнитов) + telegram.ts (fetch к Bot API) + 3 роута (telegram/webhook, cron/reminders, calendar/[token]) + исключение машинных роутов в proxy.ts + vercel.json cron 06:00 UTC + 4 env + блок «Уведомления и календарь» в /profile (actions/queries/client-карточка) + словари account.notifications (ru/uk). tsc/lint 0, unit 112/112, db reset+seed чисто. Роуты не тестировались (нет токена бота — проверка на проде) |
| 9 | Продукт: график платежей, просрочки, aging дебиторки | ✅ | 2026-06-11 | 3 миграции (payment_plan_items + RLS наследует дело; allowlist +payment_plan_updated; 2 RPC invoker overdue_plan_items/debt_aging) + чистая логика planWithStatuses/computeAging (+15 юнитов) + блок «График платежей» на карточке дела (queries/actions, ConfirmDialog, пункт plan в action-bar) + staff-дашборд: «Просроченные доплаты» + «Дебиторка по давности» (<30/30-60/60-90/90+) + Telegram-секция просрочек юриста в cron + словари ru/uk + 1 integration. tsc/lint 0, unit 127/127, integration 112/112 (чистый reset + разовый grant-фикс) |
| 10 | Дизайн-база: контраст AA, токены, переписать DESIGN.md | ✅ | 2026-06-11 | AA-база: fg-токены этапов/категорий (8 пар 4.65–7.96) + success/error/info-text (money-текст, бейджи) + шапки списков muted (5.58) + аватары затемнены (все ≥3.0) + активный пункт степпера bg+fg; токен --overlay (5 мест + driver-коммент); компонентные радиус-алиасы card/control/chip/modal (+9 замен rounded-[Npx], несовпавшие — в PROGRESS); sticky-шапки списков (top-0 контент-зоны, overflow шелла убран) + Table border-separate (границы на ячейках); печатный отчёт ЗП на бренд-синем; grad-brass→grad-brand, brass-bright→primary-bright, кнопка тура без градиента; JetBrains Mono 400/600; DESIGN.md переписан по факту (v1.0), CLAUDE.md §11 сжат. tsc/lint 0, unit 127/127. Без миграций |
| 11 | Дизайн-полировка: тосты, хоткеи, пресеты, «Мой день», консистентность | ✅ | 2026-06-11 | Toast-система (своя: провайдер+useToast+flashToast для redirect-форм, max 3, 4с+hover-пауза, a11y; применена в 8 формах, инлайн-дубли убраны) + хоткеи `/ N T ?` по e.code (укр/рус раскладки, гейт по caps, шпаргалка-модал + /help + футер палитры) + 3 пресета /cases («С долгом», «Закрытые за месяц» — архив+киевский месяц, «Зависшие» — sort stage_changed_at, добавлен в whitelist; «Срочные» пропущен — нет фильтра) + EmptyState (9 мест) + быстрые действия шапки дела (+Платёж=2-я модалка, +Задача/+Акт=scroll+details-id) + MoneyStat 11/18+прогресс + канбан-паритет (клиент 13, застой-точка, hover без тени) + «Мой день» (today-срез одним listUpcomingTasks, data-проп в UpcomingDeadlines) + консистентность (h2 16px ×18, gap-5 ×3, AA-хвосты s10: пилюля этапа bg+fg, prio-текст) + DESIGN.md §6/DecisionsLog. Сверка в браузере (1440px). tsc/lint 0, unit 127/127. Без миграций |
| 12 | Качество и финал: validation, вычистка, CI, e2e, коммиты | ✅ | 2026-06-12 | `src/lib/validation.ts` (UUID/parseAmount/isValidDate/todayIso — 27 файлов на импорты) + вычистка мёртвого леджера (case-ledger-block, mark/revertLedgerPaidAction, 4 query-экспорта, миграция v3_freeze_ledger) + 6 label-карт db.ts + CLAUDE.md §5/§7/§8 + CI (.github/workflows/ci.yml) + e2e core-flow.spec.ts (describe.skip) + постоянный грант-фикс (supabase/seed.sql + config.toml). tsc/lint 0, unit 127/127, integration 112/112, build ✓. Цикл собран в 12 коммитов (НЕ запушен — ждёт «ок») |

## Открытые вопросы пользователю (спросить при удобном случае, работу не блокируют)

1. **lawyer_id = responsible_id:** если один человек и продал, и ведёт дело —
   он получает один % или оба (lawyer% + expert%)? Пока: мягкое предупреждение
   в форме (сессия 1), расчёт не меняем.
2. **Telegram-бот:** нужен токен от @BotFather (`TELEGRAM_BOT_TOKEN`).
   Сессия 8 пишет код и тестирует dry-run без токена.
3. **Email-дайджест:** отложен (нужен провайдер, напр. Resend). Telegram — основной канал.
4. **Жёсткий блок закрытия дела без full+paid акта** — НЕ включаем
   (прежнее решение, PLAN-V2 «Открытые вопросы» №1).

## Вне скоупа цикла v3 (НЕ делать)

Интеграция ЄДРСР/Електронний суд; docx-шаблоны документов; клиентский портал
(Phase 3); email-интеграции/мессенджер-переписка по делу; pg_trgm-индексы
поиска (по плану — при 5k+ дел); полнотекстовый поиск по содержимому
документов; PWA/push; миграция старой CRM (Q18); тёмная тема.

---
---

# СЕССИЯ 1 — БД-безопасность: гард финансовых полей, гонки, скоуп DEFINER-функций

**Зачем (из аудита, подтверждено):** юрист/эксперт может править `category`
своего дела и поднять себе ЗП с 7% до 25% (RLS UPDATE пускает к всем колонкам,
гард есть только на override-ставках); гонка `recalc_case_totals` теряет
платежи из `paid_total`; правка act-платежа рассинхронизирует акт; смена
`contract_sum` не пересчитывает completion актов; `confirm_act_paid` доступен
admin'у чужого подразделения; удаление документов не скоупится по делу.

**Прочитай перед работой:**
- `supabase/migrations/20260610110000_department_scope_rls.sql` (политики cases, `private.case_visible`)
- `supabase/migrations/20260601100000_permission_overrides.sql` (гард overrides ~:515-538 — ОБРАЗЕЦ для нового гарда; политика `documents_delete_managers` ~:441-446; storage ~:705-713)
- `supabase/migrations/20260526100100_core_tables.sql` (`private.recalc_case_totals` ~:227-251)
- `supabase/migrations/20260610160000_case_acts.sql` (`confirm_act_paid` ~:183-270, `set_act_completion` ~:282-310, `recompute_case_act_completions` ~:137-170)
- `src/lib/cases/actions.ts` (`updateCaseAction` ~:413-497)
- `src/components/cases/case-form.tsx` (селект категории ~:336-346)
- `src/app/(app)/cases/[id]/edit/page.tsx`
- Структуру существующих integration-тестов: `tests/integration/` + `tests/README.md`

## Задачи

### 1.1 Миграция `v3_cases_guard_financial_fields`

Создай `npx supabase migration new v3_cases_guard_financial_fields`. Содержимое:

```sql
-- v3 s1: only staff may change payroll-defining fields of a case (audit HIGH#1)
create or replace function private.cases_guard_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_staff() then
    return new;
  end if;
  if new.category        is distinct from old.category
  or new.contract_sum    is distinct from old.contract_sum
  or new.lawyer_id       is distinct from old.lawyer_id
  or new.responsible_id  is distinct from old.responsible_id
  or new.client_id       is distinct from old.client_id then
    raise exception 'only staff can change financial fields of a case'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cases_guard_financial_fields on public.cases;
create trigger cases_guard_financial_fields
  before update of category, contract_sum, lawyer_id, responsible_id, client_id
  on public.cases
  for each row
  execute function private.cases_guard_financial_fields();
```

Перед этим проверь, что `private.is_staff()` существует (grep по миграциям) —
если функция называется иначе, используй фактическое имя.
Сравнения через `IS DISTINCT FROM` обязательны: форма шлёт полный payload,
триггер `BEFORE UPDATE OF` срабатывает на присутствие колонки в SET даже
без изменения значения.

### 1.2 Миграция `v3_recalc_totals_lock` — закрыть гонку paid_total

Найди ПОСЛЕДНЮЮ версию `private.recalc_case_totals` (исходно в
`20260526100100_core_tables.sql:227-251`; проверь grep'ом, не пересоздавалась ли
позже). Скопируй тело ЦЕЛИКОМ в новую миграцию и добавь ПЕРВОЙ строкой тела
(до вычисления суммы):

```sql
  -- serialize concurrent payment recalcs per case (audit: lost update race)
  perform 1 from public.cases where id = p_case_id for update;
```

(имя параметра возьми фактическое из тела). Больше ничего в функции не менять.

### 1.3 Миграция `v3_act_payment_immutable` — платёж акта неизменяем

```sql
-- v3 s1: payment created by act confirmation must not be edited in place
create or replace function private.payments_guard_act_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.act_id is not null and (
       new.amount  is distinct from old.amount
    or new.paid_at is distinct from old.paid_at
    or new.case_id is distinct from old.case_id
    or new.act_id  is distinct from old.act_id
  ) then
    raise exception 'act-linked payment is immutable; delete it to revert the act'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_act_payment on public.payments;
create trigger payments_guard_act_payment
  before update on public.payments
  for each row
  execute function private.payments_guard_act_payment();
```

`method`/`note` намеренно остаются редактируемыми.

### 1.4 Миграция `v3_contract_sum_recompute_acts`

Триггер-обёртка: при изменении `contract_sum` пересчитать completion актов.

```sql
create or replace function private.cases_recompute_acts_on_sum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contract_sum is distinct from old.contract_sum then
    perform private.recompute_case_act_completions(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists cases_recompute_acts_on_sum on public.cases;
create trigger cases_recompute_acts_on_sum
  after update of contract_sum on public.cases
  for each row
  execute function private.cases_recompute_acts_on_sum();
```

Проверь фактическую сигнатуру `recompute_case_act_completions` в
`20260610160000_case_acts.sql` (один uuid-аргумент) — подстрой вызов.

### 1.5 Миграция `v3_act_rpc_scope` — скоуп и дедлок confirm_act_paid / set_act_completion

Скопируй ПОЛНЫЕ тела `public.confirm_act_paid` и `public.set_act_completion`
из `20260610160000_case_acts.sql` в новую миграцию и внеси три правки:

1. В `confirm_act_paid` СРАЗУ после того, как из акта получен `case_id`
   (и до `FOR UPDATE` самого акта), добавь:
   `perform 1 from public.cases where id = v_case_id for update;`
   (имя переменной — фактическое). Это и анти-дедлок двух параллельных
   подтверждений по одному делу, и сериализация с recalc.
2. В `confirm_act_paid` к существующей проверке прав добавь видимость дела:
   право = (`private.can_manage_users()` ИЛИ юрист дела) **И**
   `private.case_visible(<lawyer_id дела>, <responsible_id дела>)`.
   Посмотри, какие поля дела уже выбираются в функции — добери lawyer_id /
   responsible_id в тот же select.
3. В `set_act_completion` замени проверку `private.is_staff()` на
   `private.is_staff() and private.case_visible(<lawyer_id>, <responsible_id>)`
   (выбери поля дела по case_id акта).

### 1.6 Миграция `v3_documents_delete_scope`

Пересоздай политику удаления документов и storage-политику так, чтобы
обладатель `delete_documents` мог удалять только документы ВИДИМЫХ ему дел:

```sql
drop policy if exists documents_delete_managers on public.documents;
create policy documents_delete_managers on public.documents
  for delete using (
    private.can('delete_documents')
    and private.can_see_case(case_id)
  );
```

Для storage: найди в `20260601100000_permission_overrides.sql` (~:705-713)
политику `case_documents_delete_staff` на `storage.objects`, пересоздай её,
добавив к `private.can('delete_documents')` условие
`name like 'cases/%'` И проверку видимости дела. Посмотри, как
SELECT-политика storage в том же файле достаёт case_id из пути объекта
(`storage.foldername(name)` или split_part) — скопируй ТОТ ЖЕ приём.
Если SELECT-политика проверяет видимость через documents-таблицу по
storage_key — сделай идентично ей. Не изобретай свой парсинг пути.

### 1.7 TS-зеркало: `updateCaseAction`

В `src/lib/cases/actions.ts` (`updateCaseAction`):
- после загрузки текущего дела (`before`, оно уже читается для diff) получи
  профиль текущего пользователя (рядом наверняка уже есть `getCurrentUser()` /
  загрузка роли — найди существующий способ в этом же файле);
- если роль НЕ в `('owner','admin','office_manager')`: сравни присланные
  `category`, `contract_sum`, `lawyer_id`, `responsible_id`, `client_id`
  со значениями `before`. Любое отличие → верни `fieldErrors` для этого поля
  с текстом из словаря (новый ключ, см. 1.9), БД-update не выполняй.
  Если отличий нет — просто НЕ включай эти 5 полей в update-payload
  (иначе триггер 1.1 сработает на полный SET).

### 1.8 Форма: `case-form.tsx` + страница edit

- `src/app/(app)/cases/[id]/edit/page.tsx`: там уже вычисляется staff-признак
  для этапов — передай в `<CaseForm>` проп `isStaff` (если его ещё нет).
- В `CaseForm` в режиме редактирования при `!isStaff`: поля категория,
  сумма договора, клиент, юрист, эксперт — `disabled` + серый hint
  «Меняет только руководство» (ключ в словари). В режиме создания ничего
  не менять.
- Предупреждение про совпадение ролей: в `CaseForm` при
  `lawyer_id === responsible_id` (и оба заданы) показать НЕблокирующий
  жёлтый текст под полем эксперта: «Юрист и эксперт — один человек: он
  получит обе ставки (вопрос на согласовании)» (ключи uk/ru).

### 1.9 Словари

В `src/lib/i18n/messages/ru/cases.ts` и `uk/cases.ts` добавь ключи:
`financialFieldStaffOnly` («Это поле меняет только руководство»),
`sameLawyerExpertWarning` (текст выше). Помни: uk-словарь типизирован как
`typeof ru` — добавлять в ОБА файла, иначе tsc упадёт.

### 1.10 Integration-тесты

В `tests/integration/` найди файл про RLS дел (или создай
`tests/integration/v3-financial-guard.test.ts` по образцу соседних —
скопируй setup/teardown паттерн IT-namespace). Кейсы:
1. lawyer дела меняет `subject` своего дела → ок;
2. lawyer дела меняет `category` → ошибка 42501;
3. owner меняет `category` → ок;
4. UPDATE `amount` платежа с `act_id` (под owner) → ошибка 42501;
5. owner меняет `contract_sum` дела с paid-актом → у акта пересчитан
   `completion` (проверь значение);
6. admin ДРУГОГО подразделения вызывает `confirm_act_paid` по чужому делу
   → ошибка (подбери ожидание по фактическому тексту исключения).

## Что НЕ делать
- Не менять политику UPDATE на cases (гард — триггером, политика остаётся).
- Не запрещать `lawyer_id = responsible_id` (только предупреждение).
- Не трогать процент-расчёты payroll.

## DoD — общий чеклист + db reset + integration зелёные.

---

# СЕССИЯ 2 — Журнал и целостность: allowlist, лог этапа, выплаты, чеки, индексы

**Зачем:** правка платежа и удаление акта не журналируются (нет действий в
allowlist); штатная смена этапа из карточки дела не пишется в журнал
(нарушение §7-9); выплата ЗП маскируется под `payment_created`; сумма
аллокаций выплаты ничем не сверяется с суммой транзакции; `create_payout`
не проверяет принадлежность дел; `payroll_rates` можно удалить; нет CHECK
на `inn`/`closed_at`; пересечения отпусков не проверяются; голые FK без индексов.

**Прочитай:** `supabase/migrations/20260610170000_activity_log_act_actions.sql`
(ТЕКУЩИЙ полный allowlist — он база для 2.1);
`20260601110000_payroll_manual_transactions.sql` (create_payout ~:242-293,
RLS ~:96-102); `20260528110000_payroll.sql` (~:47-52);
`src/lib/cases/actions.ts` (`updateCaseStageAction` ~:606-677, исключение
stage из diff ~:531-533, образец лога в `advanceCaseStageAction` ~:856-861);
`src/lib/payroll/actions.ts` (`createPayoutAction` ~:363-372);
`src/lib/acts/actions.ts` (`deleteActAction` ~:267-284);
`src/lib/comments/actions.ts` (~:143-148);
`src/lib/activity-log/format.ts` + словари `messages/{ru,uk}/activity.ts`.

## Задачи

### 2.1 Миграция `v3_activity_actions` (⚠ грабля allowlist!)

По правилу из шапки: скопируй ПОЛНЫЙ список действий из
`20260610170000_activity_log_act_actions.sql` (CHECK + тело `log_activity`)
и добавь действия: `payment_updated`, `act_deleted`, `payroll_payout`.
Гейты внутри `log_activity` для новых действий — по образцу
`payment_created`/`act_paid` из того же файла (case-scope).

### 2.2 Лог смены этапа

- `updateCaseStageAction`: после успешного UPDATE добавь `logActivity` с
  `action: 'case_updated'` и diff `{ stage: { from, to } }` — скопируй
  ФОРМАТ вызова из `advanceCaseStageAction` (~:856-861) один в один.
- `updateCaseAction`: найди место, где stage намеренно исключается из diff
  (~:531-533), и убери исключение — stage должен попадать в diff как
  обычное поле.

### 2.3 Честные действия журнала

- `createPayoutAction` (`src/lib/payroll/actions.ts` ~:363-372): замени
  `action: 'payment_created'` на `action: 'payroll_payout'` (changes оставь).
- `deleteActAction` (`src/lib/acts/actions.ts`): добавь `logActivity`
  `action: 'act_deleted'` с `{ number, amount }` в changes. case_id бери
  из строки акта, ПРОЧИТАННОЙ ИЗ БД до удаления (не из formData).
- `updateCommentAction` (`src/lib/comments/actions.ts` ~:143-148): сейчас
  `p_entity_id` берётся из formData — перепиши: прочитай комментарий из БД,
  возьми его фактический `case_id` (паттерн «CSO #2», как в payment/document
  actions этого проекта).
- `src/lib/activity-log/format.ts` + `messages/{ru,uk}/activity.ts`: добавь
  локализацию для `payment_updated`, `act_deleted`, `payroll_payout`
  (по образцу соседних веток формата). `payment_updated` пока нигде не
  вызывается из UI — это запас под RLS-правки платежей; ветку формата всё
  равно добавь.

### 2.4 Миграция `v3_payout_integrity`

1. Unique-индекс: `create unique index if not exists payout_allocations_uniq
   on public.payout_allocations (transaction_id, case_id, role_in_case);`
2. Constraint-триггер согласованности (DEFERRABLE INITIALLY DEFERRED):
   функция `private.check_payout_allocations()` — для транзакции
   (`payroll_transactions`) с `kind = 'payout'` сумма её аллокаций должна
   равняться `amount`. Триггер вешается `after insert or update or delete`
   на `payout_allocations` И `after update of amount on payroll_transactions`.
   В функции бери transaction_id из NEW/OLD (учти DELETE: NEW нет).
   Сначала прочитай фактические kind-значения в
   `20260601110000_payroll_manual_transactions.sql` (если kind называется
   иначе — подстрой). Транзакции без аллокаций (бонусы/удержания) проверка
   не трогает.
3. `create_payout`: скопируй полное тело, добавь внутрь цикла по аллокациям
   проверку: `exists (select 1 from public.cases c where c.id = <case_id>
   and ((<role> = 'lawyer' and c.lawyer_id = p_user_id) or (<role> = 'expert'
   and c.responsible_id = p_user_id)))`, иначе `raise exception`.
4. `payroll_rates`: запрет DELETE. Посмотри текущую политику
   `payroll_rates_write_owner` (`FOR ALL`): пересоздай как ДВЕ политики —
   `for update` и `for insert` (owner), DELETE-политики не создавать
   (RLS без политики = запрет).

### 2.5 Миграция `v3_misc_checks_indexes`

```sql
alter table public.clients
  add constraint clients_inn_format
  check (inn is null or inn ~ '^[0-9]{8,12}$') not valid;

alter table public.cases
  add constraint cases_closed_after_opened
  check (closed_at is null or closed_at >= opened_at) not valid;

create unique index if not exists cash_accounts_name_uniq
  on public.cash_accounts (lower(name));
```

`NOT VALID` обязателен (на проде могут быть исторические данные) —
`VALIDATE CONSTRAINT` НЕ выполнять.

Пересечение отпусков — БД-триггером (НЕ exclude-констрейнтом, чтобы не
сломать db push историческими пересечениями):

```sql
create or replace function private.absences_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.absences a
    where a.user_id = new.user_id
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.starts_on <= new.ends_on
      and a.ends_on   >= new.starts_on
  ) then
    raise exception 'absence period overlaps an existing one for this user'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists absences_no_overlap on public.absences;
create trigger absences_no_overlap
  before insert on public.absences
  for each row execute function private.absences_no_overlap();
```

Индексы на горячие FK (все `if not exists`): `payments(created_by)`,
`documents(uploaded_by)`, `tasks(created_by)`, `cases(archived_by)`,
`cash_entries(case_id)`, `cash_entries(created_by)`, `case_acts(created_by)`,
`case_acts(scan_document_id)`, `payroll_ledger(created_by)`,
`absences(created_by)`, `payroll_transactions(created_by)`.
Перед созданием проверь grep'ом, что такого индекса ещё нет.

### 2.6 UI-обработка нового исключения отпусков

Найди server action создания отпуска (`src/lib/absences/actions.ts` или
рядом) и добавь в маппинг ошибок ветку для текста/кода пересечения →
дружелюбное сообщение (ключ `absences.overlapError` в словари uk/ru:
«Период пересекается с существующим отсутствием»).

### 2.7 Тесты

Integration (`tests/integration/v3-journal-integrity.test.ts`):
1. смена этапа через `updateCaseStageAction`-путь (или прямой UPDATE stage
   под staff) оставляет запись в `activity_log`;
2. вставка второй аллокации, ломающей сумму payout-транзакции → ошибка
   на коммите;
3. `create_payout` с аллокацией на чужое дело → исключение;
4. DELETE из `payroll_rates` под owner → 0 строк (запрещено RLS);
5. два пересекающихся отпуска одному юзеру → второй падает.
Юнит: не требуется.

## Что НЕ делать
- Не добавлять UI правки платежей (`payment_updated` — задел, не фича).
- Не валидировать NOT VALID констрейнты.
- Не трогать `payroll_ledger` (его судьба — сессия 11).

---

# СЕССИЯ 3 — Касса: SQL-сальдо, бэкфилл, потолок 1000 строк

**Зачем (подтверждено):** PostgREST `max_rows = 1000` тихо режет выдачу;
`getCashReportData` качает ВСЮ историю `cash_entries` (из-за ascending-
сортировки первыми пропадут СВЕЖИЕ операции); платежи, внесённые до создания
счетов, навсегда выпадают из кассы (нет бэкфилла); счётчики этапов и доска
тоже без лимитов; сальдо игнорирует `opening_date`.

**Прочитай:** `src/lib/cash/queries.ts` (весь), `src/lib/cash/saldo.ts`,
`src/app/(app)/reports/cash/page.tsx`, `src/components/cash/cash-report.tsx`,
`tests/unit/cash-saldo.test.ts`, миграцию `20260610190000_cash_register.sql`
(`cash_resolve_account`, политика, триггер), `src/lib/cases/queries.ts`
(`countCasesByStage` ~:320-339, `listCasesForBoard` ~:533-547).

## Задачи

### 3.1 Миграция `v3_cash_rpc` — две функции

```sql
-- opening balances per account strictly before a date (RLS bypassed -> check cap inside)
create or replace function public.cash_balances_before(p_before date)
returns table (account_id uuid, balance numeric)
language sql
security definer
set search_path = ''
as $$
  select e.account_id,
         coalesce(sum(case when e.direction = 'in' then e.amount else -e.amount end), 0)
  from public.cash_entries e
  join public.cash_accounts a on a.id = e.account_id
  where e.entry_date < p_before
    and e.entry_date >= a.opening_date          -- операции до opening_date уже включены в opening_balance
    and private.can('can_manage_cash')          -- право проверяется внутри DEFINER
  group by e.account_id;
$$;

-- backfill: create missing cash entries for payments that have none
create or replace function public.cash_backfill_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if not private.can('can_manage_cash') then
    raise exception 'cash access denied' using errcode = '42501';
  end if;
  insert into public.cash_entries (account_id, entry_date, direction, amount, description, case_id, payment_id, created_by)
  select acc.id, p.paid_at::date, 'in', p.amount,
         'Бэкфилл платежа по делу', p.case_id, p.id, p.created_by
  from public.payments p
  cross join lateral (select private.cash_resolve_account(p.method) as id) acc
  where acc.id is not null
    and not exists (select 1 from public.cash_entries e where e.payment_id = p.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
```

Перед написанием сверь фактические сигнатуры: имя/аргумент
`private.cash_resolve_account` (method-тип), тип `payments.paid_at`
(если date — убрать `::date`), формат `description` (длина ≤300),
проверку права (`private.can('can_manage_cash')` — точное имя cap'а в
`20260610190000`). Подстрой под факт.

### 3.2 `getCashReportData` — только месяц + RPC

Перепиши `src/lib/cash/queries.ts`:
- начальные остатки: `supabase.rpc('cash_balances_before', { p_before: monthStartISO })`;
- операции: только `entry_date >= monthStart AND < nextMonthStart`,
  с `.order(...)` как раньше и `.limit(5000)`; дополнительно запроси
  `count: 'exact'` и верни флаг `truncated = count > rows.length` —
  UI (cash-report) при `truncated` показывает жёлтое предупреждение
  «Показаны не все операции месяца» (ключ в словари);
- `opening_date`: записи месяца с `entry_date < opening_date` счёта исключай
  из расчёта баланса (передавай в saldo-функции уже отфильтрованный массив),
  но показывай в таблице с приглушённой пометкой — посмотри, как сейчас
  устроен флаг `hasBeforeOpening` на странице, и переиспользуй его текст.
- Итоговый интерфейс данных для `buildAccountSaldo` НЕ меняй (чистые функции
  в `saldo.ts` остаются как есть): ты меняешь только то, ЧТО им скармливается
  (opening из RPC + операции месяца).

### 3.3 Кнопка бэкфилла

- Server action `backfillCashAction` в `src/lib/cash/actions.ts` (паттерн
  соседних actions: requireUser + cap-проверка TS-зеркалом, вызов
  `supabase.rpc('cash_backfill_payments')`, `revalidatePath('/reports/cash')`,
  вернуть `{ ok, count }`).
- На `/reports/cash` (для обладателя cap): если есть платежи без строк кассы —
  показать баннер «N платежей не отражены в кассе» с кнопкой
  «Синхронизировать». Количество посчитай лёгким запросом: payments
  `count exact head:true` с фильтром `act_id`?? — НЕТ, правильный фильтр:
  платежи, у которых нет cash_entries. Это анти-join, который PostgREST
  напрямую не умеет → добавь в миграцию 3.1 третью функцию:
  `public.cash_unsynced_payments_count() returns integer`
  (`security definer`, та же проверка cap, `select count(*) from payments p
  where not exists (select 1 from cash_entries e where e.payment_id = p.id)`).
- Кнопка через ConfirmDialog? Его ещё нет (сессия 5) — используй пока
  `window.confirm` с TODO-комментарием `-- v3 s5 заменит на ConfirmDialog`.

### 3.4 Счётчики этапов и доска

- `countCasesByStage` (`src/lib/cases/queries.ts` ~:320-339): замени выборку
  строк на 5 параллельных count-запросов:
  `Promise.all(CASE_STAGES.map(s => supabase.from('cases').select('id', { count: 'exact', head: true }).eq('stage', s)...))`
  — СОХРАНИ все текущие фильтры исходной функции (archived и пр.) в каждом
  запросе. Сигнатуру функции не меняй.
- `listCasesForBoard` (~:533-547): добавь `.limit(600)` и сортировку как есть.
  Клиентский cap 100/колонку остаётся.

### 3.5 Тесты

- Юнит `tests/unit/cash-saldo.test.ts`: должен остаться зелёным БЕЗ правок
  (если пришлось править — ты сломал контракт saldo.ts, пересмотри 3.2).
  Добавь новый кейс: операция с `entry_date < opening_date` не влияет на
  баланс (на уровне той функции, где ты фильтруешь).
- Integration `tests/integration/v3-cash-rpc.test.ts`:
  1. `cash_balances_before` возвращает сумму только до даты;
  2. `cash_backfill_payments` создаёт строки для платежей без cash_entries
     и идемпотентен (второй вызов → 0);
  3. вызов RPC под юзером без `can_manage_cash` → ошибка/пусто.

## Что НЕ делать
- Не трогать триггер `cash_sync_on_payment`.
- Не менять структуру отчёта/вкладок UI (только баннеры и источник данных).

---

# СЕССИЯ 4 — Дашборд и перф: агрегаты, водопады, Киев-время, optimistic locking

**Зачем:** дашборд дважды качает все дела и ВСЕ платежи за всю историю
(потолок 1000 = враньё цифр); последовательные await там, где можно
параллельно; дефолтный месяц отчётов и `closed_at` считаются по UTC сервера
(на границе месяца уезжают в чужой период); конкурентная правка дела —
last-write-wins; RLS-предикат дел зовёт DEFINER-функцию на каждую строку.

**Прочитай:** `src/lib/dashboard/queries.ts` (ЦЕЛИКОМ, особенно ~:41-48,
:89-115, :137-147 `currentKyivMonth`, :193-201), `src/lib/dashboard/compute.ts`,
`src/app/(app)/page.tsx` (~:72-75, :189-191, :269-274),
`src/app/(app)/cases/page.tsx` (~:160-177),
`src/app/(app)/cases/[id]/page.tsx` (~:95-120),
`src/lib/payroll/month.ts` (~:20-25), `src/lib/cases/actions.ts` (~:114-121
todayIso), `src/lib/tasks/queries.ts` (~:151-172),
`src/components/onboarding/onboarding-provider.tsx` (~:14),
миграцию `20260610110000_department_scope_rls.sql` (политики cases),
`src/lib/cases/queries.ts` (`listClientsForSelect` ~:650-661).

## Задачи

### 4.1 Дашборд: убрать неограниченные выборки

Сначала прочитай `compute.ts` и выпиши, какие именно агрегаты строятся из
`cases` и `payments`. Затем:

1. Миграция `v3_dashboard_rpc` — функция **security INVOKER** (RLS вызывающего
   обязана работать — видимость дел у каждой роли своя!):

```sql
create or replace function public.dashboard_payment_months(p_from date)
returns table (month_start date, total numeric)
language sql
security invoker
set search_path = ''
as $$
  select date_trunc('month', p.paid_at)::date, sum(p.amount)
  from public.payments p
  where p.paid_at >= p_from
  group by 1
  order by 1;
$$;
```

   (тип `paid_at` сверь; если для серий нужен разрез по категории дела —
   добавь join cases и колонку category, СМОТРИ что реально требует compute.ts.)
   `grant execute on function public.dashboard_payment_months to authenticated;`

2. `getDashboardAnalytics`: платежи получай ТОЛЬКО через этот RPC с нижней
   границей (6 полных месяцев) — полную таблицу payments не качать вовсе.
   Если compute.ts использует payments для «всего за всё время» — замени на
   второй лёгкий RPC-агрегат (`sum(amount)` одним числом, тоже invoker)
   вместо строк.
3. Дела: оставь ОДИН fetch. `getDashboardCases` и `getDashboardAnalytics`
   сейчас качают всё дважды — объедини: пусть страница один раз получает
   список и передаёт в обе функции (поменяй сигнатуры; смотри вызовы в
   `page.tsx`). На сам fetch дел добавь `.limit(2000)` + `count:'exact'`;
   при `count > 2000` верни флаг `truncated` и выведи на дашборде тонкое
   предупреждение (ключ в словари). Это компромисс Phase 1 — фиксируем
   честно, не молча.
4. Юнит-тесты compute (`tests/unit/...` — найди существующие на
   `computePersonalEarnings`) должны остаться зелёными; если менял формат
   входа — обнови тесты осознанно.

### 4.2 Водопады → Promise.all

- `page.tsx` ~:189-191: `getPayrollRates()` и `getFixedSalaryUserIds()` —
  в один `Promise.all`, затем `getDashboardAnalytics`.
- `cases/page.tsx` ~:160-177: два последовательных батча (справочники
  фильтров и список+счётчики) слей в ОДИН `Promise.all`.
- `cases/[id]/page.tsx` ~:95-120: `caseHasDocOfType` добавь элементом в
  существующий `Promise.all`.

### 4.3 Киев-время

- В `src/lib/payroll/month.ts` перепиши `currentMonth()` через
  `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit' })`
  (посмотри готовый паттерн `currentKyivMonth` в `dashboard/queries.ts:137-147`
  — НЕ дублируй: вынеси общий хелпер `kyivToday()` / `kyivMonth()` в
  `src/lib/payroll/month.ts` и переиспользуй его в dashboard/queries).
- `todayIso` в `cases/actions.ts` (~:114-121) — на тот же киевский хелпер.
- Юнит-тест `tests/unit/kyiv-dates.test.ts`: `vi.setSystemTime` на
  `2026-06-30T22:30:00Z` (= 01:30 Киева 1 июля) → месяц `2026-07`;
  на `2026-07-01T02:30:00Z` → тоже `2026-07`; на `2026-06-30T20:00:00Z` →
  `2026-06`.

### 4.4 Optimistic locking для дела

1. Миграция `v3_cases_updated_at`:

```sql
alter table public.cases add column if not exists updated_at timestamptz not null default now();

create or replace function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists cases_touch_updated_at on public.cases;
create trigger cases_touch_updated_at
  before update on public.cases
  for each row execute function private.touch_updated_at();
```

2. `CaseForm` (режим edit): hidden input `base_updated_at` со значением из
   загруженного дела (страница edit должна его select'ить — добавь колонку
   в запрос).
3. `updateCaseAction`: к `.update(...).eq('id', ...)` добавь
   `.eq('updated_at', baseUpdatedAt)` и `.select('id')`; если вернулось
   0 строк → верни formError «Дело изменено другим пользователем — обновите
   страницу и повторите» (ключи uk/ru). ВАЖНО: `updated_at` в форму отдавай
   строкой ровно как пришла из БД (ISO с таймзоной), без преобразований.

### 4.5 «Приближающиеся сроки»

`listUpcomingTasks` (`tasks/queries.ts` ~:151-172): раздели данные:
просроченные (`due_at < now`, count + топ-3 свежих просрочки по
`due_at desc`) и ближайшие 72ч (`now ... now+72h`, asc, limit 10).
Обнови `upcoming-deadlines-block.tsx`: две подсекции «Просроченные (N)» и
«Ближайшие 72 часа» (ключи в словари uk/ru; смотри текущие ключи calendar/tasks).

### 4.6 driver.js — динамический импорт

`onboarding-provider.tsx:14`: убери статический `import { driver } ...`;
в месте старта тура — `const { driver } = await import('driver.js')`.
CSS driver.js: проверь, как подключён (`import 'driver.js/dist/driver.css'`
в globals или в провайдере) — если статический CSS-импорт в провайдере,
оставь его (CSS лёгкий), динамизируй только JS.

### 4.7 RLS-хоистинг политик cases (ОСТОРОЖНО)

Миграция `v3_cases_rls_initplan`:
1. Создай `private.case_dept_visible(p_lawyer uuid, p_responsible uuid)` —
   скопируй из `private.case_visible` ТОЛЬКО департаментную ветку
   (руководитель + совпадение подразделения), без «видит всё» и без
   «свои дела».
2. Пересоздай политики `cases_select_visible` и UPDATE-политику cases:
   `using ( (select private.can_see_all_cases())
   or lawyer_id = (select private.active_uid())
   or responsible_id = (select private.active_uid())
   or private.case_dept_visible(lawyer_id, responsible_id) )`
   — подзапросы-скаляры вычислятся один раз (initplan).
   Сверь точные имена функций/политик по `20260610110000`.
3. **Прогони `npm run test:integration` (RLS-матрица).** Если красное и не
   чинится за 15 минут — УДАЛИ эту миграцию (файл), верни как было,
   пометь пункт в PROGRESS «отложено: hoisting сломал X» и продолжай.
   Это единственный пункт сессии с правом отката.

### 4.8 Комбобокс клиентов — ОПЦИОНАЛЬНО (если остался ресурс)

`listClientsForSelect` (~:650-661): добавь `.limit(1000)` (защита от
усечения молча) — это обязательная часть. Полноценный асинхронный комбобокс
НЕ делай (отложен, см. сессию 6 п.6.6).

## Тесты
Юниты: kyiv-dates; существующие dashboard-юниты зелёные.
Integration `v3-dashboard-rpc.test.ts`: `dashboard_payment_months` под
lawyer возвращает только платежи его дел (RLS invoker работает!).

## Что НЕ делать
- Не кэшировать страницы (force-dynamic не трогать).
- Не вводить optimistic locking нигде, кроме cases.

---

# СЕССИЯ 5 — Отказоустойчивость UI: error.tsx, ConfirmDialog, мелкие UX-фиксы

**Зачем (подтверждено):** ни одного error.tsx при 59 throw-точках — любой сбой
БД = английский системный экран; деструктив через голый `window.confirm`;
секция «Акты» выпала из навигации карточки дела; фильтр клиентов не знает ФОП;
у «Кассы» в топбаре заголовок «ЮрКейс»; мёртвый пункт «Документы»; три
action'а молча глотают ошибки.

**Прочитай:** `src/app/(app)/cases/[id]/not-found.tsx` (единственный образец
стиля служебного экрана), `src/components/ui/modal.tsx`,
`src/components/cases/case-action-bar.tsx` (:18-24, :46-52) и фактический
порядок секций в `src/app/(app)/cases/[id]/page.tsx` (id= на :347, :513,
:526, :535 и рядом), `src/app/(app)/clients/page.tsx` (:35-37, :81-85),
`src/components/app/topbar.tsx` (:14-38), `src/components/app/sidebar-nav.tsx`
(:61, :106-122), `src/lib/i18n/config.ts` (имя cookie локали),
`src/lib/cases/actions.ts` (`deleteCaseAction` — образец возврата ошибки).

## Задачи

### 5.1 Error-границы

1. `src/app/global-error.tsx` — `'use client'`, ОБЯЗАТЕЛЬНО рендерит
   `<html><body>` (требование Next). Текст двуязычно статикой
   («Щось пішло не так / Что-то пошло не так»), кнопка `reset()`.
2. `src/app/(app)/error.tsx` — `'use client'`, props `{ error, reset }`.
   Локаль возьми из cookie на клиенте (имя cookie — из `lib/i18n/config.ts`,
   читать `document.cookie`; fallback uk). Вёрстка — по образцу
   `cases/[id]/not-found.tsx` (карточка, заголовок, текст, две кнопки:
   «Попробовать снова» → `reset()`, «На главную» → `<a href="/">`).
   `console.error(error)` внутри `useEffect`.
3. `src/app/not-found.tsx` — корневой 404 (Server Component, локаль через
   существующий серверный helper из `lib/i18n/server.ts`), стиль тот же.
4. Ключи в словари: `errors.boundaryTitle`, `errors.boundaryRetry`,
   `errors.boundaryHome`, `errors.notFoundTitle`, `errors.notFoundText`
   (uk + ru; посмотри существующий `messages/{ru,uk}/errors.ts`).

### 5.2 ConfirmDialog

Новый `src/components/ui/confirm-dialog.tsx` ('use client') на базе
`ui/modal.tsx`: пропсы `{ open, title, description?, confirmLabel,
cancelLabel?, tone?: 'danger'|'default', pending?, onConfirm, onClose }`.
Кнопка danger — стиль деструктивной кнопки проекта (найди существующий
красный variant у Button). Esc/фокус-трап — из modal.tsx как есть.

Замени ВСЕ `window.confirm` (grep по `window.confirm` в src — ~8-9 мест,
включая добавленный в сессии 3): `delete-case-form.tsx`,
`archive-case-form.tsx`, `acts/act-row-controls.tsx`,
`payroll/payroll-actions.tsx`, `clients/delete-client-form.tsx`,
`absences/delete-absence-button.tsx`, бэкфилл кассы и остальное, что найдёт
grep. В диалоге показывай контекст: для платежа/акта — сумму и номер
(данные у компонентов уже есть). Тексты — в словари
(`common.confirmTitle`, и по месту: `cases.deleteConfirmText` и т.п. —
переиспользуй СТАРЫЕ строки из window.confirm, они уже локализованы).

### 5.3 Навигация карточки дела

`case-action-bar.tsx`: добавь `acts` в `SECTION_IDS` и пункт «Акты» в массив
секций; выстрой порядок пунктов РОВНО по фактическому порядку `id=` секций
в `cases/[id]/page.tsx` (проверь глазами: overview → comments → acts →
documents → tasks → history — если в DOM иначе, бери DOM-порядок).
Подпись пункта — из словаря актов (ключ уже есть в `messages/*/acts.ts`,
найди заголовок секции).

### 5.4 ФОП в фильтре клиентов

`clients/page.tsx`: `isClientKind` и `KIND_OPTIONS` генерируй из константы
`CLIENT_KINDS` (`src/lib/types/db.ts:336-341`), а не хардкодом — все три
типа (+ «Все»). Подписи — существующие ключи enum'ов в словарях.

### 5.5 Заголовки топбара

`topbar.tsx` `titleForPath`: добавь ветки `/reports/cash` → `t.topbar.cash`,
`/settings/departments` → `t.topbar.departments`, `/settings/requisites` →
`t.topbar.requisites` (ключи в `messages/{ru,uk}/topbar.ts`; «Касса/Каса»,
«Подразделения/Підрозділи», «Реквизиты/Реквізити»). Ветки ставь ВЫШЕ общих
префиксных правил `/reports` и `/settings` (порядок матчинга!).

### 5.6 Пункт «Документы»

`sidebar-nav.tsx`: удали мёртвый пункт (enabled:false) из массива навигации
целиком. Если на него завязан tour-step онбординга
(`lib/onboarding/tour-steps.ts`) — удали/поправь соответствующий шаг.

### 5.7 Молчаливые отказы actions

`deleteActAction`, `setActCompletionAction` (`src/lib/acts/actions.ts`
~:267-306), `setCaseArchived` (`src/lib/cases/actions.ts` ~:787-791):
приведи к паттерну `deleteCaseAction` — возврат `{ ok: false, error }` или
`?error=` редирект (выбери тот же механизм, что у deleteCaseAction).
В вызывающих компонентах покажи ошибку (тот же приём, что у удаления дела).

### 5.8 STALE_STAGE_DAYS

Создай `src/lib/cases/constants.ts`: `export const STALE_STAGE_DAYS = 14;`
Замени три дубля: `cases/page.tsx:57`, `case-list-mobile.tsx:17`,
`cases/[id]/page.tsx:129` (там голое число 14).

## Тесты
Юнитов нет (UI). Ручная проверка не требуется, но tsc/lint обязательны.
В PROGRESS отметь количество заменённых window.confirm.

## Что НЕ делать
- Не делать loading.tsx (сессия 6), не трогать дизайн-токены (сессия 10).

---

# СЕССИЯ 6 — UX: глобальная задача, колокольчик, loading, мобильные отчёты, доска

**Прочитай:** `src/components/tasks/task-form.tsx` (как работает
`lockedCaseId`), `src/app/(app)/tasks/page.tsx` (:69-117),
`src/components/app/command-palette.tsx` (:219-269 — существующие действия),
`src/app/(app)/calendar/page.tsx`, `src/components/app/topbar.tsx`
(:100-114 колокольчик), `src/lib/tasks/queries.ts` (:127-139),
существующие `loading.tsx` (5 файлов) и `src/components/ui/skeleton.tsx`
(:53-81), `src/components/ui/card-table.tsx` (:35-43),
`src/components/cases/case-list-mobile.tsx` (образец мобильного списка),
`src/app/(app)/reports/payroll/page.tsx` (:169-228),
`src/components/cash/cash-report.tsx`, `src/app/(app)/cases/board/page.tsx`
(:74-100) и `cases/page.tsx` (:261-268 `boardHref`).

## Задачи

### 6.1 Глобальное создание задачи

1. `TaskForm`: режим без `lockedCaseId` — селект «Дело» (обязательный):
   используй `cmdk` (уже в deps, см. command-palette) как комбобокс с
   фильтрацией по подгруженному списку видимых дел (запрос: id,
   number_title, limit 300, сортировка по opened_at desc). Не городи
   серверный поиск — клиентской фильтрации по 300 делам достаточно.
2. `/tasks`: кнопка «Новая задача» (primary, рядом с тулбаром) → модалка
   с TaskForm (Modal уже есть). После успеха — refresh списка (паттерн
   соседних форм).
3. Календарь: на панели выбранного дня — кнопка «+ Задача» → та же модалка
   с предзаполненным `due_at` выбранного дня.
4. Командная палитра: действие «Создать задачу» → `router.push('/tasks?new=1')`;
   `/tasks` при `?new=1` открывает модалку (useSearchParams в клиентской
   обёртке списка или отдельный маленький клиентский компонент).
5. Ключи словарей: `tasks.newTask`, `tasks.selectCase` и т.д. (uk+ru).

### 6.2 Честный колокольчик

`topbar.tsx` + `tasks/queries.ts`: счётчик = просроченные открытые задачи
пользователя (due_at < now) + сегодняшние (due_at сегодня по Киеву,
хелпер из сессии 4). Точка-индикатор: красная если есть просроченные,
обычная если только сегодняшние, нет — ничего. `aria-label`/`title`:
«Просрочено: N, сегодня: M». Запрос — count head:true ×2 (дёшево).

### 6.3 loading.tsx

1. `src/app/(app)/loading.tsx` — generic: центрированный Skeleton-блок
   (стиль существующих skeleton'ов) — он накроет дашборд и все маршруты
   без собственного loading.
2. Специализированные: `cases/[id]/loading.tsx` (шапка + 3 секции-скелета),
   `reports/payroll/loading.tsx`, `reports/cash/loading.tsx` (таблица-скелет
   как ListingSkeleton).
3. `ListingSkeleton` (`skeleton.tsx:53-81`): приведи к виду «карточек-строк»
   (отдельные rounded-блоки с gap-2 на фоне страницы — посмотри реальную
   разметку `CardListShell` в `card-table.tsx:35-43`), чтобы скелет совпадал
   с фактическим макетом списков. Существующие 5 loading.tsx используют его
   — проверь, что они не разъехались.

### 6.4 Мобильные отчёты

1. `/reports/payroll`: по образцу `case-list-mobile.tsx` сделай
   `src/components/payroll/payroll-list-mobile.tsx` (md:hidden): карточка
   сотрудника = имя, подразделение, начислено / выплачено / остаток, оклад
   (если есть). Таблицу оберни `hidden md:block`.
2. `/reports/cash` (`cash-report.tsx`): мобильное представление дня —
   карточка «дата, приход, расход, сальдо», разворот операций по тапу
   (details/summary достаточно). Тоже md:hidden / hidden md:block.

### 6.5 Паритет фильтров доски

`cases/board/page.tsx`: добавь фильтры «Категория» и «Подразделение»
(переиспользуй компоненты фильтров из списка — `cases-filter-select`,
`payroll-department-filter` или их аналог; смотри как список передаёт
searchParams). `boardHref` в `cases/page.tsx` (:261-268): переноси
category и department тоже; обратная ссылка «Список» с доски — симметрично.
Если какой-то фильтр на доску технически не ложится (например, поиск) —
покажи на доске тонкую подпись «Фильтр поиска не применяется на доске»
только когда он был в URL (ключ в словари).

### 6.6 Комбобокс клиентов в фильтре /cases — ОПЦИОНАЛЬНО

Если остаётся ресурс: фильтр «Клиент» на `/cases` переведи на cmdk-комбобокс
с клиентской фильтрацией (как 6.1). Если не успеваешь — пропусти молча
(в PROGRESS: «6.6 пропущен»).

## Тесты
tsc/lint/unit. В PROGRESS — скриншот-чеклист того, что проверено глазами
не нужен; перечисли маршруты, где появились loading.

## Что НЕ делать
- Не трогать notification-центр/таблицы уведомлений (вне скоупа).
- Не менять десктопные таблицы отчётов.

---

# СЕССИЯ 7 — Продукт: исход «не заключили», конверсия, источники, конфликт-чек

**Зачем:** воронка не имеет исхода «потеряли» — конверсия и окупаемость
источников неисчислимы; конфликт интересов не проверяется (отраслевой
стандарт); `clients.source` собирается и нигде не агрегируется.

**Прочитай:** `supabase/migrations/20260530180000_stage_strict_forward.sql`
(+ исходный `20260527090000_stage_forward.sql`) — ПОЛНОЕ тело
`cases_validate_stage_forward` и `case_stage_order`;
`src/lib/types/db.ts` (:410-415 CASE_STAGES); `src/lib/cases/actions.ts`
(закрытие дела/todayIso); `src/components/cases/case-stage-dropdown.tsx`;
`src/lib/dashboard/compute.ts` + `stage-funnel.tsx`;
`src/lib/clients/actions.ts`, `src/components/clients/client-form.tsx`,
`src/components/cases/case-form.tsx` (поле opponent);
последнюю allowlist-миграцию (после сессии 2 это `v3_activity_actions`).

## Задачи

### 7.1 Миграция `v3_case_outcome`

```sql
alter table public.cases add column if not exists outcome text
  check (outcome in ('lost')),
  add column if not exists lost_reason text check (char_length(lost_reason) <= 500);

alter table public.cases add constraint cases_lost_requires_closed
  check (outcome is null or stage = 'closed') not valid;
```

Семантика: `outcome IS NULL` у закрытого дела = завершено штатно;
`outcome = 'lost'` = «не заключили договор». Отдельного enum-значения этапа НЕТ.

RPC закрытия как lost:

```sql
create or replace function public.close_case_lost(p_case_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
begin
  select * into v_case from public.cases where id = p_case_id for update;
  if not found then raise exception 'case not found'; end if;
  -- права: staff ИЛИ юрист дела; и дело видимо
  if not (private.case_visible(v_case.lawyer_id, v_case.responsible_id)
          and (private.is_staff() or v_case.lawyer_id = private.active_uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_case.stage not in ('new_request', 'consultation') then
    raise exception 'lost outcome is only for cases before the contract';
  end if;
  update public.cases
     set stage = 'closed', closed_at = now(), outcome = 'lost',
         lost_reason = nullif(btrim(p_reason), '')
   where id = p_case_id;
  perform private.log_activity('case', p_case_id, 'case_lost',
          jsonb_build_object('reason', nullif(btrim(p_reason), '')));
end;
$$;
grant execute on function public.close_case_lost to authenticated;
```

⚠ Сверь сигнатуру `private.log_activity` (порядок/имена аргументов) по
последней миграции и подстрой вызов. Сверь `closed_at` тип (timestamptz/date).

Триггер этапов: прыжок `new_request|consultation → closed` сейчас запрещён
для не-staff и/или пишет stage_corrected. Скопируй ПОЛНОЕ тело
`cases_validate_stage_forward` (последняя версия) и добавь В НАЧАЛО ветку:
`if new.stage = 'closed' and new.outcome = 'lost' then return new; end if;`
(прыжок как lost легитимен и уже залогирован RPC как `case_lost`).

Allowlist: новая миграция по правилу грабли №1 — добавь `case_lost`
(скопировав ВЕСЬ список из `v3_activity_actions` сессии 2).

### 7.2 UI закрытия как lost

- Карточка дела: если `stage in (new_request, consultation)` и пользователь
  staff или юрист дела — кнопка «Не заключили» (вторичная, серо-красная)
  рядом с этап-дропдауном. Клик → ConfirmDialog с textarea «Причина
  (необязательно)» → server action `closeCaseLostAction`
  (`src/lib/cases/actions.ts`: requireUser, вызов rpc, revalidatePath,
  обработка ошибок паттерном файла).
- На карточке закрытого lost-дела: бейдж «Не заключили» (серый) рядом с
  этапом + причина в шапке (если есть).
- В списке дел: для lost — серый бейдж в колонке этапа (посмотри как
  рендерится StageBadge и добавь рядом маленький маркер; НЕ менять
  StageBadge сам — оберни по месту).
- `case-stage-dropdown.tsx` НЕ трогать.
- `activity-log/format.ts` + `messages/*/activity.ts`: ветка `case_lost`
  («Дело закрыто без договора: причина»).
- Словари: `cases.markLost`, `cases.lostBadge`, `cases.lostReason` и т.п.

### 7.3 Дашборд: конверсия и источники

1. Конверсия (staff-блок): за выбранный период по `opened_at`:
   created = все дела; reached = дела, дошедшие до `in_progress+`
   (stage не в (new_request, consultation) ИЛИ closed без lost);
   lost = `outcome = 'lost'`. Покажи: «Конверсия в договор: X% (reached/created),
   потеряно: N». Считай из УЖЕ загружаемых на дашборд дел (после сессии 4
   там один fetch) — отдельный запрос не нужен. Положи рядом с воронкой
   (`stage-funnel.tsx` — отдельным маленьким блоком под ней).
2. Источники: миграция `v3_dashboard_sources` — RPC **security invoker**:

```sql
create or replace function public.dashboard_sources(p_from date, p_to date)
returns table (source text, clients_count bigint, cases_count bigint, paid_total numeric)
language sql
security invoker
set search_path = ''
as $$
  select coalesce(cl.source, 'other'),
         count(distinct cl.id),
         count(distinct c.id),
         coalesce(sum(c.paid_total), 0)
  from public.clients cl
  left join public.cases c on c.client_id = cl.id
       and c.opened_at >= p_from and c.opened_at < p_to
  where cl.created_at >= p_from and cl.created_at < p_to
  group by 1
  order by 4 desc;
$$;
grant execute on function public.dashboard_sources to authenticated;
```

   (сверь тип `opened_at`/`created_at`; RLS clients/cases применится — у
   каждой роли свои цифры, это правильно). Блок «Источники клиентов за месяц»
   на staff-дашборде: таблица source / клиентов / дел / оплачено. Подписи
   source — существующие enum-ключи в словарях.

### 7.4 Конфликт-чек lite

1. Миграция `v3_conflict_check` — RPC **security definer** (поиск по ВСЕЙ
   базе — иначе чек бессмыслен; возвращаем минимум данных):

```sql
create or replace function public.conflict_check(p_name text default null,
                                                 p_inn text default null,
                                                 p_phone text default null)
returns table (kind text, label text)
language sql
security definer
set search_path = ''
as $$
  -- совпадение с существующим клиентом (дедуп)
  select 'client'::text,
         cl.name || coalesce(' · ІПН ' || cl.inn, '') as label
  from public.clients cl
  where private.active_uid() is not null
    and (
      (p_inn is not null and p_inn <> '' and cl.inn = p_inn)
      or (p_phone is not null and p_phone <> '' and cl.phone = p_phone)
      or (p_name is not null and char_length(p_name) >= 5 and cl.name ilike '%' || p_name || '%')
    )
  union all
  -- новый клиент совпадает с оппонентом существующего дела
  select 'opponent'::text,
         'Оппонент в деле «' || c.number_title || '»'
  from public.cases c
  where private.active_uid() is not null
    and p_name is not null and char_length(p_name) >= 5
    and c.opponent ilike '%' || p_name || '%'
  limit 20;
$$;
grant execute on function public.conflict_check to authenticated;
```

   (`limit 20` поставь так, чтобы применялся к объединению — оберни union в
   подзапрос, если линтер SQL ругнётся).
2. Клиентская часть: в `client-form.tsx` при blur полей ФИО/название, ИНН,
   телефон (режим создания) — вызов лёгкого route handler
   `src/app/api/conflict-check/route.ts` (POST, серверный supabase с сессией,
   rpc conflict_check) — и жёлтый warning-блок над кнопкой сабмита:
   «Возможный конфликт интересов / дубликат: …список…». НЕ блокировать сабмит.
3. В `case-form.tsx` — то же на blur поля «Оппонент» (p_name = opponent).
4. Обратный чек: в conflict_check добавь ещё одну ветку union — p_name
   совпадает с `clients.name` существующих клиентов, label
   `'Уже клиент: ' || name` — чтобы оппонент-нового-дела ловился среди
   клиентов. (Итого три ветки.)
5. Словари: `clients.conflictWarning*`, `cases.conflictWarning*`.

## Тесты
Integration `v3-outcome-conflict.test.ts`:
1. `close_case_lost` под юристом дела с этапа new_request → stage closed,
   outcome lost, запись `case_lost` в activity_log;
2. `close_case_lost` с этапа in_progress → исключение;
3. `conflict_check` находит клиента по ИНН и оппонента по имени.
Юнит: конверсия — если выносишь расчёт в функцию compute.ts, покрой кейсом.

## Что НЕ делать
- Не добавлять новый этап в enum stage.
- Не делать причины отказа справочником — свободный текст.
- Не строить полноценный intake-pipeline.

---

# СЕССИЯ 8 — Продукт: Telegram-напоминания + ICS-календарь

**Зачем:** напоминания живут только внутри приложения — пропущенное заседание
система не предотвратит; календарь не подписывается в телефон.

**Прочитай:** `src/lib/tasks/queries.ts` (структура task: kind, due_at,
assignee), `src/lib/supabase/admin.ts` (service-role клиент; правило §2:
системные фоновые задачи — допустимое применение), `src/app/api/` (примеры
route handlers, напр. oo-callback — паттерн проверки секрета),
`.env.example`, `src/app/(app)/profile/page.tsx` + `users/profile-actions.ts`.

## Задачи

### 8.1 Миграция `v3_notify_channels`

Отдельная таблица (НЕ колонки в users — там грабля column-grant):

```sql
create table public.user_notify_channels (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_chat_id text,
  telegram_link_code text unique,
  calendar_token uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.user_notify_channels enable row level security;

create policy notify_channels_self_select on public.user_notify_channels
  for select using (user_id = private.active_uid());
create policy notify_channels_self_insert on public.user_notify_channels
  for insert with check (user_id = private.active_uid());
create policy notify_channels_self_update on public.user_notify_channels
  for update using (user_id = private.active_uid());
create policy notify_channels_self_delete on public.user_notify_channels
  for delete using (user_id = private.active_uid());
```

(вебхук и cron работают через service_role — им политики не нужны).

### 8.2 Чистая логика (юнит-тестируемая)

1. `src/lib/notifications/digest.ts`: `buildDigest(tasks, lang)` →
   текст сообщения: секции «⚠️ Просрочено», «Сегодня», «Завтра»; формат
   строки: `«10:00 — Заседание: <number_title> (задача)»`. Язык uk/ru по
   `users.language`. Без эмодзи в коде интерфейса — но в Telegram-сообщении
   допустимо (это не UI). Plain text (не markdown) — надёжнее.
2. `src/lib/calendar/ics.ts`: `buildIcs(events)` → строка VCALENDAR.
   Требования: CRLF (`\r\n`) между строками; экранирование `,` `;` `\n`
   в SUMMARY; `UID:<task-id>@yurcase`; `DTSTART` в UTC-формате
   `YYYYMMDDTHHMMSSZ` из due_at; `DTSTAMP` обязателен; VERSION:2.0,
   PRODID, CALSCALE:GREGORIAN. Однодневные задачи без времени не
   изобретать — у task всегда due_at timestamp.
3. Юнит-тесты `tests/unit/digest.test.ts`, `tests/unit/ics.test.ts`
   (включая экранирование и CRLF).

### 8.3 Route handlers

1. `src/app/api/telegram/webhook/route.ts` (POST):
   - проверка заголовка `x-telegram-bot-api-secret-token` ===
     `process.env.TELEGRAM_WEBHOOK_SECRET`, иначе 401;
   - парсит update: если `message.text` начинается с `/start ` — извлечь код,
     найти в `user_notify_channels` строку с `telegram_link_code = код`
     (admin-клиент), записать `telegram_chat_id = message.chat.id`,
     обнулить link_code, ответить пользователю sendMessage «Готово ✅»;
   - всегда возвращать 200 (Telegram ретраит не-200).
2. `src/app/api/cron/reminders/route.ts` (GET):
   - проверка `Authorization: Bearer ${process.env.CRON_SECRET}`, иначе 401;
   - admin-клиентом: все users с привязанным chat_id → для каждого его
     открытые задачи: просроченные + сегодня + завтра (по Киеву, хелпер
     из сессии 4) → `buildDigest` → POST
     `https://api.telegram.org/bot${TOKEN}/sendMessage`
     (chat_id, text). Пустой дайджест — не слать.
   - Если `TELEGRAM_BOT_TOKEN` не задан — вернуть
     `{ ok: false, reason: 'no token' }` без падения (dry-run среда).
3. `src/app/api/calendar/[token]/route.ts` (GET):
   - токен из path (формат `<uuid>.ics` — отрежь суффикс);
   - admin-клиентом найти user по calendar_token; не найден → 404;
   - его задачи (assignee, открытые, due_at от -7д до +60д) → `buildIcs`;
   - `return new Response(ics, { headers: { 'Content-Type':
     'text/calendar; charset=utf-8' } })`.
   Токен в URL = аутентификация (стандарт для ICS-фидов), это осознанно.

### 8.4 vercel.json + env

- Создай/дополни `vercel.json`: `{ "crons": [{ "path": "/api/cron/reminders",
  "schedule": "0 6 * * *" }] }` (06:00 UTC ≈ 09:00 Киева). Если vercel.json
  уже существует — аккуратно слей.
- `.env.example`: добавь `TELEGRAM_BOT_TOKEN=`, `TELEGRAM_WEBHOOK_SECRET=`,
  `CRON_SECRET=` с комментариями.

### 8.5 Профиль: блок «Уведомления и календарь»

В `/profile`: новый блок (server component + маленькие client-формы):
- Telegram: если не привязан — кнопка «Привязать Telegram» → action
  генерирует код (`crypto.randomUUID().slice(0,8)`), upsert в
  user_notify_channels (под сессией пользователя — RLS self), показывает
  инструкцию: «Откройте @<имя_бота> и отправьте: /start <код>»
  (имя бота — `process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME`, добавь в
  .env.example). Если привязан — «Привязан ✓» + кнопка «Отвязать»
  (update chat_id = null).
- Календарь: показать URL фида
  `${origin}/api/calendar/<calendar_token>.ics` с кнопкой «Скопировать»
  и «Перевыпустить ссылку» (update calendar_token = gen_random_uuid()
  через action — random в БД, не в JS).
- Словари: `account.notifications*` (uk+ru).

## Тесты
Юниты digest/ics. Integration не нужны (RLS-таблица тривиальна — но если
быстро: self-select чужой строки → пусто). Роуты руками не проверять
(нет токена) — это нормально, зафиксируй в PROGRESS «проверка на проде
после деплоя и настройки бота».

## Что НЕ делать
- Не подключать библиотеки телеграм-ботов (только fetch к Bot API).
- Не делать двусторонний календарь-синк/OAuth.
- Не слать уведомления при событиях в реальном времени (только дайджест).

---

# СЕССИЯ 9 — Продукт: график платежей, просрочки, aging дебиторки

**Зачем:** при рассрочке контроль доплат держится на памяти юриста; нет
понятия «просроченная доплата»; долги не разрезаются по давности.

**Прочитай:** `src/lib/payments/queries.ts` и `payments/actions.ts`
(паттерны), карточку дела `cases/[id]/page.tsx` (где блок платежей),
`src/components/payments/*`, дашборд (`page.tsx`, compute.ts),
последнюю allowlist-миграцию (после сессии 7 — с `case_lost`),
хелперы Киев-дат (сессия 4), `tests/unit/cash-saldo.test.ts` (образец
юнитов чистой логики).

## Задачи

### 9.1 Миграция `v3_payment_plan`

```sql
create table public.payment_plan_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  note text check (char_length(note) <= 300),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index payment_plan_items_case_idx on public.payment_plan_items (case_id, due_date);
alter table public.payment_plan_items enable row level security;

create policy plan_select_via_case on public.payment_plan_items
  for select using (private.can_see_case(case_id));
create policy plan_insert_via_case on public.payment_plan_items
  for insert with check (
    private.can_write_case(case_id) and created_by = private.active_uid()
  );
create policy plan_delete_via_case on public.payment_plan_items
  for delete using (private.can_write_case(case_id));
```

Сверь точные имена `can_see_case` / `can_write_case` по миграциям (если
write-предиката нет — используй тот, которым гейтится INSERT задач
`tasks_insert_via_case`). UPDATE-политики нет (правка = удалить + создать).

Allowlist-миграция: + действие `payment_plan_updated` (правило грабли №1!).

### 9.2 Чистая логика статусов

`src/lib/payments/plan.ts`:

```ts
export type PlanItemStatus = 'paid' | 'pending' | 'overdue';
export function planWithStatuses(
  items: { id: string; due_date: string; amount: number }[],
  paidTotal: number,
  todayIso: string,
): { id: string; status: PlanItemStatus; coveredAmount: number }[]
```

Алгоритм: сортировка по due_date (затем created_at); кумулятив; позиция
`paid`, если `paidTotal >= cumsum(позиции)`; `overdue`, если не paid и
`due_date < todayIso`; иначе `pending`. Частично покрытая позиция считается
НЕ оплаченной (статус по полному покрытию), `coveredAmount` — сколько
покрыто (для прогресс-подписи). Юнит-тесты `tests/unit/payment-plan.test.ts`:
пусто; ровно покрыто; частично; просрочка; платёж больше плана.

### 9.3 Блок «График платежей» на карточке дела

`src/components/payments/payment-plan-block.tsx` + queries/actions:
- `listPlanItems(caseId)` в `payments/queries.ts`;
- `createPlanItemAction` / `deletePlanItemAction` в `payments/actions.ts`
  (паттерн файла: requireUser, валидация суммы существующим регэксп-парсером,
  даты `isValidDate`, logActivity `payment_plan_updated` с case_id ИЗ БД,
  revalidatePath карточки);
- UI: таблица «Дата · Сумма · Статус · Примечание · [удалить]», статус-бейдж
  (paid → зелёный quiet, overdue → красный, pending → серый; существующий
  Badge), строка прогресса «Покрыто X из Y»; форма добавления (дата+сумма+
  примечание) видна тем, кто пишет в дело (та же проверка, что у задач —
  посмотри как гейтится форма задач на карточке);
- Разместить секцию на карточке дела рядом с платежами; добавить в
  `case-action-bar` пункт `plan` (порядок — фактический DOM, как учила
  сессия 5.3);
- Удаление — через ConfirmDialog (уже есть с сессии 5);
- ВНИМАНИЕ сессии 5.3: добавив секцию, обнови SECTION_IDS и порядок.

### 9.4 Дашборд: просроченные доплаты + aging

1. Миграция `v3_debt_rpc` — два **security invoker** RPC:

```sql
create or replace function public.overdue_plan_items(p_today date)
returns table (case_id uuid, number_title text, due_date date, amount numeric, paid_total numeric, plan_before numeric)
language sql security invoker set search_path = '' as $$
  select c.id, c.number_title, i.due_date, i.amount, c.paid_total,
         (select coalesce(sum(x.amount),0) from public.payment_plan_items x
           where x.case_id = c.id
             and (x.due_date < i.due_date or (x.due_date = i.due_date and x.created_at <= i.created_at)))
  from public.payment_plan_items i
  join public.cases c on c.id = i.case_id
  where i.due_date < p_today and c.stage <> 'closed'
  order by i.due_date
  limit 200;
$$;

create or replace function public.debt_aging()
returns table (case_id uuid, number_title text, debt numeric, last_paid_at date, opened_at date)
language sql security invoker set search_path = '' as $$
  select c.id, c.number_title, c.debt,
         (select max(p.paid_at)::date from public.payments p where p.case_id = c.id),
         c.opened_at::date
  from public.cases c
  where c.debt > 0 and c.stage <> 'closed'
  limit 500;
$$;
```

   (`paid_at`/`opened_at` типы сверь; grant execute обоим на authenticated.)
2. TS: «просрочена ли позиция» доводи функцией `planWithStatuses`-логикой:
   позиция просрочена, если `paid_total < plan_before + amount` — посчитай
   в TS из колонок RPC (не дублируй кумулятив в SQL глубже, чем выдано).
3. Staff-дашборд: блок «Просроченные доплаты» — топ-5 дел (номер, дата,
   сумма недоплаты), ссылки на карточки; и блок «Дебиторка по давности»:
   бакеты `<30 / 30-60 / 60-90 / 90+` дней от `coalesce(last_paid_at,
   opened_at)` до сегодня (Киев) — 4 суммы + счётчики. Расчёт бакетов —
   чистая функция `src/lib/dashboard/aging.ts` + юнит-тест.
4. Telegram-дайджест (если сессия 8 закрыта — проверь статус-таблицу):
   в cron-роут добавь секцию «Просроченные доплаты по вашим делам» для
   юристов (lawyer_id) — те же RPC под admin-клиентом с фильтром по юзеру.
   Если сессия 8 не закрыта — пропусти, отметь в PROGRESS.

## Тесты
Юниты: payment-plan, aging. Integration `v3-payment-plan.test.ts`:
lawyer дела создаёт позицию своего дела (ок) и чужого (отказ);
`overdue_plan_items` под lawyer видит только свои дела.

## Что НЕ делать
- Никаких автонапоминаний клиенту (только внутренние/Telegram сотруднику).
- Не менять расчёт debt/paid_total.

---

# СЕССИЯ 10 — Дизайн: контраст AA, токены, переписать DESIGN.md

**Зачем (подтверждено):** DESIGN.md описывает несуществующую систему (тема
TEAL, Golos Text, индиго) — а протокол велит читать его перед вёрсткой;
залитые бейджи 2.1–4.2:1 при норме 4.5; шапки колонок 2.95:1; зелёные суммы
3.3:1 (MoneyStat 2.91:1); радиусная шкала инвертирована (--r-lg 6px < --r-sm
8px) + 23 произвольных rounded-[Npx]; 6 хардкодов оверлея; печатный отчёт
в цветах удалённой teal-темы.

**Прочитай:** `DESIGN.md` (целиком — чтобы понять, что устарело),
`src/app/globals.css` (ЦЕЛИКОМ), `src/app/layout.tsx`,
`src/components/ui/{stage-badge,category-badge,badge,card-table,avatar}.tsx`,
`src/components/cases/case-stage-dropdown.tsx` (:181-183),
`src/components/payroll/report/report-document.tsx` (:8-20),
`src/components/ui/modal.tsx` (:119) и остальные 5 мест оверлея (grep
`#080A0F` и `#0B1020`), `src/app/(app)/cases/[id]/page.tsx` (MoneyStat
~:574-585), CLAUDE.md §11.

### Инструмент проверки контраста (используй его, не считай в уме)

Сохрани во временную папку и запускай `node $env:TEMP\contrast.js "#aabbcc" "#ffffff"`:

```js
const L = h => { const c = h.replace('#','').match(/../g).map(x => parseInt(x,16)/255)
  .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*c[0] + .7152*c[1] + .0722*c[2]; };
const [a,b] = process.argv.slice(2).map(L);
console.log(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));
```

Порог: обычный текст ≥ 4.5; крупный (≥24px или ≥18.66px bold) ≥ 3.0.

## Задачи

### 10.1 Контраст: fg-токены бейджей

В `globals.css` рядом с существующими `--stage-*`/`--cat-*` добавь
fg-варианты (проверь каждую пару скриптом против её `*-bg`; стартовые
значения — они уже проверены, но перепроверь против ФАКТИЧЕСКИХ bg в файле):

```
--stage-new-fg: #3F4A5C;          /* на --stage-new-bg */
--stage-consultation-fg: #5B21B6;
--stage-in-progress-fg: #1E40AF;
--stage-awaiting-fg: #9A3412;
--stage-closed-fg: #166534;
--cat-document-fg: #0E7490;
--cat-claim-fg: #9D174D;
--cat-representation-fg: #86198F;
```

(имена суффиксов подгони под фактические имена токенов в файле!)
Добавь их в `@theme inline`-маппинг по образцу соседних.
`stage-badge.tsx` / `category-badge.tsx`: в ЗАЛИТОМ варианте текст крась
fg-токеном вместо основного тона (фон-подложка остаётся прежней).
`badge.tsx`: тона error/info/success — текст затемни аналогично
(`#991B1B` / `#1E40AF` / `#166534` на их светлых подложках — проверь скриптом
против фактических bg).

### 10.2 Контраст: остальное

- `card-table.tsx` (:60, :105-109): `text-text-subtle` → `text-text-muted`
  у CardHead/CardSortHead (проверь скриптом `--text-muted` на `--bg`; если
  < 4.5 — возьми `--text`).
- Money: в `globals.css` добавь `--success-text: #166534;` (+ @theme);
  замени ТЕКСТОВЫЕ употребления зелёного: `cash-report.tsx:190` (суммы
  прихода), MoneyStat tone=success в карточке дела, `absences-block.tsx`
  статус «сейчас». Заливки/бейджи success не трогай.
- `case-stage-dropdown.tsx` (:181-183): активный пункт — вместо белого
  текста на stage-цвете сделай stage-bg фон + соответствующий `--stage-*-fg`
  текст (как новые бейджи).
- `avatar.tsx` (:23-30): вынеси палитру в globals.css токены
  `--avatar-1..6`; два светлых цвета с белым текстом замени: `#F97316` →
  `#C2410C`, `#14B8A6` → `#0F766E` (остальные проверь скриптом ≥ 3.0 —
  инициалы декоративны и дублируются текстом, поэтому порог large/UI 3.0
  достаточен; что ниже — затемни на один тон).

### 10.3 Токен оверлея

`globals.css`: `--overlay: rgba(8, 10, 15, 0.8);` (+ @theme как цвет).
Замени 6 мест: `modal.tsx:119`, `payroll-actions.tsx:156`,
`mobile-more-sheet.tsx:100`, `release-modal.tsx:53`, `welcome-modal.tsx:188`
на `bg-overlay` (или `bg-[var(--overlay)]` — каким способом в проекте
принято обращаться к токенам, посмотри соседние классы);
`onboarding-provider.tsx:286` — оставь hex (driver.js принимает строку),
но добавь комментарий `/* = --overlay */`.

### 10.4 Радиусы: семантические токены БЕЗ смены вида

НЕ меняй значения существующих `--r-sm/md/lg/xl` (вид зафиксирован
пользователем). Вместо этого:
1. В `globals.css` добавь компонентные алиасы с ФАКТИЧЕСКИМИ значениями:
   `--r-card: 6px; --r-control: 9px; --r-chip: 7px; --r-modal: 20px;`
   + комментарий-предупреждение у старой шкалы: «шкала историческая,
   sm>lg — НЕ использовать для новых компонентов, бери компонентные алиасы».
2. Замени произвольные `rounded-[Npx]` на алиасы ТОЛЬКО там, где значение
   совпадает точно (7px → chip, 20px → modal и т.д.; grep `rounded-\[`).
   Что не совпадает (3px, 10px, 12px, 24px) — оставь как есть, перечисли
   в PROGRESS.

### 10.5 Печатный отчёт и кнопка тура

- `report-document.tsx` (:8-20): в объекте DOC замени teal-акценты:
  `accent: '#2563EB'`, `accentDark: '#1E40AF'` (нейтральные ink/paper не
  трогай). Проверь :56 и :79 — там использования.
- `globals.css` (:587-589): у `.driver-popover-next-btn` убери
  `background-image: var(--grad-brass)` → сплошной `background: var(--primary)`.
- Переименуй токены `--grad-brass` → `--grad-brand`, `--brass-bright` →
  `--primary-bright`: grep по ОБОИМ именам во всём src (использований мало),
  замени везде согласованно.

### 10.6 Sticky-шапки и Table

- `card-table.tsx`: шапке CardListShell добавь
  `sticky top-[высота топбара] z-10 bg-bg` (высоту топбара посмотри в
  topbar.tsx — h-14 → top-14; фон обязателен, иначе строки просвечивают).
  Проверь, что внутри страницы нет конфликтующего overflow-контейнера.
- `table.tsx` (:16, :28): `border-collapse` → `border-separate` +
  `border-spacing-0`; проверь визуально границы (если поплыли двойные
  бордеры — поправь классы границ ячеек по месту, это известный приём).

### 10.7 Переписать DESIGN.md (главное)

Перепиши файл ПО ФАКТУ кода. Структура нового DESIGN.md:
1. Шапка: «Источник правды UI. Редизайн 2026-06-03: строгий светлый,
   один синий акцент #2563EB, тёмный ink-сайдбар. Темы TEAL/латунь УДАЛЕНЫ.
   Ревизия 2026-06-12 (v3): документ приведён в соответствие коду.»
2. Типографика: IBM Plex Sans (next/font, subsets latin+cyrillic),
   JetBrains Mono — ТОЛЬКО kbd-подсказки; цифры — Plex Sans +
   tabular-nums глобально.
3. Цвета: перенеси ФАКТИЧЕСКИЕ значения из globals.css (бренд, поверхности,
   текст, семантика, этапы + новые fg, категории + fg, money, overlay,
   avatar) — таблицей «токен → значение → применение». Не выдумывай
   значений: только из файла.
4. Радиусы: компонентные алиасы (card 6 / control 9 / chip 7 / modal 20),
   историческая шкала помечена deprecated.
5. Тени/движение: фактические токены (--dur, --ease, prefers-reduced-motion),
   правила «без infinite-анимаций в списках, hover без translate-y»
   (решение пользователя, сохранить!).
6. Компоненты: бейджи этапа/категории — единый чип с точкой, различие
   цветом + контекстом (узаконь факт); таблицы 44px sticky; карточки-строки
   списков; ConfirmDialog; ошибки/empty/skeleton.
7. Запреты: Inter/Roboto/serif в display; градиенты (только логотип-плитка);
   дефолтный shadcn-look; «1С-look»; хардкоды цветов мимо токенов.
8. Доступность: AA обязателен, fg-токены для заливок, фокус-кольца.
9. Decisions log (вынеси из старого файла то, что осталось правдой, + новые
   решения этой сессии с датами).
Старый текст про TEAL/латунь/Golos/Manrope/индиго — УДАЛИТЬ (git хранит).

### 10.8 CLAUDE.md §11

Перепиши раздел §11 кратко по факту (10-15 строк): источник правды DESIGN.md
(ревизия 2026-06-12), IBM Plex Sans + JetBrains Mono(kbd), один синий акцент
#2563EB, ink-сайдбар + светлая зона, все цвета только токенами, AA
обязателен, запреты прежние. Удали блоки про TEAL/data-theme/латунь/Manrope.

### 10.9 JetBrains Mono веса

`layout.tsx`: оставь веса 400 и 600 (срежь 500/700, если подключены).

## Тесты/проверка
tsc/lint/unit. Прогони contrast.js по всем новым парам — выпиши результаты
в PROGRESS (каждая пара ≥ 4.5, аватары ≥ 3.0). Если есть запущенный dev —
глазами глянь список дел/карточку/кассу (не обязательно).

## Что НЕ делать
- Не менять значения --r-sm/md/lg/xl и вид карточек.
- Не вводить тёмную тему, не возвращать TEAL.
- Не менять шрифт.

---

# СЕССИЯ 11 — Дизайн-полировка: «круто и удобно»

**Зачем:** прямое требование пользователя — дизайн должен стать не просто
корректным (это сделала сессия 10), а заметно более удобным и цельным,
уровня «дорогого» продукта. Сессия добавляет: систему тостов (обратная связь
на каждое действие), горячие клавиши со шпаргалкой, быстрые пресеты фильтров,
блок «Мой день» на дашборде, единый EmptyState, быстрые действия в шапке
карточки дела, информативные канбан-карточки и финальный проход
консистентности по всем экранам.

**ГРАНИЦЫ (нарушение = провал сессии):** палитру, шрифты, радиусы и характер
движения НЕ менять — они зафиксированы сессией 10 и решениями пользователя:
БЕЗ infinite-анимаций в списках, hover БЕЗ translate-y, БЕЗ градиентов на
кнопках, БЕЗ теней-наворотов. НИКАКИХ новых npm-зависимостей (всё пишем на
том, что есть: React, Tailwind-токены, lucide-react, cmdk). Скорость важнее
эффектов.

**Прочитай:** `DESIGN.md` (УЖЕ переписан сессией 10 — теперь он источник
правды), `src/app/globals.css` (токены движения `--dur-*`/`--ease-*`,
prefers-reduced-motion блок), `src/components/ui/modal.tsx`,
`src/components/app/command-palette.tsx` (обработчик клавиш ~:110-119,
футер с kbd), `src/components/app/topbar.tsx` (триггер поиска),
`src/components/app/bottom-nav.tsx` (высота, safe-area),
`src/app/(app)/cases/[id]/page.tsx` (шапка, MoneyStat, секции),
`src/components/payments/add-payment-dialog.tsx`,
`src/components/tasks/case-tasks-block.tsx` (как раскрывается форма),
`src/components/cases/board-card.tsx`, `src/app/(app)/cases/page.tsx`
(какие searchParams реально парсятся: debt, stage, sort и т.д.),
`src/components/ui/status-filter-strip.tsx` (приём горизонтального скролла),
`src/app/(app)/page.tsx` + `upcoming-deadlines-block.tsx`,
`src/lib/cases/constants.ts` (STALE_STAGE_DAYS из сессии 5).

## Задачи

### 11.1 Toast-система (своя, лёгкая)

`src/components/ui/toast.tsx` ('use client'):
- `ToastProvider` (контекст со списком тостов) + хук `useToast()` →
  `{ success(msg: string), error(msg: string) }`;
- контейнер-портал: desktop — `fixed bottom-4 right-4`, mobile —
  снизу по центру ВЫШЕ bottom-nav (возьми его фактическую высоту +
  safe-area из bottom-nav.tsx); z-index выше модалок;
- карточка тоста: `bg-surface` + бордер + иконка lucide
  (`CheckCircle2` success / `AlertCircle` error, 16px, success/error-токены),
  текст 13px, кнопка «×»; максимум 3 одновременно (старые вытесняются);
- auto-dismiss 4 с, пауза таймера при hover;
- появление: fade + лёгкий slide-up 150ms `var(--ease-out)` КЛАССАМИ
  (глобальный prefers-reduced-motion блок их погасит — проверь);
- a11y: контейнер `aria-live="polite"`; success → `role="status"`,
  error → `role="alert"`.

Подключи `ToastProvider` в `src/app/(app)/layout.tsx` (внутрь существующих
провайдеров). Применить минимум здесь (успех/ошибка):
`add-payment-dialog`/`payment-form` («Платёж добавлен»), `act-create-form`,
`act-confirm-form` («Оплата подтверждена»), `task-form` («Задача создана»),
`client-form` и `case-form` («Сохранено»), кнопка бэкфилла кассы
(«Создано N записей»), форма отпуска. Затем grep `alert(` по `src` — каждое
вхождение замени на `toast.error(...)`. Паттерн `?error=`-редиректов из
сессии 5 НЕ ломать — тосты дополняют его в модальных/инлайн-формах, где
успех сейчас молчалив. Тексты — в словари (`common.saved`, остальные по месту,
uk+ru).

### 11.2 Горячие клавиши + шпаргалка «?»

`src/components/app/hotkeys-provider.tsx` ('use client', смонтировать в
`(app)/layout.tsx`): один keydown-листенер на window. ЖЁСТКОЕ правило:
игнорировать события, если фокус в `input/textarea/select/[contenteditable]`
или зажаты Ctrl/Meta/Alt. Клавиши:
- `/` — фокус/открытие поиска топбара (посмотри, чем является триггер
  поиска в topbar.tsx: если он открывает командную палитру — открой её);
- `n` — `router.push('/cases/new')`, только если роль может создавать дела
  (передай роль пропом из layout — там профиль уже грузится);
- `t` — `router.push('/tasks?new=1')` (механизм сессии 6; если сессия 6 не
  закрыта — пропусти клавишу, отметь в PROGRESS);
- `?` (Shift+/) — модал-шпаргалка: список всех шорткатов (Ctrl+K, /, n, t,
  ?, Esc) в kbd-стиле командной палитры (font-mono kbd там уже есть).

Обнови футер `command-palette.tsx` (упомяни «?») и `/help` (новый блок
«Горячие клавиши» в существующей структуре). Словари uk+ru.

### 11.3 Быстрые пресеты фильтров в /cases

`src/components/cases/quick-filters.tsx` — ряд чипов-ссылок НАД существующим
рядом фильтров. Пресеты собирай ТОЛЬКО из параметров, которые
`cases/page.tsx` УЖЕ парсит (сверь точные имена!):
- «С долгом» → `?debt=true`;
- «Закрытые за месяц» → `?stage=closed` + параметры существующего
  date-фильтра (текущий месяц по Киеву);
- «Зависшие» → параметры сортировки по `stage_changed_at` asc (точные имена
  sort-параметров возьми из sortable-header/страницы);
- «Срочные» → только если параметр приоритета листингом поддержан; нет —
  пропусти чип.
НИКАКИХ новых фильтров в queries/RPC — пресет это просто `<Link>` с готовым
query. Активность чипа: параметры пресета ⊆ текущим searchParams → стиль
активного чипа (как у активного фильтра этапа); клик по активному — сброс
на `/cases`. Мобайл: `overflow-x-auto` без скроллбара (приём из
status-filter-strip.tsx). Словари uk+ru.

### 11.4 Единый EmptyState

`src/components/ui/empty-state.tsx`: пропсы
`{ icon?: LucideIcon, title: string, hint?: string, action?: ReactNode }` —
центрированный блок: иконка 28px `text-text-subtle`, title 14px medium,
hint 13px muted, опциональная CTA-кнопка. Замени самодельные пустышки
(grep по существующим текстам «не найдено»/«пока нет»/«немає»): списки
дел/клиентов/задач (у них ДВА разных состояния — «пусто вообще» и «не
найдено по фильтрам», сохрани оба текста), секции карточки дела (документы/
задачи/акты/комментарии — где голый текст), касса без счетов, пустой месяц
отчёта ЗП. Тексты НЕ менять — берёшь существующие ключи, меняется только
обёртка.

### 11.5 Карточка дела: быстрые действия и шапка

- В шапку карточки (рядом с этап-дропдауном) — три кнопки-иконки с
  подписями: «+ Платёж», «+ Задача», «+ Акт».
  «+ Платёж» — открыть существующий `AddPaymentDialog` (если его state живёт
  в секции платежей — подними state открытия на страницу/общий клиентский
  контейнер ЛИБО отрендери второй экземпляр диалога в шапке — выбери
  меньшую правку). «+ Задача» и «+ Акт» — минимум: плавный
  `scrollIntoView` к секции (smooth, через CSS `scroll-behavior` с учётом
  reduced-motion) + раскрыть/сфокусировать форму секции, если у неё есть
  управляемое раскрытие (посмотри case-tasks-block). Выбранный вариант
  зафиксируй в PROGRESS.
- MoneyStat-ряд шапки: выровняй иерархию — подпись 11-12px muted сверху,
  сумма 18-20px tabular medium; долг — error-токен, переплата — info
  (токены сессии 10!); прогресс-бар оплаты (`payment-progress.tsx`)
  положи под суммами на всю ширину блока (высота 6px, rounded-full).
- Кнопки видны только тем, кто и так видит соответствующие формы
  (та же логика гейтинга, что у секций — не изобретай новую).

### 11.6 Канбан-карточка информативнее

`board-card.tsx` довести до паритета со строкой списка:
- клиент — 13px muted с обрезкой (truncate);
- долг — красным tabular (если > 0), как в списке;
- индикатор застоя: маленькая amber-точка + `title="N дней на этапе"`
  при `stageDays >= STALE_STAGE_DAYS` (импорт константы; БЕЗ анимации —
  запрет пользователя на пульс в списках!);
- аватар эксперта (существующий `Avatar`, маленький размер) в углу;
- приоритет urgent — тем же приёмом, что в списке (посмотри и повтори);
- hover: только `border-secondary`/фон, БЕЗ transform и теней.

### 11.7 Блок «Мой день» на дашборде

Над KPI, для ВСЕХ ролей: «Сегодня» — открытые задачи/заседания/дедлайны
текущего пользователя с due сегодня по Киеву (хелпер сессии 4; данные —
расширь выборку `listUpcomingTasks`, она после сессии 4 уже разделена на
просрочки/ближайшие — добавь срез «сегодня» без нового тяжёлого запроса).
Строка: время (HH:MM, если есть) · бейдж типа (`task-kind-badge`) ·
название · ссылка на дело. Пустой список → блок НЕ рендерится вообще.
Никаких отдельных «по компании» запросов не добавлять.

### 11.8 Полировочный проход консистентности

Пройди экраны СПИСКОМ, исправляя ТОЛЬКО отклонения (не редизайнить):
дашборд → /cases → /cases/board → /cases/[id] → /clients → /clients/[id] →
/tasks → /calendar → /reports/payroll (+[userId]) → /reports/cash →
/settings/* → /profile → /help → /login.

Чек на каждом экране:
1. заголовок страницы и заголовки секций — одна шкала (возьми фактическую
   с 2-3 эталонных экранов: дашборд, /cases, карточка дела);
2. вертикальный ритм: gap между секциями единый (преобладающее значение);
3. кнопки одного уровня иерархии — один размер/вариант;
4. focus-visible виден на всех интерактивных элементах (пройди Tab'ом
   мысленно по коду: кастомные кликабельные div'ы — есть ли фокус-стиль);
5. иконки: 16px в кнопках/строках, 18-20px в заголовках секций — без разнобоя;
6. все суммы/числа — tabular (глобально уже есть; ищи локальные переопределения);
7. убрать случайные `mt-[Npx]`/`p-[Npx]`-хаки там, где рядом используется
   системная шкала.

Каждую правку — строкой в PROGRESS («файл: что выровнено»). Если запущен
dev-сервер и доступен браузер MCP — глянь 5 главных экранов на 1440px и
390px (НЕобязательно; форм не сабмитить — известная грабля разлогина).

### 11.9 DESIGN.md — дописать новые паттерны

В переписанный сессией 10 DESIGN.md добавь короткие разделы по факту
реализации: «Toast» (позиция, тайминги, a11y, когда success/error),
«EmptyState», «Горячие клавиши» (фактический список), «Быстрые фильтры».
Остальное не трогать.

## Тесты/DoD
tsc/lint/unit зелёные. В PROGRESS: список применённых тостов, список правок
полировочного прохода, выбранный вариант быстрых действий карточки.

## Что НЕ делать
- Новые npm-зависимости (sonner/framer-motion/react-hot-toast — НЕТ).
- Менять палитру/шрифты/радиусы/токены сессии 10.
- Infinite-анимации, hover-transform, градиенты, тени-навороты.
- Bulk-операции, drag-n-drop на доске, нотификейшн-центр.
- Печатные формы и login-флоу не трогать (login — только проход 11.8).

---

# СЕССИЯ 12 — Качество и финал: validation, вычистка, CI, e2e, коммиты

**Прочитай:** `tests/README.md`, `vitest.integration.config.ts`,
`tests/e2e/auth.spec.ts` + `playwright.config.*`, `docs/PROGRESS.md`
(ВСЕ записи цикла v3 — там списки файлов по сессиям), `src/lib/types/db.ts`
(:26, :146-183, :344, :504, :519 — кандидаты на удаление),
`src/components/payroll/case-ledger-block.tsx`, `src/lib/payroll/queries.ts`
(:166-255), `src/lib/payroll/actions.ts` (ledger-экшены).

## Задачи

### 12.1 `src/lib/validation.ts`

Собери дубли в один модуль: `UUID_RE` (+ `isUuid()`), `parseAmount` +
`MAX_AMOUNT` (возьми САМУЮ СТРОГУЮ из 4 копий — сверь все), `isValidDate`,
`todayIso`-киевский (реэкспорт хелпера сессии 4, чтобы не плодить вторую
правду). Затем grep: `const UUID_RE` (~21 файл), `parseAmount`/`MAX_AMOUNT`
(4), `isValidDate` (7), локальные `todayISO` (6) — замени на импорты.
Клиентский `parseAmountClient` в формах: если идентичен серверному —
импортируй из validation.ts (модуль должен быть isomorphic: без
'server-only', без node-API). После замены `npm test` обязан быть зелёным.

### 12.2 Мёртвый код

1. Леджер: удали `case-ledger-block.tsx`; из `payroll/actions.ts` —
   `markLedgerPaidAction`/`revertLedgerPaidAction`; из `payroll/queries.ts`
   — 4 экспорта без потребителей (`listLedger`, `listLedgerByCase`,
   `listPayrollPayoutBySpecialist`, `listPayrollBySpecialist`) — перед
   удалением grep-проверь каждый: 0 использований вне самих файлов.
2. Миграция `v3_freeze_ledger`: `drop trigger if exists cases_sync_ledger
   on public.cases;` (+ drop его функции, имя сверь) + comment on table
   `payroll_ledger` «frozen 2026-06; данные исторические; Phase 2 решит
   судьбу». Таблицу и данные НЕ удалять.
3. `db.ts`: удали неиспользуемые `ROLE_LABEL`, `BILLING_TYPE_LABEL`,
   `CLIENT_KIND_LABEL`, `ACCRUAL_MODE_LABEL`, `CAPABILITY_LABELS`,
   `CAPABILITY_HINTS` (каждую — после grep «0 использований»).

### 12.3 CLAUDE.md §5/§7/§8

- §5: допиши таблицы `payroll_transactions`, `payout_allocations`,
  `case_comments` (формат соседних описаний — кратко), `user_notify_channels`,
  `payment_plan_items`, поля `cases.outcome/lost_reason/updated_at`;
  пометь `payroll_ledger` замороженным.
- §7: пункт 2 — добавь «исключение: закрытие как „не заключили" (outcome=lost)
  с этапов new_request/consultation, RPC close_case_lost»; пункт 9 — отметь,
  что смена этапа логируется во всех путях.
- §8: блок активного цикла v3 → пометь завершённым (по факту этой сессии).

### 12.4 CI

`.github/workflows/ci.yml`:

```yaml
name: ci
on: [push, pull_request]
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: supabase/setup-cli@v1
      - run: npm ci
      - run: supabase start
      - run: |
          eval "$(supabase status -o env | sed 's/^/export /')"
          export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
          export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
          export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
          npm run test:integration
```

Перед записью посмотри, какие env-имена реально читает
`vitest.integration.config.ts` / тесты — подставь ИХ (а не угаданные).
Если integration-сьют self-skip'ается без env — оставь как есть, job всё
равно полезен.

### 12.5 E2E основного флоу

`tests/e2e/core-flow.spec.ts` по паттерну auth.spec.ts: логин owner →
создать клиента (минимум полей) → создать дело (клиент, юрист, эксперт,
категория, сумма 10000) → открыть карточку → добавить платёж 4000 →
проверить на карточке «Оплачено 4 000» и долг «6 000» (тексты сверь по
фактическим data-testid/строкам — посмотри, чем пользуется auth.spec).
Требует dev-сервер + seed (как в существующем конфиге playwright —
прочитай его webServer-настройку). Если e2e-инфраструктура не заводится
локально за разумное время — пометь тест `test.skip` с комментарием и
запиши в PROGRESS.

### 12.6 ФИНАЛЬНАЯ ПРОВЕРКА (строго по порядку)

1. `npx supabase db reset` → `npm run db:seed` — чисто;
2. `npx tsc --noEmit` → 0; `npm run lint` → 0; `npm test` → зелёные;
3. `npm run test:integration` → зелёные (Supabase запущен);
4. `npm run build` → успех (ПЕРВЫЙ build за цикл — жди дольше);
5. `git status` + `git diff --stat` — просмотри ВЕСЬ дифф по верхам:
   нет ли случайных файлов (tmp, .env, node_modules), вычисти мусор;
6. Финальная запись в PROGRESS: итоги цикла, метрики (сессий, миграций,
   файлов), отложенные хвосты.

### 12.7 КОММИТЫ (единственная сессия, где это разрешено)

По спискам файлов из PROGRESS-записей собери ТЕМАТИЧЕСКИЕ коммиты в этом
порядке (файл попадает в коммит ПЕРВОЙ сессии, которая его создала; если
файл правили несколько сессий — в коммит первой):

1. `fix(db): financial field guards, payment races, definer scoping (v3 s1)`
2. `feat(audit): activity log completeness + payout integrity (v3 s2)`
3. `fix(cash): sql opening balances, backfill, row caps (v3 s3)`
4. `perf(dashboard): aggregates, parallel fetches, kyiv tz, locking (v3 s4)`
5. `feat(ux): error boundaries, confirm dialog, nav fixes (v3 s5)`
6. `feat(ux): global task, notifications bell, loading, mobile reports (v3 s6)`
7. `feat(crm): lost outcome, conversion, sources, conflict check (v3 s7)`
8. `feat(notify): telegram digest + ics feed (v3 s8)`
9. `feat(billing): payment plan, overdue, debt aging (v3 s9)`
10. `feat(design): aa contrast, tokens, DESIGN.md rewrite (v3 s10)`
11. `feat(design): toasts, hotkeys, filter presets, my-day, polish pass (v3 s11)`
12. `chore(quality): validation module, dead code, ci, e2e (v3 s12)`

Каждый коммит: `git add <точные пути>` → `git commit -m "<сообщение>"`
(подпись Co-Authored-By по правилам проекта). Если распутать файл по
сессиям не выходит — добавь его в наиболее тематически близкий коммит;
в крайнем случае допусти один общий коммит остатка
`chore: v3 hardening cycle leftovers`. После коммитов `git status` должен
быть чистым (кроме .claude/ и прочего мусора вне репо-скоупа).

### 12.8 НЕ ПУШИТЬ АВТОМАТИЧЕСКИ

Доложи пользователю: «Цикл собран в N коммитов, готов к пушу». Пуш
(`git push`) и прод-миграции — ТОЛЬКО после явного «ок». При «ок»:
1. напомни про свежий дамп прода ПЕРЕД `npx supabase db push` (правило
   PLAN-V2 «Бэкап и откат»);
2. `git push origin master` → Vercel задеплоит;
3. `npx supabase db push` (⚠ если упадёт 23514 на activity_log — это
   грабля allowlist, см. шапку);
4. напомни пользователю руками: Vercel env (`TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_NAME`),
   настроить webhook бота (`https://api.telegram.org/bot<TOKEN>/setWebhook?url=<домен>/api/telegram/webhook&secret_token=<SECRET>`),
   и проверить в Supabase Dashboard, что включены асимметричные JWT-ключи
   (иначе getClaims ходит в сеть и перф-фикс не работает).

---

## Сводная карта «находка аудита → сессия»

| Находка (severity) | Сессия |
|---|---|
| Самоповышение ЗП через category (HIGH, подтв.) | 1 |
| Гонка recalc_case_totals (med) | 1 |
| Правка act-платежа / contract_sum → дрейф актов (med ×2) | 1 |
| confirm_act_paid/set_act_completion без case-скоупа (med) | 1 |
| Удаление документов без скоупа (med) | 1 |
| Лог: payment_updated/act_deleted/payroll_payout/этап (med ×2) | 2 |
| Σ аллокаций, create_payout, payroll_rates DELETE (med, low) | 2 |
| CHECK inn/closed_at, отпуска-пересечения, индексы FK (low ×4) | 2 |
| max_rows=1000: касса/бэкфилл (HIGH, подтв.) | 3 |
| max_rows: счётчики этапов, доска (med) | 3 |
| Дашборд качает всё ×2, водопады (med ×2) | 4 |
| UTC vs Киев, optimistic locking, RLS-initplan (low/med) | 4 |
| upcoming-блок забит просрочками, driver.js в бандле (low ×2) | 4 |
| Нет error.tsx (HIGH, подтв.) + window.confirm + акты в навигации + ФОП + топбар + «Документы» + молчаливые отказы (med/low) | 5 |
| Глобальная задача, колокольчик, loading, мобильные отчёты, доска (med/low) | 6 |
| Нет lost-исхода/конверсии/источников (HIGH prod) + конфликт-чек (HIGH prod) | 7 |
| Напоминания только внутри (HIGH prod) + календарь-синк (med) | 8 |
| График платежей (med) + aging (nice) | 9 |
| DESIGN.md устарел (HIGH, подтв.) + контраст AA (HIGH ×2, подтв.) + радиусы/оверлей/печать (med ×3) | 10 |
| Шорткаты из DESIGN.md (low), пресеты фильтров (nice), полировка доски, обратная связь действий (тосты), «Мой день», единые empty-states, консистентность экранов | 11 |
| Дубли валидации, мёртвый леджер, нет CI (med ×2), e2e (med), CLAUDE.md §5 (med) | 12 |

Не вошло в сессии (осознанно, см. «Вне скоупа»): ЄДРСР, docx-шаблоны,
email-интеграции, портал, pg_trgm, полнотекст по документам, PWA,
oo-callback defense-in-depth (low; добавить при следующем касании OnlyOffice),
trust accounting.
