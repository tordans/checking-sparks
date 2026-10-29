# Architecture

Checking Sparks (`check.ingsparks.de`) tracks recurring preventive check-ups for a family.
Product decisions are in [PLAN.md](../PLAN.md); this file is the technical contract the code
follows. UI copy is German, code and docs are English.

## Overview

```
Browser (PWA, React SPA)                         all-inkl webspace (PHP 8.4)
├── domain/   pure TS: model, schedule, merge    ├── public/            static build + api/index.php
├── crypto/   AES-GCM + PBKDF2 envelope          ├── api/src/           tiny router, handlers
├── sync/     local cache, server sync, merge    ├── config/config.php  generated on deploy (not public)
├── push/     subscription, reminder plan        └── MariaDB            doc, reminders, subscriptions
└── routes/   TanStack Router pages               cron (KAS) → GET /api/push/run?key=…
```

- One deployment = one family (single tenant). Whoever deploys it owns it.
- The server never sees health data in clear text, except the reminder plan (see below).

## Repository layout

```
src/
  domain/        model.ts (Zod schemas + types), schedule.ts, merge.ts, reminders.ts,
                 templates.ts, ids.ts, dates.ts — no React, no DOM, fully unit tested
  crypto/        envelope.ts (encrypt/decrypt with passphrase) + tests
  sync/          store.ts (in-memory store + localStorage cache), api-client.ts, sync.ts
  push/          subscribe.ts (service worker registration, push subscription)
  routes/        TanStack Router file routes (code-based route tree in router.tsx is fine too)
  components/    UI building blocks
public/
  manifest.webmanifest, sw.js, icons/
api/
  public/index.php          entry (copied to dist/api/index.php on deploy)
  src/                      Router.php, Db.php, handlers, WebPush sending
  migrations/               001_init.sql, …
  tests/                    PHPUnit tests against SQLite
  composer.json             minishlink/web-push, phpunit (dev)
.github/workflows/          ci.yml (bun check + php tests), deploy.yml (FTPS)
```

## Data model (`schemaVersion: 1`)

All dates are local calendar dates `YYYY-MM-DD` (no time zone). Times only appear in the
reminder plan. Every record has `id` (random, `crypto.randomUUID()`) and `updatedAt`
(ISO timestamp, set on every change).

```ts
FamilyDoc {
  schemaVersion: 1
  persons: Person[]
  checkups: Checkup[]           // "Vorsorge-Art", always belongs to one person
  occurrences: Occurrence[]     // only stored once the user acts on a due window
  tombstones: { id, deletedAt }[]
  settings: { reminderHour: number /* 0–23, default 9 */, updatedAt }
}

Person { id, name, birthDate?: Date, sex?: 'm' | 'w' | 'd', color?: string, updatedAt }

Checkup {
  id, personId, title, templateId?: string,
  practice?: string, phone?: string, note?: string,
  schedule:
    | { kind: 'interval', months: number }                      // earliest again N months after last
    | { kind: 'seasonal', startMonth: 1–12, endMonth: 1–12, everyYears: number } // e.g. Oct–Dec
    | { kind: 'once', windowStart: Date, windowEnd: Date }      // e.g. U9 from birth date
  windowMonths: number      // length of the execution window for 'interval' (default 3)
  bookingLeadWeeks: number  // booking window opens this long before the execution window (default 6)
  firstWindowStart?: Date   // 'interval' without history: when the first window starts (default: creation day)
  active: boolean
  updatedAt
}

Occurrence {
  id, checkupId,
  windowStart: Date          // identifies which due window this occurrence belongs to
  status: 'booked' | 'done' | 'skipped'
  appointmentDate?: Date     // when booked (and kept when done)
  doneDate?: Date
  skipReason?: string
  updatedAt
}
```

## Schedule rules (`domain/schedule.ts`)

`computeDue(checkup, occurrences, today) → Due | null` (null when inactive or a `once`
checkup is done/skipped).

Anchor = the most recent of: `doneDate` of done occurrences; `windowEnd` of skipped occurrences.

