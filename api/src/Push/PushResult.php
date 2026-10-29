<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Push;

final class PushResult
{
    public function __construct(
        public readonly bool $ok,
        /** The push service said the subscription is gone (HTTP 404 or 410). */
        public readonly bool $gone = false,
        public readonly ?int $status = null,
    ) {
    }
}
