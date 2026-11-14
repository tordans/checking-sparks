import { addDays, addMonths, compareDates, isValidDateString } from '@/domain/dates'
import type { Checkup, Schedule } from '@/domain/model'

/** Flat string values of the check-up form (what the inputs hold). */
export interface CheckupFormValues {
  title: string
  practice: string
  phone: string
  note: string
  kind: Schedule['kind']
  months: string
  startMonth: string
  endMonth: string
  windowStart: string
  windowEnd: string
  windowMonths: string
  bookingLeadWeeks: string
  firstWindowStart: string
  active: boolean
}

export type CheckupFormErrors = Partial<Record<keyof CheckupFormValues, string>>

/** What the form produces; optional fields that were emptied are explicitly `undefined`. */
export type CheckupFields = Pick<
  Checkup,
  'title' | 'schedule' | 'windowMonths' | 'bookingLeadWeeks' | 'active'
> & {
  practice: string | undefined
  phone: string | undefined
  note: string | undefined
  firstWindowStart: string | undefined
}

export const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

export function toFormValues(checkup: Checkup, today: string): CheckupFormValues {
  const { schedule } = checkup
  return {
    title: checkup.title,
    practice: checkup.practice ?? '',
    phone: checkup.phone ?? '',
    note: checkup.note ?? '',
    kind: schedule.kind,
    months: schedule.kind === 'interval' ? String(schedule.months) : '12',
    startMonth: schedule.kind === 'seasonal' ? String(schedule.startMonth) : '10',
    endMonth: schedule.kind === 'seasonal' ? String(schedule.endMonth) : '12',
    windowStart: schedule.kind === 'once' ? schedule.windowStart : today,
    windowEnd: schedule.kind === 'once' ? schedule.windowEnd : addDays(addMonths(today, 12), -1),
    windowMonths: String(checkup.windowMonths),
    bookingLeadWeeks: String(checkup.bookingLeadWeeks),
    firstWindowStart: checkup.firstWindowStart ?? today,
    active: checkup.active,
  }
}

function wholeNumber(value: string, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const n = Number(value)
  return n >= min && n <= max ? n : null
}

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function fromFormValues(
  values: CheckupFormValues,
): { ok: true; fields: CheckupFields } | { ok: false; errors: CheckupFormErrors } {
  const errors: CheckupFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Gib der Vorsorge einen Namen.'

  const bookingLeadWeeks = wholeNumber(values.bookingLeadWeeks, 0, 104)
  if (bookingLeadWeeks === null) errors.bookingLeadWeeks = 'Eine Zahl von 0 bis 104.'

  let schedule: Schedule | null = null
  let windowMonths = wholeNumber(values.windowMonths, 1, 120) ?? 3
  let firstWindowStart: string | undefined
  switch (values.kind) {
    case 'interval': {
      const months = wholeNumber(values.months, 1, 600)
      if (months === null) errors.months = 'Eine Zahl ab 1.'
      const window = wholeNumber(values.windowMonths, 1, 120)
      if (window === null) errors.windowMonths = 'Eine Zahl von 1 bis 120.'
      else windowMonths = window
      if (!isValidDateString(values.firstWindowStart)) {
        errors.firstWindowStart = 'Bitte ein Datum wählen.'
      } else firstWindowStart = values.firstWindowStart
      if (months !== null) schedule = { kind: 'interval', months }
      break
    }
    case 'seasonal': {
      const startMonth = wholeNumber(values.startMonth, 1, 12)
      const endMonth = wholeNumber(values.endMonth, 1, 12)
      if (startMonth !== null && endMonth !== null) {
        schedule = { kind: 'seasonal', startMonth, endMonth }
      }
      break
    }
    case 'once': {
      const { windowStart, windowEnd } = values
      if (!isValidDateString(windowStart)) errors.windowStart = 'Bitte ein Datum wählen.'
      if (!isValidDateString(windowEnd)) errors.windowEnd = 'Bitte ein Datum wählen.'
      else if (isValidDateString(windowStart) && compareDates(windowEnd, windowStart) < 0) {
        errors.windowEnd = 'Das Ende liegt vor dem Anfang.'
      }
      if (!errors.windowStart && !errors.windowEnd) {
        schedule = { kind: 'once', windowStart, windowEnd }
      }
      break
    }
  }

  if (Object.keys(errors).length > 0 || !schedule || bookingLeadWeeks === null) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    fields: {
      title,
      practice: optional(values.practice),
      phone: optional(values.phone),
      note: optional(values.note),
      schedule,
      windowMonths,
      bookingLeadWeeks,
      firstWindowStart,
      active: values.active,
    },
  }
}
