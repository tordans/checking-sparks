<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Tests\Support\ApiTestCase;

final class RemindersTest extends ApiTestCase
{
    /** @return array<string, string> */
    private function reminder(string $id = 'c1:2026-06-01:book-open:2026-04-20', string $at = '2026-05-20T09:00:00+02:00'): array
    {
        return ['id' => $id, 'at' => $at, 'title' => 'Lena: Zahnarzt buchen', 'body' => 'Termin bis 31.03. machen.', 'path' => '/person/p1/vorsorge/c1'];
    }

    /** @return list<array<string, mixed>> */
    private function rows(): array
    {
        return $this->db->all('SELECT id, due_at, title, body, path, sent_at, skipped FROM reminders ORDER BY id');
    }

    public function testStoresRemindersWithUtcTime(): void
    {
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder()]]);
        self::assertSame(200, $r->status);
        self::assertSame(['count' => 1], $r->data());

        $rows = $this->rows();
        self::assertCount(1, $rows);
        self::assertSame('2026-05-20 07:00:00', $rows[0]['due_at']);
        self::assertNull($rows[0]['sent_at']);
        self::assertSame('Lena: Zahnarzt buchen', $rows[0]['title']);
        self::assertSame('/person/p1/vorsorge/c1', $rows[0]['path']);
    }

    public function testEmptyListClearsPending(): void
    {
        $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder()]]);
        $r = $this->call('PUT', '/api/reminders', ['reminders' => []]);
        self::assertSame(['count' => 0], $r->data());
        self::assertSame([], $this->rows());
    }

    public function testReplacesAllUnsentReminders(): void
    {
        $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a'), $this->reminder('b')]]);
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('b', '2026-06-01T09:00:00Z'), $this->reminder('c')]]);
        self::assertSame(['count' => 2], $r->data());

        $rows = $this->rows();
        self::assertSame(['b', 'c'], array_column($rows, 'id'));
        self::assertSame('2026-06-01 09:00:00', $rows[0]['due_at'], 'b was replaced with the new time');
    }

    public function testSentRemindersAreKeptAndNotReinserted(): void
    {
        $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a'), $this->reminder('b')]]);
        $this->db->run("UPDATE reminders SET sent_at = '2026-05-09 08:00:00' WHERE id = 'a'");

        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a'), $this->reminder('c')]]);
        self::assertSame(['count' => 1], $r->data(), 'a is already sent and skipped, b is gone, c is new');

        $rows = $this->rows();
        self::assertSame(['a', 'c'], array_column($rows, 'id'));
        self::assertSame('2026-05-09 08:00:00', $rows[0]['sent_at']);
        self::assertNull($rows[1]['sent_at']);
    }

    public function testSkippedRemindersAreAlsoNotReinserted(): void
    {
        $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a')]]);
        $this->db->run("UPDATE reminders SET sent_at = '2026-05-09 08:00:00', skipped = 1 WHERE id = 'a'");
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a')]]);
        self::assertSame(['count' => 0], $r->data());
        self::assertSame('1', (string) $this->rows()[0]['skipped']);
    }

    public function testOldSentRemindersArePruned(): void
    {
        $this->addReminder('old', '2026-03-01 09:00:00');
        $this->addReminder('recent', '2026-05-01 09:00:00');
        $this->db->run("UPDATE reminders SET sent_at = '2026-03-01 09:05:00' WHERE id = 'old'");
        $this->db->run("UPDATE reminders SET sent_at = '2026-05-01 09:05:00' WHERE id = 'recent'");
        $this->call('PUT', '/api/reminders', ['reminders' => []]);
        self::assertSame(['recent'], array_column($this->rows(), 'id'));
    }

    public function testDuplicateIdsInOneRequestAreStoredOnce(): void
    {
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a'), $this->reminder('a', '2027-01-01T00:00:00Z')]]);
        self::assertSame(['count' => 1], $r->data());
        self::assertSame('2026-05-20 07:00:00', $this->rows()[0]['due_at'], 'first one wins');
    }

    public function testInvalidRequestLeavesExistingPlanUntouched(): void
    {
        $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('a')]]);
        $bad = $this->reminder('b');
        $bad['at'] = 'tomorrow';
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$this->reminder('c'), $bad]]);
        self::assertSame(422, $r->status);
        self::assertSame(['error' => 'invalid_reminder', 'index' => 1, 'field' => 'at'], $r->data());
        self::assertSame(['a'], array_column($this->rows(), 'id'));
    }

    public function testRejectsMoreThan2000Reminders(): void
    {
        $many = [];
        for ($i = 0; $i < 2001; $i++) {
            $many[] = ['id' => "r$i", 'at' => '2026-06-01T09:00:00Z', 'title' => 't', 'body' => '', 'path' => '/'];
        }
        $r = $this->call('PUT', '/api/reminders', ['reminders' => $many]);
        self::assertSame(422, $r->status);
        self::assertSame('too_many_reminders', $this->data($r)['error']);
        self::assertSame([], $this->rows());

        $r = $this->call('PUT', '/api/reminders', ['reminders' => array_slice($many, 0, 2000)]);
        self::assertSame(['count' => 2000], $r->data());
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function invalidReminders(): iterable
    {
        $ok = ['id' => 'a', 'at' => '2026-06-01T09:00:00+02:00', 'title' => 'T', 'body' => 'B', 'path' => '/p'];
        yield 'missing id' => [array_diff_key($ok, ['id' => 1]), 'id'];
        yield 'empty id' => [['id' => ''] + $ok, 'id'];
        yield 'numeric id' => [['id' => 5] + $ok, 'id'];
        yield 'long id' => [['id' => str_repeat('x', 201)] + $ok, 'id'];
        yield 'control char id' => [['id' => "a\nb"] + $ok, 'id'];
        yield 'no offset' => [['at' => '2026-06-01T09:00:00'] + $ok, 'at'];
        yield 'date only' => [['at' => '2026-06-01'] + $ok, 'at'];
        yield 'month 13' => [['at' => '2026-13-01T09:00:00Z'] + $ok, 'at'];
        yield 'feb 30' => [['at' => '2026-02-30T09:00:00Z'] + $ok, 'at'];
        yield 'number at' => [['at' => 1780000000] + $ok, 'at'];
        yield 'empty title' => [['title' => ''] + $ok, 'title'];
        yield 'long title' => [['title' => str_repeat('t', 121)] + $ok, 'title'];
        yield 'null body' => [['body' => null] + $ok, 'body'];
        yield 'long body' => [['body' => str_repeat('b', 401)] + $ok, 'body'];
        yield 'relative path' => [['path' => 'person/1'] + $ok, 'path'];
        yield 'protocol-relative path' => [['path' => '//evil.example/x'] + $ok, 'path'];
        yield 'url path' => [['path' => 'https://evil.example'] + $ok, 'path'];
        yield 'empty path' => [['path' => ''] + $ok, 'path'];
        yield 'extra field' => [$ok + ['sent_at' => '2020-01-01'], 'sent_at'];
    }

    /** @param array<string, mixed> $item */
    #[\PHPUnit\Framework\Attributes\DataProvider('invalidReminders')]
    public function testValidatesShapeStrictly(array $item, string $field): void
    {
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [$item]]);
        self::assertSame(422, $r->status);
        self::assertSame(['error' => 'invalid_reminder', 'index' => 0, 'field' => $field], $r->data());
    }

    public function testRejectsBadEnvelopeShapes(): void
    {
        foreach (['[]', '{}', '{"reminders":{}}', '{"reminders":"x"}', '{"reminders":[],"extra":1}', '{"reminders":[1]}', '{"reminders":[[]]}', '"x"'] as $raw) {
            $r = $this->call('PUT', '/api/reminders', rawBody: $raw);
            self::assertSame(422, $r->status, $raw);
        }
        self::assertSame(400, $this->call('PUT', '/api/reminders', rawBody: '{nope')->status);
    }

    public function testAcceptsZuluAndFractionalSeconds(): void
    {
        $r = $this->call('PUT', '/api/reminders', ['reminders' => [
            $this->reminder('z', '2026-06-01T09:00Z'),
            $this->reminder('f', '2026-06-01T09:00:00.250-05:00'),
        ]]);
        self::assertSame(['count' => 2], $r->data());
        self::assertSame(['2026-06-01 14:00:00', '2026-06-01 09:00:00'], array_column($this->rows(), 'due_at'));
    }

    public function testUnicodeTextRoundTrips(): void
    {
        $item = $this->reminder();
        $item['title'] = 'Jörg: Zähne – prüfen ✓';
        $this->call('PUT', '/api/reminders', ['reminders' => [$item]]);
        self::assertSame('Jörg: Zähne – prüfen ✓', $this->rows()[0]['title']);
    }
}
