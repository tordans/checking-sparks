import { describe, expect, it } from 'vitest'
import { buildReminders, localDateTimeToIso } from './reminders'
import type { ToIso } from './reminders'
import { checkup, docWith, occurrence, person } from './test-helpers'

/** Fixed offset, independent of the machine's time zone. */
const toIso: ToIso = (date, hour) => `${date}T${String(hour).padStart(2, '0')}:00:00+01:00`

// interval 6, window 2027-01-01..2027-03-31, booking opens 2026-11-20
const baseDoc = (extra: Parameters<typeof docWith>[0] = {}) =>
  docWith({
    persons: [person({ id: 'p1', name: 'Lena' })],
    checkups: [checkup({ id: 'c1', firstWindowStart: '2027-01-01', practice: 'Dr. Weiß' })],
    ...extra,
  })

const ids = (doc: ReturnType<typeof baseDoc>, today: string) =>
  buildReminders(doc, today, 9, toIso).map((r) => r.id)

describe('book-open and deadline', () => {
  it('starts at bookingStart and repeats weekly, at most 8 times', () => {
    const reminders = buildReminders(baseDoc(), '2026-11-01', 9, toIso)
    const bookOpen = reminders.filter((r) => r.id.includes(':book-open:'))
    expect(bookOpen.map((r) => r.id.split(':').at(-1))).toEqual([
      '2026-11-20',
      '2026-11-27',
      '2026-12-04',
      '2026-12-11',
      '2026-12-18',
      '2026-12-25',
      '2027-01-01',
      '2027-01-08',
    ])
  })

  it('uses the specified texts, ids, path and time', () => {
    const [first] = buildReminders(baseDoc(), '2026-11-20', 9, toIso)
    expect(first).toEqual({
      id: 'c1:2027-01-01:book-open:2026-11-20',
      at: '2026-11-20T09:00:00+01:00',
      title: 'Lena: Zahnarzt buchen',
      body: 'Termin bis 31.03. machen.',
      path: '/person/p1/vorsorge/c1',
    })
  })

  it('adds a deadline reminder 14 days before windowEnd', () => {
    const deadline = buildReminders(baseDoc(), '2027-02-01', 9, toIso)
    expect(deadline).toEqual([
      {
        id: 'c1:2027-01-01:deadline:2027-03-17',
        at: '2027-03-17T09:00:00+01:00',
        title: 'Lena: Zahnarzt – nur noch 2 Wochen',
        body: 'Termin bis 31.03. machen.',
        path: '/person/p1/vorsorge/c1',
      },
    ])
  })

  it("omits reminders in the past but keeps today's", () => {
    // book-open dates: 11-20, 11-27, 12-04, ...; today is 12-04
    const result = ids(baseDoc(), '2026-12-04')
    expect(result.some((id) => id.endsWith('book-open:2026-11-27'))).toBe(false)
    expect(result.some((id) => id.endsWith('book-open:2026-12-04'))).toBe(true)
  })

  it('uses the configured reminder hour', () => {
    const [first] = buildReminders(baseDoc(), '2026-11-20', 7, toIso)
    expect(first?.at).toBe('2026-11-20T07:00:00+01:00')
  })

  it('sends nothing for overdue check-ups', () => {
    expect(ids(baseDoc(), '2027-04-02')).toEqual([])
  })

  it('has stable ids across calls', () => {
    expect(ids(baseDoc(), '2026-12-01')).toEqual(ids(baseDoc(), '2026-12-01'))
  })

  it('keeps the ids of surviving reminders when today moves on', () => {
    const early = ids(baseDoc(), '2026-11-20')
    const later = ids(baseDoc(), '2026-12-11')
    for (const id of later) expect(early).toContain(id)
  })
})

