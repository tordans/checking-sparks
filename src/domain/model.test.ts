import { describe, expect, it } from 'vitest'
import { emptyDoc, parseDoc } from './model'
import { checkup, docWith, occurrence, person } from './test-helpers'

describe('emptyDoc', () => {
  it('is a valid v1 document with default reminder hour 9', () => {
    const result = parseDoc(emptyDoc())
    expect(result.success).toBe(true)
    expect(emptyDoc().settings.reminderHour).toBe(9)
  })
})

describe('parseDoc', () => {
  it('round-trips a full document through JSON', () => {
    const doc = docWith({
      persons: [person({ birthDate: '2020-02-29', sex: 'w', color: '#ff0000' })],
      checkups: [
        checkup(),
        checkup({
          id: 'c2',
          schedule: { kind: 'seasonal', startMonth: 11, endMonth: 2 },
        }),
        checkup({
          id: 'c3',
          schedule: { kind: 'once', windowStart: '2027-03-15', windowEnd: '2027-07-15' },
        }),
      ],
      occurrences: [occurrence({ appointmentDate: '2027-02-10' })],
      tombstones: [{ id: 'x', deletedAt: '2026-05-05T10:00:00.000Z' }],
    })
    const result = parseDoc(JSON.parse(JSON.stringify(doc)))
    expect(result.success).toBe(true)
    expect(result.data).toEqual(doc)
  })

  it('fills defaults for window length, lead weeks and active', () => {
    const raw = {
      ...emptyDoc(),
      checkups: [
        {
          id: 'c1',
          personId: 'p1',
          title: 'Zahnarzt',
          schedule: { kind: 'interval', months: 6 },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    const result = parseDoc(raw)
    expect(result.data?.checkups[0]).toMatchObject({
      windowMonths: 3,
      bookingLeadWeeks: 6,
      active: true,
    })
  })

  it.each(['2027-02-30', '2027-2-3', '03.02.2027', '2027-02-03T10:00:00Z'])(
    'rejects the date %s',
    (birthDate) => {
      const doc = docWith({ persons: [person({ birthDate })] })
      expect(parseDoc(doc).success).toBe(false)
    },
  )

  it('rejects an unknown schema version', () => {
    expect(parseDoc({ ...emptyDoc(), schemaVersion: 2 }).success).toBe(false)
  })

  it('rejects out-of-range values', () => {
    const badHour = docWith({ settings: { reminderHour: 24, updatedAt: '2026-01-01T00:00:00Z' } })
    expect(parseDoc(badHour).success).toBe(false)
    const badMonth = docWith({
      checkups: [checkup({ schedule: { kind: 'seasonal', startMonth: 13, endMonth: 2 } })],
    })
    expect(parseDoc(badMonth).success).toBe(false)
    const badStatus = docWith({ occurrences: [occurrence({ status: 'maybe' as 'done' })] })
    expect(parseDoc(badStatus).success).toBe(false)
  })

  it('strips the removed everyYears field of old documents', () => {
    const schedule = { kind: 'seasonal', startMonth: 10, endMonth: 12, everyYears: 2 }
    const raw = { ...docWith({ checkups: [checkup()] }) }
    raw.checkups = [{ ...raw.checkups[0]!, schedule } as never]
    const result = parseDoc(raw)
    expect(result.success).toBe(true)
    expect(result.data?.checkups[0]?.schedule).toEqual({
      kind: 'seasonal',
      startMonth: 10,
      endMonth: 12,
    })
  })

  it('rejects non-objects', () => {
    expect(parseDoc(null).success).toBe(false)
    expect(parseDoc('nope').success).toBe(false)
  })
})
