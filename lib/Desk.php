<?php
declare(strict_types=1);

final class Desk
{
    public static function publicState(): array
    {
        $settings = Store::settings();
        $gemini = Store::gemini_key();
        start_session();
        $pending = [];
        foreach ($_SESSION['fb_pages'] ?? [] as $page) {
            $pending[] = ['id' => $page['id'], 'name' => $page['name']];
        }
        $flash = (string) ($_SESSION['flash'] ?? '');
        unset($_SESSION['flash']);
        $topics = array_map([self::class, 'publicTopic'], Store::topics());
        usort($topics, function ($a, $b) {
            return strcmp($b['created_at'], $a['created_at']);
        });
        return [
            'ok' => true,
            'gemini' => [
                'ready' => $gemini['key'] !== '',
            ],
            'facebook' => [
                'app_id' => $settings['fb_app_id'],
                'has_secret' => $settings['fb_app_secret'] !== '',
                'page_id' => $settings['fb_page_id'],
                'page_name' => $settings['fb_page_name'],
                'connected' => $settings['fb_page_id'] !== '' && $settings['fb_page_token'] !== '' && $settings['fb_page_name'] !== '',
                'redirect_uri' => facebook_redirect_uri(),
            ],
            'page_voice' => $settings['page_voice'],
            'defaults' => [
                'language' => $settings['language'],
                'tone' => $settings['tone'],
                'style' => $settings['style'],
            ],
            'pending_pages' => $pending,
            'cron_url' => app_origin() . '/api.php?action=run_next&key=' . rawurlencode($settings['cron_key']),
            'flash' => $flash,
            'topics' => $topics,
        ];
    }

    public static function publicTopic(array $topic): array
    {
        $id = (string) ($topic['id'] ?? '');
        $hasImage = $id !== '' && is_file(self::imagePath($id));
        $postId = (string) ($topic['fb_post_id'] ?? '');
        return [
            'id' => $id,
            'title' => (string) ($topic['title'] ?? ''),
            'about' => (string) ($topic['about'] ?? ''),
            'language' => (string) ($topic['language'] ?? ''),
            'tone' => (string) ($topic['tone'] ?? ''),
            'style' => (string) ($topic['style'] ?? ''),
            'status' => (string) ($topic['status'] ?? 'queued'),
            'caption' => (string) ($topic['caption'] ?? ''),
            'image_prompt' => (string) ($topic['image_prompt'] ?? ''),
            'image_url' => $hasImage ? 'api.php?action=image&id=' . rawurlencode($id) : '',
            'error' => (string) ($topic['error'] ?? ''),
            'fb_post_id' => $postId,
            'fb_url' => (string) ($topic['fb_url'] ?? ''),
            'autopost' => !empty($topic['autopost']),
            'schedule' => (string) ($topic['schedule'] ?? 'once'),
            'time' => (string) ($topic['time'] ?? ''),
            'weekday' => (int) ($topic['weekday'] ?? 1),
            'monthday' => (int) ($topic['monthday'] ?? 1),
            'schedule_label' => self::scheduleLabel($topic),
            'due' => self::isDue($topic),
            'created_at' => (string) ($topic['created_at'] ?? ''),
            'posted_at' => (string) ($topic['posted_at'] ?? ''),
        ];
    }

    public static function imagePath(string $id): string
    {
        return image_dir() . '/' . $id . '.img';
    }

