<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Request;
use CheckingSparks\Api\Tests\Support\ApiTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

final class AuthTest extends ApiTestCase
{
    /** @return iterable<string, array{string, string, string|null}> */
    public static function familyEndpoints(): iterable
    {
        yield 'doc get' => ['GET', '/api/doc', null];
        yield 'doc put' => ['PUT', '/api/doc', '{"envelope":"x"}'];
        yield 'reminders' => ['PUT', '/api/reminders', '{"reminders":[]}'];
        yield 'vapid key' => ['GET', '/api/push/vapid-public-key', null];
        yield 'subscribe' => ['POST', '/api/push/subscriptions', '{}'];
        yield 'unsubscribe' => ['DELETE', '/api/push/subscriptions', '{}'];
        yield 'push test' => ['POST', '/api/push/test', null];
    }

    #[DataProvider('familyEndpoints')]
    public function testFamilyEndpointsRequireTheFamilyKey(string $method, string $path, ?string $body): void
    {
        $none = $this->call($method, $path, rawBody: $body, auth: false);
        self::assertSame(401, $none->status);
        self::assertSame(['error' => 'unauthorized'], $none->data());

        $wrong = $this->call($method, $path, rawBody: $body, headers: ['Authorization' => 'Bearer wrong'], auth: false);
        self::assertSame(401, $wrong->status);

        $notBearer = $this->call($method, $path, rawBody: $body, headers: ['Authorization' => 'Basic ' . self::FAMILY_KEY], auth: false);
        self::assertSame(401, $notBearer->status);

        $cron = $this->call($method, $path, rawBody: $body, headers: ['Authorization' => 'Bearer ' . self::CRON_KEY], auth: false);
        self::assertSame(401, $cron->status, 'the cron key is not a family key');
    }

    public function testFamilyKeyIsAccepted(): void
    {
        self::assertNotSame(401, $this->call('GET', '/api/doc')->status);
    }

    public function testBearerSchemeIsCaseInsensitive(): void
    {
        $r = $this->call('GET', '/api/push/vapid-public-key', headers: ['authorization' => 'bearer ' . self::FAMILY_KEY], auth: false);
        self::assertSame(200, $r->status);
    }

    public function testEmptyConfiguredHashNeverAuthenticates(): void
    {
        $app = $this->makeApp($this->config(['family_key_sha256' => '', 'cron_key_sha256' => '']));
        self::assertSame(401, $app->handle(new Request('GET', '/api/doc', ['Authorization' => 'Bearer ']))->status);
        self::assertSame(401, $app->handle(new Request('GET', '/api/push/run', [], ['key' => '']))->status);
    }

    public function testCronKeyViaQueryOrHeader(): void
    {
        self::assertSame(401, $this->call('GET', '/api/push/run', auth: false)->status);
        self::assertSame(401, $this->call('GET', '/api/push/run', query: ['key' => 'nope'], auth: false)->status);
        self::assertSame(401, $this->call('GET', '/api/push/run', query: ['key' => self::FAMILY_KEY], auth: false)->status);
        self::assertSame(200, $this->call('GET', '/api/push/run', query: ['key' => self::CRON_KEY], auth: false)->status);
        self::assertSame(200, $this->call('POST', '/api/push/run', headers: ['X-Cron-Key' => self::CRON_KEY], auth: false)->status);
    }

    public function testFamilyKeyDoesNotOpenCron(): void
    {
        self::assertSame(401, $this->call('GET', '/api/push/run')->status);
    }
}
