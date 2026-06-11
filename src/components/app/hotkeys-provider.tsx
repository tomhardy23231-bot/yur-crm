'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';

import { useCommandPalette } from './command-palette';

// ============================================================================
// Глобальные горячие клавиши (v3 Сессия 11). Один keydown-листенер на window:
//   /  — поиск (открывает командную палитру, как триггер топбара);
//   n  — новое дело (только если роль может создавать дела);
//   t  — новая задача (/tasks?new=1 — модалка глобальной задачи, v3 s6);
//   ?  — шпаргалка со списком шорткатов.
// Жёсткое правило: игнорируем события из полей ввода/contenteditable, при
// зажатых Ctrl/Meta/Alt и при фокусе внутри открытой модалки (role=dialog).
// Сравнение по e.code (физическая клавиша) — работает и на укр/рус раскладке.
// ============================================================================

export function HotkeysProvider({ canCreateCase }: { canCreateCase: boolean }) {
  const router = useRouter();
  const { open: openPalette } = useCommandPalette();
  const { t } = useI18n();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.defaultPrevented) return;

      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          el.isContentEditable ||
          // Фокус внутри открытой модалки/палитры — не перехватываем
          // (иначе «n» на кнопке ConfirmDialog увёл бы со страницы).
          el.closest('[role="dialog"]')
        ) {
          return;
        }
      }

      // Shift+/ = «?» — шпаргалка; «/» без Shift — поиск.
      if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        setCheatsheetOpen((v) => !v);
        return;
      }
      if (e.key === '/' || e.code === 'Slash') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.code === 'KeyN' && canCreateCase) {
        e.preventDefault();
        router.push('/cases/new');
        return;
      }
      if (e.code === 'KeyT') {
        e.preventDefault();
        router.push('/tasks?new=1');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette, router, canCreateCase]);

  const rows: Array<{ keys: string[]; label: string }> = [
    { keys: ['Ctrl K'], label: t.ui.hotkeys.searchAction },
    { keys: ['/'], label: t.ui.hotkeys.searchAction },
    ...(canCreateCase ? [{ keys: ['N'], label: t.ui.hotkeys.newCaseAction }] : []),
    { keys: ['T'], label: t.ui.hotkeys.newTaskAction },
    { keys: ['?'], label: t.ui.hotkeys.helpAction },
    { keys: ['Esc'], label: t.ui.hotkeys.closeAction },
  ];

  return (
    <Modal
      open={cheatsheetOpen}
      onClose={() => setCheatsheetOpen(false)}
      title={t.ui.hotkeys.title}
      subtitle={t.ui.hotkeys.hint}
      closeLabel={t.common.close}
      className="w-[min(400px,95vw)]"
    >
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.keys.join('+') + row.label}
            className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0"
          >
            <span className="text-[13.5px] text-text">{row.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {row.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-subtle"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
