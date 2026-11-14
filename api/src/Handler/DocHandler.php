<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Handler;

use Closure;
use CheckingSparks\Api\Db;
use CheckingSparks\Api\HttpException;
use CheckingSparks\Api\Request;
use CheckingSparks\Api\Response;

/**
 * The single encrypted family document, versioned for optimistic concurrency.
 * The envelope is a JSON object that is opaque to the server, stored as JSON text.
 */
final class DocHandler
{
    /** @param Closure(): \DateTimeImmutable $clock */
    public function __construct(private readonly Db $db, private readonly Closure $clock)
    {
    }

    public function get(): Response
    {
        $row = $this->current();
        if ($row === null) {
            throw new HttpException(404, 'not_found');
        }

        return self::docResponse(200, $row);
    }

    public function put(Request $request): Response
    {
        $envelopeJson = $this->parseEnvelope($request);
        $ifMatch = $request->header('if-match');
        $ifNoneMatch = $request->header('if-none-match');
        $now = Db::format(($this->clock)());

        if ($ifMatch !== null) {
            $row = $this->current();
            if ($row === null) {
                throw new HttpException(404, 'not_found');
            }
            $expected = self::parseVersion($ifMatch);
            // Anything but the current version (including "*" and garbage) is a conflict.
            if ($expected !== $row['version']) {
                return self::conflict($row);
            }
            $changed = $this->db->run(
                'UPDATE doc SET version = version + 1, envelope = ?, updated_at = ? WHERE id = 1 AND version = ?',
                [$envelopeJson, $now, $row['version']],
            );
            if ($changed === 0) {
                // Somebody else wrote between our read and the update.
                return self::conflict($this->current() ?? $row);
            }

            return Response::json(200, ['version' => $row['version'] + 1]);
        }

        if ($ifNoneMatch !== null && trim($ifNoneMatch) === '*') {
            $existing = $this->current();
            if ($existing !== null) {
                return self::conflict($existing);
            }
            try {
                $this->db->run(
                    'INSERT INTO doc (id, version, envelope, updated_at) VALUES (1, 1, ?, ?)',
                    [$envelopeJson, $now],
                );
            } catch (\PDOException $e) {
                if (Db::isUniqueViolation($e) && ($existing = $this->current()) !== null) {
                    return self::conflict($existing);
                }
                throw $e;
            }

            return Response::json(200, ['version' => 1]);
        }

        throw new HttpException(428, 'precondition_required');
    }

    /** @return array{version: int, envelope: string}|null envelope = stored JSON text */
    private function current(): ?array
    {
        $row = $this->db->one('SELECT version, envelope FROM doc WHERE id = 1');

        return $row === null ? null : ['version' => (int) $row['version'], 'envelope' => (string) $row['envelope']];
    }

    private function parseEnvelope(Request $request): string
    {
        $body = $request->json(false);
        if (!$body instanceof \stdClass || !property_exists($body, 'envelope')) {
            throw new HttpException(422, 'invalid_envelope');
        }
        $envelope = $body->envelope;
        if (!$envelope instanceof \stdClass || (array) $envelope === []) {
            throw new HttpException(422, 'invalid_envelope');
        }

        return json_encode($envelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /** Only the form the client sends: the version in quotes, e.g. "3". Anything else is null. */
    private static function parseVersion(string $header): ?int
    {
        return preg_match('/^"(\d{1,18})"\z/', $header, $m) === 1 ? (int) $m[1] : null;
    }

    /** @param array{version: int, envelope: string} $row */
    private static function docResponse(int $status, array $row): Response
    {
        return Response::raw($status, '{"version":' . $row['version'] . ',"envelope":' . $row['envelope'] . '}');
    }

    /** @param array{version: int, envelope: string} $row */
    private static function conflict(array $row): Response
    {
        return self::docResponse(409, $row);
    }
}
