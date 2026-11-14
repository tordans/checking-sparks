<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests\Support;

use CheckingSparks\Api\App;
use CheckingSparks\Api\Config;
use CheckingSparks\Api\Db;
use CheckingSparks\Api\Logger;
use CheckingSparks\Api\Migrator;
use CheckingSparks\Api\Request;
use CheckingSparks\Api\Response;
use PHPUnit\Framework\TestCase;

/**
 * Runs the app in-process against SQLite (in memory) by default.
 * Set TEST_DB_DSN (+ TEST_DB_USER, TEST_DB_PASSWORD) to run the same tests against MariaDB.
 */
abstract class ApiTestCase extends TestCase
{
    protected const FAMILY_KEY = 'family-secret-key';
    protected const CRON_KEY = 'cron-secret-key';

    protected Db $db;
    protected FakeSender $sender;
    protected App $app;
    protected \DateTimeImmutable $now;
    protected string $migrationsDir;

    protected function setUp(): void
    {
        $this->migrationsDir = dirname(__DIR__, 2) . '/migrations';
        $this->now = new \DateTimeImmutable('2026-05-10 12:00:00', new \DateTimeZone('UTC'));
        $this->sender = new FakeSender();
        $this->db = self::freshDb();
        // The app migrates by itself on its first database request; the tests also insert rows directly.
        (new Migrator($this->db, $this->migrationsDir))->migrate();
        $this->app = $this->makeApp();
    }

    protected static function freshDb(): Db
    {
        $dsn = getenv('TEST_DB_DSN');
        if (is_string($dsn) && $dsn !== '') {
            $db = new Db(new \PDO($dsn, getenv('TEST_DB_USER') ?: null, getenv('TEST_DB_PASSWORD') ?: null, [\PDO::ATTR_EMULATE_PREPARES => false]));
            foreach (['doc', 'reminders', 'subscriptions', 'migrations'] as $table) {
                $db->pdo->exec('DROP TABLE IF EXISTS ' . $table);
            }
        } else {
            $db = new Db(new \PDO('sqlite::memory:'));
        }

        return $db;
    }

    /** @param array<string, mixed> $overrides */
    protected function config(array $overrides = []): Config
    {
        return new Config($overrides + [
            'family_key_sha256' => hash('sha256', self::FAMILY_KEY),
            'cron_key_sha256' => hash('sha256', self::CRON_KEY),
            'vapid' => ['public_key' => 'PUBLIC-KEY', 'private_key' => 'PRIVATE', 'subject' => 'mailto:test@example.com'],
            'commit' => 'abc1234',
        ]);
    }

    protected function makeApp(?Config $config = null, ?string $migrationsDir = null): App
    {
        return new App(
            $config ?? $this->config(),
            fn (): Db => $this->db,
            $this->sender,
            fn (): \DateTimeImmutable => $this->now,
            new Logger('/dev/null'),
            $migrationsDir ?? $this->migrationsDir,
        );
    }

    /**
     * @param array<string, string> $headers
     * @param array<string, string> $query
     * @param mixed $json encoded as the body unless $rawBody is given
     */
    protected function call(string $method, string $path, mixed $json = null, array $headers = [], array $query = [], ?string $rawBody = null, bool $auth = true): Response
    {
        if ($auth) {
            $headers += ['Authorization' => 'Bearer ' . self::FAMILY_KEY];
        }
        $body = $rawBody ?? ($json === null ? '' : json_encode($json, JSON_THROW_ON_ERROR));

        return $this->app->handle(new Request($method, $path, $headers, $query, $body));
    }

    /** @return array<string, mixed> */
    protected function data(Response $response): array
    {
        $data = $response->data();
        self::assertIsArray($data);

        return $data;
    }

    protected function envelope(string $data = 'cipher'): array
    {
        return ['v' => 1, 'kdf' => ['name' => 'PBKDF2'], 'cipher' => ['name' => 'AES-GCM', 'iv' => 'aXY='], 'data' => $data];
    }

    protected function subscribe(string $endpoint = 'https://fcm.googleapis.com/fcm/send/abc'): void
    {
        $response = $this->call('POST', '/api/push/subscriptions', [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'BPublicKey_-', 'auth' => 'authSecret_-'],
        ]);
        self::assertSame(201, $response->status);
    }

    protected function addReminder(string $id, string $due, string $title = 'Lena: Zahnarzt buchen', string $body = 'Termin bis 31.03. machen.', string $path = '/person/p1/vorsorge/c1'): void
    {
        $this->db->run(
            'INSERT INTO reminders (id, due_at, title, body, path, sent_at, skipped) VALUES (?, ?, ?, ?, ?, NULL, 0)',
            [$id, $due, $title, $body, $path],
        );
    }
}
