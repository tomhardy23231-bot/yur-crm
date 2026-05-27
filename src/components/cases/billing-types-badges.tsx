import { Badge } from '@/components/ui/badge';
import { BILLING_TYPE_LABEL, type BillingType } from '@/lib/types/db';

export function BillingTypesBadges({ types }: { types: BillingType[] }) {
  if (types.length === 0) {
    return <span className="text-[13px] text-text-subtle">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <Badge key={t} tone="info">
          {BILLING_TYPE_LABEL[t]}
        </Badge>
      ))}
    </div>
  );
}
