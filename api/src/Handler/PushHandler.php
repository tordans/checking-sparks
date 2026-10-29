<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Handler;

use CheckingSparks\Api\Config;
use CheckingSparks\Api\HttpException;
use CheckingSparks\Api\Push\PushSender;
use CheckingSparks\Api\Push\PushService;
use CheckingSparks\Api\Response;

final class PushHandler
{
    public function __construct(
        private readonly Config $config,
        private readonly PushSender $sender,
        private readonly PushService $service,
    ) {
    }

    public function vapidPublicKey(): Response
    {
        if ($this->config->vapidPublicKey() === '') {
            throw new HttpException(503, 'push_not_configured');
        }

        return Response::json(200, ['key' => $this->config->vapidPublicKey()]);
    }

    public function test(): Response
    {
        $this->requireConfigured();

        return Response::json(200, $this->service->test());
    }

    public function run(): Response
    {
        $this->requireConfigured();
        $result = $this->service->run();

        return Response::json(200, $result);
    }

    private function requireConfigured(): void
    {
        if (!$this->sender->isConfigured()) {
            throw new HttpException(503, 'push_not_configured');
        }
    }
}
