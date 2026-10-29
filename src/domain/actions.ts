import { today as todayOf } from './dates'
import type { Checkup, FamilyDoc, Occurrence, Person, Tombstone } from './model'
import { computeDue } from './schedule'

/** Injectable clock and id source; defaults are real time and `crypto.randomUUID`. */
export interface Env {
  now?: Date
  newId?: () => string
}

function nowIso(env: Env): string {
  return (env.now ?? new Date()).toISOString()
}

function nextId(env: Env): string {
  return (env.newId ?? (() => crypto.randomUUID()))()
}

function replaceById<T extends { id: string }>(items: T[], updated: T): T[] {
  return items.map((item) => (item.id === updated.id ? updated : item))
}

/** Adds tombstones for `ids`; an existing tombstone for the same id is replaced. */
function withTombstones(tombstones: Tombstone[], ids: string[], deletedAt: string): Tombstone[] {
  const replaced = new Set(ids)
  return [...tombstones.filter((t) => !replaced.has(t.id)), ...ids.map((id) => ({ id, deletedAt }))]
}

// --- Persons -----------------------------------------------------------------------------

export type PersonInput = Omit<Person, 'id' | 'updatedAt'> & { id?: string }

export function addPerson(doc: FamilyDoc, input: PersonInput, env: Env = {}): FamilyDoc {
  const person: Person = { ...input, id: input.id ?? nextId(env), updatedAt: nowIso(env) }
  return { ...doc, persons: [...doc.persons, person] }
}

export function updatePerson(
  doc: FamilyDoc,
  personId: string,
  patch: Partial<Omit<Person, 'id' | 'updatedAt'>>,
  env: Env = {},
): FamilyDoc {
  const person = doc.persons.find((p) => p.id === personId)
  if (!person) return doc
  const updated: Person = { ...person, ...patch, updatedAt: nowIso(env) }
  return { ...doc, persons: replaceById(doc.persons, updated) }
}

/** Removes the person with all their check-ups and occurrences (each leaves a tombstone). */
export function removePerson(doc: FamilyDoc, personId: string, env: Env = {}): FamilyDoc {
  if (!doc.persons.some((p) => p.id === personId)) return doc
  const checkupIds = doc.checkups.filter((c) => c.personId === personId).map((c) => c.id)
  const occurrenceIds = doc.occurrences
    .filter((o) => checkupIds.includes(o.checkupId))
    .map((o) => o.id)
  const now = nowIso(env)
  return {
    ...doc,
    persons: doc.persons.filter((p) => p.id !== personId),
    checkups: doc.checkups.filter((c) => c.personId !== personId),
    occurrences: doc.occurrences.filter((o) => !occurrenceIds.includes(o.id)),
    tombstones: withTombstones(doc.tombstones, [personId, ...checkupIds, ...occurrenceIds], now),
  }
}

// --- Check-ups ---------------------------------------------------------------------------

export type CheckupInput = Pick<Checkup, 'personId' | 'title' | 'schedule'> &
  Partial<Omit<Checkup, 'personId' | 'title' | 'schedule' | 'updatedAt'>>

/**
 * Builds a complete check-up from partial input (defaults: 3-month window, 6 weeks booking
 * lead, active; an 'interval' without `firstWindowStart` starts today).
 */
export function newCheckup(input: CheckupInput, env: Env = {}): Checkup {
  const firstWindowStart =
    input.firstWindowStart ?? (input.schedule.kind === 'interval' ? todayOf(env.now) : undefined)
  return {
    ...input,
    id: input.id ?? nextId(env),
    windowMonths: input.windowMonths ?? 3,
    bookingLeadWeeks: input.bookingLeadWeeks ?? 6,
    active: input.active ?? true,
    ...(firstWindowStart ? { firstWindowStart } : {}),
    updatedAt: nowIso(env),
  }
}

export function addCheckup(doc: FamilyDoc, input: CheckupInput, env: Env = {}): FamilyDoc {
  return { ...doc, checkups: [...doc.checkups, newCheckup(input, env)] }
}

