import { addDays, addMonths, compareDates, lastDayOf, makeDate, monthOf, yearOf } from './dates'
import type { Checkup, FamilyDoc, Occurrence, Person, Schedule } from './model'

export type DueState = 'confirm' | 'booked' | 'overdue' | 'book' | 'upcoming'

export interface Due {
  windowStart: string
  windowEnd: string
  /** `windowStart − bookingLeadWeeks`. */
  bookingStart: string
  state: DueState
  /** The booked occurrence of this window, if any. */
  occurrence?: Occurrence
}

interface Window {
  windowStart: string
  windowEnd: string
}

type SeasonalSchedule = Extract<Schedule, { kind: 'seasonal' }>

// --- Execution windows -------------------------------------------------------------------

/** Season whose first day is in `year`; ends in `year + 1` when the season wraps the year end. */
function seasonWindow(schedule: SeasonalSchedule, year: number): Window {
  const wraps = schedule.endMonth < schedule.startMonth
  return {
    windowStart: makeDate(year, schedule.startMonth, 1),
    windowEnd: lastDayOf(wraps ? year + 1 : year, schedule.endMonth),
  }
}

/** The year of the season a date falls in (Jan 2027 belongs to the Nov–Feb season of 2026). */
function seasonYearOf(schedule: SeasonalSchedule, date: string): number {
  const wraps = schedule.endMonth < schedule.startMonth
  return wraps && monthOf(date) <= schedule.endMonth ? yearOf(date) - 1 : yearOf(date)
}

/** Last day of the execution window that starts at `windowStart` (inclusive). */
export function windowEndFor(checkup: Checkup, windowStart: string): string {
  const { schedule } = checkup
  switch (schedule.kind) {
    case 'interval':
      return addDays(addMonths(windowStart, checkup.windowMonths), -1)
    case 'seasonal':
      return seasonWindow(schedule, yearOf(windowStart)).windowEnd
    case 'once':
      return schedule.windowEnd
  }
}

/** Date a finished occurrence counts from: `doneDate`, else the appointment, else the window. */
function doneDateOf(occurrence: Occurrence): string {
  return occurrence.doneDate ?? occurrence.appointmentDate ?? occurrence.windowStart
}

/** The most recent of: doneDate of done occurrences, windowEnd of skipped occurrences. */
function anchorOf(checkup: Checkup, occurrences: Occurrence[]): string | undefined {
  const anchors: string[] = []
  for (const occurrence of occurrences) {
    if (occurrence.status === 'done') anchors.push(doneDateOf(occurrence))
    if (occurrence.status === 'skipped') {
      anchors.push(windowEndFor(checkup, occurrence.windowStart))
    }
  }
  return anchors.sort(compareDates).at(-1)
}

function intervalWindow(checkup: Checkup, months: number, anchor: string | undefined): Window {
  const windowStart = anchor
    ? addMonths(anchor, months)
    : (checkup.firstWindowStart ?? checkup.updatedAt.slice(0, 10))
  return { windowStart, windowEnd: windowEndFor(checkup, windowStart) }
}

function seasonalWindow(
  schedule: SeasonalSchedule,
  anchor: string | undefined,
  today: string,
): Window {
  if (anchor) {
    return seasonWindow(schedule, seasonYearOf(schedule, anchor) + schedule.everyYears)
  }
  // No history: the current season if it is still running, otherwise the next one.
  let year = yearOf(today) - 1
  let window = seasonWindow(schedule, year)
  while (compareDates(window.windowEnd, today) < 0) {
    year += 1
    window = seasonWindow(schedule, year)
  }
  return window
}

function windowOf(checkup: Checkup, occurrences: Occurrence[], today: string): Window | null {
  const { schedule } = checkup
  if (schedule.kind === 'once') {
    const finished = occurrences.some((o) => o.status === 'done' || o.status === 'skipped')
    return finished ? null : { windowStart: schedule.windowStart, windowEnd: schedule.windowEnd }
  }
  const anchor = anchorOf(checkup, occurrences)
  return schedule.kind === 'interval'
    ? intervalWindow(checkup, schedule.months, anchor)
    : seasonalWindow(schedule, anchor, today)
}

// --- State -------------------------------------------------------------------------------

function newestFirst(a: Occurrence, b: Occurrence): number {
  return b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0
}

/** The booked occurrence of the window: same windowStart ('once' has only one window). */
function bookedOccurrence(
  checkup: Checkup,
  occurrences: Occurrence[],
  window: Window,
): Occurrence | undefined {
  const isOnce = checkup.schedule.kind === 'once'
  return occurrences
    .filter((o) => o.status === 'booked' && (isOnce || o.windowStart === window.windowStart))
    .sort(newestFirst)[0]
}

function stateOf(
  window: Window,
  bookingStart: string,
  occurrence: Occurrence | undefined,
  today: string,
): DueState {
  if (occurrence) {
    const appointment = occurrence.appointmentDate
    return appointment && compareDates(appointment, today) < 0 ? 'confirm' : 'booked'
  }
  if (compareDates(today, window.windowEnd) > 0) return 'overdue'
  if (compareDates(today, bookingStart) >= 0) return 'book'
  return 'upcoming'
}

/**
 * The current due window of a check-up, or null when it is inactive or a `once` check-up is
 * done/skipped. `occurrences` may contain other check-ups' occurrences; they are ignored.
 */
export function computeDue(checkup: Checkup, occurrences: Occurrence[], today: string): Due | null {
  if (!checkup.active) return null
  const own = occurrences.filter((o) => o.checkupId === checkup.id)
  const window = windowOf(checkup, own, today)
  if (!window) return null
  const bookingStart = addDays(window.windowStart, -7 * checkup.bookingLeadWeeks)
  const occurrence = bookedOccurrence(checkup, own, window)
  return {
    ...window,
    bookingStart,
    state: stateOf(window, bookingStart, occurrence, today),
    ...(occurrence ? { occurrence } : {}),
  }
}

// --- Whole document ----------------------------------------------------------------------

export interface DocDue extends Due {
  person: Person
  checkup: Checkup
}

/** Display order of states: what needs attention first. */
const STATE_ORDER: Record<DueState, number> = {
  confirm: 0,
  overdue: 1,
  book: 2,
  booked: 3,
  upcoming: 4,
}

/** The date a due is sorted by within its state. */
function sortDate(due: Due): string {
  switch (due.state) {
    case 'confirm':
    case 'booked':
      return due.occurrence?.appointmentDate ?? due.windowStart
    case 'overdue':
    case 'book':
      return due.windowEnd
    case 'upcoming':
      return due.bookingStart
  }
}

function compareDues(a: DocDue, b: DocDue): number {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    compareDates(sortDate(a), sortDate(b)) ||
    a.checkup.id.localeCompare(b.checkup.id)
  )
}

/** All current dues of active check-ups (of persons that exist), most urgent first. */
export function dueForDoc(doc: FamilyDoc, today: string): DocDue[] {
  const persons = new Map(doc.persons.map((p) => [p.id, p]))
  const dues: DocDue[] = []
  for (const checkup of doc.checkups) {
    const person = persons.get(checkup.personId)
    if (!person) continue
    const due = computeDue(checkup, doc.occurrences, today)
    if (due) dues.push({ ...due, person, checkup })
  }
  return dues.sort(compareDues)
}
