import { describe, expect, it } from 'vitest';
import { formatDay, fromIso, monthGrid, monthLength, toIso, weekdayNames } from '../lib/calendar';

describe('Jalali and Gregorian calendars', () => {
  it('converts known days both ways', () => {
    expect(fromIso('2026-03-21', 'jalali')).toEqual({ y: 1405, m: 1, d: 1 }); // Nowruz 1405
    expect(fromIso('2026-10-31', 'jalali')).toEqual({ y: 1405, m: 8, d: 9 });
    expect(fromIso('2025-03-20', 'jalali')).toEqual({ y: 1403, m: 12, d: 30 }); // 1403 is a leap year
    expect(toIso({ y: 1405, m: 8, d: 9 }, 'jalali')).toBe('2026-10-31');
    expect(toIso({ y: 1404, m: 12, d: 29 }, 'jalali')).toBe('2026-03-20');
  });

  it('knows month lengths', () => {
    expect(monthLength(1405, 1, 'jalali')).toBe(31);
    expect(monthLength(1405, 7, 'jalali')).toBe(30);
    expect(monthLength(1403, 12, 'jalali')).toBe(30);
    expect(monthLength(1404, 12, 'jalali')).toBe(29);
    expect(monthLength(2028, 2, 'gregorian')).toBe(29);
  });

  it('lays out a month starting on Saturday (Jalali)', () => {
    const grid = monthGrid(1405, 8, 'jalali'); // Aban 1405 starts on Friday 23 Oct 2026
    expect(grid[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(grid[0][6]).toBe('2026-10-23');
    expect(grid.flat().filter(Boolean)).toHaveLength(30);
    expect(weekdayNames('fa', 'jalali')).toHaveLength(7);
  });

  it('formats days in the chosen calendar', () => {
    expect(formatDay('2026-10-31', 'fa', 'jalali')).toContain('۱۴۰۵');
    expect(formatDay('2026-10-31', 'en', 'gregorian')).toContain('2026');
    expect(formatDay('2026-10-31', 'fa', 'gregorian')).toContain('۲۰۲۶');
  });
});
