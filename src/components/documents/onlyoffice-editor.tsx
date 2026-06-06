'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { useI18n } from '@/lib/i18n/provider';
import type { DocumentWithUploader } from '@/lib/types/db';

// OnlyOffice кладёт свой API в window.DocsAPI после загрузки api.js.
interface DocsAPIGlobal {
  DocEditor: new (
    elementId: string,
    config: Record<string, unknown>,
  ) => { destroyEditor?: () => void };
}
declare global {
  interface Window {
    DocsAPI?: DocsAPIGlobal;
  }
}

// Грузим api.js Document Server один раз; повторные вызовы переиспользуют промис.
let apiScriptPromise: Promise<void> | null = null;
function loadDocsApi(browserUrl: string): Promise<void> {
  if (typeof window !== 'undefined' && window.DocsAPI) return Promise.resolve();
  if (apiScriptPromise) return apiScriptPromise;
  apiScriptPromise = new Promise<void>((resolve, reject) => {
    const src = `${browserUrl.replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`;
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      apiScriptPromise = null;
      reject(new Error('Failed to load OnlyOffice api.js'));
    };
    document.head.appendChild(el);
  });
  return apiScriptPromise;
}

interface OnlyOfficeEditorProps {
  doc: DocumentWithUploader;
  /** Право менять дело — для подсказки «только просмотр» при его отсутствии. */
  canWrite: boolean;
}

// Встроенный редактор OnlyOffice. Тянет подписанный конфиг с /oo-config,
// грузит api.js и монтирует DocEditor. Если DS не настроен/недоступен —
// показывает дружелюбное сообщение вместо падения.
export function OnlyOfficeEditor({ doc }: OnlyOfficeEditorProps) {
  const { t } = useI18n();
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  // Стабильный id контейнера: DocEditor монтируется по id элемента.
  const elementId = `oo-editor-${doc.id}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/documents/${doc.id}/oo-config`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('config request failed');
        const json = await res.json();
        if (cancelled) return;
        if (!json.configured || !json.config || !json.browserUrl) {
          throw new Error('not configured');
        }

        await loadDocsApi(json.browserUrl);
        if (cancelled) return;
        if (!window.DocsAPI) throw new Error('DocsAPI missing');

        editorRef.current = new window.DocsAPI.DocEditor(elementId, {
          ...json.config,
          width: '100%',
          height: '100%',
          events: {
            onAppReady: () => {
              if (!cancelled) setLoading(false);
            },
            onError: () => {
              if (!cancelled) {
                setError(true);
                setLoading(false);
              }
            },
          },
        });
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        editorRef.current?.destroyEditor?.();
      } catch {
        // редактор мог не успеть смонтироваться — это нормально
      }
      editorRef.current = null;
    };
  }, [doc.id, elementId]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center text-center">
          <p className="text-[13px] text-text-muted">
            {t.documents.viewer.editorUnavailable}
          </p>
          <a
            href={`/api/documents/${doc.id}/download`}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <Download size={15} strokeWidth={1.75} />
            {t.documents.viewer.download}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div id={elementId} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-sunken text-[13px] text-text-muted">
          <Loader2 size={16} className="animate-spin" strokeWidth={1.75} />
          {t.documents.viewer.loadingEditor}
        </div>
      )}
    </div>
  );
}
