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
        self::assertNull($config->logFile());
        self::assertSame('', $config->familyKeySha256());
        self::assertSame('', $config->cronKeySha256());
        self::assertStringStartsWith('mailto:', $config->vapidSubject());
        self::assertFalse($config->vapidConfigured());
    }

    public function testMissingFileThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Config::fromFile('/nonexistent/config.php');
    }
}
