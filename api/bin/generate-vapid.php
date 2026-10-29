<?php

declare(strict_types=1);

// Usage: php bin/generate-vapid.php
// Prints a new VAPID key pair. Create it once, keep the private key secret and do not
// regenerate it later: existing push subscriptions are bound to the public key.

require __DIR__ . '/../vendor/autoload.php';

$keys = Minishlink\WebPush\VAPID::createVapidKeys();

echo "public_key:  {$keys['publicKey']}\n";
echo "private_key: {$keys['privateKey']}\n";
