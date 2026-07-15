import 'server-only';
import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts } from '@/lib/db/convert';
import { storage } from '@/lib/storage';
import type {
  DocType,
  DocumentRow,
  DocumentWithUploader,
} from '@/lib/types/db';

// Резолв текущего под RLS (cache-per-render). null → fail-closed (пусто), как в
// остальных query-функциях цикла v4.

// =====================================================================
// listDocumentsByCase — список документов на карточке дела.
// Сортировка: uploaded_at desc. Доступ — RLS (наследует от дела).
// =====================================================================
export const listDocumentsByCase = cache(async (
  caseId: string,
): Promise<DocumentWithUploader[]> => {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.documents.findMany({
      where: { case_id: caseId },
      select: {
        id: true,
        case_id: true,
        file_name: true,
        storage_key: true,
        doc_type: true,
        uploaded_by: true,
        uploaded_at: true,
        users: { select: { id: true, full_name: true } },
      },
      orderBy: { uploaded_at: 'desc' },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    file_name: r.file_name,
    storage_key: r.storage_key,
    doc_type: r.doc_type,
    uploaded_by: r.uploaded_by,
    uploaded_at: ts(r.uploaded_at),
    uploader: r.users
      ? { id: r.users.id, full_name: r.users.full_name }
      : null,
  }));
});

// =====================================================================
// caseHasDocOfType — есть ли у дела документ заданного типа.
// Используется для мягкого предупреждения «закрыто без акта» (акт = act).
// =====================================================================
export async function caseHasDocOfType(
  caseId: string,
  docType: DocType,
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const n = await userDb(user.profile.id, (tx) =>
    tx.documents.count({ where: { case_id: caseId, doc_type: docType } }),
  );
  return n > 0;
}

// =====================================================================
// getDocument — одна запись (для download/preview-роутов).
// =====================================================================
export async function getDocument(id: string): Promise<DocumentRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const row = await userDb(user.profile.id, (tx) =>
    tx.documents.findUnique({
      where: { id },
      select: {
        id: true,
        case_id: true,
        file_name: true,
        storage_key: true,
        doc_type: true,
        uploaded_by: true,
        uploaded_at: true,
        updated_at: true,
      },
    }),
  );
  if (!row) return null;

  return {
    id: row.id,
    case_id: row.case_id,
    file_name: row.file_name,
    storage_key: row.storage_key,
    doc_type: row.doc_type,
    uploaded_by: row.uploaded_by,
    uploaded_at: ts(row.uploaded_at),
    updated_at: ts(row.updated_at),
  };
}

// =====================================================================
// createSignedDownloadUrl — короткая ссылка для СКАЧИВАНИЯ (TTL 600 с).
// download-флаг заставляет браузер скачать файл под оригинальным именем из БД.
// Storage-провайдер: S3/R2 (presigned прямо в облако) или локальный стрим-роут.
// =====================================================================
export async function createSignedDownloadUrl(
  storageKey: string,
  fileName: string,
): Promise<string> {
  return storage().signedUrl(storageKey, { download: fileName });
}

// =====================================================================
// createSignedPreviewUrl — короткая ссылка БЕЗ флага download, чтобы браузер
// открыл файл inline (в iframe/img), а не скачивал. TTL 600 с.
// =====================================================================
export async function createSignedPreviewUrl(
  storageKey: string,
): Promise<string> {
  return storage().signedUrl(storageKey);
}
