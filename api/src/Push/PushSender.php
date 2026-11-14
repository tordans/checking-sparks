<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Push;

/** Sends one Web Push message. Abstracted so tests can use a fake. */
interface PushSender
{
    /**
     * @param array{endpoint: string, p256dh: string, auth: string} $subscription
     * @param string $payload JSON text (id, title, body, path)
     */
    public function send(array $subscription, string $payload, int $ttlSeconds, string $urgency): PushResult;
}
