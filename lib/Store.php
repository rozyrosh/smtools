<?php
declare(strict_types=1);

final class Store
{
    private static ?string $scope = null;

    public static function bind(?string $userId): void
    {
        if ($userId !== null && !preg_match('/^usr_[a-f0-9]{12}$/', $userId)) {
            throw new RuntimeException('That account is not valid.');
        }
        self::$scope = $userId;
    }

    private static function lock()
    {
        $fp = fopen(data_dir() . '/store.lock', 'c');
        if ($fp === false) {
            throw new RuntimeException('The desk could not open its notes.');
        }
        if (!flock($fp, LOCK_EX)) {
            fclose($fp);
            throw new RuntimeException('The desk is busy. Try again.');
        }
        return $fp;
    }

    private static function unlock($fp): void
    {
        flock($fp, LOCK_UN);
        fclose($fp);
    }

    private static function path(string $name): string
    {
        if (self::$scope === null) {
            throw new RuntimeException('Sign in before using the desk.');
        }
        $dir = data_dir() . '/desks/' . self::$scope;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('The desk could not be opened.');
        }
        return $dir . '/' . $name . '.json';
    }

    public static function read(string $name, array $default): array
    {
        $path = self::path($name);
        if (!is_file($path)) {
            return $default;
        }
        $data = json_decode((string) file_get_contents($path), true);
        return is_array($data) ? $data : $default;
    }

    public static function write(string $name, array $data): void
    {
        $path = self::path($name);
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($json === false) {
            throw new RuntimeException('The desk could not save that.');
        }
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $json) === false) {
            throw new RuntimeException('The desk could not save that.');
        }
        if (is_file($path)) {
            unlink($path);
        }
        if (!rename($tmp, $path)) {
            throw new RuntimeException('The desk could not save that.');
        }
    }

    public static function transaction(callable $fn)
    {
        $fp = self::lock();
        try {
            return $fn();
        } finally {
            self::unlock($fp);
        }
    }

    public static function settings(): array
    {
        $settings = self::read('settings', []);
        $defaults = [
            'gemini_api_key' => '',
            'fb_app_id' => '',
            'fb_app_secret' => '',
            'fb_page_id' => '',
            'fb_page_name' => '',
            'fb_page_token' => '',
            'page_voice' => '',
            'language' => 'Sinhala',
            'tone' => 'Friendly',
            'style' => 'Photograph',
            'cron_key' => '',
            'allow_studio_key' => false,
        ];
        $settings = array_merge($defaults, $settings);
        if ($settings['cron_key'] === '') {
            $settings['cron_key'] = bin2hex(random_bytes(16));
            self::write('settings', $settings);
        }
        return $settings;
    }

    public static function save_settings(array $settings): void
    {
        self::write('settings', $settings);
    }

    public static function gemini_key(): array
    {
        $studio = read_studio_gemini_key();
        if ($studio !== '') {
            return ['key' => $studio, 'source' => 'house'];
        }
        return ['key' => '', 'source' => ''];
    }

    public static function topics(): array
    {
        $topics = self::read('topics', []);
        return array_values(array_filter($topics, 'is_array'));
    }

    public static function save_topics(array $topics): void
    {
        self::write('topics', array_values($topics));
    }

    public static function find_topic(string $id): ?array
    {
        foreach (self::topics() as $topic) {
            if (($topic['id'] ?? '') === $id) {
                return $topic;
            }
        }
        return null;
    }
}
