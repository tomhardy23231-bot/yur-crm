// Маппер ошибок Prisma/Postgres → формат DbErrorLike (цикл v4, ревью Q2).
//
// Существующий src/lib/errors.ts (v3) сопоставляет SQLSTATE-коды с русскими
// сообщениями форм и принимает объект {code, message, details} — раньше его
// давал PostgREST. Здесь нормализуем в ТОТ ЖЕ формат всё, что бросают Prisma
// и нижележащий node-postgres, чтобы actions продолжали писать:
//
//   catch (e) { return { ok: false, message: dbActionError('scope', e) }; }
//
// Карта источников:
//  - PrismaClientKnownRequestError P2002/P2003/P2011/P2004 → SQLSTATE
//    23505/23503/23502/23514 (модельные запросы);
//  - P2010 (raw query failed) → SQLSTATE из meta.code (наши RPC и raise
//    из SQL-функций приходят сюда: 42501, 23xxx, P0001);
//  - P2028 (interactive-tx timeout — холодный Neon) → generic + лог;
//  - сырые pg-ошибки (DatabaseError duck-typed по .code/.severity) →
//    {code, message, details} как есть;
//  - всё остальное → {message} (toUserMessage дальше ищет 'row-level
//    security' / 'permission denied' по тексту).

import { Prisma } from '@/generated/prisma/client';
import {
  dbErrorMessage,
  type DbErrorLike,
  type DbErrorStrings,
} from '@/lib/errors';

const PRISMA_TO_SQLSTATE: Record<string, string> = {
  P2002: '23505', // unique_violation
  P2003: '23503', // foreign_key_violation
  P2011: '23502', // not_null_violation
  P2004: '23514', // check_violation (constraint failed)
};

function metaString(meta: unknown, key: string): string | null {
  if (meta && typeof meta === 'object' && key in meta) {
    const v = (meta as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return null;
}

/** Нормализует любую ошибку слоя данных в DbErrorLike для lib/errors.ts. */
export function prismaErrorToDbError(err: unknown): DbErrorLike {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const sqlstate =
      PRISMA_TO_SQLSTATE[err.code] ??
      // P2010: raw query failed — настоящий SQLSTATE лежит в meta.code
      (err.code === 'P2010' ? metaString(err.meta, 'code') : null);
    return {
      code: sqlstate ?? err.code,
      message: metaString(err.meta, 'message') ?? err.message,
      details: null,
    };
  }
  if (err instanceof Error) {
    // сырая ошибка node-postgres (DatabaseError): .code = SQLSTATE
    const code = (err as { code?: unknown }).code;
    const details = (err as { detail?: unknown }).detail;
    return {
      code: typeof code === 'string' ? code : null,
      message: err.message,
      details: typeof details === 'string' ? details : null,
    };
  }
  return { message: String(err) };
}

/** SQLSTATE/код ошибки, если удалось извлечь (для точечных веток в actions). */
export function pgErrorCode(err: unknown): string | null {
  return prismaErrorToDbError(err)?.code ?? null;
}

/**
 * Текст raise exception из наших SQL-функций (SQLSTATE P0001) — гарды пишут
 * человеческие сообщения, которые формы показывают как есть; для остальных
 * кодов возвращает null (тех.детали юзеру не показываем).
 */
export function pgRaiseMessage(err: unknown): string | null {
  const e = prismaErrorToDbError(err);
  return e?.code === 'P0001' && e.message ? e.message : null;
}

/**
 * Универсальный обработчик для server actions: лог тех.деталей + дружелюбное
 * сообщение (существующий dbErrorMessage). Текст наших raise (P0001)
 * прокидывается пользователю как есть, если fallback не передан.
 */
export function dbActionError(
  scope: string,
  err: unknown,
  fallback?: string,
  strings?: DbErrorStrings,
): string {
  const raise = pgRaiseMessage(err);
  return dbErrorMessage(
    scope,
    prismaErrorToDbError(err),
    fallback ?? raise ?? undefined,
    strings,
  );
}
