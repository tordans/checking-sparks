import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { Card } from '@/components/card'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { DueActions } from '@/components/due-actions'
import { Page } from '@/components/page'
import { PersonDialog } from '@/components/person-dialog'
import { PersonDot } from '@/components/person-dot'
import { useDialog } from '@/components/use-dialog'
import { addDays, compareDates, today as todayOf } from '@/domain/dates'
import { dueForDoc } from '@/domain/schedule'
import type { DocDue, DueState } from '@/domain/schedule'
import { dueText, STATE_LABELS, windowText } from '@/lib/due-text'
import { useDoc } from '@/sync/store'
import { rootRoute } from './root'

const UPCOMING_DAYS = 90
const SECTIONS: DueState[] = ['confirm', 'overdue', 'book', 'booked', 'upcoming']

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

function Home() {
  const doc = useDoc()
  const today = todayOf()
  const horizon = addDays(today, UPCOMING_DAYS)
  const dues = dueForDoc(doc, today).filter(
    (due) => due.state !== 'upcoming' || compareDates(due.bookingStart, horizon) <= 0,
  )

  if (doc.persons.length === 0) return <Welcome />

  return (
    <Page>
      <Heading>Jetzt zu tun</Heading>
      {dues.length === 0 ? (
        <Card className="space-y-3">
          <Text>
            {doc.checkups.length === 0
              ? 'Noch keine Vorsorge eingetragen. Wähle eine Person und füge die erste hinzu.'
              : 'Gerade ist nichts zu tun. Wir melden uns, wenn es Zeit zum Buchen ist.'}
          </Text>
          {doc.checkups.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {doc.persons.map((person) => (
                <Button key={person.id} outline href={`/person/${person.id}/vorsorge/neu`}>
                  <PersonDot color={person.color} className="self-center" />
                  {person.name}
                </Button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        SECTIONS.map((state) => {
          const items = dues.filter((due) => due.state === state)
          if (items.length === 0) return null
          return (
            <section key={state} aria-labelledby={`section-${state}`} className="space-y-3">
              <Subheading id={`section-${state}`}>
                {STATE_LABELS[state]}
                {state === 'upcoming' && ' (90 Tage)'}
              </Subheading>
              <ul className="space-y-3">
                {items.map((due) => (
                  <li key={due.checkup.id}>
                    <DueCard due={due} today={today} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </Page>
  )
}

function DueCard({ due, today }: { due: DocDue; today: string }) {
  const { person, checkup } = due
  return (
    <Card className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-sm/6 text-zinc-600 dark:text-zinc-400">
          <PersonDot color={person.color} />
          {person.name}
        </p>
        <Link
          to="/person/$personId/vorsorge/$checkupId"
          params={{ personId: person.id, checkupId: checkup.id }}
          className="text-base/7 font-semibold text-zinc-950 hover:underline dark:text-white"
        >
          {checkup.title}
        </Link>
        <p className="text-base/6 text-zinc-700 sm:text-sm/6 dark:text-zinc-300">
          {dueText(due, today)}
          {(due.state === 'book' || due.state === 'upcoming') && (
            <span className="text-zinc-500 dark:text-zinc-400">
              {' '}
              · Zeitraum {windowText(due, today)}
            </span>
          )}
        </p>
      </div>
      <DueActions checkup={checkup} due={due} />
    </Card>
  )
}

function Welcome() {
  const dialog = useDialog()
  const navigate = useNavigate()
  return (
    <Page>
      <Heading>Willkommen bei Checking Sparks</Heading>
      <Card className="space-y-4">
        <Text>
          Hier behältst du die Vorsorgetermine deiner Familie im Blick: wann du buchen solltest, was
          ansteht und was erledigt ist. Leg zuerst eine Person an.
        </Text>
        <Button onClick={dialog.show}>Person hinzufügen</Button>
        <Text>
          Schon auf einem anderen Gerät eingerichtet? Öffne dort in den Einstellungen den Link für
          ein weiteres Gerät.
        </Text>
      </Card>
      <PersonDialog
        open={dialog.open}
        onClose={dialog.close}
        formKey={dialog.key}
        onSaved={(personId) => void navigate({ to: '/person/$personId', params: { personId } })}
      />
    </Page>
  )
}
