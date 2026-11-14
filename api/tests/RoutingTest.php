<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Request;
use CheckingSparks\Api\Tests\Support\ApiTestCase;

final class RoutingTest extends ApiTestCase
{
    public function testHealthNeedsNoAuthAndReturnsCommit(): void
    {
        $r = $this->call('GET', '/api/health', auth: false);
        self::assertSame(200, $r->status);
        self::assertSame(['ok' => true, 'commit' => 'abc1234'], $r->data());
        self::assertSame('no-store', $r->header('Cache-Control'));
        self::assertStringStartsWith('application/json', (string) $r->header('Content-Type'));
    }

    public function testHealthWorksWithoutDatabase(): void
    {
        $app = new \CheckingSparks\Api\App(
            $this->config(),
            fn () => throw new \RuntimeException('no db'),
            $this->sender,
            fn () => $this->now,
            new \CheckingSparks\Api\Logger('/dev/null'),
            $this->migrationsDir,
        );
        self::assertSame(200, $app->handle(new Request('GET', '/api/health'))->status);
    }

    public function testUnknownRouteIs404Json(): void
    {
        $r = $this->call('GET', '/api/nope');
        self::assertSame(404, $r->status);
        self::assertSame(['error' => 'not_found'], $r->data());
        self::assertSame(404, $this->call('GET', '/other', auth: false)->status);
    }

    public function testTrailingSlashIsAccepted(): void
    {
        self::assertSame(200, $this->call('GET', '/api/health/', auth: false)->status);
    }

    public function testWrongMethodIs405WithAllowHeader(): void
    {
        $r = $this->call('DELETE', '/api/doc');
        self::assertSame(405, $r->status);
        self::assertSame('GET, PUT', $r->header('Allow'));
    }

    public function testBodyOverTwoMegabytesIs413(): void
    {
        $r = $this->call('PUT', '/api/doc', rawBody: str_repeat('a', 2 * 1024 * 1024 + 1), headers: ['If-None-Match' => '*']);
        self::assertSame(413, $r->status);
        self::assertSame(['error' => 'payload_too_large'], $r->data());
    }

    public function testDeclaredContentLengthOverLimitIs413(): void
    {
        $r = $this->app->handle(new Request('PUT', '/api/doc', ['Authorization' => 'Bearer ' . self::FAMILY_KEY], [], '', 3 * 1024 * 1024));
        self::assertSame(413, $r->status);
    }

    public function testTruncatedBodyIs413(): void
    {
        $r = $this->app->handle(new Request('PUT', '/api/doc', ['Authorization' => 'Bearer ' . self::FAMILY_KEY], [], 'x', null, true));
        self::assertSame(413, $r->status);
    }

    public function testUnexpectedErrorsAreGenericAndDoNotLeak(): void
    {
        $app = new \CheckingSparks\Api\App(
            $this->config(),
            fn () => throw new \RuntimeException('secret detail'),
            $this->sender,
            fn () => $this->now,
            new \CheckingSparks\Api\Logger('/dev/null'),
            $this->migrationsDir,
        );
        $r = $app->handle(new Request('GET', '/api/doc', ['Authorization' => 'Bearer ' . self::FAMILY_KEY]));
        self::assertSame(500, $r->status);
        self::assertSame(['error' => 'internal_error'], $r->data());
        self::assertStringNotContainsString('secret detail', $r->body);
    }
}
