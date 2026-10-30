/**
 * The derived AES-GCM key of this device, kept in IndexedDB when the user ticks "Passphrase auf
 * diesem Gerät merken" (docs/architecture.md, "Encryption"). The key is non-extractable and
 * survives structured cloning, so the passphrase itself never has to be stored. Every failure
 * (IndexedDB blocked, private mode, quota) just means "not remembered".
 */

const DB_NAME = 'checking-sparks'
const STORE_NAME = 'keys'
const RECORD_ID = 'doc-key'

export interface RememberedKey {
  key: CryptoKey
  /** The KDF parameters the key was derived with; the server document must still use them. */
  salt: string
  iterations: number
}

export interface KeyStore {
  get(): Promise<RememberedKey | null>
  /** Resolves to false when the key could not be stored. */
  put(remembered: RememberedKey): Promise<boolean>
  delete(): Promise<void>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Runs one request in its own transaction and resolves when the transaction is committed. */
async function inStore<T>(
  mode: IDBTransactionMode,
  run: (objects: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

function isRememberedKey(value: unknown): value is RememberedKey {
  if (typeof value !== 'object' || value === null) return false
  const { key, salt, iterations } = value as Partial<RememberedKey>
  return (
    typeof key === 'object' &&
    key !== null &&
    typeof salt === 'string' &&
    typeof iterations === 'number'
  )
}

export const keyStore: KeyStore = {
  async get() {
    try {
      const record: unknown = await inStore('readonly', (objects) => objects.get(RECORD_ID))
      return isRememberedKey(record) ? record : null
    } catch {
      return null
    }
  },
  async put(remembered) {
    try {
      await inStore('readwrite', (objects) => objects.put(remembered, RECORD_ID))
      return true
    } catch {
      return false
    }
  },
  async delete() {
    try {
      await inStore('readwrite', (objects) => objects.delete(RECORD_ID))
    } catch {
      // Nothing to do: if it could not be deleted, it could not be read either.
    }
  },
}
