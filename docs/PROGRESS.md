# PROGRESS — Юр CRM

> **Назначение.** Этот файл — единственный источник правды о ходе разработки между
> сессиями. В начале каждой новой сессии первым делом читай его (последнюю запись)
> сразу после `CLAUDE.md`. По команде пользователя «завершаем сессию» — обязательно
> добавь сюда новый handoff-блок.

> ⚠️ **Устаревшая терминология в ранних записях.** До перехода на финальную
> «Новую Концепцию» модель ролей была другой. Ранние записи лога используют старые
> термины — читай их ТОЛЬКО через это соответствие (сами термины в БД и коде уже
> не существуют):
> - `jurist` / `specialist` (роль) → **`expert`** (Эксперт — адвокат/юрист-исполнитель,
>   ведёт дело, `cases.responsible_id`) ИЛИ **`lawyer`** (юрист-продажник, заключает
>   договор и вносит платежи, `cases.lawyer_id`) — по контексту записи;
> - `assistant` (помощник) → **роли нет** (полностью удалена; задачи и навигацию
>   ведут оставшиеся роли);
> - `supervisor` / `supervisor_id` / `current_user_supervisor_id` →
>   **удалены** (иерархии супервайзеров больше нет; видимость дел — по
>   `lawyer_id` / `responsible_id`, без начальников);
> - `specialist_type` → **удалено** (специализаций-подтипов нет).
>
> Финальная модель — ровно **5 ролей**: `owner` (владелец/супер-админ),
> `admin` (руководитель подразделения), `office_manager` (офис-менеджер/секретарь),
> `lawyer` (юрист-продажник), `expert` (Эксперт-исполнитель). Подробности и матрица
> доступа — `CLAUDE.md` §4. Актуальные тестовые логины — в `scripts/seed.ts`
> (owner/admin/office/lawyer/lawyer2/expert/expert2 @yur.local, пароль `test12345!`),
> а НЕ «jurist/assistant» из ранних записей. Используй глоссарий выше.

> 📦 **Полная история сессий 1–21** (циклы v1 MVP, v2 «Подразделения», v3 «Hardening»)
> вынесена в [`docs/archive/PROGRESS-history.md`](archive/PROGRESS-history.md) — этот файл
> держим лёгким: снимок «Текущее состояние» + последние сессии + регламент. Исторические
> планы циклов — [`archive/PLAN-V2.md`](archive/PLAN-V2.md),
> [`archive/PLAN-V3.md`](archive/PLAN-V3.md); исходный бриф —
> [`archive/kickoff-prompt.md`](archive/kickoff-prompt.md). Историю в архиве **не переписываем**.

---

## Сессия 2026-07-19 — UI-фидбек владельца: карточка сотрудника, inline-правка деталей дела, колокольчик ✅ 🚀

_Владелец давал задачи поштучно со скриншотами. Новый регламент сессии: браузерные
проверки после каждой правки НЕ гонять (владелец смотрит сам на dev :3001), только
`tsc`+`eslint`; dev-сервер держать запущенным. Пароль `owner@yur.local` в dev-базе
сброшен на сидовый `test12345!` (одноразовый скрипт, гоча 16.07 закрыта)._

**Модель:** Claude Fable 5

### Сделано
- **A. Карточка сотрудника — пустая зона под «Роль і підрозділ»**
  (`settings/users/[userId]/page.tsx`): с owner-панелью «Доступ і вхід» зарплата
  теперь встаёт слева под роль (колонки ровные), без неё — прежняя пара
  «роль слева / зарплата справа». Коммит `e2faad9`.
- **B. Меню этап-дропдауна обрезалось на нижней границе шапки дела**: причина —
  `overflow-hidden` в базовом `Card`. Шапке дан `overflow-visible`, а нижней полосе
  оплаты — собственное скругление `rounded-b-[calc(var(--r-card)_-_1px)]`.
- **C. Inline-редактирование «Деталей справи»** (запрос владельца): едва заметный
  карандаш (opacity 30%→100% при hover), клик — компактный инпут/селект на месте
  значения. Поля дела: №/назва, предмет, тип, категория (staff-only), приоритет;
  клиента: телефон, e-mail, джерело. Enter/✓ сохраняет; Esc/✕/клик-вне —
  **отменяет** (черновик отбрасывается, клик по Radix-порталу селекта — не «вне»).
  Новые лёгкие экшены `updateCaseFieldAction`/`updateClientFieldAction`
  (валидация/права/журнал — зеркала полных форм: category — staff, клиент — staff
  или автор записи; `case_updated`/`client_updated` diff в activity_log).
  `clients.created_by` добавлен в join `CaseWithRefs`. Новый компонент
  `components/cases/inline-edit-field.tsx`. Коммит `e036db0`.
- **D. Колокольчик → попап уведомлений** (3 хотелки владельца): (1) клик открывает
  окно под значком (не переход на /tasks; ссылка «Усі завдання →» внутри);
  (2) три секции — просроченные задачи, задачи на сегодня, просроченные платежи
  графика (`getOverduePayments`, RLS-скоуп зрителя), контент лениво при открытии;
  (3) бейдж гаснет при просмотре: `user_notify_channels.notifications_seen_at`
  (**миграция `0005_notifications_seen.sql`**, self-RLS upsert), бейдж вернётся
  при событии новее отметки («момент события»: просрочка=due_at, сегодняшняя=старт
  дня Киева, новая задача=created_at — `getNotificationsUnseen`). Ширина попапа —
  34rem по просьбе. Новый `components/app/notification-bell.tsx`. Коммит `872040a`.

### Решения и почему
- Inline-экшены отдельными лёгкими action'ами (по образцу
  `updateCaseDescriptionAction`), НЕ через `updateCaseAction` полной формы —
  не тащить все поля ради одного; optimistic-locking не добавлен (точечный UPDATE
  одного поля, прецедент — description).
- Бейдж считается только по задачам (платежи — в попапе, но не в бейдже):
  RPC просроченного плана на каждый рендер layout — лишний вес.
- Клик-вне редактора = отмена (не сохранение) — прямое требование владельца.

### Незакрытые вопросы / TODO
- [ ] `push-env.bat` в корне так и не запущен с 16.07 (untracked) — спросить
  владельца: удалить? (План «убрать env из репо + ротация ключей» из хвоста 16.07
  актуален только если батник запускали.)
