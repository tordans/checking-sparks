import { createRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '@/components/card'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { CheckupForm } from '@/components/checkup-form'
import { Page } from '@/components/page'
import { PersonDot } from '@/components/person-dot'
import { addCheckup, newCheckup } from '@/domain/actions'
import { today as todayOf } from '@/domain/dates'
import type { Checkup } from '@/domain/model'
import { checkupFromTemplate, suggestTemplates } from '@/domain/templates'
import type { Suggestion, Template, TemplateStatus } from '@/domain/templates'
import { toFormValues } from '@/lib/checkup-form'
import { dispatch, useDoc } from '@/sync/store'
import { PersonNotFound, personRoute } from './person'

export const checkupNewRoute = createRoute({
  getParentRoute: () => personRoute,
  path: 'vorsorge/neu',
  component: NewCheckupPage,
})

const STATUS_COLORS = {
  Kasse: 'emerald',
  'Kasse (abhängig)': 'lime',
  STIKO: 'sky',
  IGeL: 'amber',
  Selbst: 'zinc',
} as const satisfies Record<TemplateStatus, string>

function NewCheckupPage() {
  const { personId } = checkupNewRoute.useParams()
  const doc = useDoc()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<{ checkup: Checkup; template?: Template } | null>(null)
  const person = doc.persons.find((p) => p.id === personId)
  if (!person) return <PersonNotFound />

  const today = todayOf()
  const goToPerson = () => void navigate({ to: '/person/$personId', params: { personId } })

  if (draft) {
    return (
      <Page>
        <div>
          <Text className="flex items-center gap-2">
            <PersonDot color={person.color} />
            {person.name}
          </Text>
          <Heading>{draft.template ? draft.template.name : 'Eigene Vorsorge'}</Heading>
          {draft.template?.hint && <Text>{draft.template.hint}</Text>}
        </div>
        <Card>
          <CheckupForm
            initial={toFormValues(draft.checkup, today)}
            submitLabel="Hinzufügen"
            onCancel={() => setDraft(null)}
            onSubmit={(fields) => {
              const { id, templateId } = draft.checkup
              dispatch((current) =>
                addCheckup(current, {
                  ...fields,
                  id,
                  personId,
                  ...(templateId ? { templateId } : {}),
                }),
              )
              void navigate({
                to: '/person/$personId/vorsorge/$checkupId',
                params: { personId, checkupId: id },
              })
            }}
          />
        </Card>
      </Page>
    )
  }

  const suggestions = suggestTemplates(person, today)
  const existing = new Set(
    doc.checkups.filter((c) => c.personId === personId).map((c) => c.templateId),
  )

  return (
    <Page>
      <div>
        <Text className="flex items-center gap-2">
          <PersonDot color={person.color} />
          {person.name}
        </Text>
        <Heading>Vorsorge hinzufügen</Heading>
        <Text>
          Wähle eine Vorlage und passe sie an. Vorlagen sind Startwerte, keine medizinische
          Beratung.
        </Text>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <Text>Etwas anderes, z. B. Zahnreinigung oder Augenarzt?</Text>
        <Button
          outline
          onClick={() =>
            setDraft({
              checkup: newCheckup({
                personId,
                title: '',
                schedule: { kind: 'interval', months: 12 },
              }),
            })
          }
        >
          Eigene Vorsorge
        </Button>
      </Card>

      <section className="space-y-3" aria-labelledby="templates-heading">
        <Subheading id="templates-heading">Vorlagen</Subheading>
        {!person.birthDate && (
          <Text>
            Ohne Geburtsdatum zeigen wir alle Altersgruppen. Trag es bei der Person ein, dann wird
            die Liste kürzer.
          </Text>
        )}
        <ul className="divide-y divide-zinc-950/5 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-950/5 dark:divide-white/10 dark:bg-zinc-900 dark:ring-white/10">
          {suggestions.map((suggestion) => (
            <TemplateRow
              key={suggestion.template.id}
              suggestion={suggestion}
              added={existing.has(suggestion.template.id)}
              onPick={() =>
                setDraft({
                  checkup: checkupFromTemplate(suggestion.template, person, today),
                  template: suggestion.template,
                })
              }
            />
          ))}
        </ul>
      </section>

      <Button plain onClick={goToPerson}>
        Zurück
      </Button>
    </Page>
  )
}

function TemplateRow({
  suggestion,
  added,
  onPick,
}: {
  suggestion: Suggestion
  added: boolean
  onPick: () => void
}) {
  const { template, sexUnknown } = suggestion
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="w-full space-y-1 px-4 py-3 text-left hover:bg-zinc-950/2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
            {template.name}
          </span>
          <Badge color={STATUS_COLORS[template.status]}>{template.status}</Badge>
          {template.uncertain && <Badge color="orange">unsicher</Badge>}
          {added && <Badge color="zinc">schon angelegt</Badge>}
        </span>
        <span className="block text-sm/6 text-zinc-600 dark:text-zinc-400">
          {template.specialty}
          {template.hint && ` · ${template.hint}`}
          {sexUnknown && ` · nur für ${template.sex === 'w' ? 'Frauen' : 'Männer'}`}
        </span>
      </button>
    </li>
  )
}
