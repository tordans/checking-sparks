import { z } from 'zod'

/** PBKDF2 iteration count used for new families (see docs/architecture.md, "Encryption"). */
export const DEFAULT_ITERATIONS = 600_000

const IV_BYTES = 12
const SALT_BYTES = 16
// Keeps `String.fromCharCode(...chunk)` well below the engine's argument-count limit.
const BASE64_CHUNK_SIZE = 0x8000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const envelopeSchema = z.object({
  v: z.literal(1),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().positive(),
    salt: z.base64(),
  }),
  cipher: z.object({
    name: z.literal('AES-GCM'),
    iv: z.base64(),
  }),
  data: z.base64(),
})

export type Envelope = z.infer<typeof envelopeSchema>

/** Thrown when AES-GCM authentication fails: wrong passphrase or tampered envelope. */
export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase or corrupted data')
    this.name = 'WrongPassphraseError'
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

/** Random 16-byte salt, base64. Created once per family and shared by all devices. */
export function createSalt(): string {
  return bytesToBase64(randomBytes(SALT_BYTES))
}

/** PBKDF2-SHA-256 → AES-GCM 256. The key is non-extractable. */
export async function deriveKey(
  passphrase: string,
  salt: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  const { subtle } = globalThis.crypto
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypts a JSON-serializable value with a fresh random IV. */
export async function encryptJson(
  value: unknown,
  key: CryptoKey,
  salt: string,
  iterations: number,
): Promise<Envelope> {
  const json = JSON.stringify(value)
  if (typeof json !== 'string') {
    throw new TypeError('Value is not JSON-serializable')
  }
  const iv = randomBytes(IV_BYTES)
  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(json),
  )
  return {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    data: bytesToBase64(new Uint8Array(cipherBuffer)),
  }
}

/** Decrypts an envelope. Throws `WrongPassphraseError` when AES-GCM authentication fails. */
export async function decryptJson(envelope: Envelope, key: CryptoKey): Promise<unknown> {
  const iv = base64ToBytes(envelope.cipher.iv)
  const data = base64ToBytes(envelope.data)
  let plainBuffer: ArrayBuffer
  try {
    plainBuffer = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  } catch {
    throw new WrongPassphraseError()
  }
  return JSON.parse(decoder.decode(plainBuffer))
}
