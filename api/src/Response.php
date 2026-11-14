<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

final class Response
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly string $body = '',
        public array $headers = [],
    ) {
    }

    /** @param array<string, string> $headers */
    public static function json(int $status, mixed $data, array $headers = []): self
    {
        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);

        return self::raw($status, $json, $headers);
    }

    /** Body is already valid JSON text. */
    public static function raw(int $status, string $json, array $headers = []): self
    {
        return new self($status, $json, ['Content-Type' => 'application/json; charset=utf-8'] + $headers);
    }

    public static function empty(int $status): self
    {
        return new self($status);
    }

    public function header(string $name): ?string
    {
        foreach ($this->headers as $key => $value) {
            if (strcasecmp($key, $name) === 0) {
                return $value;
            }
        }

        return null;
    }

    /** @return mixed decoded JSON body (assoc arrays), for tests and callers */
    public function data(): mixed
    {
        return $this->body === '' ? null : json_decode($this->body, true, 64, JSON_THROW_ON_ERROR);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }
        if ($this->status !== 204) {
            echo $this->body;
        }
    }
}
