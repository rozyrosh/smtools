<?php
declare(strict_types=1);
header('Location: http://localhost:3000/video', true, 302);
exit;
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/chrome.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$user = Accounts::requireUser();
chrome_head('Video desk');
chrome_nav($user, 'video');
?>
  <main class="gate">
    <article class="gate-card">
      <p class="eyebrow">Next</p>
      <h1>Video desk</h1>
      <p class="hero-lead">This will make another cut of a video you already have. It is not open yet.</p>
      <div class="row-actions">
        <a class="btn stamp" href="desk.php">Back to Page Desk</a>
      </div>
    </article>
  </main>
</body>
</html>
