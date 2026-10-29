import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  createSalt,
  decryptJson,
  deriveKey,
  encryptJson,
  envelopeSchema,
  WrongPassphraseError,
} from './envelope'

// Low iteration count keeps the suite fast; production uses DEFAULT_ITERATIONS.
const ITERATIONS = 1000
const sample = { persons: [{ id: 'p1', name: 'Lena' }], checkups: [], tombstones: [] }

function flipFirstByte(base64: string): string {
  const bytes = base64ToBytes(base64)
  bytes[0] = (bytes[0] ?? 0) ^ 0xff
  return bytesToBase64(bytes)
}

describe('createSalt', () => {
  it('returns 16 random bytes as base64, different on every call', () => {
    const first = createSalt()
    const second = createSalt()
    expect(base64ToBytes(first)).toHaveLength(16)
    expect(first).not.toBe(second)
  })
})

describe('deriveKey', () => {
  it('returns a non-extractable AES-GCM key usable for encrypt and decrypt', async () => {
    const key = await deriveKey('geheim', createSalt(), ITERATIONS)
    expect(key.algorithm.name).toBe('AES-GCM')
    expect(key.extractable).toBe(false)
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt'])
  })
})

describe('encryptJson / decryptJson', () => {
  it('roundtrips a JSON value and produces a schema-valid envelope', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)
    const envelope = await encryptJson(sample, key, salt, ITERATIONS)

    expect(envelopeSchema.parse(envelope)).toEqual(envelope)
    expect(envelope.v).toBe(1)
    expect(envelope.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt })
    expect(envelope.cipher.name).toBe('AES-GCM')
    expect(base64ToBytes(envelope.cipher.iv)).toHaveLength(12)
    expect(await decryptJson(envelope, key)).toEqual(sample)
  })

  it('uses a fresh IV for every encryption', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)
    const first = await encryptJson(sample, key, salt, ITERATIONS)
    const second = await encryptJson(sample, key, salt, ITERATIONS)
    expect(first.cipher.iv).not.toBe(second.cipher.iv)
    expect(first.data).not.toBe(second.data)
  })

  it('throws WrongPassphraseError for a wrong passphrase', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)
    const envelope = await encryptJson(sample, key, salt, ITERATIONS)
    const wrongKey = await deriveKey('falsch', salt, ITERATIONS)

    await expect(decryptJson(envelope, wrongKey)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('throws WrongPassphraseError when the ciphertext is tampered with', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)
    const envelope = await encryptJson(sample, key, salt, ITERATIONS)
    const tampered = { ...envelope, data: flipFirstByte(envelope.data) }

    await expect(decryptJson(tampered, key)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('throws WrongPassphraseError when the IV is tampered with', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)
    const envelope = await encryptJson(sample, key, salt, ITERATIONS)
    const tampered = {
      ...envelope,
      cipher: { ...envelope.cipher, iv: flipFirstByte(envelope.cipher.iv) },
    }

    await expect(decryptJson(tampered, key)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('decrypts on a second device with the same passphrase and salt', async () => {
    const salt = createSalt()
    const deviceA = await deriveKey('geheim', salt, ITERATIONS)
    const envelope = await encryptJson(sample, deviceA, salt, ITERATIONS)

    // A separate derivation simulates another device: the key is never shared, only the salt.
    const deviceB = await deriveKey('geheim', envelope.kdf.salt, envelope.kdf.iterations)
    expect(await decryptJson(envelope, deviceB)).toEqual(sample)
  })

  it('roundtrips a payload larger than the base64 chunk size', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)
    const large = { text: 'x'.repeat(1_000_000) }
    const envelope = await encryptJson(large, key, salt, ITERATIONS)

    expect(await decryptJson(envelope, key)).toEqual(large)
  })

  it('rejects values that cannot be serialized to JSON', async () => {
    const salt = createSalt()
    const key = await deriveKey('geheim', salt, ITERATIONS)

    await expect(encryptJson(undefined, key, salt, ITERATIONS)).rejects.toBeInstanceOf(TypeError)
  })
})

describe('base64 helpers', () => {
  it('roundtrips 1 MB of bytes', () => {
    // Deterministic pattern: getRandomValues is limited to 64 KB per call.
    const bytes = new Uint8Array(1_000_000).map((_, index) => index % 251)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('matches the standard base64 encoding of known input', () => {
    expect(bytesToBase64(new TextEncoder().encode('Lena'))).toBe('TGVuYQ==')
    expect(new TextDecoder().decode(base64ToBytes('TGVuYQ=='))).toBe('Lena')
  })
})
