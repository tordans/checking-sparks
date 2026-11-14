import { describe, expect, it } from 'vitest'
import { parseDoc } from './model'
import { computeDue } from './schedule'
import {
  checkupFromTemplate,
  defaultSexFilter,
  findTemplate,
  suggestTemplates,
  TEMPLATES,
} from './templates'
import { counterIds, docWith, noon, person } from './test-helpers'

const get = (id: string) => {
  const found = findTemplate(id)
  if (!found) throw new Error(`missing template ${id}`)
  return found
}
const suggestedIds = (...args: Parameters<typeof suggestTemplates>) =>
  suggestTemplates(...args).map((s) => s.template.id)

describe('catalog', () => {
  it('has unique ids', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length)
  })
})

describe('suggestTemplates: age', () => {
  it('shows U9 for a 4-year-old planning ahead, but neither U1 nor adult exams', () => {
    const ids = suggestedIds({ birthDate: '2022-03-15' }, '2026-10-29')
    expect(ids).toContain('u9')
    expect(ids).toContain('zahn-fu')
    expect(ids).not.toContain('u8')
    expect(ids).not.toContain('u1')
    expect(ids).not.toContain('check-up-18')
    expect(ids).not.toContain('zahn-kontrolle')
  })

  it('hides child exams from adults', () => {
    const ids = suggestedIds({ birthDate: '1985-05-05' }, '2026-10-29')
    expect(ids).toContain('check-up-35')
    expect(ids).toContain('hautkrebs')
    expect(ids).not.toContain('u9')
    expect(ids).not.toContain('j1')
    expect(ids).not.toContain('check-up-18')
    expect(ids).not.toContain('darmkrebs-stuhl')
  })

  it('applies upper age bounds', () => {
    expect(suggestedIds({ birthDate: '1995-01-01' }, '2026-10-29')).toContain('check-up-18')
    expect(suggestedIds({ birthDate: '1985-01-01' }, '2026-10-29')).not.toContain('check-up-18')
  })

  it('shows templates up to six months before the minimum age', () => {
    // born 1991-05-01: 35 on 2026-05-01; check-up-35 visible from 2025-11-01
    expect(suggestedIds({ birthDate: '1991-05-01' }, '2025-10-31')).not.toContain('check-up-35')
    expect(suggestedIds({ birthDate: '1991-05-01' }, '2025-11-01')).toContain('check-up-35')
  })

  it('newborns see U1 to U3 and the early vaccination', () => {
    const ids = suggestedIds({ birthDate: '2026-10-20' }, '2026-10-29')
    expect(ids).toEqual(expect.arrayContaining(['u1', 'u2', 'u3', 'u4', 'imp-grund']))
    expect(ids).toContain('u5') // six months lookahead
    expect(ids).not.toContain('u6')
  })
})

describe('suggestTemplates: sex', () => {
  it('filters by sex', () => {
    const man = suggestedIds({ birthDate: '1975-01-01', sex: 'm' }, '2026-10-29')
    expect(man).toContain('prostata-dru')
    expect(man).not.toContain('zervix-35')
    expect(man).not.toContain('mammo')
    const woman = suggestedIds({ birthDate: '1975-01-01', sex: 'w' }, '2026-10-29')
    expect(woman).toContain('zervix-35')
    expect(woman).not.toContain('prostata-dru')
  })
})

