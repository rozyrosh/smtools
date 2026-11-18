<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

set_time_limit(180);
start_session();

$action = (string) ($_GET['action'] ?? 'state');

if ($action === 'run_next' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $key = (string) ($_GET['key'] ?? '');
    $owner = Accounts::idForCronKey($key);
    if ($owner === '') {
        json_out(['ok' => false, 'error' => 'That key is not valid.'], 403);
    }
    Store::bind($owner);
    try {
        $result = Desk::runDue();
        if (empty($result['ran'])) {
            $result = Desk::runNext();
        }
        json_out(array_merge(Desk::publicState(), $result));
    } catch (Throwable $e) {
        log_line($e->getMessage());
        json_out(array_merge(Desk::publicState(), [
            'ok' => false,
            'error' => public_error($e->getMessage()),
        ]), 502);
    }
}

if ($action === 'image' && !Accounts::current()) {
    http_response_code(404);
    exit;
}

$user = Accounts::requireApi();

if ($action === 'image') {
    $id = (string) ($_GET['id'] ?? '');
    if (!preg_match('/^top_[a-f0-9]{12}$/', $id)) {
        http_response_code(404);
        exit;
    }
    if (!Store::find_topic($id)) {
        http_response_code(404);
        exit;
    }
    $path = Desk::imagePath($id);
    if (!is_file($path)) {
        http_response_code(404);
        exit;
    }
    $mime = is_file($path . '.type') ? trim((string) file_get_contents($path . '.type')) : 'image/png';
    if (!str_starts_with($mime, 'image/')) {
        $mime = 'image/png';
    }
    header('Content-Type: ' . $mime);
    header('Cache-Control: private, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

if ($action === 'fb_start') {
    $settings = Store::settings();
    if ($settings['fb_app_id'] === '' || $settings['fb_app_secret'] === '') {
        flash_home('Save the Meta app ID and app secret first.');
    }
    $state = bin2hex(random_bytes(16));
    $_SESSION['fb_oauth_state'] = $state;
    $url = 'https://www.facebook.com/' . GRAPH_VERSION . '/dialog/oauth?' . http_build_query([
        'client_id' => $settings['fb_app_id'],
        'redirect_uri' => facebook_redirect_uri(),
        'state' => $state,
        'scope' => 'business_management,pages_show_list,pages_manage_posts,pages_read_engagement',
        'response_type' => 'code',
    ]);
    header('Location: ' . $url);
    exit;
}

if ($action === 'fb_callback') {
    $expected = (string) ($_SESSION['fb_oauth_state'] ?? '');
    $got = (string) ($_GET['state'] ?? '');
    unset($_SESSION['fb_oauth_state']);
    if ($expected === '' || !hash_equals($expected, $got)) {
        flash_home('Facebook sent the desk back without a matching login. Try connecting again.');
    }
    if (!empty($_GET['error'])) {
        $reason = (string) ($_GET['error_description'] ?? $_GET['error']);
        flash_home(public_error($reason));
    }
    try {
        $settings = Store::settings();
        $token = Facebook::exchangeCode(
            $settings['fb_app_id'],
            $settings['fb_app_secret'],
            (string) ($_GET['code'] ?? ''),
            facebook_redirect_uri()
        );
        $pages = Facebook::pages($token);
    } catch (Throwable $e) {
        flash_home(public_error($e->getMessage()));
    }
    if (!$pages) {
        flash_home('Facebook did not list a page for this login. Use an account that manages the page.');
    }
    if (count($pages) === 1) {
        remember_page($pages[0]);
        flash_home('Connected to ' . $pages[0]['name'] . '.');
    }
    $_SESSION['fb_pages'] = $pages;
    flash_home('Choose the page this desk should publish to.');
}

$writes = ['save_connection', 'disconnect', 'fb_pick', 'topic_add', 'topic_caption', 'topic_delete', 'generate', 'publish', 'run_next', 'run_due'];
if (in_array($action, $writes, true)) {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        json_out(['ok' => false, 'error' => 'Use the desk to do that.'], 405);
    }
    require_csrf();
}

try {
    $input = request_json();
    switch ($action) {
        case 'state':
            json_out(Desk::publicState());
            break;
        case 'save_connection':
            Desk::saveConnection($input);
            json_out(Desk::publicState());
            break;
        case 'disconnect':
            Desk::disconnect();
            json_out(Desk::publicState());
            break;
        case 'fb_pick':
            $pageId = (string) ($input['page_id'] ?? '');
            $chosen = null;
            foreach ($_SESSION['fb_pages'] ?? [] as $page) {
                if ((string) $page['id'] === $pageId) {
                    $chosen = $page;
                    break;
                }
            }
            if (!$chosen) {
                throw new RuntimeException('Choose a page from the list Facebook just returned.');
            }
            remember_page($chosen);
            unset($_SESSION['fb_pages']);
            json_out(Desk::publicState());
            break;
        case 'topic_add':
            $topic = Desk::addTopic($input, !empty($input['post_now']));
            json_out(array_merge(Desk::publicState(), ['topic' => $topic]));
            break;
        case 'topic_caption':
            $topic = Desk::updateCaption((string) ($input['id'] ?? ''), (string) ($input['caption'] ?? ''));
            json_out(array_merge(Desk::publicState(), ['topic' => $topic]));
            break;
        case 'topic_delete':
            Desk::deleteTopic((string) ($input['id'] ?? ''));
            json_out(Desk::publicState());
            break;
        case 'generate':
            $topic = Desk::generate((string) ($input['id'] ?? ''), !empty($input['post']));
            json_out(array_merge(Desk::publicState(), ['topic' => $topic]));
            break;
        case 'publish':
            $topic = Desk::publish((string) ($input['id'] ?? ''));
            json_out(array_merge(Desk::publicState(), ['topic' => $topic]));
            break;
        case 'run_next':
            $result = Desk::runNext();
            json_out(array_merge(Desk::publicState(), $result));
            break;
        case 'run_due':
            $result = Desk::runDue();
            json_out(array_merge(Desk::publicState(), $result));
            break;
        default:
            json_out(['ok' => false, 'error' => 'Unknown action.'], 404);
    }
} catch (Throwable $e) {
    log_line($e->getMessage());
    $status = (int) $e->getCode();
    if ($status < 400 || $status > 599) {
        $status = 400;
    }
    json_out(array_merge(Desk::publicState(), [
        'ok' => false,
        'error' => public_error($e->getMessage()),
    ]), $status);
}

function remember_page(array $page): void
{
    Store::transaction(function () use ($page) {
        $settings = Store::settings();
        $settings['fb_page_id'] = (string) $page['id'];
        $settings['fb_page_name'] = (string) $page['name'];
        $settings['fb_page_token'] = (string) $page['token'];
        Store::save_settings($settings);
    });
}

function flash_home(string $message): void
{
    log_line($message);
    start_session();
    $_SESSION['flash'] = $message;
    header('Location: ' . app_origin() . '/desk.php');
    exit;
}
