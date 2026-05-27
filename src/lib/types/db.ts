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

// =====================================================================
// Clients
// =====================================================================

export type ClientKind = 'individual' | 'company';

export const CLIENT_KINDS: ReadonlyArray<ClientKind> = ['individual', 'company'];

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  individual: 'Физлицо',
  company: 'Компания',
};

export type Client = {
  id: string;
  name: string;
  client_kind: ClientKind;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

// =====================================================================
// Cases — пока используется только сводкой в карточке клиента (Шаг 4).
// Полная сущность будет в Шаге 5. Здесь — минимум полей для compact-таблицы.
// =====================================================================

export type CaseStage =
  | 'new_request'
  | 'consultation'
  | 'in_progress'
  | 'pretrial'
  | 'litigation'
  | 'awaiting_decision'
  | 'enforcement'
  | 'closed';

export type CaseSummary = {
  id: string;
  number_title: string;
  stage: CaseStage;
  opened_at: string;
  contract_sum: number;
  debt: number;
  responsible: {
    id: string;
    full_name: string;
  } | null;
};
