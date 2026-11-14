import { describe, expect, it } from 'vitest'
import type { Checkup } from './model'
import { computeDue, dueForDoc, windowEndFor } from './schedule'
import { checkup, docWith, occurrence, person } from './test-helpers'

const interval6 = (overrides: Partial<Checkup> = {}) =>
  checkup({ firstWindowStart: '2027-01-01', ...overrides })

describe('computeDue: interval without history', () => {
  // window 2027-01-01..2027-03-31, booking opens 6 weeks earlier on 2026-11-20
  const c = interval6()

  it('computes window and booking start', () => {
    expect(computeDue(c, [], '2026-12-01')).toMatchObject({
      windowStart: '2027-01-01',
      windowEnd: '2027-03-31',
      bookingStart: '2026-11-20',
    })
  })

  it('is upcoming before the booking window opens', () => {
    expect(computeDue(c, [], '2026-11-19')?.state).toBe('upcoming')
  })

  it('is book from bookingStart through windowEnd', () => {
    expect(computeDue(c, [], '2026-11-20')?.state).toBe('book')
    expect(computeDue(c, [], '2027-01-15')?.state).toBe('book')
    expect(computeDue(c, [], '2027-03-31')?.state).toBe('book')
  })

  it('is overdue after windowEnd', () => {
    expect(computeDue(c, [], '2027-04-01')?.state).toBe('overdue')
  })

  it('falls back to the day of updatedAt when firstWindowStart is missing', () => {
    const due = computeDue(checkup({ updatedAt: '2026-06-10T08:00:00.000Z' }), [], '2026-06-10')
    expect(due?.windowStart).toBe('2026-06-10')
  })

  it('honors bookingLeadWeeks', () => {
    expect(computeDue(interval6({ bookingLeadWeeks: 0 }), [], '2026-12-31')?.state).toBe('upcoming')
    expect(computeDue(interval6({ bookingLeadWeeks: 0 }), [], '2027-01-01')?.state).toBe('book')
  })
})

describe('computeDue: interval anchors', () => {
  it('anchors on doneDate: next start is anchor + months', () => {
    const done = occurrence({ status: 'done', doneDate: '2026-10-15', windowStart: '2026-09-01' })
    const due = computeDue(interval6(), [done], '2026-11-01')
    expect(due).toMatchObject({ windowStart: '2027-04-15', windowEnd: '2027-07-14' })
    expect(due?.state).toBe('upcoming')
  })

  it('ignores firstWindowStart once an anchor exists', () => {
    const done = occurrence({ status: 'done', doneDate: '2030-01-01', windowStart: '2029-12-01' })
    expect(computeDue(interval6(), [done], '2030-01-02')?.windowStart).toBe('2030-07-01')
  })

  it('anchors on windowEnd of a skipped occurrence', () => {
    // skipped window 2026-01-01..2026-03-31 (3 months), interval 12
    const skipped = occurrence({ status: 'skipped', windowStart: '2026-01-01' })
    const c = interval6({ schedule: { kind: 'interval', months: 12 } })
    expect(computeDue(c, [skipped], '2026-06-01')?.windowStart).toBe('2027-03-31')
  })

  it('uses the most recent anchor among done and skipped', () => {
    const done = occurrence({
      id: 'o1',
      status: 'done',
      doneDate: '2026-01-10',
      windowStart: '2026-01-01',
    })
    // skipped window 2026-04-01..2026-06-30 is later than the done date
    const skipped = occurrence({ id: 'o2', status: 'skipped', windowStart: '2026-04-01' })
    expect(computeDue(interval6(), [done, skipped], '2026-07-01')?.windowStart).toBe('2026-12-30')
    // reversed: an earlier skipped window does not beat a later done date
    const earlySkip = occurrence({ id: 'o3', status: 'skipped', windowStart: '2025-01-01' })
    expect(computeDue(interval6(), [done, earlySkip], '2026-07-01')?.windowStart).toBe('2026-07-10')
  })

  it('falls back to the appointment date when a done occurrence has no doneDate', () => {
    const done = occurrence({
      status: 'done',
      appointmentDate: '2026-02-01',
      windowStart: '2026-01-01',
    })
    expect(computeDue(interval6(), [done], '2026-03-01')?.windowStart).toBe('2026-08-01')
  })

  it('clamps at month end', () => {
    const done = occurrence({ status: 'done', doneDate: '2026-12-31', windowStart: '2026-10-01' })
    const c = interval6({ schedule: { kind: 'interval', months: 2 } })
    // Dec 31 + 2 months = Feb 28; window 3 months from Feb 28 ends May 27
    expect(computeDue(c, [done], '2027-01-05')).toMatchObject({
      windowStart: '2027-02-28',
      windowEnd: '2027-05-27',
    })
  })

  it('handles leap years', () => {
    const done = occurrence({ status: 'done', doneDate: '2023-08-31', windowStart: '2023-07-01' })
    const c = interval6({ schedule: { kind: 'interval', months: 6 }, windowMonths: 1 })
    // Aug 31 + 6 months = Feb 29, 2024 (leap); one-month window ends Mar 28
    expect(computeDue(c, [done], '2023-09-01')).toMatchObject({
      windowStart: '2024-02-29',
      windowEnd: '2024-03-28',
    })
    const done2 = occurrence({ status: 'done', doneDate: '2024-02-29', windowStart: '2024-01-01' })
    const yearly = interval6({ schedule: { kind: 'interval', months: 12 } })
    expect(computeDue(yearly, [done2], '2024-03-01')?.windowStart).toBe('2025-02-28')
  })

  it('ignores occurrences of other check-ups', () => {
    const other = occurrence({ checkupId: 'other', status: 'done', doneDate: '2026-10-15' })
    expect(computeDue(interval6(), [other], '2026-12-01')?.windowStart).toBe('2027-01-01')
  })
})

