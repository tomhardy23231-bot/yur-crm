import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Интеграционные тесты — поверх ЛОКАЛЬНОГО Supabase (npm run test:integration).
// Требуют: поднятый `npx supabase start` + .env.local с URL/ANON/SERVICE_ROLE.
// Если переменных нет — наборы помечают себя skipped (см. hasSupabaseEnv).
//
// fileParallelism:false и singleFork — тесты делят одно состояние БД и сессии,
// гоняем последовательно, чтобы не ловить гонки RLS/триггеров.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/helpers/load-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
