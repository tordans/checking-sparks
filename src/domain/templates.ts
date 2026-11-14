import { newCheckup } from './actions'
import type { Env } from './actions'
import { addDays, addMonths, maxDate, monthsBetween } from './dates'
import type { Checkup, Person, Schedule } from './model'

/**
 * Catalog of standard preventive care in Germany, transcribed by hand from
 * docs/vorsorge-vorlagen.md. Starting values, not medical advice.
 */

export type TemplateStatus = 'Kasse' | 'Kasse (abhängig)' | 'STIKO' | 'IGeL' | 'Selbst'
type TemplateSex = 'alle' | 'm' | 'w'

/** Offset from the birth date: days for the first weeks of life, months otherwise. */
type AgeOffset = { days: number } | { months: number }

type TemplateSchedule =
  | { kind: 'interval'; months: number }
  | { kind: 'seasonal'; startMonth: number; endMonth: number }
  /** Fixed window relative to the birth date; both ends inclusive. */
  | { kind: 'once'; from: AgeOffset; to: AgeOffset }
  /** No recurrence in the source (single doses, IGeL, self checks). */
  | { kind: 'none' }

export interface Template {
  id: string
  name: string
  specialty: string
  sex: TemplateSex
  /** Eligible from this age (completed months). */
  ageFromMonths: number
  /** Eligible up to this age (completed months, inclusive); open end when missing. */
  ageToMonths?: number
  schedule: TemplateSchedule
  status: TemplateStatus
  hint: string
  /** The source row is marked `(?)`: not verified, check before use. */
  uncertain: boolean
  /** Self check or self measurement: no appointment needed. */
  selfCheck: boolean
}

/** Templates become visible this many months before the minimum age, to plan ahead. */
const SUGGEST_LOOKAHEAD_MONTHS = 6

// --- Builders (keep the table below readable) ----------------------------------------------

const interval = (months: number): TemplateSchedule => ({ kind: 'interval', months })
const seasonal = (startMonth: number, endMonth: number): TemplateSchedule => ({
  kind: 'seasonal',
  startMonth,
  endMonth,
})
const NONE: TemplateSchedule = { kind: 'none' }
const onceDays = (from: number, to: number): TemplateSchedule => ({
  kind: 'once',
  from: { days: from },
  to: { days: to },
})
const onceMonths = (from: number, to: number): TemplateSchedule => ({
  kind: 'once',
  from: { months: from },
  to: { months: to },
})
/** Ages in whole years, both inclusive: 18–34 runs until the 35th birthday. */
const onceYears = (from: number, to: number): TemplateSchedule =>
  onceMonths(from * 12, (to + 1) * 12)

/** Age in months at the start of a year (`from`) and at the end of the last year (`to`). */
const fromYears = (years: number): number => years * 12
const toYears = (years: number): number => (years + 1) * 12 - 1

interface Row {
  id: string
  name: string
  specialty: string
  sex?: TemplateSex
  from: number
  to?: number
  schedule: TemplateSchedule
  status: TemplateStatus
  hint?: string
  uncertain?: boolean
}

function template(row: Row): Template {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    sex: row.sex ?? 'alle',
    ageFromMonths: row.from,
    ...(row.to === undefined ? {} : { ageToMonths: row.to }),
    schedule: row.schedule,
    status: row.status,
    hint: row.hint ?? '',
    uncertain: row.uncertain ?? false,
    selfCheck: row.status === 'Selbst',
  }
}

// --- Catalog -------------------------------------------------------------------------------

