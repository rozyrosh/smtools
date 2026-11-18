<?php
declare(strict_types=1);
header('Location: http://localhost:3000/login', true, 302);
exit;
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/chrome.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (Accounts::current()) {
    header('Location: ' . app_origin() . '/desk.php');
    exit;
}
$error = '';
$email = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $sent = (string) ($_POST['csrf'] ?? '');
    if ($sent === '' || !hash_equals(csrf_token(), $sent)) {
        $error = 'The page expired. Reload and try again.';
    } else {
        try {
            Accounts::login($email, (string) ($_POST['password'] ?? ''));
            header('Location: ' . app_origin() . '/desk.php');
            exit;
        } catch (Throwable $e) {
            $error = public_error($e->getMessage());
        }
    }
}
chrome_head('Log in');
chrome_nav(null, '');
?>
  <main class="gate">
    <form class="gate-card" method="post" action="login.php">
      <p class="eyebrow">Log in</p>
      <h1>Open your desk</h1>
      <?php if ($error !== ''): ?><p class="form-error"><?= htmlspecialchars($error, ENT_QUOTES) ?></p><?php endif; ?>
      <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES) ?>">
      <label>Email <input name="email" type="email" autocomplete="username" required value="<?= htmlspecialchars($email, ENT_QUOTES) ?>"></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <div class="row-actions">
        <button class="btn stamp" type="submit">Log in</button>
        <a class="btn text" href="register.php">Need an account</a>
      </div>
    </form>
  </main>
</body>
</html>
