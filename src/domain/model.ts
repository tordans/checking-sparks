import * as z from 'zod/mini'
import { isValidDateString } from './dates'

/** Local calendar date `YYYY-MM-DD`. */
const DateString = z.string().check(z.refine(isValidDateString, 'Expected a date as YYYY-MM-DD'))
/** ISO timestamp, set on every change. */
const Timestamp = z.iso.datetime({ offset: true })
const NonEmpty = z.string().check(z.minLength(1))
const Month = z.int().check(z.minimum(1), z.maximum(12))

const SexSchema = z.enum(['m', 'w', 'd'])

const PersonSchema = z.object({
  id: NonEmpty,
  name: NonEmpty,
  birthDate: z.optional(DateString),
  sex: z.optional(SexSchema),
  color: z.optional(z.string()),
  updatedAt: Timestamp,
})

const ScheduleSchema = z.discriminatedUnion('kind', [
  // Earliest again N months after the last done occurrence.
  z.object({ kind: z.literal('interval'), months: z.int().check(z.minimum(1)) }),
  // Recurring season every year, may wrap the year end (e.g. Nov–Feb).
  z.object({ kind: z.literal('seasonal'), startMonth: Month, endMonth: Month }),
  // One fixed window, e.g. a U-exam derived from the birth date.
  z.object({ kind: z.literal('once'), windowStart: DateString, windowEnd: DateString }),
])

const CheckupSchema = z.object({
  id: NonEmpty,
  personId: NonEmpty,
  title: NonEmpty,
  templateId: z.optional(z.string()),
  practice: z.optional(z.string()),
  phone: z.optional(z.string()),
  note: z.optional(z.string()),
  schedule: ScheduleSchema,
  /** Length of the execution window for 'interval'. */
  windowMonths: z._default(z.int().check(z.minimum(1)), 3),
  /** The booking window opens this many weeks before the execution window. */
  bookingLeadWeeks: z._default(z.int().check(z.minimum(0)), 6),
  /** 'interval' without history: when the first window starts. */
  firstWindowStart: z.optional(DateString),
  active: z._default(z.boolean(), true),
  updatedAt: Timestamp,
})

const OccurrenceStatusSchema = z.enum(['booked', 'done', 'skipped'])

const OccurrenceSchema = z.object({
  id: NonEmpty,
  checkupId: NonEmpty,
  /** Identifies which due window this occurrence belongs to. */
  windowStart: DateString,
  status: OccurrenceStatusSchema,
  appointmentDate: z.optional(DateString),
  doneDate: z.optional(DateString),
  skipReason: z.optional(z.string()),
  updatedAt: Timestamp,
})

const TombstoneSchema = z.object({ id: NonEmpty, deletedAt: Timestamp })

const SettingsSchema = z.object({
  reminderHour: z._default(z.int().check(z.minimum(0), z.maximum(23)), 9),
  updatedAt: Timestamp,
})

const FamilyDocSchema = z.object({
  schemaVersion: z.literal(1),
  persons: z.array(PersonSchema),
  checkups: z.array(CheckupSchema),
  occurrences: z.array(OccurrenceSchema),
  tombstones: z.array(TombstoneSchema),
  settings: SettingsSchema,
})

export type Sex = z.infer<typeof SexSchema>
export type Person = z.infer<typeof PersonSchema>
export type Schedule = z.infer<typeof ScheduleSchema>
export type Checkup = z.infer<typeof CheckupSchema>
export type Occurrence = z.infer<typeof OccurrenceSchema>
export type Tombstone = z.infer<typeof TombstoneSchema>
export type FamilyDoc = z.infer<typeof FamilyDocSchema>

/** Settings of a fresh doc carry the epoch, so any real change wins the merge. */
const EPOCH = '1970-01-01T00:00:00.000Z'

export function emptyDoc(): FamilyDoc {
  return {
    schemaVersion: 1,
    persons: [],
    checkups: [],
    occurrences: [],
    tombstones: [],
    settings: { reminderHour: 9, updatedAt: EPOCH },
  }
}

/**
 * Validates a document. Unknown fields (e.g. the removed `everyYears`) are stripped.
 * Returns Zod's safeParse result. A future schemaVersion 2 would migrate here first.
 */
export function parseDoc(raw: unknown) {
  return FamilyDocSchema.safeParse(raw)
}
