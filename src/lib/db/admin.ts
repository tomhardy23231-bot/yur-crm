// Админский доступ к БД (цикл v4) — замена прежнего service_role-клиента.
//
// adminDb() — PrismaClient под ролью-ВЛАДЕЛЬЦЕМ БД: владелец таблиц обходит
// RLS (аналог service_role). Правило CLAUDE.md §2 остаётся в силе: ТОЛЬКО
// системные задачи — machine-роуты (cron/telegram/calendar/OnlyOffice),
// owner-экшены управления учётками, seed, тестовые фикстуры. НИКОГДА для
// обычных пользовательских запросов — для них userDb (./index.ts).
//
// Правило закреплено механически: импорт этого модуля вне allowlist валит
// ESLint (no-restricted-imports, план v4 ревью Q1).
//
// Схема auth (auth.users) доступна ТОЛЬКО отсюда: у app_user на неё нет прав.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/db/admin — только для сервера, в клиентский бандл не тащить');
}

const globalForDb = globalThis as unknown as { __yurAdminPrisma?: PrismaClient };

export function adminDb(): PrismaClient {
  if (!globalForDb.__yurAdminPrisma) {
    const url = process.env.DATABASE_URL_ADMIN;
    if (!url) {
      throw new Error(
        'DATABASE_URL_ADMIN не задан (pooled-строка Neon под owner-ролью, см. .env.example)',
      );
    }
    globalForDb.__yurAdminPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 3 }),
    });
  }
  return globalForDb.__yurAdminPrisma;
}