| kind     | execution window                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| interval | no anchor: `[firstWindowStart, +windowMonths)`. Anchor: `[anchor + months, + windowMonths)`. Start = earliest date the check-up is due again (matches health-insurance rules like "once per 6 months"). |
| seasonal | first season (`startMonth`-01 to end of `endMonth`, may wrap the year end) whose year is ≥ anchor year + `everyYears` (no anchor: the current or next season not yet ended).                            |
| once     | `[windowStart, windowEnd]` until done/skipped.                                                                                                                                                          |

`bookingStart = windowStart − bookingLeadWeeks`.

The occurrence of the current due window is the one with the same `windowStart`.

State of a due window, in order of precedence:

| state      | condition                          | UI                                     |
| ---------- | ---------------------------------- | -------------------------------------- |
| `confirm`  | booked, `appointmentDate < today`  | "Hat der Termin stattgefunden?"        |
| `booked`   | booked, `appointmentDate ≥ today`  | shows date                             |
| `overdue`  | not booked, `today > windowEnd`    | "überfällig"                           |
| `book`     | not booked, `today ≥ bookingStart` | "jetzt buchen" (+ "bis …" = windowEnd) |
| `upcoming` | otherwise                          | "ab … buchen"                          |

Actions: `book(date)`, `rebook(date)`, `markDone(date = appointmentDate ?? today)`,
`skip(reason?)`, `undo` (delete the occurrence → tombstone). Marking done creates the next
window implicitly through the new anchor.

## Merge (`domain/merge.ts`)

`merge(a: FamilyDoc, b: FamilyDoc) → FamilyDoc`: union of records by `id`; the record with the
newer `updatedAt` wins; a tombstone removes a record whose `updatedAt <= deletedAt`; tombstones
are unioned and kept (pruned after 180 days). Commutative and idempotent — tested as properties.

## Encryption (`crypto/envelope.ts`)

```ts
Envelope {
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: base64 },
  cipher: { name: 'AES-GCM', iv: base64 },   // 12 random bytes, new per encryption
  data: base64                                // JSON.stringify(FamilyDoc)
}
```

- The salt is created once per family and reused, so every device derives the same key.
- The derived `CryptoKey` is non-extractable and cached in memory; the passphrase is stored on
  the device only if the user ticks "auf diesem Gerät merken" (localStorage), otherwise asked
  per session.
- Wrong passphrase → AES-GCM decryption fails → German error "Passphrase stimmt nicht".

## Server API (`api/`)

PHP 8.4, no framework, PDO (MariaDB in production, SQLite in tests). JSON in and out.
All endpoints except `health` and `push/run` require `Authorization: Bearer <familyKey>`;
the server only stores `sha256(familyKey)` (from config). Responses never echo request bodies;
error logs never contain bodies.

| Method + path                    | Body / headers                                                            | Result                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`                | –                                                                         | `{ ok: true, commit }`                                                                                                                     |
| `GET /api/doc`                   | –                                                                         | `200 { version, envelope }` + `ETag: "<version>"`, or `404`                                                                                |
| `PUT /api/doc`                   | `{ envelope }`, `If-Match: "<version>"` (or `If-None-Match: *` to create) | `200 { version }`; `409 { version, envelope }` on mismatch; `428` without precondition                                                     |
| `PUT /api/reminders`             | `{ reminders: Reminder[] }` (replaces all future, unsent ones)            | `200 { count }`                                                                                                                            |
| `GET /api/push/vapid-public-key` | –                                                                         | `{ key }`                                                                                                                                  |
| `POST /api/push/subscriptions`   | `{ endpoint, keys: { p256dh, auth }, label }`                             | `201` (upsert by endpoint)                                                                                                                 |
| `DELETE /api/push/subscriptions` | `{ endpoint }`                                                            | `204`                                                                                                                                      |
| `POST /api/push/test`            | –                                                                         | sends a test push to all subscriptions                                                                                                     |
| `GET`/`POST /api/push/run`       | `?key=<cronKey>` or `X-Cron-Key`                                          | sends due, unsent reminders to all subscriptions; marks them sent; deletes subscriptions that answer 404/410 → `{ sent, failed, removed }` |
| `POST /api/migrate`              | `X-Deploy-Key`                                                            | applies pending migrations                                                                                                                 |

`version` is an integer incremented on every write. The envelope is stored as an opaque string
(max 2 MB).

```ts
Reminder { id: string /* stable: `${checkupId}:${windowStart}:${kind}:${date}` */,
           at: ISO datetime with offset, title: string, body: string, path: string }
