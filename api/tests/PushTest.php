<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Push\PushResult;
use CheckingSparks\Api\Tests\Support\ApiTestCase;

final class PushTest extends ApiTestCase
{
    private const A = 'https://push.example.com/a';
    private const B = 'https://push.example.com/b';

    private function runCron(string $method = 'GET'): array
    {
        $r = $this->call($method, '/api/push/run', query: ['key' => self::CRON_KEY], auth: false);
        self::assertSame(200, $r->status);

        return $this->data($r);
    }

    /** @return array<string, array<string, mixed>> reminders by id */
    private function reminders(): array
    {
        $out = [];
        foreach ($this->db->all('SELECT id, sent_at, skipped FROM reminders') as $row) {
            $out[$row['id']] = $row;
        }

        return $out;
    }

    public function testSendsDueUnsentRemindersToAllSubscriptionsAndMarksThemSent(): void
    {
        $this->subscribe(self::A);
        $this->subscribe(self::B);
        $this->addReminder('due', '2026-05-10 11:00:00', 'Lena: Zahnarzt buchen', 'Termin bis 31.03. machen.', '/person/p1/vorsorge/c1');
        $this->addReminder('exactly-now', '2026-05-10 12:00:00');
        $this->addReminder('future', '2026-05-10 12:00:01');

        self::assertSame(['sent' => 4, 'failed' => 0, 'removed' => 0, 'skipped' => 0], $this->runCron());

        self::assertCount(4, $this->sender->sent);
        $first = $this->sender->sent[0];
        self::assertSame(['title' => 'Lena: Zahnarzt buchen', 'body' => 'Termin bis 31.03. machen.', 'path' => '/person/p1/vorsorge/c1'], $first['payload']);
        self::assertSame(86400, $first['ttl']);
        self::assertSame('normal', $first['urgency']);
        self::assertEqualsCanonicalizing([self::A, self::B], array_unique(array_column($this->sender->sent, 'endpoint')));

        $rows = $this->reminders();
        self::assertSame('2026-05-10 12:00:00', $rows['due']['sent_at']);
        self::assertNotNull($rows['exactly-now']['sent_at']);
        self::assertNull($rows['future']['sent_at']);
        self::assertSame('0', (string) $rows['due']['skipped']);
    }

    public function testSecondRunDoesNotSendAgain(): void
    {
        $this->subscribe(self::A);
        $this->addReminder('due', '2026-05-10 11:00:00');
        $this->runCron();
        $this->sender->sent = [];

        self::assertSame(['sent' => 0, 'failed' => 0, 'removed' => 0, 'skipped' => 0], $this->runCron('POST'));
        self::assertSame([], $this->sender->sent);
    }

    public function testSendsInDueOrder(): void
    {
        $this->subscribe(self::A);
        $this->addReminder('late', '2026-05-10 11:30:00', 'second');
        $this->addReminder('early', '2026-05-09 08:00:00', 'first');
        $this->runCron();
        self::assertSame(['first', 'second'], array_column(array_column($this->sender->sent, 'payload'), 'title'));
    }

    public function testStaleRemindersAreSkippedNotSent(): void
    {
        $this->subscribe(self::A);
        $this->addReminder('stale', '2026-05-07 11:59:59'); // just over 3 days old
        $this->addReminder('edge', '2026-05-07 12:00:00');  // exactly 3 days: still sent
        $this->addReminder('fresh', '2026-05-09 12:00:00');

        self::assertSame(['sent' => 2, 'failed' => 0, 'removed' => 0, 'skipped' => 1], $this->runCron());

        $rows = $this->reminders();
        self::assertSame('1', (string) $rows['stale']['skipped']);
        self::assertSame('2026-05-10 12:00:00', $rows['stale']['sent_at']);
        self::assertSame('0', (string) $rows['edge']['skipped']);
        self::assertCount(2, $this->sender->sent);
    }

    public function testStaleRemindersAreSkippedEvenWithoutSubscriptions(): void
    {
        $this->addReminder('stale', '2026-05-01 09:00:00');
        self::assertSame(1, $this->runCron()['skipped']);
        self::assertSame('1', (string) $this->reminders()['stale']['skipped']);
    }

    public function testWithoutSubscriptionsRemindersStayPending(): void
    {
        $this->addReminder('due', '2026-05-10 11:00:00');
        self::assertSame(['sent' => 0, 'failed' => 0, 'removed' => 0, 'skipped' => 0], $this->runCron());
        self::assertNull($this->reminders()['due']['sent_at']);

        // The family subscribes later: the next run delivers it.
        $this->subscribe(self::A);
        self::assertSame(1, $this->runCron()['sent']);
        self::assertNotNull($this->reminders()['due']['sent_at']);
    }

    public function testGoneSubscriptionsAreRemoved(): void
    {
        $this->subscribe(self::A);
        $this->subscribe(self::B);
        $this->sender->results[self::A] = new PushResult(false, true, 410);
        $this->addReminder('r1', '2026-05-10 11:00:00');
        $this->addReminder('r2', '2026-05-10 11:10:00');

        self::assertSame(['sent' => 2, 'failed' => 0, 'removed' => 1, 'skipped' => 0], $this->runCron());

        self::assertSame([self::B], array_column($this->db->all('SELECT endpoint FROM subscriptions'), 'endpoint'));
        // A is tried once, then dropped for the rest of the run: 1 attempt for A + 2 for B.
        self::assertCount(3, $this->sender->sent);
        self::assertNotNull($this->reminders()['r1']['sent_at']);
        self::assertNotNull($this->reminders()['r2']['sent_at']);
    }

