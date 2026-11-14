<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests\Support;

use CheckingSparks\Api\Push\PushResult;
use CheckingSparks\Api\Push\PushSender;

final class FakeSender implements PushSender
{
    /** @var list<array{endpoint: string, payload: array<string, string>, ttl: int, urgency: string}> */
    public array $sent = [];

    /** @var array<string, PushResult> result per endpoint; default is success */
    public array $results = [];

    public function send(array $subscription, string $payload, int $ttlSeconds, string $urgency): PushResult
    {
        $this->sent[] = [
            'endpoint' => $subscription['endpoint'],
            'payload' => json_decode($payload, true, 8, JSON_THROW_ON_ERROR),
            'ttl' => $ttlSeconds,
            'urgency' => $urgency,
        ];

        return $this->results[$subscription['endpoint']] ?? new PushResult(true, false, 201);
    }
}
