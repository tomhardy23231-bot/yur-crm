import { defineConfig, devices } from '@playwright/test';

// E2E-тесты Юр CRM (браузер). Сценарии — в tests/e2e/*.spec.ts (.spec, чтобы не
// пересекаться с vitest *.test.ts).
//
// Предусловия: поднят локальный Supabase и засижены аккаунты (`npm run db:seed`).
// Playwright сам поднимает dev-сервер на отдельном порту (webServer ниже); если
// сервер уже запущен на этом порту — переиспользует.
//
// Запуск:  npx playwright test        (нужен установленный Chromium: npx playwright install chromium)
const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  // Щедрые таймауты под холодную компиляцию Turbopack: первый заход на маршрут
  // в dev собирается несколько секунд (иногда десятков). Сервер переиспользуется,
  // поэтому платим один раз за маршрут.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    locale: 'uk-UA',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
