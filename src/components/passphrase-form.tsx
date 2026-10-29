import { useState } from 'react'
import { unlock } from '@/sync/sync'
import { Button } from './catalyst/button'
import { Checkbox, CheckboxField } from './catalyst/checkbox'
import { Description, ErrorMessage, Field, FieldGroup, Label } from './catalyst/fieldset'
import { Input } from './catalyst/input'
import { Text } from './catalyst/text'

const MIN_LENGTH = 8

/**
 * Unlock the family data (`create: false`) or set the passphrase on the first device. Deriving
 * the key takes a moment on phones, so the button shows progress.
 */
export function PassphraseForm({
  create,
  initialError,
  onUnlocked,
}: {
  create: boolean
  initialError?: string
  onUnlocked?: () => void
}) {
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | undefined>(initialError)
  const [busy, setBusy] = useState(false)

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        if (create && passphrase.length < MIN_LENGTH) {
          setError(`Mindestens ${MIN_LENGTH} Zeichen.`)
          return
        }
        if (create && passphrase !== repeat) {
          setError('Die beiden Eingaben sind nicht gleich.')
          return
        }
        if (!passphrase) {
          setError('Bitte die Passphrase eingeben.')
          return
        }
        setBusy(true)
        const result = await unlock(passphrase, remember)
        setBusy(false)
        if (result.ok) onUnlocked?.()
        else setError(result.error)
      }}
      className="space-y-6"
    >
      {create && (
        <Text>
          Mit der Passphrase werden eure Daten verschlüsselt, bevor sie den Server erreichen. Merk
          sie dir gut: Ohne sie sind die Daten verloren. Exportiere ab und zu eine Sicherung.
        </Text>
      )}
      <FieldGroup>
        <Field>
          <Label>{create ? 'Neue Passphrase' : 'Passphrase'}</Label>
          <Input
            type="password"
            autoComplete={create ? 'new-password' : 'current-password'}
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value)
              setError(undefined)
            }}
            invalid={error !== undefined}
          />
          {!create && error && <ErrorMessage>{error}</ErrorMessage>}
        </Field>
        {create && (
          <Field>
            <Label>Passphrase wiederholen</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => {
                setRepeat(event.target.value)
                setError(undefined)
              }}
              invalid={error !== undefined}
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
          </Field>
        )}
        <CheckboxField>
          <Checkbox checked={remember} onChange={setRemember} />
          <Label>Passphrase auf diesem Gerät merken</Label>
          <Description>Sonst fragen wir bei jedem Start danach.</Description>
        </CheckboxField>
      </FieldGroup>
      <Button type="submit" disabled={busy}>
        {busy ? 'Einen Moment…' : create ? 'Verschlüsseln und speichern' : 'Entsperren'}
      </Button>
    </form>
  )
}
