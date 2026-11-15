# CLAUDE.md

## Workflow

Defaults; deviate when the request or the situation calls for it.

- Work directly on `main`: no feature branches, no pull requests.
- Show the change before committing (UI: screenshot, phone viewport first; otherwise a short
  summary with the diff), then push once approved. If the request already says to ship, just ship.
- A push to `main` deploys to production (CI first, then FTPS). Check the runs and report.
- Linear history, no merge commits. Commit messages: one English sentence on what changes for users.

## Things that are easy to miss

- A new external origin or newly stored data needs the CSP in `api/deploy/htaccess` and
  `preview.headers` in `vite.config.ts`, plus `docs/privacy.md` and the in-app privacy page.
- New deploy secrets go into `docs/deploy.md` and `scripts/setup-deploy-secrets.sh`.
- Never edit an existing file in `api/migrations/` (the server applies them itself); add a new one.
- Family data is end-to-end encrypted; the server must never see plaintext beyond the reminder plan.
- Never regenerate the VAPID keys: every push subscription is bound to them.
