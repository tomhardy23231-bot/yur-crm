// Чистые предикаты доступа к отсутствиям — зеркало private.absence_user_visible /
// private.absence_can_write (SQL, миграция 20260610180000). Источник правды — RLS в
// БД; эти функции гейтят UI и дают понятный отказ в server actions ДО похода в БД.
// Без зависимостей от сервера — юнит-тестируемы.

import type { Role, VisibilityScope } from '@/lib/types/db';

// Зритель — что нужно для решения о видимости/записи.
export type AbsenceActor = {
  id: string;
  role: Role;
  department_id: string | null;
  visibility_scope: VisibilityScope;
};

// Цель — сотрудник, к которому относится отсутствие.
export type AbsenceTarget = {
  id: string;
  department_id: string | null;
};

// scope_is_all (TS-зеркало private.scope_is_all): admin/office_manager с
// visibility_scope='all' ЛИБО department_id IS NULL (переходное правило).
function scopeIsAll(actor: AbsenceActor): boolean {
  return (
    (actor.role === 'admin' || actor.role === 'office_manager') &&
    (actor.visibility_scope === 'all' || actor.department_id === null)
  );
}

// Видит ли зритель отсутствия сотрудника (зеркало private.absence_user_visible).
//   сам · owner · admin/office_manager (безлимитный scope ЛИБО своё подразделение).
export function canViewAbsencesOf(actor: AbsenceActor, target: AbsenceTarget): boolean {
  if (target.id === actor.id) return true;
  if (actor.role === 'owner') return true;
  if (scopeIsAll(actor)) return true;
  if (actor.role === 'admin' || actor.role === 'office_manager') {
    return target.department_id !== null && target.department_id === actor.department_id;
  }
  return false;
}

// Может ли зритель вносить/удалять отсутствия сотрудника (зеркало
// private.absence_can_write). office_manager СЮДА НЕ входит (только читает, §6).
//   сам · owner · admin (безлимитный scope ЛИБО своё подразделение).
export function canManageAbsencesOf(actor: AbsenceActor, target: AbsenceTarget): boolean {
  if (target.id === actor.id) return true;
  if (actor.role === 'owner') return true;
  if (actor.role === 'admin') {
    if (actor.visibility_scope === 'all' || actor.department_id === null) return true;
    return target.department_id !== null && target.department_id === actor.department_id;
  }
  return false;
}
