# Deployment (all-inkl, `check.ingsparks.de`)

The app (static Vite build) and the PHP API are served from one all-inkl webspace. One GitHub
Actions workflow ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) runs the
checks, builds, uploads via FTPS and checks that the new commit is live. The API creates and
updates its database tables itself on the first request that needs them, so there is no migration
step. The design follows `vacation-planner/docs/central-storage-plan.md`.

```
GitHub (push to main / "Run workflow")
  ci.yml (bun run check-ci + PHPUnit) -> bun run build -> assemble folder -> FTPS upload
  -> api/deploy/check.sh (commit from /api/health, CSP, 404, 401s)

cron (KAS), hourly: GET /api/push/run?key=<cronKey>   (section 1, step 6)
```

The server never sees health data in clear text: the family document is encrypted in the browser
with the family passphrase (see [architecture.md](architecture.md)). Secrets never live in the
repository; `config.php` is generated in the workflow and exists only on the server.

## Folder layout on the server

The folder name is whatever KAS creates for the subdomain (e.g. `check.ingsparks.de/`, called
`check/` below). One FTP user, one folder; only `public/` is the document root of `check.ingsparks.de`. `vendor/`
lives inside `api/` (the same relative layout as in the repository); the entry
`public/api/index.php` is a copy of `api/public/index.php` and finds the code in `../../api`
(in the repository it finds it in `..`). PHP on all-inkl may read files outside the document root
of the same account.

```
check/                         FTP root of the dedicated FTP user
  config/config.php            generated on deploy: DB, key hashes, VAPID, commit (not public)
  api/
    src/                       PHP code
    migrations/                SQL files, applied by the API itself
    vendor/                    composer install --no-dev --optimize-autoloader
  logs/                        api.log (not public)
  public/                      document root (KAS subdomain target: check/public/)
    .htaccess                  from api/deploy/htaccess
    index.html, assets/, sw.js, manifest.webmanifest, pwa-icons/   the Vite build (dist/)
    api/index.php              copy of api/public/index.php
```

`api/deploy/htaccess` (Apache 2.4): HTTPS only; passes the `Authorization` header to PHP (FastCGI
would drop it); `/api/*` to `api/index.php`; existing files served as is; missing `/assets/*` is a
real 404; everything else falls back to `index.html` (SPA); `/`, `index.html`, `sw.js` and
`manifest.webmanifest` are `no-cache`, `/assets/*` is `immutable` for one year; dotfiles are denied
(except `/.well-known/`); no directory listing; security headers, including a strict
`Content-Security-Policy` (everything `'self'`, no inline script or style, no framing; keep it in
sync with `preview.headers` in `vite.config.ts`). `mod_headers` and `mod_deflate` are optional for
the site to work, but `check.sh` fails without the CSP header.

## 1. One-time setup in KAS (all-inkl)

Do these once, in this order.

