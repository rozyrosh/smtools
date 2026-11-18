<?php
declare(strict_types=1);

const STUDIO_ENV = 'C:/xampp/htdocs/sinhala_studio/.env';
const GRAPH_VERSION = 'v23.0';

function app_root(): string
{
    return dirname(__DIR__);
}

function data_dir(): string
{
    $dir = app_root() . '/data';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}

function image_dir(): string
{
    $dir = app_root() . '/storage/images';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}

function app_base_path(): string
{
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
    $base = rtrim(str_replace('\\', '/', dirname($script)), '/');
    if ($base === '/' || $base === '.' || $base === '') {
        return '';
    }
    return $base;
}

function app_origin(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1';
    return $scheme . '://' . $host . app_base_path();
}

function facebook_redirect_uri(): string
{
    return app_origin() . '/api.php?action=fb_callback';
}

function read_studio_gemini_key(): string
{
    $testFile = data_dir() . '/gemini.test';
    if (is_file($testFile)) {
        $test = trim((string) file_get_contents($testFile));
        if ($test !== '') {
            return $test;
        }
    }
    if (!is_file(STUDIO_ENV)) {
        return '';
    }
    $raw = (string) file_get_contents(STUDIO_ENV);
    if (preg_match('/^GEMINI_API_KEY\s*=\s*"([^"]+)"/m', $raw, $match)) {
        return trim($match[1]);
    }
    if (preg_match("/^GEMINI_API_KEY\s*=\s*'([^']+)'/m", $raw, $match)) {
        return trim($match[1]);
    }
    if (preg_match('/^GEMINI_API_KEY\s*=\s*(\S+)/m', $raw, $match)) {
        return trim($match[1], "\"' ");
    }
    return '';
}

function mask_secret(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    if (strlen($value) < 12) {
        return 'saved';
    }
    return substr($value, 0, 6) . '…' . substr($value, -4);
}

function public_error(string $message): string
{
    $message = preg_replace('/(access_token|client_secret|api_key|key)=([^&\s]+)/i', '$1=***', $message) ?? $message;
    $message = preg_replace('/AQ\.[A-Za-z0-9_\-]{8,}/', '***', $message) ?? $message;
    $message = preg_replace('/generativelanguage\.googleapis\.com/i', '', $message) ?? $message;
    $message = preg_replace('/\bgemini\b/i', '', $message) ?? $message;
    $message = preg_replace('/\bgoogle\b/i', '', $message) ?? $message;
    $message = trim(preg_replace('/\s+/', ' ', $message) ?? $message);
    if (strlen($message) > 420) {
        $message = substr($message, 0, 420) . '…';
    }
    return $message;
}

function log_line(string $message): void
{
    $line = date('c') . ' ' . public_error($message) . PHP_EOL;
    file_put_contents(data_dir() . '/app.log', $line, FILE_APPEND);
}

function json_out(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'path' => app_base_path() === '' ? '/' : app_base_path(),
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
}

function csrf_token(): string
{
    start_session();
    return (string) $_SESSION['csrf'];
}

function require_csrf(): void
{
    start_session();
    $sent = $_SERVER['HTTP_X_CSRF'] ?? ($_POST['csrf'] ?? '');
    if (!is_string($sent) || !hash_equals((string) $_SESSION['csrf'], $sent)) {
        json_out(['ok' => false, 'error' => 'The page expired. Reload and try again.'], 403);
    }
}

function request_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return $_POST;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function str_limit(string $value, int $max): string
{
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    if (mb_strlen($value) > $max) {
        $value = mb_substr($value, 0, $max);
    }
    return $value;
}

require_once __DIR__ . '/Store.php';
require_once __DIR__ . '/Gemini.php';
require_once __DIR__ . '/Facebook.php';
require_once __DIR__ . '/Desk.php';
require_once __DIR__ . '/Accounts.php';

function ensure_canonical_desk(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($https && str_starts_with($host, 'localhost') && str_contains($script, '/smtools2/')) {
        return;
    }
    $parts = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'));
    $path = (string) ($parts['path'] ?? '/');
    if (!str_starts_with($path, '/smtools2')) {
        $path = '/smtools2' . ($path === '/' ? '/' : $path);
    }
    $target = 'https://localhost' . $path;
    if (!empty($parts['query'])) {
        $target .= '?' . $parts['query'];
    }
    header('Location: ' . $target, true, 302);
    exit;
}

ensure_canonical_desk();
