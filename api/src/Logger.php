<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

/**
 * Minimal logger. Callers pass short fixed messages only: never request bodies, envelopes,
 * keys, endpoints or query strings.
 */
class Logger
{
    public function __construct(private readonly ?string $file = null)
    {
    }

    public function error(string $message): void
    {
        $line = '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $message;
        if ($this->file !== null) {
            @file_put_contents($this->file, $line . "\n", FILE_APPEND | LOCK_EX);

            return;
        }
        error_log($line);
    }

    /** Log an exception without leaking data: PDO errors only as SQLSTATE codes. */
    public function exception(\Throwable $e): void
    {
        if ($e instanceof \PDOException) {
            $info = $e->errorInfo;
            $this->error(sprintf('db error sqlstate=%s code=%s at %s:%d', $info[0] ?? '?', (string) ($info[1] ?? '?'), basename($e->getFile()), $e->getLine()));

            return;
        }
        $this->error(sprintf('%s: %s at %s:%d', $e::class, mb_substr($e->getMessage(), 0, 200), basename($e->getFile()), $e->getLine()));
    }
}
