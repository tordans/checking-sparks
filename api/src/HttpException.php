<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

/** Thrown by handlers to end the request with a JSON error response. */
final class HttpException extends \RuntimeException
{
    /**
     * @param array<string, mixed> $extra additional JSON fields next to "error"
     * @param array<string, string> $headers
     */
    public function __construct(
        public readonly int $status,
        public readonly string $error,
        public readonly array $extra = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($error);
    }
}
