# Checking Sparks API

PHP 8.5, no framework, PDO. MariaDB 10.11 in production (all-inkl Privat+), SQLite in memory in
the tests. This file is the reference for the HTTP endpoints; the rest of the contract is in
[../docs/architecture.md](../docs/architecture.md) ("Reminder plan", "PWA and push").

The server never sees health data in clear text. It stores one opaque, client-side encrypted
document, the reminder plan (title/body/path/time, needed to send pushes), and push subscriptions.

## Endpoints

JSON in and out. Every response has `Cache-Control: no-store`. Errors are `{ "error": "<code>" }`.

| Method + path                    | Auth   | Result                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                | none   | `200 { ok: true, commit }` (works without a database)                                                                                                                                                                                                                                                                                    |
| `GET /api/doc`                   | family | `200 { version, envelope }`; `404` if no doc yet                                                                                                                                                                                                                                                                                         |
| `PUT /api/doc`                   | family | body `{ envelope }`. `If-Match: "<version>"` updates, `If-None-Match: *` creates. `200 { version }`; `409 { version, envelope }` on a stale `If-Match` or when creating over an existing doc; `404` for `If-Match` without a doc; `428` without precondition; `422 invalid_envelope` unless the envelope is a non-empty object           |
| `PUT /api/reminders`             | family | body `{ reminders: Reminder[] }`. In one transaction: deletes all unsent reminders, inserts the given ones, skips ids that already exist as sent/skipped. `200 { count }` (= inserted); `422 invalid_body` for the wrong shape, `422 invalid_reminder` (with `index`, `field`) for an invalid entry, `422 too_many_reminders` above 2000 |
| `GET /api/push/vapid-public-key` | family | `200 { key }`; `503 push_not_configured` without VAPID keys                                                                                                                                                                                                                                                                              |
| `POST /api/push/subscriptions`   | family | body `{ endpoint, keys: { p256dh, auth } }`; upsert by endpoint; `201 { ok: true }`; `422 invalid_endpoint` unless the endpoint is an `https` URL (no credentials) of a known push service, see below. A `label` sent by older clients is ignored                                                                                        |
| `DELETE /api/push/subscriptions` | family | body `{ endpoint }`; `204` (also if unknown)                                                                                                                                                                                                                                                                                             |
| `POST /api/push/test`            | family | sends `{ id: "test", title: "Checking Sparks", body: "Test-Benachrichtigung", path: "/" }` to all subscriptions; `200 { sent, failed, removed }`; `503 push_not_configured` without VAPID keys                                                                                                                                           |
| `GET`/`POST /api/push/run`       | cron   | sends due reminders, see below; `200 { sent, failed, removed, skipped }`; `503 push_not_configured` without VAPID keys                                                                                                                                                                                                                   |

The database schema is created and updated by the API itself, see "Migrations" below.

Other rules:

- **Family auth:** `Authorization: Bearer <familyKey>`; the server compares `sha256(key)` with
  `family_key_sha256` using `hash_equals`. **Cron auth:** `?key=<cronKey>` or header `X-Cron-Key`
  (same check against `cron_key_sha256`). Missing/wrong: `401`. A key that is not configured (empty
  hash) never matches.
- **Malformed JSON:** an empty or unparseable body is `400 { "error": "invalid_json" }`.
- Request body over **2 MB** (`Content-Length` or actual size): `413`. Unknown path: `404`; known path, wrong method: `405` with `Allow`.
- **No CORS:** the app and the API share one origin. Local development uses the Vite proxy.
- **Logging:** only short error lines (exception class/message, or SQLSTATE for database errors).
  Request bodies, envelopes, keys, push endpoints and query strings (the cron key!) are never logged.
- The envelope must be a non-empty JSON object (a string is `422 invalid_envelope`); it is stored as
  JSON text and returned unchanged. It is never interpreted.
- **If-Match** takes the current version in quotes, as the client sends it (`"3"`). Any other value,
  including `*`, `3` and garbage, counts as a stale precondition: `409` with the current document (not `428`).
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
2. Unsent reminders with `due_at <= now` (oldest first, at most 50 per run; the next run continues) are
   sent to every subscription as JSON `{ id, title, body, path }` (`id` = reminder id, used by the
   service worker as notification tag), TTL 1 day, urgency `normal`.
3. A reminder is claimed (`sent_at` set) before sending so overlapping cron runs cannot double-send.
   If **no** subscription received it (all failed or all gone), the claim is released and it is
   retried on the next run (until it goes stale). With no subscriptions at all nothing is claimed.
4. Subscriptions answering `404`/`410` are deleted. `sent` counts successful deliveries
   (reminder x subscription), `failed` transient failures, `removed` deleted subscriptions.

## Configuration

`config.example.php` documents every key: `db` (dsn/user/password), `family_key_sha256`,
`cron_key_sha256`, `vapid` (public_key/private_key/subject), `commit`, `log_file`. The deploy
workflow generates the real `config.php` from secrets and uploads it outside the document root.
Lookup order: `$CHECK_CONFIG`, `api/config.php` (git-ignored, local development), then
`../config/config.php` next to the api folder (deployed).

Keys, digests and the VAPID key pair: [../docs/deploy.md](../docs/deploy.md), section 2
(`scripts/setup-deploy-secrets.sh` does it all). Folder layout, `.htaccess`, deploy workflow and
cron job are described there too.

## Migrations

`migrations/NNN_name.sql` are applied by the API itself: before the first database access of a
request (never for `/api/health`) it creates the `migrations` table if needed, reads the applied
names and runs the missing files in name order. When nothing is pending that costs two cheap
queries. Files are plain SQL, idempotent (`IF NOT EXISTS`, because MariaDB DDL is not
transactional and concurrent requests may run the same file), no semicolons inside string
literals, portable between MariaDB and SQLite. Never edit an applied file; add a new one.

## Local development

```sh
cp api/config.example.php api/config.php     # set dsn to 'sqlite:/abs/path/dev.sqlite', fill hashes
php -S localhost:8787 api/public/index.php   # router script: every request goes to the entry
```

The Vite dev server proxies `/api` to `http://localhost:8787` (`vite.config.ts`), so the app and
the API share one origin. The tables are created by the first request that needs the database.

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
CI (`.github/workflows/ci.yml`, also run by the deploy workflow) uses `shivammathur/setup-php@v2`
(PHP 8.5, extensions `pdo_sqlite, mbstring, curl, openssl, gmp`), then `composer install` and
`vendor/bin/phpunit` in `api/`.

## Notes

- `ext-gmp` or `ext-bcmath` make the Web Push encryption much faster; without them the library works
  but is slow. Check the available PHP extensions in KAS.
- Sending happens in the cron request itself (about 100-300 ms per subscription and reminder), which
  is why a run sends at most 50 reminders.
