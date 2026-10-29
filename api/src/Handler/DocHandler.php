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
 * The envelope is opaque to the server: a JSON string or object, stored as JSON text.
 */
final class DocHandler
{
    /** @param Closure(): \DateTimeImmutable $clock */
    public function __construct(private readonly Db $db, private readonly Closure $clock)
    {
    }

    public function get(Request $request): Response
    {
        $row = $this->current();
        if ($row === null) {
            throw new HttpException(404, 'not_found');
        }
        $etag = self::etag($row['version']);
        if (self::etagMatches($request->header('if-none-match'), $etag)) {
            return Response::empty(304, ['ETag' => $etag]);
        }

        return self::docResponse(200, $row, $etag);
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
            if ($expected !== null && $expected !== $row['version']) {
                return self::conflict($row);
            }
            if ($expected === null && trim($ifMatch) !== '*') {
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

            return self::versionResponse($row['version'] + 1);
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

            return self::versionResponse(1);
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
        $valid = (is_string($envelope) && $envelope !== '') || ($envelope instanceof \stdClass && (array) $envelope !== []);
        if (!$valid) {
            throw new HttpException(422, 'invalid_envelope');
        }

        return json_encode($envelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    private static function etag(int $version): string
    {
        return '"' . $version . '"';
    }

    /** Accepts "3", W/"3", 3. Returns null for anything else (including "*"). */
    private static function parseVersion(string $header): ?int
    {
        if (preg_match('/^\s*(?:W\/)?"?(\d{1,18})"?\s*$/', $header, $m) === 1) {
            return (int) $m[1];
        }

        return null;
    }

    private static function etagMatches(?string $header, string $etag): bool
    {
        if ($header === null) {
            return false;
        }
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || $candidate === $etag || $candidate === 'W/' . $etag) {
                return true;
            }
        }

        return false;
    }

    /** @param array{version: int, envelope: string} $row */
    private static function docResponse(int $status, array $row, string $etag): Response
    {
        return Response::raw($status, '{"version":' . $row['version'] . ',"envelope":' . $row['envelope'] . '}', ['ETag' => $etag]);
    }

    /** @param array{version: int, envelope: string} $row */
    private static function conflict(array $row): Response
    {
        return self::docResponse(409, $row, self::etag($row['version']));
    }

    private static function versionResponse(int $version): Response
    {
        return Response::json(200, ['version' => $version], ['ETag' => self::etag($version)]);
    }
}
