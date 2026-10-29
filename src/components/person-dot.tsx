import { cn } from '@/lib/cn'
import { personColorClass } from '@/lib/person-colors'

export function PersonDot({ color, className }: { color: string | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        personColorClass(color),
        className,
      )}
    />
  )
}
