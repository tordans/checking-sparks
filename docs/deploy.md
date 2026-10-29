# Deployment (all-inkl, `check.ingsparks.de`)

The app (static Vite build) and the PHP API are served from one all-inkl webspace. One GitHub
Actions workflow ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) tests, builds,
uploads via FTPS, migrates the database and checks that the new commit is live. The design follows
`vacation-planner/docs/central-storage-plan.md`, adapted to this app's layout
([api/README.md](../api/README.md), "Deployed folder layout").

```
GitHub (push to main / "Run workflow")
  bun run check-ci -> PHPUnit -> bun run build -> assemble folder -> FTPS upload
  -> POST /api/migrate (X-Deploy-Key) -> api/deploy/check.sh (routing, 401s, commit from /api/health)

all-inkl webspace
  check/                        FTP root of the dedicated FTP user
    config/config.php           generated from secrets on every deploy (not public)
    api/{src,migrations,vendor} PHP code (not public)
    logs/                       api.log (not public, .htaccess denies all)
    public/                     document root of check.ingsparks.de
      .htaccess  index.html  assets/  sw.js  manifest.webmanifest  pwa-icons/  api/index.php
  cron (KAS)                    every 15 min: GET /api/push/run?key=<cronKey>
```

The server never sees health data in clear text: the family document is encrypted in the browser
with the family passphrase (see [architecture.md](architecture.md)). Secrets never live in the
repository; `config.php` is generated in the workflow and exists only on the server.

## 1. One-time setup in KAS (all-inkl)

Do these once, in this order.

1. **Subdomain.** KAS > Domain > Subdomain > add `check` under `ingsparks.de`. Target directory:
   `check/public` (the folder is created by the first upload; if KAS insists on an existing folder,
   create `check/public` via FTP first). Check that the DNS record resolves.
2. **TLS.** KAS > Domain > the subdomain > SSL: enable Let's Encrypt for `check.ingsparks.de`.
   Wait until `https://check.ingsparks.de/` answers (a 403/404 page is fine before the first deploy).
   The `.htaccess` redirects HTTP to HTTPS and sends HSTS, so TLS must work before the first deploy.
