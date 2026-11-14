<?php

declare(strict_types=1);

namespace CheckingSparks\Api;

use Closure;
use CheckingSparks\Api\Handler\DocHandler;
use CheckingSparks\Api\Handler\ReminderHandler;
use CheckingSparks\Api\Handler\SubscriptionHandler;
use CheckingSparks\Api\Push\PushSender;
use CheckingSparks\Api\Push\PushService;
use CheckingSparks\Api\Push\WebPushSender;

/** Front controller: routing, auth, size limit, error mapping. */
final class App
{
    private const AUTH_NONE = 'none';
    private const AUTH_FAMILY = 'family';
    private const AUTH_CRON = 'cron';

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

        return $this->decorate($response);
    }

    private function dispatch(Request $request): Response
    {
        $path = $request->path === '/' ? '/' : rtrim($request->path, '/');
        $routes = array_filter($this->routes(), static fn (array $r): bool => $r['path'] === $path);
        if ($routes === []) {
            throw new HttpException(404, 'not_found');
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
                'handler' => fn (): Response => $this->doc()->get()],
            ['path' => '/api/doc', 'methods' => ['PUT'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->doc()->put($r)],
            ['path' => '/api/reminders', 'methods' => ['PUT'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => (new ReminderHandler($this->db(), $this->clock))->replace($r)],
            ['path' => '/api/push/vapid-public-key', 'methods' => ['GET'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (): Response => $this->vapidPublicKey()],
            ['path' => '/api/push/subscriptions', 'methods' => ['POST'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->subscriptions()->upsert($r)],
            ['path' => '/api/push/subscriptions', 'methods' => ['DELETE'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (Request $r): Response => $this->subscriptions()->delete($r)],
            ['path' => '/api/push/test', 'methods' => ['POST'], 'auth' => self::AUTH_FAMILY,
                'handler' => fn (): Response => Response::json(200, $this->push()->test())],
            ['path' => '/api/push/run', 'methods' => ['GET', 'POST'], 'auth' => self::AUTH_CRON,
                'handler' => fn (): Response => Response::json(200, $this->push()->run())],
        ];
    }

    /**
     * The database with pending migrations applied. Only routes that need the database get here,
     * never /api/health. Runs once per request (the app is built per request); when nothing is
     * pending, the migrator costs one CREATE TABLE IF NOT EXISTS and one query for the names
     * already applied.
     */
    private function db(): Db
    {
        if ($this->db === null) {
            $db = ($this->dbFactory)();
            (new Migrator($db, $this->migrationsDir))->migrate();
            $this->db = $db;
        }

        return $this->db;
    }

    private function doc(): DocHandler
    {
        return new DocHandler($this->db(), $this->clock);
    }

    private function subscriptions(): SubscriptionHandler
    {
        return new SubscriptionHandler($this->db(), $this->clock);
    }

    private function vapidPublicKey(): Response
    {
        $this->requireVapid();

        return Response::json(200, ['key' => $this->config->vapidPublicKey()]);
    }

    private function push(): PushService
    {
        $this->requireVapid();

        return new PushService($this->db(), $this->sender, $this->clock);
    }

    private function requireVapid(): void
    {
        if (!$this->config->vapidConfigured()) {
            throw new HttpException(503, 'push_not_configured');
        }
    }

    /** Security headers and no caching. The API is same-origin only, so no CORS headers. */
    private function decorate(Response $response): Response
    {
        $response->headers['Cache-Control'] = 'no-store';
        $response->headers['X-Content-Type-Options'] = 'nosniff';

        return $response;
    }
}
