import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseNavigateMessage } from './service-worker'

const navigate = (path: unknown) => parseNavigateMessage({ type: 'navigate', path })

describe('parseNavigateMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://check.example' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts navigate messages with a same-origin path', () => {
    expect(navigate('/person/p1/vorsorge/c1?action=done')).toBe(
      '/person/p1/vorsorge/c1?action=done',
    )
    expect(navigate('/einstellungen#push')).toBe('/einstellungen#push')
    expect(navigate('https://check.example/person/p1')).toBe('/person/p1')
  })

  it('ignores everything else', () => {
    expect(parseNavigateMessage(null)).toBeNull()
    expect(parseNavigateMessage('navigate')).toBeNull()
    expect(parseNavigateMessage({ type: 'other', path: '/' })).toBeNull()
    expect(navigate(42)).toBeNull()
  })

  it('rejects targets on another origin', () => {
    expect(navigate('https://evil.example')).toBeNull()
    expect(navigate('//evil.example')).toBeNull()
    expect(navigate('//evil')).toBeNull()
    expect(navigate('/\\evil.example')).toBeNull()
    expect(navigate('\\\\evil.example')).toBeNull()
    expect(navigate('http://[bad')).toBeNull()
  })
})
