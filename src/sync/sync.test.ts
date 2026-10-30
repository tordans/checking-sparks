import { describe, expect, it } from 'vitest'
import { createSalt, decryptJson, deriveKey, encryptJson } from '@/crypto/envelope'
import type { Envelope } from '@/crypto/envelope'
import { addPerson, setReminderHour } from '@/domain/actions'
import { emptyDoc } from '@/domain/model'
import type { FamilyDoc } from '@/domain/model'
import type { Reminder } from '@/domain/reminders'
import type { DocResponse, PutDocResult } from './api-client'
import type { KeyStore, RememberedKey } from './key-store'
import { createDocStore, memoryStorage } from './store'
import { createSyncEngine, WRONG_PASSPHRASE } from './sync'

const ITERATIONS = 1000
const NOW = new Date('2026-10-29T10:00:00.000Z')

/** In-memory stand-in for the PHP API with the same version semantics. */
function fakeApi() {
  const server = {
    doc: null as DocResponse | null,
    reminders: [] as Reminder[],
    puts: 0,
    reminderPuts: 0,
    /** Simulates another device writing between our GET and PUT. */
    beforePut: undefined as (() => Promise<void>) | undefined,
  }
  const api = {
    async getDoc() {
      return server.doc
    },
    async putDoc(envelope: Envelope, version: number | null): Promise<PutDocResult> {
      server.puts += 1
      if (server.beforePut) await server.beforePut()
      const current = server.doc
      const matches = version === null ? current === null : current?.version === version
      if (!matches) {
        if (!current) throw new Error('404 in fake')
        return { ok: false, conflict: current }
      }
      server.doc = { version: (current?.version ?? 0) + 1, envelope }
      return { ok: true, version: server.doc.version }
    },
    async putReminders(reminders: Reminder[]) {
      server.reminders = reminders
      server.reminderPuts += 1
      return { count: reminders.length }
    },
  }
  return { server, api }
}

async function encryptWith(doc: FamilyDoc, passphrase: string, salt = createSalt()) {
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  return encryptJson(doc, key, salt, ITERATIONS)
}

async function decryptWith(envelope: Envelope, passphrase: string): Promise<FamilyDoc> {
  const key = await deriveKey(passphrase, envelope.kdf.salt, envelope.kdf.iterations)
  return (await decryptJson(envelope, key)) as FamilyDoc
}

/** In-memory stand-in for IndexedDB. */
function fakeKeyStore() {
  const keys = { remembered: null as RememberedKey | null, failPut: false }
  const keyStore: KeyStore = {
    async get() {
      return keys.remembered
    },
    async put(remembered) {
      if (keys.failPut) return false
      keys.remembered = remembered
      return true
    },
    async delete() {
      keys.remembered = null
    },
  }
  return { keys, keyStore }
}

function setup() {
  const { server, api } = fakeApi()
  const { keys, keyStore } = fakeKeyStore()
  const store = createDocStore(memoryStorage())
  store.setFamilyKey('family')
  const newEngine = () =>
    createSyncEngine({ api, store, keyStore, iterations: ITERATIONS, now: () => NOW })
  return { server, store, keys, newEngine, engine: newEngine() }
}

const lena = (doc: FamilyDoc) =>
  addPerson(doc, { id: 'lena', name: 'Lena' }, { now: new Date('2026-10-01T00:00:00Z') })
const tom = (doc: FamilyDoc) =>
  addPerson(doc, { id: 'tom', name: 'Tom' }, { now: new Date('2026-10-02T00:00:00Z') })

describe('first device', () => {
  it('creates the server document with the passphrase and a new salt', async () => {
    const { server, store, engine } = setup()
    store.dispatch(lena)

    const result = await engine.unlock('geheim', false)

    expect(result).toEqual({ ok: true })
    expect(server.doc?.version).toBe(1)
    const onServer = await decryptWith(server.doc!.envelope, 'geheim')
    expect(onServer.persons.map((p) => p.name)).toEqual(['Lena'])
    expect(store.getMeta()).toEqual({ serverVersion: 1, dirty: false })
    expect(store.getSnapshot().connection.status).toBe('synced')
    expect(store.getServer()?.keyRemembered).toBe(false)
  })
})

