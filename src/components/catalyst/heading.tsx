import { twJoin as clsx } from 'tailwind-merge'

export function Heading({ className, ...props }: React.ComponentPropsWithoutRef<'h1'>) {
  return (
    <h1
      {...props}
      className={clsx(
        className,
        'text-2xl/8 font-semibold text-zinc-950 sm:text-xl/8 dark:text-white',
      )}
    />
  )
}

export function Subheading({ className, ...props }: React.ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2
      {...props}
      className={clsx(
        className,
        'text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white',
      )}
    />
  )
}
