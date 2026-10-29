<?php

declare(strict_types=1);

/**
 * Example config. On deploy, the GitHub Actions workflow generates the real file from secrets
 * and uploads it OUTSIDE the document root:
 *
 *   check/config/config.php      <- here (deployed)
 *   check/public/api/index.php   <- the web entry, finds ../../config/config.php via ../../api
 *
 * For local development copy this file to api/config.php (git-ignored) or point the
 * CHECK_CONFIG environment variable at it.
 *
 * Hash a secret with:  php bin/hash-key.php '<secret>'   (sha256 hex)
 * VAPID key pair with: php bin/generate-vapid.php
 */
return [
    'db' => [
        // MariaDB on all-inkl (host name and credentials come from KAS):
        'dsn' => 'mysql:host=localhost;dbname=CHANGE_ME;charset=utf8mb4',
        'user' => 'CHANGE_ME',
        'password' => 'CHANGE_ME',
        // Local development without MariaDB: 'dsn' => 'sqlite:/absolute/path/dev.sqlite', user/password ''.
    ],

    // sha256 (hex) of the family key. The key itself is in the pairing link: /verbinden#key=<familyKey>.
    // It authorises every endpoint except /api/health, /api/push/run and /api/migrate.
    'family_key_sha256' => '',

    // sha256 (hex) of the cron key. Only allows /api/push/run (?key=... or X-Cron-Key header).
    'cron_key_sha256' => '',

    // sha256 (hex) of the deploy key. Only allows POST /api/migrate (X-Deploy-Key header).
    'deploy_key_sha256' => '',

    'vapid' => [
        'public_key' => '',   // from bin/generate-vapid.php; also served to the app
        'private_key' => '',  // keep secret
        'subject' => 'mailto:you@example.com',
    ],

    // Optional: origin of the local dev server that may call the API cross-origin, e.g. 'http://localhost:5180'.
    // Leave '' in production (same origin, no CORS headers at all).
    'dev_origin' => '',

    // Git commit of the deployed build, shown by GET /api/health.
    'commit' => 'dev',

    // Optional: absolute path of a log file (outside the document root). Empty = PHP error_log.
    // Only short error lines are logged, never request bodies, keys or query strings.
    'log_file' => '',
];
