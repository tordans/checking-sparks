import { describe, expect, it } from 'vitest'
import type { Due } from '@/domain/schedule'
import { occurrence } from '@/domain/test-helpers'
import { dueText, earlyBookingNote, formatDay, windowText } from './due-text'

const base: Due = {
  windowStart: '2026-12-01',
  windowEnd: '2027-02-28',
  bookingStart: '2026-10-20',
  state: 'book',
}

describe('dueText', () => {
  it('names the date that matters for each state', () => {
    const today = '2026-11-01'
    expect(dueText(base, today)).toBe('bis 28.02.2027 buchen')
    expect(dueText({ ...base, state: 'upcoming' }, today)).toBe('ab 20.10. buchen')
    expect(dueText({ ...base, state: 'overdue' }, today)).toBe('war bis 28.02.2027 fällig')
    const booked = occurrence({ appointmentDate: '2026-11-12' })
    expect(dueText({ ...base, state: 'booked', occurrence: booked }, today)).toBe(
      'Termin am 12.11.',
    )
    expect(dueText({ ...base, state: 'confirm', occurrence: booked }, today)).toBe(
      'Termin am 12.11. – hat er stattgefunden?',
    )
  })

  it('adds the year only for other years', () => {
    expect(formatDay('2026-03-31', '2026-01-01')).toBe('31.03.')
    expect(formatDay('2027-03-31', '2026-01-01')).toBe('31.03.2027')
    expect(windowText(base, '2026-11-01')).toBe('01.12.–28.02.2027')
  })
})

describe('earlyBookingNote', () => {
  it('never ends a date and a sentence with two periods', () => {
    const note = earlyBookingNote('2026-09-17', '2026-06-01')
    expect(note).toContain('am 17.09. –')
    expect(note).not.toContain('..')
  })
})
