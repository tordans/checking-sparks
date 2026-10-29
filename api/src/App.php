<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

use Closure;
use CheckingSparks\Api\Handler\DocHandler;
use CheckingSparks\Api\Handler\PushHandler;
use CheckingSparks\Api\Handler\ReminderHandler;
use CheckingSparks\Api\Handler\SubscriptionHandler;
use CheckingSparks\Api\Push\PushSender;
use CheckingSparks\Api\Push\PushService;
use CheckingSparks\Api\Push\WebPushSender;

/** Front controller: routing, auth, size limit, CORS, error mapping. */
final class App
{
    private const AUTH_NONE = 'none';
    private const AUTH_FAMILY = 'family';
    private const AUTH_CRON = 'cron';
    private const AUTH_DEPLOY = 'deploy';

    private ?Db $db = null;
    private readonly Auth $auth;

    /**
     * @param Closure(): Db $dbFactory called lazily, so /api/health works without a database
     * @param Closure(): \DateTimeImmutable $clock
     */
    public function __construct(
        private readonly Config $config,
        private readonly Closure $dbFactory,
        private readonly PushSender $sender,
        private readonly Closure $clock,
        private readonly Logger $logger,
        private readonly string $migrationsDir,
    ) {
        $this->auth = new Auth($config);
    }

    /** Production wiring. */
    public static function fromConfig(Config $config, string $apiRoot): self
    {
        $logger = new Logger($config->logFile());

        return new self(
            $config,
            static fn (): Db => Db::connect($config),
            new WebPushSender($config, $logger),
            static fn (): \DateTimeImmutable => new \DateTimeImmutable('now', new \DateTimeZone('UTC')),
            $logger,
            $apiRoot . '/migrations',
        );
    }

    public function handle(Request $request): Response
    {
        try {
            $response = $this->dispatch($request);
        } catch (HttpException $e) {
            $response = Response::json($e->status, ['error' => $e->error] + $e->extra, $e->headers);
        } catch (\Throwable $e) {
            $this->logger->exception($e);
            $response = Response::json(500, ['error' => 'internal_error']);
        }

        return $this->decorate($request, $response);
    }

    private function dispatch(Request $request): Response
    {
        $path = $request->path === '/' ? '/' : rtrim($request->path, '/');
        $routes = array_filter($this->routes(), static fn (array $r): bool => $r['path'] === $path);
        if ($routes === []) {
            throw new HttpException(404, 'not_found');
        }

        if ($request->method === 'OPTIONS') {
            return Response::empty(204);
        }

        $route = null;
        foreach ($routes as $candidate) {
            if (in_array($request->method, $candidate['methods'], true)) {
                $route = $candidate;
                break;
            }
        }
        if ($route === null) {
            $allowed = array_merge(...array_column($routes, 'methods'));
            throw new HttpException(405, 'method_not_allowed', [], ['Allow' => implode(', ', array_unique($allowed))]);
        }

        if ($request->tooLarge()) {
            throw new HttpException(413, 'payload_too_large');
        }

        $authorized = match ($route['auth']) {
            self::AUTH_NONE => true,
            self::AUTH_FAMILY => $this->auth->family($request),
            self::AUTH_CRON => $this->auth->cron($request),
            self::AUTH_DEPLOY => $this->auth->deploy($request),
        };
        if (!$authorized) {
            throw new HttpException(401, 'unauthorized', [], ['WWW-Authenticate' => 'Bearer']);
        }

        return ($route['handler'])($request);
    }

    /**
     * @return list<array{path: string, methods: list<string>, auth: string, handler: Closure(Request): Response}>
     */
    private function routes(): array
    {
        return [
            ['path' => '/api/health', 'methods' => ['GET'], 'auth' => self::AUTH_NONE,
                'handler' => fn (): Response => Response::json(200, ['ok' => true, 'commit' => $this->config->commit()])],
            ['path' => '/api/doc', 'methods' => ['GET'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->doc()->get($r)],
            ['path' => '/api/doc', 'methods' => ['PUT'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->doc()->put($r)],
            ['path' => '/api/reminders', 'methods' => ['PUT'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => (new ReminderHandler($this->db(), $this->clock))->replace($r)],
            ['path' => '/api/push/vapid-public-key', 'methods' => ['GET'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (): Response => $this->push()->vapidPublicKey()],
            ['path' => '/api/push/subscriptions', 'methods' => ['POST'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->subscriptions()->upsert($r)],
            ['path' => '/api/push/subscriptions', 'methods' => ['DELETE'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->subscriptions()->delete($r)],
            ['path' => '/api/push/test', 'methods' => ['POST'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (): Response => $this->push()->test()],
            ['path' => '/api/push/run', 'methods' => ['GET', 'POST'], 'auth' => self::AUTH_CRON,
                'handler' => fn (): Response => $this->push()->run()],
            ['path' => '/api/migrate', 'methods' => ['POST'], 'auth' => self::AUTH_DEPLOY,
                'handler' => fn (): Response => Response::json(200, ['applied' => (new Migrator($this->db(), $this->migrationsDir))->migrate()])],
        ];
    }

    private function db(): Db
    {
        return $this->db ??= ($this->dbFactory)();
    }

    private function doc(): DocHandler
    {
        return new DocHandler($this->db(), $this->clock);
    }

    private function subscriptions(): SubscriptionHandler
    {
        return new SubscriptionHandler($this->db(), $this->clock);
    }

    private function push(): PushHandler
    {
        return new PushHandler($this->config, $this->sender, new PushService($this->db(), $this->sender, $this->clock));
    }

    /** Security headers, no caching, and CORS only for the configured dev origin. */
    private function decorate(Request $request, Response $response): Response
    {
        $response->headers['Cache-Control'] = 'no-store';
        $response->headers['X-Content-Type-Options'] = 'nosniff';

        $origin = $request->header('origin');
        $dev = $this->config->devOrigin();
        if ($origin !== null && $dev !== null && $origin === $dev) {
            $response->headers['Access-Control-Allow-Origin'] = $origin;
            $response->headers['Vary'] = 'Origin';
            $response->headers['Access-Control-Expose-Headers'] = 'ETag';
            if ($request->method === 'OPTIONS') {
                $response->headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                $response->headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, If-Match, If-None-Match, X-Cron-Key, X-Deploy-Key';
                $response->headers['Access-Control-Max-Age'] = '600';
            }
        }

        return $response;
    }
}
