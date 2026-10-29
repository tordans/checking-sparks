import { describe, expect, it } from 'vitest'
import type { Envelope } from '../crypto/envelope'
import type { Reminder } from '../domain/reminders'
import { ApiError, createApiClient, type FetchLike } from './api-client'

const FAMILY_KEY = 'test-family-key'

const envelope: Envelope = {
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: 'c2FsdA==' },
  cipher: { name: 'AES-GCM', iv: 'aXZpdml2aXZpdg==' },
  data: 'ZGF0YQ==',
}

const reminder: Reminder = {
  id: 'c1:2026-01-01:book-open:2026-01-01',
  at: '2026-01-01T09:00:00+01:00',
  title: 'Lena: Zahnarzt buchen',
  body: 'Termin bis 31.03. machen.',
  path: '/person/p1/vorsorge/c1',
}

type RecordedCall = { url: string; method: string; headers: Headers; body: unknown }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Fake fetch that records every request and answers with `respond`. */
function fakeFetch(respond: (call: RecordedCall) => Response) {
  const calls: RecordedCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body,
    }
    calls.push(call)
    return respond(call)
  }
  return { fetch, calls }
}

function clientWith(respond: (call: RecordedCall) => Response) {
  const recorder = fakeFetch(respond)
  const api = createApiClient({ familyKey: FAMILY_KEY, fetch: recorder.fetch })
  return { api, calls: recorder.calls }
}

describe('createApiClient headers and URLs', () => {
  it('sends the family key as Bearer token on authenticated endpoints', async () => {
    const { api, calls } = clientWith(() => json({ version: 1, envelope }))
    await api.getDoc()

    expect(calls[0]?.headers.get('Authorization')).toBe(`Bearer ${FAMILY_KEY}`)
    expect(calls[0]?.url).toBe('/api/doc')
  })

  it('calls health without the Authorization header because it is public', async () => {
    const { api, calls } = clientWith(() => json({ ok: true, commit: 'abc1234' }))
    const result = await api.health()

    expect(result).toEqual({ ok: true, commit: 'abc1234' })
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('/api/health')
    expect(calls[0]?.headers.has('Authorization')).toBe(false)
  })

  it('prefixes every URL with baseUrl and strips trailing slashes', async () => {
    const recorder = fakeFetch(() => json({ ok: true, commit: 'abc' }))
    const api = createApiClient({
      baseUrl: 'https://check.example.test//',
      familyKey: FAMILY_KEY,
      fetch: recorder.fetch,
    })
    await api.health()

    expect(recorder.calls[0]?.url).toBe('https://check.example.test/api/health')
  })
})

