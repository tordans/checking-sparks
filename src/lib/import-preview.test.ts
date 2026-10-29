import { describe, expect, it } from 'vitest'
import { checkup, docWith, person } from '@/domain/test-helpers'
import { describeCounts, previewImport } from './import-preview'

describe('previewImport', () => {
  it('counts added, updated and removed records', () => {
    const current = docWith({
      persons: [person()],
      checkups: [checkup()],
    })
    const incoming = docWith({
      persons: [
        person({ name: 'Lena M.', updatedAt: '2026-02-01T00:00:00.000Z' }),
        person({ id: 'p2', name: 'Tom' }),
      ],
      tombstones: [{ id: 'c1', deletedAt: '2026-03-01T00:00:00.000Z' }],
    })
    const preview = previewImport(current, incoming)
    expect(preview.added).toEqual({ persons: 1, checkups: 0, occurrences: 0 })
    expect(preview.updated).toEqual({ persons: 1, checkups: 0, occurrences: 0 })
    expect(preview.removed).toEqual({ persons: 0, checkups: 1, occurrences: 0 })
    expect(preview.settingsChanged).toBe(false)
  })

  it('describes counts in German', () => {
    expect(describeCounts({ persons: 2, checkups: 1, occurrences: 0 })).toBe(
      '2 Personen, 1 Vorsorge',
    )
    expect(describeCounts({ persons: 0, checkups: 0, occurrences: 0 })).toBe('')
  })
})
