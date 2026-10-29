import { describe, expect, it } from 'vitest'
import {
  addCheckup,
  addPerson,
  book,
  markDone,
  removeCheckup,
  removePerson,
  setReminderHour,
  skip,
  undo,
  updateCheckup,
  updatePerson,
} from './actions'
import { parseDoc } from './model'
import type { FamilyDoc } from './model'
import { computeDue } from './schedule'
import { checkup, counterIds, docWith, noon, occurrence, person } from './test-helpers'

const now = noon('2027-01-15')
const env = () => ({ now, newId: counterIds() })

function expectValid(doc: FamilyDoc) {
  expect(parseDoc(JSON.parse(JSON.stringify(doc))).success).toBe(true)
}

describe('persons', () => {
  it('addPerson assigns id and updatedAt', () => {
    const doc = addPerson(docWith({}), { name: 'Lena', birthDate: '2020-05-01' }, env())
    expect(doc.persons).toEqual([
      { id: 'id-1', name: 'Lena', birthDate: '2020-05-01', updatedAt: now.toISOString() },
    ])
    expectValid(doc)
  })

  it('addPerson keeps a caller-provided id', () => {
    const doc = addPerson(docWith({}), { id: 'mine', name: 'Lena' }, env())
    expect(doc.persons[0]?.id).toBe('mine')
  })

  it('uses crypto.randomUUID by default', () => {
    const doc = addPerson(docWith({}), { name: 'Lena' })
    expect(doc.persons[0]?.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('updatePerson patches and bumps updatedAt, leaving others alone', () => {
    const base = docWith({ persons: [person(), person({ id: 'p2', name: 'Jonas' })] })
    const doc = updatePerson(base, 'p1', { name: 'Lena M.', sex: 'w' }, env())
    expect(doc.persons[0]).toMatchObject({
      name: 'Lena M.',
      sex: 'w',
      updatedAt: now.toISOString(),
    })
    expect(doc.persons[1]).toBe(base.persons[1])
  })

  it('updatePerson with an unknown id returns the same doc', () => {
    const base = docWith({ persons: [person()] })
    expect(updatePerson(base, 'nope', { name: 'x' }, env())).toBe(base)
  })

  it('does not mutate its input', () => {
    const base = docWith({ persons: [person()] })
    const snapshot = JSON.stringify(base)
    updatePerson(base, 'p1', { name: 'Other' }, env())
    removePerson(base, 'p1', env())
    expect(JSON.stringify(base)).toBe(snapshot)
  })

  it('removePerson removes check-ups and occurrences and leaves tombstones for all', () => {
    const base = docWith({
      persons: [person(), person({ id: 'p2' })],
      checkups: [checkup({ id: 'c1' }), checkup({ id: 'c2', personId: 'p2' })],
      occurrences: [
        occurrence({ id: 'o1', checkupId: 'c1' }),
        occurrence({ id: 'o2', checkupId: 'c2' }),
      ],
    })
    const doc = removePerson(base, 'p1', env())
    expect(doc.persons.map((p) => p.id)).toEqual(['p2'])
    expect(doc.checkups.map((c) => c.id)).toEqual(['c2'])
    expect(doc.occurrences.map((o) => o.id)).toEqual(['o2'])
    expect(doc.tombstones.map((t) => t.id).sort()).toEqual(['c1', 'o1', 'p1'])
    expect(doc.tombstones.every((t) => t.deletedAt === now.toISOString())).toBe(true)
    expectValid(doc)
  })

  it('removePerson with an unknown id returns the same doc', () => {
    const base = docWith({})
    expect(removePerson(base, 'nope', env())).toBe(base)
  })
})

describe('check-ups', () => {
  it('addCheckup fills defaults and starts an interval today', () => {
    const doc = addCheckup(
      docWith({ persons: [person()] }),
      { personId: 'p1', title: 'Zahnarzt', schedule: { kind: 'interval', months: 6 } },
      env(),
    )
    expect(doc.checkups[0]).toEqual({
      id: 'id-1',
      personId: 'p1',
      title: 'Zahnarzt',
      schedule: { kind: 'interval', months: 6 },
      windowMonths: 3,
      bookingLeadWeeks: 6,
      active: true,
      firstWindowStart: '2027-01-15',
      updatedAt: now.toISOString(),
    })
    expectValid(doc)
  })

  it('addCheckup keeps explicit values and sets no firstWindowStart for non-intervals', () => {
    const doc = addCheckup(
      docWith({}),
      {
        personId: 'p1',
        title: 'Grippe',
        schedule: { kind: 'seasonal', startMonth: 10, endMonth: 12, everyYears: 1 },
        windowMonths: 2,
        bookingLeadWeeks: 4,
      },
      env(),
    )
    expect(doc.checkups[0]).toMatchObject({ windowMonths: 2, bookingLeadWeeks: 4 })
    expect(doc.checkups[0]).not.toHaveProperty('firstWindowStart')
  })

  it('updateCheckup patches and bumps updatedAt', () => {
    const base = docWith({ checkups: [checkup()] })
    const doc = updateCheckup(base, 'c1', { practice: 'Dr. Weiß', active: false }, env())
    expect(doc.checkups[0]).toMatchObject({
      practice: 'Dr. Weiß',
      active: false,
      updatedAt: now.toISOString(),
    })
    expect(updateCheckup(base, 'nope', {}, env())).toBe(base)
  })

  it('removeCheckup removes its occurrences and leaves tombstones', () => {
    const base = docWith({
      checkups: [checkup({ id: 'c1' }), checkup({ id: 'c2' })],
      occurrences: [
        occurrence({ id: 'o1', checkupId: 'c1' }),
        occurrence({ id: 'o2', checkupId: 'c2' }),
      ],
    })
    const doc = removeCheckup(base, 'c1', env())
    expect(doc.checkups.map((c) => c.id)).toEqual(['c2'])
    expect(doc.occurrences.map((o) => o.id)).toEqual(['o2'])
    expect(doc.tombstones.map((t) => t.id).sort()).toEqual(['c1', 'o1'])
    expect(removeCheckup(base, 'nope', env())).toBe(base)
  })

  it('replaces an older tombstone for the same id instead of duplicating it', () => {
    const base = docWith({
      checkups: [checkup()],
      tombstones: [{ id: 'c1', deletedAt: '2020-01-01T00:00:00.000Z' }],
    })
    const doc = removeCheckup(base, 'c1', env())
    expect(doc.tombstones).toEqual([{ id: 'c1', deletedAt: now.toISOString() }])
  })
})

describe('occurrence actions', () => {
  // interval 6, window 2027-01-01..2027-03-31, today 2027-01-15 -> state 'book'
  const base = () =>
    docWith({ persons: [person()], checkups: [checkup({ firstWindowStart: '2027-01-01' })] })

  it('book creates a booked occurrence for the current window', () => {
    const doc = book(base(), 'c1', '2027-02-10', env())
    expect(doc.occurrences).toEqual([
      {
        id: 'id-1',
        checkupId: 'c1',
        windowStart: '2027-01-01',
        status: 'booked',
        appointmentDate: '2027-02-10',
        updatedAt: now.toISOString(),
      },
    ])
    expect(computeDue(doc.checkups[0]!, doc.occurrences, '2027-01-15')?.state).toBe('booked')
    expectValid(doc)
  })

  it('rebooking updates the same occurrence', () => {
    const once = book(base(), 'c1', '2027-02-10', env())
    const twice = book(once, 'c1', '2027-02-24', env())
    expect(twice.occurrences).toHaveLength(1)
    expect(twice.occurrences[0]).toMatchObject({ id: 'id-1', appointmentDate: '2027-02-24' })
  })

  it('markDone on a booking keeps the appointment and uses it as done date', () => {
    const doc = markDone(book(base(), 'c1', '2027-02-10', env()), 'c1', undefined, env())
    expect(doc.occurrences).toHaveLength(1)
    expect(doc.occurrences[0]).toMatchObject({
      status: 'done',
      appointmentDate: '2027-02-10',
      doneDate: '2027-02-10',
    })
  })

  it('markDone with an explicit date wins over the appointment', () => {
    const doc = markDone(book(base(), 'c1', '2027-02-10', env()), 'c1', '2027-02-12', env())
    expect(doc.occurrences[0]).toMatchObject({
      doneDate: '2027-02-12',
      appointmentDate: '2027-02-10',
    })
  })

  it('markDone without booking creates a done occurrence dated today', () => {
    const doc = markDone(base(), 'c1', undefined, env())
    expect(doc.occurrences[0]).toMatchObject({
      status: 'done',
      doneDate: '2027-01-15',
      windowStart: '2027-01-01',
    })
    expect(doc.occurrences[0]).not.toHaveProperty('appointmentDate')
    expectValid(doc)
  })

  it('markDone moves the check-up to the next window', () => {
    const doc = markDone(base(), 'c1', undefined, env())
    const due = computeDue(doc.checkups[0]!, doc.occurrences, '2027-01-16')
    expect(due).toMatchObject({ windowStart: '2027-07-15', state: 'upcoming' })
  })

  it('skip records the reason and drops a booked appointment', () => {
    const booked = book(base(), 'c1', '2027-02-10', env())
    const doc = skip(booked, 'c1', 'zu teuer', env())
    expect(doc.occurrences).toHaveLength(1)
    expect(doc.occurrences[0]).toMatchObject({ status: 'skipped', skipReason: 'zu teuer' })
    expect(doc.occurrences[0]).not.toHaveProperty('appointmentDate')
    // anchors on windowEnd 2027-03-31 + 6 months
    expect(computeDue(doc.checkups[0]!, doc.occurrences, '2027-01-16')?.windowStart).toBe(
      '2027-09-30',
    )
  })

  it('skip without reason omits skipReason', () => {
    const doc = skip(base(), 'c1', undefined, env())
    expect(doc.occurrences[0]).not.toHaveProperty('skipReason')
  })

  it('undo deletes the occurrence, leaves a tombstone and restores the previous window', () => {
    const done = markDone(base(), 'c1', undefined, env())
    const doc = undo(done, 'id-1', env())
    expect(doc.occurrences).toEqual([])
    expect(doc.tombstones).toEqual([{ id: 'id-1', deletedAt: now.toISOString() }])
    expect(computeDue(doc.checkups[0]!, doc.occurrences, '2027-01-16')?.windowStart).toBe(
      '2027-01-01',
    )
  })

  it('actions are no-ops for unknown check-ups, occurrences or when nothing is due', () => {
    const b = base()
    expect(book(b, 'nope', '2027-02-10', env())).toBe(b)
    expect(markDone(b, 'nope', undefined, env())).toBe(b)
    expect(skip(b, 'nope', undefined, env())).toBe(b)
    expect(undo(b, 'nope', env())).toBe(b)
    const inactive = docWith({ checkups: [checkup({ active: false })] })
    expect(book(inactive, 'c1', '2027-02-10', env())).toBe(inactive)
  })

  it('a once check-up disappears from the due list after markDone', () => {
    const once = docWith({
      checkups: [
        checkup({ schedule: { kind: 'once', windowStart: '2027-01-01', windowEnd: '2027-06-30' } }),
      ],
    })
    const doc = markDone(once, 'c1', undefined, env())
    expect(computeDue(doc.checkups[0]!, doc.occurrences, '2027-01-16')).toBeNull()
  })
})

describe('settings', () => {
  it('setReminderHour sets hour and updatedAt', () => {
    const doc = setReminderHour(docWith({}), 18, env())
    expect(doc.settings).toEqual({ reminderHour: 18, updatedAt: now.toISOString() })
  })
})
