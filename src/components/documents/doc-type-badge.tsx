'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import type { DocType } from '@/lib/types/db';

const TONE: Record<DocType, React.ComponentProps<typeof Badge>['tone']> = {
  contract: 'info',
  claim: 'warning',
  power_of_attorney: 'prio-mid',
  correspondence: 'neutral',
  act: 'success',
  other: 'neutral',
};

export function DocTypeBadge({ docType }: { docType: DocType }) {
  const { t } = useI18n();
  return <Badge tone={TONE[docType]}>{t.enums.docType[docType]}</Badge>;
}
