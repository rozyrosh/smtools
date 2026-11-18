<?php
declare(strict_types=1);
header('Location: http://localhost:3000/', true, 302);
exit;
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/chrome.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (Accounts::current()) {
    header('Location: ' . app_origin() . '/desk.php');
    exit;
}
chrome_head('smtools');
chrome_nav(null, '');
?>
  <main>
    <section class="hero">
      <p class="eyebrow">smtools</p>
      <h1>Write the post. Make the picture. Put it on the page.</h1>
      <p class="hero-lead">A desk for a Facebook page. Give it a title and a time. It writes a new caption and picture, then publishes as that page.</p>
      <div class="hero-actions">
        <a class="btn stamp" href="register.php">Open a desk</a>
        <a class="btn line" href="login.php">I already have one</a>
      </div>
    </section>

    <section class="sheet" aria-label="Tools">
      <article class="tool-card live">
        <p class="eyebrow">Open</p>
        <h2>Page Desk</h2>
        <p>Connect one Facebook page. Describe what the posts are about. Run them once, or every day, week, or month. Each time, the caption and the picture are new.</p>
      </article>
      <article class="tool-card">
        <p class="eyebrow">Next</p>
        <h2>Video desk</h2>
        <p>Another cut of a video you already have. It is not open yet. The bar at the top is where it will sit.</p>
      </article>
    </section>

    <section class="steps" aria-label="How a desk starts">
      <article>
        <h3>Open an account</h3>
        <p>A name, an email, and a password. The desk after that is yours alone.</p>
      </article>
      <article>
        <h3>Connect a page</h3>
        <p>Posts go out as the Facebook page you pick, not as a personal profile.</p>
      </article>
      <article>
        <h3>Set the clock</h3>
        <p>Once, daily, weekly, or monthly. The time is Sri Lanka time.</p>
      </article>
    </section>
    <p class="site-foot">The page connection stays on this computer.</p>
  </main>
</body>
</html>
