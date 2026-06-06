'use client';

import { useEffect } from 'react';
import { Download, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { previewKind } from '@/lib/documents/preview';
import type { DocumentWithUploader } from '@/lib/types/db';

import { DocTypeBadge } from './doc-type-badge';
import { OnlyOfficeEditor } from './onlyoffice-editor';

interface DocumentViewerModalProps {
  doc: DocumentWithUploader;
  /** Есть ли право менять дело (RLS write) → office откроется на редактирование. */
  canWrite: boolean;
  onClose: () => void;
}

// Полноэкранная модалка просмотра документа. Картинки/PDF/текст — нативно
// (img/iframe на inline signed URL). Office (docx/xlsx/pptx) — редактор
// OnlyOffice. Прочее — фолбэк со скачиванием. Закрытие: Esc, крестик, бэкдроп.
export function DocumentViewerModal({
  doc,
  canWrite,
  onClose,
}: DocumentViewerModalProps) {
  const { t } = useI18n();
  const kind = previewKind(doc.file_name);
  const previewSrc = `/api/documents/${doc.id}/preview`;
  const downloadSrc = `/api/documents/${doc.id}/download`;

  // Esc закрывает; блокируем прокрутку фона, пока модалка открыта.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={doc.file_name}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Бэкдроп */}
      <button
        type="button"
        aria-label={t.documents.viewer.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[1px]"
      />

      {/* Панель */}
      <div className="relative flex h-[92vh] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Шапка */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="truncate text-[14px] font-semibold text-text">
              {doc.file_name}
            </span>
            <DocTypeBadge docType={doc.doc_type} />
          </div>

          <a
            href={downloadSrc}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:bg-surface-muted"
          >
            <Download size={14} strokeWidth={1.75} />
            {t.documents.viewer.download}
          </a>
          <button
            type="button"
            aria-label={t.documents.viewer.close}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-muted hover:text-text"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Тело */}
        <div
          className={cn(
            'min-h-0 flex-1',
            kind === 'image' && 'overflow-auto bg-surface-sunken p-4',
            (kind === 'pdf' || kind === 'text') && 'bg-surface-sunken',
            kind === 'office' && 'bg-surface-sunken',
            kind === 'other' && 'flex items-center justify-center p-8',
          )}
        >
          {kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt={doc.file_name}
              className="mx-auto max-h-full max-w-full object-contain"
            />
          )}

          {(kind === 'pdf' || kind === 'text') && (
            <iframe
              src={previewSrc}
              title={doc.file_name}
              className="h-full w-full border-0"
            />
          )}

          {kind === 'office' && (
            <OnlyOfficeEditor doc={doc} canWrite={canWrite} />
          )}

          {kind === 'other' && (
            <div className="flex max-w-sm flex-col items-center text-center">
              <p className="text-[13px] text-text-muted">
                {t.documents.viewer.unsupported}
              </p>
              <a
                href={downloadSrc}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover"
              >
                <Download size={15} strokeWidth={1.75} />
                {t.documents.viewer.download}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
