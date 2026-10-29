import { z } from 'zod'
import { type Envelope, envelopeSchema } from '../crypto/envelope'
import type { Reminder } from '../domain/reminders'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type DocResponse = { version: number; envelope: Envelope }

export type PutDocResult = { ok: true; version: number } | { ok: false; conflict: DocResponse }

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  label: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const versionSchema = z.number().int().nonnegative()

const healthSchema = z.object({ ok: z.literal(true), commit: z.string() })
const docSchema = z.object({ version: versionSchema, envelope: envelopeSchema })
const putDocSchema = z.object({ version: versionSchema })
const remindersSchema = z.object({ count: z.number().int().nonnegative() })
const vapidKeySchema = z.object({ key: z.string().min(1) })

type CallOptions = {
  body?: unknown
  headers?: Record<string, string>
  /** Only `health` is public; every other endpoint needs the family key. */
  auth?: boolean
}

export function createApiClient({
  baseUrl = '',
  familyKey,
  fetch = globalThis.fetch,
}: {
  baseUrl?: string
  familyKey: string
  fetch?: FetchLike
}) {
  const root = baseUrl.replace(/\/+$/, '')

  function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers)
    if (options.auth !== false) {
      headers.set('Authorization', `Bearer ${familyKey}`)
    }
    let body: string | undefined
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(options.body)
    }
    return fetch(`${root}${path}`, { method, headers, body })
  }

  return {
    async health(): Promise<{ ok: true; commit: string }> {
      const label = 'GET /api/health'
      const response = await call('GET', '/api/health', { auth: false })
      assertOk(response, label)
      return readJson(response, label, healthSchema)
    },

    /** Returns `null` when no document exists yet (404). */
    async getDoc(): Promise<DocResponse | null> {
      const label = 'GET /api/doc'
      const response = await call('GET', '/api/doc')
      if (response.status === 404) {
        return null
      }
      assertOk(response, label)
      return readJson(response, label, docSchema)
    },

    /**
     * `version: null` creates the document (`If-None-Match: *`), a number updates it
     * (`If-Match`). A 409 is returned as `{ ok: false, conflict }`, not thrown.
     */
    async putDoc(envelope: Envelope, version: number | null): Promise<PutDocResult> {
      const label = 'PUT /api/doc'
      const precondition: Record<string, string> =
        version === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${version}"` }
      const response = await call('PUT', '/api/doc', {
        body: { envelope },
        headers: precondition,
      })
      if (response.status === 409) {
        return { ok: false, conflict: await readJson(response, label, docSchema) }
      }
      assertOk(response, label)
      const result = await readJson(response, label, putDocSchema)
      return { ok: true, version: result.version }
    },

    async putReminders(reminders: Reminder[]): Promise<{ count: number }> {
      const label = 'PUT /api/reminders'
      const response = await call('PUT', '/api/reminders', { body: { reminders } })
      assertOk(response, label)
      return readJson(response, label, remindersSchema)
    },

    async getVapidPublicKey(): Promise<{ key: string }> {
      const label = 'GET /api/push/vapid-public-key'
      const response = await call('GET', '/api/push/vapid-public-key')
      assertOk(response, label)
      return readJson(response, label, vapidKeySchema)
    },

    async subscribe(subscription: PushSubscriptionInput): Promise<void> {
      const response = await call('POST', '/api/push/subscriptions', {
        body: {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          label: subscription.label,
        },
      })
      assertOk(response, 'POST /api/push/subscriptions')
    },

    async unsubscribe(endpoint: string): Promise<void> {
      const response = await call('DELETE', '/api/push/subscriptions', { body: { endpoint } })
      assertOk(response, 'DELETE /api/push/subscriptions')
    },

    async testPush(): Promise<void> {
      const response = await call('POST', '/api/push/test')
      assertOk(response, 'POST /api/push/test')
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

function assertOk(response: Response, label: string): void {
  if (!response.ok) {
    throw new ApiError(response.status, `${label} failed with HTTP ${response.status}`)
  }
}

async function readJson<T>(response: Response, label: string, schema: z.ZodType<T>): Promise<T> {
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new ApiError(response.status, `${label}: response is not valid JSON`)
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    throw new ApiError(response.status, `${label}: unexpected response shape`)
  }
  return result.data
}
