# Checking Sparks API

PHP 8.4, no framework, PDO. MariaDB 10.11 in production (all-inkl Privat+), SQLite in memory in
the tests. The contract is in [../docs/architecture.md](../docs/architecture.md) ("Server API",
"Reminder plan", "PWA and push"); this file covers what is specific to the PHP code.

The server never sees health data in clear text. It stores one opaque, client-side encrypted
document, the reminder plan (title/body/path/time, needed to send pushes), and push subscriptions.

## Endpoints

JSON in and out. Every response has `Cache-Control: no-store`. Errors are `{ "error": "<code>" }`.

| Method + path                    | Auth   | Result                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                | none   | `200 { ok: true, commit }` (works without a database)                                                                                                                                                                                                                                                             |
| `GET /api/doc`                   | family | `200 { version, envelope }` + `ETag: "<version>"`; `304` with matching `If-None-Match`; `404` if no doc yet                                                                                                                                                                                                       |
| `PUT /api/doc`                   | family | body `{ envelope }`. `If-Match: "<version>"` updates, `If-None-Match: *` creates. `200 { version }` + `ETag`; `409 { version, envelope }` (+ `ETag`) on mismatch or when creating over an existing doc; `404` for `If-Match` without a doc; `428` without precondition; `422` for an empty or non-object envelope |
| `PUT /api/reminders`             | family | body `{ reminders: Reminder[] }`. In one transaction: deletes all unsent reminders, inserts the given ones, skips ids that already exist as sent/skipped. `200 { count }` (= inserted); `422` on invalid shape (`{ error: "invalid_reminder", index, field }`) or more than 2000                                  |
| `GET /api/push/vapid-public-key` | family | `200 { key }` (`503` if not configured)                                                                                                                                                                                                                                                                           |
| `POST /api/push/subscriptions`   | family | body `{ endpoint, keys: { p256dh, auth }, label? }`; upsert by endpoint; `201 { ok: true }`; `422 invalid_endpoint` unless the endpoint is an `https` URL (no credentials) of a known push service, see below                                                                                                     |
| `DELETE /api/push/subscriptions` | family | body `{ endpoint }`; `204` (also if unknown)                                                                                                                                                                                                                                                                      |
| `POST /api/push/test`            | family | sends `{ id: "test", title: "Checking Sparks", body: "Test-Benachrichtigung", path: "/" }` to all subscriptions; `200 { sent, failed, removed }`; `503 push_not_configured` if VAPID is not configured                                                                                                            |
| `GET`/`POST /api/push/run`       | cron   | sends due reminders, see below; `200 { sent, failed, removed, skipped }`; `503 push_not_configured` if VAPID is not configured                                                                                                                                                                                    |
| `POST /api/migrate`              | deploy | applies pending `migrations/*.sql`; `200 { applied: [names] }`                                                                                                                                                                                                                                                    |

Other rules:

- **Family auth:** `Authorization: Bearer <familyKey>`; the server compares `sha256(key)` with
  `family_key_sha256` using `hash_equals`. **Cron auth:** `?key=<cronKey>` or header `X-Cron-Key`.
  **Deploy auth:** header `X-Deploy-Key`. Missing/wrong: `401`. A key that is not configured (empty hash) never matches.
- **Malformed JSON:** an empty or unparseable body is `400 { "error": "invalid_json" }`.
- Request body over **2 MB** (`Content-Length` or actual size): `413`. Unknown path: `404`; known path, wrong method: `405` with `Allow`.
- **CORS:** none (same origin). Only when `dev_origin` is set, requests with exactly that `Origin`
  get CORS headers and `OPTIONS` preflights are answered (`204`).
- **Logging:** only short error lines (exception class/message, or SQLSTATE for database errors).
  Request bodies, envelopes, keys, push endpoints and query strings (the cron key!) are never logged.
- The envelope must be a non-empty JSON object (a string is `422 invalid_envelope`); it is stored as
  JSON text and returned unchanged. It is never interpreted.
- **If-Match** takes the current version (`"3"`, `W/"3"` or `3`). Any other value, including `*` and
  garbage, counts as a stale precondition: `409` with the current document (not `428`).
