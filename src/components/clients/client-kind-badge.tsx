import { Badge } from '@/components/ui/badge';
import { CLIENT_KIND_LABEL, type ClientKind } from '@/lib/types/db';

const TONE: Record<ClientKind, 'info' | 'neutral'> = {
  individual: 'neutral',
  company: 'info',
  entrepreneur: 'info',
};

// Тип клиента — тихий бейдж (бриф §7): цветная точка + тёмный текст. В плотной
// таблице это спокойнее заливки. Можно отключить через quiet={false}.
export function ClientKindBadge({
  kind,
  quiet = true,
}: {
  kind: ClientKind;
  quiet?: boolean;
}) {
  return (
    <Badge tone={TONE[kind]} quiet={quiet}>
      {CLIENT_KIND_LABEL[kind]}
    </Badge>
  );
}