1. **Subdomain.** KAS > Domain > Subdomain > add `check` under `ingsparks.de`. KAS creates the
   folder `/check.ingsparks.de/` and points the subdomain at it. Change the target ("Ziel >
   Webspace") to its subfolder **`/check.ingsparks.de/public/`**, so `config/`, `api/` and `logs/`
   next to it are not reachable from the web (create `public/` via FTP first if KAS insists on an
   existing folder). The FTP user's path stays `/check.ingsparks.de/`.
2. **TLS.** KAS > Domain > the subdomain > SSL: enable Let's Encrypt for `check.ingsparks.de`.
   Wait until `https://check.ingsparks.de/` answers (a 403/404 page is fine before the first deploy).
   The `.htaccess` redirects HTTP to HTTPS and sends HSTS, so TLS must work before the first deploy.
3. **PHP.** KAS > Tools > PHP version (or the subdomain's PHP setting): **PHP 8.5** for the
   subdomain. Check the extensions: `pdo_mysql`, `mbstring`, `curl`, `openssl` are required;
   `gmp` (or `bcmath`) makes the push encryption much faster (about 100-300 ms per notification
   instead of seconds).
4. **Database.** KAS > Tools > Databases > new MariaDB database (utf8mb4). Note host (usually
   `localhost`), database name, user and password: they become `DB_HOST`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD`. Migrations create the tables on the first deploy.
5. **FTP user.** KAS > Tools > FTP > new user, **restricted to the folder `check/`** (its FTP root
   is `check/`, so it can never touch other sites of the account). FTPS (explicit, port 21) is the
   only protocol the workflow uses. Host, user and password become `FTP_SERVER`, `FTP_USERNAME`,
   `FTP_PASSWORD`. Use a long random password just for this user.
6. **Cron job.** After the first successful deploy (the key must be in `config.php`):
   KAS > Tools > Cronjobs > new: URL `https://check.ingsparks.de/api/push/run?key=<cronKey>`,
   hourly (every 15 minutes is also fine). Reminders go out at the first run after their time, so the delay is at most
   the interval. The key travels in the query string and shows up in the web server access log;
   that is acceptable because it can only trigger sending of already due reminders. Never reuse the
   family key for it.

## 2. Generate keys and secrets

**Guided:** `scripts/setup-deploy-secrets.sh` does all of this section and section 3 in one go: it
generates the keys, asks for the FTP and database passwords (hidden input), writes every secret to
the GitHub environment `production` with `gh secret set`, and at the end shows the family key,
cron key once for your password manager. Nothing is written to disk.

By hand: run from the repository root. Docker is used so that PHP is not needed locally (the image is built
once with `bun run test-php`, or with `docker build -t checking-sparks-api-test -f api/Dockerfile.test api`).
`composer install` must have run in `api/` once (also done by `bun run test-php`) for the VAPID script.

```sh
# two random secrets: family key and cron key (keep them in a password manager)
openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n'   # run twice; URL-safe on purpose

# sha256 hex digest of the family key and of the cron key (the server only stores digests)
printf '%s' '<familyKey>' | shasum -a 256 | cut -d' ' -f1
printf '%s' '<cronKey>'   | shasum -a 256 | cut -d' ' -f1

# VAPID key pair: ONCE. Do not regenerate later: every subscription is bound to the public key.
docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test php bin/generate-vapid.php
```

Why URL-safe: the family key travels in the pairing link (`/verbinden#key=...`) and the cron key in
a query string. Do not add a trailing newline when storing a secret in GitHub.

## 3. GitHub: environment and secrets

Repository > Settings > Environments > **production** (optionally require a reviewer), then add
these **environment secrets** (the workflow uses `environment: production`):

| Secret              | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| `FTP_SERVER`        | FTP host from KAS                                                            |
| `FTP_USERNAME`      | the dedicated FTP user (restricted to `check/`)                              |
| `FTP_PASSWORD`      | its password                                                                 |
| `DB_HOST`           | database host from KAS (usually `localhost`)                                 |
| `DB_NAME`           | database name                                                                |
| `DB_USER`           | database user                                                                |
| `DB_PASSWORD`       | database password                                                            |
| `FAMILY_KEY_SHA256` | sha256 hex of the family key (the key itself stays in your password manager) |
| `CRON_KEY_SHA256`   | sha256 hex of the cron key (the key itself is only in the KAS cron job)      |
| `VAPID_PUBLIC_KEY`  | from `generate-vapid.php`                                                    |
| `VAPID_PRIVATE_KEY` | from `generate-vapid.php`                                                    |
| `VAPID_SUBJECT`     | `mailto:you@example.com` (a contact address for push services)               |

The workflow fails before uploading if a secret is missing or a digest is not 64 hex characters.
The site URL (`SITE_URL`) is set at the top of `deploy.yml`.

**Rotating a key:** generate a new value, update the secret (and the KAS cron job / your password
manager), run the workflow again ("Run workflow"). The old key stops working after the deploy.
Rotating the family key means every device needs the new pairing link; the VAPID keys must not be
rotated (all devices would have to subscribe again).

## 4. What the workflow does

1. Job `ci`: calls [`ci.yml`](../.github/workflows/ci.yml) (`bun run check-ci` and the PHPUnit
   suite). The deploy job only starts when it is green.
2. Job `deploy`: `bun run build`, `composer install --no-dev --optimize-autoloader`, assemble
   `deploy-out/` exactly like the layout above, generate `config/config.php` from the secrets (with
   the commit), then two uploads with `SamKirkland/FTP-Deploy-Action` (pinned to the commit of v4.4.0,
   `ftps`, port 21, `security: strict`, incremental sync, never a clean slate): pass 1 is everything
   except `index.html`, pass 2 is only `index.html`, which switches visitors to the new build. The
   sync state files sit in the FTP root (`check/`), outside the document root.
3. `api/deploy/check.sh https://check.ingsparks.de <commit>`: `/api/health` shows the commit just
   deployed, `/` is HTML with a Content-Security-Policy (fails without `mod_headers`), a missing
   asset is a real 404, `/api/doc` and `/api/push/run` answer 401 without key, `/.htaccess` is not
   served. A failed check fails the run; the output is also in the run summary. You can run the
   script by hand against the live site.

Deploys on pushes to `main` never run in parallel (`concurrency`) and are never cancelled half way.
An interrupted upload leaves a half-updated state that the health check makes visible; re-running
the workflow fixes it.

`security: strict` makes the FTPS client verify the server certificate. If all-inkl presents a
certificate for a different host name than `FTP_SERVER`, use the host name from the certificate or,
as a last resort, change it to `loose` in both upload steps.

## 5. First deploy checklist

- [ ] KAS: subdomain `check.ingsparks.de` -> `/check.ingsparks.de/public/`, Let's Encrypt active, PHP 8.5, database
      created, FTP user restricted to `check/`.
- [ ] Keys generated; all 12 secrets set in the `production` environment.
- [ ] Merge to `main` (or "Run workflow"). All steps green, including "Check the live site".
- [ ] Open <https://check.ingsparks.de/> (loads), `/api/health` (`{"ok":true,"commit":"..."}`).
- [ ] KAS cron job created (section 1, step 6). Check with
      `curl 'https://check.ingsparks.de/api/push/run?key=<cronKey>'` -> `{"sent":0,...}`.
- [ ] Pair the first device and enable notifications (section 6); press "Test senden".
- [ ] After a reminder time has passed, the next cron run delivers the notification.
- [ ] Look at `check/logs/api.log` (via FTP) once; it should be empty or only contain short error lines.

If the log shows `db error sqlstate=...` or `/api/health` works but everything else gives 500, check
`config/config.php` on the server (DB host/name/user) and the PHP version of the subdomain.

## 6. Pairing devices

The family key is the only thing a device needs to talk to the server; the passphrase decrypts the data.

1. **First device:** open `https://check.ingsparks.de/verbinden#key=<familyKey>` (the key is removed
   from the address bar at once). Choose a passphrase (twice) and "Verschlüsseln und speichern":
   the encrypted document is created on the server. If you already used the app locally, that data
   is uploaded.
2. **More devices:** on a connected device open Einstellungen > Synchronisieren, copy "Link für ein
   weiteres Gerät" and open it on the other device; enter the passphrase there ("Passphrase auf
   diesem Gerät merken" avoids typing it again). Send the link over a private channel; whoever has
   link and passphrase sees all data.
3. **Notifications on each device:** Einstellungen > Erinnerungen > "Benachrichtigungen aktivieren"
   (give the device a name), then "Test senden".
   - Android / desktop Chrome, Edge, Firefox: works in the browser; installing the app is optional.
   - **iPhone/iPad:** open the site in Safari, Share > "Zum Home-Bildschirm", then open the app from
     the home screen and activate notifications there (iOS 16.4 or later). In a Safari tab the
     button is replaced by this hint.
   - The reminder plan is uploaded after each sync, so reminders only exist once a device has
     unlocked the document (passphrase entered) at least once.

## 7. Local checks

- `bun run test-php` runs the PHPUnit suite in Docker (not part of `bun run check`).
- Production-like test without all-inkl: serve the assembled folder with `php:8.5-apache`
  (`mod_rewrite`, `mod_headers`, `AllowOverride All`, `pdo_mysql`) next to a `mariadb:10.11`
  container; point `config/config.php` at it (the tables are created by the first request), then
  `api/deploy/check.sh http://localhost:8080 <commit>`. Remove the HTTPS redirect from the copy of
  `.htaccess` for plain `http://localhost`, and remove Debian's `Alias /icons/`. Service workers and
  push work on `http://localhost`.
