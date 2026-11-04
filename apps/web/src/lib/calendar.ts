/**
 * Jalali (Persian solar) and Gregorian calendars: conversion, month grids and formatting.
 * Dates are kept as ISO days (YYYY-MM-DD, Gregorian) everywhere; only what people see changes.
 * The conversion follows the well-known jalaali algorithm (valid for years 1-3177 Jalali).
 */

export type CalendarSystem = 'jalali' | 'gregorian';

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

/** Leap state of a Jalali year, its Gregorian year and the March day of Nowruz. */
function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

/** Gregorian date → Julian day number. */
function g2d(gy: number, gm: number, gd: number) {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

/** Julian day number → Gregorian date. */
function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { y: gy, m: gm, d: gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).y;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { y: jy, m: 1 + div(k, 31), d: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { y: jy, m: 7 + div(k, 30), d: mod(k, 30) + 1 };
}

export const toJalali = (gy: number, gm: number, gd: number) => d2j(g2d(gy, gm, gd));
export const toGregorian = (jy: number, jm: number, jd: number) => d2g(j2d(jy, jm, jd));
const isJalaliLeap = (jy: number) => jalCal(jy).leap === 0;

/** A day in a calendar (month 1-12). */
export interface CalDay {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (g: CalDay) => `${g.y}-${pad(g.m)}-${pad(g.d)}`;
export const parseIso = (iso: string): CalDay | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

/** The day in the given calendar for an ISO day. */
export function fromIso(iso: string, cal: CalendarSystem): CalDay | null {
  const g = parseIso(iso);
  if (!g) return null;
  return cal === 'jalali' ? toJalali(g.y, g.m, g.d) : g;
}

/** The ISO day of a day in the given calendar. */
export function toIso(day: CalDay, cal: CalendarSystem): string {
  return isoOf(cal === 'jalali' ? toGregorian(day.y, day.m, day.d) : day);
}

export function monthLength(y: number, m: number, cal: CalendarSystem): number {
  if (cal === 'jalali') return m <= 6 ? 31 : m <= 11 ? 30 : isJalaliLeap(y) ? 30 : 29;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const addMonths = (y: number, m: number, n: number) => {
  const total = y * 12 + (m - 1) + n;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
};

/** Weekday of an ISO day (0 = Sunday). */
export const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Rows of a month view: ISO days, with null for the blanks before the first day. Weeks start on Saturday (Jalali) or Monday. */
export function monthGrid(y: number, m: number, cal: CalendarSystem): (string | null)[][] {
  const start = cal === 'jalali' ? 6 : 1;
  const first = toIso({ y, m, d: 1 }, cal);
  const blanks = (weekday(first) - start + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: blanks }, () => null);
  for (let d = 1; d <= monthLength(y, m, cal); d++) cells.push(toIso({ y, m, d }, cal));
  while (cells.length % 7) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const locales = (locale: 'fa' | 'en', cal: CalendarSystem) => `${locale === 'fa' ? 'fa-IR' : 'en-GB'}-u-ca-${cal === 'jalali' ? 'persian' : 'gregory'}-nu-${locale === 'fa' ? 'arabext' : 'latn'}`;

/** A date (ISO day or date-time) as people read it, in the chosen calendar. */
export function formatDay(value: string, locale: 'fa' | 'en', cal: CalendarSystem, withTime = false): string {
  const date = /T\d{2}:\d{2}/.test(value) ? new Date(value) : new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locales(locale, cal), withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

/** "Aban 1405" / "October 2026": the title of a month view. */
export function monthTitle(y: number, m: number, locale: 'fa' | 'en', cal: CalendarSystem): string {
  const iso = toIso({ y, m, d: 15 }, cal);
  return new Intl.DateTimeFormat(locales(locale, cal), { month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
}

/** Short weekday names in the order of the month view. */
export function weekdayNames(locale: 'fa' | 'en', cal: CalendarSystem): string[] {
  const start = cal === 'jalali' ? 6 : 1;
  // 2026-11-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const day = 1 + ((start + i) % 7);
    return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-GB', { weekday: locale === 'fa' ? 'narrow' : 'short' }).format(new Date(`2026-11-0${day}T12:00:00Z`));
  });
}

/** Day of the month as shown (Persian digits in Persian). */
export const dayNumber = (iso: string, locale: 'fa' | 'en', cal: CalendarSystem) => {
  const d = fromIso(iso, cal)?.d ?? 0;
  return locale === 'fa' ? String(d).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[Number(x)]) : String(d);
};

/** Which calendar to use: the site's setting, else by language. */
export const resolveCalendar = (setting: string | undefined, locale: 'fa' | 'en'): CalendarSystem =>
  setting === 'jalali' || setting === 'gregorian' ? setting : locale === 'fa' ? 'jalali' : 'gregorian';
