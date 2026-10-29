import type { FamilyDoc, Tombstone } from './model'

/** Tombstones older than this are dropped by `pruneTombstones`. */
const TOMBSTONE_MAX_AGE_DAYS = 180

/** Orders ISO timestamps by instant; equal instants fall back to the string for a total order. */
function compareTimestamps(a: string, b: string): number {
  const diff = Date.parse(a) - Date.parse(b)
  if (diff !== 0 && !Number.isNaN(diff)) return diff < 0 ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** JSON with sorted keys, so equal content always compares equal. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Newer `updatedAt` wins; on a tie the larger content wins (deterministic, order-independent). */
function newer<T extends { updatedAt: string }>(a: T, b: T): T {
  const byTime = compareTimestamps(a.updatedAt, b.updatedAt)
  if (byTime !== 0) return byTime > 0 ? a : b
  return stableStringify(a) >= stableStringify(b) ? a : b
}

function unionTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const byId = new Map<string, Tombstone>()
  for (const tombstone of [...a, ...b]) {
    const existing = byId.get(tombstone.id)
    const later =
      !existing || compareTimestamps(tombstone.deletedAt, existing.deletedAt) > 0
        ? tombstone
        : existing
    byId.set(tombstone.id, later)
  }
  return sortedById([...byId.values()])
}

function sortedById<T extends { id: string }>(items: T[]): T[] {
  return items.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** Union by id, newest wins, minus records deleted by a tombstone that is not older than them. */
function mergeRecords<T extends { id: string; updatedAt: string }>(
  a: T[],
  b: T[],
  tombstones: Map<string, Tombstone>,
): T[] {
  const byId = new Map<string, T>()
  for (const record of [...a, ...b]) {
    const existing = byId.get(record.id)
    byId.set(record.id, existing ? newer(existing, record) : record)
  }
  const alive = [...byId.values()].filter((record) => {
    const tombstone = tombstones.get(record.id)
    return !tombstone || compareTimestamps(record.updatedAt, tombstone.deletedAt) > 0
  })
  return sortedById(alive)
}

/**
 * Merges two copies of the family document: union of records by `id`, newer `updatedAt` wins,
 * tombstones delete records with `updatedAt <= deletedAt`. Commutative, associative and
 * idempotent. Record arrays of the result are sorted by `id`.
 */
export function merge(a: FamilyDoc, b: FamilyDoc): FamilyDoc {
  const tombstones = unionTombstones(a.tombstones, b.tombstones)
  const byId = new Map(tombstones.map((t) => [t.id, t]))
  return {
    schemaVersion: 1,
    persons: mergeRecords(a.persons, b.persons, byId),
    checkups: mergeRecords(a.checkups, b.checkups, byId),
    occurrences: mergeRecords(a.occurrences, b.occurrences, byId),
    tombstones,
    settings: newer(a.settings, b.settings),
  }
}

/** Drops tombstones older than 180 days. Not part of `merge`, so merge stays a pure lattice. */
export function pruneTombstones(doc: FamilyDoc, now: Date = new Date()): FamilyDoc {
  const cutoff = now.getTime() - TOMBSTONE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  return { ...doc, tombstones: doc.tombstones.filter((t) => Date.parse(t.deletedAt) >= cutoff) }
}

/** True when both documents hold the same content, ignoring record order. */
export function sameContent(a: FamilyDoc, b: FamilyDoc): boolean {
  return stableStringify(merge(a, a)) === stableStringify(merge(b, b))
}
