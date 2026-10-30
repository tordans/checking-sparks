import { useSyncExternalStore } from 'react'
import { emptyDoc, parseDoc } from '@/domain/model'
import type { FamilyDoc } from '@/domain/model'

/**
 * The local source of truth: the decrypted family document in memory, cached in localStorage,
 * plus sync bookkeeping and the server configuration of this device (docs/architecture.md, "Sync").
 */

const DOC_KEY = 'checking-sparks:doc:v1'
const SYNC_KEY = 'checking-sparks:sync:v1'
const SERVER_KEY = 'checking-sparks:server:v1'

export type Connection =
  /** No server configured: everything stays on this device. */
  | { status: 'local-only' }
  /**
   * Server configured, but no key in memory yet. `docExists` is null while unknown (e.g. offline),
   * false when this device has to create the document with a new passphrase.
   */
  | { status: 'locked'; docExists: boolean | null; error?: string }
  | { status: 'syncing' }
  | { status: 'synced'; at: string }
  | { status: 'offline' }
  | { status: 'error'; message: string }

export interface ServerConfig {
  familyKey: string
  /**
   * The user ticked "Passphrase auf diesem Gerät merken" and the derived key is in IndexedDB
   * (key-store.ts). Only the flag lives here, so the UI can show it without waiting for IndexedDB.
   */
  keyRemembered: boolean
}

interface SyncMeta {
  /** Version of the server document the local copy was last merged with; null = never synced. */
  serverVersion: number | null
  /** Local changes not yet uploaded. */
  dirty: boolean
}

export interface StoreSnapshot {
  doc: FamilyDoc
  connection: Connection
  server: { familyKey: string; keyRemembered: boolean } | null
  dirty: boolean
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    if (value === undefined) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode): the app keeps working in memory.
  }
}

function loadDoc(storage: KeyValueStorage): FamilyDoc {
  const raw = readJson(storage, DOC_KEY)
  if (raw === undefined) return emptyDoc()
  const parsed = parseDoc(raw)
  return parsed.success ? parsed.data : emptyDoc()
}

function loadMeta(storage: KeyValueStorage): SyncMeta {
  const raw = readJson(storage, SYNC_KEY) as Partial<SyncMeta> | undefined
  return {
    serverVersion: typeof raw?.serverVersion === 'number' ? raw.serverVersion : null,
    dirty: raw?.dirty === true,
  }
}

function loadServer(storage: KeyValueStorage): ServerConfig | null {
  const raw = readJson(storage, SERVER_KEY) as
    | (Partial<ServerConfig> & { passphrase?: unknown })
    | undefined
  if (typeof raw?.familyKey !== 'string' || raw.familyKey === '') return null
  const server = { familyKey: raw.familyKey, keyRemembered: raw.keyRemembered === true }
  // Older versions stored the plaintext passphrase here. It is not used any more: remove it.
  if ('passphrase' in raw) writeJson(storage, SERVER_KEY, server)
  return server
}

export function createDocStore(storage: KeyValueStorage) {
  let doc = loadDoc(storage)
  let meta = loadMeta(storage)
  let server = loadServer(storage)
  let connection: Connection = server
    ? { status: 'locked', docExists: null }
    : { status: 'local-only' }
  let snapshot = buildSnapshot()
  const listeners = new Set<() => void>()
  const localChangeListeners = new Set<() => void>()

  function buildSnapshot(): StoreSnapshot {
    return {
      doc,
      connection,
      server: server ? { familyKey: server.familyKey, keyRemembered: server.keyRemembered } : null,
      dirty: meta.dirty,
    }
  }

  function emit() {
    snapshot = buildSnapshot()
    for (const listener of listeners) listener()
  }

  function setMeta(patch: Partial<SyncMeta>) {
    meta = { ...meta, ...patch }
    writeJson(storage, SYNC_KEY, meta)
  }

  function setServer(next: ServerConfig | null) {
    server = next
    writeJson(storage, SERVER_KEY, next ?? undefined)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Called after every local change (not for documents that came from the server). */
    onLocalChange(listener: () => void) {
      localChangeListeners.add(listener)
      return () => localChangeListeners.delete(listener)
    },

    getDoc: () => doc,
    /** Applies a local change, e.g. `dispatch((d) => book(d, id, date))`, and marks it for upload. */
    dispatch: (recipe: (current: FamilyDoc) => FamilyDoc) => {
      const next = recipe(doc)
      if (next === doc) return
      doc = next
      writeJson(storage, DOC_KEY, doc)
      setMeta({ dirty: true })
      emit()
      for (const listener of localChangeListeners) listener()
    },
    /** Replaces the document with a merge result from the server (does not mark it dirty). */
    setMergedDoc(next: FamilyDoc) {
      if (next === doc) return
      doc = next
      writeJson(storage, DOC_KEY, doc)
      emit()
    },

    getMeta: () => meta,
    /** `dirty: false` only if nothing changed locally since `uploaded` was taken. */
    markUploaded(serverVersion: number, uploaded: FamilyDoc) {
      setMeta({ serverVersion, dirty: doc !== uploaded })
      emit()
    },
    setServerVersion(serverVersion: number | null) {
      setMeta({ serverVersion })
    },

    setConnection(next: Connection) {
      connection = next
      emit()
    },

    getServer: () => server,
    /** Pairing: a new family key. A different key means a different server document. */
    setFamilyKey(familyKey: string) {
      if (server?.familyKey === familyKey) return
      setServer({ familyKey, keyRemembered: false })
      setMeta({ serverVersion: null, dirty: true })
      connection = { status: 'locked', docExists: null }
      emit()
    },
    setKeyRemembered(keyRemembered: boolean) {
      if (!server || server.keyRemembered === keyRemembered) return
      setServer({ ...server, keyRemembered })
      emit()
    },
    /** Disconnects this device; the local data stays. */
    forgetServer() {
      setServer(null)
      setMeta({ serverVersion: null, dirty: false })
      connection = { status: 'local-only' }
      emit()
    },
  }
}

export type DocStore = ReturnType<typeof createDocStore>

/** In-memory fallback when localStorage is not available (blocked cookies, tests). */
export function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

function browserStorage(): KeyValueStorage {
  try {
    if (typeof window !== 'undefined') return window.localStorage
  } catch {
    // Accessing localStorage throws when site data is blocked.
  }
  return memoryStorage()
}

export const store = createDocStore(browserStorage())

export const dispatch = store.dispatch

function useSnapshot(): StoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export function useDoc(): FamilyDoc {
  return useSnapshot().doc
}

export function useConnection(): Connection {
  return useSnapshot().connection
}

export function useServerConfig(): StoreSnapshot['server'] {
  return useSnapshot().server
}
