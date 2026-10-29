import { z } from 'zod'
import { isValidDateString } from './dates'

/** Local calendar date `YYYY-MM-DD`. */
const DateString = z.string().refine(isValidDateString, 'Expected a date as YYYY-MM-DD')
/** ISO timestamp, set on every change. */
const Timestamp = z.iso.datetime({ offset: true })
const Month = z.number().int().min(1).max(12)

const SexSchema = z.enum(['m', 'w', 'd'])

const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  birthDate: DateString.optional(),
  sex: SexSchema.optional(),
  color: z.string().optional(),
  updatedAt: Timestamp,
})

const ScheduleSchema = z.discriminatedUnion('kind', [
  // Earliest again N months after the last done occurrence.
  z.object({ kind: z.literal('interval'), months: z.number().int().min(1) }),
  // Recurring season, may wrap the year end (e.g. Nov–Feb).
  z.object({
    kind: z.literal('seasonal'),
    startMonth: Month,
    endMonth: Month,
    everyYears: z.number().int().min(1),
  }),
  // One fixed window, e.g. a U-exam derived from the birth date.
  z.object({ kind: z.literal('once'), windowStart: DateString, windowEnd: DateString }),
])

const CheckupSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  templateId: z.string().optional(),
  practice: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().optional(),
  schedule: ScheduleSchema,
  /** Length of the execution window for 'interval'. */
  windowMonths: z.number().int().min(1).default(3),
  /** The booking window opens this many weeks before the execution window. */
  bookingLeadWeeks: z.number().int().min(0).default(6),
  /** 'interval' without history: when the first window starts. */
  firstWindowStart: DateString.optional(),
  active: z.boolean().default(true),
  updatedAt: Timestamp,
})

const OccurrenceStatusSchema = z.enum(['booked', 'done', 'skipped'])

const OccurrenceSchema = z.object({
  id: z.string().min(1),
  checkupId: z.string().min(1),
  /** Identifies which due window this occurrence belongs to. */
  windowStart: DateString,
  status: OccurrenceStatusSchema,
  appointmentDate: DateString.optional(),
  doneDate: DateString.optional(),
  skipReason: z.string().optional(),
  updatedAt: Timestamp,
})

const TombstoneSchema = z.object({ id: z.string().min(1), deletedAt: Timestamp })

const SettingsSchema = z.object({
  reminderHour: z.number().int().min(0).max(23).default(9),
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

/** Upgrades older documents to the current version. Only v1 exists so far (identity). */
export function migrateDoc(raw: unknown): unknown {
  return raw
}

/** Migrates, then validates. Returns Zod's safeParse result. */
export function parseDoc(raw: unknown) {
  return FamilyDocSchema.safeParse(migrateDoc(raw))
}
