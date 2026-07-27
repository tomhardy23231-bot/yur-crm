-- ============================================================================
-- 0013_expense_category_scope.sql — статьи расходов делятся на «по делу» и
-- «по фирме».
--
-- ЗАЧЕМ (владелец, 2026-07-26): «витрати по делу это одно, а витрати в общем по
-- фирме — совсем другое. Как может быть витрата по делу аренда?». До этой
-- миграции справочник был общим: в форме расхода по делу предлагалась «Оренда»,
-- а в расходах фирмы — «Судовий збір». Обе подсказки бессмысленны и провоцируют
-- ошибку ввода.
--
-- ЧТО МЕНЯЕТСЯ. У статьи появляется scope:
--   'case'    — только траты по делу (судовий збір, держмито, експертиза, відрядження);
--   'company' — только расходы фирмы (оренда, податки, зарплата, зв'язок, офіс…);
--   'both'    — предлагается везде (напр. «Інше»).
-- Форма выбирает статьи по своему скоупу; на уже внесённые расходы это не
-- влияет (scope — подсказка ввода, а не ограничение хранения).
-- ============================================================================

alter table public.expense_categories
  add column scope text not null default 'both';

alter table public.expense_categories
  add constraint expense_categories_scope_valid
    check (scope = any (array['case'::text, 'company'::text, 'both'::text]));

comment on column public.expense_categories.scope is
  'Где предлагать статью: case — расход по делу, company — расход фирмы, both — везде. Подсказка ввода: на уже сохранённые расходы не влияет. 2026-07-26 (0013).';

-- Раскладка встроенных статей по смыслу.
update public.expense_categories set scope = 'case'
 where code in ('court_fee', 'state_duty', 'expertise', 'travel');

update public.expense_categories set scope = 'company'
 where code in ('rent', 'advertising', 'taxes', 'bank_fees', 'salary',
                'communication', 'office');

-- 'other' остаётся 'both' — универсальная запасная статья.
