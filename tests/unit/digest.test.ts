import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDigest, taskKindLabel, type DigestTask } from '@/lib/notifications/digest';

// v3 Сессия 8: дайджест группирует задачи по КИЕВСКИМ датам. Фиксируем «сегодня»
// через системное время. 2026-06-15 — лето (EEST, UTC+3): 11:00Z = 14:00 Киева.

afterEach(() => {
  vi.useRealTimers();
});

function setToday() {
  vi.useFakeTimers();
  // 12:00 Киева 15 июня 2026.
  vi.setSystemTime(new Date('2026-06-15T09:00:00Z'));
}

const tasks: DigestTask[] = [
  // вчера по Киеву (06-10 10:00) → просрочено
  { title: 'Подать иск', kind: 'deadline', due_at: '2026-06-10T07:00:00Z', caseTitle: '№12/2026' },
  // сегодня (06-15 14:00) → сегодня
  { title: 'Иванов', kind: 'hearing', due_at: '2026-06-15T11:00:00Z', caseTitle: '№7/2026' },
  // завтра (06-16 09:30) → завтра
  { title: 'Позвонить', kind: 'task', due_at: '2026-06-16T06:30:00Z', caseTitle: null },
  // через 5 дней → не входит
  { title: 'Далёкое', kind: 'task', due_at: '2026-06-20T10:00:00Z', caseTitle: '№9/2026' },
];

describe('buildDigest', () => {
  it('группирует на просрочено/сегодня/завтра и форматирует строки (ru)', () => {
    setToday();
    const text = buildDigest(tasks, 'ru');

    expect(text).toContain('Напоминания');
    expect(text).toContain('⚠️ Просрочено');
    expect(text).toContain('Сегодня');
    expect(text).toContain('Завтра');

    // формат: «HH:mm — Вид: Дело — Заголовок»
    expect(text).toContain('14:00 — Заседание: №7/2026 — Иванов');
    expect(text).toContain('10:00 — Дедлайн: №12/2026 — Подать иск');
    // без дела — только заголовок
    expect(text).toContain('09:30 — Задача: Позвонить');

    // задача через 5 дней не попадает
    expect(text).not.toContain('Далёкое');
  });

  it('локализует заголовки и виды на украинском', () => {
    setToday();
    const text = buildDigest(tasks, 'uk');
    expect(text).toContain('Нагадування');
    expect(text).toContain('⚠️ Прострочено');
    expect(text).toContain('Сьогодні');
    expect(text).toContain('14:00 — Засідання: №7/2026 — Иванов');
  });

  it('пустой список → пустая строка', () => {
    setToday();
    expect(buildDigest([], 'ru')).toBe('');
  });

  it('только далёкие задачи (за горизонтом завтра) → пустая строка', () => {
    setToday();
    const future: DigestTask[] = [
      { title: 'Потом', kind: 'task', due_at: '2026-07-01T10:00:00Z', caseTitle: null },
    ];
    expect(buildDigest(future, 'ru')).toBe('');
  });

  it('taskKindLabel переводит вид по языку', () => {
    expect(taskKindLabel('hearing', 'ru')).toBe('Заседание');
    expect(taskKindLabel('hearing', 'uk')).toBe('Засідання');
    expect(taskKindLabel('deadline', 'uk')).toBe('Дедлайн');
  });
});
