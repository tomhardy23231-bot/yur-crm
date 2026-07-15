// Пользовательский доступ к БД (цикл v4) — замена прежнего клиента с сессией.
//
// userDb(userId, fn) — ЕДИНСТВЕННЫЙ путь пользовательских запросов:
// interactive-транзакция, первым стейтментом которой выставляется
// set_config('app.user_id', <uuid>, true) — его читает auth.uid() шима,
// на нём держится ВСЯ RLS-модель доступа (CLAUDE.md §4). Забыли обёртку →
// auth.uid() = NULL → RLS отрезает всё: пустой результат, не утечка
// (fail-closed по построению).
//
// Правила (план v4 §4.3, ревью P1-4):
//  - транзакция оборачивает ОДИН запрос / одну query-функцию, НЕ весь рендер
//    страницы: иначе сериализуются независимые запросы, ломается
//    Promise.all-параллелизм (v3 s4) и пробивается timeout на холодном Neon;
//  - параллельные userDb(...) из одного рендера — норма;
//  - мульти-шаговая запись (server action) — ОДНА userDb-обёртка на action;
//  - подключение — Neon POOLED строка (DATABASE_URL_APP, роль app_user);
//    driver-адаптер pg не кэширует named prepared statements — совместим
//    с pgbouncer transaction mode.
//
// Админский путь (owner БД, обходит RLS) — ТОЛЬКО ./admin.ts (ESLint-гард).

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/db — только для сервера, в клиентский бандл не тащить');
}

/** Транзакционный клиент внутри userDb-обёртки — тип для query-функций. */
export type Db = Prisma.TransactionClient;

const globalForDb = globalThis as unknown as { __yurUserPrisma?: PrismaClient };

function getUserPrisma(): PrismaClient {
  if (!globalForDb.__yurUserPrisma) {
    const url = process.env.DATABASE_URL_APP;
    if (!url) {
      throw new Error(
        'DATABASE_URL_APP не задан (pooled-строка Neon под ролью app_user, см. .env.example)',
      );
    }
    globalForDb.__yurUserPrisma = new PrismaClient({
      // max небольшой: инстансов serverless-функций много, пулит pgbouncer Neon
      adapter: new PrismaPg({ connectionString: url, max: 5 }),
    });
  }
  return globalForDb.__yurUserPrisma;
}

/**
 * Выполнить запрос(ы) от лица пользователя под RLS.
 *
 * @param userId uuid сотрудника (auth.users.id = public.users.id)
 * @param fn     один запрос или одна query-функция; получает tx-клиент
 */
export async function userDb<T>(
  userId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  if (!userId) {
    // явный отказ вместо тихого «RLS всё отрезал»: пустой userId — это
    // всегда баг вызывающего кода (нет аутентификации), а не «нет данных»
    throw new Error('userDb: пустой userId');
  }
  return getUserPrisma().$transaction(
    async (tx) => {
      await tx.$executeRaw`select set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    },
    // дефолтные 5 с interactive-tx пробиваются холодным стартом Neon (P2028)
    { maxWait: 10_000, timeout: 15_000 },
  );
}
