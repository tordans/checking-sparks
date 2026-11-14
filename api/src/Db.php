<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

use PDO;

/** Thin PDO wrapper with the few dialect decisions the app needs (MariaDB vs SQLite). */
final class Db
{
    public function __construct(public readonly PDO $pdo)
    {
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    public static function connect(Config $config): self
    {
        $pdo = new PDO($config->dbDsn(), $config->dbUser(), $config->dbPassword(), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        return new self($pdo);
    }

    /** UTC timestamp string as stored in DATETIME columns. */
    public static function format(\DateTimeInterface $at): string
    {
        return \DateTimeImmutable::createFromInterface($at)->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /**
     * @param array<int|string, mixed> $params
     * @return list<array<string, mixed>>
     */
    public function all(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);

        return $st->fetchAll();
    }

    /**
     * @param array<int|string, mixed> $params
     * @return array<string, mixed>|null
     */
    public function one(string $sql, array $params = []): ?array
    {
        $rows = $this->all($sql, $params);

        return $rows[0] ?? null;
    }

    /** @param array<int|string, mixed> $params affected rows */
    public function run(string $sql, array $params = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);

        return $st->rowCount();
    }

    /**
     * Run $fn inside a transaction; roll back on any exception.
     *
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public function transaction(callable $fn): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $fn();
            $this->pdo->commit();

            return $result;
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function isUniqueViolation(\PDOException $e): bool
    {
        return ($e->errorInfo[0] ?? $e->getCode()) === '23000';
    }
}
