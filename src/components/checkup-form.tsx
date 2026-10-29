import { useState } from 'react'
import { fromFormValues, MONTH_NAMES } from '@/lib/checkup-form'
import type { CheckupFields, CheckupFormErrors, CheckupFormValues } from '@/lib/checkup-form'
import { Button } from './catalyst/button'
import { CheckboxField, Checkbox } from './catalyst/checkbox'
import {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Fieldset,
  Label,
  Legend,
} from './catalyst/fieldset'
import { Input } from './catalyst/input'
import { Select } from './catalyst/select'
import { Textarea } from './catalyst/textarea'

const KIND_LABELS: Record<CheckupFormValues['kind'], string> = {
  interval: 'Wiederkehrend ab letztem Termin',
  seasonal: 'Jedes Jahr im gleichen Zeitraum',
  once: 'Einmalig in einem festen Zeitraum',
}

export function CheckupForm({
  initial,
  submitLabel,
  showActive = false,
  onSubmit,
  onCancel,
}: {
  initial: CheckupFormValues
  submitLabel: string
  /** Only when editing: pause/resume. */
  showActive?: boolean
  onSubmit: (fields: CheckupFields) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<CheckupFormErrors>({})

  function set<K extends keyof CheckupFormValues>(key: K, value: CheckupFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors(({ [key]: _cleared, ...rest }) => rest)
  }

  function text(
    key: keyof CheckupFormValues,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) {
    return (
      <Field>
        <Label>{label}</Label>
        <Input
          {...props}
          value={String(values[key])}
          onChange={(event) => set(key, event.target.value)}
          invalid={errors[key] !== undefined}
        />
        {errors[key] && <ErrorMessage>{errors[key]}</ErrorMessage>}
      </Field>
    )
  }

  const monthOptions = MONTH_NAMES.map((name, index) => (
    <option key={name} value={String(index + 1)}>
      {name}
    </option>
  ))

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const result = fromFormValues(values)
        if (result.ok) onSubmit(result.fields)
        else setErrors(result.errors)
      }}
      className="space-y-8"
    >
      <FieldGroup>
        {text('title', 'Name', { autoComplete: 'off' })}
        {text('practice', 'Praxis', { autoComplete: 'off' })}
        {text('phone', 'Telefon', { type: 'tel', autoComplete: 'off' })}
        <Field>
          <Label>Notiz</Label>
          <Textarea
            rows={2}
            value={values.note}
            onChange={(event) => set('note', event.target.value)}
          />
        </Field>
      </FieldGroup>

      <Fieldset>
        <Legend>Wann?</Legend>
        <FieldGroup>
          <Field>
            <Label>Rhythmus</Label>
            <Select
              value={values.kind}
              onChange={(event) => set('kind', event.target.value as CheckupFormValues['kind'])}
            >
              {(Object.keys(KIND_LABELS) as CheckupFormValues['kind'][]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          {values.kind === 'interval' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {text('months', 'Alle … Monate', { type: 'number', inputMode: 'numeric', min: 1 })}
                {text('windowMonths', 'Zeitraum (Monate)', {
                  type: 'number',
                  inputMode: 'numeric',
                  min: 1,
                })}
              </div>
              <Field>
                <Label>Nächster Zeitraum beginnt am</Label>
                <Description>
                  Frühestens wieder fällig ab diesem Tag (gilt bis zum ersten Termin).
                </Description>
                <Input
                  type="date"
                  value={values.firstWindowStart}
                  onChange={(event) => set('firstWindowStart', event.target.value)}
                  invalid={errors.firstWindowStart !== undefined}
                />
                {errors.firstWindowStart && <ErrorMessage>{errors.firstWindowStart}</ErrorMessage>}
              </Field>
            </>
          )}

          {values.kind === 'seasonal' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>Von</Label>
                  <Select
                    value={values.startMonth}
                    onChange={(event) => set('startMonth', event.target.value)}
                  >
                    {monthOptions}
                  </Select>
                </Field>
                <Field>
                  <Label>Bis</Label>
                  <Select
                    value={values.endMonth}
                    onChange={(event) => set('endMonth', event.target.value)}
                  >
                    {monthOptions}
                  </Select>
                </Field>
              </div>
              {text('everyYears', 'Alle … Jahre', { type: 'number', inputMode: 'numeric', min: 1 })}
            </>
          )}

          {values.kind === 'once' && (
            <div className="grid grid-cols-2 gap-4">
              {text('windowStart', 'Ab', { type: 'date' })}
              {text('windowEnd', 'Bis', { type: 'date' })}
            </div>
          )}

          <Field>
            <Label>Buchen … Wochen vorher</Label>
            <Description>So lange vor dem Zeitraum erinnern wir ans Buchen.</Description>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={values.bookingLeadWeeks}
              onChange={(event) => set('bookingLeadWeeks', event.target.value)}
              invalid={errors.bookingLeadWeeks !== undefined}
            />
            {errors.bookingLeadWeeks && <ErrorMessage>{errors.bookingLeadWeeks}</ErrorMessage>}
          </Field>

          {showActive && (
            <CheckboxField>
              <Checkbox checked={!values.active} onChange={(checked) => set('active', !checked)} />
              <Label>Pausiert</Label>
              <Description>Pausierte Vorsorgen erscheinen nicht in „Jetzt zu tun“.</Description>
            </CheckboxField>
          )}
        </FieldGroup>
      </Fieldset>

      <div className="flex justify-end gap-3">
        <Button plain onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