3. **PHP.** KAS > Tools > PHP version (or the subdomain's PHP setting): **PHP 8.4** for the
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
   every 15 minutes. Reminders go out at the first run after their time, so the delay is at most
   the interval. The key travels in the query string and shows up in the web server access log;
   that is acceptable because it can only trigger sending of already due reminders. Never reuse the
   family key for it.

## 2. Generate keys and secrets

Run from the repository root. Docker is used so that PHP is not needed locally (the image is built
once with `bun run test-php`, or with `docker build -t checking-sparks-api-test -f api/Dockerfile.test api`).
`composer install` must have run in `api/` once (also done by `bun run test-php`) for the VAPID script.

```sh
# three random secrets: family key, cron key, deploy key (keep them in a password manager)
openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n'   # run three times; URL-safe on purpose

# sha256 hex digest of the family key and of the cron key (the server only stores digests)
printf '%s' '<familyKey>' | shasum -a 256 | cut -d' ' -f1
printf '%s' '<cronKey>'   | shasum -a 256 | cut -d' ' -f1
# equivalent with the PHP script:
printf '%s' '<familyKey>' | docker run --rm -i -v "$PWD/api":/app -w /app checking-sparks-api-test php bin/hash-key.php -

# VAPID key pair: ONCE. Do not regenerate later: every subscription is bound to the public key.
docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test php bin/generate-vapid.php
```

Why URL-safe: the family key travels in the pairing link (`/verbinden#key=...`) and the cron key in
a query string. Do not add a trailing newline when storing a secret in GitHub.

## 3. GitHub: environment and secrets

Repository > Settings > Environments > **production** (optionally require a reviewer), then add
these **environment secrets** (the workflow uses `environment: production`):

| Secret              | Value                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `FTP_SERVER`        | FTP host from KAS                                                                  |
| `FTP_USERNAME`      | the dedicated FTP user (restricted to `check/`)                                    |
| `FTP_PASSWORD`      | its password                                                                       |
| `DB_HOST`           | database host from KAS (usually `localhost`)                                       |
| `DB_NAME`           | database name                                                                      |
| `DB_USER`           | database user                                                                      |
| `DB_PASSWORD`       | database password                                                                  |
| `FAMILY_KEY_SHA256` | sha256 hex of the family key (the key itself stays in your password manager)       |
| `CRON_KEY_SHA256`   | sha256 hex of the cron key (the key itself is only in the KAS cron job)            |
| `DEPLOY_KEY`        | the deploy key itself (the workflow sends it to `/api/migrate`; only its hash is stored on the server) |
| `VAPID_PUBLIC_KEY`  | from `generate-vapid.php`                                                          |
| `VAPID_PRIVATE_KEY` | from `generate-vapid.php`                                                          |
| `VAPID_SUBJECT`     | `mailto:you@example.com` (a contact address for push services)                     |

The workflow fails before uploading if a secret is missing or a digest is not 64 hex characters.
The site URL (`SITE_URL`) is set at the top of `deploy.yml`.

**Rotating a key:** generate a new value, update the secret (and the KAS cron job / your password
manager), run the workflow again ("Run workflow"). The old key stops working after the deploy.
Rotating the family key means every device needs the new pairing link; the VAPID keys must not be
rotated (all devices would have to subscribe again).

## 4. What the workflow does

1. `bun install --frozen-lockfile`, `bun run check-ci` (types, lint, format, unit tests).
2. PHP 8.4 (`shivammathur/setup-php`): `composer install` with dev dependencies, `php -l` on all
   files, PHPUnit; then `composer install --no-dev --optimize-autoloader` for the upload.
3. `bun run build` (Vite, `dist/`).
4. Assemble `deploy-out/` exactly like the layout above (`dist/` + `api/deploy/htaccess` as
   `.htaccess` + `api/public/index.php` as `public/api/index.php`; `api/{src,migrations,vendor}`;
   `config/config.php` generated from secrets, with the commit; `logs/.htaccess`). `index.html` is
   held back in `deploy-index/`.
5. **Upload pass 1** (`SamKirkland/FTP-Deploy-Action`, pinned to the commit of v4.4.0, `protocol:
   ftps`, port 21, `security: strict`, incremental sync, never a clean slate): everything except
   `index.html`, so hashed assets and the new API code are in place first.
6. **Upload pass 2**: only `index.html` (own sync state file), which switches visitors to the new
   build. The sync state files sit in the FTP root (`check/`), outside the document root.
7. `POST /api/migrate` with `X-Deploy-Key`.
8. `api/deploy/check.sh https://check.ingsparks.de <commit>`: `/` is HTML and `no-cache`, an asset is
   200 and `immutable`, a missing `/assets/...` is a real 404, `/einstellungen` and a deep link
   fall back to the app, `sw.js` is JavaScript, manifest and icons exist, `/api/health` shows the
   commit just deployed, `/api/doc`, `/api/push/run` and the VAPID endpoint answer 401 without key,
   dotfiles are not served. A failed check fails the run; the output is also in the run summary.
   Missing `mod_headers` only produces warnings. You can run the script by hand against the live site.

Deploys on pushes to `main` never run in parallel (`concurrency`) and are never cancelled half way.
An interrupted upload leaves a half-updated state that the health check makes visible; re-running
the workflow fixes it.

`security: strict` makes the FTPS client verify the server certificate. If all-inkl presents a
certificate for a different host name than `FTP_SERVER`, use the host name from the certificate or,
as a last resort, change it to `loose` in both upload steps.

## 5. First deploy checklist

- [ ] KAS: subdomain `check.ingsparks.de` -> `check/public`, Let's Encrypt active, PHP 8.4, database
      created, FTP user restricted to `check/`.
- [ ] Keys generated; all 13 secrets set in the `production` environment.
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
- Production-like test without all-inkl: serve the assembled folder with `php:8.4-apache`
  (`mod_rewrite`, `mod_headers`, `AllowOverride All`, `pdo_mysql`) next to a `mariadb:10.11`
  container; point `config/config.php` at it, `POST /api/migrate`, then
  `api/deploy/check.sh http://localhost:8080 <commit>`. Remove the HTTPS redirect from the copy of
  `.htaccess` for plain `http://localhost`, and remove Debian's `Alias /icons/`. Service workers and
  push work on `http://localhost`.
- The Chromium builds driven by automation use the *pre-production* FCM endpoint
  (`fcm.googleapis.com/preprod/...`); the server's `POST /api/push/test` reached it
  (`sent: 1`) and the service worker showed the notification.
