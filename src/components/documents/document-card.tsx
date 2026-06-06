'use client';

import { useState } from 'react';
import { Download, Eye, FileText, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { deleteDocumentAction } from '@/lib/documents/actions';
import { useI18n } from '@/lib/i18n/provider';
import { isPreviewable, previewKind } from '@/lib/documents/preview';
import type { DocumentWithUploader } from '@/lib/types/db';

import { DocTypeBadge } from './doc-type-badge';
import { DocumentViewerModal } from './document-viewer-modal';

interface DocumentCardProps {
  doc: DocumentWithUploader;
  /** Может ли текущий пользователь удалить документ (DELETE RLS = is_staff). */
  canDelete: boolean;
  /** Право менять дело (RLS write) → office-доки открываются на редактирование. */
  canWrite: boolean;
  /** Настроен ли OnlyOffice. Если нет — office-доки (docx/xlsx) НЕ показывают
   *  «Перегляд» (только скачать), чтобы в проде без сервера не было тупика. */
  officeEnabled: boolean;
}

const DATETIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Документ как карточка в горизонтальной сетке (вместо строки на всю ширину).
// Иконка + действия сверху, имя файла (до 2 строк), тип-бейдж, мета внизу.
export function DocumentCard({
  doc,
  canDelete,
  canWrite,
  officeEnabled,
}: DocumentCardProps) {
  const { t } = useI18n();
  const [viewerOpen, setViewerOpen] = useState(false);
  const kind = previewKind(doc.file_name);
  // Office (docx/xlsx) показываем только при включённом OnlyOffice; остальное
  // (pdf/картинки/текст) — всегда нативно.
  const canPreview = kind === 'office' ? officeEnabled : isPreviewable(kind);

  return (
    // id + scroll-mt-24 + target:* — переход по якорю из Cmd+K (LOW#9).
    <div
      id={`document-${doc.id}`}
      className="group relative flex scroll-mt-24 flex-col gap-1.5 rounded-lg border border-border p-2.5 transition-all duration-[120ms] ease-out target:border-primary hover:border-border-strong hover:shadow-sm"
    >
      {/* Строка 1: иконка + имя файла + действия. */}
      <div className="flex items-start gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <FileText size={15} strokeWidth={1.75} />
        </span>

        {canPreview ? (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            title={doc.file_name}
            className="line-clamp-2 min-w-0 flex-1 break-words text-left text-[12.5px] font-semibold leading-snug text-text transition-colors hover:text-primary"
          >
            {doc.file_name}
          </button>
        ) : (
          <a
            href={`/api/documents/${doc.id}/download`}
            title={doc.file_name}
            className="line-clamp-2 min-w-0 flex-1 break-words text-[12.5px] font-semibold leading-snug text-text transition-colors hover:text-primary"
          >
            {doc.file_name}
          </a>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {canPreview && (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              aria-label={t.documents.row.preview}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-primary-subtle hover:text-primary"
            >
              <Eye size={13} strokeWidth={1.75} />
            </button>
          )}
          <a
            href={`/api/documents/${doc.id}/download`}
            aria-label={t.documents.row.download}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-primary-subtle hover:text-primary"
          >
            <Download size={13} strokeWidth={1.75} />
          </a>
          {canDelete && (
            <form action={deleteDocumentAction}>
              <input type="hidden" name="doc_id" value={doc.id} />
              <input type="hidden" name="case_id" value={doc.case_id} />
              <button
                type="submit"
                aria-label={t.documents.row.deleteDocument}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-error-bg hover:text-error focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Строка 2: тип + дата + автор (компактно, в одну строку). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
        <DocTypeBadge docType={doc.doc_type} />
        <span className="tabular-nums">
          {DATETIME_FMT.format(new Date(doc.uploaded_at))}
        </span>
        {doc.uploader && (
          <span
            className="inline-flex items-center"
            title={doc.uploader.full_name}
          >
            <Avatar name={doc.uploader.full_name} size="sm" />
          </span>
        )}
      </div>

      {viewerOpen && (
        <DocumentViewerModal
          doc={doc}
          canWrite={canWrite}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
