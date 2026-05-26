// Доменные типы, синхронные с public-схемой (см. supabase/migrations).
// `supabase gen types` подключим позже — пока вручную, чтобы не тянуть в Шаге 2
// генератор и не закладываться на структуру, которая ещё будет меняться.

export type Role = 'owner' | 'admin' | 'specialist' | 'assistant';
export type SpecialistType = 'lawyer' | 'jurist';

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  specialist_type: SpecialistType | null;
  supervisor_id: string | null;
  is_active: boolean;
  created_at: string;
};

export const STAFF_ROLES: ReadonlyArray<Role> = ['owner', 'admin', 'specialist', 'assistant'];

export function isStaffRole(value: unknown): value is Role {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}