describe('suggestTemplates: unknown data', () => {
  it('without birth date shows everything and flags age-restricted rows', () => {
    const all = suggestTemplates({ sex: 'w' }, '2026-10-29')
    const byId = new Map(all.map((s) => [s.template.id, s]))
    expect(byId.get('u9')?.ageUnknown).toBe(true)
    expect(byId.get('check-up-35')?.ageUnknown).toBe(true)
    expect(byId.get('fsme')?.ageUnknown).toBe(false)
    expect(byId.has('prostata-dru')).toBe(false)
  })

  it('without sex (or divers) shows both and flags sex-specific rows', () => {
    for (const sex of [undefined, 'd'] as const) {
      const byId = new Map(
        suggestTemplates({ birthDate: '1975-01-01', sex }, '2026-10-29').map((s) => [
          s.template.id,
          s,
        ]),
      )
      expect(byId.get('prostata-dru')?.sexUnfiltered).toBe(true)
      expect(byId.get('zervix-35')?.sexUnfiltered).toBe(true)
      expect(byId.get('hautkrebs')?.sexUnfiltered).toBe(false)
    }
  })

  it('has no flags when everything is known', () => {
    const suggestions = suggestTemplates({ birthDate: '1975-01-01', sex: 'm' }, '2026-10-29')
    expect(suggestions.every((s) => !s.ageUnknown && !s.sexUnfiltered)).toBe(true)
  })

  it('the sex option replaces the person sex for filtering', () => {
    const man = { birthDate: '1975-01-01', sex: 'm' } as const
    const woman = suggestedIds(man, '2026-10-29', { sex: 'w' })
    expect(woman).toContain('zervix-35')
    expect(woman).not.toContain('prostata-dru')
  })

  it('the sex option "alle" turns the sex filter off and flags sex-specific rows', () => {
    const man = { birthDate: '1975-01-01', sex: 'm' } as const
    const all = new Map(
      suggestTemplates(man, '2026-10-29', { sex: 'alle' }).map((s) => [s.template.id, s]),
    )
    expect(all.get('prostata-dru')?.sexUnfiltered).toBe(true)
    expect(all.get('zervix-35')?.sexUnfiltered).toBe(true)
    expect(all.get('hautkrebs')?.sexUnfiltered).toBe(false)
  })
})

describe('defaultSexFilter', () => {
  it('is the person sex if m or w, otherwise "alle"', () => {
    expect(defaultSexFilter({ sex: 'm' })).toBe('m')
    expect(defaultSexFilter({ sex: 'w' })).toBe('w')
    expect(defaultSexFilter({ sex: 'd' })).toBe('alle')
    expect(defaultSexFilter({ sex: undefined })).toBe('alle')
  })
})

describe('suggestTemplates: self checks', () => {
  it('are left out by default and included on request', () => {
    const person = { birthDate: '1975-01-01', sex: 'w' } as const
    expect(suggestedIds(person, '2026-10-29')).not.toContain('brust-selbst')
    const withSelf = suggestTemplates(person, '2026-10-29', { includeSelfChecks: true })
    expect(withSelf.map((s) => s.template.id)).toContain('brust-selbst')
    expect(withSelf.map((s) => s.template.id)).toContain('blutdruck-selbst')
  })
})

