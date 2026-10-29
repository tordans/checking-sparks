import { useState } from 'react'
import { addPerson, updatePerson } from '@/domain/actions'
import { isValidDateString, today } from '@/domain/dates'
import type { Person, Sex } from '@/domain/model'
import { cn } from '@/lib/cn'
import {
  isPersonColor,
  nextPersonColor,
  PERSON_COLOR_NAMES,
  PERSON_COLORS,
} from '@/lib/person-colors'
import type { PersonColor } from '@/lib/person-colors'
import { dispatch, store } from '@/sync/store'
import { Button } from './catalyst/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog'
import { Description, ErrorMessage, Field, FieldGroup, Label } from './catalyst/fieldset'
import { Input } from './catalyst/input'
import { Select } from './catalyst/select'

/** Add a person (no `person`) or edit one. `onSaved` gets the id. */
export function PersonDialog({
  open,
  onClose,
  person,
  formKey,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  person?: Person
  formKey: number
  onSaved?: (personId: string) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <PersonForm key={formKey} person={person} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}

const SEX_LABELS: Record<Sex, string> = { w: 'weiblich', m: 'männlich', d: 'divers' }

function PersonForm({
  person,
  onClose,
  onSaved,
}: {
  person?: Person
  onClose: () => void
  onSaved?: (personId: string) => void
}) {
  const [name, setName] = useState(person?.name ?? '')
  const [birthDate, setBirthDate] = useState(person?.birthDate ?? '')
  const [sex, setSex] = useState<Sex | ''>(person?.sex ?? '')
  const [color, setColor] = useState<PersonColor>(() =>
    isPersonColor(person?.color)
      ? person.color
      : nextPersonColor(store.getDoc().persons.map((p) => p.color)),
  )
  const [errors, setErrors] = useState<{ name?: string; birthDate?: string }>({})

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const next: typeof errors = {}
        if (!name.trim()) next.name = 'Bitte einen Namen eingeben.'
        if (birthDate && (!isValidDateString(birthDate) || birthDate > today())) {
          next.birthDate = 'Bitte ein gültiges Datum wählen.'
        }
        setErrors(next)
        if (Object.keys(next).length > 0) return
        const fields = {
          name: name.trim(),
          birthDate: birthDate || undefined,
          sex: sex || undefined,
          color,
        }
        const id = person?.id ?? crypto.randomUUID()
        dispatch((doc) =>
          person ? updatePerson(doc, person.id, fields) : addPerson(doc, { ...fields, id }),
        )
        onClose()
        onSaved?.(id)
      }}
    >
      <DialogTitle>{person ? 'Person bearbeiten' : 'Person hinzufügen'}</DialogTitle>
      <DialogBody>
        <FieldGroup>
          <Field>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              invalid={errors.name !== undefined}
              autoComplete="off"
              autoFocus={!person}
            />
            {errors.name && <ErrorMessage>{errors.name}</ErrorMessage>}
          </Field>
          <Field>
            <Label>Geburtsdatum</Label>
            <Description>Damit passende Vorlagen (z. B. U-Untersuchungen) erscheinen.</Description>
            <Input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              invalid={errors.birthDate !== undefined}
            />
            {errors.birthDate && <ErrorMessage>{errors.birthDate}</ErrorMessage>}
          </Field>
          <Field>
            <Label>Geschlecht</Label>
            <Description>Optional, für geschlechtsspezifische Vorlagen.</Description>
            <Select value={sex} onChange={(event) => setSex(event.target.value as Sex | '')}>
              <option value="">keine Angabe</option>
              {(Object.keys(SEX_LABELS) as Sex[]).map((key) => (
                <option key={key} value={key}>
                  {SEX_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset>
            <legend className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6 dark:text-white">
              Farbe
            </legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {(Object.keys(PERSON_COLORS) as PersonColor[]).map((token) => (
                <label key={token} className="relative">
                  <input
                    type="radio"
                    name="color"
                    value={token}
                    checked={color === token}
                    onChange={() => setColor(token)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">{PERSON_COLOR_NAMES[token]}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block size-8 rounded-full ring-offset-2 ring-offset-white peer-checked:ring-2 peer-checked:ring-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-blue-500 dark:ring-offset-zinc-900 dark:peer-checked:ring-white',
                      PERSON_COLORS[token],
                    )}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </FieldGroup>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit">Speichern</Button>
      </DialogActions>
    </form>
  )
}
