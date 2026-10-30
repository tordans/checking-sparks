import { describe, expect, it } from 'vitest'
import { createDocStore, memoryStorage } from './store'

const SERVER_KEY = 'checking-sparks:server:v1'

describe('server config', () => {
  it('drops a plaintext passphrase from an older version and removes it from storage', () => {
    const storage = memoryStorage()
    storage.setItem(SERVER_KEY, JSON.stringify({ familyKey: 'family', passphrase: 'geheim' }))

    const store = createDocStore(storage)

    expect(store.getServer()).toEqual({ familyKey: 'family', keyRemembered: false })
    expect(store.getSnapshot().server).toEqual({ familyKey: 'family', keyRemembered: false })
    expect(storage.getItem(SERVER_KEY)).not.toContain('geheim')
    expect(storage.getItem(SERVER_KEY)).not.toContain('passphrase')
  })

  it('keeps the remembered-key flag', () => {
    const storage = memoryStorage()
    const store = createDocStore(storage)
    store.setFamilyKey('family')
    store.setKeyRemembered(true)

    expect(createDocStore(storage).getServer()).toEqual({
      familyKey: 'family',
      keyRemembered: true,
    })
  })
})
