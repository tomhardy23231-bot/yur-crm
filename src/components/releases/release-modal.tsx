'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, PartyPopper, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import type { Release } from '@/lib/releases/releases';

// Большая модалка «Что нового». Показывается один раз на устройство для версии
// (логику показа держит OnboardingProvider). Для крупных релизов (major) внизу —
// кнопка «Пройти тур».
// isOwner: owner-only секции релиза (и owner-варианты заголовка/вводки) видит
// только владелец — сотрудникам фичи вроде журнала активности не анонсируются.
export function ReleaseModal({
  open,
  release,
  isOwner = false,
  onClose,
  onStartTour,
}: {
  open: boolean;
  release: Release;
  isOwner?: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}) {
  const { t, fmt } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const showTour = Boolean(onStartTour);
  const rel = t.help.releases;

  const sections = release.sections.filter((s) => isOwner || !s.ownerOnly);
  const titleKey =
    isOwner && release.ownerTitleKey ? release.ownerTitleKey : release.titleKey;
  const leadKey =
    isOwner && release.ownerLeadKey ? release.ownerLeadKey : release.leadKey;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={fmt(t.help.release.ariaLabel, { version: release.version })}
    >
      {/* Подложка */}
      <button
        type="button"
        aria-label={t.help.release.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay backdrop-blur-[10px] animate-[wm-fade_220ms_ease-out]"
      />

      {/* Карточка */}
      <div className="relative z-10 flex max-h-[92vh] w-[min(840px,96vw)] flex-col overflow-hidden rounded-[24px] border border-border bg-surface shadow-[var(--shadow-pop)] antialiased animate-[wm-pop_280ms_var(--ease-out)]">
        {/* Hero — фирменный градиент */}
        <div
          className="relative flex flex-col gap-3 px-9 pb-8 pt-10 text-white"
          style={{ backgroundImage: 'var(--grad-brand)' }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t.help.release.close}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X size={17} strokeWidth={2} />
          </button>

          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">
            <PartyPopper size={15} strokeWidth={2} />
            {fmt(t.help.release.update, { version: release.version })}
            {release.badgeKey && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                {rel[release.badgeKey]}
              </span>
            )}
          </div>

          <h2 className="text-[30px] font-extrabold leading-tight tracking-[-0.01em]">
            {rel[titleKey]}
          </h2>
          <p className="max-w-[62ch] text-[15px] font-[450] leading-[1.6] text-white/90">
            {rel[leadKey]}
          </p>
        </div>

        {/* Тело — секции */}
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-auto px-9 py-8">
          {sections.map((section) => (
            <div key={section.headingKey} className="flex flex-col gap-3">
              <h3 className="text-[13.5px] font-bold uppercase tracking-[0.05em] text-text-muted">
                {rel[section.headingKey]}
              </h3>
              <ul className="flex flex-col gap-3">
                {section.itemKeys.map((itemKey) => (
                  <li key={itemKey} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary"
                    >
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                    <span className="text-[14.5px] leading-[1.6] text-text">
                      {rel[itemKey]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Футер */}
        <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-muted/50 px-9 py-5">
          <span className="text-[12px] tabular-nums text-text-subtle">
            v{release.version}
          </span>
          <div className="flex items-center gap-2">
            {showTour && (
              <Button variant="secondary" size="sm" onClick={onStartTour}>
                <Sparkles size={15} strokeWidth={2} />
                {t.help.release.startTour}
              </Button>
            )}
            <Button size="sm" className="px-5" onClick={onClose}>
              {t.help.release.gotIt}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
