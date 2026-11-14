import { Cog6ToothIcon } from '@heroicons/react/20/solid'
import { createRootRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { PersonDot } from '@/components/person-dot'
import { SyncStatus } from '@/components/sync-status'
import { useConnection, useDoc } from '@/sync/store'

export const rootRoute = createRootRoute({
  errorComponent: function RootError() {
    return (
      <main className="mx-auto grid min-h-svh max-w-2xl place-content-center gap-2 p-6">
        <h1 className="text-xl font-semibold">Da ist etwas schiefgelaufen</h1>
        <p className="text-zinc-600 dark:text-zinc-400">Bitte lade die Seite neu.</p>
      </main>
    )
  },
  notFoundComponent: function NotFound() {
    return (
      <main className="mx-auto max-w-2xl space-y-2 p-4">
        <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
        <Link to="/" className="underline">
          Zu „Jetzt zu tun“
        </Link>
      </main>
    )
  },
  component: RootLayout,
})

const navItem =
  'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm/6 font-medium text-zinc-700 hover:bg-zinc-950/5 data-[status=active]:bg-zinc-950/5 data-[status=active]:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:data-[status=active]:bg-white/10 dark:data-[status=active]:text-white'

function RootLayout() {
  const doc = useDoc()
  return (
    <div className="min-h-svh">
      <header className="border-b border-zinc-950/5 bg-white dark:border-white/10 dark:bg-zinc-900">
        <div className="mx-auto max-w-2xl px-4">
          <div className="flex items-center justify-between gap-3 pt-3">
            <Link
              to="/"
              className="text-lg font-normal tracking-tight text-zinc-950 dark:text-white"
            >
              Checking Sparks
            </Link>
            <div className="flex items-center gap-1">
              <SyncStatus />
              <Link
                to="/einstellungen"
                aria-label="Einstellungen"
                className="rounded-lg p-1.5 hover:bg-zinc-950/5 data-[status=active]:bg-zinc-950/5 dark:hover:bg-white/5 dark:data-[status=active]:bg-white/10"
              >
                <Cog6ToothIcon className="size-5 fill-zinc-500 dark:fill-zinc-400" />
              </Link>
            </div>
          </div>
          <nav aria-label="Hauptnavigation" className="-mx-2.5 flex gap-1 overflow-x-auto py-2">
            <Link to="/" className={navItem} activeOptions={{ exact: true }}>
              Jetzt zu tun
            </Link>
            {doc.persons.map((person) => (
              <Link
                key={person.id}
                to="/person/$personId"
                params={{ personId: person.id }}
                className={navItem}
              >
                <PersonDot color={person.color} />
                {person.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <LockedBanner />
      <Outlet />
      <footer className="mx-auto max-w-2xl px-4 py-8 text-sm/6 text-zinc-500 dark:text-zinc-400">
        <Link to="/datenschutz" className="underline hover:text-zinc-950 dark:hover:text-white">
          Datenschutz
        </Link>
      </footer>
    </div>
  )
}

function LockedBanner() {
  const connection = useConnection()
  const { pathname } = useLocation()
  if (connection.status !== 'locked' || pathname === '/verbinden') return null
  return (
    <div className="border-b border-amber-500/20 bg-amber-50 dark:bg-amber-500/10">
      <p className="mx-auto max-w-2xl px-4 py-2 text-sm/6 text-amber-900 dark:text-amber-200">
        {connection.docExists === false
          ? 'Lege eine Passphrase fest, um eure Daten zu synchronisieren. '
          : 'Gib die Passphrase ein, um zu synchronisieren. '}
        <Link to="/verbinden" className="font-medium underline">
          {connection.docExists === false ? 'Einrichten' : 'Entsperren'}
        </Link>
      </p>
    </div>
  )
}