- [ ] Хвосты v4: ротация засвеченных R2 Secret + Supabase пароля, удаление старой
  us-east-1 Neon-базы, снятие @supabase/* пакетов.

### Handoff для следующей сессии
- **Стартовать с:** ⚠️ проверить, применил ли владелец миграцию 0005 на прод
  (`node --env-file=.env.prod --import tsx scripts/db-migrate.ts`) — до неё
  счётчик колокольчика на проде не гаснет при просмотре (fallback `9783bed`
  держит прод живым, остальные фичи работают). Затем — фидбек по сессии.
- **Подводные камни:** (1) после правки `prisma/schema.prisma` + `prisma generate`
  dev-сервер НЕ подхватывает новый клиент — стоп, удалить `.next`, старт
  (Turbopack кэширует артефакт: «Unknown field … for select» при живой колонке);
  (2) прод-миграции из агента блокирует классификатор (git push через Bash
  прошёл) — миграции на прод владелец запускает сам; код перед пушем делать
  устойчивым к отсутствию новых колонок (expand/contract, как `9783bed`).

### Коммиты (ВЫКАЧЕНО НА ПРОД: push `78debbb..9783bed` → Vercel)
- `e2faad9` fix(users): employee card two-column layout without dead space
- `e036db0` feat(cases): inline editing in case details + unclipped stage menu
- `872040a` feat(notifications): bell popover with seen-reset badge
- `850593b` docs: session handoff 2026-07-19
- `9783bed` fix(notifications): tolerate missing 0005 column until prod migration runs

---

## Сессия 2026-07-16 (вечер) — UI-фидбек владельца: палитра, карточка сотрудника, сплит прав ✅ 🚀

_Владелец давал задачи поштучно с командой «ПРИСТУПАЙ». Три фичи, все проверены в
браузере на dev (:3001) и ВЫКАЧЕНЫ НА ПРОД: прод-миграция БД применена ДО пуша кода
(порядок важен — новый UI пишет новые ключи прав, старая БД их отвергла бы)._

**Модель:** Claude Fable 5

### Сделано
- **A. Палитра-ревизия «чистые тона»** (жалоба: «все цвета болотные/тусклые»).
  Причина: AA-затемнение v3 s10 снижало светлоту без подъёма чистоты тона. Замены в
  `globals.css` (токены) + `DESIGN.md` (§3 + Decisions Log): ink `#14211B→#101828`
  (зелёный подтон убран, тени → `rgba(16,24,40,…)`), success → emerald
  (`#10B981/#D1FAE5/#047857`), warning горчичный янтарь → живой оранжевый
  (`#F97316/#FFEDD5/#C2410C`, вместе с этапом `awaiting` и категорией
  `representation`), consultation-fg `#6D28D9`, claim-fg `#BE185D`, error-text
  `#B91C1C`, `text-subtle #646E82`, аватары 4–6 → `#EA580C/#0D9488/#6366F1`
  (кирпич/болотный teal/серый → orange/teal/indigo). AA сохранён — скрипт-проверка
  29 пар, все PASS. Печатный отчёт (`report-document.tsx`) не тронут (автономная
  палитра — исключение DESIGN.md).
- **B. Карточка сотрудника `/settings/users/[id]`** (вместо инлайн-редакторов в
  строках списка). Шапка (аватар, роль, статус, деактивация) + секции «Роль і
  підрозділ» / «Зарплата» (+ссылка на з/п-отчёт) / «Доступ і вхід» (owner-only,
  перенос из модалки → `user-credentials-section.tsx`) / «Персональні права» —
  **тумблеры** (`user-perms-toggles.tsx` + новый `ui/switch.tsx`): показывают
  ЭФФЕКТИВНОЕ право; «как у роли» скрыт (решение владельца — путал); выбор,
  совпавший с ролевым дефолтом, снимает override сам; отличие — бейдж «змінено» +
  кнопка «Скинути до ролі». Список `/settings/users` — только просмотр, строка
  кликабельна (after-оверлей). Удалены `user-perms-editor` / `user-credentials-modal`
  / `user-salary-editor`; `user-assignment-editor` ЖИВ (нужен /settings/departments).
  Экшены ревалидируют `/settings/users/[userId]` (`'page'`).
- **C. Сплит составных прав 3→6 (итого 15 капов)** — запрос клиента «больше
  разделений прав»: `edit_payments` → + `delete_payments` (удаление платежа: RLS
  DELETE-политика, кнопка-корзинка, экшен); `manage_users` → + `create_users`
  (создание сотрудников: форма списка, `canCreateTargetUser`, гейты навигации;
  роли/права/деактивация — за manage_users); `can_manage_cash` → + `view_cash`
  (страница `/reports/cash` в read-only: отчёт без форм/кнопок, `canManage`-проп в
  `cash-report`; оба права кассы выдаёт только owner). Миграция
  **`db/migrations/0004_split_capabilities.sql`**: `cap_role_default` (15),
  `validate_perm_overrides`, `can_grant_cap` (+view_cash owner-only), ALTER POLICY
  `payments_delete_managers` / `cash_*_select`, `cash_balances_before` (view OR
  manage), **бэкфилл** — явный override старого права копируется в половинку
  (поведение 1:1, проверено на dev-данных). TS-зеркало `types/db.ts`, `requireAnyCap`
  в require-role, i18n uk/ru (15 лейблов), CLAUDE.md §4, сид кассы (+view_cash).

### Проверки
- tsc + lint чистые; e2e в браузере: qa-owner создал сотрудника формой
  (create_users), включил ему view_cash тумблером («змінено»-бейдж), юрист увидел
  кассу read-only, /settings — forbidden; QA-учётки удалены после.
- `smoke:rls` НЕ гонялся: ему нужны сид-логины, а в dev-базе копия реальных учёток
  (сид перезаписал бы пароли). Прогонится в CI. ⚠️ Портировать 0004-инварианты в
  smoke-rls — задача следующей сессии.
- Прод: бэкап `backups/perm-overrides-prod-2026-07-16*.json` (gitignored, только
  затронутое миграцией поле) → `db:migrate` с `.env.prod` → ok → пуш кода.

### Гочи сессии (для следующего агента)
- ⚠️ **ENV-ФАЙЛЫ ВРЕМЕННО В РЕПО.** `.env.local` / `.env.prod` / `.env.cloud`
  закоммичены СОЗНАТЕЛЬНО (решение владельца 16.07 после предупреждения о рисках) —
  для переноса работы на другой комп. **Первым делом после того, как владелец
  подтвердит, что новый комп работает: удалить их из репо (git rm --cached +
  вернуть в .gitignore-состояние) и предложить ротацию ключей** (Neon-пароли,
  AUTH_SECRET, R2) — в git-истории они останутся навсегда.
- Пароль `owner@yur.local` в dev-базе НЕ сидовый (в dev — копия реальных учёток
  прода). Для браузер-проверок создавай временную QA-учётку скриптом через adminDb
  и удаляй после (шаблон — в истории этой сессии).
- Файлы правь ТОЛЬКО инструментами Edit/Write: PowerShell `-replace`+`Set-Content`
  ломает кодировку (BOM) и финальный перевод строки.
- Право `edit_payments` («Змінювати платежі») пока держит только UPDATE-политику
  БД — UI правки платежа в системе НЕТ (платёж создаётся и удаляется). Появится
  правка — гейтить по нему.
- В `user-create-form` блок персональных прав виден только обладателю
  `manage_users` (create-only создаёт с ролевыми правами).

---

## Сессия 2026-07-16 — Цикл v4: Уборочная сессия (Supabase-остатки + мёртвый код) ✅ 🚀

_Вторая пост-переездная сессия. Владелец выбрал уборку («обе сразу»: Supabase + код),
затем «комить всё и пуш». Выкачено на прод (push в master → Vercel)._

**Модель:** Claude Opus 4.8

### Сделано
- **A. Supabase decommission.** Приложение (`src/`) Supabase уже НЕ использовало —
  остатки жили только в скриптах переезда. Удалено: `scripts/migrate-data.ts`,
  `migrate-files.ts`, `verify-migration.ts`, `clean-schema-dump.mjs`; весь каталог
  `supabase/` (config.toml + **69 исторических Supabase-миграций** + seed.sql — свёрнуты
  в `db/migrations/0001_baseline.sql` ещё в v4). Пакет `@supabase/supabase-js` снят из
  `package.json` (+`npm install` → lock −8 пакетов), убраны npm-скрипты
  `migrate:data/files`/`verify:migration`, почищены `.env.example` (секция Supabase),
  `.gitignore` (блок supabase local), устаревшие комменты `vitest`/`playwright`.
  ⚠ Прод-Supabase как БД **живёт** (окно отката ~30 дней) — сняты только инструменты
  из репо (восстановимы из git history при нужде).
- **B. Дедуп денежного форматтера.** 6 payroll-файлов (`payroll-actions`,
  `payroll-list-mobile`, `report/employee-report`, `report/summary-report`,
  `reports/payroll/page`, `reports/payroll/[userId]/page`) переведены с локального
  `const MONEY = Intl.NumberFormat(...)` на общий `formatMoney`/`formatPercent` из
  `@/lib/utils`. Все 6 копий были идентичны канону → вывод НЕ изменился; проценты
  (ставки) — на семантически верный `formatPercent`.
- **C. Поле-призрак `accrual_mode` убрано из UI/кода.** Форма дела больше не показывает
  мёртвый селектор «Начисление зарплаты» (триггер леджера снят в v3 с12). Выдрано из
  `case-form.tsx`, `lib/cases/actions.ts` (14 мест: типы/парсинг/create/update/diff),
  `queries.ts`, `types/db.ts` (`AccrualMode`/`ACCRUAL_MODES`/`CaseRow`), i18n (uk+ru:
  enums + caseCard). **Колонка+enum в БД/`schema.prisma` ОСТАВЛЕНЫ** (NOT NULL DEFAULT
  `on_completion`; create без поля → БД подставит default). Полный снос колонки — Phase 2
  (тот же приём, что с замороженным леджером). Прод-миграций эта сессия НЕ требует.

### Проверки
- `tsc --noEmit` 0 ✓, `eslint` 0 ✓, unit **148/148** ✓, **`next build` ✓** (прод-сборка
  как пред-push гейт: «Compiled successfully», exit 0).
- Ручная сверка: `accrual` в ручном `src/` не осталось (кроме несвязанного
  `caseCard.detail.myAccrual` = «Моё начисление» и сгенерированного `src/generated/prisma/*`,
  где enum корректно остаётся — колонка в схеме сохранена).

### Грабли / критичное
- **Браузерный QA формы дела НЕ выполнен:** headless-логин в форму не проходит — вход это
  server action, синтетический ввод в контролируемые поля не долетает до FormData
  (`loginAction({}, {})`). Известная гоча QA (не регрессия — логин не трогали).
  Корректность части C держат типы (`tsc` упал бы при рассинхроне формы/actions) + зелёный
  `next build`. При желании — ручная проверка `/cases/new` (селектор исчез).
- **`npm ci` в CI** требует синхронный lock — после снятия пакета `npm install` обязателен
  (сделано). CI (`ci.yml`) на чистом Postgres, скрипты переезда там не звались → не задет.
- Push в master = **редеплой прода** (Vercel). Выкачено по явному «пуш» владельца после
  зелёного build.

### Дальше (хвосты — на владельце)
- Хвосты прошлой сессии в силе: ротировать засвеченные ключи (R2 Secret + Supabase
  пароль/service_role), удалить старую us-east-1 Neon `yur-crm`, держать прод-Supabase
  ~30 дней как откат.
- Phase 2 (когда решится): снести колонку `cases.accrual_mode` + enum одной миграцией;
  судьба замороженного `payroll_ledger`.
- Опц.: сессия 8 «Почта» (Resend/nodemailer) — последняя плановая сессия v4.

---

## Сессия 2026-07-15 — Цикл v4: Канарейка/стабилизация (день 0) — дыра окна отсечки найдена и закрыта ✅

_Первая пост-переездная сессия («Продолжаем V4»). Владелец выбрал стабилизацию/канарейку.
Все проверки read-only, кроме одного одобренного точечного бэкфилла. Прод здоров и полон;
коммитов/пушей не делалось (push = редеплой прода)._

**Модель:** Claude Opus 4.8

### Сделано
- **Здоровье кода (локально):** `tsc --noEmit` ✓, `eslint` ✓, unit **148/148** ✓.
- **ACL-аудит Neon prod** (`node --env-file=.env.prod --import tsx scripts/acl-audit.ts`):
  чисто — гранты / RLS / колоночная приватность `salary_*` на боевой ветке в порядке.
- **verify-migration (Supabase-prod ↔ Neon-prod)** нашла дрейф: `clients` 312↔287,
  `activity_log` 356↔331 — источник на +25.
- **Диагностика (read-only):** «дыра окна отсечки». Снимок для переноса снят ~12:54,
  но приложение писало в Supabase ещё ~час (до 13:53). За окно внесли **25 РЕАЛЬНЫХ
  клиентов** (укр. ФИО+телефоны, по одному `client_created`) — на Neon не попали. НЕ потеря
  Neon и НЕ правки существующих строк (в окне только client_created). Утечка закрыта
  (Supabase-writes встали в 13:53; дела/платежи/акты за окно не создавались).
- **Бэкфилл (владелец «ок» — ЕДИНСТВЕННАЯ прод-запись сессии):** 25 clients + 25
  activity_log Supabase→Neon. Backup `backups/backfill-cutover-window-*.json` (gitignored);
  сохранены id/created_at/created_by; `OVERRIDING SYSTEM VALUE` для identity `activity_log.id`
  (439–463) + `setval`; **0 триггеров** на обеих таблицах (created_at не перетёрт);
  `ON CONFLICT (id) DO NOTHING`; одна tx с rollback. **Перепроверка verify-migration = 0
  расхождений** (строки+деньги+пароли 1:1).
- **Прод-смок:** `/` → 307 `/login?next=%2F` (auth-мидлвар работает), `/login` → 200
  (рендер «ЮрКейс» + поля входа, без Application error/next-error).
- **Тщательная посодержательная сверка** (md5 ВСЕХ полей каждой строки по всем таблицам +
  столбцовый разбор + HEAD файлов R2): ВСЕ реальные данные идентичны 1:1; файлы **6/6 в R2**
  (2.25 MB). Единственное расхождение — timestamptz-столбцы потеряли **микросекунды** при
  переносе с7 (node-pg Date round-trip: `.649804`→`.649`); столбцовый разбор подтвердил —
  расходятся ТОЛЬКО `*_at`, ни одного не-датового столбца. Косметика, НЕ лечим.

### Проверки
- Локально: tsc/eslint/unit 148 зелёные; рабочее дерево чистое (temp-скрипты диагностики
  удалены, backup gitignored).
- Прод read-only: acl-audit чист; verify-migration после бэкфилла — 0 расхождений;
  deep-verify + col-diff — только суб-мс дрейф дат, данные 1:1; R2 6/6.

### Грабли / критичное
- **Дыра окна отсечки (УРОК для будущих переездов):** заморозка должна держаться до ПОСЛЕ
  переключения env + verify, а не до снимка данных. Трафик на старой БД в окне между снимком
  и env-switch теряется (здесь — 25 клиентов, восстановлены бэкфиллом).
- **verify-migration (COUNT+деньги+пароли) НЕ ловит правки ВНУТРИ строк** — для полной
  уверенности нужен посодержательный md5 всех полей (deep-verify). Здесь правок не было
  (журнал окна = только client_created; deep-verify подтвердил).
- **µs-срез таймстампов при переносе — норма** (node-pg Date). Невидим в UI, не влияет на
  optimistic-lock (сравнение Neon↔Neon) и сортировки. Будущей deep-compare НЕ пугаться
  «content-diff» — это те самые доли секунды.
- **Прод-скрипты гоняются переопределением env-файла:** `node --env-file=.env.prod --import
  tsx scripts/<...>.ts` (npm-скрипты прибиты к `.env.local` = Neon dev). `.env.prod` содержит
  и `SOURCE_DATABASE_URL` (Supabase-источник), и `DATABASE_URL_ADMIN_DIRECT` (Neon prod).
- git: чисто, коммитов не делалось (прод-БД-бэкфилл вне репо; хендофф — этот блок + память).

### Дальше (хвосты — на владельце, без изменений)
- ⚠️ **Ротировать засвеченные ключи:** R2 Secret (приоритет — R2 в активной работе) +
  пароль/service_role прод-Supabase.
- **Удалить старую us-east-1 Neon `yur-crm`** (Washington, ошибочный проект первой попытки)
  в Vercel → Storage — НЕ путать с боевым Supabase.
- **Supabase-прод держать ~30 дней** (окно отката + источник повторной сверки). После окна —
  уборочная сессия: снять `@supabase/supabase-js` + каталог `supabase/` + скрипты migrate-*.
- **Канарейка первых дней:** следить за скоростью Neon (cold start на free) и ошибками Vercel
  logs; решение о платном плане — по фактам.
- При желании — **сессия 8 «Почта»** (Resend/nodemailer): единственная оставшаяся плановая
  сессия v4 (нужен верифицированный домен для отправки).

---

## Сессия 2026-07-15 — Цикл v4, Сессия 7: ПРОД-ПЕРЕЕЗД Supabase → Neon + R2 ✅ 🚀

_Седьмая (финальная) сессия цикла v4. Боевой переезд прода с Supabase на Neon +
Cloudflare R2. Владелец завёл R2, дал прод-Supabase доступ, обеспечил заморозку и
переключил Vercel. **Переезд удался — прод НА NEON с 2026-07-15.**_

**Модель:** Claude Opus 4.8

### Сделано (боевой переезд)
- **R2 заведён** (владелец): Cloudflare-аккаунт, bucket `case-documents`, account
  `f33258766ec85bab64d190bab86ffd90`; ключи проверены сквозным roundtrip.
- **Прод-Supabase доступ** (владелец, проект `fmzevqyquljecmsiqsoj`): Session-pooler
  connection (IPv4), service_role, Project URL — в `.env.local`/`.env.prod`.
- **Генеральная репетиция** (dev-ветка): перенос 634 строк, сверка сошлась (кроме
  живого дрейфа +1 клиент). **Adversarial-ревью нашло 4 CRITICAL в migrate-data
  ДО боя — исправлены** (C1 auth-first, C2 column-intersect, C3 single-tx, C4 pwd-
  checksum); подтверждены на реальных данных.
- **Neon production-ветка** (`ep-red-pine-as8mojal`): миграции 0000-0003 (шим+
  baseline+данные+pwd_version), пароль app_user задан, ACL-аудит чист.
- **Боевой перенос:** данные Supabase→Neon prod (**653 строки**, verify **0
  расхождений** — деньги+пароли+строки 1:1), файлы Supabase→R2 (**6 док, 2.25 MB**).
- **Vercel переключён** (владелец): env DATABASE_URL_APP/ADMIN (Neon prod), новый
  AUTH_SECRET, STORAGE_PROVIDER=s3, S3_* (R2); старые SUPABASE_* удалены.
- **Первый push цикла** (`c96fcbe..4b179f9`): весь стек v4 (с1-с6) + редизайн v5
  выкачен на прод. Vercel пересобрался на Neon-коде.
- **Smoke прода:** логин-страница без ошибок; владелец вошёл своим паролем (пароли
  перенеслись), данные (279 клиентов, дело, документы) на месте, интерфейс новый.

### Инфраструктура прода (новая)
- **БД:** Neon проект UR (Frankfurt), production-ветка `br-jolly-recipe-asyx3pq1`,
  endpoint `ep-red-pine-as8mojal` (direct) / `-pooler` (app+admin пулы).
- **Файлы:** Cloudflare R2 `case-documents` (S3-совместимое, `.r2.cloudflarestorage.com`).
- **Auth:** свой JWT (новый AUTH_SECRET на проде). **Деплой:** push master → Vercel.
- **Миграции прода:** `node --env-file=.env.prod --import tsx scripts/db-migrate.ts`
  (`.env.prod` gitignored — Neon production строки + Supabase-source + R2).

### Осталось (хвосты, НЕ блокируют работу)
- ⚠️ **Ротация засвеченных в чате доступов** (владелец): R2 Secret Access Key
  (перевыпустить в Cloudflare → новый в Vercel+.env.local) + пароль прод-Supabase
  и service_role — сменить (Supabase теперь запасной, не срочно). Значения НЕ пишем
  в git-доки — только в `.env.*` (gitignored).
- **Удалить старую us-east-1 Neon-базу** `yur-crm` (Washington, хвост с1) — Vercel Storage.
- **Финальное снятие** `@supabase/supabase-js` + каталога `supabase/` + scripts
  migrate-* (Supabase больше не источник) — уборочной сессией после отката-окна.
- **Канарейка** первых дней: следить за ошибками прода (Vercel logs).
- Supabase-прод НЕ удалять ~30 дней (окно отката).

### Дальше
- Цикл v4 ЗАВЕРШЁН. Система на Neon+R2. Следующее — стабилизация/наблюдение +
  уборка supabase-остатков; при желании — почта (сессия 8 плана, Resend/nodemailer).

---

## Сессия 2026-07-15 — Цикл v4, Сессия 6: Чистка, CI, скрипты переезда, доки ✅

_Шестая сессия цикла v4 по `docs/PLAN-V4-POSTGRES.md`. Владелец выбрал **автономную
часть целиком**: чистка supabase из приложения, полный порт smoke-rls на Prisma, CI
на Postgres-service, скрипты генеральной репетиции переноса (T7), порт демо-сида,
обновление доков. Боевая репетиция переноса (нужен прод-дамп) и R2 — отдельным шагом
ближе к с7. Прод не трогался; push запрещён до с7._

**Модель:** Claude Opus 4.8

### Сделано
- **Чистка supabase из приложения (`src/` — 0 упоминаний):** удалены 3 мёртвых
  обёртки `src/lib/supabase/{server,client,admin}.ts` (приложение их не импортировало
  с сессий 2–5) + `@supabase/ssr` из package.json/lock; вычищено слово «Supabase» из
  комментариев/типов/i18n (temp-password, types/db, storage/types, db/{rpc,index,admin},
  documents/actions, user-credentials-modal, ru+uk users inviteHint/inviteFailed).
  `.env.example` — supabase-секция переориентирована на «только источник переноса
  файлов» (URL+SERVICE_ROLE для migrate-files, ANON убран).
- **Полный порт `scripts/smoke-rls.ts` на Prisma/userDb** (1116 строк supabase-js →
  21 живая секция на userDb/adminDb/rpc). Прогнан **21/21 зелёным на Neon dev**.
  Секции про `payroll_ledger` (accrual per_payment / revert_payout / гонка «выплата+
  платёж») НЕ портированы — механика леджера заморожена в v3 с12. Адаптации: департ.
  скоуп (admin/office Києва видят только дело A), storage-часть убрана (свой слой не в
  RLS БД), Prisma-семантика (тихий отказ → `updateMany` count:0, WITH CHECK/триггер →
  throw). Удалён частичный `smoke-rls-v4.ts`; `smoke:rls:v4` из package.json убран.
- **CI (`.github/workflows/ci.yml`) переписан:** `supabase start` → **Postgres 17
  service** + наш раннер (`db:migrate` создаёт шим-роли authenticated/app_user →
  `ALTER ROLE app_user PASSWORD` → `db:acl-audit` → `db:seed` → `smoke:rls` →
  `test:integration`). checks-job (tsc/lint/unit) — с dummy `AUTH_SECRET`. Вживую
  активируется первым push (с7).
- **Скрипты генеральной репетиции T7:** `scripts/migrate-data.ts` (самодостаточный
  кросс-БД перенос на `pg`, без pg_dump в PATH: TRUNCATE baseline-таблиц, DISABLE
  TRIGGER USER — НЕ session_replication_role, недоступен на Neon; COPY в FK-порядке
  топосортом, `OVERRIDING SYSTEM VALUE` только для identity-таблиц, auth.users
  маппингом, private-схема, setval из source, ANALYZE) + `scripts/verify-migration.ts`
  (стоп-гейт: COUNT по таблицам + Σ денежных полей до копейки). npm: `migrate:data`,
  `verify:migration`. **verify самопроверен** (source=target=dev → 0 расхождений).
  ⚠ Боевой прогон — с прод-дампом на репетиции (владелец, ближе к с7).
- **Демо-сид `scripts/seed-demo.ts` портирован** на adminDb/Prisma (убран мёртвый
  леджер/payouts/accrual_mode, storage через свой слой, департаменты как seed.ts) —
  прогнан на dev (**10 дел с историями**). Удалены `seed-more.ts` (вариация demo) и
  `seed-accounts.ts` (устарел — прод-учётки через UI `/settings/users`); `db:seed:more`
  из package.json убран.
- **Доки:** CLAUDE.md §2 «Стек» (Neon/свой-auth/Prisma/userDb/adminDb/S3-R2 + пометка
  «прод переключается в с7») и §3 «Команды» (db:migrate/acl-audit/seed/smoke вместо
  supabase CLI); README (стек-таблица, быстрый старт, структура db/migrations);
  `vitest.integration.config.ts` — комментарий Supabase→Postgres.

### Проверки
- `tsc --noEmit` ✓, `eslint` ✓, unit **148/148** ✓, `npm run build` ✓ (все маршруты
  dynamic, без ошибок), `npm install` (lock без `@supabase/ssr`).
- **smoke-rls 21/21 на Neon dev** (все инварианты доступа зелёные).
- **verify-migration самопроверка** (source=target=dev): все COUNT и Σ денежных полей
  идентичны, 0 расхождений — логика сверки валидна.
- **seed-demo на Neon dev:** 10 дел, 7 клиентов, override/документы (storage-слой).
- Финальный аудит: `src/` — 0 supabase; `scripts/` — только источники переноса
  (migrate-files/migrate-data/verify/clean-schema-dump); `@supabase/supabase-js` в deps
  остаётся до переноса файлов (с7).
- **Adversarial-ревью (независимый субагент) нашёл 4 CRITICAL в `migrate-data.ts` —
  ИСПРАВЛЕНЫ** (нельзя было поймать без прод-source): (C1) `public.users` копировался
  до `auth.users`, но имеет FK на неё, а FK — не USER-триггер → abort; фикс — auth
  ПЕРВЫМ. (C2) `copyTable` читал target-колонку `pwd_version` из source, где её нет →
  фикс: пересечение колонок source∩target. (C3) не было обёртки-транзакции → провал
  оставлял триггеры выключенными + baseline вырезанным; фикс — единая target-tx с
  rollback. (C4) `verify` проверял пароли только COUNT, а `coalesce(pwd,'')` обнулял
  NULL-хеш → пустой пароль проходил GREEN; фикс — md5-checksum паролей/секретов в
  verify + СТОП на source-NULL. Плюс: setval из target-max, jsonb через JSON.stringify,
  bind-лимит, каталог-гейт RLS в smoke (20 таблиц). После фиксов: smoke 22/22, verify
  с integrity-хешами 0 расхождений.

### Грабли / критичное для следующих сессий
- **Триггеры срабатывают и под adminDb** (owner БД обходит RLS, НЕ триггеры): откат
  этапа назад в smoke-сетапе через adminDb упал `stage_backward_forbidden` — stage-
  сетап/cleanup идут через `userDb(owner)` (staff, is_staff-bypass в триггере). То же
  учтено в migrate-data (DISABLE TRIGGER USER на время COPY).
- **`OVERRIDING SYSTEM VALUE`** в INSERT допустим ТОЛЬКО для таблиц с `GENERATED …AS
  IDENTITY` (в схеме только `activity_log.id`) — иначе Postgres отвергает INSERT.
  migrate-data вычисляет identity-таблицы из information_schema и применяет условно.
- **CI не прогнан вживую** (push запрещён до с7) — написан по механике раннера/шима,
  первый реальный прогон = первый push цикла (с7). Пароль app_user задаётся в CI
  `ALTER ROLE` (шим создаёт роль LOGIN без пароля).
- **T7-скрипты боеготовы после РЕПЕТИЦИИ** (плановая оговорка): нет прод-source-БД для
  боевого прогона сейчас; структурно проверены (tsc + verify самопроверка). Финал —
  генеральная репетиция с прод-дампом.
- **dev-ветка сейчас с ДЕМО-данными** (10 дел от seed-demo) — не seed.ts-состояние.
  Для smoke-rls на 2-дельном сиде: `npm run db:seed` (перезальёт). Integration
  независим (свой IT-namespace).
- **git:** master впереди origin (редизайн v5 + план + c1..c5 + **коммит c6**);
  **push запрещён до с7**. Коммит сессии 6 — локальный.

### Дальше
- **R2 (перед с7, на владельце):** завести Cloudflare R2 (карта), bucket
  `case-documents`, API-token → `S3_*` в env, `STORAGE_PROVIDER=s3`; прогнать
  `npm run migrate:files` (Supabase-прод → R2), сверка количества/размеров.
- **Генеральная репетиция T7 (перед назначением даты переезда):** свежий дамп
  прод-данных Supabase → `SOURCE_DATABASE_URL` → `npm run migrate:data` на Neon dev →
  `npm run verify:migration` (стоп-гейт). Замерить длительность (уточняет окно с7).
- **Перед с7:** `/cso` на финальном стеке доступа (auth + userDb/шим) — правило
  проекта «перед выкаткой»; выравнивание прода по миграциям (db push language +
  case_description), затем сверка слепок↔прод = 0.
- **Сессия 7 (прод-переезд):** окно ~1–2 ч; дамп прода → миграции Neon prod →
  migrate:data → verify (стоп-гейт) → файлы R2 → env-переключение Vercel → **первый
  push цикла** → smoke прода под каждой ролью → канарейка. Финальное снятие
  `@supabase/supabase-js` + каталога `supabase/` — после переноса.

---

## Сессия 2026-07-15 — Цикл v4, Сессия 5: Файлы (storage-слой + перенос) ✅

_Пятая сессия цикла v4 по `docs/PLAN-V4-POSTGRES.md`. Интерфейс `lib/storage`
(S3-совместимый R2/MinIO + локальный провайдер для dev), перевод 6
storage-переплетённых файлов с Supabase Storage на него + скрипт переноса файлов.
Владелец выбрал вариант ① «код сейчас, R2 позже» — весь storage-слой пишется и
проверяется на локальном провайдере; R2-аккаунт заводит владелец перед сессией 7.
Прод не трогался; push не делался (запрет до сессии 7 в силе)._

**Модель:** Claude Opus 4.8

### Сделано
- **`src/lib/storage/` — интерфейс из 4 операций** (`upload/download/signedUrl/remove`,
  план §4.4), выбор провайдера по `STORAGE_PROVIDER` (`local` дефолт | `s3`):
  - `types.ts` — интерфейс `StorageProvider`; `util.ts` — `guessContentType` (mime
    по расширению для локального превью) + `contentDisposition` (RFC 6266/5987,
    кириллица в именах); `index.ts` — фабрика-синглтон `storage()`.
  - `s3.ts` — S3-совместимый (R2 сейчас, MinIO/диск на корп-сервере потом; тот же
    протокол, меняется только env: `S3_ENDPOINT/REGION/ACCESS_KEY_ID/SECRET/BUCKET`,
    `S3_FORCE_PATH_STYLE` для MinIO). Presigned GET-URL через `@aws-sdk/s3-request-presigner`.
  - `local.ts` — файлы в `.storage/` (gitignored). `signedUrl` ведёт на стрим-роут
    `/api/storage/local` с HMAC-подписью (секрет `AUTH_SECRET`, timing-safe verify,
    TTL) — зеркало presigned-семантики S3 (отдача без сессии). Защита от path-traversal.
  - `src/app/api/storage/local/route.ts` — стрим-роут (verify подписи → отдача файла
    с Content-Type/Disposition); публичный путь в `proxy.ts` (как OO-роуты). На проде
    (`s3`) не задействован.
- **6 storage-файлов → userDb/adminDb + storage + rpc** (граница из с4):
  - `documents/queries.ts` — list/getDocument/caseHasDocOfType на userDb; signed-URL
    через `storage()`. `documents/actions.ts` — upload (storage.upload→documents.create,
    rollback storage.remove при отказе), delete (userDb deleteMany + storage.remove).
  - `acts/queries.ts` — listActsByCase/getActPrintData на userDb (include scan/case/client).
    `acts/actions.ts` — create (read+insert в 1 tx), confirmActPaid (storage.upload +
    `rpcConfirmActPaid` в userDb-tx, rollback файла при ошибке RPC), delete/completion.
  - `documents/[id]/content` + `oo-callback` роуты — adminDb (allowlist) +
    `storage.download`/`upload` (OnlyOffice; сессии нет, авторизация по OO-JWT).
- **`scripts/migrate-files.ts`** (`npm run migrate:files`) — перенос Supabase Storage →
  целевой storage: список из `adminDb.documents`, download из Supabase, upload в
  `storage()`; идемпотентен (манифест `backups/`, докачка), сводка + стоп-код на
  «нет в Supabase». Боевой прогон Supabase→R2 — когда владелец заведёт R2 (до с7).
- **Unit-тест** `tests/unit/storage-local.test.ts` (7 кейсов: roundtrip, идемпотентность
  remove, подпись signedUrl valid/подделка/срок, path-traversal).

### Проверки
- `tsc --noEmit` ✓, `eslint` ✓, unit **148/148** (141 + 7 storage) ✓,
  integration **114/114** на Neon dev ✓ (прогон после переписывания 6 файлов).
- **Runtime-смок на Neon** (dev :3001, вход owner, `STORAGE_PROVIDER=local`): полный
  цикл документа на карточке дела — **список** (userDb, документ с типом/датой/автором),
  **превью** (`/preview`→200, inline, содержимое файла, кириллица), **скачивание**
  (`/download`→200, attachment + RFC5987-имя), **удаление** (документ ушёл из БД —
  счётчик вкладки обнулился, файл удалён с диска `storage.remove`). Списки дел/актов
  рендерятся на новом слое.
- `migrate:files --dry-run` запускается в tsx, отрабатывает пустой список + сводку.

### Грабли / критичное для следующих сессий
- **`NextResponse.redirect` требует АБСОЛЮТНЫЙ URL.** Локальный `signedUrl` относителен
  (`/api/storage/local?…`) → роуты download/preview падали 500 «malformed URL». Фикс:
  `new URL(url, req.url)` — резолв по origin запроса; presigned S3-URL абсолютен и
  проходит насквозь (правило: signed-URL из провайдера всегда резолвить по req.url).
- **`import 'server-only'` РОНЯЕТ tsx-скрипты**, тянущие CJS-пакеты (@aws-sdk): server-only
  грузится require-путём → `default` (throw), а не `react-server` (empty). Поэтому весь
  `lib/db` использует guard `if (typeof window !== 'undefined') throw`, НЕ `server-only`.
  Storage-слой приведён к той же конвенции (guard в `index.ts`-фабрике). **Правило: серверные
  модули, которые могут импортироваться скриптами (`scripts/`), — только typeof-window guard.**
- **vitest unit-пул роняет `server-only`** (дефолтный пул тянет `index.js`-throw, в отличие
  от integration-forks с react-server). Добавлен alias `server-only`→`tests/helpers/empty-module.ts`
  в `vitest.config.ts` — серверные модули теперь тестируемы в unit.
- **file-picker недоступен браузерному агенту** → `uploadDocumentAction`/`confirmActPaid`/
  OnlyOffice через UI не гонялись живьём (upload покрыт unit-провайдером + идентичен
  проверенному payments-паттерну; для полного e2e — Playwright с фикстурой файла или ручная
  проверка владельцем). Смок-документ вносился скриптом (те же `storage.upload`+`documents.create`).
- **git:** master впереди origin (+ коммит c5). **push запрещён до с7.**

### Дальше
- **Сессия 6 «Чистка, сиды, CI, доки + ГЕНЕРАЛЬНАЯ РЕПЕТИЦИЯ переезда»:** удалить
  `@supabase/*`, `src/lib/supabase/`, каталог `supabase/`; env-чистка; переписать
  CLAUDE.md §2/§3, README, CI; smoke-rls порт, e2e сид-инфра; `/cso`+`/review` на
  права доступа. Генеральная репетиция переноса данных на dev-ветке (T7, замер окна).
- **R2 (перед с7, на владельце):** завести аккаунт Cloudflare R2 (карта), bucket
  `case-documents`, API-token → заполнить `S3_*` env; `STORAGE_PROVIDER=s3`; прогнать
  `npm run migrate:files` (Supabase-прод → R2), сверка количества/размеров.
- ⚠ `src/lib/supabase/*` (3 файла) + `@supabase/supabase-js` в `migrate-files.ts` пока
  ЖИВЫ намеренно (источник переноса) — удаляются в с6/после переноса файлов.

---

## Сессия 2026-07-15 — Цикл v4, Сессия 4: Данные, часть 2 (11 доменов + machine-роуты) ✅

_Четвёртая сессия цикла v4 по `docs/PLAN-V4-POSTGRES.md`. Механическое переписывание
оставшихся data-доменов с supabase-js на `userDb`/`adminDb` + rpc-реестр по эталону
сессии 3. Прод не трогался; push не делался (запрет до сессии 7 в силе)._

**Модель:** Claude Opus 4.8

### Сделано
- **23 доменных файла → userDb/adminDb/rpc** (+ `rpc.ts` и `eslint.config.mjs` —
  правки-обвязки, итого 25 файлов, ~1300 строк дифф). Ноль импортов
  `@/lib/supabase/*` вне 6 storage-файлов:
  - **Мелочи:** org, i18n, notifications, activity-log, absences.
  - **Финансы:** payments (дедуп + 23505/P2002), payroll (queries+actions+report),
    cash (queries+actions).
  - **Аналитика:** dashboard (6 RPC + getDashboardCases findMany+count +
    getRevenueThisMonth на `aggregate _sum`), search (rpcSearchCaseIds + 4 findMany),
    conflict-check роут.
  - **Machine-роуты (adminDb, allowlist):** cron/reminders, telegram/webhook,
    calendar/[token] — фильтрация везде явная (adminDb обходит RLS).
  - **UI-точки:** payroll-list-mobile.tsx, reports/payroll/[userId]/page.tsx
    (оба — серверные компоненты, механическая замена).
- **Граница с сессией 5 (решение владельца — вариант A):** 6 storage-переплетённых
  файлов (documents×2, acts×2, content, oo-callback) НЕ трогали — целиком в сессию 5
  вместе с `lib/storage.ts` (не касаться файла дважды). Это ровно «6 мест» плана с5.
- **Выплата ЗП (createPayoutAction):** обе вставки (payroll_transactions + аллокации)
  слиты в ОДНУ `userDb`-tx — атомарно; ручной откат оригинала убран. Проверено по
  миграции `20260611100700`: триггер `check_payout_allocations` — `Σ ≤ amount`
  (НЕ строгое равенство, из-за доли премии), DEFERRABLE → срабатывает на коммите.
- **rpc.ts:** 2 обёртки (`rpcPayrollEmployeeSummary/Cases`) → `month: string | null`
  (SQL-функции принимают NULL = «за всё время»).
- **Касса/дефолт-счёт:** снятие прежнего is_default + вставка/правка — в одной tx
  (partial-unique `cash_accounts_one_default`).

### Проверки
- `tsc --noEmit` (весь проект) ✓, `eslint` ✓, unit **141/141** ✓,
  integration **114/114** на Neon dev (все 10 файлов вместе) ✓.
- **Runtime-смок на Neon** (dev :3001, вход owner): `/` (дашборд, 6 функций),
  `/reports/cash`, `/reports/payroll` (реальные данные — «До виплати 5 000 ₴» + ставки),
  `/reports/summary` — все **200**, ноль ошибок приложения (в консоли только
  косметические pg-варнинги SSL + «client already executing», как в с3).
- ⚠ **Формальный Playwright e2e-прогон в этой сессии НЕ гонялся** — гейт с4 закрыт
  integration-сьютом (114, покрывает userDb/RLS-пути напрямую) + runtime-смоком
  конвертированных экранов. Полный e2e — по желанию отдельным прогоном.

### Грабли / критичное для следующих сессий
- **eslint adminDb-allowlist и Next-роуты с `[param]`:** в eslint-globе квадратные
  скобки — это character-class, поэтому буквальный `calendar/[token]/route.ts` НЕ
  матчился и adminDb-импорт падал под запрет. Починено на `*`-wildcard
  (`calendar/*/route.ts`); те же латентные `documents/*/…` записи для с5 тоже
  поправлены заранее. **Правило: новые роуты с `[param]` в allowlist — только через `*`.**
- **`calendar_token` НЕ `@unique`** в schema.prisma (только PK + `telegram_link_code`)
  → `findFirst`, не `findUnique`.
- **DbErrorLike включает `| null | undefined`** → при `prismaErrorToDbError(err).message`
  нужен `?.` (иначе TS2533).
- **Триггерные ошибки (overlap 23P01 и пр.) под model-запросами Prisma:** всплывают
  не всегда как KnownRequestError — детект по `pgErrorCode(err)===code` ИЛИ по тексту
  сообщения (см. absences createAction).
- **git:** master впереди origin (редизайн v5 + план + c1 + c2 + c3 + **коммит c4**);
  **push запрещён до с7**. Коммит сессии 4 — локальный.

### Дальше
- **Сессия 5 «Файлы»:** `lib/storage.ts` (интерфейс + R2/провайдер) + переписать 6
  storage-файлов ЦЕЛИКОМ (documents×2, acts×2, content, oo-callback — и data, и
  storage-часть) + скрипт переноса файлов. R2-аккаунт заводится НА ВЛАДЕЛЬЦА (bus
  factor). После с5 — ни одного импорта supabase вне самих модулей `lib/supabase`.
- Эталон стиля конверсии — файлы сессий 3–4 (для storage-переплетения — acts/actions).

---

## Сессия 2026-07-15 — Цикл v4, Сессия 3: Данные, часть 1 (6 доменов на userDb/Prisma) ✅

_Третья сессия цикла v4 по `docs/PLAN-V4-POSTGRES.md`. Переписаны queries+actions
шести доменов с supabase-js на `userDb`/`adminDb` + rpc-реестр. Прод не трогался;
push не делался (запрет до сессии 7 в силе)._

**Модель:** Claude Opus 4.8

### Сделано
- **6 доменов (12 файлов) → userDb/adminDb/rpc**, ноль импортов `@/lib/supabase/*`:
  - **comments** (`queries.ts`/`actions.ts`) — лента/CRUD; лог правки через
    `rpcLogActivity` внутри той же tx; «тихий no-op под RLS» — `updateMany`/
    `deleteMany` (count), а не `update`/`delete` (те кинули бы P2025).
  - **departments** — справочник со счётчиком (2 параллельных userDb) + CRUD owner.
  - **users** — `listManagedUsers` + доперевод 5 bare-actions (role/perms/active/
    department/**salary**). salary_* — `@ignore`/приватны → чтение через
    `rpcManageUserSalaries`, запись сырым `$executeRaw UPDATE` (табличный UPDATE-грант
    есть, колоночный SELECT закрыт — проверено в baseline).
  - **clients** — список (`.or`→`OR{contains,insensitive}`, `cases(count)`→`_count`,
    отдельный `count()`), `getClient`/`getClientCases`, CRUD; конфликт-чек не тут
    (в rpc-реестре). `birth_date` строка↔Date через `toDbDate`/`dateOnlyOrNull`.
  - **tasks** — 8 query-функций (карточка/страница/календарь/колокольчик/«Мой день»/
    ассайни/`getTask`) на общий `TASK_SELECT` + типобезопасный маппер
    (`Prisma.tasksGetPayload`); enum-сортировка `status asc` = как PostgREST; CRUD.
  - **cases** (самый большой) — `listCases` (q→`rpcSearchCaseIds`+findMany по id с
    восстановлением порядка; без q→findMany+count), `countCasesByStage`→**`groupBy`**,
    `getCase`, доска, справочники; 8 экшенов (create/update/stage/description/lost/
    delete/archive/advance).
- **Гоча T10/V3-5 (`cases.updated_at`) закрыта:** Prisma `Date` усекает микросекунды
  → optimistic-lock давал бы ложный конфликт на каждой правке. `getCase` тянет
  `updated_at::text` (полная точность), `updateCaseAction` сверяет его под
  `SELECT … FOR UPDATE` в одной tx (атомарно, без TOCTOU) → `updateMany`.
  Тест `tests/integration/v4-cases-optimistic-lock.test.ts` (2 кейса).
- **Новый `src/lib/db/convert.ts`** — `dec/decOrNull` (Decimal→number),
  `dateOnly/dateOnlyOrNull` (@db.Date→'YYYY-MM-DD'), `ts/tsOrNull` (timestamptz→ISO),
  `toDbDate` ('YYYY-MM-DD'→Date). Эмпирически проверил (проба на Neon): `@db.Date`
  через PrismaPg приходит Date UTC-полночи → `toISOString().slice(0,10)` корректен
  независимо от пояса раннера (Vercel — UTC).
- **Паттерн конверсии** (эталон для сессии 4): query-функции резолвят текущего
  через `getCurrentUser()` (cache-per-render, лишнего round-trip нет) → `userDb(id,…)`;
  null → пусто (fail-closed). Actions: одна `userDb`-tx на write; ошибки →
  `dbActionError`/`pgErrorCode`/`prismaErrorToDbError`; `redirect()` — ВНЕ try/catch
  (NEXT_REDIRECT пробрасывается).

### Проверки
- `tsc --noEmit` (весь проект) ✓, `eslint` ✓, unit **141/141** ✓,
  integration **114/114** на Neon dev ✓ (112 прежних + 2 новых T10).
- **Runtime-смок на Neon** (dev :3001, вход owner@yur.local): `/cases` и `/clients`
  отрисовали реальные данные (дела с клиентами/экспертами/суммами, счётчик этапов
  «Усі етапи · 2», «2 з 2» клиента) — путь userDb-обёрток работает end-to-end.
  Ошибки консоли — только `getDashboardCases` (дашборд ещё supabase-js, сессия 4).

### Дальше
- **Сессия 4 «Данные, часть 2»**: payments, acts, payroll, cash, dashboard,
  notifications (cron/telegram/calendar), search, activity_log, i18n, org, absences +
  прямые supabase-вызовы в `payroll-list-mobile.tsx`/`reports/payroll/[userId]/page.tsx`
  и machine-роутах. Готово, когда ни одного `@/lib/supabase/*` вне auth/storage;
  все экраны на Neon; полный e2e зелёный (гейт сессии 4).
- Эталон стиля — конвертированные файлы сессии 3 (особенно cases для сложных случаев).

### Грабли / критичное для следующих сессий
- **`prismaErrorToDbError` типизирован как nullable** → optional chaining
  (`?.message`/`?.code`) при разборе ошибок RPC/триггеров.
- **salary_* и прочие `@ignore`-колонки** — только `$executeRaw`/`$queryRaw` (не
  модельные `update`/`select`); правило распространяется на будущие приватные колонки.
- **Промежуточное состояние всё ещё частично нерабочее** (дашборд/финансы/касса на
  supabase-js до конца сессии 4) — норма по плану; e2e гоняем доменами, полный — гейт с4.
- **pg-варнинг** `client already executing a query… removed in pg@9.0` — уровня
  адаптера `@prisma/adapter-pg`, разовый, БЕЗ стека; не от прикладного кода (все
  `userDb` строго awaited, `Promise.all` берёт разные коннекты пула). Косметика;
  присмотреть на пуле/нагрузке в сессии 4/6.
- git: master впереди origin (редизайн v5 + план + c1 + c2 + **коммит c3**);
  **push запрещён до с7**. Коммит сессии 3 — локальный.

---

## Сессия 2026-07-15 — Цикл v4, Сессия 2: Свой auth (JWT) + тестовая обвязка на Neon ✅

_Вторая сессия цикла v4 по `docs/PLAN-V4-POSTGRES.md`. Свой вход вместо GoTrue
(скользящий JWT, ревью V2) + переезд ВСЕЙ integration-обвязки на Prisma/Neon (T6).
Работа автономная ночная (владельца рядом не было). Прод не трогался; push не
делался (запрет до сессии 7 в силе)._

**Модель:** Claude Fable 5 (до исчерпания кредитов) → Opus 4.8 (доводка).

### Сделано
- **Свой auth (замена GoTrue), план §4.2:**
  - `src/lib/auth/session.ts` — скользящий JWT (jose, HS256): `issueSessionToken`/
    `verifySessionToken`/`shouldRenewSession`. Клеймы `sub/email/pwd_version/lat/iat`;
    30 дней бездействия (exp), перевыпуск раз в сутки с сохранением `lat`, потолок
    90 дней от первичного входа. Таблицы сессий НЕТ (перевыпуск идемпотентен).
  - `src/proxy.ts` — переписан: проверка подписи ЛОКАЛЬНО (без сети и БД),
    скользящее продление куки. Урок POST-body соблюдён: request НЕ пересоздаётся,
    публичные/machine-пути пропускаются как есть.
  - `src/lib/auth/current-user.ts` — verify JWT (jose) + ОДИН запрос профиля через
    `userDb` под RLS; сверка `pwd_version` клейма с колонкой (инвалидация сессий),
    страж `is_active`.
  - `src/app/login/actions.ts` — вход через admin-пул: `bcryptjs.compare` с
    `auth.users.encrypted_password` → выпуск JWT-куки. **Rate-limit** (ревью V3-4):
    `failed_attempts` + экспоненциальный `locked_until` (1м→2м→…→15м); dummy-hash
    compare для несуществующего email (анти-тайминговая утечка).
  - `src/app/logout/route.ts` — просто удаление куки (серверного состояния нет).
  - `src/lib/users/profile-actions.ts` — смена своего пароля: bcrypt-сверка старого
    → новый хеш + `pwd_version++` (отзыв всех устройств) одной транзакцией →
    свежая кука текущему устройству.
  - `src/lib/users/credentials-actions.ts` — owner-панель доступов на admin-пул +
    своя `auth.users` (`writePassword` = bcrypt-хеш + `pwd_version++`); email-change
    транзакцией auth+profile; умное удаление через FK-cascade. **Приглашение на email
    удалено** (почта Supabase ушла; своя — сессия 8). Зеркало пароля (RPC) как было.
  - `src/lib/users/actions.ts` — `createUserAction` на admin-пул: `auth_users` +
    `public_users` ОДНОЙ транзакцией (осиротевшие auth-строки исключены); зеркало
    пароля через `userDb`+RPC. (Остальные экшены — role/perms/salary/department —
    ПОКА на supabase-js: это домен users, сессия 3.)
  - `src/lib/activity-log/log.ts` — `logActivity` через `userDb`+`rpcLogActivity`
    (от лица `getCurrentUser`).
  - `src/app/auth/confirm/route.ts` — **удалён** (email-флоу уезжает в сессию 8).
  - i18n: ключ `auth.login.locked` (ru/uk).
- **Миграция `db/migrations/0003_pwd_version.sql`** — `public.users.pwd_version int`
  (+`grant select` колонки authenticated); применена на Neon dev. `schema.prisma` —
  `pwd_version` добавлен вручную (комментарий-предупреждение против db pull).
- **ESLint-allowlist adminDb** расширен: `login/actions.ts`, `users/profile-actions.ts`
  (свой auth лезет в `auth.users` до аутентификации).
- **T6 — вся integration-обвязка на Prisma/Neon (гейт сессии 2):**
  - `tests/helpers/fixtures.ts` — createWorld/destroyWorld на Prisma; «вход» = `userDb`
    (тот же боевой RLS-путь), `hasDbEnv`, пользователь = randomUUID + $transaction
    (auth_users+public_users). Экспорт `userDb`/`adminDb`/`Db`.
  - Все 9 файлов конвертированы (57 → 112 тестов): system(52), absences(20), cash(13),
    v3-financial-guard(6), v3-journal-integrity(5), v3-payment-plan(5), v3-dashboard-rpc(4),
    v3-outcome-conflict(4), v3-cash-rpc(3). Семантика ошибок: PostgREST `{error}` →
    Prisma throw (P2010=raise/42501, P2025=невидимая строка); «SELECT отрезан» → []/null.
  - Unit: `tests/unit/session.test.ts` (13 кейсов: roundtrip/продление/потолок/битый/
    чужая подпись/exp) + `tests/unit/bcrypt-compat.test.ts` — **golden-тест на РЕАЛЬНОМ
    GoTrue-хеше** (выпущен локальным Supabase-стеком, `$2a$10$…`), совместимость
    подтверждена.
- **SQL-функции user management: адаптация НЕ нужна** — проверил тела в baseline:
  ни одна не читает колонки `auth.users` напрямую, все на `auth.uid()` (шим) +
  `public.users`/`private.*`. Плановый пункт снят.
- **Чистота:** `tsc --noEmit` ✓, `eslint` ✓, unit 141/141 ✓, **integration 112/112
  вместе против Neon dev** ✓. `.env.example` +`AUTH_SECRET`; `.env.local` — сгенерён
  AUTH_SECRET (48 байт base64url).

### Дальше
- **Сессия 3 «Данные, часть 1»** (users/departments/clients/cases/tasks/comments):
  переписать `queries.ts`/`actions.ts` этих доменов с supabase-js на `userDb`/`adminDb`.
  ⚠ cases: `updated_at::text` сквозь DTO (optimistic locking, микросекунды — ревью V3-5).
  Остальные экшены users (role/perms/salary/department/active) ещё на supabase-js —
  доперевести здесь.
- **e2e auth.spec** — ПОЛНЫЙ прогон отложен (гейт сессии 4): в промежуточном
  состоянии страницы-контент ещё на supabase-js (дашборд/дела не отрисуются без
  supabase-сессии). Сам auth-механизм покрыт unit(session)+integration(userDb-путь)+
  golden-bcrypt. Гонять e2e вертикальными подмножествами по мере конверсии доменов.
- Хвост владельцу (из сессии 1, не сделано): удалить в Vercel → Storage СТАРУЮ базу
  `yur-crm` (Washington, us-east-1) — от первой попытки.

### Грабли / критичное для следующих сессий
- **Промежуточное состояние ОЖИДАЕМО нерабочее** (план, честная оговорка): вход уже
  свой (JWT), но 44 доменных файла (`queries/actions`) ещё зовут `createSupabaseServerClient`
  — без supabase-сессии их RLS видит anon → экраны данных пусты/падают. Это норма до
  конца сессии 4; тесты идут мимо экранов (прямой userDb-путь), поэтому зелёные.
- **Семантика ошибок Prisma vs PostgREST** (для будущих конверсий): запрещённая
  RLS-запись — throw (не `{error}`); `update/delete` невидимой строки → P2025; для
  «тихий no-op под RLS» использовать `updateMany`/`deleteMany` (вернут count:0 без
  throw), НЕ `update`/`delete` (кинут P2025). raise-текст триггеров доходит в message
  (можно `rejects.toThrow(/фрагмент/)`).
- **Уборка тестов с оплаченными актами**: платёж с `act_id` нельзя снять удалением
  `case_acts` (триггер `payments_guard_act_payment` immutable) — сначала удалить сам
  платёж (revert акта в issued), потом акт. Напоролись cash.test и system.test —
  учтено в их teardown.
- **salary_* недоступны типизированному Prisma** (`@ignore`): в тестах гардов писать
  через `$executeRaw`/`$queryRaw` (helpers setSalaryRaw/getSalaryRaw в system.test).
- **AUTH_SECRET** на проде (Vercel env, сессия 7) — сгенерить свой; смена секрета
  разлогинивает всех. Формат генерации — в `.env.example`.
- git: master впереди origin (редизайн v5 + план + c1 + **коммит c2**); **push
  запрещён до с7**. Коммит сессии 2 — локальный.

## Сессия 2026-07-14 — Цикл v4, Сессия 1: Фундамент (Neon, шим, baseline, data-слой) ✅

_Первая сессия цикла v4 по `docs/PLAN-V4-POSTGRES.md`. Гейт пройден целиком:
dev-ветка Neon живая (миграции+сид), ACL-аудит и RLS-smoke 7/7 зелёные ПРЯМО НА
NEON, схема на Neon бит-в-бит равна слепку (diff = 0). Приложение (next dev)
пока остаётся на локальном Supabase — переключение слоя данных начнётся в
сессиях 2–4, как и заложено в плане._

**Модель:** Claude Fable 5

### Сделано
- **Решение владельца (заменило шаг 0):** автодеплой Vercel НЕ трогаем, вместо
  этого `git push` ЗАПРЕЩЁН до сессии 7 (план §5 обновлён, T9 закрыт; хотфикс
  прода = ветка от `origin/master` + ручной deploy ветки).
- **Слепок схемы:** `db reset` → pg_dump → `scripts/clean-schema-dump.mjs`
  (повторяемый чистильщик: `\restrict`, гранты anon/service_role/postgres,
  ALTER DEFAULT PRIVILEGES, `CREATE SCHEMA public`) →
  `db/migrations/0001_baseline.sql` (6146 строк). Самовоспроизведение доказано
  (дамп применённой копии = слепку).
- **Шим `0000_shim.sql`:** роли `authenticated` + `app_user` (LOGIN, только
  SQL'ем!), схема `auth` со своей `auth.users` (+`failed_attempts`/`locked_until`
  под rate-limit с2), `auth.uid()` STABLE из `app.user_id`, pgcrypto
  `WITH SCHEMA extensions`; членство — идемпотентным grant'ом.
- **Находка + фикс:** schema-only слепок терял данные, сеявшиеся миграциями →
  `0002_baseline_data.sql` (departments ×10, payroll_rates 7/10/25,
  org_requisites; INSERT … ON CONFLICT DO NOTHING). В план с7 вписано:
  TRUNCATE этих таблиц перед COPY прод-данных (id не совпадут).
- **Раннер** `scripts/db-migrate.ts` (`npm run db:migrate`): журнал
  `public._migrations`, транзакция на файл, advisory lock, `reset all` между
  файлами; идемпотентность проверена.
- **ACL-аудит** `scripts/acl-audit.ts` (`npm run db:acl-audit`): DML-гранты по
  всем таблицам, колоночная приватность users (open/private списки), закрытость
  `private`/`auth` для app_user, RLS на всех таблицах, канарейка `_migrations`
  против blanket-GRANT.
- **Prisma 7 (driver adapters):** `prisma.config.ts` + `schema.prisma`
  (22 модели; multiSchema `auth`+`public` — вынужденно из-за FK
  `users.id → auth.users.id`; `@ignore` на `users.salary_*` — ревью A3; правило
  «повторный db pull НЕ гонять» зашито комментарием); клиент генерится в
  `src/generated/prisma` (gitignore + `postinstall: prisma generate`).
- **Data-слой `src/lib/db/`:** `index.ts` — `userDb(userId, fn)`
  (interactive-tx: `set_config('app.user_id',…,true)` → запросы; maxWait 10с /
  timeout 15с под холодный Neon; fail-closed без обёртки), `admin.ts` —
  `adminDb()` (owner-пул, лениво), `rpc.ts` — 26 типизированных обёрток всех
  SQL-функций (нормализация numeric/bigint→number, date→'YYYY-MM-DD' из
  ЛОКАЛЬНЫХ компонент Date), `errors.ts` — маппер Prisma/pg-ошибок в формат
  существующего `lib/errors.ts` (P2010→meta.code; текст raise P0001 идёт
  пользователю как есть).
- **ESLint-гард (Q1):** `no-restricted-imports` на `@/lib/db/admin`; allowlist —
  5 machine-роутов (cron/calendar/telegram/oo-content/oo-callback) +
  `lib/users/actions|credentials-actions` + `scripts/**` + `tests/**`;
  проверено — запрещённый импорт валит lint.
- **Порт `scripts/seed.ts`** на Prisma+bcryptjs (auth-учётки → прямые INSERT в
  нашу `auth.users` с bcrypt-хешем; гард `YUR_DB_ENV=prod`) и **мини-смок**
  `scripts/smoke-rls-v4.ts` (`npm run smoke:rls:v4`, 7 секций; полный порт
  22-секционного smoke-rls — сессия 6 по плану).
- **Neon:** организация «Vercel: Hasky's projects» УПРАВЛЯЕТСЯ VERCEL (Launch)
  — проект создан владельцем через Vercel → Storage → Create Database; проект
  **«UR» `winter-credit-95791968`** (Frankfurt, PG17; первая попытка ушла в
  us-east-1 с дефолтным регионом — пересоздана). Ветка `main`→`production`
  (ПУСТАЯ до с7), создана `development` (`br-withered-hall-aszlshw4`,
  endpoint `ep-proud-fire-asqdmxbl`). Прогнано на dev-ветке: миграции ×3,
  пароль `app_user` (ALTER ROLE), ACL-аудит ✓, сид ✓, смок 7/7 ✓,
  diff слепок↔Neon = 0 строк.
- **Чистота:** tsc, eslint, unit 127/127, `next build` — зелёные.
  `.env.example` дополнен v4-блоком; `.env.local` — Neon dev-строки
  (`DATABASE_URL_APP/ADMIN/ADMIN_DIRECT`, `YUR_DB_ENV`, `NEON_API_KEY`).

### Дальше
- **Сессия 2 «Auth»** (новый чат, «Продолжаем цикл v4»): `lib/auth/session.ts`
  (скользящий JWT + pwd_version — V2), `proxy.ts` без БД (урок POST-body),
  rate-limit логина (V3-4), `/settings/users` на admin-пул, миграция
  `pwd_version` в `public.users`, golden-тест bcrypt на реальном прод-хеше,
  T6 — fixtures + 8 integration-файлов на новую базу (бюджет ~полдня).
- Хвост владельцу: удалить в Vercel → Storage СТАРУЮ базу `yur-crm`
  (Washington, us-east-1) — осталась от первой попытки.

### Грабли / критичное для следующих сессий
- **Neon-org managed by Vercel:** создать/переименовать/удалить ПРОЕКТ через
  Neon API нельзя («action restricted») — только Vercel Storage. Ветки/роли/
  endpoints нативным API управляются нормально.
- **Роли из Neon API/Console входят в neon_superuser (BYPASSRLS!)** —
  `app_user` создавать ТОЛЬКО SQL'ем (шим так и делает); пароль — `ALTER ROLE`;
  pooler с SQL-ролями работает (проверено смоком через pooled-строку).
- **Prisma-адаптер не десериализует тип `void`** → все void-RPC в rpc.ts идут
  через `$executeRaw` (иначе UnsupportedNativeDataType).
- **pg отдаёт `date` как JS Date с ЛОКАЛЬНОЙ полуночью** — `toISOString()`
  сдвинул бы день; `dateStr()` в rpc.ts собирает YYYY-MM-DD из локальных
  компонент.
- `prisma db pull` повторно НЕ запускать (сотрёт ручные `@ignore`); новые
  объекты БД = SQL-миграция в `db/migrations/` + правка schema.prisma руками.
- Старые `supabase/migrations` НЕ архивировать до с6 — нужны для
  `db push`-выравнивания прода перед с7 (план обновлён).
- git: master впереди origin на 13 коммитов (редизайн v5 + план) + коммиты
  этой сессии; **push запрещён до с7**.

## Сессия 2026-07-14 — Планирование цикла v4 «Переезд на Postgres (Neon)» ✅

_Владелец решил ПОЛНОСТЬЮ уйти с Supabase («не нравится база, хочу чистый
Postgres, без потерь»). Боли: тормоза прода, морока локалки (Docker/CLI),
сам сервис. Новая вводная: в перспективе CRM переедет на корпоративный
сервер — все выборы цикла без vendor lock-in. Эта сессия — планирование;
код НЕ трогался._

**Модель:** Claude Fable 5

### Сделано
- **Инвентаризация зависимостей** (агент): 156 `.from()` по 19 таблицам,
  ~26 RPC-функций, 1 storage-бакет (4 операции / ~6 мест), realtime НЕ
  используется, браузерных supabase-запросов НЕТ (всё серверное).
- **`docs/PLAN-V4-POSTGRES.md`** — полный план 7+1 сессий: Neon (Frankfurt)
  + Prisma + СОХРАНЕНИЕ RLS через шим (`auth.uid()` = set_config, роли
  authenticated/app_user) + свой вход + R2 (S3-мост к будущему MinIO) +
  почта отдельной сессией 8 после переезда.
- **Инженерное ревью пройдено** (/plan-eng-review, выбор владельца):
  8 находок секций (D1, A1–A3, Q1–Q2, T1, P1) + внешний голос
  (Claude-субагент): 4×P1 + 5×P2 + 10×P3 → решения V1–V3. ВСЕ решены
  владельцем и вписаны в план; UNRESOLVED: 0; вердикт ENG CLEARED.
- **Ключевые решения**: baseline-СЛЕПОК схемы вместо реплея 70 миграций (A2);
  **скользящий JWT + pwd_version вместо ротации refresh-токенов** (V2
  ЗАМЕНИЛ A1 — таблицы сессий НЕТ); @ignore на `users.salary_*` (A3);
  ESLint-запрет adminDb вне allowlist (Q1); rpc-реестр + маппер ошибок (Q2);
  integration-тесты живут с СЕССИИ 2 (T1); генеральная репетиция переноса
  данных в сессии 6 (V3); git — работаем в master, автодеплой Vercel ВЫКЛ
  на весь цикл (V1, выбор владельца); Neon free + замер недели (P1).
- **`TODOS.md`** создан (будущий цикл «корп-сервер»); регламент сессий —
  §5 плана («Продолжаем цикл v4» в новом чате).

### Дальше
- **Сессия 1** (новый диалог, «Продолжаем цикл v4»): шаг 0 — ВЫКЛЮЧИТЬ
  автодеплой Vercel; Neon-проект (Frankfurt, ветки prod/dev); шим +
  baseline-слепок + раннер + ACL-аудит; Prisma introspect; userDb/adminDb;
  lint-гард; rpc-реестр; порт seed; RLS-smoke.
- Открытые вопросы: окно даунтайма прода (к с7), домен для писем (к с8).

### Грабли / критичное для следующих сессий
- ⚠️ **master ЛОКАЛЬНО впереди origin на 12 коммитов** (редизайн v5,
  84cec9a…05577ca) — **НЕ ПУШИТЬ до выключения автодеплоя**: пуш = выкат
  редизайна на прод БЕЗ дампа и БЕЗ db push (миграции language v1 +
  case_description 20260714100000 на прод НЕ катались).
- Baseline-слепок снимать с ЛОКАЛЬНОЙ базы после `db reset` (прод отстаёт
  от репо по миграциям); перед сессией 7 прод выровнять текущим флоу.
- Neon-факты (внешний голос, проверено): `session_replication_role`
  НЕДОСТУПЕН (триггеры глушить `ALTER TABLE … DISABLE TRIGGER USER`);
  PITR на free = 6 часов (дампы обязательны). pgcrypto — `WITH SCHEMA
  extensions`; `auth.uid()` шима — STABLE.
- gstack: доступен upgrade 1.44.0.0 → 1.60.1.0 (запускать по желанию
  владельца, не срочно).

## Сессия 2026-07-13 — Редизайн v5 по каркасу владельца ✅

_Пользователь: «по скриншотам ты не понимаешь, как я хочу» — принёс кликабельный
Next.js-прототип всей CRM (`Desktop/Новая папка (2)`, вариант B «Stripe/Notion-modern»,
9 экранов-превью) и попросил «натянуть этот стиль и подачу на нашу CRM, функционал
не трогая». Стиль перенесён 1:1; функционал не менялся._

**Модель:** Claude Fable 5

### Сделано
- **Чекпоинт:** незакоммиченный пласт 2026-07-08 (полировка v4 + мягкий редизайн)
  закоммичен как есть (`84cec9a`) — точка отката перед новой волной. Решение
  пользователя: функционал пласта оставить, вид переписать.
- **Фундамент:** шрифты IBM Plex Sans/JetBrains Mono → **Geist / Geist Mono**
  (latin+cyrillic — проверено, поддержка есть); токены globals.css — тёплый молочный
  paper `#F7F8F4`, ink `#14211B`, тёплые борды, semantic info→sky/warning→amber,
  этапы awaiting→amber + closed→sky, категория representation→amber, `--primary-softer`,
  `--shadow-brand(-hover)` (цветная синяя тень), `--grad-hero`, radii control 12 +
  кнопки-пилюли, мягкие ink-тени, motion 120/200/360 + ease-spring. framer-motion
  установлен (фактически хватило CSS-каскада).
- **Примитивы:** Button (пилюли, CTA с синей тенью и lift), Input/Textarea/Select
  (focus ring-2 primary/20), StageBadge (точка ярким тоном), CategoryBadge
  (rounded-md без точки), Badge (+тон primary, точка всегда яркая), Avatar
  (градиент цвета), EmptyState (иконка в синем тинт-квадрате), Pill-фильтры
  (актив — тёмно-синяя заливка + shadow-brand), сегмент-контролы (синий тинт).
- **Списки:** CardListShell/ClickableCard — строки-карточки → ОДНА
  карточка-контейнер (шапка на sunken, строки с бордерами /60, hover синеет).
  Синий hover повсюду (`hover:bg-surface-muted*` → `hover:bg-primary-softer`, 25 файлов).
- **Топбар:** h-16, `bg-bg/70 backdrop-blur-xl`, заголовок 18px, CTA с
  shadow-brand + lift, иконки-кнопки без бордеров (синеют).
- **Дашборд:** НОВЫЙ hero-баннер (`dashboard/hero-banner.tsx`: grad-hero,
  орбы+сетка, приветствие по времени суток Киева, дата-чип, сводка «N задач и
  M просрочек» + похвала за рост выручки, 2 мини-стата на стекле; i18n-ключи
  `dashboard.hero.*` ru/uk); KPI — mono 26px + иконка 8×8 + hover-lift;
  «Мой день» — чекбоксы Circle/CheckCircle2; заголовки секций 17→15px.
- **Дела:** список — mono-подстроки, категория залитым бейджем; доска — колонки
  каркаса (точка+счётчик над тонированным контейнером, карточки с hover-lift,
  mono-суммы); карточка дела — вкладки с активом primary-pressed.
- **Задачи:** секции-карточки с шапками на sunken + счётчик-пилюля, TaskRow —
  чекбокс-круг + mono-время с error-подсветкой. **Календарь:** сетка плитками
  `rounded-xl` с зазорами (сегодня — primary-тинт, выходные красным), события —
  цветные чипы по типу, «+N ещё»; сегмент Месяц/Неделя. Единые тоны типов задач:
  task=primary, hearing=error (суд), deadline=warning — по всей системе.
- **Клиенты:** Pill-фильтры типов; вкладки кассы — актив primary-pressed.
- **Проверки:** tsc чистый, eslint чистый, живой прогон в браузере
  (дашборд/дела/доска/карточка/задачи/календарь/клиенты/ЗП/касса/логин),
  консоль без ошибок. **DESIGN.md переписан → v2.0** (новая система + запись
  в Decisions Log).

### Решения и почему
- **Сайдбар остаётся ТЁМНЫМ** — явный выбор пользователя (в каркасе светлый).
- Прошлый пласт 2026-07-08 сохранён как база (функционал: saved views, колонки,
  календарь неделя, чекбоксы дашборда) — вид переписан поверх.
- `--text-subtle`: каркасный `#8A929B` затемнён до `#717A82` (AA ≥4.5 на белом).
- Закрытый этап теперь sky (не зелёный) — зелёный зарезервирован за деньгами.

### Волна 2 — паритет остальных экранов (та же сессия, после вопроса пользователя)
Пользователь: «ты из глобального сделал только дашборд?» → мультиагентный аудит
(7 агентов) остальных экранов против их эталонов в прототипе → **70 расхождений**,
затем 7 агентов-исполнителей применили **69 фиксов** (1 пропущен как дубль).
Ключевое: **касса** — hero-полоса «Общий баланс» (grad-hero + стеклянные
мини-статы приход/расход) + счета карточками-плитками с цветной акцент-полосой
по типу (bank=синий, cash=зелёный, card=янтарный) и mono-балансами + журнал
с чипами направления + Pill-вкладки счетов; **ЗП** — KPI-плитки (К выплате /
Заработано / Премии), ставки с цветными полосами категорий, sunken-шапки таблиц,
mono-суммы, итоги строкой в таблице; **настройки** — мини-статы пользователей,
секции-карточки с шапками, тинт-иконки подразделений, mono-реквизиты + подвал
с Shield, карточка «Как рассчитывается зарплата»; **справка** — hero как на
дашборде, разноцветные тинт-иконки разделов, ChevronDown-аккордеон FAQ;
**карточка клиента** — мини-статы (дел/на сумму/долг), пилюля типа в шапке,
mono-идентификаторы, круглый аватар; **формы/модалки** — combobox каркасный,
inline-client-create на канон модалок, секции форм 15px semibold, плитки
billing_types белые с синим hover, суммы платежей mono + success-text,
баннеры rounded-control; **мобильные** — mono-язык данных, залитые чипы,
тинт-иконки шторки «Ещё», синие active-состояния, rounded-t-modal у шторки.
ClickableRow (общий) — синий hover вместо серого. i18n-ключи добавлены ru+uk
(payroll, users, requisites, help, cash, clients). tsc/lint чистые, экраны
проверены в браузере (касса, ЗП, настройки, справка), консоль пуста.
DESIGN.md: grad-hero расширен до «hero-блоки экранов (дашборд, касса, справка)».

### Незакрытые вопросы / TODO
- Мобильную нижнюю навигацию и шторку «Ещё» глазами не проверяли (классы
  обновлены агентом, но стоит взглянуть на устройстве).
- framer-motion установлен, но не используется (CSS-анимаций хватило) — можно
  снести из package.json, если не пригодится.

### Handoff для следующей сессии
- Показать редизайн владельцу; фидбек — точечными правками поверх.
- Прод НЕ трогали: миграций нет, чисто UI. Деплой = push в master (Vercel).
- Каркас-референс: `C:\Users\HP\Desktop\Новая папка (2)` (globals.css +
  src/components/preview/* — эталоны всех экранов).

### Коммиты (ЛОКАЛЬНО — пользователь явно запретил пушить на прод без команды)
- `84cec9a` feat(ui): polish v4 + soft dashboard redesign (checkpoint)
- `d8cc2b1` feat(ui): redesign v5 from owner's mockup (Stripe/Notion-modern)
- `58145e0` feat(ui): mockup parity wave 2 — remaining screens (69 audited fixes)

---

## Сессия 2026-07-14 — Карточка дела по каркасу ✅

_Пользователь: «карточка дела в каркасе намного читабельней и понятней — сделай
подобное». Перенесён вид `preview/case-detail.tsx`; функционал не менялся._

**Модель:** Claude Fable 5

### Сделано
- **Шапка** (`cases/[id]/page.tsx` переписан): ряд бейджей (этап-дропдаун-пилюля,
  категория·%, приоритет, без акта/lost/архив) → заголовок 22px → строка клиента
  (иконка по типу, ссылка) → 4 инфо-плитки (Открыто · Дней на этапе с warning при
  застое / Завершено · Юрист · Эксперт с аватарами) → акцент-полоса «Оплата по делу»
  (bg-primary-softer/40, mono «оплачено / сумма · %», чипы долга/переплаты,
  прогресс). Справа — быстрые действия: «+ Платёж» primary-пилюлей с shadow-brand,
  «+ Задача», «+ Акт». Градиентный бейдж «ДЕЛО», тройка MoneyStat и мета-строка
  удалены (их данные — в плитках, полосе и «Деталях дела»).
- **Вкладки:** новая **Обзор** (default) = «Що далі» + карточка «Описание»
  (предмет + теги чипами) + «Детали дела» (CaseInfoGrid) + комментарии; sticky-
  сайдбар — «Вознаграждение команды» + последняя активность (limit=5). Новая
  вкладка **Платежи** = история (payments-list: тинт-иконки способа по эвристике
  текста метода, mono-суммы) + карточка «Итого» (сумма/оплачено/долг|переплата,
  прогресс, «N% оплачено») + график платежей (id=plan). Итог: Обзор · Задачи ·
  Платежи · Акты · Документы · История.
- **История** (case-activity-block) — таймлайн каркаса: кружок-иконка по
  `entry.action` (payment→Banknote, stage→ArrowLeftRight, comment→MessageSquare,
  document→FileText, act→FileSpreadsheet) + вертикальная линия между записями.
- CaseInfoGrid: без платежей (CasePaymentsMini удалён — история платежей теперь
  только на вкладке «Платежи»); CTA «Добавить график» ведёт на `#payments`.
- i18n ru+uk: `caseCard.detail.tile*`, `paymentStrip*`, `detailsTitle`,
  `descriptionTitle`, `totals*`, `actionBar.sectionPayments`.

### Решения и почему
- Sticky-панель «К списку / Редактировать / Удалить» оставлена (в каркасе действия
  в шапке): не конфликтует со стилем и держит деструктив вдали от бейджей.
- `#plan` больше не ключ вкладки — якорь-секция живёт внутри «Платежей».

### Проверки
- tsc и eslint чистые; браузером (:3001): шапка/плитки/полоса, «+ Задача»
  (переключение вкладки + раскрытие формы), «Платежи», таймлайн «Истории»,
  мобильная ширина 390px — ок, консоль пуста.

### Коммиты (ЛОКАЛЬНО — пользователь явно запретил пушить на прод без команды)
- `62d659c` feat(ui): case card redesign to mockup parity — header tiles + overview/payments tabs

### Волна правок владельца (та же сессия, 6 пунктов со скриншотов)
1. Фон системы притемнён: `--bg` `#F7F8F4` → `#F1F2EB` (+ themeColor в layout).
2. Топбар компактнее: h-16 → h-12, контролы h-9 → h-8, аватар sm.
3. Панель «До списку/Редагувати/Видалити» плотнее (py-1.5), отступы страницы
   минимальные (`main` gap-5→gap-3, py-2→py-1.5).
4. Вкладки карточки дела — сегмент-контрол на белом скруглённом блоке
   (rounded-full + border + shadow-sm, актив — синий тинт) вместо подчёркивания.
5. «Обзор» перестроен: слева — НОВЫЙ редактируемый блок «Опис справи»
   (`case-description-block.tsx`, inline-textarea) + теги; справа — «Деталі
   справи» (CaseInfoGrid `stacked` одной колонкой, + строка «Предмет договору»)
   НАД «Винагородой команди»; история из сайдбара убрана (осталась вкладкой).
   **БД:** миграция `20260714100000_case_description.sql` — `cases.description`
   (text, ≤5000, CHECK `cases_description_len`); правка идёт через RLS UPDATE
   cases и журналируется как `case_updated` с diff по `description` (значения
   усечены до 120 симв.; allowlist журнала НЕ трогали). Экшен
   `updateCaseDescriptionAction` (lib/cases/actions.ts).
6. Шапка дела компактнее только отступами (py-3/3.5, gap-3, плитки pt-3,
   полоса оплаты py-2.5) — шрифты не менялись.

Проверки: tsc/eslint чистые; браузером — карточка (описание: правка → текст →
запись в «Історії» «змінив(ла) опис: — → …»), вкладки-пилюли, дашборд с новым
фоном; консоль пуста. Миграция применена ЛОКАЛЬНО (`supabase migration up`;
заодно локально доехала pending-миграция 20260630 user_credentials).
⚠ **Деплой теперь требует БД-миграции**: перед push на прод — дамп данных в
/backups/ + `supabase db push` (см. регламент в CLAUDE.md §8).

### Волна правок владельца №2 (та же сессия, 6 пунктов + ответы на вопросы)
Решения владельца (AskUserQuestion): задача — **инлайн-ряд** (модалку отверг:
«отвлёкся, закрыл модалку — черновик стёрся»); акт — **модалка**; форма дела —
«широкая, но структурная».
1. Шапка дела ещё компактнее (py-2.5/3, gap-2, плитки pt-2.5 gap-0.5, полоса py-2).
2. Текст «Опис справи» — тёмный `text-text` и крупнее 14.5px (был серый 13.5).
3. Топбар h-12 → **h-10**.
4. Форма задачи на карточке — один ряд `TaskForm inline`: Назва (flex) · Тип ·
   Виконавець · Строк · Створити, подписи в placeholder/aria (details-каркас и
   id `task-create-details` сохранены — «+ Задача» работает как раньше).
5. «Виписати акт» — модалка (`act-create-button.tsx`, слушает
   `casecard:open-act-form`; «+ Акт» шапки шлёт событие вместо скролла к details;
   кнопка — в шапке блока «Акти» справа). ActCreateForm получил onSuccess.
6. Форма дела (`case-form.tsx`, new+edit): секции — карточки с номером шага
   (тинт-кружок 1–4), заголовком и подсказкой «что заполнять» (i18n
   `section*Hint` ru/uk); подписи полей 13px semibold `text-text` (были серые
   12px); сетка `sm:grid-cols-2` (без lg-3), `max-w-4xl`; внешние Card-обёртки
   страниц new/edit сняты. DESIGN.md: `--bg #F1F2EB`, топбар h-10, запись в
   Decisions Log.
Проверки: tsc/eslint чистые; браузером — карточка (шапка ещё ниже), инлайн-ряд
задач, модалка акта, /cases/new с секциями-шагами; консоль пуста.

### Дополнение: сайдбар-помощник формы дела (вопрос владельца про пустое место)
Владелец: «что делать с пустым местом на создании нового дела?» → выбрал
«сайдбар-помощник». Новый `case-form-aside.tsx` (server, xl+, sticky):
живые ставки категорий из `payroll_rates` (getPayrollRates — RLS отдаёт всем
активным) «юрист % / эксперт %», карточка «Кто есть кто» (юрист-договор vs
эксперт-исполнитель), «Что будет после создания» (3 шага). Подключён на
/cases/new И /cases/[id]/edit: grid `xl:grid-cols-[minmax(0,56rem)_minmax(260px,320px)]`.
i18n `caseCard.formAside.*` ru/uk. tsc/eslint чистые, проверено браузером.
Доводка по фидбеку: кнопка «+ Новий» (клиент из формы) — синяя primary-пилюля;
сетка формы растянута на свободную ширину (`minmax(0,1fr)` + aside 300–360px,
кап 56rem снят) — пустоты справа больше нет.

### Фон → холодный светло-серый (выбор владельца по скрину прежнего прода)
Владелец: «может, фон сделаем вот таким?» (скрин старого прода) → согласен,
холодный чётче. Вся нейтральная гамма переведена в холодную согласованно:
`--bg #F4F5F7`, затем по просьбам владельца затемнён ещё дважды → итог:
`--bg #E3E6EA`, `--surface-muted #F1F3F5`, `--surface-sunken #E4E7EC`,
`--border #D9DEE5`, `--border-strong #C3CBD4` (+ themeColor). Тёплая молочная
гамма каркаса отменена; DESIGN.md обновлён (таблица + Decisions Log).
Гоча подтвердилась: Turbopack отдавал СТАРЫЙ CSS при правке токенов — шаг
#ECEEF1 у владельца визуально не применился; лечение — стоп dev, `rm -rf
.next`, старт (см. память проекта).

### Handoff для следующей сессии
- **Состояние:** master впереди origin на 11 коммитов (`62d659c` карточка дела →
  `8348198` фон), ВСЁ ЛОКАЛЬНО — владелец явно запретил пушить без команды.
- **Деплой по команде «пушим»:** (1) дамп прод-данных в `/backups/` (free tier
  без автобэкапов!), (2) `supabase db push` — в пакете миграция
  `20260714100000_case_description.sql` (`cases.description`), (3) `git push`
  → Vercel автодеплой.
- **Dev:** сервер :3001 поднимался preview-инструментом из сессии — после её
  закрытия запускать вручную `npm run dev`. При правке CSS-токенов Turbopack
  может отдать старый CSS: стоп dev → `rm -rf .next` → старт.
- **Рабочая схема с владельцем:** он кидает скриншоты с правками («только
  запоминай»), по «ПРИСТУПАЙ» — применять всё разом; по неоднозначным блокам —
  AskUserQuestion с 2–3 вариантами (работает отлично).
- **TODO:** мобильная нижняя навигация/шторка глазами не проверены;
  framer-motion не используется — кандидат на удаление из package.json.

---

## Сессия 2026-07-08 — Изучение системы + порядок в структуре и доках ✅

_Старт этапа «Активный» по факту. Пользователь: «изучи всё», затем «навести идеальный
порядок в доках и структуре». Кода не касались — только изучение и документы/раскладка._

**Модель:** Claude Opus 4.8

### Сделано
- **Глубокое изучение всей кодовой базы** 4 параллельными агентами: БД/RLS, backend-логика,
  frontend/дизайн, инфраструктура/тесты. Итог: система зрелая, **дыр доступа/RLS нет**, код
  консистентен (нет TODO/FIXME, нет мёртвых компонентов). Полная карта системы — в ответе сессии.
- **Порядок в структуре и документации:**
  - История `PROGRESS.md` (5216 строк) → `docs/archive/PROGRESS-history.md`; рабочий файл сжат
    до ~169 строк (шапка + свежее «Текущее состояние» + сессия 22 + регламент).
  - `PLAN-V2.md`, `PLAN-V3.md`, `kickoff-prompt.md` → `docs/archive/`.
  - `Концепция_CRM.doc`: корень → `docs/` (взята под git, была бесхозной).
  - `README.md` переписан (был дефолт create-next-app) — описание, стек, команды, роли, ссылки.
  - `CLAUDE.md`: поправлен doc-drift (`create_bonus` — RPC нет; `accrual_mode` — поле-призрак;
    `create_payout` — приложение вызывает прямой insert), ссылки на `docs/archive/`.
  - Удалены `.design-audit/` (~40 скриншотов), `.claude/i18n-fanout.workflow.js`, кэш `.next`
    (713 МБ), `tsconfig.tsbuildinfo`.

### Решения и почему
- `.env.cloud` (боевые креды Supabase) **оставлен на месте** (решение пользователя) — нужен для
  прод-миграций/деплоя, gitignored, не утёк.
- `PROGRESS.md` разрезан безопасно: сначала полная копия в архив (ничего не теряется), затем
  пересбор рабочего из нужных кусков.

### Находки изучения (на будущую уборку КОДА — НЕ трогали)
- Поле-призрак `accrual_mode` (форма дела пишет, но триггер снят при заморозке леджера v3 s12).
- Мёртвые/незваные RPC: `payroll_by_specialist`, `create_bonus` (не существует), `revert_payout`.
- Приложение обходит RPC `create_payout` прямым insert — теряется проверка принадлежности дела
  сотруднику (на активном пути частично прикрыта серверным пересчётом `outstanding`).
- `scripts/smoke-rls.ts` сломан после заморозки леджера (не в CI → тихо).
- Контраст зелёных сумм ЗП ниже AA (~3.9:1); касса — эталон правильного `text-success-text`.
- Модалка выплат `payroll-actions.tsx` без фокус-трапа (единственный реальный a11y-дефект).
- Дубли денежного форматтера (6 payroll-файлов); e2e core-flow в `skip` и не в CI; `next.config.ts`
  пустой (нет security-заголовков CSP/HSTS).

### Handoff для следующей сессии
- **Стартовать с:** выбрать направление — новая функция (портал клиента / инвойсы / шаблоны
  документов / аналитика) ЛИБО уборка кода из находок выше.
- Всё на проде, `master = origin` (`cdb4975`). Прод: Supabase `fmzevqyquljecmsiqsoj` + Vercel
  `yur-crm.vercel.app`, free tier без автобэкапов (дамп перед прод-миграциями обязателен).
- Файлы под находки: `src/lib/cases/actions.ts` + `src/components/cases/case-form.tsx`
  (accrual_mode), `src/lib/payroll/actions.ts` (create_payout/bonus),
  `src/components/payroll/payroll-actions.tsx` (модалка + контраст), `scripts/smoke-rls.ts`.

### Коммиты
- `cdb4975` chore: tidy repo structure and docs (запушен на прод)
- (+ коммит этой записи сессии)

---

## Сессия 2026-06-30 (22) — Управление доступами сотрудников + ПЕРВЫЙ ДЕПЛОЙ НА ПРОД ✅

_Фича по запросу пользователя: владелец не имел способа выдать сотруднику логин/пароль.
Построена owner-only панель управления доступами, кастомизировано письмо-приглашение,
и **впервые всё выкачено на боевой Supabase + Vercel**. В конце — очистка прод-данных
от тестовых по запросу пользователя._

### Что сделано
- **Модалка «Доступ сотрудника»** (`/settings/users`, клик по строке, только owner):
  показать логин, **выдать/задать пароль** (виден владельцу), изменить логин (email),
  отправить приглашение на email, **умное удаление** (чистые учётки — насовсем, с
  историей — блок с подсказкой → деактивация), **копи-блок «логин+пароль+ссылка»**.
  Файлы: `src/components/users/user-credentials-modal.tsx`,
  `src/lib/users/credentials-actions.ts`, `src/lib/users/temp-password.ts`,
  `src/app/auth/confirm/route.ts`.
- **Миграция `20260630120000_user_credentials_management.sql`:** `private.user_login_secrets`
  (зашифрованное зеркало пароля, pgcrypto), `private.app_crypto_key` (ключ), owner-gated
  DEFINER `get/set_user_login_secret` + `user_delete_blockers`; +4 действия журнала
  (`user_password_reset`/`user_email_changed`/`user_invited`/`user_deleted`). Приватность —
  зеркало модели зарплат (схема `private`, читает только owner).
- **Письмо-приглашение:** шаблон Supabase recovery кастомизирован (укр., бренд «ЮрКейс»,
  логин + кнопка «Увійти»). Применён через Management API (config/auth).
- **Временные пароли — 6 читаемых символов** (было: UUID). Общий генератор
  `lib/users/temp-password.ts`; owner-set минимум снижен 8→6 (потолок Supabase).
- Security-ревью пройдено (исправлен гейт `user_delete_blockers` на owner-only). tsc/lint/build — чисто.

### ⚠️ ПРОД (важно для будущих сессий)
- **Прод ЖИВОЙ:** Supabase ref `fmzevqyquljecmsiqsoj` (eu-west-1, **FREE — без автобэкапов**),
  Vercel `https://yur-crm.vercel.app`. Owner проекта/входа: tomhardy23231@gmail.com (Supabase) /
  app-владелец `owner@yur.local`. Заметка CLAUDE.md «на прод НЕ выкачен» была устаревшей — ИСПРАВЛЕНА.
- **Деплой-флоу:** код — push в `master` → Vercel автодеплой. Прод-миграции — `supabase db push`
  (нужен DB-пароль) ИЛИ Management API `POST /v1/projects/<ref>/database/query` с PAT (`sbp_…`,
  без DB-пароля) + запись версии в `supabase_migrations.schema_migrations`. Хелперы — были в
  scratchpad (`mgmt-query.mjs`/`backup.mjs`).
- **Бэкапы:** free tier → перед КАЖДОЙ прод-правкой снимаем дамп данных (`backup.mjs` дампит
  public-схему в JSON). Лежат в `/backups/` (gitignored, НЕ коммитим — содержат данные клиентов).
- **Прод-данные ОЧИЩЕНЫ** (по запросу, тестовые): остался только `owner@yur.local`; дела/клиенты/
  платежи/задачи/подразделения/журнал — 0; `payroll_rates` (3) и строка `org_requisites` сохранены
  (служебное). Дамп до очистки — `/backups/yur-crm-prod-backup-2026-06-30-before-wipe.json`.
- **Security TODO пользователя:** PAT (`sbp_…`) и секретный ключ (`sb_secret_…`) светились в чате —
  пользователю рекомендовано ПЕРЕВЫПУСТИТЬ.

### Коммиты
- `a7bc3c6` feat(users): owner credentials management (миграция + модалка + экшены + /auth/confirm)
- `5b030e7` feat(users): copyable credentials card
- `2aba65a` feat(users): short 6-char temp passwords
- (+ этот коммит доков)

---

## Текущее состояние
_Снимок на 2026-07-15 (цикл v4 «Переезд на Postgres/Neon», в работе). Обновляется целиком._

**Прод (не меняется весь цикл v4).** Вся разработка v1+v2+v3+доступы — **на проде**
(Supabase `fmzevqyquljecmsiqsoj` + Vercel `yur-crm.vercel.app`, free tier без автобэкапов).
Функционал прода: дела (список/доска/карточка/архив, 5 этапов, исход «не заключили»); клиенты
(+конфликт-чек); финансы/ЗП (% от оплат; percent/fixed/fixed_percent; выплаты/премии); касса;
акты Рахунок-Акт (XLSX); задачи+календарь+отпуска; подразделения (департаментная RLS);
уведомления (Telegram+ICS); документы (Storage+OnlyOffice); 5 ролей + 12 прав; owner-панель доступов.

**Цикл v4 — переезд Supabase → Neon/Prisma + свой auth** (план `docs/PLAN-V4-POSTGRES.md`,
ENG CLEARED). Идёт по сессиям (1 диалог = 1 сессия), **весь код копится ЛОКАЛЬНО, `git push`
ЗАПРЕЩЁН до сессии 7** (автодеплой Vercel включён — пуш выкатил бы всё сразу). Neon-проект
«UR» `winter-credit-95791968` (Frankfurt), работаем на dev-ветке; прод-база не трогается до с7.
- **Сессия 1 ✅** — фундамент: шим RLS (роли authenticated/app_user, `auth.uid()` из
  set_config), baseline-слепок схемы, раннер миграций, ACL-аудит, Prisma introspect,
  `lib/db` (userDb/adminDb/rpc/errors), ESLint-гард adminDb, порт seed.
- **Сессия 2 ✅** — свой auth: скользящий JWT (jose) + pwd_version + rate-limit логина,
  proxy без БД, `/settings/users` на admin-пул + своя `auth.users`; вся integration-обвязка
  на Prisma/Neon (fixtures + 9 файлов).
- **Сессия 3 ✅** — данные ч.1: queries+actions 6 доменов (comments/departments/users/
  clients/tasks/cases) на userDb/adminDb/rpc; гоча `cases.updated_at` (optimistic locking
  через `::text` + FOR UPDATE); `lib/db/convert.ts`. Смок /cases, /clients на Neon зелёный.
- **Дальше — Сессия 4** «Данные, часть 2» (payments/acts/payroll/cash/dashboard/
  notifications/search/activity_log/i18n/org/absences + machine-роуты). До конца с4
  часть экранов (дашборд/финансы/касса) ещё на supabase-js — норма.
- Осталось по плану: с5 файлы (R2), с6 чистка+репетиция переезда, с7 прод-переезд, с8 почта.

**Тесты.** unit 141 + integration 114 (на Neon dev) — зелёные; e2e auth — полный прогон
отложен на гейт с4 (экраны-контент конвертируются).

**Мелочи на будущую уборку кода** (из изучения 2026-07-08, НЕ трогаем в v4): поле-призрак
`accrual_mode`; мёртвые RPC `payroll_by_specialist`/`create_bonus`/`revert_payout`; сломанный
`scripts/smoke-rls.ts`; контраст зелёных сумм ЗП ниже AA; модалка выплат без фокус-трапа;
дубли денежного форматтера.

---

## Регламент сессий

### Завершение сессии
Когда пользователь пишет «завершаем сессию» (или эквивалент: «заканчиваем», «на сегодня
всё», «session end»), агент обязан **перед прощанием**:

1. Дописать **новый блок сессии** в этот файл — сразу под «Текущее состояние» (новые сверху),
   по шаблону ниже. Старые сессии 1–21 — в `archive/PROGRESS-history.md`, их не трогаем.
2. Обновить раздел [Текущее состояние](#текущее-состояние)
   (заменить целиком — это снимок «на сейчас»).
3. Если есть незакоммиченные изменения — спросить, коммитить ли. **Не коммитить
   автоматически.**
4. Подтвердить пользователю одной строкой:
   `Сессия зафиксирована в docs/PROGRESS.md — в новой сессии начни с этого файла.`

### Начало новой сессии
Первое действие агента в новой сессии:
1. Прочитать `CLAUDE.md` (особенно §7 бизнес-правила и §11 дизайн).
2. Прочитать раздел [Текущее состояние](#текущее-состояние) и последнюю запись сессии в этом файле.
3. При необходимости деталей по прошлым циклам — `archive/PROGRESS-history.md`.
4. Только после этого предлагать конкретное действие.

### Шаблон записи в лог
```
## Сессия YYYY-MM-DD

**Шаг(и):** N — короткое название
**Длительность:** ~X часов
**Модель:** Claude Opus 4.7 (или другая)

### Сделано
- Конкретный пункт 1 (файлы: path/to/file.ts)
- Конкретный пункт 2 (миграции: 20260526_...sql)
- Конкретный пункт 3

### Решения и почему
- Решение → причина. Если расходится с CLAUDE.md — пометить «отклонение, согласовано».

### Незакрытые вопросы / TODO
- [ ] Что осталось внутри текущего шага
- [ ] Что заметили попутно для следующих шагов

### Handoff для следующей сессии
- **Стартовать с:** конкретная задача (один абзац).
- **Файлы открыть в первую очередь:** path/a, path/b
- **Команды для проверки текущего состояния:** `npm run dev`, `npx supabase status`, ...
- **Подводные камни:** что может сломаться или сбить с толку.

### Коммиты
- `<sha>` `<subject>` (если репозиторий уже инициализирован)
```

---
