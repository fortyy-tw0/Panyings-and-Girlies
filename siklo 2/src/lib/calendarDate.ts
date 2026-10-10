/**
 * Calendar dates are stored as plain year/month/day numbers, never as JS `Date`
 * timestamps, so a selected day can't shift across time zones.
 * `month` is 1-based (1 = January).
 */
export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export const daysInMonth = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];

/** 0 = Sunday … 6 = Saturday. Uses a local Date at noon so DST changes can't move it to another day. */
export const weekdayOf = (date: CalendarDate): number =>
  new Date(date.year, date.month - 1, date.day, 12).getDay();

/** Today's date on the device's local calendar. */
export const todayLocal = (now: Date = new Date()): CalendarDate => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  day: now.getDate(),
});

export const isValidCalendarDate = (value: unknown): value is CalendarDate => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('year' in value) || !('month' in value) || !('day' in value)) return false;
  const { year, month, day } = value;
  return (
    typeof year === 'number' &&
    typeof month === 'number' &&
    typeof day === 'number' &&
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
};

/** Negative if a < b, 0 if equal, positive if a > b. */
export const compareDates = (a: CalendarDate, b: CalendarDate): number =>
  a.year * 10000 + a.month * 100 + a.day - (b.year * 10000 + b.month * 100 + b.day);

export const isSameDate = (a: CalendarDate, b: CalendarDate): boolean => compareDates(a, b) === 0;

/** "9 October 2026" — matches the design's date style. */
export const formatDate = (date: CalendarDate): string =>
  `${date.day} ${MONTH_NAMES[date.month - 1]} ${date.year}`;

export const formatMonth = (year: number, month: number): string => `${MONTH_NAMES[month - 1]} ${year}`;

export const addMonths = (year: number, month: number, delta: number): { year: number; month: number } => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

/** Cells for a month grid starting on Sunday; `null` marks leading blanks. */
export const monthGrid = (year: number, month: number): (CalendarDate | null)[] => {
  const leading = weekdayOf({ year, month, day: 1 });
  const cells: (CalendarDate | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    cells.push({ year, month, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};
