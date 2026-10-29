import { describe, expect, it } from 'vitest'
import { merge, pruneTombstones, sameContent } from './merge'
import { emptyDoc, parseDoc } from './model'
import type { FamilyDoc } from './model'
import { checkup, docWith, occurrence, person } from './test-helpers'

const t = (n: number) => `2026-03-0${n}T10:00:00.000Z`

describe('merge: records', () => {
  it('unions records by id', () => {
    const a = docWith({ persons: [person({ id: 'p1' })] })
    const b = docWith({ persons: [person({ id: 'p2', name: 'Jonas' })] })
    expect(merge(a, b).persons.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('the newer updatedAt wins', () => {
    const a = docWith({ persons: [person({ name: 'Alt', updatedAt: t(1) })] })
    const b = docWith({ persons: [person({ name: 'Neu', updatedAt: t(2) })] })
    expect(merge(a, b).persons[0]?.name).toBe('Neu')
    expect(merge(b, a).persons[0]?.name).toBe('Neu')
  })

  it('compares timestamps as instants, not strings', () => {
    // 11:00+02:00 is 09:00Z, which is earlier than 10:00Z although it sorts later as text
    const a = docWith({ persons: [person({ name: 'A', updatedAt: '2026-03-01T10:00:00.000Z' })] })
    const b = docWith({
      persons: [person({ name: 'B', updatedAt: '2026-03-01T11:00:00.000+02:00' })],
    })
    expect(merge(a, b).persons[0]?.name).toBe('A')
  })

  it('breaks ties deterministically regardless of argument order', () => {
    const a = docWith({ persons: [person({ name: 'Anna', updatedAt: t(1) })] })
    const b = docWith({ persons: [person({ name: 'Berta', updatedAt: t(1) })] })
    expect(merge(a, b)).toEqual(merge(b, a))
  })

  it('merges every collection', () => {
    const a = docWith({
      checkups: [checkup({ id: 'c1' })],
      occurrences: [occurrence({ id: 'o1' })],
    })
    const b = docWith({
      checkups: [checkup({ id: 'c2' })],
      occurrences: [occurrence({ id: 'o2' })],
    })
    const merged = merge(a, b)
    expect(merged.checkups.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(merged.occurrences.map((o) => o.id)).toEqual(['o1', 'o2'])
  })

  it('settings: newer wins', () => {
    const a = docWith({ settings: { reminderHour: 7, updatedAt: t(1) } })
    const b = docWith({ settings: { reminderHour: 20, updatedAt: t(2) } })
    expect(merge(a, b).settings.reminderHour).toBe(20)
    expect(merge(emptyDoc(), a).settings.reminderHour).toBe(7)
  })

  it('the empty document is the identity', () => {
    const a = docWith({ persons: [person()], checkups: [checkup()] })
    expect(merge(a, emptyDoc())).toEqual(merge(a, a))
  })
})

describe('merge: tombstones', () => {
  it('a tombstone removes a record that is not newer', () => {
    const a = docWith({ persons: [person({ updatedAt: t(1) })] })
    const b = docWith({ tombstones: [{ id: 'p1', deletedAt: t(2) }] })
    expect(merge(a, b).persons).toEqual([])
    expect(merge(b, a).persons).toEqual([])
  })

  it('removes a record changed at exactly deletedAt', () => {
    const a = docWith({ persons: [person({ updatedAt: t(2) })] })
    const b = docWith({ tombstones: [{ id: 'p1', deletedAt: t(2) }] })
    expect(merge(a, b).persons).toEqual([])
  })

  it('keeps a record edited after the deletion', () => {
    const a = docWith({ persons: [person({ updatedAt: t(3) })] })
    const b = docWith({ tombstones: [{ id: 'p1', deletedAt: t(2) }] })
    expect(merge(a, b).persons).toHaveLength(1)
  })

  it('unions tombstones, keeping the later deletedAt', () => {
    const a = docWith({
      tombstones: [
        { id: 'x', deletedAt: t(1) },
        { id: 'y', deletedAt: t(5) },
      ],
    })
    const b = docWith({ tombstones: [{ id: 'x', deletedAt: t(3) }] })
    expect(merge(a, b).tombstones).toEqual([
      { id: 'x', deletedAt: t(3) },
      { id: 'y', deletedAt: t(5) },
    ])
  })

  it('applies to checkups and occurrences too', () => {
    const a = docWith({
      checkups: [checkup({ updatedAt: t(1) })],
      occurrences: [occurrence({ updatedAt: t(1) })],
    })
    const b = docWith({
      tombstones: [
        { id: 'c1', deletedAt: t(2) },
        { id: 'o1', deletedAt: t(2) },
      ],
    })
    const merged = merge(a, b)
    expect(merged.checkups).toEqual([])
    expect(merged.occurrences).toEqual([])
  })
})

describe('pruneTombstones', () => {
  const now = new Date('2026-12-01T12:00:00.000Z')
  const doc = docWith({
    tombstones: [
      { id: 'old', deletedAt: '2026-05-01T00:00:00.000Z' }, // 214 days
      { id: 'edge', deletedAt: '2026-06-04T12:00:00.000Z' }, // exactly 180 days
      { id: 'new', deletedAt: '2026-11-30T00:00:00.000Z' },
    ],
  })

  it('drops tombstones older than 180 days', () => {
    expect(pruneTombstones(doc, now).tombstones.map((x) => x.id)).toEqual(['edge', 'new'])
  })

  it('does not touch the records', () => {
    const withRecords = { ...doc, persons: [person()] }
    expect(pruneTombstones(withRecords, now).persons).toEqual(withRecords.persons)
  })
})

describe('sameContent', () => {
  it('ignores record order', () => {
    const a = docWith({ persons: [person({ id: 'p1' }), person({ id: 'p2' })] })
    const b = docWith({ persons: [person({ id: 'p2' }), person({ id: 'p1' })] })
    expect(sameContent(a, b)).toBe(true)
  })

  it('detects differences', () => {
    const a = docWith({ persons: [person({ name: 'A' })] })
    const b = docWith({ persons: [person({ name: 'B' })] })
    expect(sameContent(a, b)).toBe(false)
  })
})

// --- Properties on randomly generated documents -------------------------------------------

/** Small deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

type Random = () => number
const pick = <T>(r: Random, items: readonly T[]): T => items[Math.floor(r() * items.length)]!
const chance = (r: Random, p: number) => r() < p

// Few ids and timestamps, so documents overlap and collide (incl. equal timestamps).
const STAMPS = [1, 2, 3, 4, 5].map(t)
const IDS = ['a', 'b', 'c', 'd']

function generateDoc(r: Random): FamilyDoc {
  const some = <T>(make: (id: string) => T): T[] =>
    IDS.filter(() => chance(r, 0.6)).map((id) => make(id))
  return {
    schemaVersion: 1,
    persons: some((id) =>
      person({ id: `p-${id}`, name: pick(r, ['Lena', 'Jonas']), updatedAt: pick(r, STAMPS) }),
    ),
    checkups: some((id) =>
      checkup({
        id: `c-${id}`,
        personId: `p-${pick(r, IDS)}`,
        title: pick(r, ['Zahnarzt', 'Hautkrebs']),
        updatedAt: pick(r, STAMPS),
      }),
    ),
    occurrences: some((id) =>
      occurrence({
        id: `o-${id}`,
        checkupId: `c-${pick(r, IDS)}`,
        status: pick(r, ['booked', 'done', 'skipped'] as const),
        updatedAt: pick(r, STAMPS),
      }),
    ),
    tombstones: IDS.flatMap((id) => ['p', 'c', 'o'].map((kind) => `${kind}-${id}`))
      .filter(() => chance(r, 0.15))
      .map((id) => ({ id, deletedAt: pick(r, STAMPS) })),
    settings: { reminderHour: Math.floor(r() * 24), updatedAt: pick(r, STAMPS) },
  }
}

const RUNS = 300

function forRandomTriples(check: (a: FamilyDoc, b: FamilyDoc, c: FamilyDoc) => void) {
  const r = seeded(20261029)
  for (let i = 0; i < RUNS; i += 1) check(generateDoc(r), generateDoc(r), generateDoc(r))
}

describe('merge: properties (random documents)', () => {
  it('generated documents are valid', () => {
    const r = seeded(1)
    for (let i = 0; i < 50; i += 1) expect(parseDoc(generateDoc(r)).success).toBe(true)
  })

  it('is commutative', () => {
    forRandomTriples((a, b) => expect(merge(a, b)).toEqual(merge(b, a)))
  })

  it('is idempotent', () => {
    forRandomTriples((a, b) => {
      const m = merge(a, b)
      expect(merge(m, m)).toEqual(m)
      expect(merge(m, a)).toEqual(m)
      expect(merge(m, b)).toEqual(m)
    })
  })

  it('is associative', () => {
    forRandomTriples((a, b, c) => expect(merge(merge(a, b), c)).toEqual(merge(a, merge(b, c))))
  })

  it('never resurrects a record covered by a tombstone', () => {
    forRandomTriples((a, b) => {
      const merged = merge(a, b)
      const deleted = new Map(merged.tombstones.map((x) => [x.id, x.deletedAt]))
      for (const record of [...merged.persons, ...merged.checkups, ...merged.occurrences]) {
        const deletedAt = deleted.get(record.id)
        if (deletedAt) expect(Date.parse(record.updatedAt)).toBeGreaterThan(Date.parse(deletedAt))
      }
    })
  })

  it('keeps the newest version of each surviving record', () => {
    forRandomTriples((a, b) => {
      const merged = merge(a, b)
      for (const record of merged.persons) {
        const versions = [...a.persons, ...b.persons].filter((p) => p.id === record.id)
        const newest = Math.max(...versions.map((p) => Date.parse(p.updatedAt)))
        expect(Date.parse(record.updatedAt)).toBe(newest)
      }
    })
  })
})
