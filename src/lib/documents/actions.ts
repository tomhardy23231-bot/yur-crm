'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { requireRole, requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DOC_TYPES, type DocType } from '@/lib/types/db';

export type UploadDocumentFields = 'case_id' | 'doc_type' | 'file';

export type UploadDocumentState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<UploadDocumentFields, string>>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 25 MB — компромисс между «договор-сканом на 50 страниц» и блок-стороной памяти
// для arrayBuffer() в Server Action.
const MAX_BYTES = 25 * 1024 * 1024;

// Расширения, которые блокируем безоговорочно (исполняемые / скрипты).
// Список не закрывает всё, но отсекает массовые векторы. Полный antivirus —
// отдельная задача за пределами Phase 1.
const FORBIDDEN_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr',
  'ps1', 'vbs', 'js', 'jse', 'wsf', 'wsh',
  'dll', 'sh', 'lnk',
]);

function isDocType(v: string): v is DocType {
  return (DOC_TYPES as readonly string[]).includes(v);
}

// Делает безопасный кириллицу-сохраняющий slug для storage_key:
//   - пробелы и слэши → дефис;
//   - запрещённые в S3-стиле символы (?, #, %, &, +, =, ', ") → дефис;
//   - схлопывает повторные дефисы;
//   - режет до 80 символов.
// Оригинальное имя всегда хранится в documents.file_name — slug нужен только
// для уникальности storage-ключа и совместимости с URL.
function slugifyFilename(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[\\/\s]+/g, '-')
    .replace(/[?#%&+='"<>:|*\x00-\x1f]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    || 'file';
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export async function uploadDocumentAction(
  _prev: UploadDocumentState,
  formData: FormData,
): Promise<UploadDocumentState> {
  const user = await requireUser();

  const case_id = String(formData.get('case_id') ?? '').trim();
  const doc_type_raw = String(formData.get('doc_type') ?? '').trim();
  const fileEntry = formData.get('file');

  const fieldErrors: UploadDocumentState['fieldErrors'] = {};

  if (!case_id) fieldErrors.case_id = 'Не указано дело';
  else if (!UUID_RE.test(case_id))
    fieldErrors.case_id = 'Некорректный идентификатор дела';

  if (!doc_type_raw) fieldErrors.doc_type = 'Выберите тип документа';
  else if (!isDocType(doc_type_raw))
    fieldErrors.doc_type = 'Недопустимый тип';

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    fieldErrors.file = 'Выберите файл';
  } else {
    if (fileEntry.size > MAX_BYTES) {
      fieldErrors.file = 'Файл больше 25 МБ';
    }
    if (fileEntry.name.length > 200) {
      fieldErrors.file = 'Слишком длинное имя файла (макс 200)';
    }
    const ext = fileExtension(fileEntry.name);
    if (ext && FORBIDDEN_EXT.has(ext)) {
      fieldErrors.file = 'Этот тип файла загружать нельзя';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: 'Проверьте поля формы',
    };
  }

  const file = fileEntry as File;
  const doc_type = doc_type_raw as DocType;
  const storageKey = `cases/${case_id}/${randomUUID()}--${slugifyFilename(file.name)}`;
  const contentType = file.type || 'application/octet-stream';

  const supabase = await createSupabaseServerClient();

  const buffer = await file.arrayBuffer();

  // 1) upload first — получаем storage_key.
  const { error: uploadErr } = await supabase.storage
    .from('case-documents')
    .upload(storageKey, buffer, {
      contentType,
      upsert: false,
    });
  if (uploadErr) {
    return {
      ok: false,
      message: `Не удалось загрузить файл: ${uploadErr.message}`,
    };
  }

  // 2) INSERT documents row.
  const { data: insertedRow, error: insertErr } = await supabase
    .from('documents')
    .insert({
      case_id,
      file_name: file.name,
      storage_key: storageKey,
      doc_type,
      uploaded_by: user.profile.id,
    })
    .select('id')
    .single();

  // 3) rollback storage object если INSERT упал.
  if (insertErr || !insertedRow) {
    await supabase.storage
      .from('case-documents')
      .remove([storageKey])
      .catch((e) => {
        console.error('rollback remove failed:', e);
      });
    return {
      ok: false,
      message: `Файл загружен, но не удалось создать запись: ${insertErr?.message ?? 'unknown'}`,
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: case_id,
    action: 'document_uploaded',
    changes: {
      document_id: insertedRow.id,
      file_name: file.name,
      doc_type,
    },
  });

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// Bare action: удаление документа. RLS DELETE = is_staff() only.
// requireRole — первая линия защиты: иначе specialist, форсящий POST вручную,
// проходит мимо silent-RLS-deny и пишет фейковый `document_deleted` на видимое
// ему дело (storage.remove тоже silent-fails, файл остаётся жив).
export async function deleteDocumentAction(formData: FormData): Promise<void> {
  await requireRole(['owner', 'admin']);
  const doc_id = String(formData.get('doc_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();

  if (!doc_id || !UUID_RE.test(doc_id)) return;

  const supabase = await createSupabaseServerClient();

  // Читаем storage_key + метаданные до удаления — после DELETE row знать их неоткуда,
  // а лог хочет file_name/doc_type для человекочитаемой записи.
  const { data: row } = await supabase
    .from('documents')
    .select('storage_key, case_id, file_name, doc_type')
    .eq('id', doc_id)
    .maybeSingle();

  const { error: rowErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', doc_id);

  if (rowErr) {
    console.error('deleteDocumentAction row delete failed:', rowErr.message);
    return;
  }

  if (row?.storage_key) {
    const { error: storErr } = await supabase.storage
      .from('case-documents')
      .remove([row.storage_key]);
    if (storErr) {
      console.error(
        'deleteDocumentAction storage remove failed (row already gone):',
        storErr.message,
      );
    }
  }

  // CSO #2: case_id для лога берём из row (DB-truth), не из user-controlled formData.
  if (row?.case_id && UUID_RE.test(row.case_id)) {
    const trueCid = row.case_id;
    await logActivity({
      entity_type: 'case',
      entity_id: trueCid,
      action: 'document_deleted',
      changes: {
        document_id: doc_id,
        file_name: row.file_name,
        doc_type: row.doc_type,
      },
    });
    revalidatePath(`/cases/${trueCid}`);
  } else if (case_id && UUID_RE.test(case_id)) {
    revalidatePath(`/cases/${case_id}`);
  }
}