describe('computeDue: booked, confirm', () => {
  const c = interval6()
  const booked = (appointmentDate: string) =>
    occurrence({ windowStart: '2027-01-01', status: 'booked', appointmentDate })

  it('is booked until the appointment day inclusive', () => {
    expect(computeDue(c, [booked('2027-02-10')], '2027-01-20')?.state).toBe('booked')
    expect(computeDue(c, [booked('2027-02-10')], '2027-02-10')?.state).toBe('booked')
  })

  it('exposes the occurrence', () => {
    expect(computeDue(c, [booked('2027-02-10')], '2027-01-20')?.occurrence?.id).toBe('o1')
  })

  it('is confirm the day after the appointment', () => {
    expect(computeDue(c, [booked('2027-02-10')], '2027-02-11')?.state).toBe('confirm')
  })

  it('stays confirm even after the window has ended', () => {
    expect(computeDue(c, [booked('2027-02-10')], '2027-06-01')?.state).toBe('confirm')
  })

  it('beats overdue and book', () => {
    expect(computeDue(c, [booked('2027-03-01')], '2026-11-25')?.state).toBe('booked')
  })

  it('ignores a booked occurrence of another window', () => {
    const stale = occurrence({ windowStart: '2026-01-01', appointmentDate: '2026-02-10' })
    const due = computeDue(c, [stale], '2027-01-20')
    expect(due?.state).toBe('book')
    expect(due?.occurrence).toBeUndefined()
  })

  it('picks the newest of several booked occurrences for the window', () => {
    const older = occurrence({
      id: 'o1',
      appointmentDate: '2027-02-01',
      updatedAt: '2026-12-01T00:00:00.000Z',
    })
    const newer = occurrence({
      id: 'o2',
      appointmentDate: '2027-02-20',
      updatedAt: '2026-12-05T00:00:00.000Z',
    })
    expect(computeDue(c, [older, newer], '2027-01-20')?.occurrence?.id).toBe('o2')
  })

  it('does not mistake the done occurrence for the next window it anchors', () => {
    // done early on 2026-10-01 for the window starting 2027-04-01; interval 6 -> next also 2027-04-01
    const done = occurrence({ status: 'done', doneDate: '2026-10-01', windowStart: '2027-04-01' })
    const due = computeDue(c, [done], '2027-04-05')
    expect(due?.windowStart).toBe('2027-04-01')
    expect(due?.occurrence).toBeUndefined()
    expect(due?.state).toBe('book')
  })
})

