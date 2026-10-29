<?php

declare(strict_types=1);

// Usage: php bin/hash-key.php '<secret>'
// Prints the sha256 hex digest to put into config.php (family_key_sha256, cron_key_sha256, deploy_key_sha256).
// Prefer reading the secret from stdin so it stays out of the shell history:
//   printf '%s' "$SECRET" | php bin/hash-key.php -

if ($argc !== 2 || $argv[1] === '') {
    fwrite(STDERR, "Usage: php bin/hash-key.php '<secret>'   (or '-' to read the secret from stdin)\n");
    exit(1);
}

$secret = $argv[1] === '-' ? rtrim((string) stream_get_contents(STDIN), "\r\n") : $argv[1];
if ($secret === '') {
    fwrite(STDERR, "Empty secret.\n");
    exit(1);
}

echo hash('sha256', $secret), "\n";
