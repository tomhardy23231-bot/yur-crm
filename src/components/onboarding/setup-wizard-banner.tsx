'use client';

import { TriangleAlert } from 'lucide-react';

import { useI18n } from '@/lib/i18n/provider';
import { useOnboarding } from './onboarding-provider';
import type { AccountingSetupState } from '@/lib/onboarding/setup-state';

// Постоянная полоса под топбаром: пока учёт настроен не до конца, напоминание
// видно на любом экране. Крестика нет намеренно — модалку можно закрыть сразу,
// поэтому напоминание должно оставаться хотя бы здесь. Исчезает сама, когда
// все шаги закрыты (состояние считает сервер по данным).
export function SetupWizardBanner({ state }: { state: AccountingSetupState }) {
  const { t, plural } = useI18n();
  const { openSetupWizard } = useOnboarding();
  const w = t.setupWizard;

  const remaining = state.totalCount - state.doneCount;
  if (remaining <= 0) return null;

  return (
    // Красная, а не жёлтая (2026-07-30, владелец): это не «к сведению», а
    // незакрытый долг, из-за которого цифры врут. Класс setup-banner-nudge
    // подсвечивает полосу три раза при загрузке и затихает.
    <div className="setup-banner-nudge flex shrink-0 items-center gap-x-2.5 gap-y-1 border-b border-error/35 bg-error-bg px-4 py-1.5 sm:px-5">
      <TriangleAlert
        size={14}
        strokeWidth={2.25}
        aria-hidden="true"
        className="shrink-0 text-error"
      />
      <p className="min-w-0 flex-1 truncate text-[12.5px] leading-snug text-error-text">
        <span className="font-bold">{w.banner.title}</span>
        <span className="opacity-85"> · {plural(w.banner.remaining, remaining)}</span>
      </p>
      <button
        type="button"
        onClick={openSetupWizard}
        className="inline-flex h-6 shrink-0 items-center rounded-full bg-error px-3 text-[12px] font-semibold text-white transition-colors hover:bg-error-text"
      >
        {w.banner.action}
      </button>
    </div>
  );
}