```

## Reminder plan (`domain/reminders.ts`)

`buildReminders(doc, today, hour) → Reminder[]` for the next 400 days, per due window:

| kind         | at                                                              | text (title / body)                                         |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `book-open`  | `bookingStart`, then every 7 days while state is `book` (max 8) | "Lena: Zahnarzt buchen" / "Termin bis 31.03. machen."       |
| `deadline`   | `windowEnd − 14 days`, if not booked                            | "Lena: Zahnarzt – nur noch 2 Wochen"                        |
| `day-before` | `appointmentDate − 1` at 18:00                                  | "Lena: morgen Zahnarzt" / practice                          |
| `confirm`    | `appointmentDate + 1`                                           | "Lena: War der Zahnarzt-Termin?" → path with `?action=done` |

Only reminders computed from current state are sent; `PUT /api/reminders` after every sync
replaces the unsent ones, so booking a date stops the booking reminders.
`path` is `/person/<personId>/vorsorge/<checkupId>` (+ `?action=done`).

## Sync (`sync/`)

- Local source of truth: the decrypted `FamilyDoc` in memory, cached as JSON in localStorage
  (`checking-sparks:doc:v1`), plus `{ serverVersion, dirty }`.
- On start, on window focus, and every 60 s while visible: `GET /api/doc` → decrypt → merge
  into local → if the result differs from the server copy, `PUT` with `If-Match`.
- On local change: mark dirty, debounce 1 s, `PUT`. On `409`: decrypt the returned envelope,
  merge, retry (max 3).
- After a successful `PUT`: `PUT /api/reminders` with the new plan.
- Without server configuration the app works fully local (useful for development and for
  people who only want export/import).

## Setup and pairing

- `/verbinden#key=<familyKey>` stores the key in localStorage and removes the fragment.
  Settings show the link to open on another device (as text and QR is out of scope for v1).
- First device without server doc: user picks a passphrase → create doc (`If-None-Match: *`).
  Other devices: enter passphrase → decrypt.

## PWA and push

- `public/manifest.webmanifest` (`display: standalone`, German name, icons), `public/sw.js`
  written by hand: app-shell cache, `push` → `showNotification(title, { body, data: { path } })`,
  `notificationclick` → focus an existing window and navigate, or `openWindow(path)`.
- Subscribe only after a user gesture (button in settings); on iOS only in the installed app —
  the UI explains "Zum Home-Bildschirm hinzufügen" when `Notification` is missing.
- `sw.js`: `index.html` network-first with cache fallback (every navigation gets the SPA shell),
  hashed `/assets/` cache-first, `/api/` never cached; a new worker takes over at once
  (`SKIP_WAITING`). Registered in `src/main.tsx` in production builds only (`VITE_ENABLE_SW=true`
  enables it in dev). A tap on a notification focuses an open window and sends it
  `{ type: 'navigate', path }` (the app routes itself, so the in-memory passphrase survives), or
  opens a new window at `path`. Browser side of push: `src/push/subscribe.ts`; hosting and
  deployment: [deploy.md](deploy.md).

## Routes

| Path                                    | Page                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/`                                     | "Jetzt zu tun": due windows of all persons grouped by state (confirm, overdue, book, booked, upcoming in the next 90 days) |
| `/person/$personId`                     | person: all checkups with next due window, button "Vorsorge hinzufügen"                                                    |
| `/person/$personId/vorsorge/neu`        | pick a template (filtered by age/sex) or create a custom one                                                               |
| `/person/$personId/vorsorge/$checkupId` | detail: state, actions (book, done, skip, undo), history, edit; `?action=done` opens the done dialog                       |
| `/einstellungen`                        | persons, sync (key, passphrase), push, export/import JSON, reminder hour                                                   |
| `/verbinden`                            | pairing via fragment                                                                                                       |

## Tooling

Same as `../vacation-planner`: Bun, Vite, React 19 (+ React Compiler), TanStack Router, Zod 4,
date-fns 4, Tailwind 4, oxlint, oxfmt, Knip, Vitest, TypeScript 7. Scripts `check`, `check-ci`.
PHP: tests run with `docker run php:8.4-cli` locally and `shivammathur/setup-php` in CI.
