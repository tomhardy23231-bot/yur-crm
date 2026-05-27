import { Badge } from '@/components/ui/badge';
import { TASK_KIND_LABEL, type TaskKind } from '@/lib/types/db';

const TONE: Record<TaskKind, 'neutral' | 'info' | 'warning'> = {
  task: 'neutral',
  hearing: 'info',
  deadline: 'warning',
};

export function TaskKindBadge({ kind }: { kind: TaskKind }) {
  return <Badge tone={TONE[kind]}>{TASK_KIND_LABEL[kind]}</Badge>;
}
