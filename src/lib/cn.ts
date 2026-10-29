import { twJoin, twMerge } from 'tailwind-merge'

export function cn(...classLists: Parameters<typeof twJoin>) {
  return twMerge(twJoin(...classLists))
}
