import { describe, expect, it } from 'vitest'
import { parseNavigateMessage } from './service-worker'

describe('parseNavigateMessage', () => {
  it('accepts navigate messages with a same-origin path', () => {
    expect(
      parseNavigateMessage({ type: 'navigate', path: '/person/p1/vorsorge/c1?action=done' }),
    ).toBe('/person/p1/vorsorge/c1?action=done')
  })

  it('ignores everything else', () => {
    expect(parseNavigateMessage(null)).toBeNull()
    expect(parseNavigateMessage('navigate')).toBeNull()
    expect(parseNavigateMessage({ type: 'other', path: '/' })).toBeNull()
    expect(parseNavigateMessage({ type: 'navigate', path: 'https://evil.example' })).toBeNull()
    expect(parseNavigateMessage({ type: 'navigate', path: '//evil.example' })).toBeNull()
  })
})
