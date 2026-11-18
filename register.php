<?php
declare(strict_types=1);
header('Location: http://localhost:3000/register', true, 302);
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
$name = '';
$email = '';
$legacy = Accounts::legacyWaiting();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $name = trim((string) ($_POST['name'] ?? ''));
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $sent = (string) ($_POST['csrf'] ?? '');
    if ($sent === '' || !hash_equals(csrf_token(), $sent)) {
        $error = 'The page expired. Reload and try again.';
    } else {
        try {
            Accounts::register($name, $email, (string) ($_POST['password'] ?? ''));
            header('Location: ' . app_origin() . '/desk.php');
            exit;
        } catch (Throwable $e) {
            $error = public_error($e->getMessage());
        }
    }
}
chrome_head('Open a desk');
chrome_nav(null, '');
?>
  <main class="gate">
    <form class="gate-card" method="post" action="register.php">
      <p class="eyebrow">Register</p>
      <h1>Open a desk</h1>
      <p class="hint">After this, you land on Page Desk. Each account has its own page and its own queue.</p>
      <?php if ($legacy): ?><p class="hint">The first account on this computer keeps the page that is already connected. Register that one yourself before anyone else.</p><?php endif; ?>
      <?php if ($error !== ''): ?><p class="form-error"><?= htmlspecialchars($error, ENT_QUOTES) ?></p><?php endif; ?>
      <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES) ?>">
      <label>Name <input name="name" autocomplete="name" required maxlength="60" value="<?= htmlspecialchars($name, ENT_QUOTES) ?>"></label>
      <label>Email <input name="email" type="email" autocomplete="username" required value="<?= htmlspecialchars($email, ENT_QUOTES) ?>"></label>
      <label>Password <input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
      <div class="row-actions">
        <button class="btn stamp" type="submit">Create the desk</button>
        <a class="btn text" href="login.php">I already have one</a>
      </div>
    </form>
  </main>
</body>
</html>