describe('remembered key', () => {
  it('stores the derived key with its salt and iterations only when asked', async () => {
    const { server, store, keys, engine } = setup()
    await engine.unlock('geheim', false)
    expect(keys.remembered).toBeNull()

    await engine.unlock('geheim', true)
    expect(keys.remembered?.salt).toBe(server.doc!.envelope.kdf.salt)
    expect(keys.remembered?.iterations).toBe(ITERATIONS)
    expect(store.getServer()?.keyRemembered).toBe(true)
    // Never the passphrase itself.
    expect(JSON.stringify(store.getServer())).not.toContain('geheim')
  })

  it('is not remembered when the key store fails', async () => {
    const { store, keys, engine } = setup()
    keys.failPut = true
    await engine.unlock('geheim', true)
    expect(store.getServer()?.keyRemembered).toBe(false)
  })

  it('unlocks on the next start without a passphrase', async () => {
    const { server, store, keys, newEngine } = setup()
    await newEngine().unlock('geheim', true)
    store.dispatch(lena)

    const restarted = newEngine()
    await restarted.resume()

    expect(restarted.isUnlocked()).toBe(true)
    expect(store.getSnapshot().connection.status).toBe('synced')
    expect(keys.remembered).not.toBeNull()
    const onServer = await decryptWith(server.doc!.envelope, 'geheim')
    expect(onServer.persons.map((p) => p.name)).toEqual(['Lena'])
  })

  it('asks for the passphrase when the server uses another salt', async () => {
    const { server, store, keys, newEngine } = setup()
    await newEngine().unlock('geheim', true)
    server.doc = { version: 9, envelope: await encryptWith(lena(emptyDoc()), 'geheim') }

    const restarted = newEngine()
    await restarted.resume()

    expect(restarted.isUnlocked()).toBe(false)
    expect(store.getSnapshot().connection).toEqual({ status: 'locked', docExists: true })
    expect(keys.remembered).toBeNull()
    expect(store.getServer()?.keyRemembered).toBe(false)
  })

  it('only asks the server when nothing is remembered', async () => {
    const { server, store, newEngine } = setup()
    server.doc = { version: 2, envelope: await encryptWith(lena(emptyDoc()), 'geheim') }

    const restarted = newEngine()
    await restarted.resume()

    expect(restarted.isUnlocked()).toBe(false)
    expect(store.getSnapshot().connection).toEqual({ status: 'locked', docExists: true })
  })

  it('is deleted when unlocking again without "merken"', async () => {
    const { store, keys, engine } = setup()
    await engine.unlock('geheim', true)
    await engine.unlock('geheim', false)
    expect(keys.remembered).toBeNull()
    expect(store.getServer()?.keyRemembered).toBe(false)
  })
})

describe('other devices', () => {
  it('reports a wrong passphrase in German and stays locked', async () => {
    const { server, store, engine } = setup()
    server.doc = { version: 4, envelope: await encryptWith(lena(emptyDoc()), 'richtig') }

    const result = await engine.unlock('falsch', true)

    expect(result).toEqual({ ok: false, error: WRONG_PASSPHRASE })
    expect(store.getSnapshot().connection).toEqual({
      status: 'locked',
      docExists: true,
      error: WRONG_PASSPHRASE,
    })
    expect(store.getServer()?.keyRemembered).toBe(false)
    expect(engine.isUnlocked()).toBe(false)
  })

  it('pulls, merges local data in and pushes the result', async () => {
    const { server, store, engine } = setup()
    server.doc = { version: 2, envelope: await encryptWith(lena(emptyDoc()), 'geheim') }
    store.dispatch(tom)

    await engine.unlock('geheim', false)

    expect(store.getDoc().persons.map((p) => p.id)).toEqual(['lena', 'tom'])
    expect(server.doc.version).toBe(3)
    const onServer = await decryptWith(server.doc.envelope, 'geheim')
    expect(onServer.persons.map((p) => p.id)).toEqual(['lena', 'tom'])
    expect(store.getMeta()).toEqual({ serverVersion: 3, dirty: false })
  })

  it('does not PUT when the server copy already has everything', async () => {
    const { server, store, engine } = setup()
    server.doc = { version: 2, envelope: await encryptWith(lena(emptyDoc()), 'geheim') }
    await engine.unlock('geheim', false)
    const putsAfterUnlock = server.puts
    await engine.syncNow()
    expect(server.puts).toBe(putsAfterUnlock)
    expect(store.getMeta().dirty).toBe(false)
  })
})

