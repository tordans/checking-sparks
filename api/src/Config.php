<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

/** Typed access to the config array (see config.example.php). */
final class Config
{
    /** @param array<string, mixed> $values */
    public function __construct(private readonly array $values)
    {
    }

    /** Load a config file that returns an array. */
    public static function fromFile(string $path): self
    {
        if (!is_file($path)) {
            throw new \RuntimeException('Config file not found.');
        }
        $values = (static function () use ($path) {
            /** @psalm-suppress UnresolvableInclude */
            return require $path;
        })();
        if (!is_array($values)) {
            throw new \RuntimeException('Config file must return an array.');
        }

        return new self($values);
    }

    /**
     * Where the config lives: $CHECK_CONFIG, then api/config.php (local development),
     * then ../config/config.php next to the api folder (deployed layout, outside the web root).
     */
    public static function locate(string $apiRoot): string
    {
        $env = getenv('CHECK_CONFIG');
        if (is_string($env) && $env !== '') {
            return $env;
        }
        foreach ([$apiRoot . '/config.php', dirname($apiRoot) . '/config/config.php'] as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return dirname($apiRoot) . '/config/config.php';
    }

    public function dbDsn(): string
    {
        return $this->string(['db', 'dsn']);
    }

    public function dbUser(): ?string
    {
        $v = $this->string(['db', 'user']);

        return $v === '' ? null : $v;
    }

    public function dbPassword(): ?string
    {
        $v = $this->string(['db', 'password']);

        return $v === '' ? null : $v;
    }

    public function familyKeySha256(): string
    {
        return $this->string(['family_key_sha256']);
    }

    public function cronKeySha256(): string
    {
        return $this->string(['cron_key_sha256']);
    }

    public function deployKeySha256(): string
    {
        return $this->string(['deploy_key_sha256']);
    }

    public function vapidPublicKey(): string
    {
        return $this->string(['vapid', 'public_key']);
    }

    public function vapidPrivateKey(): string
    {
        return $this->string(['vapid', 'private_key']);
    }

    public function vapidSubject(): string
    {
        return $this->string(['vapid', 'subject']);
    }

    public function vapidConfigured(): bool
    {
        return $this->vapidPublicKey() !== '' && $this->vapidPrivateKey() !== '' && $this->vapidSubject() !== '';
    }

    /** Extra origin allowed to call the API cross-origin (local dev server), or null. */
    public function devOrigin(): ?string
    {
        $v = $this->string(['dev_origin']);

        return $v === '' ? null : rtrim($v, '/');
    }

    public function commit(): string
    {
        $v = $this->string(['commit']);

        return $v === '' ? 'unknown' : $v;
    }

    public function logFile(): ?string
    {
        $v = $this->string(['log_file']);

        return $v === '' ? null : $v;
    }

    /** @param list<string> $path */
    private function string(array $path): string
    {
        $node = $this->values;
        foreach ($path as $key) {
            if (!is_array($node) || !array_key_exists($key, $node)) {
                return '';
            }
            $node = $node[$key];
        }

        return is_string($node) ? $node : '';
    }
}
