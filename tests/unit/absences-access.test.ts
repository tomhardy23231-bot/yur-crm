import { describe, it, expect } from 'vitest';
import {
  canViewAbsencesOf,
  canManageAbsencesOf,
  type AbsenceActor,
  type AbsenceTarget,
} from '@/lib/absences/access';

// Чистые предикаты доступа к отсутствиям — зеркало private.absence_user_visible /
// absence_can_write (RLS). Источник правды — БД; здесь проверяем UI-гейтинг.

const KYIV = 'dep-kyiv';
const LVIV = 'dep-lviv';

function actor(p: Partial<AbsenceActor> & Pick<AbsenceActor, 'role'>): AbsenceActor {
  return {
    id: p.id ?? 'me',
    role: p.role,
    department_id: p.department_id ?? null,
    visibility_scope: p.visibility_scope ?? 'department',
  };
}
const target = (id: string, dep: string | null): AbsenceTarget => ({ id, department_id: dep });

describe('canViewAbsencesOf', () => {
  it('сам видит свои', () => {
    const a = actor({ id: 'u1', role: 'lawyer', department_id: KYIV });
    expect(canViewAbsencesOf(a, target('u1', KYIV))).toBe(true);
  });

  it('lawyer/expert не видят чужие', () => {
    const a = actor({ id: 'u1', role: 'lawyer', department_id: KYIV });
    expect(canViewAbsencesOf(a, target('u2', KYIV))).toBe(false);
  });

  it('owner видит всех', () => {
    const a = actor({ id: 'o', role: 'owner' });
    expect(canViewAbsencesOf(a, target('u2', LVIV))).toBe(true);
  });

  it('admin видит своё подразделение, не чужое', () => {
    const a = actor({ id: 'a', role: 'admin', department_id: KYIV });
    expect(canViewAbsencesOf(a, target('u2', KYIV))).toBe(true);
    expect(canViewAbsencesOf(a, target('u3', LVIV))).toBe(false);
  });

  it('office_manager ЧИТАЕТ своё подразделение', () => {
    const om = actor({ id: 'om', role: 'office_manager', department_id: KYIV });
    expect(canViewAbsencesOf(om, target('u2', KYIV))).toBe(true);
    expect(canViewAbsencesOf(om, target('u3', LVIV))).toBe(false);
  });

  it('scope=all и dept NULL (переходное) видят всех', () => {
    const all = actor({ id: 'a', role: 'admin', department_id: KYIV, visibility_scope: 'all' });
    expect(canViewAbsencesOf(all, target('u3', LVIV))).toBe(true);
    const nullDep = actor({ id: 'a2', role: 'admin', department_id: null });
    expect(canViewAbsencesOf(nullDep, target('u3', LVIV))).toBe(true);
  });
});

describe('canManageAbsencesOf', () => {
  it('сам управляет своими', () => {
    const a = actor({ id: 'u1', role: 'lawyer', department_id: KYIV });
    expect(canManageAbsencesOf(a, target('u1', KYIV))).toBe(true);
  });

  it('owner управляет всеми', () => {
    const a = actor({ id: 'o', role: 'owner' });
    expect(canManageAbsencesOf(a, target('u2', LVIV))).toBe(true);
  });

  it('admin пишет в своём подразделении, не в чужом', () => {
    const a = actor({ id: 'a', role: 'admin', department_id: KYIV });
    expect(canManageAbsencesOf(a, target('u2', KYIV))).toBe(true);
    expect(canManageAbsencesOf(a, target('u3', LVIV))).toBe(false);
  });

  it('office_manager НЕ пишет даже в своём подразделении', () => {
    const om = actor({ id: 'om', role: 'office_manager', department_id: KYIV });
    expect(canManageAbsencesOf(om, target('u2', KYIV))).toBe(false);
  });

  it('office_manager пишет ТОЛЬКО себе', () => {
    const om = actor({ id: 'om', role: 'office_manager', department_id: KYIV });
    expect(canManageAbsencesOf(om, target('om', KYIV))).toBe(true);
  });

  it('lawyer/expert не пишут чужие', () => {
    const a = actor({ id: 'u1', role: 'expert', department_id: KYIV });
    expect(canManageAbsencesOf(a, target('u2', KYIV))).toBe(false);
  });

  it('admin scope=all / dept NULL пишет в любом подразделении', () => {
    const all = actor({ id: 'a', role: 'admin', department_id: KYIV, visibility_scope: 'all' });
    expect(canManageAbsencesOf(all, target('u3', LVIV))).toBe(true);
    const nullDep = actor({ id: 'a2', role: 'admin', department_id: null });
    expect(canManageAbsencesOf(nullDep, target('u3', LVIV))).toBe(true);
  });
});
