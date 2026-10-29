import { PencilSquareIcon, TrashIcon } from '@heroicons/react/20/solid'
import { createRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '@/components/card'
import { Button } from '@/components/catalyst/button'
import { Description, Field, Label } from '@/components/catalyst/fieldset'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Select } from '@/components/catalyst/select'
import { Text } from '@/components/catalyst/text'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTransfer } from '@/components/data-transfer'
import { Page } from '@/components/page'
import { PersonDialog } from '@/components/person-dialog'
import { PersonDot } from '@/components/person-dot'
import { PushSettings } from '@/components/push-settings'
import { SyncSettings } from '@/components/sync-settings'
import { useDialog } from '@/components/use-dialog'
import { removePerson, setReminderHour } from '@/domain/actions'
import { formatLong } from '@/domain/dates'
import type { Person } from '@/domain/model'
import { dispatch, useDoc } from '@/sync/store'
import { rootRoute } from './root'

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/einstellungen',
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <Page>
      <Heading>Einstellungen</Heading>
      <Section id="personen" title="Personen">
        <PersonsSettings />
      </Section>
      <Section id="sync" title="Synchronisieren">
        <SyncSettings />
      </Section>
      <Section id="erinnerungen" title="Erinnerungen">
        <ReminderHour />
        <PushSettings />
      </Section>
      <Section id="daten" title="Sicherung">
        <DataTransfer />
      </Section>
    </Page>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4 space-y-3">
      <Subheading id={`${id}-heading`}>{title}</Subheading>
      <Card className="space-y-6">{children}</Card>
    </section>
  )
}

function PersonsSettings() {
  const doc = useDoc()
  const dialog = useDialog()
  const [editing, setEditing] = useState<Person | undefined>(undefined)
  const [removing, setRemoving] = useState<Person | null>(null)
  const removingCount = removing ? doc.checkups.filter((c) => c.personId === removing.id).length : 0

  return (
    <div className="space-y-4">
      {doc.persons.length === 0 ? (
        <Text>Noch niemand angelegt.</Text>
      ) : (
        <ul className="-my-2 divide-y divide-zinc-950/5 dark:divide-white/10">
          {doc.persons.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <PersonDot color={person.color} />
                <div className="min-w-0">
                  <p className="truncate text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
                    {person.name}
                  </p>
                  {person.birthDate && (
                    <p className="text-sm/6 text-zinc-500 dark:text-zinc-400">
                      {formatLong(person.birthDate)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0">
                <Button
                  plain
                  aria-label={`${person.name} bearbeiten`}
                  onClick={() => {
                    setEditing(person)
                    dialog.show()
                  }}
                >
                  <PencilSquareIcon data-slot="icon" />
                </Button>
                <Button
                  plain
                  aria-label={`${person.name} entfernen`}
                  onClick={() => setRemoving(person)}
                >
                  <TrashIcon data-slot="icon" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        outline
        onClick={() => {
          setEditing(undefined)
          dialog.show()
        }}
      >
        Person hinzufügen
      </Button>
      <PersonDialog
        open={dialog.open}
        onClose={dialog.close}
        formKey={dialog.key}
        {...(editing ? { person: editing } : {})}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) dispatch((current) => removePerson(current, removing.id))
        }}
        title={`${removing?.name ?? ''} entfernen?`}
        description={
          removingCount > 0
            ? `Auch ${removingCount === 1 ? 'die Vorsorge' : `alle ${removingCount} Vorsorgen`} und der Verlauf werden gelöscht – auf allen Geräten.`
            : 'Die Person wird auf allen Geräten gelöscht.'
        }
        confirmLabel="Entfernen"
        destructive
      />
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function ReminderHour() {
  const doc = useDoc()
  return (
    <Field>
      <Label>Uhrzeit für Erinnerungen</Label>
      <Description>Erinnerungen ans Buchen und Bestätigen kommen zu dieser Uhrzeit.</Description>
      <Select
        value={String(doc.settings.reminderHour)}
        onChange={(event) => {
          const hour = Number(event.target.value)
          dispatch((current) => setReminderHour(current, hour))
        }}
      >
        {HOURS.map((hour) => (
          <option key={hour} value={String(hour)}>
            {hour} Uhr
          </option>
        ))}
      </Select>
    </Field>
  )
}
