<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

/** Compares sha256(secret) of what the client sends with the hashes from the config. */
final class Auth
{
    public function __construct(private readonly Config $config)
    {
    }

    public function family(Request $request): bool
    {
        $token = $request->bearerToken();

        return $token !== null && self::matches($token, $this->config->familyKeySha256());
    }

    /** Cron key from "?key=" (KAS cronjobs can only call a URL) or the X-Cron-Key header. */
    public function cron(Request $request): bool
    {
        $given = $request->header('x-cron-key') ?? ($request->query['key'] ?? null);

        return is_string($given) && self::matches($given, $this->config->cronKeySha256());
    }

    public function deploy(Request $request): bool
    {
        $given = $request->header('x-deploy-key');

        return $given !== null && self::matches($given, $this->config->deployKeySha256());
    }

    private static function matches(string $given, string $expectedHash): bool
    {
        if ($given === '' || $expectedHash === '') {
            return false;
        }

        return hash_equals(strtolower($expectedHash), hash('sha256', $given));
    }
}