- **Push endpoints:** the server POSTs to the stored endpoints, so `POST`/`DELETE
/api/push/subscriptions` only accept `https` URLs without credentials whose host (case-insensitive)
  is `fcm.googleapis.com`, `android.googleapis.com`, `updates.push.services.mozilla.com`,
  `push.apple.com` or any subdomain of it (e.g. `web.push.apple.com`), or `notify.windows.com` or any
  subdomain of it. Everything else is `422 invalid_endpoint`. A new push service needs a line in
  `SubscriptionHandler::PUSH_HOSTS` / `PUSH_DOMAINS`.

### Reminder validation

Each reminder must be exactly `{ id, at, title, body, path }`, all strings:
`id` 1-200 chars; `at` ISO 8601 with offset or `Z` (stored as UTC); `title` 1-120 chars;
`body` 0-400 chars; `path` 1-300 chars, starting with a single `/`. The limits keep the push payload
well below the 4 KB Web Push limit. Duplicate ids in one request: the first one wins.
Sent/skipped reminders are kept for 30 days (so a later plan cannot re-add them), then pruned.

### What `push/run` does

1. Unsent reminders older than **3 days** (`due_at`) are marked `sent_at = now, skipped = 1` and never sent.
2. Unsent reminders with `due_at <= now` (oldest first, at most 200 and about 20 s per run) are
   sent to every subscription as JSON `{ id, title, body, path }` (`id` = reminder id, used by the
   service worker as notification tag), TTL 1 day, urgency `normal`.
3. A reminder is claimed (`sent_at` set) before sending so overlapping cron runs cannot double-send.
   If **no** subscription received it (all failed or all gone), the claim is released and it is
   retried on the next run (until it goes stale). With no subscriptions at all nothing is claimed.
4. Subscriptions answering `404`/`410` are deleted. `sent` counts successful deliveries
   (reminder x subscription), `failed` transient failures, `removed` deleted subscriptions.

## Configuration

`config.example.php` documents every key: `db` (dsn/user/password), `family_key_sha256`,
`cron_key_sha256`, `deploy_key_sha256`, `vapid` (public_key/private_key/subject), `dev_origin`,
`commit`, `log_file`. The deploy workflow generates the real `config.php` from secrets and uploads
it outside the document root. Lookup order: `$CHECK_CONFIG`, `api/config.php` (git-ignored, local
development), `../config/config.php` next to the api folder (deployed).

### Generate keys

```sh
# random secrets (keep them in GitHub secrets / a password manager)
openssl rand -base64 36        # family key, cron key, deploy key: one each

# the sha256 hex digests go into config.php
php bin/hash-key.php '<secret>'                  # or: printf '%s' "$SECRET" | php bin/hash-key.php -

# VAPID key pair, once; do not regenerate later (subscriptions are bound to the public key)
php bin/generate-vapid.php
```

Without local PHP, run them in Docker (image from `Dockerfile.test`, see below):

```sh
docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test php bin/hash-key.php '<secret>'
docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test php bin/generate-vapid.php
```

## Deployed folder layout (all-inkl)

One FTP user, one folder; only `public/` is the document root of `check.ingsparks.de`.
`vendor/` lives inside `api/` (the same relative layout as in the repository).

```
check/                         FTP root of the dedicated FTP user
  config/config.php            generated on deploy: DB, key hashes, VAPID, commit (not public)
  api/
    src/                       PHP code
    migrations/                SQL files
    vendor/                    composer install --no-dev --optimize-autoloader
  logs/                        optional log_file target (not public)
  public/                      document root (KAS subdomain target: check/public/)
    .htaccess                  from api/deploy/htaccess
    index.html, assets/, sw.js, manifest.webmanifest, pwa-icons/   the Vite build (dist/)
    api/index.php              copy of api/public/index.php
```

Deploy steps (for the workflow): `composer install --no-dev --optimize-autoloader` in `api/`;
copy `api/public/index.php` to `dist/api/index.php` and `api/deploy/htaccess` to `dist/.htaccess`;
upload `dist/` to `public/`, and `api/src`, `api/migrations`, `api/vendor` to `api/`; write
`config/config.php`; `POST /api/migrate` with `X-Deploy-Key`; check `GET /api/health` shows the commit.

