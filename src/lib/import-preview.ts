import { merge } from '@/domain/merge'
import type { FamilyDoc } from '@/domain/model'

interface Counts {
  persons: number
  checkups: number
  occurrences: number
}

export interface ImportPreview {
  merged: FamilyDoc
  added: Counts
  updated: Counts
  removed: Counts
  settingsChanged: boolean
}

type Collection = keyof Counts

const COLLECTIONS: Collection[] = ['persons', 'checkups', 'occurrences']

/** What merging an imported file into the current document would change. */
export function previewImport(current: FamilyDoc, incoming: FamilyDoc): ImportPreview {
  const merged = merge(current, incoming)
  const added: Counts = { persons: 0, checkups: 0, occurrences: 0 }
  const updated: Counts = { persons: 0, checkups: 0, occurrences: 0 }
  const removed: Counts = { persons: 0, checkups: 0, occurrences: 0 }
  for (const key of COLLECTIONS) {
    const before = new Map<string, string>(current[key].map((r) => [r.id, r.updatedAt]))
    const after = new Set(merged[key].map((r) => r.id))
    for (const record of merged[key]) {
      const was = before.get(record.id)
      if (was === undefined) added[key] += 1
      else if (was !== record.updatedAt) updated[key] += 1
    }
    for (const id of before.keys()) if (!after.has(id)) removed[key] += 1
  }
  return {
    merged,
    added,
    updated,
    removed,
    settingsChanged: merged.settings.updatedAt !== current.settings.updatedAt,
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** `2 Personen, 1 Vorsorge` – empty string when all counts are zero. */
export function describeCounts(counts: Counts): string {
  return [
    counts.persons ? plural(counts.persons, 'Person', 'Personen') : '',
    counts.checkups ? plural(counts.checkups, 'Vorsorge', 'Vorsorgen') : '',
    counts.occurrences ? plural(counts.occurrences, 'Termin', 'Termine') : '',
  ]
    .filter(Boolean)
    .join(', ')
}
