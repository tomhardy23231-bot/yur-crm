'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Lock, PartyPopper, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Release } from '@/lib/releases/releases';
import { ReleaseVisual } from './release-visual';

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

  // Обязательное чтение (2026-07-26): у крупного обновления закрытие
  // блокируется на holdSeconds. «Пройти тур» доступен сразу — это и есть
  // желаемый выход. Отсчёт идёт, пока модалка открыта.
  const hold = release.holdSeconds ?? 0;
  const [left, setLeft] = useState(hold);
  const locked = left > 0;

  // Отсчёт стартует со значения по умолчанию (= holdSeconds) и не сбрасывается
  // при повторном открытии: блокировка нужна для ПЕРВОГО показа обновления, а
  // не каждый раз, когда владелец сам открыл «Что нового» из справки.
  useEffect(() => {
    if (!open || hold <= 0) return;
    const id = window.setInterval(() => {
      setLeft((v) => (v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, hold]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, locked]);

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
        onClick={locked ? undefined : onClose}
        disabled={locked}
        className="absolute inset-0 cursor-default bg-overlay backdrop-blur-[10px] animate-[wm-fade_220ms_ease-out]"
      />

      {/* Карточка */}
      <div className="relative z-10 flex max-h-[94vh] w-[min(1040px,96vw)] flex-col overflow-hidden rounded-[24px] border border-border bg-surface shadow-[var(--shadow-pop)] antialiased animate-[wm-pop_280ms_var(--ease-out)]">
        {/* Hero — фирменный градиент */}
        <div
          className="relative flex flex-col gap-3 px-9 pb-8 pt-10 text-white"
          style={{ backgroundImage: 'var(--grad-brand)' }}
        >
          {/* Крестик появляется только когда закрытие разблокировано. */}
          {!locked && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t.help.release.close}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X size={17} strokeWidth={2} />
            </button>
          )}

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
          {sections.map((section) => {
            const danger = section.tone === 'danger';
            return (
              <div
                key={section.headingKey}
                className={cn(
                  'flex flex-col gap-3',
                  // Красный блок — то, что придётся сделать руками, иначе цифры
                  // останутся завышенными. Выделен рамкой, а не просто цветом.
                  danger && 'rounded-card border border-error/30 bg-error-bg/40 p-5',
                )}
              >
                <h3
                  className={cn(
                    'flex items-center gap-2 text-[13.5px] font-bold uppercase tracking-[0.05em]',
                    danger ? 'text-error-text' : 'text-text-muted',
                  )}
                >
                  {danger && (
                    <AlertTriangle size={15} strokeWidth={2.25} aria-hidden="true" />
                  )}
                  {rel[section.headingKey]}
                </h3>
                <ReleaseVisual visual={section.visual} />
                <ul className="flex flex-col gap-3">
                  {section.itemKeys.map((itemKey) => (
                    <li key={itemKey} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          danger
                            ? 'bg-error/15 text-error-text'
                            : 'bg-primary-subtle text-primary',
                        )}
                      >
                        {danger ? (
                          <AlertTriangle size={12} strokeWidth={2.5} />
                        ) : (
                          <Check size={13} strokeWidth={2.5} />
                        )}
                      </span>
                      <span
                        className="text-[14.5px] leading-[1.6] text-text"
                        // Тексты релиза содержат <b> для выделения ключевых слов —
                        // источник наш собственный словарь, не пользовательский ввод.
                        dangerouslySetInnerHTML={{ __html: rel[itemKey] }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Футер */}
        <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-muted/50 px-9 py-5">
          <span className="text-[12px] tabular-nums text-text-subtle">
            v{release.version}
          </span>
          <div className="flex items-center gap-2">
            {showTour && (
              <Button size="sm" className="px-5" onClick={onStartTour}>
                <Sparkles size={15} strokeWidth={2} />
                {t.help.release.startTour}
              </Button>
            )}
            <Button
              size="sm"
              variant={showTour ? 'secondary' : 'primary'}
              className={cn('px-5', locked && 'cursor-not-allowed')}
              disabled={locked}
              onClick={onClose}
              title={locked ? t.help.release.holdHint : undefined}
            >
              {locked && <Lock size={14} strokeWidth={2} />}
              {locked
                ? fmt(t.help.release.closeIn, { seconds: String(left) })
                : t.help.release.gotIt}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
