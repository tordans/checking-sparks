import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Card } from '@/components/card'
import { Button } from '@/components/catalyst/button'
import { Dialog, DialogBody, DialogTitle } from '@/components/catalyst/dialog'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { CheckupForm } from '@/components/checkup-form'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DueActions } from '@/components/due-actions'
import { Page } from '@/components/page'
import { PersonDot } from '@/components/person-dot'
import { StateBadge } from '@/components/state-badge'
import { useDialog } from '@/components/use-dialog'
import { removeCheckup, undo, updateCheckup } from '@/domain/actions'
import { formatLong, today as todayOf } from '@/domain/dates'
import type { Checkup, Occurrence } from '@/domain/model'
import { computeDue, windowEndFor } from '@/domain/schedule'
import type { Due } from '@/domain/schedule'
import { findTemplate } from '@/domain/templates'
import { toFormValues } from '@/lib/checkup-form'
import { dueText, formatDay, windowText } from '@/lib/due-text'
import { dispatch, useDoc } from '@/sync/store'
import { PersonNotFound, personRoute } from './person'

const checkupSearchSchema = z.object({
  /** Deep link from the "War der Termin?" reminder. */
  action: z.enum(['done']).optional().catch(undefined),
})

export const checkupDetailRoute = createRoute({
  getParentRoute: () => personRoute,
  path: 'vorsorge/$checkupId',
  validateSearch: checkupSearchSchema,
  component: CheckupPage,
})

function CheckupPage() {
  const { personId, checkupId } = checkupDetailRoute.useParams()
  const { action } = checkupDetailRoute.useSearch()
  const navigate = useNavigate({ from: checkupDetailRoute.fullPath })
  const doc = useDoc()
  const editDialog = useDialog()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const person = doc.persons.find((p) => p.id === personId)
  const checkup = doc.checkups.find((c) => c.id === checkupId && c.personId === personId)
  if (!person || !checkup) return <PersonNotFound />

  const today = todayOf()
  const due = computeDue(checkup, doc.occurrences, today)
  const history = doc.occurrences
    .filter((o) => o.checkupId === checkup.id)
    .sort(
      (a, b) =>
        b.windowStart.localeCompare(a.windowStart) || b.updatedAt.localeCompare(a.updatedAt),
    )
  const template = checkup.templateId ? findTemplate(checkup.templateId) : undefined

  const setAction = (next: 'done' | undefined) =>
    void navigate({ search: next ? { action: next } : {}, replace: true })

  return (
    <Page>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/person/$personId"
            params={{ personId }}
            className="flex items-center gap-2 text-sm/6 text-zinc-600 hover:underline dark:text-zinc-400"
          >
            <PersonDot color={person.color} />
            {person.name}
          </Link>
          <Heading>{checkup.title}</Heading>
        </div>
        <Button plain onClick={editDialog.show}>
          Bearbeiten
        </Button>
      </div>

      <StateCard
        checkup={checkup}
        due={due}
        today={today}
        doneOpen={action === 'done'}
        onDoneOpen={() => setAction('done')}
        onDoneClose={() => setAction(undefined)}
      />

      {(checkup.practice || checkup.phone || checkup.note || template) && (
        <Card className="space-y-1">
          {checkup.practice && (
            <p className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              {checkup.practice}
            </p>
          )}
          {checkup.phone && (
            <a
              href={`tel:${checkup.phone.replaceAll(/[^\d+]/g, '')}`}
              className="block text-base/6 text-zinc-700 underline sm:text-sm/6 dark:text-zinc-300"
            >
              {checkup.phone}
            </a>
          )}
          {checkup.note && <Text className="whitespace-pre-line">{checkup.note}</Text>}
          {template?.hint && (
            <Text>
              Vorlage: {template.hint}
              {template.uncertain && ' (unsicher – bitte prüfen)'}
            </Text>
          )}
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="history-heading">
        <Subheading id="history-heading">Verlauf</Subheading>
        {history.length === 0 ? (
          <Text>Noch keine Einträge.</Text>
        ) : (
          <ul className="divide-y divide-zinc-950/5 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-950/5 dark:divide-white/10 dark:bg-zinc-900 dark:ring-white/10">
            {history.map((occurrence) => (
              <HistoryRow key={occurrence.id} checkup={checkup} occurrence={occurrence} />
            ))}
          </ul>
        )}
      </section>

      <div className="border-t border-zinc-950/5 pt-6 dark:border-white/10">
        <Button plain onClick={() => setConfirmDelete(true)}>
          Vorsorge löschen
        </Button>
      </div>

      <Dialog open={editDialog.open} onClose={editDialog.close} size="lg">
        <DialogTitle>Vorsorge bearbeiten</DialogTitle>
        <DialogBody>
          <CheckupForm
            key={editDialog.key}
            initial={toFormValues(checkup, today)}
            submitLabel="Speichern"
            showActive
            onCancel={editDialog.close}
            onSubmit={(fields) => {
              dispatch((current) => updateCheckup(current, checkup.id, fields))
              editDialog.close()
            }}
          />
        </DialogBody>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          dispatch((current) => removeCheckup(current, checkup.id))
          void navigate({ to: '/person/$personId', params: { personId } })
        }}
        title={`„${checkup.title}“ löschen?`}
        description="Die Vorsorge und ihr Verlauf werden auf allen Geräten gelöscht."
        confirmLabel="Löschen"
        destructive
      />
    </Page>
  )
}

