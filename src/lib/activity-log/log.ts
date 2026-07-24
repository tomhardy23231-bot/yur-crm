import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { rpcLogActivity } from '@/lib/db/rpc';

// Контракт совпадает с public.log_activity(text, uuid, text, jsonb) в БД.
// SECURITY DEFINER + проверки видимости — см. 20260527110000_activity_log_writer.sql.
// Цикл v4: вызов через rpc-реестр под userDb (DEFINER читает auth.uid() шима,
// которому нужен app.user_id транзакции).
//
// ВАЖНО: эта функция НИКОГДА не должна выбрасывать исключение наружу —
// логирование вторично, не должно ломать основной серверный action.
// Ошибки заглушаются и пишутся в console.error.
export type ActivityEntityType =
  | 'case'
  | 'client'
  | 'user'
  | 'department'
  // Журнал 2026-07-21 (миграция 0006): owner-only категории ленты.
  | 'cash'
  | 'org'
  | 'auth'
  | 'absence'
  // Справочник типов дел (миграция 0008): видят owner + обладатели manage_case_types.
  | 'case_type';

// Синглтон-события уровня компании (ставки ЗП, реквизиты) не имеют своего
// uuid — журналируются под нулевым uuid (entity_id обязателен в БД).
export const ORG_ENTITY_ID = '00000000-0000-0000-0000-000000000000';

export type LogActivityInput = {
  entity_type: ActivityEntityType;
  entity_id: string;
  action: string;
  changes?: Record<string, unknown> | null;
};

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      // Системные пути (seed, machine-роуты) журналируют сами при
      // необходимости; лог всегда пишется от лица конкретного сотрудника.
      console.error('[activity-log] skipped: no current user');
      return;
    }
    await userDb(user.authId, (tx) =>
      rpcLogActivity(tx, {
        entityType: input.entity_type,
        entityId: input.entity_id,
        action: input.action,
        changes: input.changes ?? null,
      }),
    );
  } catch (err) {
    console.error('[activity-log] logActivity threw:', err);
  }
}