    public function testFailureOnOneSubscriptionStillMarksSentWhenAnotherSucceeds(): void
    {
        $this->subscribe(self::A);
        $this->subscribe(self::B);
        $this->sender->results[self::A] = new PushResult(false, false, 503);
        $this->addReminder('r1', '2026-05-10 11:00:00');

        self::assertSame(['sent' => 1, 'failed' => 1, 'removed' => 0, 'skipped' => 0], $this->runCron());
        self::assertNotNull($this->reminders()['r1']['sent_at']);
        self::assertCount(2, $this->db->all('SELECT 1 FROM subscriptions'), 'transient failures keep the subscription');
    }

    public function testReminderIsRetriedWhenNoSubscriptionReceivedIt(): void
    {
        $this->subscribe(self::A);
        $this->sender->results[self::A] = new PushResult(false, false, 500);
        $this->addReminder('r1', '2026-05-10 11:00:00');

        self::assertSame(['sent' => 0, 'failed' => 1, 'removed' => 0, 'skipped' => 0], $this->runCron());
        self::assertNull($this->reminders()['r1']['sent_at'], 'released for the next run');

        unset($this->sender->results[self::A]);
        self::assertSame(1, $this->runCron()['sent']);
        self::assertNotNull($this->reminders()['r1']['sent_at']);
    }

    public function testReminderStaysPendingWhenAllSubscriptionsWereGone(): void
    {
        $this->subscribe(self::A);
        $this->sender->results[self::A] = new PushResult(false, true, 404);
        $this->addReminder('r1', '2026-05-10 11:00:00');
        $this->addReminder('r2', '2026-05-10 11:05:00');

        self::assertSame(['sent' => 0, 'failed' => 0, 'removed' => 1, 'skipped' => 0], $this->runCron());
        self::assertSame([], $this->db->all('SELECT 1 FROM subscriptions'));
        self::assertNull($this->reminders()['r1']['sent_at']);
        self::assertNull($this->reminders()['r2']['sent_at']);
        self::assertCount(1, $this->sender->sent, 'stops after the last subscription is gone');
    }

    public function testSuccessUpdatesLastSuccessAt(): void
    {
        $this->subscribe(self::A);
        $this->addReminder('r1', '2026-05-10 11:00:00');
        $this->runCron();
        self::assertSame('2026-05-10 12:00:00', $this->db->one('SELECT last_success_at FROM subscriptions')['last_success_at']);
    }

    public function testPayloadKeepsUmlautsReadable(): void
    {
        $this->subscribe(self::A);
        $this->addReminder('r1', '2026-05-10 11:00:00', 'Jörg: Zähne prüfen', 'Bitte bald ✓');
        $this->runCron();
        self::assertSame('Jörg: Zähne prüfen', $this->sender->sent[0]['payload']['title']);
    }

    public function testRunNeedsConfiguredVapid(): void
    {
        $this->sender->configured = false;
        $r = $this->call('GET', '/api/push/run', query: ['key' => self::CRON_KEY], auth: false);
        self::assertSame(503, $r->status);
        self::assertSame(['error' => 'push_not_configured'], $r->data());
    }

    public function testTestPushSendsFixedPayloadToAllSubscriptions(): void
    {
        $this->subscribe(self::A);
        $this->subscribe(self::B);
        $this->addReminder('r1', '2026-05-10 11:00:00');

        $r = $this->call('POST', '/api/push/test');
        self::assertSame(200, $r->status);
        self::assertSame(['sent' => 2, 'failed' => 0, 'removed' => 0], $r->data());
        foreach ($this->sender->sent as $sent) {
            self::assertSame(['title' => 'Checking Sparks', 'body' => 'Test-Benachrichtigung', 'path' => '/'], $sent['payload']);
            self::assertSame(86400, $sent['ttl']);
            self::assertSame('normal', $sent['urgency']);
        }
        self::assertNull($this->reminders()['r1']['sent_at'], 'a test push does not touch reminders');
    }

    public function testTestPushRemovesGoneSubscriptions(): void
    {
        $this->subscribe(self::A);
        $this->sender->results[self::A] = new PushResult(false, true, 410);
        $r = $this->call('POST', '/api/push/test');
        self::assertSame(['sent' => 0, 'failed' => 0, 'removed' => 1], $r->data());
        self::assertSame([], $this->db->all('SELECT 1 FROM subscriptions'));
    }

    public function testTestPushWithoutSubscriptionsIsEmptySuccess(): void
    {
        self::assertSame(['sent' => 0, 'failed' => 0, 'removed' => 0], $this->call('POST', '/api/push/test')->data());
    }

    public function testTestPushNeedsConfiguredVapid(): void
    {
        $this->sender->configured = false;
        self::assertSame(503, $this->call('POST', '/api/push/test')->status);
    }
}
