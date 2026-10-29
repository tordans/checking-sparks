import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/cn'

describe('cn', () => {
  it('joins class names and resolves Tailwind conflicts', () => {
    expect(cn('p-2', 'text-sm', 'p-4')).toBe('text-sm p-4')
  })

  it('drops falsy values', () => {
    expect(cn('font-medium', false, undefined, 'italic')).toBe('font-medium italic')
  })
})