function StateCard({
  checkup,
  due,
  today,
  doneOpen,
  onDoneOpen,
  onDoneClose,
}: {
  checkup: Checkup
  due: Due | null
  today: string
  doneOpen: boolean
  onDoneOpen: () => void
  onDoneClose: () => void
}) {
  if (!due) {
    return (
      <Card>
        <Text>
          {checkup.active
            ? 'Erledigt – dafür ist nichts mehr geplant.'
            : 'Pausiert. Unter „Bearbeiten“ kannst du sie wieder aktivieren.'}
        </Text>
      </Card>
    )
  }
  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <StateBadge state={due.state} />
        <p className="text-lg/7 font-semibold text-zinc-950 dark:text-white">
          {due.state === 'confirm' ? 'Hat der Termin stattgefunden?' : dueText(due, today)}
        </p>
        <Text>
          {due.state === 'confirm' && due.occurrence?.appointmentDate
            ? `Termin war am ${formatDay(due.occurrence.appointmentDate, today)} · `
            : ''}
          Zeitraum {windowText(due, today)}
        </Text>
      </div>
      <DueActions
        checkup={checkup}
        due={due}
        done={{ open: doneOpen, onOpen: onDoneOpen, onClose: onDoneClose }}
      />
    </Card>
  )
}

function occurrenceText(checkup: Checkup, occurrence: Occurrence): string {
  switch (occurrence.status) {
    case 'done':
      return `Erledigt am ${formatLong(occurrence.doneDate ?? occurrence.appointmentDate ?? occurrence.windowStart)}`
    case 'booked':
      return occurrence.appointmentDate
        ? `Gebucht für ${formatLong(occurrence.appointmentDate)}`
        : 'Gebucht'
    case 'skipped':
      return `Übersprungen (${formatLong(occurrence.windowStart)}–${formatLong(windowEndFor(checkup, occurrence.windowStart))})${occurrence.skipReason ? `: ${occurrence.skipReason}` : ''}`
  }
}

function HistoryRow({ checkup, occurrence }: { checkup: Checkup; occurrence: Occurrence }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <p className="text-base/6 text-zinc-800 sm:text-sm/6 dark:text-zinc-200">
        {occurrenceText(checkup, occurrence)}
      </p>
      <Button plain onClick={() => setConfirm(true)}>
        Rückgängig
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => dispatch((current) => undo(current, occurrence.id))}
        title="Eintrag rückgängig machen?"
        description={
          occurrence.status === 'booked'
            ? 'Der gebuchte Termin wird entfernt.'
            : 'Der Eintrag wird entfernt und die Fälligkeit neu berechnet.'
        }
        confirmLabel="Rückgängig"
      />
    </li>
  )
}
