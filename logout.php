<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
start_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $sent = (string) ($_POST['csrf'] ?? '');
    if ($sent !== '' && hash_equals(csrf_token(), $sent)) {
        Accounts::logout();
    }
}
header('Location: ' . app_origin() . '/');
exit;
