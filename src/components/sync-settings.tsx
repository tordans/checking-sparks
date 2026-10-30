import { useState } from 'react'
import { useConnection, useServerConfig } from '@/sync/store'
import { disconnect, forgetRememberedKey, syncNow } from '@/sync/sync'
import { Button } from './catalyst/button'
import { Checkbox, CheckboxField } from './catalyst/checkbox'
import { Description, Field, Label } from './catalyst/fieldset'
import { Input } from './catalyst/input'
import { Strong, Text } from './catalyst/text'
import { ConfirmDialog } from './confirm-dialog'
import { PassphraseForm } from './passphrase-form'
import { connectionLabel } from './sync-status'

function pairingLink(familyKey: string): string {
  return `${window.location.origin}/verbinden#key=${encodeURIComponent(familyKey)}`
}

export function SyncSettings() {
  const connection = useConnection()
  const server = useServerConfig()
  const [copied, setCopied] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  if (!server) {
    return (
      <div className="space-y-2">
        <Text>
          Deine Daten sind nur auf diesem Gerät gespeichert. Zum Synchronisieren öffne den
          Familien-Link (<code>…/verbinden#key=…</code>) auf diesem Gerät.
        </Text>
      </div>
    )
  }

  const link = pairingLink(server.familyKey)
  const unlocked = connection.status !== 'locked' && connection.status !== 'error'

  return (
    <div className="space-y-6">
      <Text>
        Status: <Strong>{connectionLabel(connection)}</Strong>
        {connection.status === 'synced' &&
          ` um ${new Date(connection.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
        {connection.status === 'error' && ` – ${connection.message}`}
      </Text>

      {connection.status === 'locked' && (
        <PassphraseForm
          create={connection.docExists === false}
          {...(connection.error ? { initialError: connection.error } : {})}
        />
      )}

      {unlocked && (
        <>
          <Field>
            <Label>Link für ein weiteres Gerät</Label>
            <Description>
              Auf dem anderen Gerät öffnen und dort die Passphrase eingeben. Wer Link und Passphrase
              hat, sieht alle Daten.
            </Description>
            <div className="mt-3 flex gap-2">
              <Input readOnly value={link} onFocus={(event) => event.target.select()} />
              <Button
                outline
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? 'Kopiert' : 'Kopieren'}
              </Button>
            </div>
          </Field>

          {server.keyRemembered ? (
            <CheckboxField>
              <Checkbox checked onChange={() => forgetRememberedKey()} />
              <Label>Passphrase auf diesem Gerät merken</Label>
              <Description>
                Abhaken, um sie zu vergessen. Dann fragen wir beim nächsten Start.
              </Description>
            </CheckboxField>
          ) : (
            <Text>Die Passphrase ist nicht gemerkt; wir fragen bei jedem Start danach.</Text>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {connection.status !== 'locked' && (
          <Button outline onClick={() => void syncNow()} disabled={connection.status === 'syncing'}>
            Jetzt synchronisieren
          </Button>
        )}
        <Button plain onClick={() => setConfirmDisconnect(true)}>
          Gerät trennen
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={disconnect}
        title="Gerät vom Server trennen?"
        description="Die Daten bleiben auf diesem Gerät. Zum erneuten Verbinden brauchst du den Familien-Link."
        confirmLabel="Trennen"
        destructive
      />
    </div>
  )
}