    public static function saveConnection(array $input): array
    {
        return Store::transaction(function () use ($input) {
            $settings = Store::settings();
            $appId = trim((string) ($input['app_id'] ?? $settings['fb_app_id']));
            $pageId = trim((string) ($input['page_id'] ?? $settings['fb_page_id']));
            $secret = trim((string) ($input['app_secret'] ?? ''));
            $token = trim((string) ($input['page_token'] ?? ''));
            $voice = trim((string) ($input['page_voice'] ?? $settings['page_voice']));
            if ($secret !== '') {
                $settings['fb_app_secret'] = $secret;
            }
            if ($token !== '') {
                $settings['fb_page_token'] = $token;
            }
            $settings['fb_app_id'] = $appId;
            $settings['fb_page_id'] = preg_replace('/\D/', '', $pageId) ?: $pageId;
            $settings['page_voice'] = str_limit($voice, 800);
            if (!empty($input['language'])) {
                $settings['language'] = str_limit((string) $input['language'], 40);
            }
            if (!empty($input['tone'])) {
                $settings['tone'] = str_limit((string) $input['tone'], 40);
            }
            if (!empty($input['style'])) {
                $settings['style'] = str_limit((string) $input['style'], 40);
            }
            if ($settings['fb_page_id'] !== '' && $settings['fb_page_token'] !== '') {
                try {
                    $page = Facebook::page($settings['fb_page_id'], $settings['fb_page_token']);
                    $settings['fb_page_name'] = (string) ($page['name'] ?? 'Page');
                    $settings['fb_page_id'] = (string) ($page['id'] ?? $settings['fb_page_id']);
                } catch (Throwable $e) {
                    $settings['fb_page_name'] = '';
                    Store::save_settings($settings);
                    throw $e;
                }
            }
            Store::save_settings($settings);
            return self::publicState();
        });
    }

    public static function disconnect(): void
    {
        Store::transaction(function () {
            $settings = Store::settings();
            $settings['fb_page_id'] = '';
            $settings['fb_page_name'] = '';
            $settings['fb_page_token'] = '';
            Store::save_settings($settings);
        });
    }

