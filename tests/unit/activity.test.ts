import { describe, expect, it } from 'vitest';
import { summarizeActivity } from '../../src/shared/activity';

const day = (date: string, edited = 1, created = 0, completed = 0) => ({
  date,
  edited,
  created,
  completed,
});

describe('summarizeActivity', () => {
  it('fills 52 full weeks ending today', () => {
    const summary = summarizeActivity([], '2026-11-18');
    expect(summary.days.at(-1)?.date).toBe('2026-11-18');
    expect(summary.days).toHaveLength(364);
    expect(summary.days[0].date).toBe('2025-11-20');
  });

  it('adds totals', () => {
    const summary = summarizeActivity(
      [day('2026-11-18', 2, 1, 1), day('2026-11-17', 3, 2, 0)],
      '2026-11-18',
    );
    expect(summary.totals).toEqual({ edited: 5, created: 3, completed: 1 });
  });

  it('counts the current streak through today', () => {
    const summary = summarizeActivity(
      [day('2026-11-18'), day('2026-11-17'), day('2026-11-15')],
      '2026-11-18',
    );
    expect(summary.currentStreak).toBe(2);
    expect(summary.longestStreak).toBe(2);
  });

  it('keeps the streak alive until today ends', () => {
    expect(
      summarizeActivity([day('2026-11-17')], '2026-11-18').currentStreak,
    ).toBe(1);
  });

  it('resets the streak after a full day without activity', () => {
    const summary = summarizeActivity(
      [day('2026-11-16'), day('2026-11-15'), day('2026-11-14')],
      '2026-11-18',
    );
    expect(summary.currentStreak).toBe(0);
    expect(summary.longestStreak).toBe(3);
  });

  it('crosses a daylight saving change without skipping a date', () => {
    const summary = summarizeActivity([], '2026-03-30');
    const dates = summary.days.map(({ date }) => date);
    expect(new Set(dates).size).toBe(364);
    expect(dates).toContain('2026-03-29');
  });
});
