<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

final class Request
{
    public const MAX_BODY_BYTES = 2 * 1024 * 1024;

    /** @var array<string, string> lower-case header name => value */
    public readonly array $headers;

    /**
     * @param array<string, string> $headers
     * @param array<string, string> $query
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        array $headers = [],
        public readonly array $query = [],
        public readonly string $body = '',
        /** Content-Length announced by the client, if any (checked before the body is read). */
        public readonly ?int $declaredLength = null,
        /** true when the body was cut off at the limit while reading. */
        public readonly bool $bodyTruncated = false,
    ) {
        $lower = [];
        foreach ($headers as $name => $value) {
            $lower[strtolower((string) $name)] = (string) $value;
        }
        $this->headers = $lower;
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    public function tooLarge(): bool
    {
        return $this->bodyTruncated
            || strlen($this->body) > self::MAX_BODY_BYTES
            || ($this->declaredLength !== null && $this->declaredLength > self::MAX_BODY_BYTES);
    }

    /** Bearer token from the Authorization header, or null. */
    public function bearerToken(): ?string
    {
        $value = $this->header('authorization');
        if ($value !== null && preg_match('/^Bearer\s+(\S+)$/i', trim($value), $m) === 1) {
            return $m[1];
        }

        return null;
    }

    /**
     * Decode the JSON body. Throws 400 on empty or malformed JSON.
     * With $assoc = false objects become stdClass (keeps {} distinct from []).
     */
    public function json(bool $assoc = true): mixed
    {
        if (trim($this->body) === '') {
            throw new HttpException(400, 'invalid_json');
        }
        try {
            return json_decode($this->body, $assoc, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpException(400, 'invalid_json');
        }
    }

    /** Build a request from PHP globals. Reads at most MAX_BODY_BYTES + 1 bytes of the body. */
    public static function fromGlobals(): self
    {
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $path = parse_url($uri, PHP_URL_PATH);
        $path = is_string($path) ? rawurldecode($path) : '/';

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (!is_string($value)) {
                continue;
            }
            if (str_starts_with($key, 'HTTP_')) {
                $headers[str_replace('_', '-', substr($key, 5))] = $value;
            } elseif ($key === 'CONTENT_TYPE' || $key === 'CONTENT_LENGTH') {
                $headers[str_replace('_', '-', $key)] = $value;
            }
        }
        // FastCGI: the .htaccess rewrite rule hands the header over as (REDIRECT_)HTTP_AUTHORIZATION.
        if (!isset($headers['AUTHORIZATION']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) && is_string($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['AUTHORIZATION'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }

        $query = [];
        foreach ($_GET as $key => $value) {
            if (is_string($value)) {
                $query[(string) $key] = $value;
            }
        }

        $declared = isset($_SERVER['CONTENT_LENGTH']) && ctype_digit((string) $_SERVER['CONTENT_LENGTH'])
            ? (int) $_SERVER['CONTENT_LENGTH']
            : null;

        $body = '';
        $truncated = false;
        if ($declared === null || $declared <= self::MAX_BODY_BYTES) {
            $body = (string) file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES + 1);
            $truncated = strlen($body) > self::MAX_BODY_BYTES;
        }

        return new self($method, $path, $headers, $query, $body, $declared, $truncated);
    }
}