describe('computeDue: seasonal (Oct–Dec)', () => {
  const flu = checkup({
    id: 'flu',
    schedule: { kind: 'seasonal', startMonth: 10, endMonth: 12 },
  })

  it('without history: the current season while it runs', () => {
    expect(computeDue(flu, [], '2026-10-29')).toMatchObject({
      windowStart: '2026-10-01',
      windowEnd: '2026-12-31',
      bookingStart: '2026-08-20',
      state: 'book',
    })
  })

  it('without history: the next season once this one ended', () => {
    expect(computeDue(flu, [], '2027-01-05')).toMatchObject({
      windowStart: '2027-10-01',
      windowEnd: '2027-12-31',
      state: 'upcoming',
    })
  })

  it('without history: last day of the season still counts', () => {
    expect(computeDue(flu, [], '2026-12-31')?.windowStart).toBe('2026-10-01')
  })

  it('is upcoming until booking opens, book after', () => {
    expect(computeDue(flu, [], '2027-08-19')?.state).toBe('upcoming')
    expect(computeDue(flu, [], '2027-08-20')?.state).toBe('book')
  })

  it('anchor: next season starts the year after the anchor year', () => {
    const done = occurrence({
      checkupId: 'flu',
      status: 'done',
      doneDate: '2026-11-05',
      windowStart: '2026-10-01',
    })
    expect(computeDue(flu, [done], '2026-12-01')?.windowStart).toBe('2027-10-01')
  })

  it('anchor from a skipped season (windowEnd)', () => {
    const skipped = occurrence({ checkupId: 'flu', status: 'skipped', windowStart: '2026-10-01' })
    expect(computeDue(flu, [skipped], '2027-01-10')?.windowStart).toBe('2027-10-01')
  })

  it('is overdue after the season when nothing was done (anchor in the past)', () => {
    const done = occurrence({
      checkupId: 'flu',
      status: 'done',
      doneDate: '2024-11-05',
      windowStart: '2024-10-01',
    })
    expect(computeDue(flu, [done], '2026-01-10')).toMatchObject({
      windowStart: '2025-10-01',
      state: 'overdue',
    })
  })

  it('matches a booked occurrence by season start', () => {
    const booked = occurrence({
      checkupId: 'flu',
      windowStart: '2026-10-01',
      appointmentDate: '2026-11-10',
    })
    expect(computeDue(flu, [booked], '2026-10-29')?.state).toBe('booked')
    expect(computeDue(flu, [booked], '2026-11-11')?.state).toBe('confirm')
  })
})

describe('computeDue: seasonal wrapping the year end (Nov–Feb)', () => {
  const wrap = checkup({
    id: 'wrap',
    schedule: { kind: 'seasonal', startMonth: 11, endMonth: 2 },
  })

  it('in November: the season starting this year', () => {
    expect(computeDue(wrap, [], '2026-11-15')).toMatchObject({
      windowStart: '2026-11-01',
      windowEnd: '2027-02-28',
      state: 'book',
    })
  })

  it('in January: the season that started last year is still running', () => {
    expect(computeDue(wrap, [], '2027-01-15')).toMatchObject({
      windowStart: '2026-11-01',
      windowEnd: '2027-02-28',
    })
  })

  it('after the season: the next one, ending on a leap day', () => {
    expect(computeDue(wrap, [], '2027-03-01')).toMatchObject({
      windowStart: '2027-11-01',
      windowEnd: '2028-02-29',
      state: 'upcoming',
    })
  })

  it('a done date in January counts for the season that started the year before', () => {
    const done = occurrence({
      checkupId: 'wrap',
      status: 'done',
      doneDate: '2027-01-15',
      windowStart: '2026-11-01',
    })
    expect(computeDue(wrap, [done], '2027-02-01')?.windowStart).toBe('2027-11-01')
  })

  it('a done date in the first months of the season counts for that year', () => {
    const done = occurrence({
      checkupId: 'wrap',
      status: 'done',
      doneDate: '2026-11-20',
      windowStart: '2026-11-01',
    })
    expect(computeDue(wrap, [done], '2026-12-01')?.windowStart).toBe('2027-11-01')
  })

  it('a skipped wrapping season anchors on its windowEnd', () => {
    const skipped = occurrence({ checkupId: 'wrap', status: 'skipped', windowStart: '2026-11-01' })
    expect(computeDue(wrap, [skipped], '2027-01-15')?.windowStart).toBe('2027-11-01')
  })

  it('supports a one-month season', () => {
    const march = checkup({
      schedule: { kind: 'seasonal', startMonth: 3, endMonth: 3 },
    })
    expect(computeDue(march, [], '2027-03-10')).toMatchObject({
      windowStart: '2027-03-01',
      windowEnd: '2027-03-31',
    })
  })
})

