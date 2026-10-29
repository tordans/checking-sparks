<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Migrator;
use CheckingSparks\Api\Tests\Support\ApiTestCase;

final class MigrateTest extends ApiTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Start from an empty database; the base class already applied the migrations.
        foreach (['doc', 'reminders', 'subscriptions', 'migrations'] as $table) {
            $this->db->pdo->exec('DROP TABLE IF EXISTS ' . $table);
        }
    }

    public function testMigrateCreatesSchemaAndIsIdempotent(): void
    {
        $r = $this->call('POST', '/api/migrate', headers: ['X-Deploy-Key' => self::DEPLOY_KEY], auth: false);
        self::assertSame(200, $r->status);
        self::assertSame(['applied' => ['001_init.sql']], $r->data());

        self::assertSame('001_init.sql', $this->db->one('SELECT name FROM migrations')['name']);
        // Tables exist and are usable.
        $this->db->run("INSERT INTO doc (id, version, envelope, updated_at) VALUES (1, 1, '\"x\"', '2026-01-01 00:00:00')");
        self::assertSame(1, (int) $this->db->one('SELECT COUNT(*) AS n FROM doc')['n']);

        $again = $this->call('POST', '/api/migrate', headers: ['X-Deploy-Key' => self::DEPLOY_KEY], auth: false);
        self::assertSame(['applied' => []], $again->data());
        self::assertSame(1, (int) $this->db->one('SELECT COUNT(*) AS n FROM migrations')['n']);
        self::assertSame(1, (int) $this->db->one('SELECT COUNT(*) AS n FROM doc')['n'], 'data survives a second migrate');
    }

    public function testAppliesOnlyPendingMigrationsInOrder(): void
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        file_put_contents($dir . '/001_a.sql', "-- first\nCREATE TABLE IF NOT EXISTS t_a (id INTEGER NOT NULL PRIMARY KEY);\n");
        file_put_contents($dir . '/002_b.sql', "CREATE TABLE IF NOT EXISTS t_b (id INTEGER NOT NULL PRIMARY KEY);\n-- comment; with semicolon\nCREATE TABLE IF NOT EXISTS t_c (id INTEGER NOT NULL PRIMARY KEY);\n");

        try {
            $migrator = new Migrator($this->db, $dir);
            self::assertSame(['001_a.sql', '002_b.sql'], $migrator->migrate());
            file_put_contents($dir . '/003_d.sql', "CREATE TABLE IF NOT EXISTS t_d (id INTEGER NOT NULL PRIMARY KEY);\n");
            self::assertSame(['003_d.sql'], $migrator->migrate());
            self::assertSame([], $migrator->migrate());
            foreach (['t_a', 't_b', 't_c', 't_d'] as $table) {
                $this->db->run("SELECT 1 FROM $table");
            }
        } finally {
            foreach (['t_a', 't_b', 't_c', 't_d'] as $table) {
                $this->db->pdo->exec("DROP TABLE IF EXISTS $table");
            }
            array_map('unlink', glob($dir . '/*'));
            rmdir($dir);
        }
    }

    public function testApiWithoutMigrationFailsGenericallyNotWithDbDetails(): void
    {
        $r = $this->call('GET', '/api/doc');
        self::assertSame(500, $r->status);
        self::assertSame(['error' => 'internal_error'], $r->data());
    }
}
