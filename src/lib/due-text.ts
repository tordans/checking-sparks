import { formatLong, formatShort, yearOf } from '@/domain/dates'
import type { Due, DueState } from '@/domain/schedule'

/** Short date when it is in the current year, otherwise with year. */
export function formatDay(date: string, today: string): string {
  return yearOf(date) === yearOf(today) ? formatShort(date) : formatLong(date)
}

export const STATE_LABELS: Record<DueState, string> = {
  confirm: 'Bestätigen',
  overdue: 'Überfällig',
  book: 'Jetzt buchen',
  booked: 'Gebucht',
  upcoming: 'Demnächst',
}

/** The one date that matters for the state, as a short German phrase. */
export function dueText(due: Due, today: string): string {
  const day = (date: string) => formatDay(date, today)
  const appointment = due.occurrence?.appointmentDate
  switch (due.state) {
    case 'confirm':
      return appointment ? `Termin am ${day(appointment)} – hat er stattgefunden?` : 'Bestätigen'
    case 'booked':
      return appointment ? `Termin am ${day(appointment)}` : 'Gebucht'
    case 'overdue':
      return `war bis ${day(due.windowEnd)} fällig`
    case 'book':
      return `bis ${day(due.windowEnd)} buchen`
    case 'upcoming':
      return `ab ${day(due.bookingStart)} buchen`
  }
}

/** The execution window, e.g. `01.02.–30.04.` */
export function windowText(due: Pick<Due, 'windowStart' | 'windowEnd'>, today: string): string {
  return `${formatDay(due.windowStart, today)}–${formatDay(due.windowEnd, today)}`
}
