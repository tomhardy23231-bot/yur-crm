import { describe, it, expect } from 'vitest';
import { diffChanges } from '@/lib/activity-log/diff';

// diffChanges питает журнал изменений (activity_log): логируем только реально
// изменившиеся поля из белого списка, no-op апдейты возвращают null.

describe('diffChanges', () => {
  it('возвращает null, когда ничего не изменилось', () => {
    const before = { priority: 'normal', subject: 'иск' };
    const after = { priority: 'normal', subject: 'иск' };
    expect(diffChanges(before, after, ['priority', 'subject'])).toBeNull();
  });

  it('фиксирует изменённое поле с from/to', () => {
    const before = { priority: 'normal', subject: 'иск' };
    const after = { priority: 'urgent', subject: 'иск' };
    expect(diffChanges(before, after, ['priority', 'subject'])).toEqual({
      priority: { from: 'normal', to: 'urgent' },
    });
  });

  it('учитывает только поля из белого списка', () => {
    const before = { priority: 'normal', secret: 'a' };
    const after = { priority: 'normal', secret: 'b' };
    // secret изменился, но его нет в fields → null.
    expect(diffChanges(before, after, ['priority'])).toBeNull();
  });

  it('пропускает поля, отсутствующие в after (частичный апдейт)', () => {
    const before = { priority: 'normal', subject: 'иск' };
    const after = { priority: 'urgent' };
    expect(diffChanges(before, after, ['priority', 'subject'])).toEqual({
      priority: { from: 'normal', to: 'urgent' },
    });
  });

  it('нормализует undefined → null в from/to', () => {
    const before = { subject: undefined as string | undefined };
    const after = { subject: 'новый' };
    expect(diffChanges(before, after, ['subject'])).toEqual({
      subject: { from: null, to: 'новый' },
    });
  });

  it('массивы равны при том же содержимом и порядке → null', () => {
    const before = { tags: ['vip', 'urgent'] };
    const after = { tags: ['vip', 'urgent'] };
    expect(diffChanges(before, after, ['tags'])).toBeNull();
  });

  it('массивы различаются по содержимому → diff', () => {
    const before = { tags: ['vip'] };
    const after = { tags: ['vip', 'urgent'] };
    expect(diffChanges(before, after, ['tags'])).toEqual({
      tags: { from: ['vip'], to: ['vip', 'urgent'] },
    });
  });

  it('массивы с тем же набором, но другим порядком → различаются', () => {
    const before = { billing_types: ['prepaid', 'fixed'] };
    const after = { billing_types: ['fixed', 'prepaid'] };
    expect(diffChanges(before, after, ['billing_types'])).not.toBeNull();
  });

  it('несколько полей разом', () => {
    const before = { priority: 'normal', stage: 'new_request', subject: 'a' };
    const after = { priority: 'urgent', stage: 'consultation', subject: 'a' };
    const result = diffChanges(before, after, ['priority', 'stage', 'subject']);
    expect(result).toEqual({
      priority: { from: 'normal', to: 'urgent' },
      stage: { from: 'new_request', to: 'consultation' },
    });
  });
});
