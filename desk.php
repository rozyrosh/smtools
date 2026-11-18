<?php
declare(strict_types=1);
header('Location: http://localhost:3000/desk', true, 302);
exit;
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/chrome.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$user = Accounts::requireUser();
$studio = !empty($user['studio_key']);
chrome_head('Page Desk');
chrome_nav($user, 'desk');
?>
  <header class="top">
    <div class="brand">
      <div>
        <p class="brand-name">Page Desk</p>
        <p class="brand-job">Turn a title into a caption and a picture, then publish it to your Facebook page.</p>
      </div>
    </div>
  </header>

  <p class="flash" id="flash" hidden></p>

  <main class="layout">
    <aside class="rail">
      <section class="card" aria-labelledby="page-heading">
        <div class="card-head">
          <div class="head-title">
            <h2 id="page-heading">Page</h2>
            <button type="button" class="help-mark" id="open-guide" aria-haspopup="dialog" aria-controls="meta-guide" aria-label="How to get the App ID and App secret">
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
                <path d="M6.15 6.15a1.9 1.9 0 1 1 2.5 1.8c-.5.22-.8.58-.8 1.15V9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"></path>
                <rect x="7.2" y="11.15" width="1.6" height="1.6" fill="currentColor"></rect>
              </svg>
            </button>
          </div>
          <span class="pill" id="page-pill">Not connected</span>
        </div>
        <p class="lede" id="page-lede">Connect the Facebook page this desk publishes to.</p>
        <p class="hint">The page token stays on this computer. Keep this desk off a public address.</p>
        <div id="pending-pages" hidden></div>
        <form id="connection-form">
          <label>Meta app ID <input name="app_id" inputmode="numeric" autocomplete="off" spellcheck="false"></label>
          <label>App secret <input name="app_secret" type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved secret"></label>
          <div class="row-actions">
            <button type="submit" class="btn stamp">Save and connect</button>
          </div>
          <p class="hint">Saving the app details does not link the page. This opens Facebook so you can choose it.</p>
          <div class="or">or paste a Page token</div>
          <label>Page ID <input name="page_id" inputmode="numeric" autocomplete="off" spellcheck="false"></label>
          <label>Page access token <input name="page_token" type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved token"></label>
          <label>How the page should sound <textarea name="page_voice" rows="3" placeholder="A calm Sinhala page about home cooking. Short sentences. No hard sell."></textarea></label>
          <div class="row-actions">
            <a class="btn line" href="api.php?action=fb_start">Connect with Facebook</a>
          </div>
          <button type="button" class="btn text" id="disconnect" hidden>Disconnect this page</button>
        </form>
      </section>

      <section class="card queue-card" aria-labelledby="queue-heading">
        <div class="card-head">
          <h2 id="queue-heading">Queue</h2>
          <span class="pill quiet" id="queue-count">0</span>
        </div>
        <ul class="queue" id="queue"></ul>
        <p class="empty" id="queue-empty">The queue is empty.</p>
        <label class="check autopilot"><input type="checkbox" id="autopilot"> Keep posting the queue while this desk is open</label>
        <details class="key-box">
          <summary>Post while this tab is closed</summary>
          <p class="hint">While this desk is open, a daily, weekly, or monthly topic posts at its time. Call this address every few minutes from Task Scheduler so that still happens when the tab is closed. It also posts the next queued topic.</p>
          <button type="button" class="linkish" id="copy-cron"></button>
        </details>
      </section>
    </aside>

    <section class="stage">
      <form class="card composer" id="composer">
        <p class="eyebrow">New topic</p>
        <h2>Title and what it is about</h2>
        <label>Title <input name="title" required maxlength="160" placeholder="Sunday coconut roti"></label>
        <label>Description <textarea name="about" required rows="4" maxlength="2000" placeholder="A short post about the Sunday batch: griddle, coconut, and the first one off the pan."></textarea></label>
        <div class="splits">
          <label>Language
            <select name="language">
              <option>Sinhala</option>
              <option>English</option>
              <option>Tamil</option>
              <option>Singlish</option>
            </select>
          </label>
          <label>Tone
            <select name="tone">
              <option>Friendly</option>
              <option>Warm</option>
              <option>Plain</option>
              <option>Professional</option>
              <option>Bold</option>
            </select>
          </label>
          <label>Picture
            <select name="style">
              <option>Photograph</option>
              <option>Illustration</option>
              <option>Flat colour poster</option>
              <option>Product photo</option>
              <option>Cinematic</option>
            </select>
          </label>
        </div>
        <div class="splits">
          <label>Repeat
            <select name="schedule" id="schedule">
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label id="time-field" hidden>Time
            <input name="time" type="time" value="09:00" required>
          </label>
          <label id="weekday-field" hidden>Day
            <select name="weekday">
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="7">Sunday</option>
            </select>
          </label>
          <label id="monthday-field" hidden>Day of the month
            <input name="monthday" type="number" min="1" max="28" value="1">
          </label>
        </div>
        <p class="hint" id="schedule-hint" hidden>The time is Sri Lanka time. Each time it is due, the desk writes a new caption and picture and publishes them as the connected page.</p>
        <label class="check" id="autopost-field"><input type="checkbox" name="autopost" checked> Include it when the queue runs</label>
        <p class="hint" id="post-as"></p>
        <div class="row-actions">
          <button type="submit" class="btn stamp" id="post-button" name="intent" value="post">Write and post</button>
          <button type="submit" class="btn line" id="queue-button" name="intent" value="queue">Add to the queue</button>
        </div>
      </form>

      <article class="card proof" id="proof" aria-live="polite">
        <p class="eyebrow">Proof</p>
        <div class="proof-empty" id="proof-empty">
          <h2>The post will land here.</h2>
          <p>Write a title, or choose one from the queue.</p>
        </div>
        <div id="proof-body" hidden></div>
      </article>
    </section>
  </main>
  <dialog class="help-pop" id="meta-guide" aria-labelledby="guide-title">
    <div class="sheet-bar">
      <div>
        <p class="eyebrow">First time</p>
        <h2 id="guide-title">Get the two codes from Meta</h2>
      </div>
      <button type="button" class="btn line" id="close-guide">Close</button>
    </div>
    <div class="sheet-body guide">
      <p>Facebook needs an App ID and an App secret before this desk can use your page. Meta gives you both. It takes a few minutes.</p>
      <a class="btn stamp" href="https://developers.facebook.com/async/registration" target="_blank" rel="noopener">Create the app on Meta</a>
      <h4>New to Meta for Developers</h4>
      <ol>
        <li>Click the button above. Sign in with the Facebook account that manages the page. If the page is titled <strong>Social technologies</strong>, click <strong>Get Started</strong> at the top right.</li>
        <li>Meta opens <strong>Create a Meta for Developers account</strong>. On <strong>Register</strong>, click <strong>Continue</strong>.</li>
        <li>On <strong>Verify account</strong>, enter the code Meta sends to your phone or email.</li>
        <li>On <strong>Contact info</strong>, confirm the phone and email.</li>
        <li>On <strong>About you</strong>, pick the occupation that fits you, then finish.</li>
      </ol>
      <p class="hint">Already registered on Meta for Developers? Skip the five steps above. Click the button and follow <strong>Create the app</strong> below.</p>
      <h4>Create the app</h4>
      <ol>
        <li>Name the app anything you like. When Meta asks what it is for, choose <strong>Manage everything on your Page</strong>.</li>
        <li>Open <strong>App settings</strong>, then <strong>Basic</strong>. Copy the <strong>App ID</strong>. Click <strong>Show</strong> beside <strong>App secret</strong> and copy that too. Paste both into the boxes below.</li>
        <li>In the left menu, open <strong>Facebook Login for Business</strong>, then <strong>Settings</strong>. Under <strong>Valid OAuth Redirect URIs</strong>, paste this address and save it. Leave <strong>Enforce HTTPS</strong> turned on.
          <button type="button" class="linkish" id="copy-redirect"></button>
        </li>
        <li>Open <strong>Use cases</strong>. Next to <strong>Manage everything on your Page</strong>, click <strong>Customize</strong>. Turn these three to <strong>Ready for testing</strong>: pages_show_list, pages_manage_posts, pages_read_engagement.</li>
        <li>Come back here and click <strong>Save and connect</strong>. Facebook asks which page to use. Pick the page. Posts go out as that page, not on your personal profile.</li>
      </ol>
    </div>
  </dialog>
  <div class="dock" id="dock">
    <div class="press" id="press" hidden>
      <div class="press-track" id="press-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Progress">
        <span class="press-fill" id="press-fill"></span>
      </div>
      <p class="press-steps" id="press-steps">
        <span data-step="caption">Caption</span>
        <span data-step="picture">Picture</span>
        <span data-step="page">Page</span>
      </p>
    </div>
    <p class="status" id="status" role="status"></p>
  </div>
  <script src="assets/app.js?v=8"></script>
</body>
</html>
