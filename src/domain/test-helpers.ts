import type { Checkup, FamilyDoc, Occurrence, Person } from './model'
import { emptyDoc } from './model'

const T0 = '2026-01-01T00:00:00.000Z'

export function person(overrides: Partial<Person> = {}): Person {
  return { id: 'p1', name: 'Lena', updatedAt: T0, ...overrides }
}

export function checkup(overrides: Partial<Checkup> = {}): Checkup {
  return {
    id: 'c1',
    personId: 'p1',
    title: 'Zahnarzt',
    schedule: { kind: 'interval', months: 6 },
    windowMonths: 3,
    bookingLeadWeeks: 6,
    active: true,
    updatedAt: T0,
    ...overrides,
  }
}

export function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'o1',
    checkupId: 'c1',
    windowStart: '2027-01-01',
    status: 'booked',
    updatedAt: T0,
    ...overrides,
  }
}

export function docWith(parts: Partial<FamilyDoc>): FamilyDoc {
  return { ...emptyDoc(), ...parts }
}

/** A counter-based id source for deterministic tests. */
export function counterIds(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

/** A local-noon `Date` for the given calendar day (so `today(now)` is that day in any zone). */
export function noon(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12, 0, 0)
}
