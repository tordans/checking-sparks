import { describe, expect, it } from 'vitest'
import { createSalt, decryptJson, deriveKey, encryptJson } from '@/crypto/envelope'
import type { Envelope } from '@/crypto/envelope'
import { addPerson, setReminderHour } from '@/domain/actions'
import { emptyDoc } from '@/domain/model'
import type { FamilyDoc } from '@/domain/model'
import type { Reminder } from '@/domain/reminders'
import type { DocResponse, PutDocResult } from './api-client'
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

function setup() {
  const { server, api } = fakeApi()
  const store = createDocStore(memoryStorage())
  store.setFamilyKey('family')
  const engine = createSyncEngine({ api, store, iterations: ITERATIONS, now: () => NOW })
  return { server, store, engine }
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
    expect(store.getServer()?.passphrase).toBeUndefined()
  })

  it('remembers the passphrase only when asked', async () => {
    const { store, engine } = setup()
    await engine.unlock('geheim', true)
    expect(store.getServer()?.passphrase).toBe('geheim')
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
    expect(store.getServer()?.passphrase).toBeUndefined()
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
})
