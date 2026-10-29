<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Handler;

use Closure;
use CheckingSparks\Api\Db;
use CheckingSparks\Api\HttpException;
use CheckingSparks\Api\Request;
use CheckingSparks\Api\Response;

final class SubscriptionHandler
{
    public const MAX_ENDPOINT = 500;
    public const MAX_LABEL = 100;

    /** @param Closure(): \DateTimeImmutable $clock */
    public function __construct(private readonly Db $db, private readonly Closure $clock)
    {
    }

    public function upsert(Request $request): Response
    {
        $body = $request->json(true);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpException(422, 'invalid_body');
        }
        $endpoint = self::endpoint($body['endpoint'] ?? null);
        $keys = $body['keys'] ?? null;
        if (!is_array($keys)) {
            throw new HttpException(422, 'invalid_keys');
        }
        $p256dh = self::key($keys['p256dh'] ?? null);
        $auth = self::key($keys['auth'] ?? null);
        $label = $body['label'] ?? '';
        if (!is_string($label) || mb_strlen($label) > self::MAX_LABEL || !mb_check_encoding($label, 'UTF-8')) {
            throw new HttpException(422, 'invalid_label');
        }

        $now = Db::format(($this->clock)());
        $this->db->transaction(function () use ($endpoint, $p256dh, $auth, $label, $now): void {
            // created_at and last_success_at survive a re-subscribe of the same endpoint.
            $exists = $this->db->one('SELECT 1 AS present FROM subscriptions WHERE endpoint = ?', [$endpoint]) !== null;
            if ($exists) {
                $this->db->run('UPDATE subscriptions SET p256dh = ?, auth = ?, label = ? WHERE endpoint = ?', [$p256dh, $auth, $label, $endpoint]);
            } else {
                $this->db->run(
                    'INSERT INTO subscriptions (endpoint, p256dh, auth, label, created_at, last_success_at) VALUES (?, ?, ?, ?, ?, NULL)',
                    [$endpoint, $p256dh, $auth, $label, $now],
                );
            }
        });

        return Response::json(201, ['ok' => true]);
    }

    public function delete(Request $request): Response
    {
        $body = $request->json(true);
        if (!is_array($body) || array_is_list($body)) {
            throw new HttpException(422, 'invalid_body');
        }
        $endpoint = self::endpoint($body['endpoint'] ?? null);
        $this->db->run('DELETE FROM subscriptions WHERE endpoint = ?', [$endpoint]);

        return Response::empty(204);
    }

    /** Only https URLs with a real host name (no IP literals, no localhost): the server will POST to it. */
    private static function endpoint(mixed $value): string
    {
        if (!is_string($value) || $value === '' || strlen($value) > self::MAX_ENDPOINT) {
            throw new HttpException(422, 'invalid_endpoint');
        }
        $parts = parse_url($value);
        $host = is_array($parts) ? ($parts['host'] ?? '') : '';
        $ok = is_array($parts)
            && ($parts['scheme'] ?? '') === 'https'
            && $host !== ''
            && str_contains($host, '.')
            && !filter_var(trim($host, '[]'), FILTER_VALIDATE_IP)
            && !isset($parts['user'])
            && !isset($parts['pass'])
            && preg_match('/^[\x21-\x7E]+$/', $value) === 1;
        if (!$ok) {
            throw new HttpException(422, 'invalid_endpoint');
        }

        return $value;
    }

    /** base64url (padding tolerated), as delivered by PushSubscription.toJSON(). */
    private static function key(mixed $value): string
    {
        if (!is_string($value) || $value === '' || strlen($value) > 255 || preg_match('/^[A-Za-z0-9_-]+={0,2}$/', $value) !== 1) {
            throw new HttpException(422, 'invalid_keys');
        }

        return $value;
    }
}
