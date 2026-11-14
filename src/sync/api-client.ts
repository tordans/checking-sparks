import * as z from 'zod/mini'
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
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Server documents (also the 409 conflict body) are checked fully: they decide what gets decrypted. */
const docSchema = z.object({
  version: z.int().check(z.nonnegative()),
  envelope: envelopeSchema,
})

type CallOptions = {
  body?: unknown
  headers?: Record<string, string>
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
    headers.set('Authorization', `Bearer ${familyKey}`)
    let body: string | undefined
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(options.body)
    }
    return fetch(`${root}${path}`, { method, headers, body })
  }

  return {
    /** Returns `null` when no document exists yet (404). */
    async getDoc(): Promise<DocResponse | null> {
      const label = 'GET /api/doc'
      const response = await call('GET', '/api/doc')
      if (response.status === 404) {
        return null
      }
      assertOk(response, label)
      return readDoc(response, label)
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
        return { ok: false, conflict: await readDoc(response, label) }
      }
      assertOk(response, label)
      const { version: created } = await readObject(response, label)
      if (typeof created !== 'number') throw unexpected(response, label)
      return { ok: true, version: created }
    },

    async putReminders(reminders: Reminder[]): Promise<void> {
      const response = await call('PUT', '/api/reminders', { body: { reminders } })
      assertOk(response, 'PUT /api/reminders')
    },

    async getVapidPublicKey(): Promise<{ key: string }> {
      const label = 'GET /api/push/vapid-public-key'
      const response = await call('GET', '/api/push/vapid-public-key')
      assertOk(response, label)
      const { key } = await readObject(response, label)
      if (typeof key !== 'string' || key === '') throw unexpected(response, label)
      return { key }
    },

    async subscribe({ endpoint, keys }: PushSubscriptionInput): Promise<void> {
      const response = await call('POST', '/api/push/subscriptions', { body: { endpoint, keys } })
      assertOk(response, 'POST /api/push/subscriptions')
    },

    async unsubscribe(endpoint: string): Promise<void> {
      const response = await call('DELETE', '/api/push/subscriptions', { body: { endpoint } })
      assertOk(response, 'DELETE /api/push/subscriptions')
    },

    /** Sends a test notification to every subscribed device; returns how many were reached. */
    async testPush(): Promise<{ sent: number }> {
      const label = 'POST /api/push/test'
      const response = await call('POST', '/api/push/test')
      assertOk(response, label)
      const { sent } = await readObject(response, label)
      if (typeof sent !== 'number') throw unexpected(response, label)
      return { sent }
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

function assertOk(response: Response, label: string): void {
  if (!response.ok) {
    throw new ApiError(response.status, `${label} failed with HTTP ${response.status}`)
  }
}

function unexpected(response: Response, label: string): ApiError {
  return new ApiError(response.status, `${label}: unexpected response`)
}

async function readObject(response: Response, label: string): Promise<Record<string, unknown>> {
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new ApiError(response.status, `${label}: response is not valid JSON`)
  }
  if (typeof json !== 'object' || json === null) throw unexpected(response, label)
  return json as Record<string, unknown>
}

async function readDoc(response: Response, label: string): Promise<DocResponse> {
  const result = z.safeParse(docSchema, await readObject(response, label))
  if (!result.success) throw unexpected(response, label)
  return result.data
}
