'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';
import type { Capability } from '@/lib/types/db';

// Кнопка «?» возле названия права (карточка сотрудника): открывает модалку с
// развёрнутым объяснением — что право включает, что происходит без него и
// какие есть нюансы. Тексты — t.enums.capabilityHelp (абзацы через \n\n);
// лид-фраза до двоеточия («Що дає», «Без права», «Запобіжник»…) выделяется
// жирным, чтобы структура читалась с одного взгляда.

function HelpParagraph({ text }: { text: string }) {
  const m = text.match(/^([^:]{2,28}):\s*(.*)$/);
  return (
    <p className="text-[15px] leading-[1.65] text-text">
      {m ? (
        <>
          <strong className="font-semibold">{m[1]}:</strong> {m[2]}
        </>
      ) : (
        text
      )}
    </p>
  );
}

export function CapHelpButton({ cap }: { cap: Capability }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);

  const label = t.enums.capabilityLabel[cap];
  const paragraphs = t.enums.capabilityHelp[cap].split('\n\n');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fmt(t.users.perms.helpAria, { cap: label })}
        title={fmt(t.users.perms.helpAria, { cap: label })}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-primary-softer hover:text-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <HelpCircle size={14} strokeWidth={1.75} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        closeLabel={t.common.close}
        className="w-[min(680px,95vw)]"
      >
        <div className="flex flex-col gap-4">
          {paragraphs.map((p, i) => (
            <HelpParagraph key={i} text={p} />
          ))}
        </div>
      </Modal>
    </>
  );
}
