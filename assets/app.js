(function () {
  const csrf = document.querySelector('meta[name="csrf"]').content;
  const els = {
    flash: document.getElementById('flash'),
    gemini: document.getElementById('gemini-line'),
    geminiHint: document.getElementById('gemini-hint'),
    pill: document.getElementById('page-pill'),
    lede: document.getElementById('page-lede'),
    pending: document.getElementById('pending-pages'),
    form: document.getElementById('connection-form'),
    disconnect: document.getElementById('disconnect'),
    redirect: document.getElementById('copy-redirect'),
    cron: document.getElementById('copy-cron'),
    queue: document.getElementById('queue'),
    empty: document.getElementById('queue-empty'),
    count: document.getElementById('queue-count'),
    autopilot: document.getElementById('autopilot'),
    composer: document.getElementById('composer'),
    postAs: document.getElementById('post-as'),
    postButton: document.getElementById('post-button'),
    queueButton: document.getElementById('queue-button'),
    proofEmpty: document.getElementById('proof-empty'),
    proofBody: document.getElementById('proof-body'),
    status: document.getElementById('status'),
    guide: document.getElementById('meta-guide'),
    openGuide: document.getElementById('open-guide'),
    closeGuide: document.getElementById('close-guide'),
    dock: document.getElementById('dock'),
    press: document.getElementById('press'),
    pressBar: document.getElementById('press-bar'),
    pressFill: document.getElementById('press-fill'),
    pressSteps: document.getElementById('press-steps')
  };

  let state = null;
  let selected = '';
  let busy = false;
  let intent = 'post';
  let primed = false;
  let shownConnection = '';
  let pressTimer = null;
  let pressValue = 0;
  let pressMode = null;
  const labels = {
    queued: 'Queued',
    writing: 'Writing',
    ready: 'Ready to post',
    posted: 'On the page',
    scheduled: 'Scheduled',
    failed: 'Needs another try'
  };

  els.autopilot.checked = localStorage.getItem('desk-autopilot') === '1';
  els.composer.querySelectorAll('button[type="submit"]').forEach(function (button) {
    button.addEventListener('click', function () { intent = button.value; });
  });
  els.composer.schedule.addEventListener('change', syncSchedule);
  syncSchedule();
  if (els.openGuide && els.guide && els.guide.showModal) {
    els.openGuide.addEventListener('click', function () { els.guide.showModal(); });
    els.closeGuide.addEventListener('click', function () { els.guide.close(); });
    els.guide.addEventListener('click', function (event) {
      if (event.target === els.guide) els.guide.close();
    });
  }

  function say(message) { els.status.textContent = message || ''; }

  function syncSchedule() {
    const schedule = els.composer.schedule.value;
    const repeating = schedule !== 'once';
    document.getElementById('time-field').hidden = !repeating;
    document.getElementById('weekday-field').hidden = schedule !== 'weekly';
    document.getElementById('monthday-field').hidden = schedule !== 'monthly';
    document.getElementById('schedule-hint').hidden = !repeating;
    document.getElementById('autopost-field').hidden = repeating;
    els.postButton.textContent = repeating ? 'Save schedule' : 'Write and post';
    els.queueButton.hidden = repeating;
  }

  function topicTag(topic) {
    if (topic.status === 'scheduled') {
      return topic.due ? 'Due now' : (topic.schedule_label || 'Scheduled');
    }
    if (topic.schedule && topic.schedule !== 'once' && topic.schedule_label) {
      return (labels[topic.status] || topic.status) + ' · ' + topic.schedule_label;
    }
    return labels[topic.status] || topic.status;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  async function call(action, body) {
    const response = await fetch('api.php?action=' + encodeURIComponent(action), {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-CSRF': csrf },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(function () {
      return { ok: false, error: 'The desk returned an unreadable answer.' };
    });
    if (!response.ok || data.ok === false) {
      if (data.topics) state = data;
      const error = new Error(data.error || 'That did not work.');
      error.state = data;
      throw error;
    }
    return data;
  }

  function apply(next) {
    state = next;
    paint();
    if (next.flash) {
      els.flash.hidden = false;
      els.flash.textContent = next.flash;
    }
  }

  async function refresh() {
    apply(await call('state'));
  }

  function paint() {
    const page = state.facebook || {};
    if (els.gemini) els.gemini.hidden = true;
    const connectionKey = [page.app_id, page.page_id, state.page_voice].join('|');
    const editingConnection = document.activeElement && document.activeElement.form === els.form && document.activeElement.type !== 'submit' && document.activeElement.type !== 'button';
    if (connectionKey !== shownConnection && !editingConnection) {
      els.form.app_id.value = page.app_id || '';
      els.form.page_id.value = page.page_id || '';
      els.form.page_voice.value = state.page_voice || '';
      shownConnection = connectionKey;
    }
    els.redirect.textContent = page.redirect_uri || '';
    els.cron.textContent = state.cron_url || '';
    els.disconnect.hidden = !page.connected;
    if (page.connected) {
      els.pill.textContent = 'Connected';
      els.pill.classList.add('on');
      els.lede.textContent = 'Posts go out as the page ' + page.page_name + ', not on the personal profile. Disconnect, then connect again, to choose a different page.';
    } else {
      els.pill.textContent = 'Not connected';
      els.pill.classList.remove('on');
      els.lede.textContent = 'Connect a Facebook page. Posts go out as that page, not on the personal profile.';
    }

    const pending = state.pending_pages || [];
    els.pending.hidden = pending.length === 0;
    els.pending.innerHTML = pending.map(function (item) {
      return '<button type="button" class="btn line pick" data-page="' + esc(item.id) + '">Use ' + esc(item.name) + '</button>';
    }).join('');

    const topics = state.topics || [];
    els.count.textContent = String(topics.length);
    els.empty.hidden = topics.length > 0;
    els.queue.innerHTML = topics.map(function (topic) {
      const thumb = topic.image_url
        ? '<img class="thumb" alt="" src="' + esc(topic.image_url) + '">'
        : '<span class="thumb blank"></span>';
      return '<li><button type="button" class="topic' + (topic.id === selected ? ' selected' : '') + '" data-id="' + esc(topic.id) + '">'
        + thumb
        + '<span><strong>' + esc(topic.title) + '</strong><small class="tag ' + esc(topic.status) + '">' + esc(topicTag(topic)) + '</small></span>'
        + '</button></li>';
    }).join('');

    if (!primed) {
      const defaults = state.defaults || {};
      ['language', 'tone', 'style'].forEach(function (name) {
        if (defaults[name] && els.composer[name]) els.composer[name].value = defaults[name];
      });
      primed = true;
    }
    const pageName = (state.facebook && state.facebook.page_name) || '';
    els.postAs.textContent = state.facebook && state.facebook.connected
      ? 'This publishes as the page ' + pageName + ', not on the personal profile.'
      : 'Connect a page first. The personal profile is not used.';
    paintProof();
    if (busy) {
      document.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
    }
  }

  function currentTopic() {
    return (state.topics || []).find(function (topic) { return topic.id === selected; }) || null;
  }

  function paintProof() {
    const topic = currentTopic();
    const editing = document.activeElement && document.activeElement.id === 'caption';
    if (editing && topic) return;
    if (!topic) {
      els.proofEmpty.hidden = false;
      els.proofBody.hidden = true;
      els.proofBody.innerHTML = '';
      return;
    }
    els.proofEmpty.hidden = true;
    els.proofBody.hidden = false;
    const image = topic.image_url
      ? '<div class="proof-frame"><img src="' + esc(topic.image_url) + '" alt="Picture for ' + esc(topic.title) + '">'
        + '<span class="crop tl"></span><span class="crop tr"></span><span class="crop bl"></span><span class="crop br"></span>'
        + (topic.status === 'posted' ? '<span class="stamp-mark">On the page</span>' : '')
        + '</div>'
      : '';
    const posted = topic.status === 'posted';
    const writing = topic.status === 'writing' || busy;
    const scheduleBit = topic.schedule && topic.schedule !== 'once' && topic.schedule_label
      ? ' · ' + topic.schedule_label
      : '';
    els.proofBody.innerHTML = image
      + '<h2>' + esc(topic.title) + '</h2>'
      + '<p class="meta">' + esc(topic.language) + ' · ' + esc(topic.tone) + ' · ' + esc(topic.style) + esc(scheduleBit) + '</p>'
      + (topic.error ? '<p class="error">' + esc(topic.error) + '</p>' : '')
      + '<label>Caption <textarea class="caption" id="caption"' + (posted ? ' readonly' : '') + '>' + esc(topic.caption) + '</textarea></label>'
      + '<div class="row-actions">'
      + (posted ? '' : '<button type="button" class="btn line" id="save-caption">Save caption</button>')
      + (posted ? '' : '<button type="button" class="btn line" id="write-again"' + (writing ? ' disabled' : '') + '>' + (topic.caption ? 'Write again' : 'Write the post') + '</button>')
      + (posted ? '' : '<button type="button" class="btn stamp" id="post-this"' + (writing ? ' disabled' : '') + '>Post to the page</button>')
      + (topic.fb_url ? '<a class="btn solid" href="' + esc(topic.fb_url) + '" target="_blank" rel="noopener">' + (posted ? 'Open on Facebook' : 'Last post on Facebook') + '</a>' : '')
      + '<button type="button" class="btn text" id="remove-topic">Remove</button>'
      + '</div>';
  }

  function stepRank(step) {
    return { caption: 1, picture: 2, page: 3 }[step] || 0;
  }

  function pressTopic(data) {
    const topics = (data && data.topics) || [];
    if (pressMode && pressMode.id) {
      return topics.find(function (topic) { return topic.id === pressMode.id; }) || null;
    }
    return topics.find(function (topic) { return topic.status === 'writing'; }) || null;
  }

  function pressFloor(topic) {
    if (!pressMode || pressMode.kind !== 'write') return pressMode && pressMode.kind === 'post' ? 64 : 8;
    if (topic && topic.caption && topic.image_url) return pressMode.post === false ? 78 : 72;
    if (topic && topic.caption) return 40;
    return 8;
  }

  function pressCap(topic) {
    if (!pressMode || pressMode.kind !== 'write') return 92;
    if (topic && topic.caption && topic.image_url) return 92;
    if (topic && topic.caption) return 68;
    return 36;
  }

  function pressStep(topic) {
    if (pressMode && pressMode.kind === 'post') return 'page';
    if (topic && topic.caption && topic.image_url) return pressMode && pressMode.post === false ? 'picture' : 'page';
    if (topic && topic.caption) return 'picture';
    return 'caption';
  }

  function paintPress(topic) {
    els.pressFill.style.width = pressValue + '%';
    els.pressBar.setAttribute('aria-valuenow', String(Math.round(pressValue)));
    const current = pressStep(topic);
    const showSteps = pressMode && (pressMode.kind === 'write' || pressMode.kind === 'post');
    els.pressSteps.hidden = !showSteps;
    els.pressSteps.querySelectorAll('[data-step]').forEach(function (item) {
      const rank = stepRank(item.dataset.step);
      item.classList.toggle('on', showSteps && rank <= stepRank(current));
      item.classList.toggle('now', showSteps && item.dataset.step === current);
    });
    if (pressValue < 100 && pressMode && pressMode.kind === 'write') {
      if (current === 'page') say('Posting to the page.');
      else if (current === 'picture' && topic && topic.caption && topic.image_url) say('The picture is ready.');
      else if (current === 'picture') say('Making the picture.');
      else say('Writing the caption.');
    }
  }

  function startPress(mode) {
    pressMode = mode || null;
    if (!pressMode) return;
    pressValue = pressFloor(null);
    els.press.hidden = false;
    els.dock.classList.add('has-press');
    paintPress(null);
    pressTimer = setInterval(async function () {
      let topic = null;
      if (pressMode.kind === 'write') {
        try {
          topic = pressTopic(await call('state'));
        } catch (error) {
          topic = null;
        }
      }
      const floor = pressFloor(topic);
      const cap = pressCap(topic);
      pressValue = Math.max(pressValue, floor);
      if (pressValue < cap) pressValue = Math.min(cap, pressValue + 2);
      paintPress(topic);
    }, 700);
  }

  function finishPress(ok) {
    if (pressTimer) {
      clearInterval(pressTimer);
      pressTimer = null;
    }
    if (!pressMode) return;
    if (ok) {
      pressValue = 100;
      paintPress({ caption: 'done', image_url: 'done' });
    }
    const hide = function () {
      els.press.hidden = true;
      els.dock.classList.remove('has-press');
      els.pressFill.style.width = '0';
      pressValue = 0;
      pressMode = null;
    };
    if (ok) setTimeout(hide, 500);
    else hide();
  }

  async function withBusy(message, job, progress) {
    busy = true;
    say(message);
    startPress(progress || null);
    document.querySelectorAll('.btn').forEach(function (button) {
      if (button.tagName === 'BUTTON') button.disabled = true;
    });
    let ok = false;
    try {
      const result = await job();
      ok = result !== false;
      return result;
    } finally {
      finishPress(ok);
      busy = false;
      document.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
      if (state) paint();
    }
  }

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(els.form).entries());
    data.use_studio_key = !!(els.form.use_studio_key && els.form.use_studio_key.checked);
    const pastedToken = String(data.page_token || '').trim();
    withBusy('Saving the app…', async function () {
      try {
        apply(await call('save_connection', data));
        els.form.app_secret.value = '';
        els.form.page_token.value = '';
        els.form.gemini_api_key.value = '';
        if (els.form.use_studio_key) els.form.use_studio_key.checked = false;
        if (state.facebook.connected) {
          say('Page connected.');
          return;
        }
        if (pastedToken === '') {
          say('App details saved. Opening Facebook so you can choose the page.');
          window.location.href = 'api.php?action=fb_start';
          return;
        }
        say('The app details are saved. Add a Page token to finish connecting.');
      } catch (error) {
        if (error.state) apply(error.state);
        say(error.message);
      }
    });
  });

  els.disconnect.addEventListener('click', function () {
    withBusy('Disconnecting…', async function () {
      try {
        apply(await call('disconnect', {}));
        say('Page disconnected.');
      } catch (error) {
        say(error.message);
      }
    });
  });

  els.pending.addEventListener('click', function (event) {
    const button = event.target.closest('.pick');
    if (!button) return;
    withBusy('Connecting the page…', async function () {
      try {
        apply(await call('fb_pick', { page_id: button.dataset.page }));
        say('Page connected.');
      } catch (error) {
        say(error.message);
      }
    });
  });

  els.queue.addEventListener('click', function (event) {
    const button = event.target.closest('.topic');
    if (!button) return;
    selected = button.dataset.id;
    paint();
  });

  els.composer.addEventListener('submit', function (event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(els.composer).entries());
    const repeating = data.schedule && data.schedule !== 'once';
    data.autopost = !repeating && els.composer.autopost.checked;
    data.post_now = intent === 'post' && !repeating;
    data.weekday = els.composer.weekday.value;
    data.monthday = els.composer.monthday.value;
    const message = repeating
      ? 'Saving the schedule.'
      : (data.post_now
        ? 'Writing the caption and the picture, then posting. This usually takes about half a minute.'
        : 'Adding it to the queue.');
    withBusy(message, async function () {
      try {
        const next = await call('topic_add', data);
        apply(next);
        if (next.topic) selected = next.topic.id;
        els.composer.title.value = '';
        els.composer.about.value = '';
        paint();
        say(repeating
          ? 'Schedule saved. A new post goes out as the page at that time.'
          : (data.post_now ? 'Posted.' : 'Added to the queue.'));
      } catch (error) {
        if (error.state && error.state.topics) {
          apply(error.state);
          const newest = error.state.topics[0];
          if (newest) selected = newest.id;
          paint();
        }
        say(error.message);
        return false;
      }
    }, data.post_now ? { kind: 'write', post: true } : null);
  });

  document.getElementById('proof').addEventListener('click', function (event) {
    const id = selected;
    if (!id) return;
    if (event.target.id === 'save-caption') {
      const caption = document.getElementById('caption').value;
      withBusy('Saving the caption…', async function () {
        try {
          apply(await call('topic_caption', { id: id, caption: caption }));
          say('Caption saved.');
        } catch (error) {
          say(error.message);
        }
      });
    }
    if (event.target.id === 'write-again') {
      withBusy('Writing the caption and the picture. This usually takes about half a minute.', async function () {
        try {
          apply(await call('generate', { id: id, post: false }));
          say('The post is ready.');
        } catch (error) {
          if (error.state) apply(error.state);
          say(error.message);
          return false;
        }
      }, { kind: 'write', post: false, id: id });
    }
    if (event.target.id === 'post-this') {
      const caption = document.getElementById('caption');
      const typedNow = caption && !caption.readOnly ? caption.value.trim() : '';
      const readyNow = currentTopic();
      const needsWrite = !(readyNow && readyNow.image_url && (readyNow.caption || typedNow));
      withBusy('Posting to the page…', async function () {
        try {
          const typed = caption && !caption.readOnly ? caption.value.trim() : '';
          if (typed) await call('topic_caption', { id: id, caption: typed });
          const topic = currentTopic();
          if (topic && topic.image_url && (topic.caption || typed)) {
            apply(await call('publish', { id: id }));
          } else {
            apply(await call('generate', { id: id, post: true }));
          }
          say('Posted.');
        } catch (error) {
          if (error.state) apply(error.state);
          say(error.message);
          return false;
        }
      }, needsWrite ? { kind: 'write', post: true, id: id } : { kind: 'post', id: id });
    }
    if (event.target.id === 'remove-topic') {
      withBusy('Removing…', async function () {
        try {
          apply(await call('topic_delete', { id: id }));
          selected = '';
          say('Removed.');
        } catch (error) {
          say(error.message);
        }
      });
    }
  });

  async function copyText(text, note) {
    try {
      await navigator.clipboard.writeText(text);
      say(note);
    } catch (error) {
      say(text);
    }
  }
  els.redirect.addEventListener('click', function () { copyText(els.redirect.textContent, 'Redirect copied.'); });
  els.cron.addEventListener('click', function () { copyText(els.cron.textContent, 'Address copied.'); });

  els.autopilot.addEventListener('change', function () {
    localStorage.setItem('desk-autopilot', els.autopilot.checked ? '1' : '0');
    say(els.autopilot.checked ? 'The queue will keep posting while this desk is open.' : 'The queue will wait.');
  });

  async function pump() {
    if (!els.autopilot.checked || busy || !state) return;
    const waiting = (state.topics || []).some(function (topic) {
      return topic.autopost && (topic.status === 'queued' || topic.status === 'ready' || topic.status === 'failed');
    });
    if (!waiting) return;
    const queued = (state.topics || []).find(function (topic) {
      return topic.autopost && (topic.status === 'queued' || topic.status === 'ready' || topic.status === 'failed');
    });
    const queuedProgress = queued && queued.caption && queued.image_url
      ? { kind: 'post', id: queued.id }
      : { kind: 'write', post: true, id: queued ? queued.id : '' };
    await withBusy('Posting the next topic in the queue…', async function () {
      try {
        const next = await call('run_next', {});
        apply(next);
        if (next.topic) selected = next.topic.id;
        say(next.ran ? 'Queue moved forward.' : 'Nothing is waiting.');
      } catch (error) {
        if (error.state) apply(error.state);
        say(error.message);
        return false;
      }
    }, queuedProgress);
  }

  async function clock() {
    if (busy || !state) return;
    const due = (state.topics || []).some(function (topic) { return topic.due; });
    if (!due) return;
    const dueTopic = (state.topics || []).find(function (topic) { return topic.due; });
    await withBusy('A scheduled topic is due. Writing a new caption and picture, then posting as the page.', async function () {
      try {
        const next = await call('run_due', {});
        apply(next);
        if (next.topic) selected = next.topic.id;
        say(next.ran ? 'The scheduled post went out as the page.' : 'Nothing is due.');
      } catch (error) {
        if (error.state) apply(error.state);
        say(error.message);
        return false;
      }
    }, { kind: 'write', post: true, id: dueTopic ? dueTopic.id : '' });
  }

  refresh().then(function () { clock(); }).catch(function (error) { say(error.message); });
  setInterval(pump, 15000);
  setInterval(clock, 30000);
})();
