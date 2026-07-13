'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { type TaskKind } from '@/lib/types/db';

// Каркас 2026-07-13: задача — синий, заседание (суд) — красный, срок — янтарь.
const TONE: Record<TaskKind, 'primary' | 'error' | 'warning'> = {
  task: 'primary',
  hearing: 'error',
  deadline: 'warning',
};

export function TaskKindBadge({ kind }: { kind: TaskKind }) {
  const { t } = useI18n();
  return <Badge tone={TONE[kind]}>{t.enums.taskKind[kind]}</Badge>;
}
