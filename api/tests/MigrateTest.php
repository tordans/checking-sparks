<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Migrator;
use CheckingSparks\Api\Tests\Support\ApiTestCase;

/** The API applies the migrations itself before the first request that needs the database. */
final class MigrateTest extends ApiTestCase
{
    private const TABLES = ['doc', 'reminders', 'subscriptions', 'migrations', 't_once', 't_race', 't_a', 't_b', 't_c', 't_d'];

    /** @var list<string> temporary migration folders, removed in tearDown() */
    private array $dirs = [];

    protected function setUp(): void
    {
        parent::setUp();
        // Start from an empty database; the base class already applied the migrations.
        $this->dropTables();
    }

    protected function tearDown(): void
    {
        foreach ($this->dirs as $dir) {
            array_map('unlink', glob($dir . '/*') ?: []);
            rmdir($dir);
        }
        $this->dropTables();
        parent::tearDown();
    }

    public function testFirstRequestCreatesTheTables(): void
    {
        self::assertFalse($this->tableExists('doc'), 'a fresh database has no tables');

        $r = $this->call('GET', '/api/doc');
        self::assertSame(404, $r->status, 'the request itself works: no document yet');

        self::assertTrue($this->tableExists('doc'));
        self::assertTrue($this->tableExists('reminders'));
        self::assertTrue($this->tableExists('subscriptions'));
        $files = array_map('basename', glob(__DIR__ . '/../migrations/*.sql') ?: []);
        self::assertSame($files, array_column($this->db->all('SELECT name FROM migrations ORDER BY name'), 'name'));
    }

    public function testLaterRequestsApplyNothing(): void
    {
        // 002 fails when it runs a second time (no IF NOT EXISTS), so a re-run would show as a 500.
        $this->app = $this->makeApp(migrationsDir: $this->migrationsFolder([
            '001_init.sql' => (string) file_get_contents($this->migrationsDir . '/001_init.sql'),
            '002_once.sql' => "CREATE TABLE t_once (id INTEGER NOT NULL PRIMARY KEY);\n",
        ]));

        self::assertSame(404, $this->call('GET', '/api/doc')->status, 'first request applies 001 and 002');
        self::assertSame(404, $this->call('GET', '/api/doc')->status, 'second request applies nothing');
        self::assertSame(200, $this->call('PUT', '/api/doc', ['envelope' => $this->envelope()], ['If-None-Match' => '*'])->status);
        self::assertSame(
            ['001_init.sql', '002_once.sql'],
            array_column($this->db->all('SELECT name FROM migrations ORDER BY name'), 'name'),
        );
    }

    public function testHealthDoesNotTouchTheDatabase(): void
    {
        self::assertSame(200, $this->call('GET', '/api/health', auth: false)->status);
        self::assertFalse($this->tableExists('migrations'));
    }

    public function testMigrationRecordedByAConcurrentRequestDoesNotFail(): void
    {
        // Simulates another request that records 001 between this request's read of the applied
        // names and its own INSERT: the primary key refuses the second row, which is not an error.
        $dir = $this->migrationsFolder([
            '001_race.sql' => "CREATE TABLE IF NOT EXISTS t_race (id INTEGER NOT NULL PRIMARY KEY);\n"
                . "INSERT INTO migrations (name, applied_at) VALUES ('001_race.sql', '2026-01-01 00:00:00');\n",
        ]);

        self::assertSame([], (new Migrator($this->db, $dir))->migrate());
        self::assertSame(1, (int) $this->db->one('SELECT COUNT(*) AS n FROM migrations')['n']);
        self::assertTrue($this->tableExists('t_race'));
    }

    public function testAppliesOnlyPendingMigrationsInOrder(): void
    {
        $dir = $this->migrationsFolder([
            '001_a.sql' => "-- first\nCREATE TABLE IF NOT EXISTS t_a (id INTEGER NOT NULL PRIMARY KEY);\n",
            '002_b.sql' => "CREATE TABLE IF NOT EXISTS t_b (id INTEGER NOT NULL PRIMARY KEY);\n-- comment; with semicolon\nCREATE TABLE IF NOT EXISTS t_c (id INTEGER NOT NULL PRIMARY KEY);\n",
        ]);

        $migrator = new Migrator($this->db, $dir);
        self::assertSame(['001_a.sql', '002_b.sql'], $migrator->migrate());
        file_put_contents($dir . '/003_d.sql', "CREATE TABLE IF NOT EXISTS t_d (id INTEGER NOT NULL PRIMARY KEY);\n");
        self::assertSame(['003_d.sql'], $migrator->migrate());
        self::assertSame([], $migrator->migrate());
        foreach (['t_a', 't_b', 't_c', 't_d'] as $table) {
            self::assertTrue($this->tableExists($table), $table);
        }
    }

    /** @param array<string, string> $files file name => SQL; returns a temporary migrations folder */
    private function migrationsFolder(array $files): string
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        $this->dirs[] = $dir;
        foreach ($files as $name => $sql) {
            file_put_contents($dir . '/' . $name, $sql);
        }

        return $dir;
    }

    private function dropTables(): void
    {
        foreach (self::TABLES as $table) {
            $this->db->pdo->exec('DROP TABLE IF EXISTS ' . $table);
        }
    }

    private function tableExists(string $table): bool
    {
        try {
            $this->db->run("SELECT 1 FROM $table");

            return true;
        } catch (\PDOException) {
            return false;
        }
    }
}