export function updateCheckup(
  doc: FamilyDoc,
  checkupId: string,
  patch: Partial<Omit<Checkup, 'id' | 'personId' | 'updatedAt'>>,
  env: Env = {},
): FamilyDoc {
  const checkup = doc.checkups.find((c) => c.id === checkupId)
  if (!checkup) return doc
  const updated: Checkup = { ...checkup, ...patch, updatedAt: nowIso(env) }
  return { ...doc, checkups: replaceById(doc.checkups, updated) }
}

/** Removes the check-up with its occurrences (each leaves a tombstone). */
export function removeCheckup(doc: FamilyDoc, checkupId: string, env: Env = {}): FamilyDoc {
  if (!doc.checkups.some((c) => c.id === checkupId)) return doc
  const occurrenceIds = doc.occurrences.filter((o) => o.checkupId === checkupId).map((o) => o.id)
  return {
    ...doc,
    checkups: doc.checkups.filter((c) => c.id !== checkupId),
    occurrences: doc.occurrences.filter((o) => o.checkupId !== checkupId),
    tombstones: withTombstones(doc.tombstones, [checkupId, ...occurrenceIds], nowIso(env)),
  }
}

// --- Occurrences -------------------------------------------------------------------------

type OccurrenceChange = Pick<Occurrence, 'status'> &
  Partial<Pick<Occurrence, 'appointmentDate' | 'doneDate' | 'skipReason'>>

/**
 * Applies a change to the occurrence of the check-up's current due window; creates it if the
 * user acts on a window that has none yet. Returns the doc unchanged when nothing is due.
 */
function applyToCurrentWindow(
  doc: FamilyDoc,
  checkupId: string,
  env: Env,
  change: (existing: Occurrence | undefined, today: string) => OccurrenceChange,
): FamilyDoc {
  const checkup = doc.checkups.find((c) => c.id === checkupId)
  if (!checkup) return doc
  const today = todayOf(env.now)
  const due = computeDue(checkup, doc.occurrences, today)
  if (!due) return doc
  const base: Occurrence = due.occurrence ?? {
    id: nextId(env),
    checkupId,
    windowStart: due.windowStart,
    status: 'booked',
    updatedAt: nowIso(env),
  }
  const { appointmentDate: _a, doneDate: _d, skipReason: _s, ...kept } = base
  const updated: Occurrence = { ...kept, ...change(due.occurrence, today), updatedAt: nowIso(env) }
  return {
    ...doc,
    occurrences: due.occurrence
      ? replaceById(doc.occurrences, updated)
      : [...doc.occurrences, updated],
  }
}

/** Books (or rebooks) the current window for `date`. */
export function book(doc: FamilyDoc, checkupId: string, date: string, env: Env = {}): FamilyDoc {
  return applyToCurrentWindow(doc, checkupId, env, () => ({
    status: 'booked',
    appointmentDate: date,
  }))
}

/** Marks the current window done on `date` (default: the appointment, else today). */
export function markDone(
  doc: FamilyDoc,
  checkupId: string,
  date?: string,
  env: Env = {},
): FamilyDoc {
  return applyToCurrentWindow(doc, checkupId, env, (existing, today) => {
    const doneDate = date ?? existing?.appointmentDate ?? today
    return {
      status: 'done',
      doneDate,
      ...(existing?.appointmentDate ? { appointmentDate: existing.appointmentDate } : {}),
    }
  })
}

/** Skips the current window; a booked appointment is dropped. */
export function skip(doc: FamilyDoc, checkupId: string, reason?: string, env: Env = {}): FamilyDoc {
  return applyToCurrentWindow(doc, checkupId, env, () => ({
    status: 'skipped',
    ...(reason ? { skipReason: reason } : {}),
  }))
}

/** Deletes an occurrence (leaves a tombstone). Marking done/skipped is undone this way. */
export function undo(doc: FamilyDoc, occurrenceId: string, env: Env = {}): FamilyDoc {
  if (!doc.occurrences.some((o) => o.id === occurrenceId)) return doc
  return {
    ...doc,
    occurrences: doc.occurrences.filter((o) => o.id !== occurrenceId),
    tombstones: withTombstones(doc.tombstones, [occurrenceId], nowIso(env)),
  }
}

// --- Settings ----------------------------------------------------------------------------

export function setReminderHour(doc: FamilyDoc, hour: number, env: Env = {}): FamilyDoc {
  return { ...doc, settings: { reminderHour: hour, updatedAt: nowIso(env) } }
}
