import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  DocType,
  DocumentRow,
  DocumentWithUploader,
} from '@/lib/types/db';

// =====================================================================
// listDocumentsByCase — список документов на карточке дела.
// Сортировка: uploaded_at desc.
// =====================================================================
export async function listDocumentsByCase(
  caseId: string,
): Promise<DocumentWithUploader[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('documents')
    .select(
      'id, case_id, file_name, storage_key, doc_type, uploaded_by, uploaded_at, ' +
        'uploader:uploaded_by(id, full_name)',
    )
    .eq('case_id', caseId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    throw new Error(`listDocumentsByCase failed: ${error.message}`);
  }
  return normalizeDocuments(data ?? []);
}

// =====================================================================
// getDocument — одна запись (для download-роута).
// =====================================================================
export async function getDocument(
  id: string,
): Promise<DocumentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id, case_id, file_name, storage_key, doc_type, uploaded_by, uploaded_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`getDocument failed: ${error.message}`);
  }
  return (data as DocumentRow | null) ?? null;
}

// =====================================================================
// createSignedDownloadUrl — короткий signed URL для скачивания.
// TTL 600 сек (10 мин). Параметр `download` заставляет браузер скачивать,
// а не открывать inline; имя файла берётся из БД (file_name, оригинал).
// =====================================================================
export async function createSignedDownloadUrl(
  storageKey: string,
  fileName: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from('case-documents')
    .createSignedUrl(storageKey, 600, { download: fileName });

  if (error || !data?.signedUrl) {
    throw new Error(
      `createSignedDownloadUrl failed: ${error?.message ?? 'no signed url'}`,
    );
  }
  return data.signedUrl;
}

// =====================================================================
// helpers
// =====================================================================

type RawDocumentRow = Omit<DocumentRow, 'doc_type'> & {
  doc_type: DocType;
  uploader:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
};

function normalizeDocuments(
  rows: ReadonlyArray<unknown>,
): DocumentWithUploader[] {
  return rows.map((row) => {
    const r = row as RawDocumentRow;
    const uploader = Array.isArray(r.uploader)
      ? (r.uploader[0] ?? null)
      : r.uploader;
    return {
      id: r.id,
      case_id: r.case_id,
      file_name: r.file_name,
      storage_key: r.storage_key,
      doc_type: r.doc_type,
      uploaded_by: r.uploaded_by,
      uploaded_at: r.uploaded_at,
      uploader,
    };
  });
}