const ADULTS: Template[] = [
  template({
    id: 'check-up-18',
    name: 'Gesundheits-Check-up (18–34)',
    specialty: 'Hausarzt/Internist',
    from: fromYears(18),
    to: toYears(34),
    schedule: onceYears(18, 34),
    status: 'Kasse',
    hint: 'Einmalig; Labor nur bei Risikoprofil',
  }),
  template({
    id: 'check-up-35',
    name: 'Gesundheits-Check-up (ab 35)',
    specialty: 'Hausarzt/Internist',
    from: fromYears(35),
    schedule: interval(36),
    status: 'Kasse',
    hint: 'Blutdruck, Urin, Blutzucker, Cholesterin; Hepatitis B/C einmalig. G-BA berät seit 15.10.2026 über Alter, Intervall und Fokus (nicht beschlossen)',
  }),
  template({
    id: 'bauchaorta',
    name: 'Bauchaorten-Ultraschall',
    specialty: 'Hausarzt/Internist',
    sex: 'm',
    from: fromYears(65),
    to: toYears(65),
    schedule: onceYears(65, 65),
    status: 'Kasse',
    hint: 'Optional, Teil des Check-ups (?)',
    uncertain: true,
  }),
  template({
    id: 'blutdruck-selbst',
    name: 'Blutdruck-Selbstmessung',
    specialty: 'Selbst',
    from: fromYears(18),
    schedule: NONE,
    status: 'Selbst',
    hint: 'Kein Termin; Werte mit Arzt besprechen',
  }),
  template({
    id: 'erw-blutbild',
    name: 'Erweitertes Blutbild',
    specialty: 'Hausarzt',
    from: fromYears(18),
    schedule: NONE,
    status: 'IGeL',
    hint: 'Nicht Teil des Check-ups; ohne Beschwerden kein Routinenutzen belegt (?)',
    uncertain: true,
  }),
  template({
    id: 'prostata-dru',
    name: 'Prostata-Tastuntersuchung',
    specialty: 'Urologe/Hausarzt',
    sex: 'm',
    from: fromYears(45),
    schedule: interval(12),
    status: 'Kasse',
    hint: 'Jährlich ab 45 (Anspruch laut GKV)',
  }),
  template({
    id: 'psa',
    name: 'PSA-Test',
    specialty: 'Urologe/Hausarzt',
    sex: 'm',
    from: fromYears(45),
    schedule: NONE,
    status: 'IGeL',
    hint: 'IGeL-Monitor: tendenziell negativ (Update 2017). Leitlinien-Entwurf 2025 (?) prüfen',
    uncertain: true,
  }),
  template({
    id: 'hautkrebs',
    name: 'Hautkrebs-Screening',
    specialty: 'Hautarzt/Hausarzt',
    from: fromYears(35),
    schedule: interval(24),
    status: 'Kasse',
    hint: 'Ganzkörper-Check. G-BA prüft die Regelung bis Ende 2027 (Stand 15.10.2026)',
  }),
  template({
    id: 'darmkrebs-stuhl',
    name: 'Darmkrebs-Stuhltest (iFOBT)',
    specialty: 'Hausarzt',
    from: fromYears(50),
    schedule: interval(24),
    status: 'Kasse',
    hint: 'Alternative zur Darmspiegelung. Positiv: immer Koloskopie',
  }),
  template({
    id: 'darmspiegelung',
    name: 'Darmspiegelung (Koloskopie)',
    specialty: 'Gastroenterologe',
    from: fromYears(50),
    schedule: interval(120),
    status: 'Kasse',
    hint: 'Zwei Untersuchungen im Abstand von 10 Jahren. Danach alternativ Stuhltest',
  }),
  template({
    id: 'zervix-20',
    name: 'Gebärmutterhalskrebs-Abstrich',
    specialty: 'Gynäkologie',
    sex: 'w',
    from: fromYears(20),
    to: toYears(34),
    schedule: interval(12),
    status: 'Kasse',
    hint: 'Jährlicher Pap-Abstrich',
  }),
  template({
    id: 'zervix-35',
    name: 'Gebärmutterhalskrebs-Ko-Test',
    specialty: 'Gynäkologie',
    sex: 'w',
    from: fromYears(35),
    schedule: interval(36),
    status: 'Kasse',
    hint: 'HPV-Test plus Pap, alle 3 Jahre (statt jährlichem Pap)',
  }),
  template({
    id: 'gyn-untersuchung',
    name: 'Gynäkologische Tastuntersuchung',
    specialty: 'Gynäkologie',
    sex: 'w',
    from: fromYears(20),
    schedule: interval(12),
    status: 'Kasse',
    hint: 'Jährlich (?)',
    uncertain: true,
  }),
  template({
    id: 'mammo',
    name: 'Mammographie-Screening',
    specialty: 'Screening-Einheit (Radiologie)',
    sex: 'w',
    from: fromYears(50),
    to: toYears(75),
    schedule: interval(24),
    status: 'Kasse',
    hint: 'Einladung durch Programm. 70–75 seit 07/2024. 45–49 beschlossen, Start voraussichtlich 2027 (?)',
    uncertain: true,
  }),
  template({
    id: 'brust-selbst',
    name: 'Brust-Selbstabtasten',
    specialty: 'Selbst',
    sex: 'w',
    from: fromYears(20),
    schedule: NONE,
    status: 'Selbst',
    hint: 'Ersetzt keine Mammographie oder Ärztliche Untersuchung',
  }),
  template({
    id: 'brust-us',
    name: 'Brust-Ultraschall',
    specialty: 'Gynäkologie',
    sex: 'w',
    from: fromYears(40),
    schedule: NONE,
    status: 'IGeL',
    hint: 'IGeL-Monitor (06/2025): unklar. Altersgrenze nicht verifiziert',
    uncertain: true,
  }),
  template({
    id: 'schilddruese-us',
    name: 'Schilddrüsen-Ultraschall',
    specialty: 'Hausarzt/Internist',
    from: fromYears(18),
    schedule: NONE,
    status: 'IGeL',
    hint: 'IGeL-Monitor (08/2024): tendenziell negativ',
  }),
  template({
    id: 'ruhe-ekg',
    name: 'Ruhe-EKG',
    specialty: 'Hausarzt/Kardiologe',
    from: fromYears(18),
    schedule: NONE,
    status: 'IGeL',
    hint: 'Ohne Beschwerden keine Routineleistung (?)',
    uncertain: true,
  }),
  template({
    id: 'belastungs-ekg',
    name: 'Belastungs-EKG',
    specialty: 'Kardiologe',
    from: fromYears(18),
    schedule: NONE,
    status: 'IGeL',
    hint: 'IGeL-Monitor: tendenziell negativ (Datum nicht geprüft)',
  }),
  template({
    id: 'carotis',
    name: 'Ultraschall Halsschlagadern',
    specialty: 'Hausarzt/Gefäßmedizin',
    from: fromYears(50),
    schedule: NONE,
    status: 'IGeL',
    hint: 'IGeL-Monitor: tendenziell negativ (ohne Beschwerden)',
  }),
  template({
    id: 'glaukom',
    name: 'Glaukom-Früherkennung (Augeninnendruck, Augenspiegelung)',
    specialty: 'Augenarzt',
    from: fromYears(40),
    schedule: NONE,
    status: 'IGeL',
    hint: 'IGeL-Monitor: tendenziell negativ. Neue Bewertung 15.02.2026 laut Dateiname (?)',
    uncertain: true,
  }),
  template({
    id: 'osteo',
    name: 'Osteoporose-Risiko-Check',
    specialty: 'Hausarzt',
    sex: 'w',
    from: fromYears(50),
    schedule: NONE,
    status: 'IGeL',
    hint: 'Knochendichte-Messung nur bei Indikation (?)',
    uncertain: true,
  }),
  template({
    id: 'td',
    name: 'Tetanus/Diphtherie-Auffrischung (Td/Tdap)',
    specialty: 'Hausarzt',
    from: fromYears(18),
    schedule: interval(120),
    status: 'STIKO',
    hint: 'Auffrischung alle 10 Jahre; Keuchhusten (Tdap) einmalig im Erwachsenenalter',
  }),
  template({
    id: 'grippe',
    name: 'Grippeimpfung',
    specialty: 'Hausarzt',
    from: fromYears(60),
    schedule: seasonal(10, 12),
    status: 'STIKO',
    hint: 'Ab 60 jährlich; auch für Risikogruppen (?)',
    uncertain: true,
  }),
  template({
    id: 'covid',
    name: 'COVID-19-Impfung',
    specialty: 'Hausarzt',
    from: fromYears(75),
    schedule: seasonal(9, 11),
    status: 'STIKO',
    hint: 'STIKO 2026: Standard ab 75 (EpBull 28/2026, Sekundärquelle). Vorher ab 60',
    uncertain: true,
  }),
  template({
    id: 'pneumokokken',
    name: 'Pneumokokken-Impfung',
    specialty: 'Hausarzt',
    from: fromYears(60),
    schedule: NONE,
    status: 'STIKO',
    hint: 'Einzeldosis (20-valent) laut Sekundärquelle; Quellen widersprüchlich (?)',
    uncertain: true,
  }),
  template({
    id: 'zoster',
    name: 'Gürtelrose (Herpes zoster)',
    specialty: 'Hausarzt',
    from: fromYears(60),
    schedule: NONE,
    status: 'STIKO',
    hint: '2 Dosen im Abstand 2–6 Monaten. Ab 18 bei Immunschwäche (?)',
    uncertain: true,
  }),
  template({
    id: 'rsv',
    name: 'RSV-Impfung',
    specialty: 'Hausarzt',
    from: fromYears(75),
    schedule: NONE,
    status: 'STIKO',
    hint: 'Standard ab 75. 60–74 mit Grunderkrankung oder Pflegeheim (Indikation)',
  }),
  template({
    id: 'fsme',
    name: 'FSME-Impfung',
    specialty: 'Hausarzt/Reisemedizin',
    from: 0,
    schedule: interval(60),
    status: 'STIKO',
    hint: 'Nur bei Zeckenexposition in Risikogebieten. Grundimmunisierung 3 Dosen, Auffrischung alle 3–5 Jahre (?)',
    uncertain: true,
  }),
  template({
    id: 'zahn-kontrolle',
    name: 'Zahnärztliche Kontrolluntersuchung',
    specialty: 'Zahnarzt',
    from: fromYears(18),
    schedule: interval(6),
    status: 'Kasse',
    hint: 'Anspruch 1× pro Halbjahr. Bonusheft erhöht Zuschuss für Zahnersatz',
  }),
  template({
    id: 'zahn-zahnstein',
    name: 'Zahnsteinentfernung',
    specialty: 'Zahnarzt',
    from: fromYears(18),
    schedule: interval(12),
    status: 'Kasse',
    hint: '1× pro Jahr',
  }),
  template({
    id: 'zahn-psi',
    name: 'Parodontal-Screening (PSI)',
    specialty: 'Zahnarzt',
    from: fromYears(35),
    schedule: interval(24),
    status: 'Kasse',
    hint: 'Alle 2 Jahre (Altersgrenze (?))',
    uncertain: true,
  }),
  template({
    id: 'zahn-pzr',
    name: 'Professionelle Zahnreinigung (PZR)',
    specialty: 'Zahnarzt/Prophylaxe',
    from: fromYears(18),
    schedule: interval(6),
    status: 'IGeL',
    hint: 'In der Regel Selbstzahlung (?)',
    uncertain: true,
  }),
]

