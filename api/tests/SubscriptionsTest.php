<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Tests\Support\ApiTestCase;

final class SubscriptionsTest extends ApiTestCase
{
    private const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

    /** @return list<array<string, mixed>> */
    private function rows(): array
    {
        return $this->db->all('SELECT endpoint, p256dh, auth, label, created_at, last_success_at FROM subscriptions ORDER BY endpoint');
    }

    public function testVapidPublicKey(): void
    {
        $r = $this->call('GET', '/api/push/vapid-public-key');
        self::assertSame(200, $r->status);
        self::assertSame(['key' => 'PUBLIC-KEY'], $r->data());
    }

    public function testVapidPublicKeyMissingIs503(): void
    {
        $app = $this->makeApp($this->config(['vapid' => []]), migrate: false);
        $r = $app->handle(new \CheckingSparks\Api\Request('GET', '/api/push/vapid-public-key', ['Authorization' => 'Bearer ' . self::FAMILY_KEY]));
        self::assertSame(503, $r->status);
    }

    public function testCreatesSubscription(): void
    {
        $r = $this->call('POST', '/api/push/subscriptions', [
            'endpoint' => self::ENDPOINT,
            'keys' => ['p256dh' => 'BKey-_1', 'auth' => 'auth-_1'],
            'label' => 'Lenas iPhone',
        ]);
        self::assertSame(201, $r->status);

        $rows = $this->rows();
        self::assertCount(1, $rows);
        self::assertSame(self::ENDPOINT, $rows[0]['endpoint']);
        self::assertSame('BKey-_1', $rows[0]['p256dh']);
        self::assertSame('auth-_1', $rows[0]['auth']);
        self::assertSame('Lenas iPhone', $rows[0]['label']);
        self::assertSame('2026-05-10 12:00:00', $rows[0]['created_at']);
        self::assertNull($rows[0]['last_success_at']);
    }

    public function testUpsertUpdatesKeysAndLabelButKeepsTimestamps(): void
    {
        $this->subscribe(self::ENDPOINT, 'old');
        $this->db->run("UPDATE subscriptions SET last_success_at = '2026-05-09 10:00:00'");
        $this->now = $this->now->modify('+1 day');

        $r = $this->call('POST', '/api/push/subscriptions', [
            'endpoint' => self::ENDPOINT,
            'keys' => ['p256dh' => 'NewKey', 'auth' => 'NewAuth'],
            'label' => 'new',
        ]);
        self::assertSame(201, $r->status);

        $rows = $this->rows();
        self::assertCount(1, $rows);
        self::assertSame('NewKey', $rows[0]['p256dh']);
        self::assertSame('NewAuth', $rows[0]['auth']);
        self::assertSame('new', $rows[0]['label']);
        self::assertSame('2026-05-10 12:00:00', $rows[0]['created_at']);
        self::assertSame('2026-05-09 10:00:00', $rows[0]['last_success_at']);
    }