    public static function addTopic(array $input, bool $postNow): array
    {
        $title = str_limit((string) ($input['title'] ?? ''), 160);
        $about = trim((string) ($input['about'] ?? ''));
        if (mb_strlen($about) > 2000) {
            $about = mb_substr($about, 0, 2000);
        }
        if (mb_strlen($title) < 2) {
            throw new RuntimeException('Add a title.');
        }
        if (mb_strlen($about) < 2) {
            throw new RuntimeException('Add a short description of what the post is about.');
        }
        $schedule = (string) ($input['schedule'] ?? 'once');
        if (!in_array($schedule, ['once', 'daily', 'weekly', 'monthly'], true)) {
            $schedule = 'once';
        }
        $time = (string) ($input['time'] ?? '');
        if ($schedule !== 'once' && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time)) {
            throw new RuntimeException('Set a time for this repeat.');
        }
        $repeating = $schedule !== 'once';
        $topic = [
            'id' => 'top_' . bin2hex(random_bytes(6)),
            'title' => $title,
            'about' => $about,
            'language' => str_limit((string) ($input['language'] ?? 'Sinhala'), 40),
            'tone' => str_limit((string) ($input['tone'] ?? 'Friendly'), 40),
            'style' => str_limit((string) ($input['style'] ?? 'Photograph'), 40),
            'schedule' => $schedule,
            'time' => $repeating ? $time : '',
            'weekday' => max(1, min(7, (int) ($input['weekday'] ?? 1))),
            'monthday' => max(1, min(28, (int) ($input['monthday'] ?? 1))),
            'last_slot' => '',
            'fail_slot' => '',
            'autopost' => !$repeating && ($postNow || !empty($input['autopost'])),
            'status' => $repeating ? 'scheduled' : 'queued',
            'caption' => '',
            'image_prompt' => '',
            'error' => '',
            'fb_post_id' => '',
            'fb_url' => '',
            'attempts' => 0,
            'created_at' => date('c'),
            'updated_at' => date('c'),
            'posted_at' => '',
        ];
        Store::transaction(function () use ($topic) {
            $topics = Store::topics();
            array_unshift($topics, $topic);
            Store::save_topics($topics);
            $settings = Store::settings();
            $settings['language'] = $topic['language'];
            $settings['tone'] = $topic['tone'];
            $settings['style'] = $topic['style'];
            Store::save_settings($settings);
        });
        if ($postNow && !$repeating) {
            return self::generate($topic['id'], true);
        }
        return self::publicTopic(Store::find_topic($topic['id']) ?? $topic);
    }

    public static function updateCaption(string $id, string $caption): array
    {
        $caption = trim($caption);
        if (mb_strlen($caption) < 2) {
            throw new RuntimeException('The caption is empty.');
        }
        if (mb_strlen($caption) > 6000) {
            $caption = mb_substr($caption, 0, 6000);
        }
        return Store::transaction(function () use ($id, $caption) {
            $topics = Store::topics();
            $found = false;
            foreach ($topics as &$topic) {
                if (($topic['id'] ?? '') !== $id) {
                    continue;
                }
                if (($topic['status'] ?? '') === 'posted') {
                    throw new RuntimeException('That post is already on the page.');
                }
                $topic['caption'] = $caption;
                $topic['updated_at'] = date('c');
                $found = $topic;
                break;
            }
            unset($topic);
            if (!$found) {
                throw new RuntimeException('That topic is no longer in the queue.');
            }
            Store::save_topics($topics);
            return self::publicTopic($found);
        });
    }

    public static function deleteTopic(string $id): void
    {
        Store::transaction(function () use ($id) {
            $topics = array_values(array_filter(Store::topics(), function ($topic) use ($id) {
                return ($topic['id'] ?? '') !== $id;
            }));
            Store::save_topics($topics);
        });
        $path = self::imagePath($id);
        if (is_file($path)) {
            unlink($path);
        }
        if (is_file($path . '.type')) {
            unlink($path . '.type');
        }
    }

    public static function generate(string $id, bool $publish): array
    {
        $claimed = Store::transaction(function () use ($id) {
            return self::claim($id);
        });
        $gemini = Store::gemini_key();
        if ($gemini['key'] === '') {
            self::fail($id, 'Writing is not available right now.');
            throw new RuntimeException('Writing is not available right now.');
        }
        try {
            $settings = Store::settings();
            $written = Gemini::writePost($gemini['key'], $claimed, (string) $settings['page_voice']);
            Store::transaction(function () use ($id, $written) {
                self::patch($id, [
                    'caption' => $written['caption'],
                    'image_prompt' => $written['image_prompt'],
                    'status' => 'writing',
                    'updated_at' => date('c'),
                ]);
            });
            $image = Gemini::makeImage($gemini['key'], $written['image_prompt'], (string) $claimed['style']);
            file_put_contents(self::imagePath($id), $image['bytes']);
            file_put_contents(self::imagePath($id) . '.type', $image['mime']);
            $saved = Store::transaction(function () use ($id, $written) {
                return self::patch($id, [
                    'caption' => $written['caption'],
                    'image_prompt' => $written['image_prompt'],
                    'status' => 'ready',
                    'error' => '',
                    'updated_at' => date('c'),
                ]);
            });
        } catch (Throwable $e) {
            self::fail($id, public_error($e->getMessage()));
            throw new RuntimeException(public_error($e->getMessage()), (int) $e->getCode() ?: 502);
        }
        if ($publish) {
            return self::publish($id);
        }
        return $saved;
    }

    public static function publish(string $id): array
    {
        $topic = Store::find_topic($id);
        if (!$topic) {
            throw new RuntimeException('That topic is no longer in the queue.');
        }
        if (($topic['status'] ?? '') === 'posted' && !self::isRepeating($topic)) {
            return self::publicTopic($topic);
        }
        $caption = trim((string) ($topic['caption'] ?? ''));
        if ($caption === '') {
            throw new RuntimeException('Write the post before publishing it.');
        }
        $settings = Store::settings();
        if ($settings['fb_page_id'] === '' || $settings['fb_page_token'] === '') {
            throw new RuntimeException('Connect a Facebook page before posting.');
        }
        $path = self::imagePath($id);
        if (!is_file($path)) {
            throw new RuntimeException('The picture is not ready yet. Write the post again.');
        }
        $mime = is_file($path . '.type') ? trim((string) file_get_contents($path . '.type')) : 'image/png';
        try {
            $posted = Facebook::publish(
                $settings['fb_page_id'],
                $settings['fb_page_token'],
                $caption,
                is_file($path) ? $path : null,
                $mime
            );
        } catch (Throwable $e) {
            self::fail($id, public_error($e->getMessage()));
            throw new RuntimeException(public_error($e->getMessage()), (int) $e->getCode() ?: 502);
        }
        return Store::transaction(function () use ($id, $posted) {
            $current = null;
            foreach (Store::topics() as $item) {
                if (($item['id'] ?? '') === $id) {
                    $current = $item;
                    break;
                }
            }
            $repeating = is_array($current) && self::isRepeating($current);
            return self::patch($id, [
                'status' => $repeating ? 'scheduled' : 'posted',
                'error' => '',
                'attempts' => 0,
                'fb_post_id' => $posted['id'],
                'fb_url' => $posted['url'],
                'posted_at' => date('c'),
                'updated_at' => date('c'),
                'last_slot' => ($repeating && self::isDue($current)) ? self::slot($current) : (string) ($current['last_slot'] ?? ''),
            ]);
        });
    }

    public static function runDue(): array
    {
        $id = Store::transaction(function () {
            foreach (Store::topics() as $topic) {
                if (self::isDue($topic)) {
                    return (string) $topic['id'];
                }
            }
            return '';
        });
        if ($id === '') {
            return ['ran' => false, 'topic' => null];
        }
        return ['ran' => true, 'topic' => self::generate($id, true)];
    }

    public static function runNext(): array
    {
        $id = Store::transaction(function () {
            $now = time();
            foreach (Store::topics() as $topic) {
                if (empty($topic['autopost'])) {
                    continue;
                }
                $status = (string) ($topic['status'] ?? '');
                $updated = strtotime((string) ($topic['updated_at'] ?? '')) ?: 0;
                $stale = $status === 'writing' && ($now - $updated) > 240;
                $attempts = (int) ($topic['attempts'] ?? 0);
                if ($status === 'queued' || $status === 'ready' || ($status === 'failed' && $attempts < 3) || $stale) {
                    return (string) $topic['id'];
                }
            }
            return '';
        });
        if ($id === '') {
            return ['ran' => false, 'topic' => null];
        }
        $topic = Store::find_topic($id);
        $status = (string) ($topic['status'] ?? '');
        $caption = trim((string) ($topic['caption'] ?? ''));
        $hasImage = is_file(self::imagePath($id));
        if (($status === 'ready' || $status === 'failed') && $caption !== '' && $hasImage) {
            $public = self::publish($id);
        } else {
            $public = self::generate($id, true);
        }
        return ['ran' => true, 'topic' => $public];
    }

    private static function claim(string $id): array
    {
        $topics = Store::topics();
        foreach ($topics as &$topic) {
            if (($topic['id'] ?? '') !== $id) {
                continue;
            }
            if (($topic['status'] ?? '') === 'posted' && !self::isRepeating($topic)) {
                throw new RuntimeException('That post is already on the page.');
            }
            if (self::isRepeating($topic) && (string) ($topic['fail_slot'] ?? '') !== self::slot($topic)) {
                $topic['attempts'] = 0;
            }
            $updated = strtotime((string) ($topic['updated_at'] ?? '')) ?: 0;
            if (($topic['status'] ?? '') === 'writing' && (time() - $updated) < 240) {
                throw new RuntimeException('That topic is already being written.');
            }
            $topic['status'] = 'writing';
            $topic['error'] = '';
            $topic['updated_at'] = date('c');
            Store::save_topics($topics);
            return $topic;
        }
        throw new RuntimeException('That topic is no longer in the queue.');
    }

    private static function patch(string $id, array $changes): array
    {
        $topics = Store::topics();
        foreach ($topics as &$topic) {
            if (($topic['id'] ?? '') !== $id) {
                continue;
            }
            $topic = array_merge($topic, $changes);
            Store::save_topics($topics);
            return self::publicTopic($topic);
        }
        throw new RuntimeException('That topic is no longer in the queue.');
    }

    private static function fail(string $id, string $error, string $status = 'failed'): void
    {
        Store::transaction(function () use ($id, $error, $status) {
            $topics = Store::topics();
            foreach ($topics as &$topic) {
                if (($topic['id'] ?? '') !== $id) {
                    continue;
                }
                $topic['status'] = $status;
                $topic['error'] = $error;
                $topic['attempts'] = (int) ($topic['attempts'] ?? 0) + ($status === 'failed' ? 1 : 0);
                if ($status === 'failed' && self::isRepeating($topic)) {
                    $topic['fail_slot'] = self::slot($topic);
                }
                $topic['updated_at'] = date('c');
                break;
            }
            unset($topic);
            Store::save_topics($topics);
        });
    }

    private static function zone(): DateTimeZone
    {
        return new DateTimeZone('Asia/Colombo');
    }

    private static function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', self::zone());
    }

    private static function isRepeating(array $topic): bool
    {
        return in_array((string) ($topic['schedule'] ?? 'once'), ['daily', 'weekly', 'monthly'], true);
    }

    private static function slot(array $topic): string
    {
        $now = self::now();
        $schedule = (string) ($topic['schedule'] ?? 'once');
        if ($schedule === 'daily') {
            return $now->format('Y-m-d');
        }
        if ($schedule === 'weekly') {
            return $now->format('o-\WW');
        }
        if ($schedule === 'monthly') {
            return $now->format('Y-m');
        }
        return '';
    }

    private static function isDue(array $topic): bool
    {
        if (!self::isRepeating($topic)) {
            return false;
        }
        $status = (string) ($topic['status'] ?? '');
        $updated = strtotime((string) ($topic['updated_at'] ?? '')) ?: 0;
        if ($status === 'writing' && (time() - $updated) < 240) {
            return false;
        }
        $time = (string) ($topic['time'] ?? '');
        if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time)) {
            return false;
        }
        $now = self::now();
        if ($now->format('H:i') < $time) {
            return false;
        }
        $schedule = (string) $topic['schedule'];
        if ($schedule === 'weekly' && (int) $now->format('N') !== (int) ($topic['weekday'] ?? 0)) {
            return false;
        }
        if ($schedule === 'monthly' && (int) $now->format('j') !== (int) ($topic['monthday'] ?? 0)) {
            return false;
        }
        if ((string) ($topic['last_slot'] ?? '') === self::slot($topic)) {
            return false;
        }
        if ($status === 'failed' && (int) ($topic['attempts'] ?? 0) >= 3 && (string) ($topic['fail_slot'] ?? '') === self::slot($topic)) {
            return false;
        }
        return $status === 'scheduled' || $status === 'queued' || $status === 'ready' || $status === 'failed' || $status === 'posted';
    }

    private static function scheduleLabel(array $topic): string
    {
        $schedule = (string) ($topic['schedule'] ?? 'once');
        $time = (string) ($topic['time'] ?? '');
        if ($schedule === 'daily') {
            return 'Daily at ' . $time;
        }
        if ($schedule === 'weekly') {
            $days = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];
            $day = $days[(int) ($topic['weekday'] ?? 1)] ?? 'Monday';
            return 'Weekly on ' . $day . ' at ' . $time;
        }
        if ($schedule === 'monthly') {
            return 'Monthly on day ' . (int) ($topic['monthday'] ?? 1) . ' at ' . $time;
        }
        return 'Once';
    }
}
