<?php

declare(strict_types=1);

// Entry point. In the repository this is api/public/index.php; on deploy it is copied to
// public/api/index.php, next to which the code lives in ../../api (see api/README.md).
$root = is_file(__DIR__ . '/../src/bootstrap.php') ? __DIR__ . '/..' : __DIR__ . '/../../api';
(require $root . '/src/bootstrap.php')(__DIR__);
