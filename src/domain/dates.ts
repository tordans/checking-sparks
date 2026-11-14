import {
  addDays as fnsAddDays,
  addMonths as fnsAddMonths,
  differenceInMonths,
  format,
  lastDayOfMonth,
} from 'date-fns'

/**
 * Helpers on local calendar dates, represented as `YYYY-MM-DD` strings.
 * Strings are parsed as *local* midnight (never via `new Date('YYYY-MM-DD')`, which is UTC).
 * Because the format is zero-padded, plain string comparison orders dates correctly.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDate(value: string): Date {
  const match = DATE_PATTERN.exec(value)
  if (!match) throw new Error(`Invalid date string: ${value}`)
  const date = new Date(0)
  // setFullYear avoids the two-digit-year quirk of the Date constructor.
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setHours(0, 0, 0, 0)
  return date
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  return formatDate(parseDate(value)) === value
}

/** Today as a local calendar date. `now` is injectable for tests. */
export function today(now: Date = new Date()): string {
  return formatDate(now)
}

/** Adds calendar days (may be negative). */
export function addDays(value: string, days: number): string {
  return formatDate(fnsAddDays(parseDate(value), days))
}

/** Adds calendar months; clamps to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: string, months: number): string {
  return formatDate(fnsAddMonths(parseDate(value), months))
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function maxDate(a: string, b: string): string {
  return compareDates(a, b) >= 0 ? a : b
}

/** Completed months from `from` to `to`, e.g. age in months for a birth date. */
export function monthsBetween(from: string, to: string): number {
  return differenceInMonths(parseDate(to), parseDate(from))
}

export function yearOf(value: string): number {
  return Number(value.slice(0, 4))
}

export function monthOf(value: string): number {
  return Number(value.slice(5, 7))
}

/** `YYYY-MM-DD` for the given month (1–12) and day. */
export function makeDate(year: number, month: number, day: number): string {
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return formatDate(date)
}

/** Last day of the given month (1–12). */
export function lastDayOf(year: number, month: number): string {
  return formatDate(lastDayOfMonth(parseDate(makeDate(year, month, 1))))
}

/** German short form without year: `31.03.` */
export function formatShort(value: string): string {
  return format(parseDate(value), 'dd.MM.')
}

/** German long form: `31.03.2027` */
export function formatLong(value: string): string {
  return format(parseDate(value), 'dd.MM.yyyy')
}
