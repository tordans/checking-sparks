# Checking Sparks

_Vorsorge für die ganze Familie im Blick behalten._

Live: <https://check.ingsparks.de>. It serves one family only; there is no sign-up.

## What it does

Checking Sparks tracks recurring preventive check-ups (Vorsorge) for each person in a family. For
every check-up it shows when to book, when the appointment has to happen, and whether it took
place. When a check-up is done, the next one is planned from that date. Reminders arrive as push
notifications, and the family data is encrypted end to end with a shared passphrase.

## Who it is for

Families in Germany. The UI is German, and the built-in templates cover the German statutory
check-ups (G-BA), vaccinations (STIKO), and the children's U and J examinations. The templates are
starting values you can adjust. They are not medical advice.

## Privacy

Everything you enter (names, check-ups, appointments, notes) is end-to-end encrypted with the
family passphrase before it leaves the device. The server only stores the encrypted blob. The one
exception is the reminder plan: dates, link paths and the notification text (first name plus
check-up) are stored in clear text, because the server has to send the notifications without being
able to read the data. If the passphrase is lost, the data is lost, so export a backup now and then.
Details: [docs/privacy.md](docs/privacy.md) (German).

## How reminders work

Whenever the app syncs, it uploads the current reminder plan to the server. An hourly cron job on
the server sends the reminders that are due as Web Push notifications to every device that enabled
them. On iPhone, push only works for the app installed to the Home Screen (Share, Add to Home
Screen) and needs iOS 16.4 or later.

## Status and limitations

This is a personal project, built for one family.

- Push on iPhone is untested; it was tested in Chrome only.
- Single tenant: one instance, one family.
- The deploy documentation targets all-inkl hosting.

## Self-hosting

You need PHP 8.5, a MariaDB database, FTPS access to the web space, a cron job that can call a URL,
and a GitHub environment that holds the deploy secrets. A fork needs three changes: `SITE_URL` in
`.github/workflows/deploy.yml`, your own domain, and `VAPID_SUBJECT` (a contact address for the push
services). Setup and secrets are described in [docs/deploy.md](docs/deploy.md).
[scripts/setup-deploy-secrets.sh](scripts/setup-deploy-secrets.sh) creates the secrets for you.

## Development

Requires [Bun](https://bun.sh), and Docker for the PHP tests.

```sh
bun install
bun run dev
```

The dev server runs on <http://localhost:5180> and proxies `/api` to `localhost:8787`, where the
local PHP API runs (see [api/README.md](api/README.md)). Without that server the app works in
local-only mode: the data stays in the browser.

### Scripts

| Script                   | What it does                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `bun run dev`            | Vite dev server on port 5180                                 |
| `bun run build`          | Production build into `dist/`                                |
| `bun run preview`        | Serve the production build locally                           |
| `bun run type-check`     | TypeScript check (`tsc -p tsconfig.app.json`)                |
| `bun run lint`           | oxlint with auto-fix                                         |
| `bun run lint-check`     | oxlint without fixing (CI)                                   |
| `bun run format`         | oxfmt, writes files                                          |
| `bun run format-check`   | oxfmt, checks only (CI)                                      |
| `bun run test-run`       | Vitest, single run                                           |
| `bun run test-php`       | PHPUnit suite of `api/` in Docker (not part of `check`)      |
| `bun run knip`           | Unused files, exports and dependencies, strict               |
| `bun run knip-warn`      | Same as `knip`, but only warns                               |
| `bun run check`          | type-check, lint, format, tests and knip-warn (writes fixes) |
| `bun run check-ci`       | What CI runs: type-check, lint-check, format-check, tests    |
| `bun run check-pre-push` | Like `check`, with strict `knip`                             |

## Project layout

```
src/domain/       data model, schedule rules, merge, reminders, templates (no React)
src/crypto/       passphrase encryption of the family document
src/sync/         local store, API client, sync engine
src/push/         service worker registration, push subscription
src/routes/       pages (TanStack Router)
src/components/   UI, including the Catalyst-based building blocks
public/           manifest, service worker (offline app shell, push), icons
api/              PHP API (sync, reminders, push) with PHPUnit tests
```

More detail in [docs/architecture.md](docs/architecture.md).

## Documentation

- [PLAN.md](PLAN.md): product decisions (German)
- [docs/architecture.md](docs/architecture.md): data model, schedule rules, sync, API
- [docs/deploy.md](docs/deploy.md): hosting, secrets, deploy workflow
- [docs/privacy.md](docs/privacy.md): what is stored where (German)
- [docs/vorsorge-vorlagen.md](docs/vorsorge-vorlagen.md): the check-up templates and their sources (German)
- [docs/research.md](docs/research.md): background research behind the plan (German)

## License

AGPL-3.0-or-later, see [LICENSE.md](LICENSE.md).
