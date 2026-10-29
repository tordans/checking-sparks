import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  formatDate,
  formatLong,
  formatShort,
  isValidDateString,
  lastDayOf,
  monthsBetween,
  parseDate,
  today,
} from './dates'

describe('parseDate / formatDate', () => {
  it('parses as local midnight, not UTC', () => {
    const date = parseDate('2027-03-31')
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 2, 31])
    expect(date.getHours()).toBe(0)
  })

  it('round-trips', () => {
    expect(formatDate(parseDate('2024-02-29'))).toBe('2024-02-29')
  })

  it('rejects malformed strings', () => {
    expect(() => parseDate('31.03.2027')).toThrow()
  })
})

describe('isValidDateString', () => {
  it('accepts real dates incl. leap day', () => {
    expect(isValidDateString('2024-02-29')).toBe(true)
  })

  it('rejects impossible and malformed dates', () => {
    expect(isValidDateString('2025-02-29')).toBe(false)
    expect(isValidDateString('2025-13-01')).toBe(false)
    expect(isValidDateString('2025-1-1')).toBe(false)
    expect(isValidDateString('2025-01-01T00:00:00Z')).toBe(false)
  })
})

describe('today', () => {
  it('uses the local calendar day of the given instant', () => {
    expect(today(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05')
    expect(today(new Date(2027, 0, 5, 0, 1))).toBe('2027-01-05')
  })
})

describe('addDays / addMonths', () => {
  it('adds and subtracts days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('clamps at month end (Jan 31 + 1 month)', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2027-08-31', 1)).toBe('2027-09-30')
  })

  it('handles leap day and negative months', () => {
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28')
    expect(addMonths('2027-03-31', -1)).toBe('2027-02-28')
  })

  it('is not affected by daylight saving changes', () => {
    expect(addDays('2027-03-27', 1)).toBe('2027-03-28')
    expect(addDays('2027-03-28', 1)).toBe('2027-03-29')
    expect(addDays('2027-10-30', 2)).toBe('2027-11-01')
  })
})

describe('comparison and differences', () => {
  it('compares', () => {
    expect(compareDates('2027-01-01', '2027-01-02')).toBe(-1)
    expect(compareDates('2027-01-02', '2027-01-01')).toBe(1)
    expect(compareDates('2027-01-01', '2027-01-01')).toBe(0)
  })

  it('counts days and completed months', () => {
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1)
    expect(daysBetween('2027-03-01', '2027-02-28')).toBe(-1)
    expect(monthsBetween('2022-03-15', '2027-03-14')).toBe(59)
    expect(monthsBetween('2022-03-15', '2027-03-15')).toBe(60)
  })

  it('finds the last day of a month', () => {
    expect(lastDayOf(2028, 2)).toBe('2028-02-29')
    expect(lastDayOf(2027, 2)).toBe('2027-02-28')
    expect(lastDayOf(2027, 12)).toBe('2027-12-31')
  })
})

describe('German formatting', () => {
  it('formats short and long', () => {
    expect(formatShort('2027-03-31')).toBe('31.03.')
    expect(formatLong('2027-03-31')).toBe('31.03.2027')
    expect(formatShort('2027-01-05')).toBe('05.01.')
  })
})
