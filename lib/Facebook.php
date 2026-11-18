<?php
declare(strict_types=1);

final class Facebook
{
    private static function url(string $path, array $query = []): string
    {
        $base = 'https://graph.facebook.com/' . GRAPH_VERSION . '/' . ltrim($path, '/');
        if ($query) {
            $base .= '?' . http_build_query($query);
        }
        return $base;
    }

    private static function request(string $method, string $url, array $fields = [], bool $multipart = false): array
    {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 120,
        ];
        if ($method === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = $multipart ? $fields : http_build_query($fields);
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException('Facebook could not be reached. ' . $err);
        }
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            throw new RuntimeException('Facebook returned an unreadable answer.');
        }
        if ($code >= 400 || isset($payload['error'])) {
            $message = (string) ($payload['error']['message'] ?? 'Facebook refused the request.');
            throw new RuntimeException(public_error($message), $code ?: 502);
        }
        return $payload;
    }

    public static function exchangeCode(string $appId, string $secret, string $code, string $redirect): string
    {
        $short = self::request('GET', self::url('oauth/access_token', [
            'client_id' => $appId,
            'client_secret' => $secret,
            'redirect_uri' => $redirect,
            'code' => $code,
        ]));
        $token = (string) ($short['access_token'] ?? '');
        if ($token === '') {
            throw new RuntimeException('Facebook did not return a login token.');
        }
        $long = self::request('GET', self::url('oauth/access_token', [
            'grant_type' => 'fb_exchange_token',
            'client_id' => $appId,
            'client_secret' => $secret,
            'fb_exchange_token' => $token,
        ]));
        $extended = (string) ($long['access_token'] ?? '');
        return $extended !== '' ? $extended : $token;
    }

    public static function pages(string $userToken): array
    {
        $payload = self::request('GET', self::url('me/accounts', [
            'fields' => 'id,name,access_token',
            'limit' => 50,
            'access_token' => $userToken,
        ]));
        $pages = [];
        foreach ($payload['data'] ?? [] as $page) {
            if (empty($page['id']) || empty($page['access_token'])) {
                continue;
            }
            $pages[] = [
                'id' => (string) $page['id'],
                'name' => (string) ($page['name'] ?? 'Page'),
                'token' => (string) $page['access_token'],
            ];
        }
        return $pages;
    }

    public static function page(string $pageId, string $token): array
    {
        return self::request('GET', self::url($pageId, [
            'fields' => 'id,name,link',
            'access_token' => $token,
        ]));
    }

    public static function publish(string $pageId, string $token, string $caption, ?string $imagePath, ?string $mime): array
    {
        if ($imagePath && is_file($imagePath)) {
            $name = 'post.jpg';
            if (str_contains((string) $mime, 'png')) {
                $name = 'post.png';
            } elseif (str_contains((string) $mime, 'webp')) {
                $name = 'post.webp';
            }
            $payload = self::request('POST', self::url($pageId . '/photos'), [
                'message' => $caption,
                'published' => 'true',
                'access_token' => $token,
                'source' => new CURLFile($imagePath, $mime ?: 'image/jpeg', $name),
            ], true);
        } else {
            $payload = self::request('POST', self::url($pageId . '/feed'), [
                'message' => $caption,
                'access_token' => $token,
            ]);
        }
        $id = (string) ($payload['post_id'] ?? $payload['id'] ?? '');
        if ($id === '') {
            throw new RuntimeException('Facebook did not confirm the post.');
        }
        return [
            'id' => $id,
            'url' => 'https://www.facebook.com/' . $id,
        ];
    }
}
