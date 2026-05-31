import { Badge } from '@/components/ui/badge';
import { CLIENT_KIND_LABEL, type ClientKind } from '@/lib/types/db';

const TONE: Record<ClientKind, 'info' | 'neutral'> = {
  individual: 'neutral',
  company: 'info',
  entrepreneur: 'info',
};

export function ClientKindBadge({ kind }: { kind: ClientKind }) {
  return <Badge tone={TONE[kind]}>{CLIENT_KIND_LABEL[kind]}</Badge>;
}