describe('getDoc', () => {
  it('returns version and envelope', async () => {
    const { api } = clientWith(() => json({ version: 4, envelope }))
    expect(await api.getDoc()).toEqual({ version: 4, envelope })
  })

  it('returns null on 404', async () => {
    const { api } = clientWith(() => new Response(null, { status: 404 }))
    expect(await api.getDoc()).toBeNull()
  })

  it('throws ApiError with the status on server errors', async () => {
    const { api } = clientWith(() => new Response('boom', { status: 500 }))

    const error = await api.getDoc().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })

  it('throws ApiError when the body does not match the contract', async () => {
    const { api } = clientWith(() => json({ version: -1, envelope: { v: 2 } }))

    const error = await api.getDoc().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 200 })
  })

  it('throws ApiError when the body is not JSON', async () => {
    const { api } = clientWith(() => new Response('<html>', { status: 200 }))
    await expect(api.getDoc()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('putDoc', () => {
  it('creates the document with If-None-Match when version is null', async () => {
    const { api, calls } = clientWith(() => json({ version: 1 }))
    const result = await api.putDoc(envelope, null)

    expect(result).toEqual({ ok: true, version: 1 })
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.headers.get('If-None-Match')).toBe('*')
    expect(calls[0]?.headers.has('If-Match')).toBe(false)
    expect(calls[0]?.headers.get('Content-Type')).toBe('application/json')
    expect(calls[0]?.body).toEqual({ envelope })
  })

  it('updates with a quoted If-Match when version is a number', async () => {
    const { api, calls } = clientWith(() => json({ version: 4 }))
    const result = await api.putDoc(envelope, 3)

    expect(result).toEqual({ ok: true, version: 4 })
    expect(calls[0]?.headers.get('If-Match')).toBe('"3"')
    expect(calls[0]?.headers.has('If-None-Match')).toBe(false)
  })

  it('maps 409 to a conflict result with the server copy', async () => {
    const { api } = clientWith(() => json({ version: 7, envelope }, 409))
    const result = await api.putDoc(envelope, 3)

    expect(result).toEqual({ ok: false, conflict: { version: 7, envelope } })
  })

  it('throws ApiError on 428 (missing precondition)', async () => {
    const { api } = clientWith(() => new Response(null, { status: 428 }))

    const error = await api.putDoc(envelope, null).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 428 })
  })

  it('throws ApiError when a 200 response has no version', async () => {
    const { api } = clientWith(() => json({ ok: true }))
    await expect(api.putDoc(envelope, null)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('putReminders', () => {
  it('sends the reminders and returns the count', async () => {
    const { api, calls } = clientWith(() => json({ count: 1 }))
    const result = await api.putReminders([reminder])

    expect(result).toEqual({ count: 1 })
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url).toBe('/api/reminders')
    expect(calls[0]?.body).toEqual({ reminders: [reminder] })
  })

  it('throws ApiError on failure', async () => {
    const { api } = clientWith(() => new Response('nope', { status: 401 }))
    await expect(api.putReminders([])).rejects.toMatchObject({ status: 401 })
  })
})

describe('push endpoints', () => {
  it('fetches the VAPID public key', async () => {
    const { api, calls } = clientWith(() => json({ key: 'BPublicKey' }))

    expect(await api.getVapidPublicKey()).toEqual({ key: 'BPublicKey' })
    expect(calls[0]?.url).toBe('/api/push/vapid-public-key')
    expect(calls[0]?.headers.get('Authorization')).toBe(`Bearer ${FAMILY_KEY}`)
  })

  it('posts only the contract fields of a subscription', async () => {
    const { api, calls } = clientWith(() => new Response(null, { status: 201 }))
    await api.subscribe({
      endpoint: 'https://push.example.test/abc',
      keys: { p256dh: 'p256', auth: 'auth' },
      label: 'iPhone Tobias',
    })

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('/api/push/subscriptions')
    expect(calls[0]?.body).toEqual({
      endpoint: 'https://push.example.test/abc',
      keys: { p256dh: 'p256', auth: 'auth' },
      label: 'iPhone Tobias',
    })
  })

  it('throws ApiError when subscribing fails', async () => {
    const { api } = clientWith(() => new Response(null, { status: 400 }))
    await expect(
      api.subscribe({ endpoint: 'x', keys: { p256dh: 'a', auth: 'b' }, label: 'l' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('deletes a subscription by endpoint', async () => {
    const { api, calls } = clientWith(() => new Response(null, { status: 204 }))
    await api.unsubscribe('https://push.example.test/abc')

    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.url).toBe('/api/push/subscriptions')
    expect(calls[0]?.body).toEqual({ endpoint: 'https://push.example.test/abc' })
  })

  it('triggers a test push', async () => {
    const { api, calls } = clientWith(() => json({ sent: 2, failed: 0, removed: 1 }))
    expect(await api.testPush()).toEqual({ sent: 2, failed: 0, removed: 1 })

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('/api/push/test')
    expect(calls[0]?.headers.get('Authorization')).toBe(`Bearer ${FAMILY_KEY}`)
  })

  it('throws ApiError when the test push fails', async () => {
    const { api } = clientWith(() => new Response(null, { status: 500 }))
    await expect(api.testPush()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('ApiError', () => {
  it('carries the HTTP status and a message without response bodies', () => {
    const error = new ApiError(409, 'PUT /api/doc failed with HTTP 409')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ApiError')
    expect(error.status).toBe(409)
    expect(error.message).toBe('PUT /api/doc failed with HTTP 409')
  })
})
