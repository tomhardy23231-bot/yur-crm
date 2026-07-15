import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Конфиг тестов Юр CRM.
//   - tests/unit        — чистая логика, без БД (npm run test / test:unit)
//   - tests/integration — поверх локального Supabase (npm run test:integration)
//   - tests/e2e         — браузерные сценарии вынесены в Playwright (отдельный конфиг)
// Алиас @/ повторяет tsconfig paths, чтобы импорты из src работали в тестах.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` — маркер-пакет, бросает в дефолтном unit-пуле; подменяем
      // на no-op, чтобы серверные модули (lib/storage, lib/db) были тестируемы.
      'server-only': fileURLToPath(
        new URL('./tests/helpers/empty-module.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Юнит — по умолчанию (быстрые, безопасные). Интеграцию запускаем явно.
    include: ['tests/unit/**/*.test.ts'],
    // Дольше таймаут — на случай если позже сюда зайдут тесты с БД.
    testTimeout: 15_000,
  },
});
