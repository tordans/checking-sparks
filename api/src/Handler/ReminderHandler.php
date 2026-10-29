<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Handler;

use Closure;
use CheckingSparks\Api\Db;
use CheckingSparks\Api\HttpException;
use CheckingSparks\Api\Request;
use CheckingSparks\Api\Response;

/** Replaces the plan of future, unsent reminders. */
final class ReminderHandler
{
    public const MAX_REMINDERS = 2000;
    public const MAX_ID = 200;
    public const MAX_TITLE = 120;
    public const MAX_BODY = 400;
    public const MAX_PATH = 300;
    /** Sent or skipped reminders are kept this long so a late plan cannot re-add them, then pruned. */
    public const KEEP_SENT = '-30 days';

    private const FIELDS = ['id', 'at', 'title', 'body', 'path'];

    /** @param Closure(): \DateTimeImmutable $clock */
    public function __construct(private readonly Db $db, private readonly Closure $clock)
    {
    }

    public function replace(Request $request): Response
    {
        // Decoded as objects so that {} (not a list) can be told apart from [].
        $body = $request->json(false);
        if (!$body instanceof \stdClass || array_keys((array) $body) !== ['reminders'] || !is_array($body->reminders)) {
            throw new HttpException(422, 'invalid_body');
        }
        $items = $body->reminders;
        if (count($items) > self::MAX_REMINDERS) {
            throw new HttpException(422, 'too_many_reminders', ['max' => self::MAX_REMINDERS]);
        }

        $rows = [];
        foreach ($items as $index => $item) {
            $rows[] = $this->validate($item, $index);
        }

        $now = ($this->clock)();
        $count = $this->db->transaction(function () use ($rows, $now): int {
            $this->db->run('DELETE FROM reminders WHERE sent_at IS NULL');
            $this->db->run('DELETE FROM reminders WHERE sent_at < ?', [Db::format($now->modify(self::KEEP_SENT))]);

            // What is left now has been sent (or skipped): never re-add it.
            $known = array_flip(array_column($this->db->all('SELECT id FROM reminders'), 'id'));
            $count = 0;
            foreach ($rows as $row) {
                if (isset($known[$row['id']])) {
                    continue;
                }
                $known[$row['id']] = true;
                $this->db->run(
                    'INSERT INTO reminders (id, due_at, title, body, path, sent_at, skipped) VALUES (?, ?, ?, ?, ?, NULL, 0)',
                    [$row['id'], $row['due_at'], $row['title'], $row['body'], $row['path']],
                );
                $count++;
            }

            return $count;
        });

        return Response::json(200, ['count' => $count]);
    }

    /** @return array{id: string, due_at: string, title: string, body: string, path: string} */
    private function validate(mixed $item, int $index): array
    {
        $invalid = static fn (string $field): HttpException => new HttpException(422, 'invalid_reminder', ['index' => $index, 'field' => $field]);

        if (!$item instanceof \stdClass) {
            throw $invalid('reminder');
        }
        $item = (array) $item;
        foreach (array_keys($item) as $key) {
            if (!in_array($key, self::FIELDS, true)) {
                throw $invalid((string) $key);
            }
        }
        foreach (self::FIELDS as $field) {
            if (!isset($item[$field]) || !is_string($item[$field])) {
                throw $invalid($field);
            }
        }

        if ($item['id'] === '' || mb_strlen($item['id']) > self::MAX_ID || preg_match('/[\x00-\x1F\x7F]/', $item['id']) === 1) {
            throw $invalid('id');
        }
        $at = self::parseAt($item['at']);
        if ($at === null) {
            throw $invalid('at');
        }
        if ($item['title'] === '' || mb_strlen($item['title']) > self::MAX_TITLE) {
            throw $invalid('title');
        }
        if (mb_strlen($item['body']) > self::MAX_BODY) {
            throw $invalid('body');
        }
        if ($item['path'] === '' || mb_strlen($item['path']) > self::MAX_PATH || !str_starts_with($item['path'], '/') || str_starts_with($item['path'], '//')) {
            throw $invalid('path');
        }
        foreach (['title', 'body', 'path'] as $field) {
            if (!mb_check_encoding($item[$field], 'UTF-8')) {
                throw $invalid($field);
            }
        }

        return [
            'id' => $item['id'],
            'due_at' => Db::format($at),
            'title' => $item['title'],
            'body' => $item['body'],
            'path' => $item['path'],
        ];
    }

    /** ISO 8601 datetime with an explicit offset or Z. */
    public static function parseAt(string $value): ?\DateTimeImmutable
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/', $value) !== 1) {
            return null;
        }
        try {
            $date = new \DateTimeImmutable($value);
        } catch (\Exception) {
            return null;
        }
        $errors = \DateTimeImmutable::getLastErrors();
        if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
            return null;
        }
        $year = (int) $date->setTimezone(new \DateTimeZone('UTC'))->format('Y');

        return $year >= 2000 && $year <= 2200 ? $date : null;
    }
}
