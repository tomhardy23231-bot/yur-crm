import { test, expect, type Page } from '@playwright/test';

// E2E входа и защиты маршрутов. Использует засеянный аккаунт владельца
// (owner@yur.local / test12345!) — см. scripts/seed.ts. Логинимся через реальную
// форму (server action), как живой пользователь.
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? 'owner@yur.local';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? 'test12345!';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
}

// После успешного входа дожидаемся ухода с /login. Таймаут с запасом: первый
// заход на дашборд в dev компилируется Turbopack'ом (холодный старт).
async function waitForApp(page: Page) {
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 60_000,
  });
}

test.describe('Аутентификация и защита маршрутов', () => {
  test('без сессии любой внутренний маршрут уводит на /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    // Форма входа на месте.
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('неверный пароль показывает ошибку и НЕ пускает внутрь', async ({ page }) => {
    await login(page, OWNER_EMAIL, 'wrong-password-xxx');
    // Остаёмся на /login, виден алерт об ошибке.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('верные данные владельца → попадаем в приложение (app-shell)', async ({ page }) => {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await waitForApp(page);
    // Каркас приложения отрисован: контентная зона + навигация сайдбара.
    await expect(page.locator('[data-tour="page-content"]')).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('после входа открывается раздел «Дела/Справи»', async ({ page }) => {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await waitForApp(page);
    await page.goto('/cases');
    // Не выкинуло на логин (сессия жива) и контент раздела отрисован.
    await expect(page).toHaveURL(/\/cases/);
    await expect(page.locator('[data-tour="page-content"]')).toBeVisible();
  });
});
