/** Person colors are stored as a token; the classes are spelled out for Tailwind. */
export const PERSON_COLORS = {
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
} as const

export type PersonColor = keyof typeof PERSON_COLORS

export const PERSON_COLOR_NAMES: Record<PersonColor, string> = {
  sky: 'Himmelblau',
  emerald: 'Grün',
  amber: 'Gelb',
  rose: 'Rot',
  violet: 'Lila',
  teal: 'Türkis',
  orange: 'Orange',
  pink: 'Pink',
}

export function isPersonColor(value: string | undefined): value is PersonColor {
  return value !== undefined && value in PERSON_COLORS
}

export function personColorClass(color: string | undefined): string {
  return isPersonColor(color) ? PERSON_COLORS[color] : 'bg-zinc-400'
}

/** The first color not used yet, so new persons are told apart. */
export function nextPersonColor(used: (string | undefined)[]): PersonColor {
  const tokens = Object.keys(PERSON_COLORS) as PersonColor[]
  return tokens.find((t) => !used.includes(t)) ?? tokens[used.length % tokens.length]!
}
