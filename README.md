# Checking Sparks

Checking Sparks (`check.ingsparks.de`) is a small app for a family to track recurring preventive
check-ups (Vorsorge) for each person: it shows which check-up is due, when to book it, and whether
the appointment already happened, so nothing gets forgotten. Reminders go out as push notifications,
and the data is encrypted end to end with a family passphrase.

The product decisions are in [PLAN.md](PLAN.md). The technical contract (data model, schedule
rules, sync, API) is in [docs/](docs/), starting with [docs/architecture.md](docs/architecture.md).

## Scripts

| Script                 | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `bun run dev`          | Start the Vite dev server on port 5180                    |
| `bun run build`        | Production build into `dist/`                             |
| `bun run preview`      | Serve the production build locally                        |
| `bun run type-check`   | TypeScript check (`tsc -p tsconfig.app.json`)             |
| `bun run lint`         | oxlint with auto-fix                                      |
| `bun run lint-check`   | oxlint without fixing (CI)                                |
| `bun run format`       | oxfmt, writes files                                       |
| `bun run format-check` | oxfmt, checks only (CI)                                   |
| `bun run test-run`     | Vitest, single run                                        |
| `bun run knip`         | Unused files, exports and dependencies, strict            |
| `bun run knip-warn`    | Same as `knip`, warnings only                             |
| `bun run check`        | Everything above for local development                    |
| `bun run check-ci`     | What CI runs: type-check, lint-check, format-check, tests |

Requires [Bun](https://bun.sh). Install dependencies with `bun install`.

## Project layout

See [docs/architecture.md](docs/architecture.md#repository-layout) for the planned layout. The
current scaffold has the Vite + React + TanStack Router setup, Tailwind, and the tooling.

## License

AGPL-3.0-or-later, see [LICENSE.md](LICENSE.md).
