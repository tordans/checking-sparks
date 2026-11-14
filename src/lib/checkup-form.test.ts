import { describe, expect, it } from 'vitest'
import { checkup } from '@/domain/test-helpers'
import { fromFormValues, toFormValues } from './checkup-form'

const TODAY = '2026-10-29'

describe('checkup form values', () => {
  it('round-trips an interval check-up', () => {
    const original = checkup({ practice: 'Dr. Weiß', firstWindowStart: '2026-11-01' })
    const result = fromFormValues(toFormValues(original, TODAY))
    expect(result).toEqual({
      ok: true,
      fields: {
        title: 'Zahnarzt',
        practice: 'Dr. Weiß',
        phone: undefined,
        note: undefined,
        schedule: { kind: 'interval', months: 6 },
        windowMonths: 3,
        bookingLeadWeeks: 6,
        firstWindowStart: '2026-11-01',
        active: true,
      },
    })
  })

  it('switches to a seasonal schedule with defaults', () => {
    const values = { ...toFormValues(checkup(), TODAY), kind: 'seasonal' as const }
    const result = fromFormValues(values)
    expect(result.ok && result.fields.schedule).toEqual({
      kind: 'seasonal',
      startMonth: 10,
      endMonth: 12,
    })
    expect(result.ok && result.fields.firstWindowStart).toBeUndefined()
  })

  it('reports German errors', () => {
    const values = {
      ...toFormValues(checkup(), TODAY),
      title: ' ',
      months: '0',
      bookingLeadWeeks: 'x',
    }
    const result = fromFormValues(values)
    expect(result).toEqual({
      ok: false,
      errors: {
        title: 'Gib der Vorsorge einen Namen.',
        months: 'Eine Zahl ab 1.',
        bookingLeadWeeks: 'Eine Zahl von 0 bis 104.',
      },
    })
  })

  it('rejects a once window that ends before it starts', () => {
    const values = {
      ...toFormValues(checkup(), TODAY),
      kind: 'once' as const,
      windowStart: '2027-01-01',
      windowEnd: '2026-12-01',
    }
    expect(fromFormValues(values)).toEqual({
      ok: false,
      errors: { windowEnd: 'Das Ende liegt vor dem Anfang.' },
    })
  })
})
