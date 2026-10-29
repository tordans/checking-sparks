import { createRoute, redirect } from '@tanstack/react-router'
import { Card } from '@/components/card'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Page } from '@/components/page'
import { PassphraseForm } from '@/components/passphrase-form'
import { useConnection, useServerConfig } from '@/sync/store'
import { pairDevice, syncNow } from '@/sync/sync'
import { rootRoute } from './root'

/** `/verbinden#key=<familyKey>`: stores the key and removes the fragment from the address bar. */
export const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verbinden',
  beforeLoad: ({ location }) => {
    if (!location.hash) return
    const key = new URLSearchParams(location.hash).get('key')?.trim()
    if (key) pairDevice(key)
    // Navigating without the hash replaces the history entry, so the key does not stay visible.
    throw redirect({ to: '/verbinden', replace: true })
  },
  component: PairPage,
})

function PairPage() {
  const server = useServerConfig()
  const connection = useConnection()

  if (!server) {
    return (
      <Page>
        <Heading>Gerät verbinden</Heading>
        <Card>
          <Text>
            Kein Familienschlüssel gefunden. Öffne den Link für ein weiteres Gerät aus den
            Einstellungen eines verbundenen Geräts, oder den Link, den du beim Einrichten des
            Servers bekommen hast.
          </Text>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <Heading>Gerät verbinden</Heading>
      <Card className="space-y-4">
        {connection.status === 'locked' &&
          (connection.docExists === null ? (
            <>
              <Text>Der Server ist gerade nicht erreichbar. Versuch es gleich noch einmal.</Text>
              <Button outline onClick={() => void syncNow()}>
                Erneut versuchen
              </Button>
            </>
          ) : (
            <>
              <Text>
                {connection.docExists
                  ? 'Gib eure Familien-Passphrase ein, um die Daten auf diesem Gerät zu entschlüsseln.'
                  : 'Dieses Gerät ist das erste. Lege eine Passphrase für eure Familie fest.'}
              </Text>
              <PassphraseForm
                create={!connection.docExists}
                {...(connection.error ? { initialError: connection.error } : {})}
              />
            </>
          ))}
        {connection.status === 'syncing' && <Text>Verbinde…</Text>}
        {(connection.status === 'synced' || connection.status === 'offline') && (
          <>
            <Text>
              {connection.status === 'synced'
                ? 'Verbunden. Änderungen werden ab jetzt automatisch abgeglichen.'
                : 'Verbunden, aber gerade offline. Wir gleichen ab, sobald das Netz wieder da ist.'}
            </Text>
            <Button href="/">Zu „Jetzt zu tun“</Button>
          </>
        )}
        {connection.status === 'error' && (
          <>
            <Text>{connection.message}</Text>
            <Button outline onClick={() => void syncNow()}>
              Erneut versuchen
            </Button>
          </>
        )}
      </Card>
    </Page>
  )
}