describe('checkupFromTemplate', () => {
  const env = () => ({ now: noon('2026-10-29'), newId: counterIds() })

  it('U9: window from the birth date (60–64 months)', () => {
    const child = person({ id: 'kid', name: 'Mia', birthDate: '2022-03-15' })
    const result = checkupFromTemplate(get('u9'), child, '2026-10-29', env())
    expect(result).toMatchObject({
      id: 'id-1',
      personId: 'kid',
      title: 'U9',
      templateId: 'u9',
      schedule: { kind: 'once', windowStart: '2027-03-15', windowEnd: '2027-07-15' },
      windowMonths: 3,
      bookingLeadWeeks: 6,
      active: true,
    })
  })

  it('U9 works as a due window: upcoming, then book 6 weeks before', () => {
    const child = person({ birthDate: '2022-03-15' })
    const c = checkupFromTemplate(get('u9'), child, '2026-10-29', env())
    expect(computeDue(c, [], '2027-01-31')?.state).toBe('upcoming')
    expect(computeDue(c, [], '2027-02-01')?.state).toBe('book')
  })

  it('U1 is the birth day, U2 days 3 to 10', () => {
    const baby = person({ birthDate: '2026-10-20' })
    expect(checkupFromTemplate(get('u1'), baby, '2026-10-29', env()).schedule).toEqual({
      kind: 'once',
      windowStart: '2026-10-20',
      windowEnd: '2026-10-20',
    })
    expect(checkupFromTemplate(get('u2'), baby, '2026-10-29', env()).schedule).toEqual({
      kind: 'once',
      windowStart: '2026-10-23',
      windowEnd: '2026-10-30',
    })
  })

  it('J1 covers ages 12 to 14 (until the 15th birthday)', () => {
    const teen = person({ birthDate: '2013-06-10' })
    expect(checkupFromTemplate(get('j1'), teen, '2026-10-29', env()).schedule).toEqual({
      kind: 'once',
      windowStart: '2025-06-10',
      windowEnd: '2028-06-10',
    })
  })

  it('adult once template (check-up 18–34)', () => {
    const adult = person({ birthDate: '2000-05-10' })
    expect(checkupFromTemplate(get('check-up-18'), adult, '2026-10-29', env()).schedule).toEqual({
      kind: 'once',
      windowStart: '2018-05-10',
      windowEnd: '2035-05-10',
    })
  })

  it('seasonal flu shot: Oct–Dec yearly', () => {
    const senior = person({ birthDate: '1950-01-01' })
    const c = checkupFromTemplate(get('grippe'), senior, '2026-10-29', env())
    expect(c.schedule).toEqual({ kind: 'seasonal', startMonth: 10, endMonth: 12 })
    expect(computeDue(c, [], '2026-10-29')).toMatchObject({
      windowStart: '2026-10-01',
      windowEnd: '2026-12-31',
      state: 'book',
    })
  })

  it('interval starts today, or at the minimum age if the person is still younger', () => {
    const adult = person({ birthDate: '1980-01-01' })
    const c = checkupFromTemplate(get('hautkrebs'), adult, '2026-10-29', env())
    expect(c.schedule).toEqual({ kind: 'interval', months: 24 })
    expect(c.firstWindowStart).toBe('2026-10-29')

    const turned35 = person({ birthDate: '1991-05-01' })
    const early = checkupFromTemplate(get('check-up-35'), turned35, '2026-10-29', env())
    expect(early.firstWindowStart).toBe('2026-10-29')
    const younger = person({ birthDate: '1992-06-15' })
    expect(
      checkupFromTemplate(get('check-up-35'), younger, '2026-10-29', env()).firstWindowStart,
    ).toBe('2027-06-15')
  })

  it('interval without birth date starts today', () => {
    const c = checkupFromTemplate(get('zahn-kontrolle'), person(), '2026-10-29', env())
    expect(c.firstWindowStart).toBe('2026-10-29')
  })

  it('once template without birth date: one year from today', () => {
    const c = checkupFromTemplate(get('u9'), person(), '2026-10-29', env())
    expect(c.schedule).toEqual({ kind: 'once', windowStart: '2026-10-29', windowEnd: '2027-10-28' })
  })

  it('template without recurrence (PSA): one open year window', () => {
    const c = checkupFromTemplate(
      get('psa'),
      person({ birthDate: '1970-01-01' }),
      '2026-10-29',
      env(),
    )
    expect(c.schedule).toEqual({ kind: 'once', windowStart: '2026-10-29', windowEnd: '2027-10-28' })
  })

  it('every template yields a valid check-up for a person with and without birth date', () => {
    for (const birthDate of [undefined, '1990-02-28', '2026-10-01']) {
      for (const t of TEMPLATES) {
        const p = person(birthDate ? { birthDate } : {})
        const c = checkupFromTemplate(t, p, '2026-10-29', env())
        const doc = docWith({ persons: [p], checkups: [c] })
        expect(parseDoc(JSON.parse(JSON.stringify(doc))).success).toBe(true)
      }
    }
  })
})
