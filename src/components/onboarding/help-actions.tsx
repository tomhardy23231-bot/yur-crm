'use client';

import { PartyPopper, PlayCircle, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOnboarding } from './onboarding-provider';

// Кнопки на странице «Справка»: перезапуск интерактивного тура, повторный показ
// приветственного окна и модалки «Что нового». Завязаны на OnboardingProvider.
export function HelpActions() {
  const { startTour, openWelcome, openWhatsNew } = useOnboarding();

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button onClick={startTour}>
        <PlayCircle size={16} strokeWidth={2} />
        Запустить тур заново
      </Button>
      <Button variant="secondary" onClick={openWelcome}>
        <Sparkles size={16} strokeWidth={1.75} />
        Открыть приветствие
      </Button>
      <Button variant="secondary" onClick={openWhatsNew}>
        <PartyPopper size={16} strokeWidth={1.75} />
        Что нового
      </Button>
    </div>
  );
}
