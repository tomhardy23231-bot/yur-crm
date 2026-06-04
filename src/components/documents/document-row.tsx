import { Download, FileText, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { deleteDocumentAction } from '@/lib/documents/actions';
import { getT } from '@/lib/i18n/server';
import type { DocumentWithUploader } from '@/lib/types/db';

import { DocTypeBadge } from './doc-type-badge';

interface DocumentRowProps {
  doc: DocumentWithUploader;
  /** Может ли текущий пользователь удалить документ (DELETE RLS = is_staff). */
  canDelete: boolean;
}

const DATETIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export async function DocumentRow({ doc, canDelete }: DocumentRowProps) {
  const { t } = await getT();
  return (
    // id + scroll-mt-24 + target:* — переход по якорю из Cmd+K (LOW#9).
    // target:bg-primary-subtle/60 даёт мягкую подсветку выбранного документа,
    // снимается при следующем клике/смене URL hash.
    <div
      id={`document-${doc.id}`}
      className="group flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-muted/50 target:bg-primary-subtle/60 scroll-mt-24 transition-colors duration-[120ms] ease-out"
    >
      <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary-subtle text-primary">
        <FileText size={16} strokeWidth={1.75} />
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <a
            href={`/api/documents/${doc.id}/download`}
            className="text-[14px] font-medium text-text hover:text-primary transition-colors break-all"
          >
            {doc.file_name}
          </a>
          <DocTypeBadge docType={doc.doc_type} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
          <span className="font-mono">{DATETIME_FMT.format(new Date(doc.uploaded_at))}</span>
          {doc.uploader && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={doc.uploader.full_name} size="sm" />
              <span>{doc.uploader.full_name}</span>
            </span>
          )}
        </div>
      </div>

      <a
        href={`/api/documents/${doc.id}/download`}
        aria-label={t.documents.row.download}
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-text-subtle hover:text-primary hover:bg-primary-subtle"
      >
        <Download size={14} strokeWidth={1.75} />
      </a>

      {canDelete && (
        <form action={deleteDocumentAction} className="shrink-0">
          <input type="hidden" name="doc_id" value={doc.id} />
          <input type="hidden" name="case_id" value={doc.case_id} />
          <button
            type="submit"
            aria-label={t.documents.row.deleteDocument}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center w-7 h-7 rounded-md text-text-subtle hover:text-error hover:bg-error-bg"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </form>
      )}
    </div>
  );
}
