import { cn } from '@/lib/cn'

export function Page({ className, ...props }: React.ComponentPropsWithoutRef<'main'>) {
  return <main {...props} className={cn('mx-auto max-w-2xl space-y-6 px-4 py-6', className)} />
}