// Children: month ranges are taken literally as ages in months (U9: 60–64 months);
// year ranges as whole years (J1: 12–14 runs until the 15th birthday).
const CHILDREN: Template[] = [
  template({
    id: 'u1',
    name: 'U1',
    specialty: 'Kinderarzt/Geburtsklinik',
    from: 0,
    to: 0,
    schedule: onceDays(0, 0),
    status: 'Kasse',
    hint: 'Direkt nach Geburt',
  }),
  template({
    id: 'u2',
    name: 'U2',
    specialty: 'Kinderarzt',
    from: 0,
    to: 0,
    schedule: onceDays(3, 10),
    status: 'Kasse',
    uncertain: true,
  }),
  template({
    id: 'u3',
    name: 'U3',
    specialty: 'Kinderarzt',
    from: 0,
    to: 1,
    schedule: onceDays(28, 35),
    status: 'Kasse',
    uncertain: true,
  }),
  template({
    id: 'u4',
    name: 'U4',
    specialty: 'Kinderarzt',
    from: 3,
    to: 4,
    schedule: onceMonths(3, 4),
    status: 'Kasse',
  }),
  template({
    id: 'u5',
    name: 'U5',
    specialty: 'Kinderarzt',
    from: 6,
    to: 7,
    schedule: onceMonths(6, 7),
    status: 'Kasse',
    uncertain: true,
  }),
  template({
    id: 'u6',
    name: 'U6',
    specialty: 'Kinderarzt',
    from: 10,
    to: 12,
    schedule: onceMonths(10, 12),
    status: 'Kasse',
    uncertain: true,
  }),
  template({
    id: 'u7',
    name: 'U7',
    specialty: 'Kinderarzt',
    from: 21,
    to: 24,
    schedule: onceMonths(21, 24),
    status: 'Kasse',
  }),
  template({
    id: 'u7a',
    name: 'U7a',
    specialty: 'Kinderarzt',
    from: 34,
    to: 36,
    schedule: onceMonths(34, 36),
    status: 'Kasse',
    uncertain: true,
  }),
  template({
    id: 'u8',
    name: 'U8',
    specialty: 'Kinderarzt',
    from: 46,
    to: 48,
    schedule: onceMonths(46, 48),
    status: 'Kasse',
    uncertain: true,
  }),
  template({
    id: 'u9',
    name: 'U9',
    specialty: 'Kinderarzt',
    from: 60,
    to: 64,
    schedule: onceMonths(60, 64),
    status: 'Kasse',
    hint: 'Vor Schulbeginn',
    uncertain: true,
  }),
  template({
    id: 'u10',
    name: 'U10',
    specialty: 'Kinderarzt',
    from: fromYears(7),
    to: toYears(8),
    schedule: onceYears(7, 8),
    status: 'Kasse (abhängig)',
    hint: 'Kein allgemeiner Anspruch; Zusatzleistung einzelner Kassen',
    uncertain: true,
  }),
  template({
    id: 'u11',
    name: 'U11',
    specialty: 'Kinderarzt',
    from: fromYears(9),
    to: toYears(10),
    schedule: onceYears(9, 10),
    status: 'Kasse (abhängig)',
    hint: 'Wie U10',
    uncertain: true,
  }),
  template({
    id: 'j1',
    name: 'J1 (Jugendgesundheitsuntersuchung)',
    specialty: 'Kinderarzt/Hausarzt',
    from: fromYears(12),
    to: toYears(14),
    schedule: onceYears(12, 14),
    status: 'Kasse',
  }),
  template({
    id: 'j2',
    name: 'J2',
    specialty: 'Kinderarzt/Hausarzt',
    from: fromYears(16),
    to: toYears(17),
    schedule: onceYears(16, 17),
    status: 'Kasse (abhängig)',
    hint: 'Quellen nennen 16–17 bzw. 16–18 Jahre',
    uncertain: true,
  }),
  template({
    id: 'zahn-fu',
    name: 'Kinderzahn-Früherkennung (FU)',
    specialty: 'Kinderzahnarzt',
    from: 6,
    to: 72,
    schedule: interval(6),
    status: 'Kasse',
    hint: 'Mehrere FU-Termine (Anzahl und Fenster (?))',
    uncertain: true,
  }),
  template({
    id: 'imp-grund',
    name: 'Grundimmunisierung Säuglinge (6-fach, Pneumokokken, Rotavirus (?))',
    specialty: 'Kinderarzt',
    from: 2,
    to: 12,
    schedule: onceMonths(2, 12),
    status: 'STIKO',
    hint: 'Mehrere Dosen im 1. Lebensjahr, Details laut Impfkalender (?)',
    uncertain: true,
  }),
  template({
    id: 'imp-mmr',
    name: 'Masern, Mumps, Röteln, Windpocken (MMR/V)',
    specialty: 'Kinderarzt',
    from: 11,
    to: 14,
    schedule: onceMonths(11, 14),
    status: 'STIKO',
    hint: 'Masern/Windpocken am selben Termin oder 4 Wochen Abstand',
    uncertain: true,
  }),
  template({
    id: 'imp-auffr-5',
    name: 'Auffrischung Vorschulalter (DTaP-IPV, MMR/V)',
    specialty: 'Kinderarzt',
    from: fromYears(5),
    to: toYears(6),
    schedule: onceYears(5, 6),
    status: 'STIKO',
    uncertain: true,
  }),
  template({
    id: 'imp-td-9',
    name: 'Td/Tdap-Auffrischung',
    specialty: 'Kinderarzt/Hausarzt',
    from: fromYears(9),
    to: toYears(16),
    schedule: onceYears(9, 16),
    status: 'STIKO',
    hint: 'Einmalige Auffrischung in diesem Fenster',
  }),
  template({
    id: 'imp-hpv',
    name: 'HPV-Impfung',
    specialty: 'Kinderarzt/Hausarzt',
    from: fromYears(9),
    to: toYears(14),
    schedule: onceYears(9, 14),
    status: 'STIKO',
    hint: 'Grundimmunisierung mit 2 Dosen (?)',
    uncertain: true,
  }),
  template({
    id: 'imp-men',
    name: 'Meningokokken ACWY',
    specialty: 'Kinderarzt/Hausarzt',
    from: fromYears(12),
    to: toYears(14),
    schedule: onceYears(12, 14),
    status: 'STIKO',
    hint: 'Nachholbar bis 25. Geburtstag (neu 2026)',
  }),
  template({
    id: 'imp-pneumo',
    name: 'Pneumokokken (Risikogruppen)',
    specialty: 'Kinderarzt',
    from: fromYears(2),
    to: toYears(17),
    schedule: onceYears(2, 17),
    status: 'STIKO',
    hint: 'Nur bei erhöhtem Risiko, 20-valent',
  }),
]