describe('computeDue: once', () => {
  const u9 = checkup({
    id: 'u9',
    schedule: { kind: 'once', windowStart: '2027-03-15', windowEnd: '2027-07-15' },
  })

  it('uses the fixed window and has the usual states', () => {
    expect(computeDue(u9, [], '2027-01-01')).toMatchObject({
      windowStart: '2027-03-15',
      windowEnd: '2027-07-15',
      bookingStart: '2027-02-01',
      state: 'upcoming',
    })
    expect(computeDue(u9, [], '2027-02-01')?.state).toBe('book')
    expect(computeDue(u9, [], '2027-07-16')?.state).toBe('overdue')
  })

  it('is null once done', () => {
    const done = occurrence({ checkupId: 'u9', status: 'done', doneDate: '2027-04-01' })
    expect(computeDue(u9, [done], '2027-04-02')).toBeNull()
  })

  it('is null once skipped', () => {
    const skipped = occurrence({ checkupId: 'u9', status: 'skipped' })
    expect(computeDue(u9, [skipped], '2027-04-02')).toBeNull()
  })

  it('shows a booking even if its windowStart differs (window edited later)', () => {
    const booked = occurrence({
      checkupId: 'u9',
      windowStart: '2027-03-01',
      appointmentDate: '2027-05-01',
    })
    expect(computeDue(u9, [booked], '2027-04-01')?.state).toBe('booked')
  })
})

describe('computeDue: inactive', () => {
  it('is null', () => {
    expect(computeDue(interval6({ active: false }), [], '2027-01-01')).toBeNull()
  })
})

describe('windowEndFor', () => {
  it('is inclusive: windowMonths later minus one day', () => {
    expect(windowEndFor(interval6(), '2027-01-01')).toBe('2027-03-31')
    expect(windowEndFor(interval6({ windowMonths: 1 }), '2027-02-01')).toBe('2027-02-28')
  })
})

describe('dueForDoc', () => {
  const today = '2027-02-15'
  const doc = docWith({
    persons: [person({ id: 'p1', name: 'Lena' }), person({ id: 'p2', name: 'Jonas' })],
    checkups: [
      // book: window 2027-01-01..03-31
      checkup({ id: 'c-book', personId: 'p1', firstWindowStart: '2027-01-01' }),
      // overdue: window 2026-10-01..12-31
      checkup({ id: 'c-overdue', personId: 'p2', firstWindowStart: '2026-10-01' }),
      // upcoming: window 2027-09-01.., booking opens 2027-07-21
      checkup({ id: 'c-upcoming', personId: 'p1', firstWindowStart: '2027-09-01' }),
      // confirm: appointment yesterday
      checkup({ id: 'c-confirm', personId: 'p2', firstWindowStart: '2027-01-01' }),
      // booked: appointment in the future
      checkup({ id: 'c-booked', personId: 'p1', firstWindowStart: '2027-01-01' }),
      // book with later deadline
      checkup({
        id: 'c-book-late',
        personId: 'p2',
        firstWindowStart: '2027-02-01',
        windowMonths: 6,
      }),
      // not listed: inactive, unknown person
      checkup({ id: 'c-inactive', personId: 'p1', active: false }),
      checkup({ id: 'c-orphan', personId: 'nobody' }),
    ],
    occurrences: [
      occurrence({ id: 'o-confirm', checkupId: 'c-confirm', appointmentDate: '2027-02-14' }),
      occurrence({ id: 'o-booked', checkupId: 'c-booked', appointmentDate: '2027-02-20' }),
    ],
  })

  it('sorts by state precedence, then date, and attaches person and check-up', () => {
    const dues = dueForDoc(doc, today)
    expect(dues.map((d) => `${d.state}:${d.checkup.id}`)).toEqual([
      'confirm:c-confirm',
      'overdue:c-overdue',
      'book:c-book',
      'book:c-book-late',
      'booked:c-booked',
      'upcoming:c-upcoming',
    ])
    expect(dues[0]?.person.name).toBe('Jonas')
    expect(dues[2]?.person.name).toBe('Lena')
  })

  it('returns nothing for an empty document', () => {
    expect(dueForDoc(docWith({}), today)).toEqual([])
  })
})
