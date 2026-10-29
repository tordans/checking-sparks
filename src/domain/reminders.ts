import { formatISO } from 'date-fns'
import { addDays, compareDates, formatShort, parseDate } from './dates'
import type { FamilyDoc } from './model'
import { dueForDoc } from './schedule'
import type { DocDue } from './schedule'

/** What the server stores and sends as a push notification. */
export interface Reminder {
  /** Stable: `${checkupId}:${windowStart}:${kind}:${date}`. */
  id: string
  /** ISO datetime with the offset of the device. */
  at: string
  title: string
  body: string
  path: string
}

type ReminderKind = 'book-open' | 'deadline' | 'day-before' | 'confirm'

/** Turns a local calendar date and hour into an ISO datetime (injectable for tests). */
export type ToIso = (date: string, hour: number) => string

const REMINDER_HORIZON_DAYS = 400
const MAX_BOOK_OPEN_REMINDERS = 8
const BOOK_OPEN_INTERVAL_DAYS = 7
const DEADLINE_DAYS_BEFORE_END = 14
const DAY_BEFORE_HOUR = 18

/** Local time on `date` with the device's UTC offset, e.g. `2027-03-01T09:00:00+01:00`. */
export function localDateTimeToIso(date: string, hour: number): string {
  const local = parseDate(date)
  local.setHours(hour, 0, 0, 0)
  return formatISO(local)
}

interface Candidate {
  kind: ReminderKind
  date: string
  hour: number
  title: string
  body: string
  path: string
}

function candidatesFor(due: DocDue, hour: number): Candidate[] {
  const { person, checkup, state, windowStart, windowEnd, bookingStart, occurrence } = due
  const label = `${person.name}: ${checkup.title}`
  const basePath = `/person/${person.id}/vorsorge/${checkup.id}`
  const untilText = `Termin bis ${formatShort(windowEnd)} machen.`
  const candidates: Candidate[] = []

  if (state === 'book' || state === 'upcoming') {
    for (let i = 0; i < MAX_BOOK_OPEN_REMINDERS; i += 1) {
      const date = addDays(bookingStart, i * BOOK_OPEN_INTERVAL_DAYS)
      if (compareDates(date, windowEnd) > 0) break
      candidates.push({
        kind: 'book-open',
        date,
        hour,
        title: `${person.name}: ${checkup.title} buchen`,
        body: untilText,
        path: basePath,
      })
    }
    const deadline = addDays(windowEnd, -DEADLINE_DAYS_BEFORE_END)
    if (compareDates(deadline, windowStart) >= 0) {
      candidates.push({
        kind: 'deadline',
        date: deadline,
        hour,
        title: `${label} – nur noch 2 Wochen`,
        body: untilText,
        path: basePath,
      })
    }
  }

  const appointment = occurrence?.appointmentDate
  if (appointment && (state === 'booked' || state === 'confirm')) {
    if (state === 'booked') {
      candidates.push({
        kind: 'day-before',
        date: addDays(appointment, -1),
        hour: DAY_BEFORE_HOUR,
        title: `${person.name}: morgen ${checkup.title}`,
        body: checkup.practice ?? '',
        path: basePath,
      })
    }
    candidates.push({
      kind: 'confirm',
      date: addDays(appointment, 1),
      hour,
      title: `${person.name}: War der ${checkup.title}-Termin?`,
      body: 'Kurz bestätigen, damit die nächste Vorsorge geplant wird.',
      path: `${basePath}?action=done`,
    })
  }
  return candidates
}

/**
 * The reminder plan for the next 400 days, computed from the current state only: booking a
 * date makes the booking reminders disappear on the next upload. Reminders dated before
 * `today` are omitted; today's are kept even if their hour has passed (the server sends them
 * with the next cron run). `toIso` is injectable to make the output independent of the time zone.
 */
export function buildReminders(
  doc: FamilyDoc,
  today: string,
  hour: number,
  toIso: ToIso = localDateTimeToIso,
): Reminder[] {
  const horizon = addDays(today, REMINDER_HORIZON_DAYS)
  const reminders: Reminder[] = []
  for (const due of dueForDoc(doc, today)) {
    for (const c of candidatesFor(due, hour)) {
      if (compareDates(c.date, today) < 0 || compareDates(c.date, horizon) > 0) continue
      reminders.push({
        id: `${due.checkup.id}:${due.windowStart}:${c.kind}:${c.date}`,
        at: toIso(c.date, c.hour),
        title: c.title,
        body: c.body,
        path: c.path,
      })
    }
  }
  return reminders.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}
