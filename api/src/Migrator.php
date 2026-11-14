<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

/**
 * Applies api/migrations/*.sql in file-name order and records them in the `migrations` table.
 * The API calls this before each request that needs the database (see App::db()), so several
 * requests may run it at the same time. Files may contain several statements separated by ";"
 * (lines starting with "--" are comments; no semicolons inside string literals). MariaDB DDL is
 * not transactional, so migrations must be idempotent (CREATE ... IF NOT EXISTS): a run that is
 * interrupted or overlaps another one is simply run again.
 */
final class Migrator
{
    public function __construct(private readonly Db $db, private readonly string $dir)
    {
    }

    /** @return list<string> names of the migrations applied by this call */
    public function migrate(): array
    {
        $this->db->pdo->exec(
            'CREATE TABLE IF NOT EXISTS migrations ('
            . 'name VARCHAR(100) NOT NULL PRIMARY KEY, '
            . 'applied_at DATETIME NOT NULL)'
        );

        $done = array_column($this->db->all('SELECT name FROM migrations'), 'name');
        $files = glob(rtrim($this->dir, '/') . '/*.sql');
        sort($files);

        $applied = [];
        foreach ($files as $file) {
            $name = basename($file);
            if (in_array($name, $done, true)) {
                continue;
            }
            foreach ($this->statements((string) file_get_contents($file)) as $statement) {
                $this->db->pdo->exec($statement);
            }
            if ($this->record($name)) {
                $applied[] = $name;
            }
        }

        return $applied;
    }

    /**
     * False when a concurrent request recorded the migration first: the primary key on `name`
     * refuses the second row, and the statements above were idempotent, so that is not an error.
     */
    private function record(string $name): bool
    {
        try {
            $this->db->run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$name, Db::format(new \DateTimeImmutable())]);
        } catch (\PDOException $e) {
            if (Db::isUniqueViolation($e)) {
                return false;
            }
            throw $e;
        }

        return true;
    }

    /** @return list<string> */
    private function statements(string $sql): array
    {
        $lines = array_filter(
            explode("\n", $sql),
            static fn (string $line): bool => !str_starts_with(ltrim($line), '--'),
        );
        $statements = [];
        foreach (explode(';', implode("\n", $lines)) as $part) {
            $part = trim($part);
            if ($part !== '') {
                $statements[] = $part;
            }
        }

        return $statements;
    }
}
