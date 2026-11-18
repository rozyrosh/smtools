<?php
declare(strict_types=1);

final class Accounts
{
    public static function register(string $name, string $email, string $password): array
    {
        $name = str_limit($name, 60);
        $email = strtolower(trim($email));
        if (mb_strlen($name) < 2) {
            throw new RuntimeException('Add your name.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('That email does not look right.');
        }
        if (strlen($password) < 8) {
            throw new RuntimeException('Use a password of at least 8 characters.');
        }
        $user = Store::transaction(function () use ($name, $email, $password) {
            $accounts = self::readAll();
            foreach ($accounts as $existing) {
                if (strtolower((string) ($existing['email'] ?? '')) === $email) {
                    throw new RuntimeException('That email already has a desk.');
                }
            }
            $id = 'usr_' . bin2hex(random_bytes(6));
            $dir = data_dir() . '/desks/' . $id;
            if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
                throw new RuntimeException('The desk could not be opened.');
            }
            $studio = false;
            if ($accounts === [] && is_file(data_dir() . '/settings.json')) {
                $studio = true;
                self::inheritLegacy($dir);
            }
            $record = [
                'id' => $id,
                'name' => $name,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'studio_key' => $studio,
                'created_at' => date('c'),
            ];
            $accounts[] = $record;
            self::writeAll($accounts);
            return self::publicUser($record);
        });
        self::enter($user['id']);
        return $user;
    }

    public static function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        $found = null;
        foreach (self::readAll() as $account) {
            if (strtolower((string) ($account['email'] ?? '')) === $email) {
                $found = $account;
                break;
            }
        }
        $hash = (string) ($found['password_hash'] ?? '');
        if ($found === null || $hash === '' || !password_verify($password, $hash)) {
            throw new RuntimeException('That email or password does not match.');
        }
        $user = self::publicUser($found);
        self::enter($user['id']);
        return $user;
    }

    public static function logout(): void
    {
        start_session();
        unset($_SESSION['user_id'], $_SESSION['fb_pages'], $_SESSION['fb_oauth_state'], $_SESSION['flash']);
        session_regenerate_id(true);
        Store::bind(null);
    }

    public static function current(): ?array
    {
        start_session();
        $id = (string) ($_SESSION['user_id'] ?? '');
        if (!preg_match('/^usr_[a-f0-9]{12}$/', $id)) {
            return null;
        }
        foreach (self::readAll() as $account) {
            if ((string) ($account['id'] ?? '') === $id) {
                return self::publicUser($account);
            }
        }
        return null;
    }

    public static function requireUser(): array
    {
        $user = self::current();
        if (!$user) {
            header('Location: ' . app_origin() . '/login.php');
            exit;
        }
        Store::bind($user['id']);
        return $user;
    }

    public static function requireApi(): array
    {
        $user = self::current();
        if (!$user) {
            json_out(['ok' => false, 'error' => 'Sign in to use the desk.'], 401);
        }
        Store::bind($user['id']);
        return $user;
    }

    public static function idForCronKey(string $key): string
    {
        if ($key === '') {
            return '';
        }
        $root = data_dir() . '/desks';
        if (!is_dir($root)) {
            return '';
        }
        foreach (scandir($root) ?: [] as $id) {
            if (!preg_match('/^usr_[a-f0-9]{12}$/', $id)) {
                continue;
            }
            $path = $root . '/' . $id . '/settings.json';
            if (!is_file($path)) {
                continue;
            }
            $data = json_decode((string) file_get_contents($path), true);
            $saved = is_array($data) ? (string) ($data['cron_key'] ?? '') : '';
            if ($saved !== '' && hash_equals($saved, $key)) {
                return $id;
            }
        }
        return '';
    }

    public static function legacyWaiting(): bool
    {
        return self::readAll() === [] && is_file(data_dir() . '/settings.json');
    }

    private static function enter(string $id): void
    {
        start_session();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $id;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        unset($_SESSION['fb_pages'], $_SESSION['fb_oauth_state']);
        Store::bind($id);
    }

    private static function publicUser(array $account): array
    {
        return [
            'id' => (string) ($account['id'] ?? ''),
            'name' => (string) ($account['name'] ?? ''),
            'email' => (string) ($account['email'] ?? ''),
            'studio_key' => !empty($account['studio_key']),
        ];
    }

    private static function readAll(): array
    {
        $path = data_dir() . '/accounts.json';
        if (!is_file($path)) {
            return [];
        }
        $data = json_decode((string) file_get_contents($path), true);
        return is_array($data) ? array_values(array_filter($data, 'is_array')) : [];
    }

    private static function writeAll(array $accounts): void
    {
        $path = data_dir() . '/accounts.json';
        $json = json_encode(array_values($accounts), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($json === false) {
            throw new RuntimeException('The account could not be saved.');
        }
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $json) === false) {
            throw new RuntimeException('The account could not be saved.');
        }
        if (is_file($path)) {
            unlink($path);
        }
        if (!rename($tmp, $path)) {
            throw new RuntimeException('The account could not be saved.');
        }
    }

    private static function inheritLegacy(string $dir): void
    {
        $settingsPath = data_dir() . '/settings.json';
        $topicsPath = data_dir() . '/topics.json';
        if (is_file($settingsPath)) {
            $raw = json_decode((string) file_get_contents($settingsPath), true);
            if (!is_array($raw)) {
                $raw = [];
            }
            $raw['allow_studio_key'] = true;
            $json = json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            if ($json === false || file_put_contents($dir . '/settings.json', $json) === false) {
                throw new RuntimeException('The existing desk could not be kept.');
            }
            unlink($settingsPath);
        }
        if (is_file($topicsPath) && !rename($topicsPath, $dir . '/topics.json')) {
            throw new RuntimeException('The existing queue could not be kept.');
        }
    }
}
