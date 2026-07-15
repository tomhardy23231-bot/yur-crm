import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Файлы, которым разрешён admin-пул БД (обходит RLS) — цикл v4, ревью Q1.
// Зеркало правила CLAUDE.md §2 «service_role только системно»: machine-роуты,
// owner-экшены управления учётками, seed/скрипты, тестовая обвязка.
// Новую точку добавлять ТОЛЬКО с осознанием: adminDb не фильтрует данные.
const ADMIN_DB_ALLOWLIST = [
  "src/app/api/cron/reminders/route.ts",
  "src/app/api/calendar/[token]/route.ts",
  "src/app/api/telegram/webhook/route.ts",
  "src/app/api/documents/[id]/content/route.ts",
  "src/app/api/documents/[id]/oo-callback/route.ts",
  // Свой auth (цикл v4 с2): логин сверяет пароль ДО аутентификации, смена
  // пароля пишет bcrypt-хеш — auth.users доступна только admin-пулу.
  "src/app/login/actions.ts",
  "src/lib/users/actions.ts",
  "src/lib/users/credentials-actions.ts",
  "src/lib/users/profile-actions.ts",
  "scripts/**",
  "tests/**",
];

const ADMIN_DB_RESTRICTION = {
  paths: [
    {
      name: "@/lib/db/admin",
      message:
        "adminDb обходит RLS — разрешён только в allowlist (eslint.config.mjs, план v4 Q1). Пользовательские запросы — через userDb (@/lib/db).",
    },
  ],
  patterns: [
    {
      group: ["**/lib/db/admin"],
      message:
        "adminDb обходит RLS — импортируй по алиасу @/lib/db/admin и только из allowlist (eslint.config.mjs).",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Сгенерированный Prisma-клиент (prisma generate) — не наш код.
    "src/generated/**",
    // Папки-черновики с присланными референсами дизайна — не код проекта.
    "Нужно переделать дизайн как тут/**",
  ]),
  {
    rules: {
      "no-restricted-imports": ["error", ADMIN_DB_RESTRICTION],
    },
  },
  {
    files: ADMIN_DB_ALLOWLIST,
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
