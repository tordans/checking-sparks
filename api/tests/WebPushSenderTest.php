<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Config;
use CheckingSparks\Api\Logger;
use CheckingSparks\Api\Push\WebPushSender;
use Minishlink\WebPush\VAPID;
use PHPUnit\Framework\TestCase;

final class WebPushSenderTest extends TestCase
{
    public function testUnusableSubscriptionKeysFailWithoutThrowingOrNetwork(): void
    {
        $keys = VAPID::createVapidKeys();
        self::assertNotSame('', $keys['publicKey']);
        $sender = new WebPushSender(new Config(['vapid' => [
            'public_key' => $keys['publicKey'],
            'private_key' => $keys['privateKey'],
            'subject' => 'mailto:test@example.com',
        ]]), new Logger('/dev/null'));

        $result = $sender->send(['endpoint' => 'https://push.example.invalid/x', 'p256dh' => 'not-a-key', 'auth' => 'x'], '{"title":"t"}', 86400, 'normal');
        self::assertFalse($result->ok);
        self::assertFalse($result->gone);
    }
}
