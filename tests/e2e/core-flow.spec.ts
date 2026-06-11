import { test, expect, type Page } from '@playwright/test';

// E2E основного денежного флоу (v3 Сессия 12): вход owner → создать клиента →
// создать дело (сумма 10000) → открыть карточку → внести платёж 4000 → проверить
// «Оплачено 4 000» и долг «6 000».
//
// ⚠ ПОМЕЧЕН describe.skip (план v3 §12.5 это разрешает). Причина: тест требует
// поднятого ЛОКАЛЬНОГО стека (`npx supabase start` + `npm run db:seed`) И живой
// верификации селекторов формы дела — поля client_id/lawyer_id/responsible_id/
// category отрисованы общим <Select> на @radix-ui/react-select (НЕ нативный
// <select>, поэтому page.selectOption не работает: нужно кликнуть триггер и опцию).
// Плюс интерфейс на uk-локали (playwright.config locale='uk-UA') — денежные подписи
// берутся из словаря (t.caseCard.detail.rewardPaid/rewardDebt). Каркас написан по
// образцу auth.spec.ts; включить — снять .skip и сверить отмеченные TODO-селекторы
// в живом браузере. Инфраструктура в s12 намеренно не поднималась (см. PROGRESS).

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? 'owner@yur.local';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? 'test12345!';

// Уникальный суффикс на прогон, чтобы записи не конфликтовали между запусками.
// new Date() в playwright допустим (это не workflow-скрипт).
const RUN = `E2E-${Date.now().toString(36)}`;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 60_000,
  });
}

// Открыть стилизованный <Select> (Radix) по связанному label и выбрать опцию.
// TODO(verify): сверить роль триггера/опции в живом DOM — у @radix-ui/react-select
// триггер обычно role="combobox", опции role="option". Если drop-in <Select>
// рендерит нативный <select> — заменить на page.selectOption.
async function pickSelect(page: Page, fieldId: string, optionIndex = 0) {
  const trigger = page.locator(`#${fieldId}`);
  await trigger.click();
  const options = page.getByRole('option');
  await options.nth(optionIndex).click();
}

test.describe.skip('Основной флоу: клиент → дело → платёж → долг', () => {
  test('платёж 4000 по делу на 10000 → Оплачено 4 000 / Долг 6 000', async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);

    // 1) Клиент (физлицо по умолчанию — без Radix-селектов: только ФИО).
    await page.goto('/clients/new');
    await page.locator('#last_name').fill(`${RUN}`);
    await page.locator('#first_name').fill('Тест');
    await page.locator('button[type="submit"]').click();
    // Успех редиректит на карточку клиента.
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // 2) Дело. number_title — обычный input; client_id/lawyer_id/responsible_id/
    // category — Radix-селекты (см. pickSelect). case_type — тоже селект.
    await page.goto('/cases/new');
    await page.locator('[name="number_title"]').fill(`${RUN}-ДОГ`);
    await pickSelect(page, 'client_id', 0); // TODO(verify): выбрать созданного клиента
    await pickSelect(page, 'lawyer_id', 0); // первый сотрудник (owner засеян)
    await pickSelect(page, 'responsible_id', 0);
    await pickSelect(page, 'case_type', 0);
    await pickSelect(page, 'category', 0);
    await page.locator('[name="contract_sum"]').fill('10000');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // 3) Платёж 4000. Форма платежа на карточке: amount/paid_at по name
    // (id динамический через useId). Дата по умолчанию уже проставлена.
    await page.locator('[name="amount"]').first().fill('4000');
    // Кнопка сабмита формы платежа — TODO(verify): уточнить по тексту/роли,
    // если на странице несколько форм.
    await page
      .getByRole('button', { name: /Зберегти|Сохранить|Додати|Платіж/i })
      .first()
      .click();

    // 4) Проверка сумм. Подписи локализованы (uk): «Оплачено/Сплачено»,
    // «Борг/Долг». Сверяем по числам с разрядкой (Intl): 4 000 и 6 000.
    await expect(page.getByText(/4[\s  ]?000/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/6[\s  ]?000/).first()).toBeVisible();
  });
});
