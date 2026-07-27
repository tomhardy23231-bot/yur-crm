import { test, expect, type Page } from '@playwright/test';

// E2E основного денежного флоу: вход owner → создать клиента → создать дело
// (сумма 10000) → карточка → платёж 4000 через модалку «+ Платіж» → проверить
// «Оплачено 4 000» и «Борг 6 000».
//
// Активирован 2026-07-27 (был каркасом под describe.skip с v3 s12): селекторы
// сверены с живым кодом форм — client-form (#last_name/#first_name), case-form
// (#client_id/#lawyer_id/#responsible_id/#case_type/#category — Radix-селекты
// через общий <Select>), payment-form в модалке (role=dialog) из быстрых
// действий карточки (кнопка «Платіж», сабмит «Додати платіж»).
//
// Требуется учётка владельца: на сидовой базе — дефолт ниже, на любой другой —
// E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD (см. tests/README.md). Созданные записи
// (клиент/дело/платёж) остаются в БД — прибирает их владелец учётки или
// сопровождающий скрипт по created_by временного владельца.

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

// Открыть стилизованный <Select> (Radix) по id триггера и выбрать опцию:
// по тексту (name) или первую попавшуюся. Опции Radix рендерятся в портал —
// ищем по role=option на всей странице.
async function pickSelect(page: Page, fieldId: string, name?: RegExp) {
  await page.locator(`#${fieldId}`).click();
  const options = name ? page.getByRole('option', { name }) : page.getByRole('option');
  await options.first().click();
}

test.describe('Основной флоу: клиент → дело → платёж → долг', () => {
  test('платёж 4000 по делу на 10000 → Оплачено 4 000 / Борг 6 000', async ({
    page,
  }) => {
    // Свежий браузерный профиль → всплыли бы онбординг и модалка релиза
    // (оверлей перехватывает клики). Помечаем «уже видел» ДО загрузки приложения;
    // ключ релиза — на несколько версий вперёд, чтобы тест не гнил с релизами.
    await page.addInitScript(() => {
      window.localStorage.setItem('yk_onboarding_v1', '1');
      for (const v of ['2.11', '2.12', '2.13', '2.14', '2.15', '3.0']) {
        window.localStorage.setItem(`yk_release_seen_${v}`, '1');
      }
    });
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);

    // 1) Клиент (физлицо по умолчанию — без Radix-селектов: только ФИО).
    await page.goto('/clients/new');
    await page.locator('#last_name').fill(`${RUN}`);
    await page.locator('#first_name').fill('Тест');
    // По тексту: у «Вийти» в сайдбаре тоже type=submit.
    await page.getByRole('button', { name: 'Створити клієнта' }).click();
    // Успех редиректит на карточку клиента.
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // 2) Дело: свой клиент — по имени (список на живой базе длинный),
    // юрист/Експерт — первые активные из списка, тип/категория — первые.
    await page.goto('/cases/new');
    await page.locator('[name="number_title"]').fill(`${RUN}-ДОГ`);
    await pickSelect(page, 'client_id', new RegExp(RUN));
    // Первая опция у юриста/Експерта — пустышка «не обрано» (sentinel общего
    // Select) — целимся в конкретных сотрудников по имени (времянки e2e либо
    // сидовые, scripts/seed.ts). Юрист ≠ Експерт, иначе поверх карточки всплывёт
    // модалка «Суміщення ролей» (0007) и перекроет модалку платежа.
    await pickSelect(page, 'lawyer_id', /IT E2E Owner|Влад Владелец/);
    await pickSelect(page, 'responsible_id', /IT E2E Expert|Эдуард Экспертов/);
    await pickSelect(page, 'case_type');
    await pickSelect(page, 'category');
    await page.locator('[name="contract_sum"]').fill('10000');
    await page.getByRole('button', { name: 'Створити справу' }).click();
    await page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // 3) Платёж 4000: быстрое действие «+ Платіж» открывает модалку с формой.
    // Ждём полностью отрисованную карточку (холодная компиляция маршрута +
    // стриминг RSC перерисовывают шапку — клик по «нестабильной» кнопке висит).
    await expect(
      page.getByRole('heading', { name: new RegExp(`${RUN}-ДОГ`) }),
    ).toBeVisible({ timeout: 60_000 });
    const payButton = page.getByRole('button', { name: 'Платіж', exact: true });
    await expect(payButton).toBeVisible({ timeout: 30_000 });
    // Диалог — по имени: на карточке могут жить и другие role=dialog.
    // Клик с повтором: сразу после стриминга кнопка может быть ещё не
    // гидратирована (клик уходит в пустоту).
    const dialog = page.getByRole('dialog', { name: 'Новий платіж' });
    await expect(async () => {
      await payButton.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await dialog.locator('[name="amount"]').fill('4000');
    // Дата уже проставлена (сегодня); счёт/способ — необязательные.
    await dialog.getByRole('button', { name: 'Додати платіж' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // 4) Суммы в шапке карточки. Подписи локализованы (uk: «Оплачено»/«Борг»),
    // числа с разрядкой Intl (4 000 / 6 000 — пробел может быть NBSP/узким).
    await expect(page.getByText(/4[\s  ]?000/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/6[\s  ]?000/).first()).toBeVisible();
  });
});
