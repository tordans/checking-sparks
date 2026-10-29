import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { createRoute, Link } from '@tanstack/react-router'
import { Card } from '@/components/card'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Page } from '@/components/page'
import { PersonDialog } from '@/components/person-dialog'
import { PersonDot } from '@/components/person-dot'
import { StateBadge } from '@/components/state-badge'
import { useDialog } from '@/components/use-dialog'
import { formatLong, monthsBetween, today as todayOf } from '@/domain/dates'
import type { Person } from '@/domain/model'
import { computeDue } from '@/domain/schedule'
import { dueText } from '@/lib/due-text'
import { useDoc } from '@/sync/store'
import { rootRoute } from './root'

export const personRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/person/$personId',
})

export const personIndexRoute = createRoute({
  getParentRoute: () => personRoute,
  path: '/',
  component: PersonPage,
})

function ageText(person: Person, today: string): string | null {
  if (!person.birthDate) return null
  const months = monthsBetween(person.birthDate, today)
  if (months < 24) return `${months} Monate`
  return `${Math.floor(months / 12)} Jahre`
}

export function PersonNotFound() {
  return (
    <Page>
      <Heading>Nicht gefunden</Heading>
      <Text>
        Diese Person oder Vorsorge gibt es (auf diesem Gerät) nicht. Vielleicht wurde sie gelöscht
        oder ist noch nicht synchronisiert.
      </Text>
      <Button outline href="/">
        Zu „Jetzt zu tun“
      </Button>
    </Page>
  )
}

function PersonPage() {
  const { personId } = personIndexRoute.useParams()
  const doc = useDoc()
  const editDialog = useDialog()
  const person = doc.persons.find((p) => p.id === personId)
  if (!person) return <PersonNotFound />

  const today = todayOf()
  const age = ageText(person, today)
  const checkups = doc.checkups
    .filter((c) => c.personId === person.id)
    .map((checkup) => ({ checkup, due: computeDue(checkup, doc.occurrences, today) }))
    .sort((a, b) => a.checkup.title.localeCompare(b.checkup.title, 'de'))

  return (
    <Page>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Heading className="flex items-center gap-3">
            <PersonDot color={person.color} className="size-3.5" />
            {person.name}
          </Heading>
          {person.birthDate && (
            <Text>
              geboren am {formatLong(person.birthDate)}
              {age && ` · ${age}`}
            </Text>
          )}
        </div>
        <Button plain onClick={editDialog.show}>
          Bearbeiten
        </Button>
      </div>

      <section className="space-y-3" aria-labelledby="checkups-heading">
        <div className="flex items-center justify-between gap-4">
          <Subheading id="checkups-heading">Vorsorge</Subheading>
          <Button href={`/person/${person.id}/vorsorge/neu`}>Vorsorge hinzufügen</Button>
        </div>
        {checkups.length === 0 ? (
          <Card>
            <Text>
              Noch nichts eingetragen. Füge die erste Vorsorge hinzu, z. B. aus einer Vorlage.
            </Text>
          </Card>
        ) : (
          <ul className="divide-y divide-zinc-950/5 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-950/5 dark:divide-white/10 dark:bg-zinc-900 dark:ring-white/10">
            {checkups.map(({ checkup, due }) => (
              <li key={checkup.id}>
                <Link
                  to="/person/$personId/vorsorge/$checkupId"
                  params={{ personId: person.id, checkupId: checkup.id }}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-950/2.5 dark:hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
                      {checkup.title}
                    </p>
                    <p className="text-sm/6 text-zinc-600 dark:text-zinc-400">
                      {!checkup.active
                        ? 'Pausiert'
                        : due
                          ? dueText(due, today)
                          : 'Erledigt – nichts mehr geplant'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {due && checkup.active && <StateBadge state={due.state} />}
                    <ChevronRightIcon className="size-5 fill-zinc-400" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PersonDialog
        open={editDialog.open}
        onClose={editDialog.close}
        formKey={editDialog.key}
        person={person}
      />
    </Page>
  )
}