describe('booked', () => {
  const booked = (appointmentDate: string) =>
    baseDoc({ occurrences: [occurrence({ checkupId: 'c1', appointmentDate })] })

  it('stops booking reminders and plans day-before and confirm', () => {
    const reminders = buildReminders(booked('2027-02-10'), '2027-01-15', 9, toIso)
    expect(reminders).toEqual([
      {
        id: 'c1:2027-01-01:day-before:2027-02-09',
        at: '2027-02-09T18:00:00+01:00',
        title: 'Lena: morgen Zahnarzt',
        body: 'Dr. Weiß',
        path: '/person/p1/vorsorge/c1',
      },
      {
        id: 'c1:2027-01-01:confirm:2027-02-11',
        at: '2027-02-11T09:00:00+01:00',
        title: 'Lena: War der Zahnarzt-Termin?',
        body: expect.any(String),
        path: '/person/p1/vorsorge/c1?action=done',
      },
    ])
  })

  it('has no booking reminders at all while booked', () => {
    const all = ids(booked('2027-02-10'), '2026-11-01')
    expect(all.filter((id) => id.includes('book-open') || id.includes('deadline'))).toEqual([])
  })

  it('day-before body is empty without a practice', () => {
    const doc = docWith({
      persons: [person()],
      checkups: [checkup({ firstWindowStart: '2027-01-01' })],
      occurrences: [occurrence({ appointmentDate: '2027-02-10' })],
    })
    const dayBefore = buildReminders(doc, '2027-01-15', 9, toIso).find((r) =>
      r.id.includes('day-before'),
    )
    expect(dayBefore?.body).toBe('')
  })

  it('skips day-before when the appointment is today, keeps confirm for tomorrow', () => {
    const result = ids(booked('2027-02-10'), '2027-02-10')
    expect(result).toEqual(['c1:2027-01-01:confirm:2027-02-11'])
  })

  it('keeps the confirm reminder on the day it is due (state confirm)', () => {
    expect(ids(booked('2027-02-10'), '2027-02-11')).toEqual(['c1:2027-01-01:confirm:2027-02-11'])
  })

  it('drops the confirm reminder after its day', () => {
    expect(ids(booked('2027-02-10'), '2027-02-12')).toEqual([])
  })

  it('nothing remains after the appointment was marked done (next window is far away)', () => {
    const done = baseDoc({
      occurrences: [
        occurrence({
          checkupId: 'c1',
          status: 'done',
          appointmentDate: '2027-02-10',
          doneDate: '2027-02-10',
        }),
      ],
    })
    // next window starts 2027-08-10, booking opens 2027-06-29
    const reminders = ids(done, '2027-02-12')
    expect(reminders[0]).toBe('c1:2027-08-10:book-open:2027-06-29')
    expect(reminders.every((id) => !id.includes('confirm'))).toBe(true)
  })
})

describe('horizon, scope', () => {
  it('omits reminders beyond 400 days', () => {
    const far = baseDoc({
      checkups: [checkup({ id: 'c1', firstWindowStart: '2028-06-01' })],
    })
    // booking opens 2028-04-20; today 2026-11-01 + 400 days = 2027-12-06
    expect(ids(far, '2026-11-01')).toEqual([])
  })

  it('includes reminders exactly on day 400 and not after', () => {
    // bookingStart 2026-11-20 = 2025-10-16 + 400 days
    expect(ids(baseDoc(), '2025-10-16')).toEqual(['c1:2027-01-01:book-open:2026-11-20'])
    expect(ids(baseDoc(), '2025-10-15')).toEqual([])
  })

  it('ignores inactive check-ups and unknown persons', () => {
    const doc = docWith({
      persons: [person()],
      checkups: [
        checkup({ id: 'c1', firstWindowStart: '2027-01-01', active: false }),
        checkup({ id: 'c2', personId: 'nobody', firstWindowStart: '2027-01-01' }),
      ],
    })
    expect(buildReminders(doc, '2026-12-01', 9, toIso)).toEqual([])
  })

  it('sorts by time', () => {
    const doc = baseDoc({
      checkups: [
        checkup({ id: 'c1', firstWindowStart: '2027-01-01' }),
        checkup({ id: 'c2', firstWindowStart: '2027-01-01' }),
      ],
    })
    const times = buildReminders(doc, '2026-11-01', 9, toIso).map((r) => r.at)
    expect(times).toEqual([...times].sort())
  })

  it('covers seasonal check-ups', () => {
    const doc = docWith({
      persons: [person({ name: 'Opa' })],
      checkups: [
        checkup({
          id: 'flu',
          title: 'Grippeimpfung',
          schedule: { kind: 'seasonal', startMonth: 10, endMonth: 12 },
        }),
      ],
    })
    const [first] = buildReminders(doc, '2026-08-01', 9, toIso)
    expect(first).toMatchObject({
      id: 'flu:2026-10-01:book-open:2026-08-20',
      title: 'Opa: Grippeimpfung buchen',
      body: 'Termin bis 31.12. machen.',
    })
  })
})

describe('localDateTimeToIso (default)', () => {
  it('produces local time on the given date with a UTC offset', () => {
    const iso = localDateTimeToIso('2027-03-01', 9)
    expect(iso).toMatch(/^2027-03-01T09:00:00([+-]\d{2}:\d{2}|Z)$/)
    expect(new Date(iso).getHours()).toBe(9)
    expect(new Date(iso).getDate()).toBe(1)
  })

  it('is the default of buildReminders', () => {
    const [first] = buildReminders(baseDoc(), '2026-11-20', 9)
    expect(first?.at).toBe(localDateTimeToIso('2026-11-20', 9))
  })
})
