import {
  createSalt,
  decryptJson,
  DEFAULT_ITERATIONS,
  deriveKey,
  encryptJson,
  WrongPassphraseError,
} from '@/crypto/envelope'
import type { Envelope } from '@/crypto/envelope'
import { today } from '@/domain/dates'
import { merge, pruneTombstones, sameContent } from '@/domain/merge'
import { parseDoc } from '@/domain/model'
import type { FamilyDoc } from '@/domain/model'
import { buildReminders } from '@/domain/reminders'
import { ApiError, createApiClient } from './api-client'
import type { ApiClient } from './api-client'
import { store as defaultStore } from './store'
import type { DocStore } from './store'

/** Sync with the server as described in docs/architecture.md, "Sync". */

export const WRONG_PASSPHRASE = 'Passphrase stimmt nicht'

const MAX_PUT_ATTEMPTS = 3
const LOCAL_CHANGE_DEBOUNCE_MS = 1000
const PULL_INTERVAL_MS = 60_000

type SyncApi = Pick<ApiClient, 'getDoc' | 'putDoc' | 'putReminders'>

interface DocKey {
  key: CryptoKey
  salt: string
  iterations: number
}

export type UnlockResult = { ok: true } | { ok: false; error: string }

class SyncFailure extends Error {}

/** German message for the connection state; network errors count as offline. */
function describeError(error: unknown): { offline: true } | { offline: false; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { offline: false, message: 'Der Familienschlüssel passt nicht zu diesem Server.' }
    }
    return { offline: false, message: `Der Server antwortet mit Fehler ${error.status}.` }
  }
  if (error instanceof SyncFailure) return { offline: false, message: error.message }
  if (error instanceof TypeError) return { offline: true }
  return { offline: false, message: 'Synchronisieren hat nicht geklappt.' }
}

export function createSyncEngine({
  api,
  store = defaultStore,
  iterations = DEFAULT_ITERATIONS,
  now = () => new Date(),
}: {
  api: SyncApi
  store?: DocStore
  /** PBKDF2 iterations for a new family (tests use a small number). */
  iterations?: number
  now?: () => Date
}) {
  let docKey: DocKey | null = null
  let queue: Promise<unknown> = Promise.resolve()

  /** Runs one sync task at a time, in order. */
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function keyFor(envelope: Envelope, passphrase?: string): Promise<CryptoKey> {
    const { salt, iterations: rounds } = envelope.kdf
    if (docKey && docKey.salt === salt && docKey.iterations === rounds) return docKey.key
    const secret = passphrase ?? store.getServer()?.passphrase
    if (secret === undefined) throw new WrongPassphraseError()
    const key = await deriveKey(secret, salt, rounds)
    docKey = { key, salt, iterations: rounds }
    return key
  }

  async function decryptDoc(envelope: Envelope, passphrase?: string): Promise<FamilyDoc> {
    const key = await keyFor(envelope, passphrase)
    const parsed = parseDoc(await decryptJson(envelope, key))
    if (!parsed.success) throw new SyncFailure('Die Daten auf dem Server sind ungültig.')
    return parsed.data
  }

  /** Merges a server copy into the local document; returns the merged result. */
  function mergeIntoLocal(remote: FamilyDoc): FamilyDoc {
    const merged = pruneTombstones(merge(store.getDoc(), remote), now())
    store.setMergedDoc(sameContent(merged, store.getDoc()) ? store.getDoc() : merged)
    return store.getDoc()
  }

  async function uploadReminders(doc: FamilyDoc): Promise<void> {
    const reminders = buildReminders(doc, today(now()), doc.settings.reminderHour)
    await api.putReminders(reminders)
  }

  /** PUT with If-Match (or create with `version: null`); on 409 merge and retry, max 3 times. */
  async function push(version: number | null, passphrase?: string): Promise<void> {
    if (!docKey) throw new SyncFailure('Kein Schlüssel vorhanden.')
    let expected = version
    for (let attempt = 0; attempt < MAX_PUT_ATTEMPTS; attempt += 1) {
      const uploaded = store.getDoc()
      const envelope = await encryptJson(uploaded, docKey.key, docKey.salt, docKey.iterations)
      const result = await api.putDoc(envelope, expected)
      if (result.ok) {
        store.markUploaded(result.version, uploaded)
        try {
          await uploadReminders(uploaded)
        } catch {
          // The document is safe; the plan is uploaded again after the next successful PUT.
        }
        return
      }
      mergeIntoLocal(await decryptDoc(result.conflict.envelope, passphrase))
      expected = result.conflict.version
      store.setServerVersion(expected)
    }
    throw new SyncFailure('Gleichzeitige Änderungen konnten nicht gespeichert werden.')
  }

  /** GET → decrypt → merge → PUT if the result differs from the server copy or is dirty. */
  async function pullMergePush(passphrase?: string): Promise<void> {
    const remote = await api.getDoc()
    if (!remote) {
      await push(null, passphrase)
      return
    }
    const remoteDoc = await decryptDoc(remote.envelope, passphrase)
    store.setServerVersion(remote.version)
    const merged = mergeIntoLocal(remoteDoc)
    if (store.getMeta().dirty || !sameContent(merged, remoteDoc)) {
      await push(remote.version, passphrase)
    } else {
      store.markUploaded(remote.version, merged)
    }
  }

  function settle(error: unknown): void {
    if (error instanceof WrongPassphraseError) {
      docKey = null
      store.setConnection({ status: 'locked', docExists: true, error: WRONG_PASSPHRASE })
      return
    }
    const described = describeError(error)
    store.setConnection(
      described.offline ? { status: 'offline' } : { status: 'error', message: described.message },
    )
  }

  async function run(task: () => Promise<void>): Promise<void> {
    store.setConnection({ status: 'syncing' })
    try {
      await task()
      store.setConnection({ status: 'synced', at: now().toISOString() })
    } catch (error) {
      settle(error)
    }
  }

  /** Asks the server whether a document exists, so the UI knows whether to unlock or create. */
  function probe(): Promise<void> {
    return exclusive(async () => {
      if (docKey) return
      try {
        const remote = await api.getDoc()
        store.setConnection({ status: 'locked', docExists: remote !== null })
      } catch (error) {
        const described = describeError(error)
        store.setConnection(
          described.offline
            ? { status: 'locked', docExists: null }
            : { status: 'error', message: described.message },
        )
      }
    })
  }

  /**
   * Enters the passphrase: decrypts the server document (other devices) or creates it with a
   * new salt (first device). Then merges the local data in and uploads the result.
   */
  function unlock(passphrase: string, remember: boolean): Promise<UnlockResult> {
    return exclusive(async (): Promise<UnlockResult> => {
      store.setConnection({ status: 'syncing' })
      try {
        const remote = await api.getDoc()
        if (remote) {
          const { salt, iterations: rounds } = remote.envelope.kdf
          docKey = { key: await deriveKey(passphrase, salt, rounds), salt, iterations: rounds }
          const remoteDoc = await decryptDoc(remote.envelope)
          store.setServerVersion(remote.version)
          const merged = mergeIntoLocal(remoteDoc)
          if (store.getMeta().dirty || !sameContent(merged, remoteDoc)) {
            await push(remote.version, passphrase)
          } else {
            store.markUploaded(remote.version, merged)
          }
        } else {
          const salt = createSalt()
          docKey = { key: await deriveKey(passphrase, salt, iterations), salt, iterations }
          await push(null, passphrase)
        }
        store.rememberPassphrase(remember ? passphrase : null)
        store.setConnection({ status: 'synced', at: now().toISOString() })
        return { ok: true }
      } catch (error) {
        settle(error)
        if (error instanceof WrongPassphraseError) return { ok: false, error: WRONG_PASSPHRASE }
        const described = describeError(error)
        return {
          ok: false,
          error: described.offline ? 'Keine Verbindung zum Server.' : described.message,
        }
      }
    })
  }

  return {
    probe,
    unlock,

    /** Starts with the remembered passphrase, if any. */
    resume(): Promise<void> {
      const passphrase = store.getServer()?.passphrase
      if (passphrase === undefined) return probe()
      return unlock(passphrase, true).then(() => undefined)
    },

    /** Pull, merge, push. Does nothing while locked. */
    syncNow(): Promise<void> {
      return exclusive(async () => {
        if (!docKey) return
        await run(() => pullMergePush())
      })
    },

    /** Uploads local changes (If-Match with the known version); falls back to a full sync. */
    pushNow(): Promise<void> {
      return exclusive(async () => {
        if (!docKey || !store.getMeta().dirty) return
        const version = store.getMeta().serverVersion
        await run(() => (version === null ? pullMergePush() : push(version)))
      })
    },

    isUnlocked: () => docKey !== null,

    /** Forgets the key in memory (e.g. after disconnecting). */
    lock() {
      docKey = null
    },
  }
}

