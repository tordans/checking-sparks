<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Config;
use PHPUnit\Framework\TestCase;

final class ConfigTest extends TestCase
{
    public function testExampleConfigLoadsAndDeclaresAllKeys(): void
    {
        $config = Config::fromFile(dirname(__DIR__) . '/config.example.php');
        self::assertStringStartsWith('mysql:', $config->dbDsn());
        self::assertSame('dev', $config->commit());
        self::assertNull($config->devOrigin());
        self::assertNull($config->logFile());
        self::assertSame('', $config->familyKeySha256());
        self::assertSame('', $config->cronKeySha256());
        self::assertSame('', $config->deployKeySha256());
        self::assertStringStartsWith('mailto:', $config->vapidSubject());
        self::assertFalse($config->vapidConfigured());
    }

    public function testMissingFileThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Config::fromFile('/nonexistent/config.php');
    }

    public function testDeployedLayoutIsFound(): void
    {
        $root = sys_get_temp_dir() . '/check-' . bin2hex(random_bytes(4));
        mkdir($root . '/api', 0777, true);
        mkdir($root . '/config', 0777, true);
        file_put_contents($root . '/config/config.php', '<?php return [];');
        try {
            self::assertSame($root . '/config/config.php', Config::locate($root . '/api'));
            file_put_contents($root . '/api/config.php', '<?php return [];');
            self::assertSame($root . '/api/config.php', Config::locate($root . '/api'), 'local dev file wins');
        } finally {
            @unlink($root . '/api/config.php');
            unlink($root . '/config/config.php');
            rmdir($root . '/config');
            rmdir($root . '/api');
            rmdir($root);
        }
    }
}
