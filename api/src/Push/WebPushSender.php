<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Push;

use CheckingSparks\Api\Config;
use CheckingSparks\Api\Logger;
use GuzzleHttp\Client;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/** Production sender based on minishlink/web-push (VAPID, aes128gcm). */
final class WebPushSender implements PushSender
{
    private ?WebPush $webPush = null;

    public function __construct(private readonly Config $config, private readonly Logger $logger)
    {
    }

    public function send(array $subscription, string $payload, int $ttlSeconds, string $urgency): PushResult
    {
        try {
            $report = $this->client()->sendOneNotification(
                Subscription::create([
                    'endpoint' => $subscription['endpoint'],
                    'publicKey' => $subscription['p256dh'],
                    'authToken' => $subscription['auth'],
                    'contentEncoding' => 'aes128gcm',
                ]),
                $payload,
                ['TTL' => $ttlSeconds, 'urgency' => $urgency],
            );

            return new PushResult(
                $report->isSuccess(),
                $report->isSubscriptionExpired(),
                $report->getResponse()?->getStatusCode(),
            );
        } catch (\Throwable $e) {
            // Subscription keys that cannot be used, network errors, etc. Never log the endpoint.
            $this->logger->exception($e);

            return new PushResult(false);
        }
    }

    private function client(): WebPush
    {
        return $this->webPush ??= new WebPush(
            [
                'VAPID' => [
                    'subject' => $this->config->vapidSubject(),
                    'publicKey' => $this->config->vapidPublicKey(),
                    'privateKey' => $this->config->vapidPrivateKey(),
                ],
            ],
            [],
            // web-push 11 takes a PSR-18 client instead of a timeout. http_errors off: a 404/410
            // from the push service must come back as a response (expired subscription), not throw.
            new Client(['timeout' => 10, 'http_errors' => false]),
        );
    }
}
