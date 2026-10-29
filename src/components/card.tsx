import { cn } from '@/lib/cn'

/** White panel on the grey page background (Tailwind Plus "card" pattern). */
export function Card({ className, ...props }: React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      {...props}
      className={cn(
        'rounded-xl bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 sm:p-5 dark:bg-zinc-900 dark:ring-white/10',
        className,
      )}
    />
  )
}
