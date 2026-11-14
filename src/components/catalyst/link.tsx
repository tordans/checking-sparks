import * as Headless from '@headlessui/react'
import { Link as RouterLink } from '@tanstack/react-router'
import type React from 'react'
import { twJoin as clsx } from 'tailwind-merge'

/**
 * The single anchor every link-like Catalyst component renders through, so
 * `Button href` navigates client-side. Call sites pass a plain string `href`.
 */
export function Link({
  ref,
  href,
  className,
  ...props
}: { href: string; className?: string; ref?: React.Ref<HTMLAnchorElement> } & Omit<
  React.ComponentPropsWithoutRef<'a'>,
  'href' | 'className'
>) {
  return (
    <Headless.DataInteractive>
      <RouterLink to={href} {...props} className={clsx(className, 'cursor-pointer')} ref={ref} />
    </Headless.DataInteractive>
  )
}
