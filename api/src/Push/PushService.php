<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Push;

use Closure;
use CheckingSparks\Api\Db;

/** Selection and delivery logic for due reminders. */
final class PushService
{
    public const TTL_SECONDS = 86400;
    public const URGENCY = 'normal';
    /** Reminders older than this when the cron job reaches them are skipped, not sent late. */
    public const STALE_AFTER = '-3 days';
    /** Sending happens inside the cron request; what is left is sent by the next run. */
    public const MAX_REMINDERS_PER_RUN = 50;

    /** @param Closure(): \DateTimeImmutable $clock */
    public function __construct(
        private readonly Db $db,
        private readonly PushSender $sender,
        private readonly Closure $clock,
    ) {
    }

    /**
     * Send due, unsent reminders to every subscription.
     *
     * @return array{sent: int, failed: int, removed: int, skipped: int}
     */
    public function run(): array
    {
        $now = ($this->clock)();
        $nowStr = Db::format($now);
        $stats = ['sent' => 0, 'failed' => 0, 'removed' => 0];

        // Too old to be useful: mark as skipped so they do not fire late.
        $skipped = $this->db->run(
            'UPDATE reminders SET sent_at = ?, skipped = 1 WHERE sent_at IS NULL AND due_at < ?',
            [$nowStr, Db::format($now->modify(self::STALE_AFTER))],
        );

        $due = $this->db->all(
            'SELECT id, title, body, path FROM reminders WHERE sent_at IS NULL AND due_at <= ? '
            . 'ORDER BY due_at, id LIMIT ' . self::MAX_REMINDERS_PER_RUN,
            [$nowStr],
        );
        foreach ($due as $reminder) {
            // Loaded per reminder, so a subscription found gone is not tried again in this run.
            $subscriptions = $this->subscriptions();
            if ($subscriptions === []) {
                // Nothing is claimed: the reminders stay pending until they go stale.
                break;
            }
            // Claim first so an overlapping cron run cannot send the same reminder twice.
            $claimed = $this->db->run(
                'UPDATE reminders SET sent_at = ? WHERE id = ? AND sent_at IS NULL',
                [$nowStr, $reminder['id']],
            );
            if ($claimed === 0) {
                continue;
            }

            $result = $this->deliver(
                $subscriptions,
                self::payload((string) $reminder['id'], (string) $reminder['title'], (string) $reminder['body'], (string) $reminder['path']),
            );
            foreach ($result as $key => $count) {
                $stats[$key] += $count;
            }
            if ($result['sent'] === 0) {
                // Nobody got it (transient errors or all subscriptions gone): try again next run.
                $this->db->run('UPDATE reminders SET sent_at = NULL WHERE id = ?', [$reminder['id']]);
            }
        }

        return $stats + ['skipped' => $skipped];
    }

    /**
     * Send the fixed test notification to every subscription.
     *
     * @return array{sent: int, failed: int, removed: int}
     */
    public function test(): array
    {
        return $this->deliver($this->subscriptions(), self::payload('test', 'Checking Sparks', 'Test-Benachrichtigung', '/'));
    }

    /**
     * JSON text the service worker shows. `id` is the reminder id (the test push uses "test"); the
     * service worker uses it as notification tag, so a newer notification replaces an older one.
     */
    public static function payload(string $id, string $title, string $body, string $path): string
    {
        return json_encode(['id' => $id, 'title' => $title, 'body' => $body, 'path' => $path], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /**
     * Sends one payload to the given subscriptions; deletes those the push service reports gone.
     *
     * @param list<array{endpoint: string, p256dh: string, auth: string}> $subscriptions
     * @return array{sent: int, failed: int, removed: int}
     */
    private function deliver(array $subscriptions, string $payload): array
    {
        $result = ['sent' => 0, 'failed' => 0, 'removed' => 0];
        foreach ($subscriptions as $subscription) {
            $sent = $this->sender->send($subscription, $payload, self::TTL_SECONDS, self::URGENCY);
            if ($sent->ok) {
                $result['sent']++;
            } elseif ($sent->gone) {
                $this->db->run('DELETE FROM subscriptions WHERE endpoint = ?', [$subscription['endpoint']]);
                $result['removed']++;
            } else {
                $result['failed']++;
            }
        }

        return $result;
    }

    /** @return list<array{endpoint: string, p256dh: string, auth: string}> */
    private function subscriptions(): array
    {
        $rows = $this->db->all('SELECT endpoint, p256dh, auth FROM subscriptions ORDER BY created_at, endpoint');

        return array_map(
            static fn (array $r): array => ['endpoint' => (string) $r['endpoint'], 'p256dh' => (string) $r['p256dh'], 'auth' => (string) $r['auth']],
            $rows,
        );
    }
}
