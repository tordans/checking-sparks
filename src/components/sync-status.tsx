import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import type { Connection } from '@/sync/store'
import { useConnection } from '@/sync/store'

const LABELS: Record<Connection['status'], string> = {
  'local-only': 'Nur lokal',
  locked: 'Gesperrt',
  syncing: 'Synchronisiere…',
  synced: 'Synchronisiert',
  offline: 'Offline',
  error: 'Sync-Fehler',
}

const DOTS: Record<Connection['status'], string> = {
  'local-only': 'bg-zinc-400',
  locked: 'bg-amber-500',
  syncing: 'bg-sky-500 animate-pulse',
  synced: 'bg-emerald-500',
  offline: 'bg-zinc-400',
  error: 'bg-red-500',
}

export function connectionLabel(connection: Connection): string {
  return LABELS[connection.status]
}

/** Small status pill in the header; opens the sync settings. */
export function SyncStatus() {
  const connection = useConnection()
  return (
    <Link
      to="/einstellungen"
      hash="sync"
      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs/5 text-zinc-600 hover:bg-zinc-950/5 dark:text-zinc-400 dark:hover:bg-white/5"
      title={connection.status === 'error' ? connection.message : undefined}
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', DOTS[connection.status])} />
      {LABELS[connection.status]}
    </Link>
  )
}
