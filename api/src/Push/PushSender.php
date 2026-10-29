<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Push;

/** Sends one Web Push message. Abstracted so tests can use a fake. */
interface PushSender
{
    /** false when VAPID keys are missing; the API then answers 503. */
    public function isConfigured(): bool;

    /**
     * @param array{endpoint: string, p256dh: string, auth: string} $subscription
     * @param string $payload JSON text (title, body, path)
     */
    public function send(array $subscription, string $payload, int $ttlSeconds, string $urgency): PushResult;
}
