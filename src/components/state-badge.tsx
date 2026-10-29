import type { DueState } from '@/domain/schedule'
import { STATE_LABELS } from '@/lib/due-text'
import { Badge } from './catalyst/badge'

const COLORS = {
  confirm: 'sky',
  overdue: 'red',
  book: 'amber',
  booked: 'emerald',
  upcoming: 'zinc',
} as const satisfies Record<DueState, string>

export function StateBadge({ state }: { state: DueState }) {
  return <Badge color={COLORS[state]}>{STATE_LABELS[state]}</Badge>
}
