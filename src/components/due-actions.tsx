import { useState } from 'react'
import { book, markDone, skip } from '@/domain/actions'
import { compareDates, isValidDateString, today as todayOf } from '@/domain/dates'
import type { Checkup } from '@/domain/model'
import type { Due } from '@/domain/schedule'
import { earlyBookingNote } from '@/lib/due-text'
import { dispatch } from '@/sync/store'
import { Button } from './catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from './catalyst/dialog'
import { Description, ErrorMessage, Field, Label } from './catalyst/fieldset'
import { Input } from './catalyst/input'
import { useDialog } from './use-dialog'

/**
 * The actions of a due window: book and skip open their own dialogs, "Erledigt" calls `onDone`
 * (the done dialog is opened by the URL, `?action=done`, see `DoneDialog`).
 */
export function DueActions({
  checkup,
  due,
  onDone,
}: {
  checkup: Checkup
  due: Due
  onDone: () => void
}) {
  const bookDialog = useDialog()
  const skipDialog = useDialog()
  const isBooked = due.state === 'booked' || due.state === 'confirm'

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {isBooked ? (
          <>
            <Button color={due.state === 'confirm' ? 'dark/zinc' : 'white'} onClick={onDone}>
              Erledigt
            </Button>
            <Button outline onClick={bookDialog.show}>
              {due.state === 'confirm' ? 'Neuer Termin…' : 'Termin ändern…'}
            </Button>
          </>
        ) : (
          <>
            <Button
              color={due.state === 'upcoming' ? 'white' : 'dark/zinc'}
              onClick={bookDialog.show}
            >
              Gebucht…
            </Button>
            <Button outline onClick={onDone}>
              Erledigt
            </Button>
          </>
        )}
        <Button plain onClick={skipDialog.show}>
          Überspringen
        </Button>
      </div>

      <Dialog open={bookDialog.open} onClose={bookDialog.close} size="sm">
        <BookForm key={bookDialog.key} checkup={checkup} due={due} onDone={bookDialog.close} />
      </Dialog>
      <Dialog open={skipDialog.open} onClose={skipDialog.close} size="sm">
        <SkipForm key={skipDialog.key} checkup={checkup} onDone={skipDialog.close} />
      </Dialog>
    </>
  )
}

/** The "Erledigt" dialog; its open state lives in the URL (`?action=done`). */
export function DoneDialog({
  checkup,
  due,
  open,
  onClose,
}: {
  checkup: Checkup
  due: Due
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DoneForm checkup={checkup} due={due} onDone={onClose} />
    </Dialog>
  )
}

interface FormProps {
  checkup: Checkup
  due: Due
  onDone: () => void
}

function BookForm({ checkup, due, onDone }: FormProps) {
  const today = todayOf()
  const [date, setDate] = useState(due.occurrence?.appointmentDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const early =
    isValidDateString(date) &&
    checkup.schedule.kind === 'interval' &&
    compareDates(date, due.windowStart) < 0

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!isValidDateString(date)) {
          setError('Bitte ein Datum wählen.')
          return
        }
        dispatch((doc) => book(doc, checkup.id, date))
        onDone()
      }}
    >
      <DialogTitle>Termin eintragen</DialogTitle>
      <DialogDescription>{checkup.title}: Wann ist der Termin?</DialogDescription>
      <DialogBody>
        <Field>
          <Label>Datum</Label>
          <Input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setError(null)
            }}
            invalid={error !== null}
            autoFocus
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {early && <Description>{earlyBookingNote(due.windowStart, today)}</Description>}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit">Speichern</Button>
      </DialogActions>
    </form>
  )
}

function DoneForm({ checkup, due, onDone }: FormProps) {
  const today = todayOf()
  const appointment = due.occurrence?.appointmentDate
  const [date, setDate] = useState(
    appointment && compareDates(appointment, today) <= 0 ? appointment : today,
  )
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!isValidDateString(date)) {
          setError('Bitte ein Datum wählen.')
          return
        }
        if (compareDates(date, today) > 0) {
          setError('Das Datum liegt in der Zukunft.')
          return
        }
        dispatch((doc) => markDone(doc, checkup.id, date))
        onDone()
      }}
    >
      <DialogTitle>Erledigt</DialogTitle>
      <DialogDescription>
        {checkup.title}: Wann war der Termin? Danach planen wir die nächste Vorsorge.
      </DialogDescription>
      <DialogBody>
        <Field>
          <Label>Datum</Label>
          <Input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setError(null)
            }}
            invalid={error !== null}
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit">Erledigt</Button>
      </DialogActions>
    </form>
  )
}

function SkipForm({ checkup, onDone }: Omit<FormProps, 'due'>) {
  const [reason, setReason] = useState('')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        dispatch((doc) => skip(doc, checkup.id, reason.trim() || undefined))
        onDone()
      }}
    >
      <DialogTitle>Diesmal überspringen</DialogTitle>
      <DialogDescription>
        {checkup.title}: Die nächste Fälligkeit rechnet ab dem Ende dieses Zeitraums.
      </DialogDescription>
      <DialogBody>
        <Field>
          <Label>Grund (optional)</Label>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit">Überspringen</Button>
      </DialogActions>
    </form>
  )
}
