<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Push;

use CheckingSparks\Api\Logger;
use Psr\Log\AbstractLogger;

/** Routes the web-push library's own notices (e.g. "install GMP or BCMath") into our log. */
final class PsrLogAdapter extends AbstractLogger
{
    public function __construct(private readonly Logger $logger)
    {
    }

    public function log($level, string|\Stringable $message, array $context = []): void
    {
        $this->logger->error('web-push ' . (string) $level . ': ' . mb_substr((string) $message, 0, 200));
    }
}