describe('conflicts', () => {
  it('merges the 409 copy and retries the PUT', async () => {
    const { server, store, engine } = setup()
    await engine.unlock('geheim', false)
    const salt = server.doc!.envelope.kdf.salt

    // Another device adds Tom right before our PUT goes through.
    server.beforePut = async () => {
      server.beforePut = undefined
      const theirs = tom(await decryptWith(server.doc!.envelope, 'geheim'))
      server.doc = {
        version: server.doc!.version + 1,
        envelope: await encryptWith(theirs, 'geheim', salt),
      }
    }
    store.dispatch(lena)
    await engine.pushNow()

    const onServer = await decryptWith(server.doc!.envelope, 'geheim')
    expect(onServer.persons.map((p) => p.id)).toEqual(['lena', 'tom'])
    expect(store.getDoc().persons.map((p) => p.id)).toEqual(['lena', 'tom'])
    expect(store.getMeta()).toEqual({ serverVersion: 3, dirty: false })
    expect(store.getSnapshot().connection.status).toBe('synced')
  })

  it('gives up after 3 conflicting attempts', async () => {
    const { server, store, engine } = setup()
    await engine.unlock('geheim', false)
    const salt = server.doc!.envelope.kdf.salt
    server.beforePut = async () => {
      server.doc = {
        version: server.doc!.version + 1,
        envelope: await encryptWith(emptyDoc(), 'geheim', salt),
      }
    }
    const putsBefore = server.puts
    store.dispatch(lena)
    await engine.pushNow()

    expect(server.puts - putsBefore).toBe(3)
    expect(store.getSnapshot().connection.status).toBe('error')
    expect(store.getMeta().dirty).toBe(true)
  })
})

function zahnarzt(firstWindowStart: string) {
  return {
    id: 'c1',
    personId: 'lena',
    title: 'Zahnarzt',
    schedule: { kind: 'interval' as const, months: 6 },
    windowMonths: 3,
    bookingLeadWeeks: 6,
    firstWindowStart,
    active: true,
    updatedAt: '2026-10-03T00:00:00.000Z',
  }
}

describe('reminders', () => {
  it('uploads the plan after a successful PUT, with the reminder hour of the doc', async () => {
    const { server, store, engine } = setup()
    store.dispatch((doc) =>
      setReminderHour(lena(doc), 7, { now: new Date('2026-10-03T00:00:00Z') }),
    )
    store.dispatch((doc) => ({
      ...doc,
      checkups: [
        {
          id: 'c1',
          personId: 'lena',
          title: 'Zahnarzt',
          schedule: { kind: 'interval', months: 6 },
          windowMonths: 3,
          bookingLeadWeeks: 6,
          firstWindowStart: '2026-12-01',
          active: true,
          updatedAt: '2026-10-03T00:00:00.000Z',
        },
      ],
    }))

    await engine.unlock('geheim', false)

    expect(server.reminders.length).toBeGreaterThan(0)
    expect(server.reminders[0]!.title).toBe('Lena: Zahnarzt buchen')
    expect(server.reminders[0]!.at).toContain('T07:00:00')
  })

  it('skips the PUT while the plan is unchanged and uploads again after a change', async () => {
    const { server, store, engine } = setup()
    store.dispatch((doc) => ({
      ...lena(doc),
      checkups: [zahnarzt('2026-12-01')],
    }))
    await engine.unlock('geheim', false)
    expect(server.reminderPuts).toBe(1)

    // The document changes, the plan does not.
    store.dispatch(tom)
    await engine.pushNow()
    expect(server.puts).toBe(2)
    expect(server.reminderPuts).toBe(1)

    store.dispatch((doc) => ({ ...doc, checkups: [zahnarzt('2027-03-01')] }))
    await engine.pushNow()
    expect(server.reminderPuts).toBe(2)
  })

  it('uploads once again in a new session', async () => {
    const { server, store, engine } = setup()
    store.dispatch((doc) => ({ ...lena(doc), checkups: [zahnarzt('2026-12-01')] }))
    await engine.unlock('geheim', false)
    engine.lock()
    await engine.unlock('geheim', false)
    // The second unlock does not even PUT the doc, so only a later change reaches the reminders.
    expect(server.reminderPuts).toBe(1)
    store.dispatch(tom)
    await engine.pushNow()
    expect(server.reminderPuts).toBe(2)
  })
})
