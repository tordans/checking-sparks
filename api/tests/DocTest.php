<?php

declare(strict_types=1);

namespace CheckingSparks\Api\Tests;

use CheckingSparks\Api\Tests\Support\ApiTestCase;

final class DocTest extends ApiTestCase
{
    public function testGetWithoutDocIs404(): void
    {
        $r = $this->call('GET', '/api/doc');
        self::assertSame(404, $r->status);
        self::assertSame(['error' => 'not_found'], $r->data());
    }

    public function testPutWithoutPreconditionIs428(): void
    {
        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope()]);
        self::assertSame(428, $r->status);
        self::assertSame(['error' => 'precondition_required'], $r->data());
        self::assertSame(404, $this->call('GET', '/api/doc')->status, 'nothing stored');
    }

    public function testPutWithOtherIfNoneMatchValueIs428(): void
    {
        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope()], ['If-None-Match' => '"1"']);
        self::assertSame(428, $r->status);
    }

    public function testCreateWithIfNoneMatchStar(): void
    {
        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope()], ['If-None-Match' => '*']);
        self::assertSame(200, $r->status);
        self::assertSame(['version' => 1], $r->data());

        $get = $this->call('GET', '/api/doc');
        self::assertSame(200, $get->status);
        self::assertSame(['version' => 1, 'envelope' => $this->envelope()], $get->data());
    }

    public function testCreateWhenDocExistsIs409WithCurrentDoc(): void
    {
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('one')], ['If-None-Match' => '*']);
        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('two')], ['If-None-Match' => '*']);
        self::assertSame(409, $r->status);
        self::assertSame(['version' => 1, 'envelope' => $this->envelope('one')], $r->data());
    }

    public function testUpdateWithMatchingIfMatchIncrementsVersion(): void
    {
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('one')], ['If-None-Match' => '*']);

        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('two')], ['If-Match' => '"1"']);
        self::assertSame(200, $r->status);
        self::assertSame(['version' => 2], $r->data());

        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('three')], ['If-Match' => '"2"']);
        self::assertSame(['version' => 3], $r->data());

        self::assertSame(['version' => 3, 'envelope' => $this->envelope('three')], $this->call('GET', '/api/doc')->data());
    }

    public function testStaleIfMatchIs409WithCurrentDocAndKeepsData(): void
    {
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('one')], ['If-None-Match' => '*']);
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('two')], ['If-Match' => '"1"']);

        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('mine')], ['If-Match' => '"1"']);
        self::assertSame(409, $r->status);
        self::assertSame(['version' => 2, 'envelope' => $this->envelope('two')], $r->data());
        self::assertSame($this->envelope('two'), $this->data($this->call('GET', '/api/doc'))['envelope']);
    }

    public function testIfMatchStarAndGarbageAreConflicts(): void
    {
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('one')], ['If-None-Match' => '*']);
        // Only the quoted form the client sends counts; others (also W/"1" and a bare 1) are stale.
        foreach (['*', 'garbage', '"0"', '1', 'W/"1"'] as $value) {
            $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('x')], ['If-Match' => $value]);
            self::assertSame(409, $r->status, $value);
            self::assertSame(['version' => 1, 'envelope' => $this->envelope('one')], $r->data());
        }
    }

    public function testIfMatchWithoutDocIs404(): void
    {
        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope()], ['If-Match' => '"1"']);
        self::assertSame(404, $r->status);
    }

    public function testLargeEnvelopeNearTheLimitIsStored(): void
    {
        $big = str_repeat('A', 1_900_000);
        $r = $this->call('PUT', '/api/doc', ['envelope' => ['v' => 1, 'data' => $big]], ['If-None-Match' => '*']);
        self::assertSame(200, $r->status);
        self::assertSame($big, $this->data($this->call('GET', '/api/doc'))['envelope']['data']);
    }

    public function testMalformedJsonIs400(): void
    {
        self::assertSame(400, $this->call('PUT', '/api/doc', rawBody: 'nope', headers: ['If-None-Match' => '*'])->status);
        self::assertSame(400, $this->call('PUT', '/api/doc', rawBody: '', headers: ['If-None-Match' => '*'])->status);
    }

    public function testInvalidEnvelopeIs422(): void
    {
        foreach ([[], ['envelope' => null], ['envelope' => ''], ['envelope' => 5], ['envelope' => 'string'], ['envelope' => [1, 2]], ['envelope' => []], ['envelope' => (object) []], ['other' => 'x']] as $body) {
            $r = $this->call('PUT', '/api/doc', rawBody: json_encode($body), headers: ['If-None-Match' => '*']);
            self::assertSame(422, $r->status, json_encode($body));
            self::assertSame(['error' => 'invalid_envelope'], $r->data());
        }
        self::assertSame(422, $this->call('PUT', '/api/doc', rawBody: '[1,2]', headers: ['If-None-Match' => '*'])->status);
    }

    public function testUpdatedAtIsStoredInUtc(): void
    {
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope()], ['If-None-Match' => '*']);
        self::assertSame('2026-05-10 12:00:00', $this->db->one('SELECT updated_at FROM doc WHERE id = 1')['updated_at']);
    }

    public function testResponsesNeverEchoTheRequestBody(): void
    {
        $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('stored')], ['If-None-Match' => '*']);
        $r = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('SECRET-PAYLOAD')], ['If-Match' => '"9"']);
        self::assertSame(409, $r->status);
        self::assertStringNotContainsString('SECRET-PAYLOAD', $r->body);
        $ok = $this->call('PUT', '/api/doc', ['envelope' => $this->envelope('SECRET-PAYLOAD')], ['If-Match' => '"1"']);
        self::assertStringNotContainsString('SECRET-PAYLOAD', $ok->body);
    }
}
