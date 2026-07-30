'use client';

import { ClipboardList, PartyPopper, PlayCircle, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { useOnboarding } from './onboarding-provider';

// Кнопки на странице «Справка»: перезапуск интерактивного тура, повторный показ
// приветственного окна, модалки «Что нового» и мастера настройки учёта
// (последняя — только тем, у кого есть права на его шаги).
export function HelpActions() {
  const { t } = useI18n();
  const { startTour, openWelcome, openWhatsNew, openSetupWizard, hasSetupWizard } =
    useOnboarding();

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button onClick={startTour}>
        <PlayCircle size={16} strokeWidth={2} />
        {t.help.actions.restartTour}
      </Button>
      <Button variant="secondary" onClick={openWelcome}>
        <Sparkles size={16} strokeWidth={1.75} />
        {t.help.actions.openWelcome}
      </Button>
      <Button variant="secondary" onClick={openWhatsNew}>
        <PartyPopper size={16} strokeWidth={1.75} />
        {t.help.actions.whatsNew}
      </Button>
      {hasSetupWizard && (
        <Button variant="secondary" onClick={openSetupWizard}>
          <ClipboardList size={16} strokeWidth={1.75} />
          {t.setupWizard.badge}
        </Button>
      )}
    </div>
  );
}
