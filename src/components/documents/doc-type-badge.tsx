import { Badge } from '@/components/ui/badge';
import { DOC_TYPE_LABEL, type DocType } from '@/lib/types/db';

const TONE: Record<DocType, React.ComponentProps<typeof Badge>['tone']> = {
  contract: 'info',
  claim: 'warning',
  power_of_attorney: 'prio-mid',
  correspondence: 'neutral',
  other: 'neutral',
};

export function DocTypeBadge({ docType }: { docType: DocType }) {
  return <Badge tone={TONE[docType]}>{DOC_TYPE_LABEL[docType]}</Badge>;
}