export const TEMPLATES: readonly Template[] = [...ADULTS, ...CHILDREN]

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

// --- Suggestions ---------------------------------------------------------------------------

export interface Suggestion {
  template: Template
  /** The template is age-restricted but the person has no birth date, so it was not filtered. */
  ageUnknown: boolean
  /** The template is sex-specific but the person's sex is not m/w, so it was not filtered. */
  sexUnknown: boolean
}

function isAgeRestricted(t: Template): boolean {
  return t.ageFromMonths > 0 || t.ageToMonths !== undefined
}

function matchesAge(t: Template, ageMonths: number): boolean {
  if (ageMonths + SUGGEST_LOOKAHEAD_MONTHS < t.ageFromMonths) return false
  return t.ageToMonths === undefined || ageMonths <= t.ageToMonths
}

/**
 * Templates that fit the person's age and sex, in catalog order. Without birth date or with
 * unknown sex the filter is skipped and the suggestion is flagged instead. Self checks are
 * left out unless `includeSelfChecks` is set.
 */
export function suggestTemplates(
  person: Pick<Person, 'birthDate' | 'sex'>,
  today: string,
  options: { includeSelfChecks?: boolean } = {},
): Suggestion[] {
  const ageMonths = person.birthDate ? monthsBetween(person.birthDate, today) : undefined
  const sex = person.sex === 'm' || person.sex === 'w' ? person.sex : undefined
  const suggestions: Suggestion[] = []
  for (const t of TEMPLATES) {
    if (t.selfCheck && !options.includeSelfChecks) continue
    if (ageMonths !== undefined && !matchesAge(t, ageMonths)) continue
    if (sex && t.sex !== 'alle' && t.sex !== sex) continue
    suggestions.push({
      template: t,
      ageUnknown: ageMonths === undefined && isAgeRestricted(t),
      sexUnknown: !sex && t.sex !== 'alle',
    })
  }
  return suggestions
}

