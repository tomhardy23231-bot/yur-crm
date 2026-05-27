import { Badge } from '@/components/ui/badge';
import { CASE_PRIORITY_LABEL, type CasePriority } from '@/lib/types/db';

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <Badge tone={priority === 'urgent' ? 'prio-high' : 'neutral'}>
      {CASE_PRIORITY_LABEL[priority]}
    </Badge>
  );
}
