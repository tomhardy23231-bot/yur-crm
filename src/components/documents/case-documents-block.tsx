import { FileText, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listDocumentsByCase } from '@/lib/documents/queries';
import { onlyOfficeConfigured } from '@/lib/onlyoffice/config';

import { DocumentRow } from './document-row';
import { DocumentUploadForm } from './document-upload-form';

interface CaseDocumentsBlockProps {
  caseId: string;
  /** Может ли текущий пользователь загружать (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Может ли удалять (RLS DELETE = staff-only). */
  canDelete: boolean;
}

export async function CaseDocumentsBlock({
  caseId,
  canWrite,
  canDelete,
}: CaseDocumentsBlockProps) {
  const { t, plural } = await getT();
  const docs = await listDocumentsByCase(caseId);
  const officeEnabled = onlyOfficeConfigured();

  return (
    // id="documents" + scroll-mt-20 — якорь для глобального поиска
    // (Cmd+K → клик по документу ведёт на /cases/<id>#document-<doc_id>;
    // если бы блок был ниже фолда, прокрутка сюда). LOW#9 из внешнего ревью.
    <Card id="documents" className="scroll-mt-20">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <FileText size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.documents.block.heading}
        </h2>
        <span className="text-[12px] text-text-muted">
          · {plural(t.documents.block.fileCount, docs.length)}
        </span>
      </div>

      {canWrite && (
        <details className="group border-b border-border">
          <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:bg-primary-subtle/50 transition-colors w-full">
            <Plus
              size={14}
              strokeWidth={2}
              className="transition-transform group-open:rotate-45"
            />
            {t.documents.block.uploadSummary}
          </summary>
          <div className="px-5 pb-5 pt-1">
            <DocumentUploadForm caseId={caseId} />
          </div>
        </details>
      )}

      {docs.length === 0 ? (
        <EmptyState
          message={
            canWrite
              ? t.documents.block.emptyCanWrite
              : t.documents.block.emptyReadonly
          }
        />
      ) : (
        <div>
          {docs.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              canDelete={canDelete}
              canWrite={canWrite}
              officeEnabled={officeEnabled}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center text-center">
      <p className="text-[13px] text-text-muted max-w-md">{message}</p>
    </div>
  );
}
