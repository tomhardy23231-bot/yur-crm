import { FileText, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { listDocumentsByCase } from '@/lib/documents/queries';

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
  const docs = await listDocumentsByCase(caseId);

  return (
    // id="documents" + scroll-mt-20 — якорь для глобального поиска
    // (Cmd+K → клик по документу ведёт на /cases/<id>#document-<doc_id>;
    // если бы блок был ниже фолда, прокрутка сюда). LOW#9 из внешнего ревью.
    <Card id="documents" className="scroll-mt-20">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <FileText size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">Документы</h2>
        <span className="text-[12px] text-text-muted">
          · {docs.length} {plural(docs.length, ['файл', 'файла', 'файлов'])}
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
            Загрузить документ
          </summary>
          <div className="px-5 pb-5 pt-1">
            <DocumentUploadForm caseId={caseId} />
          </div>
        </details>
      )}

      {docs.length === 0 ? (
        <EmptyState canWrite={canWrite} />
      ) : (
        <div>
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} canDelete={canDelete} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center text-center">
      <p className="text-[13px] text-text-muted max-w-md">
        {canWrite
          ? 'Документов пока нет. Загрузите договор, претензию или доверенность — файл будет доступен всем, кто видит это дело.'
          : 'Документов по этому делу пока нет.'}
      </p>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