type SyncEngine = ReturnType<typeof createSyncEngine>

// --- Browser wiring ------------------------------------------------------------------------

let engine: SyncEngine | null = null
let stopWatching: (() => void) | null = null

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

/** Pull on focus, when the tab becomes visible, when back online and every 60 s while visible. */
function watch(current: SyncEngine): () => void {
  let debounce: ReturnType<typeof setTimeout> | undefined
  const sync = () => {
    if (isVisible()) void current.syncNow()
  }
  const onVisibility = () => {
    if (isVisible()) void current.syncNow()
  }
  const interval = setInterval(sync, PULL_INTERVAL_MS)
  window.addEventListener('focus', sync)
  window.addEventListener('online', sync)
  document.addEventListener('visibilitychange', onVisibility)
  const unsubscribe = defaultStore.onLocalChange(() => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void current.pushNow(), LOCAL_CHANGE_DEBOUNCE_MS)
  })
  return () => {
    clearInterval(interval)
    clearTimeout(debounce)
    window.removeEventListener('focus', sync)
    window.removeEventListener('online', sync)
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribe()
  }
}

function connect(familyKey: string): SyncEngine {
  stopWatching?.()
  engine = createSyncEngine({ api: createApiClient({ familyKey }) })
  stopWatching = watch(engine)
  return engine
}

/** Called once on app start. Without server configuration the app stays local-only. */
export function startSync(): void {
  if (engine) return
  const server = defaultStore.getServer()
  if (!server) return
  void connect(server.familyKey).resume()
}

/** `/verbinden#key=…`: stores the family key and asks the server whether a document exists. */
export function pairDevice(familyKey: string): void {
  const sameKey = defaultStore.getServer()?.familyKey === familyKey
  defaultStore.setFamilyKey(familyKey)
  if (sameKey && engine) return
  void connect(familyKey).probe()
}

export function unlock(passphrase: string, remember: boolean): Promise<UnlockResult> {
  const server = defaultStore.getServer()
  if (!server) return Promise.resolve({ ok: false, error: 'Kein Server verbunden.' })
  return (engine ?? connect(server.familyKey)).unlock(passphrase, remember)
}

/** Sync now; while still locked, asks the server again (e.g. after being offline). */
export function syncNow(): Promise<void> {
  if (!engine) return Promise.resolve()
  return engine.isUnlocked() ? engine.syncNow() : engine.resume()
}

/** Disconnects this device from the server; the local data stays. */
export function disconnect(): void {
  stopWatching?.()
  stopWatching = null
  engine?.lock()
  engine = null
  defaultStore.forgetServer()
}
