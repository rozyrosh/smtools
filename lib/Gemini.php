<?php
declare(strict_types=1);

final class Gemini
{
    private const TEXT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
    private const IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-nano-banana-2.1'];

    public static function writePost(string $key, array $topic, string $pageVoice): array
    {
        $title = $topic['title'];
        $about = $topic['about'];
        $language = $topic['language'];
        $tone = $topic['tone'];
        $style = $topic['style'];
        $voice = trim($pageVoice);
        $voiceLine = $voice !== '' ? "How this page should sound: {$voice}\n" : '';
        $prompt = <<<TXT
You write posts for a Facebook page.

Title: {$title}
What the post is about: {$about}
Language for the caption: {$language}
Tone: {$tone}
{$voiceLine}
Return only JSON with this shape:
{"caption":"...","image_prompt":"..."}

caption: the Facebook post in {$language}. Open with the point, then 2 to 4 short paragraphs a person would actually post. Close with 4 to 8 relevant hashtags. Do not mention that you are an AI. Do not use markdown.
image_prompt: one English description of a square picture that supports the post. Picture style: {$style}. Describe the subject, setting, light, and mood. The picture must contain no words, letters, numbers, logos, watermarks, or interface.
TXT;

        $text = self::generateText($key, $prompt);
        $parsed = self::decodeJson($text);
        $caption = trim((string) ($parsed['caption'] ?? ''));
        $imagePrompt = trim((string) ($parsed['image_prompt'] ?? ''));
        if (mb_strlen($caption) < 8 || mb_strlen($imagePrompt) < 8) {
            throw new RuntimeException('The writing service returned a post that could not be used. Try again.');
        }
        return ['caption' => $caption, 'image_prompt' => $imagePrompt];
    }

    public static function makeImage(string $key, string $imagePrompt, string $style): array
    {
        $prompt = $imagePrompt
            . "\n\nPicture style: {$style}."
            . "\nSquare composition. No text, letters, numbers, logos, watermarks, or borders.";
        $last = 'The picture could not be created.';
        foreach (self::IMAGE_MODELS as $model) {
            try {
                return self::generateImage($key, $model, $prompt);
            } catch (RuntimeException $e) {
                $last = $e->getMessage();
                if (!self::tryNext($e)) {
                    break;
                }
                log_line('Image model ' . $model . ' skipped: ' . $last);
            }
        }
        throw new RuntimeException($last);
    }

    private static function generateText(string $key, string $prompt): string
    {
        $last = 'The caption could not be written.';
        foreach (self::TEXT_MODELS as $model) {
            try {
                $payload = self::post(
                    "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent",
                    $key,
                    [
                        'contents' => [[
                            'role' => 'user',
                            'parts' => [['text' => $prompt]],
                        ]],
                        'generationConfig' => [
                            'temperature' => 0.8,
                            'responseMimeType' => 'application/json',
                        ],
                    ]
                );
                $text = self::collectText($payload);
                if ($text === '') {
                    throw new RuntimeException('The writing service returned an empty caption.');
                }
                return $text;
            } catch (RuntimeException $e) {
                $last = $e->getMessage();
                if (!self::tryNext($e)) {
                    break;
                }
                log_line('Text model ' . $model . ' skipped: ' . $last);
            }
        }
        throw new RuntimeException($last);
    }

    private static function generateImage(string $key, string $model, string $prompt): array
    {
        $payload = self::post(
            "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent",
            $key,
            [
                'contents' => [[
                    'role' => 'user',
                    'parts' => [['text' => $prompt]],
                ]],
                'generationConfig' => [
                    'responseModalities' => ['IMAGE'],
                ],
            ]
        );
        $image = self::findImage($payload);
        if ($image === null) {
            throw new RuntimeException('The writing service returned no picture.', 502);
        }
        $bytes = base64_decode($image['data'], true);
        if ($bytes === false || strlen($bytes) < 1000) {
            throw new RuntimeException('The writing service returned an empty picture.', 502);
        }
        return ['bytes' => $bytes, 'mime' => $image['mime']];
    }

    private static function post(string $url, string $key, array $body): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-goog-api-key: ' . $key,
            ],
            CURLOPT_POSTFIELDS => json_encode($body),
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException('The writing service could not be reached. ' . $err, 502);
        }
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            throw new RuntimeException('The writing service returned an unreadable answer.', $code ?: 502);
        }
        if ($code >= 400 || isset($payload['error'])) {
            $message = (string) ($payload['error']['message'] ?? 'The writing service refused the request.');
            $error = new RuntimeException(public_error($message), $code ?: 502);
            throw $error;
        }
        return $payload;
    }

    private static function tryNext(RuntimeException $e): bool
    {
        $code = (int) $e->getCode();
        $msg = strtolower($e->getMessage());
        if ($code === 404 || str_contains($msg, 'no longer available') || str_contains($msg, 'not found') || str_contains($msg, 'not supported')) {
            return true;
        }
        if ($code === 429 || str_contains($msg, 'resource_exhausted') || str_contains($msg, 'rate')) {
            return false;
        }
        if (str_contains($msg, 'safety') || str_contains($msg, 'blocked') || str_contains($msg, 'policy')) {
            return false;
        }
        return $code >= 500 || $code === 0 || $code === 400;
    }

    private static function collectText(array $payload): string
    {
        $chunks = [];
        foreach ($payload['candidates'] ?? [] as $candidate) {
            foreach ($candidate['content']['parts'] ?? [] as $part) {
                if (!empty($part['text']) && is_string($part['text'])) {
                    $chunks[] = $part['text'];
                }
            }
        }
        return trim(implode("\n", $chunks));
    }

    private static function decodeJson(string $text): array
    {
        $text = trim($text);
        $text = preg_replace('/^```(?:json)?\s*/i', '', $text) ?? $text;
        $text = preg_replace('/\s*```$/', '', $text) ?? $text;
        $decoded = json_decode($text, true);
        if (is_array($decoded)) {
            return $decoded;
        }
        $start = strpos($text, '{');
        $end = strrpos($text, '}');
        if ($start === false || $end === false || $end <= $start) {
            return [];
        }
        $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function findImage(array $payload): ?array
    {
        $found = null;
        $walk = function ($node) use (&$walk, &$found) {
            if (!is_array($node) || $found) {
                return;
            }
            $mime = (string) ($node['mimeType'] ?? $node['mime_type'] ?? '');
            $data = $node['data'] ?? null;
            if (is_string($data) && strlen($data) > 200 && str_starts_with($mime, 'image/')) {
                $found = ['data' => $data, 'mime' => $mime];
                return;
            }
            foreach ($node as $child) {
                $walk($child);
            }
        };
        $walk($payload);
        return $found;
    }
}