    /** @return iterable<string, array{string}> */
    public static function pushServiceEndpoints(): iterable
    {
        yield 'fcm' => ['https://fcm.googleapis.com/fcm/send/abc'];
        yield 'android' => ['https://android.googleapis.com/gcm/send/abc'];
        yield 'mozilla' => ['https://updates.push.services.mozilla.com/wpush/v2/abc'];
        yield 'apple web push' => ['https://web.push.apple.com/abc'];
        yield 'apple subdomain' => ['https://api.sandbox.push.apple.com/3/device/abc'];
        yield 'windows subdomain' => ['https://db5p.notify.windows.com/?token=abc'];
        yield 'host case is ignored' => ['https://FCM.GoogleAPIs.com/fcm/send/abc'];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('pushServiceEndpoints')]
    public function testAcceptsEndpointsOfKnownPushServices(string $endpoint): void
    {
        $r = $this->call('POST', '/api/push/subscriptions', ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'K', 'auth' => 'A']]);
        self::assertSame(201, $r->status);
        self::assertSame([$endpoint], array_column($this->rows(), 'endpoint'));
    }

    public function testRejectedEndpointAnswersInvalidEndpoint(): void
    {
        $r = $this->call('POST', '/api/push/subscriptions', ['endpoint' => 'https://push.example.com/x', 'keys' => ['p256dh' => 'K', 'auth' => 'A']]);
        self::assertSame(422, $r->status);
        self::assertSame(['error' => 'invalid_endpoint'], $r->data());
    }

    public function testLabelIsOptionalAndExtraBrowserFieldsAreIgnored(): void
    {
        $r = $this->call('POST', '/api/push/subscriptions', [
            'endpoint' => self::ENDPOINT,
            'expirationTime' => null,
            'keys' => ['p256dh' => 'K', 'auth' => 'A'],
        ]);
        self::assertSame(201, $r->status);
        self::assertSame('', $this->rows()[0]['label']);
    }

    public function testDeleteRemovesSubscriptionAndIsIdempotent(): void
    {
        $this->subscribe(self::ENDPOINT);
        $this->subscribe('https://updates.push.services.mozilla.com/wpush/v2/x');

        $r = $this->call('DELETE', '/api/push/subscriptions', ['endpoint' => self::ENDPOINT]);
        self::assertSame(204, $r->status);
        self::assertSame('', $r->body);
        self::assertSame(['https://updates.push.services.mozilla.com/wpush/v2/x'], array_column($this->rows(), 'endpoint'));

        self::assertSame(204, $this->call('DELETE', '/api/push/subscriptions', ['endpoint' => self::ENDPOINT])->status);
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function invalidSubscriptions(): iterable
    {
        $ok = ['endpoint' => 'https://fcm.googleapis.com/x', 'keys' => ['p256dh' => 'K', 'auth' => 'A'], 'label' => 'x'];
        yield 'missing endpoint' => [array_diff_key($ok, ['endpoint' => 1])];
        yield 'http endpoint' => [['endpoint' => 'http://fcm.googleapis.com/x'] + $ok];
        yield 'localhost' => [['endpoint' => 'https://localhost/x'] + $ok];
        yield 'ip endpoint' => [['endpoint' => 'https://127.0.0.1/x'] + $ok];
        yield 'ipv6 endpoint' => [['endpoint' => 'https://[::1]/x'] + $ok];
        yield 'credentials in url' => [['endpoint' => 'https://user:pw@fcm.googleapis.com/x'] + $ok];
        yield 'other host' => [['endpoint' => 'https://push.example.com/x'] + $ok];
        yield 'internal host' => [['endpoint' => 'https://intranet/x'] + $ok];
        yield 'push host as subdomain of another host' => [['endpoint' => 'https://fcm.googleapis.com.evil.example/x'] + $ok];
        yield 'push host as prefix' => [['endpoint' => 'https://evilfcm.googleapis.com/x'] + $ok];
        yield 'subdomain of an exact host' => [['endpoint' => 'https://evil.fcm.googleapis.com/x'] + $ok];
        yield 'suffix without dot' => [['endpoint' => 'https://evilnotify.windows.com/x'] + $ok];
        yield 'push host in userinfo' => [['endpoint' => 'https://fcm.googleapis.com@evil.example/x'] + $ok];
        yield 'push host in path' => [['endpoint' => 'https://evil.example/fcm.googleapis.com'] + $ok];
        yield 'javascript url' => [['endpoint' => 'javascript:alert(1)'] + $ok];
        yield 'long endpoint' => [['endpoint' => 'https://fcm.googleapis.com/' . str_repeat('a', 500)] + $ok];
        yield 'missing keys' => [array_diff_key($ok, ['keys' => 1])];
        yield 'keys not object' => [['keys' => 'x'] + $ok];
        yield 'missing auth' => [['keys' => ['p256dh' => 'K']] + $ok];
        yield 'bad characters in key' => [['keys' => ['p256dh' => 'K K', 'auth' => 'A']] + $ok];
        yield 'empty key' => [['keys' => ['p256dh' => '', 'auth' => 'A']] + $ok];
        yield 'long label' => [['label' => str_repeat('x', 101)] + $ok];
        yield 'label not string' => [['label' => 3] + $ok];
    }

    /** @param array<string, mixed> $body */
    #[\PHPUnit\Framework\Attributes\DataProvider('invalidSubscriptions')]
    public function testRejectsInvalidSubscriptions(array $body): void
    {
        $r = $this->call('POST', '/api/push/subscriptions', $body);
        self::assertSame(422, $r->status);
        self::assertSame([], $this->rows());
    }

    public function testDeleteRequiresValidEndpoint(): void
    {
        self::assertSame(422, $this->call('DELETE', '/api/push/subscriptions', ['endpoint' => 5])->status);
        self::assertSame(400, $this->call('DELETE', '/api/push/subscriptions')->status);
    }
}
