import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Интеграционные тесты — поверх Postgres/Neon (npm run test:integration).
// Требуют .env.local (или CI-env) с DATABASE_URL_APP + DATABASE_URL_ADMIN.
// Если переменных нет — наборы помечают себя skipped (см. hasDbEnv в fixtures).
//
// fileParallelism:false и singleFork — тесты делят одно состояние БД,
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
