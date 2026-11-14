import { useEffect, useState } from 'react'
import {
  currentSubscription,
  describePushError,
  disablePush,
  enablePush,
  pushSupport,
  readPushEnvironment,
} from '@/push/subscribe'
import type { PushSupport } from '@/push/subscribe'
import { createApiClient } from '@/sync/api-client'
import { useConnection, useServerConfig } from '@/sync/store'
import { Button } from './catalyst/button'
import { Description, Field, Label } from './catalyst/fieldset'
import { Strong, Text } from './catalyst/text'

type DeviceState =
  | { kind: 'loading' }
  | { kind: 'ready'; support: PushSupport; permission: NotificationPermission; subscribed: boolean }

async function readDeviceState(): Promise<DeviceState> {
  const support = pushSupport(readPushEnvironment())
  if (support !== 'supported') {
    return { kind: 'ready', support, permission: 'default', subscribed: false }
  }
  const subscription = await currentSubscription().catch(() => null)
  return {
    kind: 'ready',
    support,
    permission: Notification.permission,
    subscribed: subscription !== null && Notification.permission === 'granted',
  }
}

type Message = { tone: 'info' | 'error'; text: string }

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Field>
      <Label>Benachrichtigungen</Label>
      <Description>{children}</Description>
    </Field>
  )
}

/** Push notifications of this device (docs/architecture.md, "PWA and push"). */
export function PushSettings() {
  const server = useServerConfig()
  const connection = useConnection()
  const [device, setDevice] = useState<DeviceState>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    let cancelled = false
    void readDeviceState().then((state) => {
      if (!cancelled) setDevice(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = async () => setDevice(await readDeviceState())

  if (!server) {
    return (
      <Hint>
        Erinnerungen kommen vom Server. Verbinde dieses Gerät zuerst unter „Synchronisieren“, dann
        kannst du hier Benachrichtigungen aktivieren.
      </Hint>
    )
  }

  if (device.kind === 'loading') {
    return <Text>Benachrichtigungen werden geprüft …</Text>
  }

  if (device.support === 'ios-not-installed') {
    return (
      <Hint>
        Auf dem iPhone: Teilen → Zum Home-Bildschirm, dann hier aktivieren. Das geht nur in der App
        vom Home-Bildschirm, nicht in Safari.
      </Hint>
    )
  }

  if (device.support === 'unsupported') {
    return (
      <Hint>
        Dieser Browser unterstützt keine Benachrichtigungen. Auf Android und am Computer geht es mit
        Chrome, Edge und Firefox, auf dem iPhone mit der App vom Home-Bildschirm.
      </Hint>
    )
  }

  const run = async (action: () => Promise<Message | null>) => {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (error) {
      setMessage({ tone: 'error', text: describePushError(error) })
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  const api = createApiClient({ familyKey: server.familyKey })

  const enable = () =>
    run(async () =>
      (await enablePush(api))
        ? null
        : {
            tone: 'error',
            text: 'Benachrichtigungen wurden nicht aktiviert. Erlaube sie in den Einstellungen des Browsers für diese Seite und versuche es erneut.',
          },
    )

  const test = () =>
    run(async () => {
      const { sent } = await api.testPush()
      return sent > 0
        ? { tone: 'info', text: 'Test gesendet. Er sollte gleich erscheinen.' }
        : {
            tone: 'error',
            text: 'Der Test ist nicht angekommen. Deaktiviere die Benachrichtigungen und aktiviere sie erneut.',
          }
    })

  const disable = () =>
    run(async () => {
      await disablePush(api)
      return null
    })

  return (
    <div className="space-y-4">
      {device.subscribed ? (
        <>
          <Text>
            Benachrichtigungen sind auf diesem Gerät <Strong>aktiv</Strong>.
          </Text>
          <div className="flex flex-wrap gap-2">
            <Button outline disabled={busy} onClick={() => void test()}>
              Test senden
            </Button>
            <Button plain disabled={busy} onClick={() => void disable()}>
              Auf diesem Gerät deaktivieren
            </Button>
          </div>
        </>
      ) : (
        <>
          <Text>
            {device.permission === 'denied'
              ? 'Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den Einstellungen des Browsers und lade die Seite neu.'
              : 'Der Server erinnert dich ans Buchen und Bestätigen, auch wenn die App zu ist.'}
          </Text>
          <Button disabled={busy || device.permission === 'denied'} onClick={() => void enable()}>
            Benachrichtigungen aktivieren
          </Button>
        </>
      )}

      {connection.status === 'locked' && (
        <Text>
          Die Erinnerungen werden erst geplant, wenn du die Passphrase eingegeben hast und
          synchronisiert wurde.
        </Text>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={
            message.tone === 'error'
              ? 'text-base/6 text-red-600 sm:text-sm/6 dark:text-red-400'
              : 'text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400'
          }
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
