'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { type TaskKind } from '@/lib/types/db';

const TONE: Record<TaskKind, 'neutral' | 'info' | 'warning'> = {
  task: 'neutral',
  hearing: 'info',
  deadline: 'warning',
};

export function TaskKindBadge({ kind }: { kind: TaskKind }) {
  const { t } = useI18n();
  return <Badge tone={TONE[kind]}>{t.enums.taskKind[kind]}</Badge>;
}
