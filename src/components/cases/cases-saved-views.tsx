'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookmarkPlus, X } from 'lucide-react';

import { useLocalStorageValue, writeLocalStorage } from '@/lib/use-local-storage';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

// ============================================================================
// Сохранённые виды списка дел (v4 полировка): текущая комбинация фильтров/
// сортировки сохраняется под своим именем и появляется чипом рядом с быстрыми
// пресетами. Хранение — per-device в localStorage (без БД): виды личные,
// как настройка колонок. Страница ?page= в вид не пишется.
// ============================================================================

const STORAGE_KEY = 'yurcase:cases:saved-views';
const MAX_VIEWS = 8;
const MAX_NAME = 30;

type SavedView = { id: string; name: string; qs: string };

// Нормализованный query (без page, отсортированные ключи) — для сравнения
// «этот вид сейчас активен?» и стабильного хранения.
function normalizeQs(qs: string): string {
  const params = new URLSearchParams(qs);
  params.delete('page');
  const entries = [...params.entries()].filter(([, v]) => v !== '');
  entries.sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}

function parseViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as SavedView).id === 'string' &&
        typeof (v as SavedView).name === 'string' &&
        typeof (v as SavedView).qs === 'string',
    );
  } catch {
    return [];
  }
}

export function CasesSavedViews() {
  const { t, fmt } = useI18n();
  const searchParams = useSearchParams();
  const raw = useLocalStorageValue(STORAGE_KEY);
  const views = useMemo(() => parseViews(raw), [raw]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDown(e: MouseEvent) {
      const tgt = e.target as Element | null;
      if (ref.current && !ref.current.contains(tgt)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const currentQs = normalizeQs(searchParams.toString());

  function persist(next: SavedView[]) {
    writeLocalStorage(STORAGE_KEY, JSON.stringify(next));
  }

  function saveCurrent() {
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed || views.length >= MAX_VIEWS) return;
    persist([...views, { id: crypto.randomUUID(), name: trimmed, qs: currentQs }]);
    setName('');
    setOpen(false);
  }

  function removeView(id: string) {
    persist(views.filter((v) => v.id !== id));
  }

  return (
    <>
      {views.map((view) => {
        const active = view.qs === currentQs;
        return (
          <span
            key={view.id}
            className={cn(
              'inline-flex h-8 shrink-0 items-stretch overflow-hidden whitespace-nowrap rounded-chip border text-[12.5px] font-semibold transition-colors duration-[80ms]',
              active
                ? 'border-primary-border bg-primary-subtle text-primary'
                : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
            )}
          >
            <Link
              href={active ? '/cases' : view.qs ? `/cases?${view.qs}` : '/cases'}
              aria-pressed={active}
              className="inline-flex items-center pl-3 pr-1.5"
            >
              {view.name}
            </Link>
            <button
              type="button"
              onClick={() => removeView(view.id)}
              aria-label={fmt(t.cases.savedViews.deleteLabel, { name: view.name })}
              className="inline-flex items-center pr-2 pl-0.5 text-text-subtle transition-colors hover:text-error"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        );
      })}

      {/* «Сохранить вид» — только когда есть что сохранять (активные фильтры)
          и такой комбинации ещё нет среди сохранённых. */}
      {currentQs !== '' && views.every((v) => v.qs !== currentQs) && (
        <div ref={ref} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-chip border border-dashed border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text-muted transition-colors duration-[80ms] hover:border-primary-border hover:text-primary"
          >
            <BookmarkPlus size={14} strokeWidth={1.75} />
            {t.cases.savedViews.save}
          </button>

          {open && (
            <div
              role="dialog"
              aria-label={t.cases.savedViews.title}
              className="absolute left-0 top-full z-40 mt-1.5 flex w-[min(260px,85vw)] flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-lg"
            >
              <p className="text-[12px] text-text-muted">{t.cases.savedViews.title}</p>
              <input
                ref={inputRef}
                type="text"
                value={name}
                maxLength={MAX_NAME}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveCurrent();
                  }
                }}
                placeholder={t.cases.savedViews.namePlaceholder}
                className="h-9 rounded-control border border-border bg-surface px-3 text-[13px] text-text outline-none transition-colors placeholder:text-text-subtle hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary-subtle"
              />
              {views.length >= MAX_VIEWS ? (
                <p className="text-[12px] text-warning">
                  {fmt(t.cases.savedViews.limit, { n: MAX_VIEWS })}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={saveCurrent}
                  disabled={name.trim() === ''}
                  className="inline-flex h-8 items-center justify-center rounded-control bg-primary px-3 text-[12.5px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.cases.savedViews.saveConfirm}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
