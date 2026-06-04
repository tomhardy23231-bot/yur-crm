'use client';

import { Badge } from '@/components/ui/badge';
import { type BillingType } from '@/lib/types/db';
import { useI18n } from '@/lib/i18n/provider';

export function BillingTypesBadges({ types }: { types: BillingType[] }) {
  const { t } = useI18n();
  if (types.length === 0) {
    return <span className="text-[13px] text-text-subtle">{t.common.dash}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((bt) => (
        <Badge key={bt} tone="info">
          {t.enums.billingType[bt]}
        </Badge>
      ))}
    </div>
  );
}