// --- Check-up from a template --------------------------------------------------------------

function offsetFromBirth(birthDate: string, offset: AgeOffset): string {
  return 'days' in offset ? addDays(birthDate, offset.days) : addMonths(birthDate, offset.months)
}

/** Earliest sensible start: today, or the minimum age if the person is younger. */
function earliestStart(template: Template, person: Person, today: string): string {
  return person.birthDate
    ? maxDate(today, addMonths(person.birthDate, template.ageFromMonths))
    : today
}

/** Window for templates without recurrence: one year from the earliest start. */
function openWindow(template: Template, person: Person, today: string): Schedule {
  const windowStart = earliestStart(template, person, today)
  return { kind: 'once', windowStart, windowEnd: addDays(addMonths(windowStart, 12), -1) }
}

function scheduleFor(template: Template, person: Person, today: string): Schedule {
  const { schedule } = template
  switch (schedule.kind) {
    case 'interval':
    case 'seasonal':
      return schedule
    case 'once':
      return person.birthDate
        ? {
            kind: 'once',
            windowStart: offsetFromBirth(person.birthDate, schedule.from),
            windowEnd: offsetFromBirth(person.birthDate, schedule.to),
          }
        : openWindow(template, person, today)
    case 'none':
      return openWindow(template, person, today)
  }
}

/**
 * Builds a check-up for the person from a template. U/J exams and other age-bound `once`
 * templates get their window from the birth date; without a birth date, and for templates
 * without recurrence, the window is one year from today (or from the minimum age).
 * Intervals start at `earliestStart`; the grippe/COVID templates are seasonal.
 */
export function checkupFromTemplate(
  template: Template,
  person: Person,
  today: string,
  env: Env = {},
): Checkup {
  const schedule = scheduleFor(template, person, today)
  return newCheckup(
    {
      personId: person.id,
      title: template.name,
      templateId: template.id,
      schedule,
      ...(schedule.kind === 'interval'
        ? { firstWindowStart: earliestStart(template, person, today) }
        : {}),
    },
    env,
  )
}
