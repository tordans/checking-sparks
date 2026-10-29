import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({
  beforeLoad: ({ location }) => {
    const { pathname, searchStr, hash } = location
    if (pathname.length <= 1 || !pathname.endsWith('/')) return
    const stripped = pathname.replace(/\/+$/, '') || '/'
    throw redirect({
      href: `${stripped}${searchStr}${hash ? `#${hash}` : ''}`,
      replace: true,
    })
  },
  errorComponent: function RootError() {
    return (
      <main className="mx-auto grid min-h-svh max-w-[40rem] place-content-center gap-2 p-6">
        <h1 className="text-xl font-semibold">Da ist etwas schiefgelaufen</h1>
        <p className="text-zinc-600">Bitte die Seite neu laden.</p>
      </main>
    )
  },
  component: function RootLayout() {
    return (
      <div className="min-h-svh">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-[40rem] items-center justify-between px-4 py-3">
            <Link to="/" className="text-lg font-normal tracking-tight text-zinc-950">
              Checking Sparks
            </Link>
          </div>
        </header>
        <Outlet />
      </div>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Home() {
    return (
      <main className="mx-auto max-w-[40rem] p-4">
        <h1 className="text-2xl font-semibold text-zinc-950">Jetzt zu tun</h1>
      </main>
    )
  },
})

const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  trailingSlash: 'never',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
