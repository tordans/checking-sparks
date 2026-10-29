import * as Headless from '@headlessui/react'
import { Link as RouterLink } from '@tanstack/react-router'
import type React from 'react'
import { twJoin as clsx } from 'tailwind-merge'

/**
 * The single anchor every link- and button-like Catalyst component renders
 * through. Route it once here and `Button`, `BadgeButton`, `AvatarButton`,
 * `NavbarItem`, `SidebarItem`, `TableRow`, `TableCell` and `TextLink` all
 * navigate client-side.
 *
 * Catalyst call sites only ever pass a plain string `href` (internal paths,
 * external URLs, `mailto:`, asset links) — never a typed TanStack `to` +
 * params/search. TanStack Router's `Link` accepts a plain (non-literal)
 * `string` for `to` as an escape hatch: it skips route-path validation but
 * still runs the same detection it uses for a literal `to` — same-tab clicks
 * on internal-looking paths get client-side navigation, while absolute
 * external URLs and non-`_self` targets fall through to normal browser
 * navigation untouched. This keeps the component honest: `href` still means
 * "any string", same as Catalyst's original contract, so no call site needs
 * to change.
 *
 * Porting to another router: swap `RouterLink` and the `to={href}` prop for
 * that router's component. Nothing else in the kit needs to change.
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
