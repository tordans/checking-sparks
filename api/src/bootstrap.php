<?php

declare(strict_types=1);

/**
 * Shared bootstrap for the web entry. Finds the api root (the folder with src/, vendor/,
 * migrations/) in both layouts and runs the app.
 *
 *   repository:  api/public/index.php            -> api root = api/
 *   deployed:    check/public/api/index.php      -> api root = check/api/
 */

use CheckingSparks\Api\App;
use CheckingSparks\Api\Config;
use CheckingSparks\Api\Logger;
use CheckingSparks\Api\Request;
use CheckingSparks\Api\Response;

return static function (string $entryDir): void {
    $apiRoot = is_dir($entryDir . '/../src') ? realpath($entryDir . '/..') : realpath($entryDir . '/../../api');
    if ($apiRoot === false || !is_file($apiRoot . '/vendor/autoload.php')) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo '{"error":"internal_error"}';
        error_log('Checking Sparks API: vendor/autoload.php not found');

        return;
    }
    require $apiRoot . '/vendor/autoload.php';

    try {
        $config = Config::fromFile(Config::locate($apiRoot));
        $response = App::fromConfig($config, $apiRoot)->handle(Request::fromGlobals());
    } catch (Throwable $e) {
        (new Logger())->exception($e);
        $response = Response::json(500, ['error' => 'internal_error'], ['Cache-Control' => 'no-store']);
    }
    $response->send();
};
