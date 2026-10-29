import { useEffect, useState } from 'react'
import {
  currentDeviceLabel,
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
import { Input } from './catalyst/input'
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

/** Push notifications of this device (docs/architecture.md, "PWA and push"). */
export function PushSettings() {
  const server = useServerConfig()
  const connection = useConnection()
  const [device, setDevice] = useState<DeviceState>({ kind: 'loading' })
  const [label, setLabel] = useState(currentDeviceLabel)
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
      <Field>
        <Label>Benachrichtigungen</Label>
        <Description>
          Erinnerungen kommen vom Server. Verbinde dieses Gerät zuerst unter „Synchronisieren“, dann
          kannst du hier Benachrichtigungen aktivieren.
        </Description>
      </Field>
    )
  }

  if (device.kind === 'loading') {
    return <Text>Benachrichtigungen werden geprüft …</Text>
  }

  if (device.support === 'ios-not-installed') {
    return (
      <Field>
        <Label>Benachrichtigungen</Label>
        <Description>
          Auf dem iPhone: Teilen → Zum Home-Bildschirm, dann hier aktivieren. Das geht nur in der
          App vom Home-Bildschirm, nicht in Safari.
        </Description>
      </Field>
    )
  }

  if (device.support === 'unsupported') {
    return (
      <Field>
        <Label>Benachrichtigungen</Label>
        <Description>
          Dieser Browser unterstützt keine Benachrichtigungen. Auf Android und am Computer geht es
          mit Chrome, Edge und Firefox, auf dem iPhone mit der App vom Home-Bildschirm.
        </Description>
      </Field>
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
    run(async () => {
      const result = await enablePush(api, label)
      if (result.ok) return { tone: 'info', text: 'Benachrichtigungen sind aktiv.' }
      switch (result.reason) {
        case 'denied':
          return {
            tone: 'error',
            text: 'Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen des Browsers für diese Seite.',
          }
        case 'dismissed':
          return {
            tone: 'info',
            text: 'Du hast die Anfrage geschlossen. Es wurde nichts aktiviert.',
          }
        case 'no-service-worker':
          return {
            tone: 'error',
            text: 'Der Hintergrunddienst ist nicht aktiv. Das gibt es nur in der installierten bzw. veröffentlichten Version der App.',
          }
      }
    })

  const test = () =>
    run(async () => {
      const result = await api.testPush()
      if (result.sent > 0) {
        return {
          tone: 'info',
          text: `Test gesendet an ${result.sent === 1 ? '1 Gerät' : `${result.sent} Geräte`}. Er sollte gleich erscheinen.`,
        }
      }
      if (result.removed > 0) {
        return {
          tone: 'error',
          text: 'Der Push-Dienst kennt dieses Gerät nicht mehr. Deaktiviere die Benachrichtigungen und aktiviere sie erneut.',
        }
      }
      return {
        tone: 'error',
        text:
          result.failed > 0
            ? 'Der Push-Dienst hat den Test nicht angenommen. Versuche es gleich noch einmal.'
            : 'Es ist kein Gerät angemeldet.',
      }
    })

  const disable = () =>
    run(async () => {
      await disablePush(api)
      return { tone: 'info', text: 'Benachrichtigungen sind auf diesem Gerät aus.' }
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
          {device.permission === 'denied' ? (
            <Text>
              Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den Einstellungen
              des Browsers und lade die Seite neu.
            </Text>
          ) : (
            <Field>
              <Label>Name dieses Geräts</Label>
              <Description>
                Der Server erinnert dich ans Buchen und Bestätigen, auch wenn die App zu ist. Mit
                dem Namen erkennst du dieses Gerät wieder.
              </Description>
              <Input
                value={label}
                maxLength={100}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
          )}
          <Button
            disabled={busy || device.permission === 'denied' || label.trim() === ''}
            onClick={() => void enable()}
          >
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