`public/api/index.php` finds the code in `../../api`; in the repository `api/public/index.php`
finds it in `..`. PHP on all-inkl may read files outside the document root of the same account.

### `.htaccess` (`deploy/htaccess`)

Apache 2.4. HTTPS only; passes the `Authorization` header to PHP (FastCGI would drop it);
`/api/*` to `api/index.php`; existing files served as is; missing `/assets/*` is a real 404;
everything else falls back to `index.html` (SPA); `/`, `index.html`, `sw.js` and
`manifest.webmanifest` are `no-cache`, `/assets/*` is `immutable` for one year; dotfiles are denied
(except `/.well-known/`); no directory listing; security headers, including a strict
`Content-Security-Policy` (everything `'self'`, no inline script or style, no framing; keep it in sync
with `preview.headers` in `vite.config.ts`). `mod_headers` and `mod_deflate` are optional for the
site to work, but `deploy/check.sh` fails without the CSP header. The first deploy check should request `/`, an asset, `/assets/missing.js` (404),
`/some/path` (200 HTML), `/api/health` and `/api/doc` without key (401).

## Cron job (KAS)

KAS > Tools > Cronjobs > add: URL `https://check.ingsparks.de/api/push/run?key=<cronKey>`,
every 15 minutes (hourly also works: reminders are sent at the first run after their time, so the
delay is at most the interval). KAS cronjobs can only call a URL, so the key travels in the query
string; the access log of the web server will contain it. That is acceptable because the cron key
can only trigger sending of already due reminders (it cannot read or change anything), and it is
rotated by changing the secret and redeploying. Do not reuse the family key for it.

## Local development

```sh
cp api/config.example.php api/config.php     # set dsn to 'sqlite:/abs/path/dev.sqlite', fill hashes, dev_origin
php -S localhost:8787 api/public/index.php   # router script: every request goes to the entry
curl -X POST -H 'X-Deploy-Key: <deployKey>' localhost:8787/api/migrate
```

Point the Vite dev server's `/api` proxy at `http://localhost:8787`, or set `dev_origin` to the
Vite origin (for example `http://localhost:5180`) and call the API cross-origin.

## Tests

PHPUnit 12 against SQLite in memory; the push sender sits behind the `PushSender` interface and
tests use a fake. PHP is not needed locally; run from the repository root:

```sh
docker build -t checking-sparks-api-test -f api/Dockerfile.test api
docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test composer install
docker run --rm -v "$PWD/api":/app -w /app checking-sparks-api-test vendor/bin/phpunit
```

Optional: the same tests against MariaDB 10.11 (checks that the SQL is portable):

```sh
docker network create cs-test
docker run -d --rm --name cs-mariadb --network cs-test -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=check mariadb:10.11
docker run --rm --network cs-test -v "$PWD/api":/app -w /app \
  -e TEST_DB_DSN='mysql:host=cs-mariadb;dbname=check;charset=utf8mb4' -e TEST_DB_USER=root -e TEST_DB_PASSWORD=root \
  checking-sparks-api-test vendor/bin/phpunit
docker rm -f cs-mariadb && docker network rm cs-test
```

From the repository root, `bun run test-php` does all of this (build the image, `composer install`, PHPUnit).
In CI use `shivammathur/setup-php@v2` (PHP 8.4, extensions `pdo_sqlite, mbstring, curl, openssl`), then `composer install` and `vendor/bin/phpunit` in `api/`.

## Notes

- `ext-gmp` or `ext-bcmath` make the Web Push encryption much faster; without them the library works
  but is slow and logs a notice per request. Check the available PHP extensions in KAS.
- Sending happens in the cron request itself (about 100-300 ms per subscription and reminder);
  a run stops after about 20 s and the next run continues.
- Migrations are plain SQL files (`NNN_name.sql`), idempotent (`IF NOT EXISTS`), no semicolons
  inside string literals, portable between MariaDB and SQLite. Never edit an applied file; add a new one.
