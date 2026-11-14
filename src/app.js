/* ═══════════════════════════════════════════════════════════════════════════
   ASCEND · app.js (UI)
   All maths lives in core.js (window.RTL). Today's character and their aura are drawn by aura.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
var R = window.RTL;
var CONN_KEY = 'rtl_conn', CLOUD_AT_KEY = 'rtl_cloud_at';
/* a preview window, private browsing or "block all cookies" can refuse storage outright: just touching it throws.
   The app must still open (keeping things in memory for this visit) and say plainly that nothing will be kept. */
var STORAGE = (function () { try { var s = window.localStorage; s.getItem('rtl_probe'); return s; } catch (e) { return null; } })();
var storageBlocked = !STORAGE, saveWarned = false;
var store = R.createStore(STORAGE || { getItem: function () { throw new Error('storage blocked'); }, setItem: function () { throw new Error('storage blocked'); }, removeItem: function () {} }, R.STORE_KEY);
var loaded = store.load();
var S = loaded.state;
var HOSTED = !!window.WA_HOSTED; // the build that lives inside Claude: storage and AI come from your Claude account, nothing to connect
var conn = HOSTED ? { url: 'https://winter-arc.hosted', key: 'hosted' } : readConn();
var tab = 'status', viewDay = null, pending = null, pendingScan = null, busy = false, lastToday = R.dayKey();
var openLadders = {};
var lastQuestDone = null, lastPRCount = R.strengthLog(S).prs.length;
var evQueue = [], evShowing = false, cloudTimer = null, cloudState = '';
var inboxQueue = [];
var TAB_ORDER = ['status', 'bosses', 'log', 'body', 'stats', 'aura'];
var TABCOL = { status: 'var(--holo)', log: 'var(--kcal)', body: 'var(--holo)', stats: 'var(--train)', aura: 'var(--xp3)', bosses: 'var(--bad)' };
var QCOL = { protein: 'var(--protein)', calories: 'var(--kcal)', water: 'var(--water)', steps: 'var(--steps)', training: 'var(--train)', lights: 'var(--sleep)', fibre: 'var(--fibre)' };
var STATCOL_DARK = { STR: '#9C8CFF', AGI: '#4FE3D0', END: '#38B6F5', VIT: '#7CF0C0', DISC: '#DFF4FF', FOCUS: '#6FB4FF' }, STATCOL = STATCOL_DARK;
var STATCOL_LIGHT = { STR: '#5B48D6', AGI: '#087A6E', END: '#0A6699', VIT: '#087A52', DISC: '#2E4A6B', FOCUS: '#2B5CC0' };
/* text colours chosen for the dark themes, darkened on a light theme until they read clearly on white */
function tc(hex) {
  if (!document.documentElement.classList.contains('light')) return hex;
  var n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255];
  function lum(v) { return v.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce(function (a, x, i) { return a + x * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  for (var k = 0; k < 30 && lum(c) > 0.16; k++) c = c.map(function (x) { return x * 0.9; });
  return '#' + c.map(function (x) { x = Math.round(x); return (x < 16 ? '0' : '') + x.toString(16); }).join('');
}
var TRIALCOL = { pullups: 'var(--train)', pushups: 'var(--protein)', dips: 'var(--kcal)', core: 'var(--fibre)' };

/* ───────────── utils ───────────── */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function n0(x) { return Math.round(R.num(x)).toLocaleString('en-GB'); }
function n1(x) { var v = R.num(x); return (Math.round(v * 10) / 10).toLocaleString('en-GB', { maximumFractionDigits: 1 }); }
function today() { return R.dayKey(); }
function targetDay() { return (tab === 'log' && viewDay) ? viewDay : today(); }
function readConn() { try { var c = JSON.parse(localStorage.getItem(CONN_KEY) || '{}'); return { url: typeof c.url === 'string' ? c.url : '', key: typeof c.key === 'string' ? c.key : '' }; } catch (e) { return { url: '', key: '' }; } }
function saveConn() { if (HOSTED) return; try { localStorage.setItem(CONN_KEY, JSON.stringify(conn)); } catch (e) {} }
function connected() { return !!(conn.url && conn.key); }
function apiBase() { return conn.url.trim().replace(/\/+$/, ''); }
function vib(p) { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; if (navigator.vibrate && S.settings.motion !== 'reduced') navigator.vibrate(p); } catch (e) {} }
var audioCtx = null;
function beep(kind) {
  if (!S.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var seq = kind === 'win' ? [660, 880, 1320] : kind === 'level' ? [523, 659, 784, 1047] : kind === 'bad' ? [220, 180] : [880];
    seq.forEach(function (f, i) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.09;
      o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.18);
    });
  } catch (e) {}
}
function win(title, body, cls, sub) { return '<div class="win ' + (cls || '') + '"><span class="br-b"></span>' + (title ? '<div class="win-h"><div class="win-t">' + title + '</div>' + (sub ? '<div class="win-s">' + sub + '</div>' : '') + '</div>' : '') + body + '</div>'; }
/* safety net: one broken card or screen never blanks the app */
var errLog = [];
function reportErr(e, where) { try { errLog.push({ where: where, msg: String(e && e.message || e), at: Date.now() }); if (errLog.length > 20) errLog.shift(); console.error('[Winter Arc] ' + where + ': ' + (e && e.stack || e)); } catch (x) {} }
function failCard(name) { return '<div class="win cardfail"><div class="win-h"><div class="win-t">' + esc(name) + '</div></div><p class="muted" style="margin:0;font-size:13.5px">This card couldn’t load. Your data is safe and the rest of the app still works.</p></div>'; }
function safe(name, fn) { try { return fn(); } catch (e) { reportErr(e, name); return failCard(name); } }
function deficitCol(v) { return v < 0 ? 'var(--bad)' : v > R.DEFICIT_AMBER ? 'var(--warn)' : 'var(--good)'; }
function calm() { return S.settings.motion === 'reduced' || (S.settings.motion === 'auto' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

/* toasts */
function toast(msg, opts) {
  opts = opts || {};
  var box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast' + (opts.bad ? ' bad' : '');
  t.innerHTML = '<span>' + (opts.icon || (opts.bad ? '⚠️' : '◆')) + '</span><span>' + esc(msg) + '</span>' + (opts.action ? '<button class="t-act">' + esc(opts.action) + '</button>' : '');
  box.appendChild(t);
  var done = false;
  function close() { if (done) return; done = true; t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }
  if (opts.action) $('.t-act', t).onclick = function () { close(); opts.onAction && opts.onAction(); };
  // a toast never runs out behind a full-screen moment (a level-up, a boss): its time starts again once that has been closed, so Undo stays reachable
  (function arm(ms) { setTimeout(function () { if (!done && document.querySelector('.ceremony:not(.busy)')) arm(opts.action ? 4500 : 1800); else close(); }, ms); })(opts.ms || (opts.action ? 6000 : 2600));
  while (box.children.length > 3) box.firstChild.remove();
}
/* a stream of glowing pieces rising out of what you just finished */
function pieceBurst(anchor, kind) {
  if (calm() || !window.Puzzle) return;
  var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
  window.Puzzle.burst(r && r.width ? r.left + r.width / 2 : window.innerWidth / 2, r && r.height ? r.top + r.height / 2 : window.innerHeight - 160, kind || 'done');
}
function floatText(txt, gold, anchor) {
  if (calm()) return;
  var r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2 - 30, top: window.innerHeight - 200, width: 60 };
  var f = document.createElement('div'); f.className = 'floatxp' + (gold ? ' g' : ''); f.textContent = txt;
  f.style.left = (r.left + r.width / 2 - 30 + (gold ? 40 : 0)) + 'px'; f.style.top = (r.top) + 'px';
  document.body.appendChild(f); setTimeout(function () { f.remove(); }, 1600);
}
function confetti(n, gold) { if (calm() || !window.Puzzle) return; window.Puzzle.shower(Math.round((n || 60) * 0.45), gold); } // glowing puzzle pieces pour up (they were snowflakes)
function countUp(el, to) {
  if (!el) return; var from = R.num(el.getAttribute('data-from'), to);
  if (calm() || from === to) { el.textContent = n0(to); return; }
  var t0 = performance.now(), dur = 900;
  function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = n0(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}

/* layers (sheets/modals) */
function openLayer(html, opts) {
  opts = opts || {}; if (window.Aura && window.Aura.hold) window.Aura.hold(true); if (window.Puzzle) window.Puzzle.hold(true); // nothing animates behind a sheet
  var layer = $('#layer');
  // V17PRO: every sheet has a ✕ that stays at the top while you scroll, and can be swiped down to close
  var xb = opts.sticky ? '' : '<div class="sheet-xw"><button class="sheet-x" data-act="close" aria-label="Close">✕</button></div>';
  layer.innerHTML = '<div class="scrim' + (opts.center ? ' center-scrim' : '') + '" data-scrim="1">' + (opts.center ? '<div class="modal">' + html + '</div>' : '<div class="sheet win ' + (opts.cls || '') + '">' + xb + '<span class="br-b"></span>' + html + '</div>') + '</div>';
  var scrim = $('.scrim', layer);
  scrim.addEventListener('click', function (e) { if (e.target === scrim && !opts.sticky) closeLayer(); });
  if (!opts.center && !opts.sticky) swipeToClose($('.sheet', layer));
  // on a phone the keyboard waits until you tap the box, so the sheet opens at its own size instead of filling the screen
  var f = $('[autofocus]', layer); if (f && !TOUCH) setTimeout(function () { f.focus(); }, 60);
  return layer;
}
var TOUCH = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
/* drag the top of a sheet down to close it (only when the sheet is scrolled to its top) */
function swipeToClose(sh) {
  if (!sh) return; var y0 = null, dy = 0;
  sh.addEventListener('touchstart', function (e) { if (sh.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; } var r = sh.getBoundingClientRect(); if (e.touches[0].clientY - r.top > 90) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
  sh.addEventListener('touchmove', function (e) { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = dy ? 'translateY(' + dy + 'px)' : ''; }, { passive: true });
  sh.addEventListener('touchend', function () { if (y0 == null) return; y0 = null; sh.style.transition = 'transform .25s var(--spring)'; if (dy > 90) { sh.style.transform = 'translateY(110%)'; setTimeout(closeLayer, 180); } else sh.style.transform = ''; });
}
function closeLayer() { stopScanner();
  try { var L = $('#layer'), sc = L.firstElementChild; if (sc && !sc.querySelector('video,canvas')) { var g = document.getElementById('layer-ghost'); if (g) g.remove(); g = document.createElement('div'); g.id = 'layer-ghost'; g.setAttribute('aria-hidden', 'true'); g.appendChild(sc); g.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); }); document.body.appendChild(g); setTimeout(function () { g.remove(); }, 190); } } catch (e) {}
  $('#layer').innerHTML = ''; if (window.Aura && window.Aura.hold) window.Aura.hold(false); if (window.Puzzle) window.Puzzle.hold(false); pending = null; pendingScan = null; portionState = null; setTimeout(nextInbox, 450); }
function confirmBox(title, msg, okLabel, onOk, danger) {
  openLayer(win(esc(title), '<p class="muted" style="margin:0 0 14px">' + esc(msg) + '</p><div class="row end"><button class="btn ghost" data-act="close">Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" id="cb-ok">' + esc(okLabel) + '</button></div>', danger ? 'danger' : ''), { center: true });
  $('#cb-ok').onclick = function () { closeLayer(); onOk(); };
}

/* ───────────── persistence ───────────── */
function persist(quiet) {
  try { var nt = opNudgeText(); S.meta.nudge = { day: today(), text: nt || '' }; } catch (e0) {}
  if (quiet !== true) S.meta.changedAt = Math.max(Date.now(), (S.meta.changedAt || 0) + 1); // when this copy last really changed
  if (!store.save(S)) { if (!storageBlocked) toast('Couldn’t save on this device. Export a backup in Settings.', { bad: true, ms: 5000 }); else if (quiet !== true && !saveWarned) { saveWarned = true; toast('Not saved: this window cannot store anything. Open Winter Arc from its web address or your Home Screen icon.', { bad: true, ms: 8000 }); } }
  if (quiet === true) return;
  changeSeq++; setDirty(true);
  scheduleCloud();
}
/* ── always-on sync: every change is saved on the device at once, then sent to your cloud copy ── */
var DIRTY_KEY = 'rtl_dirty', PUSH_KEY = 'rtl_push', BACKUP_KEY = 'rtl_backups', PUSH_GAP_MS = 6000;
var changeSeq = 0, pushing = false, syncBusy = false, syncGen = 0, lastPushAt = -1e9;
function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function isDirty() { return ls(DIRTY_KEY) === '1'; }
function setDirty(v) { lsSet(DIRTY_KEY, v ? '1' : null); paintSync(); }
function cloudBase() { return ls(CLOUD_AT_KEY) || null; }
/* the last few uploads this device sent (a retry gets a new ID, so one is not enough to recognise its own copy in the cloud) */
function pushLog() { try { var a = JSON.parse(ls(PUSH_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (o) { return o && typeof o.id === 'string'; }) : []; } catch (e) { return []; } }
function notePush(id, changedAt) { var a = pushLog(); a.unshift({ id: id, changedAt: changedAt }); lsSet(PUSH_KEY, JSON.stringify(a.slice(0, 6))); }
function ownPush(id) { return id ? pushLog().filter(function (o) { return o.id === id; })[0] || null : null; }
var hostedCaps = null; if (HOSTED) window.WA_caps().then(function (c) { hostedCaps = c; try { paintSync(); } catch (e) {} });
function syncOn() { return connected() && (HOSTED || S.settings.cloud); }
function syncInfo() {
  if (!connected()) return { c: 'off', icon: '○', text: 'Saved on this device only. Connect the System in Settings to sync to the cloud.' };
  if (HOSTED && hostedCaps && !hostedCaps.db) return { c: 'bad', icon: '!', text: 'Your Claude account’s storage can’t be reached in this view, so changes are only on this device for now. Open Winter Arc inside Claude while signed in.' };
  if (!S.settings.cloud) return { c: 'off', icon: '○', text: 'Cloud sync is switched off. Everything is still saved on this device.' };
  if (cloudState === 'auth') return { c: 'bad', icon: '!', text: 'The System refused your app key, so nothing is being synced. Check the key in Settings.' };
  if (cloudState === 'locked') return { c: 'bad', icon: '!', text: 'Too many wrong app keys were tried, so the System is locked for 15 minutes. Check the key in Settings, then try again.' };
  if (cloudState === 'old') return { c: 'bad', icon: '!', text: 'Your Cloudflare Worker is an older version. Paste the new worker.js into it, then sync again.' };
  if (cloudState === 'conflict') return { c: 'bad', icon: '!', text: 'This device and the cloud have different data. Tap to choose which to keep.' };
  if (pushing || cloudState === 'saving') return { c: 'busy', icon: '↻', text: 'Saving to the cloud…' };
  var at = cloudBase(), unsent = isDirty() || (!at && R.stateSummary(S).days > 0); // a device that has never synced and holds logged days has something waiting, whatever the flag says
  if (unsent) return navigator.onLine === false ? { c: 'warn', icon: '↑', text: 'Offline. Saved on this device; it will sync when you’re back online.' } : cloudState === 'error' ? { c: 'warn', icon: '↑', text: 'Saved on this device. The cloud couldn’t be reached; it retries automatically.' } : { c: 'busy', icon: '↻', text: 'Saving to the cloud…' };
  if (!at && cloudState === '') return { c: 'busy', icon: '↻', text: 'Checking your cloud copy…' }; // connected, never synced, and the first look has not come back yet
  return { c: 'ok', icon: '✓', text: 'Synced' + (at ? ' at ' + new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '') + '.' };
}
function paintSync() { var el = document.getElementById('syncdot'); if (!el) return; var i = syncInfo(); el.className = 'syncdot ' + i.c; el.textContent = i.icon; el.setAttribute('aria-label', i.text); el.dataset.state = i.c; }
function stopped() { return cloudState === 'auth' || cloudState === 'locked' || cloudState === 'old'; } // these need you, not another try
/* uploads are spaced out: 1.5s after a change, but never within 6s of the last one (leaving the app sends at once) */
function scheduleCloud(ms) {
  if (!syncOn() || stopped() || cloudState === 'conflict') return; // two versions waiting for your choice: nothing is sent until you pick one
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudPush, Math.max(ms == null ? 1500 : ms, lastPushAt + PUSH_GAP_MS - performance.now(), 0));
}
function cloudFail(status, j, manual) {
  if (status === 401) { cloudState = 'auth'; paintSync(); if (manual) toast('The System refused your app key. Check it in Settings.', { bad: true, ms: 6000 }); return true; }
  if (status === 429 && j && j.locked) { cloudState = 'locked'; paintSync(); if (manual) toast(j.error || 'Locked for 15 minutes.', { bad: true, ms: 6000 }); return true; }
  return false;
}
function cloudPush(manual, opts) {
  opts = opts || {};
  if (!connected()) { if (manual === true) toast('Connect the System first.', { bad: true }); return Promise.resolve(false); }
  if (pushing) { scheduleCloud(2000); return Promise.resolve(false); }
  clearTimeout(cloudTimer); pushing = true; cloudState = 'saving'; lastPushAt = performance.now(); paintSync();
  var gen = syncGen, seq = changeSeq, sum = R.stateSummary(S), id = 'u' + R.uid(), base = cloudBase();
  notePush(id, sum.changedAt); // so this device can recognise its own upload if the reply gets lost
  var url = apiBase() + '/sync?v=2&id=' + id + '&days=' + sum.days + (sum.kg != null ? '&kg=' + sum.kg : '') + '&changed=' + sum.changedAt + (base ? '&base=' + encodeURIComponent(base) : '') + (opts.force ? '&force=1' : '');
  var init = { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-App-Key': conn.key }, body: JSON.stringify(S) };
  if (opts.keepalive) init.keepalive = true;
  return fetchT(url, init, 15000)
    .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
    .then(function (x) {
      if (gen !== syncGen) return false; // the device was reset while this was on its way: its result no longer means anything here
      pushing = false;
      if (x.r.ok && x.j.ok) { cloudState = 'ok'; retryMs = 5000; lsSet(CLOUD_AT_KEY, x.j.savedAt); if (seq === changeSeq) setDirty(false); else scheduleCloud(); paintSync(); if (manual === true) toast('Synced to the cloud.'); return true; }
      if (x.r.status === 409) { cloudState = 'ok'; paintSync(); syncCheck(manual === true); return false; }
      if (cloudFail(x.r.status, x.j, manual === true)) return false;
      if (x.r.status === 400 && /missing data|not valid JSON/i.test(x.j.error || '')) { cloudState = 'old'; paintSync(); if (manual === true) toast(syncInfo().text, { bad: true, ms: 7000 }); return false; }
      cloudState = 'error'; paintSync(); retryLater(); if (manual === true) toast(x.j.error || 'Cloud sync failed.', { bad: true }); return false;
    }).catch(function () { if (gen !== syncGen) return false; pushing = false; cloudState = 'error'; paintSync(); retryLater(); if (manual === true) toast('Couldn’t reach the System. Saved on this device; it will retry.', { bad: true }); return false; });
}
var retryMs = 5000;
function retryLater() { if (!syncOn() || !isDirty()) return; scheduleCloud(retryMs); retryMs = Math.min(retryMs * 2, 120000); }
function getJSON(path, ms) { return fetchT(apiBase() + path, { headers: { 'X-App-Key': conn.key } }, ms || 15000).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }); }
function fmtWhen(t) { if (!t) return 'date unknown'; var d = new Date(t); return isNaN(d.getTime()) ? 'date unknown' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function sumLine(sum) { return sum.days + ' logged day' + (sum.days === 1 ? '' : 's') + (sum.kg != null ? ' · last weight ' + n1(sum.kg) + 'kg' : ''); }
/* compare this device with the cloud copy and bring them in line. Only the details are fetched first; the copy itself only when it is needed. */
function syncCheck(manual) {
  if (!syncOn() || syncBusy) return Promise.resolve();
  syncBusy = true; var gen = syncGen;
  function fail(msg) { cloudState = 'error'; paintSync(); if (manual) toast(msg || 'Cloud sync failed.', { bad: true }); }
  function full() { return getJSON('/sync').then(function (x) { if (!x.r.ok || !x.j.ok) throw { server: x.j.error || 'Cloud sync failed.' }; var next = x.j.data ? R.migrate(x.j.data) : null; return { has: !!x.j.data, savedAt: x.j.savedAt || null, pushId: x.j.pushId || null, sum: next ? R.stateSummary(next) : null, next: next }; }); }
  function decide(c) {
    if (gen !== syncGen) return;
    var lp = ownPush(c.pushId), loc = R.stateSummary(S), mine = !!lp;
    var what = R.syncDecision({ localDays: loc.days, cloudDays: c.sum ? c.sum.days : 0, dirty: isDirty(), base: cloudBase(), cloudSavedAt: c.savedAt, cloudHasData: c.has, localChangedAt: loc.changedAt, cloudChangedAt: c.sum ? c.sum.changedAt : 0, mine: mine, changedSincePush: mine && lp.changedAt !== loc.changedAt });
    if (what === 'ack') { lsSet(CLOUD_AT_KEY, c.savedAt); cloudState = 'ok'; setDirty(false); if (manual) toast('Already in sync.'); return; }
    if (what === 'push') { if (mine) lsSet(CLOUD_AT_KEY, c.savedAt); syncBusy = false; return cloudPush(manual); }
    if (what === 'none') { cloudState = 'ok'; paintSync(); if (manual) toast('Already in sync.'); return; }
    return (c.next ? Promise.resolve(c) : full()).then(function (f) {
      if (gen !== syncGen || !f.next) return;
      if (what === 'adopt') { adoptCloud(f.next, f.savedAt, 'Replaced by the cloud copy'); toast('Loaded your data from the cloud (' + f.sum.days + ' logged day' + (f.sum.days === 1 ? '' : 's') + ').'); return; }
      cloudState = 'conflict'; paintSync();
      if ($('#layer').innerHTML && !manual) return; // never interrupt what you're doing; the ! badge stays until you tap it
      openLayer(win('TWO VERSIONS OF YOUR DATA', '<p class="muted" style="margin:0 0 12px">This device and the cloud hold different data. Pick the one to keep. The other one is not thrown away: the copy replaced on this device is saved here, and a replaced cloud copy is kept in the cloud for 30 days. Both are under Settings → Restore an earlier version.</p>' +
        '<div class="kv"><span>This device<br><small class="dim">changed ' + esc(fmtWhen(loc.changedAt)) + '</small></span><b id="cf-mine">' + esc(sumLine(loc)) + '</b></div><div class="kv"><span>Cloud<br><small class="dim">changed ' + esc(fmtWhen(f.sum.changedAt || f.savedAt)) + '</small></span><b id="cf-cloud">' + esc(sumLine(f.sum)) + '</b></div>' +
        '<div class="row end" style="margin-top:14px"><button class="btn ghost" data-act="close">Decide later</button><button class="btn" id="keep-cloud">Keep cloud</button><button class="btn primary" id="keep-phone">Keep this device</button></div>', 'violet'), { center: true });
      $('#keep-phone').onclick = function () { closeLayer(); cloudState = 'ok'; cloudPush(true, { force: true }); };
      $('#keep-cloud').onclick = function () { closeLayer(); adoptCloud(f.next, f.savedAt, 'Replaced when you kept the cloud copy'); toast('Loaded your data from the cloud. This device’s copy is saved under Restore an earlier version.', { ms: 6000 }); };
    });
  }
  return getJSON('/sync?meta=1').then(function (x) {
    if (gen !== syncGen) return;
    if (cloudFail(x.r.status, x.j, manual)) return;
    if (!x.r.ok || !x.j.ok) { fail(x.j.error); return; }
    var m = x.j;
    if (m.has === undefined) { var next = m.data ? R.migrate(m.data) : null; return decide({ has: !!m.data, savedAt: m.savedAt || null, pushId: null, sum: next ? R.stateSummary(next) : null, next: next }); } // an older worker sends the whole copy
    if (m.has && m.days == null) return full().then(decide); // a copy stored by the older worker has no details beside it yet
    return decide({ has: !!m.has, savedAt: m.savedAt || null, pushId: m.pushId || null, sum: m.has ? { days: m.days, kg: m.kg, changedAt: m.changedAt || 0 } : null, next: null });
  }).catch(function (e) { if (gen === syncGen) fail(e && e.server ? e.server : 'Couldn’t reach the System.'); }).then(function () { syncBusy = false; });
}
/* the copy being replaced is always kept on this device first (the last 3), so nothing is lost by taking another version */
function backups() { try { var a = JSON.parse(ls(BACKUP_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.state && typeof x.state === 'object'; }) : []; } catch (e) { return []; } }
function backupLocal(why) {
  var sum = R.stateSummary(S); if (!sum.days) return false;
  var list = backups(); list.unshift({ at: Date.now(), why: String(why || ''), days: sum.days, kg: sum.kg, state: S }); list = list.slice(0, 3);
  while (list.length && !lsSet(BACKUP_KEY, JSON.stringify(list))) list.pop(); // storage full: drop the oldest until it fits
  return list.length > 0;
}
function loadState(next) { S = R.normalize(next); lastPRCount = R.strengthLog(S).prs.length; lastQuestDone = null; lastWeigh = weighMap(); housekeeping(); duelsBegin(); checkEvents(true); setTimeout(function () { try { restartNote(); } catch (e) { reportErr(e, 'restart note'); } }, 700); }
/* the bosses begin on day one of the arc, or the day the app is first opened if that is later (also after a reset, a restore or a copy loaded from the cloud) */
function duelsBegin() { if (!R.duelStart(S)) S.duels.start = today() > S.profile.startDate ? today() : S.profile.startDate; }
/* quiet upkeep whenever the app opens, the day rolls over or another copy is loaded: every finished day keeps the targets it was judged against */
function housekeeping() { try { opStart(); } catch (e0) { reportErr(e0, 'operation'); } try { R.freezeDays(S, today()); R.lockHeroWeeks(S, today()); } catch (e) { reportErr(e, 'housekeeping'); } }
function adoptCloud(next, savedAt, why) {
  backupLocal(why || 'Replaced by the cloud copy');
  loadState(next); persist(true);
  lsSet(CLOUD_AT_KEY, savedAt); cloudState = 'ok'; setDirty(false); render();
}
/* swap this device (and, with sync on, the cloud) for another version. What is here now is kept first. */
function restoreVersion(next, label) {
  backupLocal('Before restoring ' + label);
  loadState(next); persist(); render();
  if (syncOn() && !stopped()) cloudPush(true, { force: true }); // the cloud copy this replaces is kept by the System for 30 days
}
/* leaving the app: send anything still waiting, straight away */
function flushSync() { if (syncOn() && isDirty() && !pushing && !stopped()) cloudPush(false, { keepalive: JSON.stringify(S).length < 60000 }); }
function fetchT(url, init, ms) {
  if (HOSTED) return window.WA_fetch(url, init); // Claude can take a while to answer and ends an over-long call itself
  var ctrl = new AbortController(); init = Object.assign({}, init, { signal: ctrl.signal });
  var t = setTimeout(function () { ctrl.abort(); }, ms || 15000);
  return fetch(url, init).finally(function () { clearTimeout(t); });
}

/* after every change: save, fire events, re-render */
/* weigh-ins as they stood after the last change: lets the app notice one being corrected or removed */
function weighMap() { var o = {}; R.weightSeries(S).forEach(function (w) { o[w.key] = w.kg; }); return o; }
var lastWeigh = weighMap();
/* the days whose existing weigh-in was changed or removed since the last look (a reading on a new day is not a correction) */
function weighFixed() { var now = weighMap(), days = Object.keys(lastWeigh).filter(function (d) { return now[d] !== lastWeigh[d]; }); lastWeigh = now; return days; }
/* the nearest other weigh-in (or your start weight) when a new reading is more than 2kg away from it */
function weighJump(k, v) {
  var near = null; R.weightSeries(S).forEach(function (w) { if (w.key !== k && (!near || Math.abs(R.diffDays(w.key, k)) <= Math.abs(R.diffDays(near.key, k)))) near = w; });
  var ref = near ? near.kg : S.profile.startKg; return Math.abs(v - ref) > 2 ? { kg: ref, when: near ? R.fmtDate(near.key) : 'your start weight' } : null;
}
function jumpText(v, j) { return n1(v) + 'kg is ' + n1(Math.abs(v - j.kg)) + 'kg away from ' + (j.when === 'your start weight' ? 'your start weight of ' + n1(j.kg) + 'kg' : 'your ' + n1(j.kg) + 'kg on ' + j.when) + '.'; }
function afterChange(anchor) {
  var k = today();
  var before = lastQuestDone;
  var fixed = weighFixed();
  if (fixed.length) { // a weigh-in was corrected or removed: take back anything only the wrong number earned
    var rc = R.recalcProgress(S, k), hu = R.heroStatus(S, k).unlocked, hw = Object.keys(S.heroes.seen).filter(function (j) { return +j >= hu; }).length; Object.keys(S.heroes.seen).forEach(function (j) { if (+j >= hu) delete S.heroes.seen[j]; });
    if (S.player.title && R.titles(S, k).indexOf(S.player.title) < 0) S.player.title = '';
    if (rc.removed.length || hw) toast('Weigh-in corrected.' + (rc.removed.length ? ' ' + rc.removed.length + ' award' + (rc.removed.length === 1 ? '' : 's') + ' that only the old number earned ' + (rc.removed.length === 1 ? 'was' : 'were') + ' taken back.' : '') + (hw ? ' ' + (hw === 1 ? 'A hero' : hw + ' heroes') + ' only the old number freed ' + (hw === 1 ? 'is' : 'are') + ' chained again.' : ''), { ms: 7000 });
  }
  housekeeping();
  checkEvents();
  persist();
  render();
  setTimeout(maybeHeroReveal, 700);
  var q = R.questStatus(S, k), now = {};
  q.forEach(function (x) { now[x.id] = x.done; });
  if (before && !R.seasonOver(S, k) && !R.notStarted(S, k)) { // outside the arc a finished quest earns nothing, so nothing floats up
    var delay = 0;
    q.forEach(function (x) { if (x.done && !before[x.id]) { (function (xx, dl) { setTimeout(function () { floatText('+' + xx.xp + ' XP', false, anchor); floatText('+' + xx.gold + ' G', true, anchor); pieceBurst(anchor); }, dl); })(x, delay); delay += 260; vib(30); beep('tick'); } });
  }
  lastQuestDone = now;
}
function checkEvents(silent) {
  var k = today(), evs = [];
  var na = R.newAchievements(S, k);
  na.forEach(function (a) { S.player.ach[a.id] = k; });
  var p = R.player(S, k);
  if (p.level > S.player.maxLevel) S.player.maxLevel = p.level;
  if (p.level > S.player.seenLevel) {
    var oldRank = R.rankFor(S.player.seenLevel);
    evs.push({ type: p.rank !== oldRank ? 'rank' : 'level', level: p.level, rank: p.rank });
    S.player.seenLevel = p.level;
  }
  if (na.length > 3) evs.push({ type: 'achs', list: na });
  else na.forEach(function (a) { evs.push({ type: 'ach', a: a }); });
  var ms = R.kgMilestones(S);
  if (ms > S.player.seenKgMilestone) { evs.push({ type: 'kg', kg: ms }); S.player.seenKgMilestone = ms; }
  var b = R.bossFor(S, R.mondayOf(k), k);
  if (b.defeated && !S.player.bossLoot[b.monday]) { S.player.bossLoot[b.monday] = k; evs.push({ type: 'boss', b: b }); }
  if (!R.seasonOver(S, k) && !R.notStarted(S, k) && R.isClear(S, k) && S.player.clearSeen !== k) { S.player.clearSeen = k; evs.push({ type: 'clear' }); }
  var prs = R.strengthLog(S).prs;
  if (prs.length > lastPRCount) { prs.slice(lastPRCount).forEach(function (pr) { evs.push({ type: 'pr', pr: pr }); }); }
  lastPRCount = prs.length;
  if (evs.length && !silent) { evQueue = evQueue.concat(evs); runEvents(); }
}
function runEvents() {
  if (evShowing || !evQueue.length) return;
  if ($('.ceremony')) { clearTimeout(runEvents.t); runEvents.t = setTimeout(runEvents, 400); return; } // one full-screen moment at a time (a boss or hero may be on screen)
  var e = evQueue.shift(); evShowing = true;
  function next() { evShowing = false; setTimeout(runEvents, 250); }
  if (e.type === 'level') { beep('level'); vib([80, 40, 80]); confetti(60, true); ceremony('LEVEL UP', String(e.level), 'You reached level ' + e.level + '. Keep stacking days.', 'lvlpiece', next, false, goldPieceHTML('LV', e.level)); }
  else if (e.type === 'rank') { beep('level'); vib([120, 60, 120, 60, 200]); confetti(110, true); ceremony('RANK UP · ' + e.rank + '-RANK', e.rank, 'Level ' + e.level + '. You are now ' + e.rank + '-Rank. The title “' + e.rank + '-Rank Player” is unlocked.', 'rank lvlpiece', next, false, goldPieceHTML('LV', e.level)); }
  else if (e.type === 'ach') { beep('win'); vib([80, 40, 80]); confetti(50); ceremony('ACHIEVEMENT', e.a.icon, e.a.name + ' · ' + e.a.series + '\n' + e.a.desc + ' · +50 XP · +15 gold', '', next, true); }
  else if (e.type === 'achs') { beep('win'); confetti(70); toast(e.list.length + ' achievements unlocked. See Awards.', { icon: '🏅', ms: 4000 }); next(); }
  else if (e.type === 'kg') { beep('win'); vib([80, 40, 80]); confetti(70); ceremony('MILESTONE', '−' + e.kg + 'kg', 'From ' + n1(S.profile.startKg) + 'kg. +200 XP · +50 gold.', '', next); }
  else if (e.type === 'boss') { beep('win'); vib([120, 60, 120]); confetti(90); ceremony('BOSS DEFEATED', e.b.icon, e.b.name + ' falls. +300 XP · +100 gold.\nLoot: title “' + e.b.loot + '”.', 'rank', next, true); }
  else if (e.type === 'clear') { beep('win'); vib([60, 30, 60, 30, 120]); luckPop(); confetti(36); toast('Daily Clear. Every quest done today. +100 XP', { icon: '✦', ms: 3500 }); next(); }
  else if (e.type === 'pr') { beep('win'); vib([80, 40, 80]); toast('New PR: ' + e.pr.name + ' ' + n1(e.pr.from) + ' → ' + n1(e.pr.to) + ' ' + e.pr.unit + (e.pr.day >= S.profile.startDate && e.pr.day <= S.profile.seasonEnd ? '. +25 XP' : '.'), { icon: '💥', ms: 4000 }); next(); }
  else next();
}
/* the gold puzzle piece (after Pavi's LUCK piece): a big jigsaw piece in polished gold with the level engraved on it */
function piecePathD(e) { // the same jigsaw outline the floating pieces use, as an SVG path in a 100×100 box
  var d = 'M20 20', L = 20, R = 80, T = 20, B = 80;
  function edge(x0, y0, x1, y1, k) {
    if (!k) { d += 'L' + x1 + ' ' + y1; return; }
    var dx = x1 - x0, dy = y1 - y0, nx = dy / 60 * k, ny = -dx / 60 * k;
    function p(t, n) { return [x0 + dx * t + nx * n, y0 + dy * t + ny * n]; }
    function f(v) { return v.map(function (x) { return Math.round(x * 100) / 100; }).join(' '); }
    var a = p(0.36, 0), b = p(0.40, 9), c = p(0.30, 19), m = p(0.5, 20), ee = p(0.70, 19), ff = p(0.60, 9), h = p(0.64, 0);
    d += 'L' + f(a) + 'C' + f([a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2]) + ' ' + f(b) + ' ' + f([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]) +
      'C' + f(c) + ' ' + f([m[0] - dx * 0.1, m[1] - dy * 0.1]) + ' ' + f(m) + 'C' + f([m[0] + dx * 0.1, m[1] + dy * 0.1]) + ' ' + f(ee) + ' ' + f([(ee[0] + ff[0]) / 2, (ee[1] + ff[1]) / 2]) +
      'C' + f(ff) + ' ' + f([h[0] + (ff[0] - h[0]) * 0.2, h[1] + (ff[1] - h[1]) * 0.2]) + ' ' + f(h) + 'L' + x1 + ' ' + y1;
  }
  edge(L, T, R, T, e[0]); edge(R, T, R, B, e[1]); edge(R, B, L, B, e[2]); edge(L, B, L, T, e[3]); return d + 'Z';
}
function goldPieceHTML(label, value) {
  var d = piecePathD([1, -1, 1, 1]), v = String(value), fs = v.length > 2 ? 30 : v.length > 1 ? 38 : 44;
  return '<span class="goldpiece" role="img" aria-label="' + esc(label === 'LV' ? 'Level ' + v : label + ' ' + v) + '"><svg viewBox="-6 -6 112 112" aria-hidden="true">' +
    '<defs><linearGradient id="gpG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF7D1"/><stop offset=".28" stop-color="#FFD866"/><stop offset=".55" stop-color="#C98A12"/><stop offset=".78" stop-color="#FFE48C"/><stop offset="1" stop-color="#9C6508"/></linearGradient>' +
    '<linearGradient id="gpE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9DE"/><stop offset="1" stop-color="#7A4C00"/></linearGradient>' +
    '<radialGradient id="gpS" cx=".32" cy=".26" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<clipPath id="gpC"><path d="' + d + '"/></clipPath></defs>' +
    '<path d="' + d + '" transform="translate(2.2 3)" fill="#5a3900"/>' +
    '<path d="' + d + '" fill="url(#gpG)" stroke="url(#gpE)" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="' + d + '" fill="none" stroke="#FFF4C2" stroke-opacity=".7" stroke-width=".9" transform="translate(50 50) scale(.9) translate(-50 -50)"/>' +
    '<g clip-path="url(#gpC)"><path d="' + d + '" fill="url(#gpS)"/><rect class="gp-sweep" x="-60" y="-10" width="28" height="130" fill="#fff" opacity=".55" transform="skewX(-18)"/></g>' +
    '<text x="50" y="40" text-anchor="middle" class="gp-l">' + esc(label) + '</text>' +
    '<text x="50" y="' + (66 + (44 - fs) / 4) + '" text-anchor="middle" class="gp-v" style="font-size:' + fs + 'px">' + esc(v) + '</text></svg></span>';
}
/* Daily Clear: Pavi's own gold LUCK piece flies up, glowing, with gold pieces bursting round it */
function luckPop() {
  if (calm()) return; var src = artSrc('art/x/luck.webp'); if (!src) return;
  var d = document.createElement('div'); d.className = 'luckpop'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<i class="lp-glow"></i><img src="' + src + '" alt=""><b>DAILY CLEAR</b>';
  document.body.appendChild(d); setTimeout(function () { if (window.Puzzle) window.Puzzle.burst(window.innerWidth / 2, window.innerHeight * 0.42, 'gold'); }, 380);
  setTimeout(function () { d.remove(); }, 2600);
}
function ceremony(kicker, big, sub, cls, done, emoji, bigHTML) {
  var d = document.createElement('div');
  d.className = 'ceremony ' + (cls || '');
  d.innerHTML = '<div class="cer-ring"></div><div class="cer-in"><div class="cer-k">' + esc(kicker) + '</div><div class="cer-big"' + (emoji ? ' style="font-size:84px"' : '') + '>' + (bigHTML || esc(big)) + '</div><div class="cer-sub">' + esc(sub).replace(/\n/g, '<br>') + '</div><button class="btn primary" style="min-width:160px">Continue</button></div>';
  document.body.appendChild(d);
  function close() { d.remove(); done && done(); }
  $('button', d).onclick = close; setTimeout(function () { $('button', d) && $('button', d).focus(); }, 50);
}

/* ───────────── render dispatcher ───────────── */
/* "tomorrow" or "in 5 days", for the days before the arc */
function startsWhen(k) { var n = R.diffDays(k, S.profile.startDate); return n === 1 ? 'tomorrow' : 'in ' + n + ' days'; }
var RENDERERS = null;
function render(dir) {
  var k = today(), type = R.dayType(S, k), dp = $('#daypill');
  dp.innerHTML = esc(R.fmtDate(k)) + ' · <b>' + (R.seasonOver(S, k) ? 'Arc complete' : R.notStarted(S, k) ? 'Starts ' + startsWhen(k) : ({ gym: 'Gym', football: 'Football', rest: 'Rest' })[type]) + '</b>';
  dp.style.setProperty('--c', type === 'gym' ? 'var(--train)' : type === 'football' ? 'var(--steps)' : 'var(--sleep)');
  $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'); b.style.setProperty('--c', TABCOL[b.dataset.tab]); });
  // only the view being switched to changes class, so a re-render after a tap never makes the browser lay out twice
  $$('.view').forEach(function (v) {
    var on = v.id === 'v-' + tab;
    if (!on) { if (v.classList.contains('on')) v.classList.remove('on', 'from-r', 'from-l'); return; }
    if (!v.classList.contains('on')) { v.classList.remove('from-r', 'from-l'); if (dir) v.classList.add(dir > 0 ? 'from-r' : 'from-l'); v.classList.add('on'); }
  });
  document.body.classList.toggle('calm', S.settings.motion === 'reduced'); applyTheme();
  if (window.Aura) window.Aura.calm = calm();
  snowCtl();
  RENDERERS = RENDERERS || { status: renderStatus, log: renderLog, body: renderBody, stats: renderStats, aura: renderAura, bosses: renderBosses };
  try { RENDERERS[tab](); } catch (e) { reportErr(e, 'screen ' + tab); var v = $('#v-' + tab); if (v) { v.innerHTML = failCard('THIS SCREEN'); v._html = null; } }
  // VF: on a tab switch the new screen shows first; the character moves into it on the next frame (measuring the screen
  // straight away would hold up that first frame)
  if (dir) { var at = tab; requestAnimationFrame(function () { requestAnimationFrame(function () { if (tab === at) { try { mountAura(); } catch (e3) { reportErr(e3, 'aura'); } } }); }); }
  else { try { mountAura(); } catch (e2) { reportErr(e2, 'aura'); } }
}
function setTab(t) { if (t === tab || TAB_ORDER.indexOf(t) < 0) return; var dir = TAB_ORDER.indexOf(t) - TAB_ORDER.indexOf(tab); tab = t; if (t !== 'log') viewDay = null; render(dir); window.scrollTo(0, 0); }

/* ───────────── today's character and their aura ───────────── */
/* one of the 85 characters a day, in this save's own random order (core.js), shown on Home and in the Body tab */
function auraNow() { return R.auraToday(S, today()); }
function auraVars(a) { return '--aura:' + a.palette.hex + ';--aura-l:' + a.palette.lightHex + ';--aura-t:' + a.palette.textHex; }
function mountAura() {
  var el = $('#v-' + tab + ' .aura-mount'); if (!el || !window.Aura) return;
  var a = auraNow(), pn = +el.dataset.pick;
  if (pn && pn !== a.n) { var o = R.auraInfo(pn - 1); if (o) { o.palette = R.auraPalette(o.hex); a = o; } }
  window.Aura.calm = calm();
  window.Aura.show(el, { n: a.n, src: (window.RTL_ART || {})[a.art] || '', palette: a.palette }, el.dataset.mode === 'mini' ? 'mini' : 'full');
}
if (window.Aura) window.Aura.onFail = function () { reportErr(new Error(window.Aura.error || 'aura stopped'), 'aura'); };

/* ───────────── STATUS (home) ───────────── */
/* the player's picture: their own photo in a circle with a thin black outline, the XP ring round it, the level on a badge */
function avatarHTML(p, big) {
  var C = 2 * Math.PI * 31, ph = S.profile.photo;
  var ring = '<svg class="xpring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="31" fill="none" stroke="rgba(var(--acc-line),.18)" stroke-width="4"/>' +
    '<circle cx="36" cy="36" r="31" fill="none" stroke="var(--holo)" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (C * Math.max(0.02, p.pct)).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>';
  var face = ph ? '<img class="av-img" src="' + ph + '" alt="">' : '<span class="av-none" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.5" r="4.2"/><path d="M3.8 20.5c.9-4 4.2-6.3 8.2-6.3s7.3 2.3 8.2 6.3z"/></svg><i class="av-plus">+</i></span>';
  return '<button class="avatar' + (big ? ' big' : '') + '" data-act="avatar" aria-label="' + (ph ? 'Your profile picture. Change it' : 'Add a profile picture') + '">' + ring + '<span class="av-face">' + face + '</span><b class="av-lv num" title="Level">' + p.level + '</b></button>';
}
function ringsSVG(list) {
  var radii = [66, 53, 40, 27], out = '<svg viewBox="0 0 150 150" aria-hidden="true">';
  list.forEach(function (r, i) {
    var R0 = radii[i], C = 2 * Math.PI * R0, pct = r.tgt ? r.val / r.tgt : 0, over = r.id === 'kcal' && r.val > r.tgt + R.dayRules(S, today()).calTol;
    out += '<circle cx="75" cy="75" r="' + R0 + '" fill="none" stroke="' + r.col + '" stroke-opacity=".16" stroke-width="10"/>' +
      '<circle class="ring-arc" cx="75" cy="75" r="' + R0 + '" fill="none" stroke="' + (over ? '#FF6B8E' : r.col) + '" stroke-opacity="' + (r.val > 0 ? 1 : 0) + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * Math.min(1, Math.max(0.001, pct))).toFixed(1) + ' ' + C.toFixed(1) + '" style="filter:drop-shadow(0 0 4px ' + r.col + ')"/>';
  });
  return out + '</svg>';
}
function renderStatus() {
  var k = today(), html = '', gold = null;
  html += safe('PLAYER', function () {
    var p = R.player(S, k), st = R.streaks(S, k), j = R.journey(S, k), ch = auraNow(); gold = p.gold;
    var h = '<div class="win hero"><div style="position:relative;z-index:1"><div class="emblem">' + avatarHTML(p) + '<div><div class="pname">' + esc(S.profile.name.toUpperCase()) + ' <span class="prank" title="Rank">' + esc(p.rank) + '-RANK</span></div><div class="ptitle">' + (S.player.title ? esc(S.player.title) : '<span class="dim">No title equipped</span>') + '</div></div></div>' +
      '<div class="lvl"><span class="dim">Level</span><span class="n num">' + p.level + '</span><span class="dim num" style="font-size:12px">' + n0(p.intoLevel) + ' / ' + n0(p.levelSpan) + ' XP</span></div><div class="xpbar"><i style="width:' + Math.round(p.pct * 100) + '%"></i></div>' +
      '<div class="chips"><button class="chip lift" style="--c:var(--gold)" data-act="shop">◈ <span class="num" id="st-gold" data-from="' + (renderStatus.gold == null ? p.gold : renderStatus.gold) + '">' + n0(p.gold) + '</span></button>' +
      '<span class="chip" style="--c:var(--kcal)" title="Daily Clear streak"><span class="flame" style="font-size:' + (14 + Math.min(st.clear, 30) * 0.5) + 'px">🔥</span><span class="num">' + st.clear + '</span></span>' +
      '<span class="chip" style="--c:var(--protein)" title="Protein streak">🥩 <span class="num">' + st.protein + '</span></span></div></div>' +
      '<div class="hero-aura aura-mount" data-mode="mini" data-act="tab" data-tab="body" role="button" style="' + auraVars(ch) + '" aria-label="Today’s character: ' + esc(ch.name) + ', ' + esc(ch.aura) + ' aura. Open the Body tab"><div class="aname"><span>' + esc(ch.short) + '</span></div><div class="tag"><span>' + n1(j.current) + 'KG · ' + j.pct + '%</span></div></div></div>';
    renderStatus.gold = p.gold;
    if (st.pendingRestore) h += '<div class="alert red"><span>⛓️</span><div class="grow">Your streak broke yesterday. Clear today’s Penalty Quest to keep ' + st.pendingRestore + ' day' + (st.pendingRestore === 1 ? '' : 's') + ' of it.</div><button class="btn small danger" data-act="tab" data-tab="status">Open</button></div>';
    return h;
  });
  var over = R.seasonOver(S, k), pre = R.notStarted(S, k);
  var op = opOn(k);
  html += safe('WINTER ARC', function () { return over ? finishCardHTML(k) : pre ? startCardHTML(k) : op ? (k >= OPK.end ? opFinishCardHTML(k) : '') + trackerCardHTML(k) : planCardHTML(k); });
  if (op) html += safe('TONIGHT', function () { return nudgeHTML(k); });
  html += safe('TODAY’S BOSS', function () { return over && !R.duelsToday(S, k).length ? '' : duelCardsHTML(k, true); });
  html += safe('TODAY', function () {
    var d = R.getDay(S, k), tot = R.dayTotals(d), ct = R.calTarget(S, k), eb = R.energyBreakdown(S, d), DR = R.dayRules(S, k);
    var rings = [
      { id: 'kcal', label: 'Calories', col: '#F2FAFF', c: 'var(--kcal)', val: tot.cal, tgt: ct, txt: n0(tot.cal) + ' / ' + n0(ct), act: 'open-cmd' },
      { id: 'protein', label: 'Protein', col: '#D6A6FF', c: 'var(--protein)', val: tot.p, tgt: DR.protein, txt: n0(tot.p) + ' / ' + DR.protein + 'g', act: 'open-cmd' },
      { id: 'water', label: 'Water', col: '#38B6F5', c: 'var(--water)', val: d.water, tgt: DR.waterMl, txt: (d.water / 1000).toFixed(2).replace(/\.?0+$/, '') + ' / ' + DR.waterMl / 1000 + 'L', act: 'water' },
      { id: 'steps', label: 'Steps', col: '#4FE3D0', c: 'var(--steps)', val: d.steps, tgt: R.stepsTarget(S, k), txt: n0(d.steps) + ' / ' + n0(R.stepsTarget(S, k)), act: 'steps-sheet' }
    ];
    var left = ct - tot.cal;
    return '<div class="win" style="--c:var(--kcal)"><div class="win-h"><div class="win-t">TODAY</div><div class="win-s">' + (over || pre ? 'Logging only' : ({ gym: 'Gym day', football: 'Football day', rest: 'Rest day' })[R.dayType(S, k)]) + '</div></div>' +
      '<div class="rings"><div class="ringbox">' + ringsSVG(rings) + '<div class="c"><div><b>' + n0(Math.abs(left)) + '</b><br><span>' + (left >= 0 ? 'kcal left' : 'kcal over') + '</span></div></div></div>' +
      '<div class="legend">' + rings.map(function (r) { return '<button class="leg" style="--c:' + r.c + '" data-act="' + r.act + '"' + (r.id === 'water' ? ' data-ml="250"' : '') + '><i></i><span>' + r.label + '</span><b>' + r.txt + '</b></button>'; }).join('') + '</div></div>' +
      '<div class="energy-strip"><div class="estat"><span>Burn</span><b style="color:var(--kcal)">' + n0(eb.tdee) + '</b></div><div class="estat"><span>Eaten</span><b>' + n0(eb.eaten) + '</b></div><div class="estat"><span>Deficit' + (d.foods.length && eb.deficit > R.DEFICIT_AMBER ? ' · big' : '') + '</span><b id="def-now" style="color:' + (d.foods.length ? deficitCol(eb.deficit) : 'var(--ink-2)') + '">' + (eb.deficit < 0 ? '−' : '') + n0(Math.abs(eb.deficit)) + '</b></div></div></div>';
  });
  if (over) html += '<div class="alert cyan" id="arc-over"><span>❄️</span><div>No quests today. The arc ran ' + esc(R.fmtDate(S.profile.startDate).slice(4)) + ' to ' + esc(R.fmtDate(S.profile.seasonEnd).slice(4)) + ' and is complete. You can keep logging food, weight and training, but nothing after ' + esc(R.fmtDate(S.profile.seasonEnd).slice(4)) + ' counts towards XP, streaks or penalties.</div></div>';
  else if (pre) html += '<div class="alert cyan" id="arc-soon"><span>❄️</span><div>The arc starts ' + startsWhen(k) + ', ' + esc(R.fmtDate(S.profile.startDate)) + '. You can log food, weight and training now and it is all kept, but nothing counts towards XP, streaks, bosses or heroes until then. Weigh in on the first morning: everything is measured from your ' + n1(S.profile.startKg) + 'kg start.</div></div>' +
    alertList([function () { return !connected() ? '<div class="alert cyan"><span>🔌</span><div class="grow">Connect the System in Settings for cloud backup and the online food databases. The built-in UK menus and foods work without it.</div><button class="btn small" data-act="settings">Connect</button></div>' : ''; }]);
  else {
    if (op) html += safe('DEFICIT BANK', function () { return bankCardHTML(k); }) + safe('OPERATION', function () { return opAlertsHTML(k); });
    html += planAlertsHTML(k) + alertsHTML(k);
    html += safe('DAILY QUESTS', function () { var q = R.questStatus(S, k), doneN = q.filter(function (x) { return x.done; }).length; return '<div class="sec-h"><h2>' + (op ? 'Today’s checklist' : 'Daily quests') + '</h2><span class="num">' + doneN + '/7 · +' + R.CLEAR_XP + ' XP for all</span></div><div class="tiles">' + q.map(tileHTML).join('') + '</div>'; });
    html += safe('TODAY’S SESSION', function () { return sessionCardHTML(k); });
    if (op) html += '<div style="height:14px"></div>' + safe('REVIEW', function () { return reviewCardHTML(k); }) + safe('VERSE', function () { return verseCardHTML(k); });
    html += '<div style="height:14px"></div>' + safe('WEEKLY BOSS', function () { return bossHTML(R.bossFor(S, R.mondayOf(k), k), true); });
  }
  $('#v-status').innerHTML = html;
  if (gold != null) countUp($('#st-gold'), gold);
}
function tileHTML(x) {
  var hint = x.done ? 'Complete' : ({ water: 'Tap for +250ml', steps: 'Tap to update', training: 'Tap to log', lights: 'Tap at bedtime', bowl: 'Tap to log it', treat: 'Tap to mark it', weigh: 'Tap to weigh in' })[x.id] || 'Tap to log food';
  return '<button class="tile lift ' + (x.done ? 'done' : '') + '" style="--c:' + QCOL[x.id] + '" data-act="qtile" data-q="' + x.id + '"><span class="rw">+' + x.xp + ' XP</span><span class="ic">' + x.icon + '</span><span class="nm">' + esc(x.name) + '</span><span class="vl">' + esc(x.label) + '</span><span class="act">' + hint + '</span><span class="fill" style="width:' + Math.round(x.pct * 100) + '%"></span></button>';
}
/* every alert is worked out on its own: one that fails is skipped, the rest still show */
function alertList(list) { var out = ''; list.forEach(function (fn) { try { var x = fn(); if (x) out += x; } catch (e) { reportErr(e, 'alert'); } }); return out; }
function alertsHTML(k) {
  return alertList([
    function () { var pen = R.penaltyFor(S, k); return pen && !pen.done ? '<div class="alert red"><span>⛓️</span><div><b>Penalty Quest</b><br>' + esc(pen.text) + '<br><span class="dim">You missed a Daily Clear on ' + R.fmtDate(pen.missed) + '.</span></div></div>' : ''; },
    function () { var fw = R.fibreWarning(S, k); return fw ? '<div class="alert"><span>🌿</span><div>Fibre is ' + n1(fw.today) + 'g today vs your ' + n1(fw.avg) + 'g average. Raise it gradually to keep your gut settled.</div></div>' : ''; },
    function () { return R.strengthLog(S).alerts.map(function (a) { return '<div class="alert red"><span>📉</span><div><b>' + esc(a.name) + '</b> is ' + a.dropPct + '% below your best. Protect muscle: keep protein at ' + S.targets.protein + 'g and don’t cut deeper.</div></div>'; }).join(''); },
    function () { var tr = R.trend(S, k); return tr && tr.tooFast ? '<div class="alert red"><span>⚠️</span><div>You’re losing ' + n1(-tr.perWeek) + 'kg a week, faster than the plan’s ' + R.TOO_FAST_KG + 'kg limit. Eat a little more to protect muscle.</div></div>' : ''; },
    function () { if (!R.scanDue(S, k)) return ''; var ls = R.latestScan(S, k); return '<div class="alert violet"><span>🧪</span><div class="grow">Monthly InBody scan due' + (ls ? ' (last one ' + R.fmtDate(ls.date) + ')' : '') + '. +100 XP, more if fat drops.</div><button class="btn small tint" style="--c:var(--train)" data-act="scan-add">Add</button></div>'; },
    function () { return R.photoDue(S, k) ? '<div class="alert cyan"><span>📸</span><div class="grow">Progress photos are due (front + both sides, same light).</div><button class="btn small" data-act="photo-done">Done</button></div>' : ''; },
    function () { return !connected() ? '<div class="alert cyan"><span>🔌</span><div class="grow">Connect the System in Settings for cloud backup and the online food databases. The built-in UK menus and foods work without it.</div><button class="btn small" data-act="settings">Connect</button></div>' : ''; }
  ]);
}
function bossHTML(b, compact) {
  if (!b || !b.hp) return '';
  var pips = ''; for (var i = 0; i < b.hp; i++) pips += '<i class="' + (i < b.dmg ? 'gone' : '') + '"></i>';
  return win('WEEKLY BOSS', '<div class="boss ' + (b.defeated ? 'dead' : '') + '"><div class="bossicon">' + b.icon + '</div><div><div class="qname">' + esc(b.name) + (b.defeated ? ' <span class="holo">· defeated</span>' : '') + '</div><div class="qsub">' + esc(b.desc) + ' this week</div><div class="hp" aria-label="Boss HP ' + b.hpLeft + ' of ' + b.hp + '">' + pips + '</div>' +
    '<div class="qsub num" style="margin-top:4px">HP ' + b.hpLeft + '/' + b.hp + ' · reward +' + b.xp + ' XP, +' + b.gold + ' G' + (compact ? '' : ', title “' + esc(b.loot) + '”') + '</div></div></div>', 'danger', 'Week of ' + R.fmtDate(b.monday));
}

/* ───────────── calisthenics trials (they live on the Bosses screen now) ───────────── */
function trialsHTML() {
  var tr = '';
  Object.keys(R.TRIALS).forEach(function (key) {
    var T = R.TRIALS[key], done = S.trials[key] || 0, nodes = '';
    T.stages.forEach(function (s, i) { if (i) nodes += '<span class="link ' + (i <= done - 1 ? 'on' : '') + '"></span>'; nodes += '<span class="node ' + (i < done ? 'on' : i === done ? 'next' : '') + '" title="' + esc(s) + '">' + (i + 1) + '</span>'; });
    var next = T.stages[done];
    tr += '<div class="trial" style="--c:' + TRIALCOL[key] + '"><div class="row between"><div class="qname">' + T.icon + ' ' + esc(T.name) + '</div><span class="dim num">' + done + '/' + T.stages.length + '</span></div><div class="nodes">' + nodes + '</div>' +
      (next ? '<div class="row between"><span class="qsub">Next: ' + esc(next) + '</span><button class="btn small tint" style="--c:' + TRIALCOL[key] + '" data-act="trial" data-tree="' + key + '">Cleared it</button></div>' : '<span class="holo">Trial complete</span>') + '</div>';
  });
  return win('CALISTHENICS TRIALS', tr, 'violet', '+50 XP, +20 G per stage');
}

/* ───────────── LOG ───────────── */
var MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
var MEAL_NAME = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner' };
function renderLog() {
  var k = viewDay || today(), d = R.getDay(S, k), mt = R.mealTotals(d), tot = R.dayTotals(d), ct = R.calTarget(S, k), T = S.targets, eb = R.energyBreakdown(S, d), DR = R.dayRules(S, k);
  var isToday = k === today(), html = '';
  html += '<div class="row between" style="margin-bottom:12px"><button class="iconbtn" data-act="day-prev" aria-label="Previous day">‹</button><div style="text-align:center"><div class="qname">' + (isToday ? 'Today' : R.fmtDate(k)) + '</div><div class="qsub">' + ({ gym: 'Gym', football: 'Football', rest: 'Rest' })[R.dayType(S, k)] + ' day · target ' + ct + ' kcal</div></div><button class="iconbtn" data-act="day-next" aria-label="Next day"' + (isToday ? ' disabled style="opacity:.3"' : '') + '>›</button></div>';
  var meals = '';
  MEAL_ORDER.forEach(function (m) {
    var x = mt[m], head = '<div class="meal-h"><div class="qname">' + MEAL_NAME[m] + (x ? ' <span class="dim num">' + n0(x.cal) + ' kcal</span>' : '') + '</div><button class="btn small ghost meal-add" data-act="add-to-meal" data-meal="' + m + '" aria-label="Add food to ' + MEAL_NAME[m] + '">＋ Add</button></div>';
    if (!x) { meals += head; return; }
    meals += head + '<div class="scroll-x"><table class="tbl"><thead><tr><th>Food</th><th>kcal</th><th>P</th><th>C</th><th>S</th><th>F</th><th>Fib</th></tr></thead><tbody>' +
      x.items.map(function (f) { return '<tr class="rowbtn" data-act="food-item" data-id="' + esc(f.id) + '"><td><span class="fname">' + (f.tr ? '🍫 ' : '') + esc(f.name) + '</span><span class="fq">' + esc(f.qty) + (f.conf === 'low' ? ' · low confidence' : '') + '</span></td><td class="cK">' + n0(f.cal) + '</td><td class="cP">' + n1(f.p) + '</td><td class="cC">' + n1(f.c) + '</td><td class="cS">' + n1(f.s) + '</td><td class="cF">' + n1(f.f) + '</td><td class="cB">' + n1(f.fib) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Meal total</td><td>' + n0(x.cal) + '</td><td>' + n1(x.p) + '</td><td>' + n1(x.c) + '</td><td>' + n1(x.s) + '</td><td>' + n1(x.f) + '</td><td>' + n1(x.fib) + '</td></tr></tbody></table></div>';
  });
  if (!tot.cal && !d.foods.length) meals = '<p class="muted" style="margin:0 0 4px">Nothing logged yet. Tap ＋ Add on a meal, or the glowing orb, and search a food like “kfc hot wing”.</p>' + meals;
  html += win('INTAKE', meals + '<div class="row" style="margin-top:12px"><button class="btn small tint" style="--c:var(--kcal)" data-act="open-cmd">✦ Log something</button><button class="btn small tint" style="--c:var(--kcal)" data-act="quick-add">＋ Quick add</button><button class="btn small" data-act="recipes">🍲 My recipes</button><button class="btn small" data-act="saved">⚡ Saved meals</button><button class="btn small ghost" data-act="copy-yday">Copy from previous day</button><button class="btn small ghost" data-act="manual">Manual entry</button></div>');

  function st(val, target, mode) { var s = R.macroStatus(val, target, mode); var label = { hit: 'hit', close: 'close', under: 'under', ok: 'on track', over: 'over' }[s]; return '<span class="status ' + (s === 'ok' ? 'hit' : s) + '">' + label + '</span>'; }
  var calS = !d.foods.length ? '<span class="status under">nothing yet</span>' : opOn(k) ? (tot.cal > ct ? '<span class="status over">over the max</span>' : tot.cal < DR.floor && R.opMode(S, k) === 'diet' ? '<span class="status under">too low so far</span>' : '<span class="status hit">inside the max</span>') : Math.abs(tot.cal - ct) <= DR.calTol ? (tot.cal >= Math.min(DR.floor, ct) || DR.legacy ? '<span class="status hit">on track</span>' : '<span class="status under">under floor</span>') : tot.cal > ct ? '<span class="status over">over</span>' : '<span class="status under">under</span>';
  var carbS = tot.c > T.carbsMax ? '<span class="status over">over</span>' : tot.c >= T.carbsMin ? '<span class="status hit">in range</span>' : '<span class="status under">under</span>';
  html += win('DAILY TOTAL VS TARGETS', '<div class="scroll-x"><table class="tbl"><thead><tr><th></th><th>Eaten</th><th>Target</th><th>Left</th><th>Status</th></tr></thead><tbody>' +
    '<tr><td>Calories</td><td>' + n0(tot.cal) + '</td><td>' + ct + '</td><td>' + n0(ct - tot.cal) + '</td><td>' + calS + '</td></tr>' +
    '<tr><td>Protein</td><td>' + n1(tot.p) + 'g</td><td>' + DR.protein + 'g</td><td>' + n1(Math.max(0, DR.protein - tot.p)) + 'g</td><td>' + st(tot.p, DR.protein, 'min') + '</td></tr>' +
    '<tr><td>Carbs</td><td>' + n1(tot.c) + 'g</td><td>' + T.carbsMin + '–' + T.carbsMax + 'g</td><td>' + n1(Math.max(0, T.carbsMax - tot.c)) + 'g</td><td>' + carbS + '</td></tr>' +
    '<tr><td>Sugar</td><td>' + n1(tot.s) + 'g</td><td class="dim">—</td><td class="dim">—</td><td></td></tr>' +
    '<tr><td>Fat</td><td>' + n1(tot.f) + 'g</td><td>' + T.fat + 'g</td><td>' + n1(Math.max(0, T.fat - tot.f)) + 'g</td><td>' + st(tot.f, T.fat, 'max') + '</td></tr>' +
    '<tr><td>Fibre</td><td>' + n1(tot.fib) + 'g</td><td>' + T.fibre + 'g</td><td>' + n1(Math.max(0, T.fibre - tot.fib)) + 'g</td><td>' + st(tot.fib, T.fibre, 'min') + '</td></tr></tbody></table></div>' +
    '<div style="margin-top:12px"><div class="kv"><span>Baseline</span><b>' + n0(eb.base) + '</b></div><div class="kv"><span>Steps (' + n0(d.steps) + ')</span><b>+' + n0(eb.steps) + '</b></div><div class="kv"><span>Gym</span><b>+' + n0(eb.gym) + '</b></div><div class="kv"><span>Football</span><b>+' + n0(eb.football) + '</b></div>' + (eb.incline ? '<div class="kv"><span>Incline walk</span><b>+' + n0(eb.incline) + '</b></div>' : '') +
    '<div class="kv"><span>Burn (TDEE)</span><b>' + n0(eb.tdee) + '</b></div><div class="kv"><span>Eaten</span><b>−' + n0(eb.eaten) + '</b></div><div class="kv" style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px"><span><b style="font-family:var(--font);font-weight:600">Deficit</b></span><b style="color:' + deficitCol(eb.deficit) + '">' + (eb.deficit >= 0 ? '' : '−') + n0(Math.abs(eb.deficit)) + ' kcal</b></div>' + (eb.deficit > R.DEFICIT_AMBER ? '<p class="dim" style="font-size:12px;margin:6px 0 0">Amber: this deficit is bigger than about ' + n0(R.DEFICIT_AMBER) + ' kcal. Fine on a football day now and then; if it keeps happening, eat to your target.</p>' : '') + '</div>');

  var tr = '';
  d.workouts.forEach(function (w) { tr += '<div class="quest"><div class="qicon">🏋️</div><div><div class="qname">' + esc(w.name) + '</div><div class="qsub num">' + w.sets.map(function (s) { return (s.kg ? n1(s.kg) + 'kg×' : '') + s.reps; }).join(' · ') + '</div></div><button class="btn small ghost" data-act="del" data-list="workouts" data-id="' + esc(w.id) + '" aria-label="Delete">✕</button></div>'; });
  d.activities.forEach(function (a) { tr += '<div class="quest"><div class="qicon">' + ({ gym: '⚔️', football: '⚽', cardio: '🚶', sprint: '⚡', ballwork: '🎯', abs: '🧱', other: '✦', incline: '⛰️' })[a.type] + '</div><div><div class="qname">' + ({ gym: 'Gym session', football: 'Football', cardio: 'Cardio', sprint: 'Sprints', ballwork: 'Ball work', abs: 'Home abs', other: 'Activity', incline: 'Incline walk' })[a.type] + (a.lvl ? ' · ' + a.lvl : '') + (a.int ? ' · ' + a.int + ' effort' : '') + '</div><div class="qsub num">' + n0(a.min) + ' min' + (opOn(k) && a.type === 'gym' ? ' · ' + n0(R.GYM_LEVELS[a.lvl] || S.tdee.gym) + ' kcal' : opOn(k) && a.type === 'football' ? ' · ' + n0(a.min / 60 * S.tdee.footballPerHour * (R.FOOT_INT[a.int] || 1)) + ' kcal' : a.type === 'incline' ? ' · ' + n0(a.min * 7) + ' kcal' : a.kcal ? ' · ' + n0(a.kcal) + ' kcal' : '') + '</div></div><button class="btn small ghost" data-act="del" data-list="activities" data-id="' + esc(a.id) + '" aria-label="Delete">✕</button></div>'; });
  if (!tr) tr = '<p class="muted" style="margin:0">No training logged. Try “lat pulldown 60kg 3x10” or “football 1 hour”.</p>';
  html += win('TRAINING & ACTIVITY', tr);
  html += win('BODY & HABITS', '<div class="kv"><span>Steps</span><b>' + (d.steps > 0 ? n0(d.steps) + ' / ' + n0(R.stepsTarget(S, k)) : '<span class="dim">not logged</span>') + '</b></div><div class="kv"><span>Water</span><b>' + n0(d.water) + 'ml</b></div><div class="kv"><span>Weight</span><b>' + (d.weight != null ? n1(d.weight) + 'kg' : '—') + '</b></div>' + (d.bf != null ? '<div class="kv"><span>Body fat</span><b>' + n1(d.bf) + '%</b></div>' : '') +
    Object.keys(d.meas).map(function (m) { return '<div class="kv"><span>' + m[0].toUpperCase() + m.slice(1) + '</span><b>' + n1(d.meas[m]) + 'cm</b></div>'; }).join('') +
    '<div class="kv"><span>Lights out</span><b>' + (d.lightsOut ? '✓' : '—') + '</b></div>' + (d.water || d.steps ? '<div class="row" style="margin-top:8px">' + (d.water ? '<button class="btn small ghost" data-act="reset-field" data-field="water">Reset water</button>' : '') + (d.steps ? '<button class="btn small ghost" data-act="reset-field" data-field="steps">Reset steps</button>' : '') + '</div>' : ''));
  $('#v-log').innerHTML = html;
}

/* ───────────── BODY (today's character + your numbers + InBody) ───────────── */
var MUSCLE_NAMES = { shoulders: 'Shoulders', chest: 'Chest', arms: 'Arms', back: 'Back', core: 'Core', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves' };
function renderBody() {
  var k = today(), j = R.journey(S, k), tr = null, html = '';
  try { tr = R.trend(S, k); } catch (e) { reportErr(e, 'trend'); }
  html += safe('TODAY’S AURA', function () {
    var a = auraNow();
    return win('TODAY’S AURA', '<div class="aura-stage aura-mount" data-mode="full" data-act="aura-burst" role="img" style="' + auraVars(a) + '" aria-label="' + esc(a.name) + ' from ' + esc(a.anime) + ', surrounded by a ' + esc(a.aura) + ' aura"></div>' +
      '<div class="aura-cap" style="' + auraVars(a) + '"><i class="aura-sw" aria-hidden="true"></i><div class="grow"><div class="an">' + esc(a.name) + '</div><div class="as">' + esc(a.anime) + ' · ' + esc(a.aura) + ' <span class="hx">' + esc(a.palette.hex) + '</span></div></div></div>' +
      '<p class="aura-hint">' + (a.inArc ? 'A new character every day of the arc, each one only once.' : R.notStarted(S, k) ? 'Your first character of the arc. A new one arrives every day from ' + esc(R.fmtDate(S.profile.startDate)) + '.' : 'A new character every day.') + ' Tap them to power up.</p>',
      '', a.inArc ? 'Day ' + a.day + ' of ' + a.of : '#' + a.n);
  });
  html += safe('YOUR BODY', function () {
    var cur = R.currentBody(S, k), lbm = R.leanMass(S, k), heat = R.muscleHeat(S, k);
    return win('YOUR BODY', '<div class="readouts" style="margin-top:0">' +
      '<div class="ro" style="--c:var(--holo)"><span>Weight</span><b>' + n1(j.current) + '</b></div>' +
      '<div class="ro" style="--c:var(--protein)"><span>Body fat</span><b>' + n1(cur.bf) + '%</b></div>' +
      '<div class="ro" style="--c:var(--steps)"><span>Lean mass</span><b>' + n1(lbm) + '</b></div>' +
      '<div class="ro" style="--c:var(--train)"><span>V-taper</span><b>' + cur.ratio.toFixed(2) + '</b></div>' +
      '<div class="ro" style="--c:var(--good)"><span>Lost</span><b>' + n1(j.lost) + 'kg</b></div>' +
      '<div class="ro" style="--c:var(--kcal)"><span>Goal date</span><b style="font-size:14px">' + (tr && tr.goalDate ? R.fmtDate(tr.goalDate).slice(4) : '—') + '</b></div></div>' +
      '<div class="qname" style="margin:14px 0 0">Muscles trained this week</div><div class="muscles">' + R.MUSCLES.map(function (m) {
        var h = Math.max(0, Math.min(1, heat[m] || 0));
        return '<button class="mus" data-act="region" data-m="' + m + '" style="border:1px solid rgba(143,219,255,' + (0.18 + h * 0.6).toFixed(2) + ');background:rgba(143,219,255,' + (0.04 + h * 0.22).toFixed(2) + ')" aria-label="' + MUSCLE_NAMES[m] + ', ' + Math.round(h * 100) + '% this week"><span>' + MUSCLE_NAMES[m] + '</span><b>' + Math.round(h * 100) + '%</b></button>';
      }).join('') + '</div>',
      '', 'Start ' + n1(S.profile.startKg) + ' → goal ' + n1(S.profile.goalKg) + 'kg');
  });
  html += safe('INBODY', function () { return inbodyCardHTML(k); });
  html += safe('WEIGHT', function () { return weightChartHTML(k, tr); });
  var wv = R.getDay(S, k).weight;
  html += win('LOG MEASUREMENTS', '<div class="grid3"><label class="field">Weight kg<input class="inp num" id="b-weight" type="number" inputmode="decimal" step="0.1" placeholder="' + n1(wv != null ? wv : j.current) + '"></label><label class="field">Body fat %<input class="inp num" id="b-bf" type="number" inputmode="decimal" step="0.1"></label><label class="field">Waist cm<input class="inp num" id="b-waist" type="number" inputmode="decimal" step="0.5"></label>' +
    '<label class="field">Chest cm<input class="inp num" id="b-chest" type="number" inputmode="decimal" step="0.5"></label><label class="field">Shoulders cm<input class="inp num" id="b-shoulders" type="number" inputmode="decimal" step="0.5"></label><label class="field">Arms cm<input class="inp num" id="b-arms" type="number" inputmode="decimal" step="0.5"></label></div>' +
    '<div class="row end" style="margin-top:10px"><button class="btn primary" data-act="body-save">Save</button></div>', 'violet', 'Tape keeps it honest');
  $('#v-body').innerHTML = html;
}

/* InBody panel */
var SCAN_TILES = [
  { k: 'weight', label: 'Weight', unit: 'kg', c: 'var(--holo)', better: -1 },
  { k: 'smm', label: 'Muscle (SMM)', unit: 'kg', c: 'var(--steps)', better: 1 },
  { k: 'bfm', label: 'Fat mass', unit: 'kg', c: 'var(--protein)', better: -1 },
  { k: 'pbf', label: 'Body fat', unit: '%', c: 'var(--kcal)', better: -1 },
  { k: 'lbm', label: 'Lean mass', unit: 'kg', c: 'var(--fibre)', better: 1 },
  { k: 'score', label: 'InBody score', unit: '', c: 'var(--train)', better: 1 }
];
function deltaHTML(d, better) {
  if (d == null || Math.abs(d) < 0.05) return '';
  var good = d * better > 0; return '<em class="' + (good ? 'good' : 'blood') + '">' + (d > 0 ? '+' : '−') + n1(Math.abs(d)) + '</em>';
}
function inbodyCardHTML(k) {
  var sc = R.latestScan(S, k), n = S.inbody.length;
  if (!sc) return win('INBODY', '<p class="muted" style="margin:0 0 12px">No scans yet. Add your monthly InBody scan to drive your body numbers and stats.</p><button class="btn primary" data-act="scan-add">Add InBody scan</button>', 'violet');
  var prev = R.prevScan(S, sc), dl = R.scanDelta(sc, prev);
  var tiles = '<div class="ib-grid">' + SCAN_TILES.map(function (t) { var v = sc[t.k]; return '<div class="ro" style="--c:' + t.c + '"><span>' + t.label + '</span><b>' + (v == null ? '—' : n1(v) + (t.unit === '%' ? '%' : '')) + '</b>' + deltaHTML(dl[t.k], t.better) + '</div>'; }).join('') + '</div>';
  var due = R.scanDue(S, k);
  return win('INBODY', tiles + segChartHTML(sc) +
    '<div class="row between" style="margin-top:12px"><span class="dim" style="font-size:12px">' + (prev ? 'Change vs ' + R.fmtDate(prev.date) : 'Your first scan') + '</span><span class="src">' + esc(({ seed: 'InBody app', manual: 'entered', screenshot: 'read by AI', health: 'Apple Health' })[sc.source] || sc.source) + '</span></div>' +
    '<div class="row" style="margin-top:12px"><button class="btn ' + (due ? 'primary' : 'tint') + '" style="--c:var(--train)" data-act="scan-add">' + (due ? 'Add this month’s scan' : 'Add scan') + '</button><button class="btn ghost" data-act="scan-history">History (' + n + ')</button></div>',
    'violet', R.fmtDate(sc.date));
}
var SEG_ORDER = [['trunk', -90], ['ra', -18], ['rl', 54], ['ll', 126], ['la', 198]];
function segChartHTML(sc) {
  var hasPct = SEG_ORDER.some(function (s) { return sc.segPct && sc.segPct[s[0]] > 0; }), hasKg = SEG_ORDER.some(function (s) { return sc.seg && sc.seg[s[0]] > 0; });
  if (!hasPct && !hasKg) return '<p class="dim" style="font-size:12px;margin:12px 0 0">No segment data in this scan. Screenshot the InBody “Segmental Analysis” page next time to see your arms, trunk and legs here.</p>';
  var base = R.baselineScan(S) || sc, cx = 165, cy = 128, RR = 92;
  function pctOf(key) { var p = sc.segPct && sc.segPct[key]; if (p > 0) return p; var v = sc.seg[key], b = base.seg && base.seg[key]; return v > 0 && b > 0 ? v / b * 100 : 100; }
  function pt(ang, pct) { var r = RR * Math.max(0.05, (Math.min(150, pct) - 60) / 80), a = ang * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
  function poly(pct) { return SEG_ORDER.map(function (s) { return pt(s[1], pct).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '); }
  var out = '<div class="segchart"><svg viewBox="0 0 330 262" role="img" aria-label="Segmental lean analysis"><defs><linearGradient id="segg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FDBFF" stop-opacity=".45"/><stop offset="1" stop-color="#6FB4FF" stop-opacity=".35"/></linearGradient></defs>';
  out += '<polygon points="' + poly(110) + '" fill="rgba(124,240,192,.10)" stroke="none"/><polygon points="' + poly(90) + '" fill="#0a1220" stroke="none"/>';
  [80, 100, 120, 140].forEach(function (l) { out += '<polygon points="' + poly(l) + '" fill="none" stroke="rgba(160,210,255,' + (l === 100 ? .45 : .15) + ')"' + (l === 100 ? ' stroke-dasharray="4 4"' : '') + '/>'; });
  SEG_ORDER.forEach(function (s) { var e = pt(s[1], 140); out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '" stroke="rgba(160,210,255,.15)"/>'; });
  out += '<polygon points="' + SEG_ORDER.map(function (s) { return pt(s[1], pctOf(s[0])).map(function (v) { return v.toFixed(1); }).join(','); }).join(' ') + '" fill="url(#segg)" stroke="#8FDBFF" stroke-width="2" style="filter:drop-shadow(0 0 6px rgba(143,219,255,.7))"/>';
  SEG_ORDER.forEach(function (s) {
    var key = s[0], pc = pctOf(key), p = pt(s[1], pc), col = tc(pc > 110 ? '#FFCF7A' : pc < 90 ? '#9C8CFF' : '#7CF0C0');
    var lab = pt(s[1], 160), anchor = Math.abs(Math.cos(s[1] * Math.PI / 180)) < 0.3 ? 'middle' : (Math.cos(s[1] * Math.PI / 180) > 0 ? 'start' : 'end');
    var ly = lab[1] + (s[1] === -90 ? -14 : s[1] > 0 && s[1] < 180 ? 4 : -4);
    var val = (sc.segPct && sc.segPct[key] > 0 ? n1(sc.segPct[key]) + '%' : '') + (sc.seg && sc.seg[key] > 0 ? ' ' + n1(sc.seg[key]) + 'kg' : '');
    // keep both lines of the label inside the chart: work out how wide they are and pull them in from the edge
    var wd = Math.max(R.SEG_NAMES[key].length * 6.9, val.length * 6.4) + 4, lx = lab[0];
    if (anchor === 'end') lx = Math.max(lx, wd + 4); else if (anchor === 'start') lx = Math.min(lx, 326 - wd); else lx = Math.max(wd / 2 + 4, Math.min(326 - wd / 2, lx));
    out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4.5" fill="' + col + '" style="filter:drop-shadow(0 0 5px ' + col + ')"/>';
    out += '<text class="sl" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor + '">' + R.SEG_NAMES[key] + '</text>';
    out += '<text class="sv" x="' + lx.toFixed(1) + '" y="' + (ly + 13).toFixed(1) + '" text-anchor="' + anchor + '" fill="' + col + '">' + val + '</text>';
  });
  out += '</svg></div><div class="row" style="justify-content:center;gap:14px;font-size:11.5px;margin-top:2px"><span style="color:' + tc('#9C8CFF') + '">● under</span><span style="color:' + tc('#7CF0C0') + '">● normal</span><span style="color:' + tc('#FFCF7A') + '">● over</span><span class="dim">lean vs ideal</span></div>';
  return out;
}

/* InBody sheets */
function addScanSheet() {
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">ADD INBODY SCAN</div><div class="win-s">' + (R.seasonOver(S, today()) ? 'Kept for your records' : '+100 XP, one a week') + '</div></div>' +
    '<label class="opt" style="--c:var(--holo)"><span class="oi">📸</span><span><b>Read my InBody screenshots</b><span>Pick 1–4 screenshots from the InBody app (Detail tab + Segmental Analysis). The System reads every number for you to check.</span></span><input type="file" accept="image/*" multiple id="scan-files" aria-label="Choose InBody screenshots"></label>' +
    '<button class="opt" style="--c:var(--kcal)" data-act="scan-manual"><span class="oi">✎</span><span><b>Type the numbers</b><span>Weight, muscle, fat and the segment numbers.</span></span></button>' +
    '<button class="opt" style="--c:var(--steps)" data-act="shortcut-guide"><span class="oi"></span><span><b>Auto-sync from Apple Health</b><span>InBody already sends weight, body fat % and lean mass to Apple Health. An iPhone Shortcut can forward them here after every scan.</span></span></button>' +
    (R.seasonOver(S, today()) ? '' : '<p class="dim" style="font-size:12px;margin:4px 2px 0">Bonus +60 XP when fat mass drops and +40 XP when muscle holds, compared with your last scan. Scans dated during the arc count.</p>'), { cls: '' });
  $('#scan-files').addEventListener('change', function (e) { var f = Array.prototype.slice.call(e.target.files || []); if (f.length) readScreenshots(f); });
}
function shrinkImage(file) {
  return new Promise(function (res, rej) {
    if (!/^image\//.test(file.type || 'image/')) { rej(new Error('That file isn’t an image')); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      try {
        var max = 1568, w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc)); var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res({ media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
      } catch (e) { rej(e); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Couldn’t open that image')); };
    img.src = url;
  });
}
function readScreenshots(files) {
  if (busy) return;
  if (!connected()) { closeLayer(); errorBox('Connect the System in Settings so it can read screenshots.', true, 'scan-manual'); return; }
  files = files.slice(0, 4); busy = true;
  openLayer(win('', '<div class="scan"><div class="scan-line"></div><div class="scan-t"><span>READING INBODY</span><span class="dots"></span></div><div class="scan-s">weight · muscle · fat · segments · ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '</div></div>'), { center: true, sticky: true });
  Promise.all(files.map(shrinkImage)).then(function (imgs) {
    return fetchT(apiBase() + '/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Key': conn.key }, body: JSON.stringify({ images: imgs, today: today() }) }, 45000);
  }).then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { r: r, j: j }; }); })
    .then(function (x) {
      busy = false; closeLayer();
      if (!x.r.ok || !x.j || !x.j.ok) { errorBox((x.j && x.j.error) || 'The System couldn’t read those screenshots.', x.r.status === 401, 'scan-manual'); return; }
      var res = R.parseScanReply(x.j.text);
      if (!res.ok) { errorBox(res.error, false, 'scan-manual'); return; }
      var draft = res.scan, note = 'Read from your screenshots. Check every number against InBody before saving.';
      if (!draft.date) { draft.date = today(); note = 'Couldn’t see the scan date, so it’s set to today. ' + note; }
      vib([60, 30, 60]); scanForm(draft, { banner: note });
    }).catch(function (e) {
      busy = false; closeLayer();
      errorBox(e && e.name === 'AbortError' ? 'Reading took longer than 45 seconds. Try fewer screenshots.' : (e && e.message) || 'Couldn’t reach the System.', false, 'scan-manual');
    });
}
function errorBox(msg, setup, manualAct) {
  vib(250); beep('bad');
  openLayer(win('SYSTEM ERROR', '<p style="margin:0 0 6px">' + esc(msg) + '</p><p class="dim" style="font-size:12px;margin:0 0 14px">Nothing was saved.</p><div class="row end">' +
    (setup ? '<button class="btn" data-act="settings">Open settings</button>' : '') + '<button class="btn primary" data-act="' + (manualAct || 'manual') + '">Enter manually</button></div>', 'danger'), { center: true });
}
var SCAN_FORM = [['weight', 'Weight kg', '0.1'], ['smm', 'Skeletal muscle kg', '0.1'], ['bfm', 'Body fat mass kg', '0.1'], ['pbf', 'Body fat %', '0.1'], ['score', 'InBody score', '1'], ['age', 'InBody age', '0.1'], ['lbm', 'Lean mass kg', '0.1'], ['visceral', 'Visceral fat level', '1'], ['bmr', 'BMR kcal', '1']];
function blankScan() { var w = R.getDay(S, today()).weight; return { date: today(), source: 'manual', weight: w != null ? w : null, seg: {}, segPct: {} }; }
function scanForm(draft, meta) {
  meta = meta || {};
  var d = { date: draft.date || today(), source: draft.source || 'manual', note: draft.note || '', seg: {}, segPct: {} };
  R.SCAN_NUM.forEach(function (k) { d[k] = draft[k] == null || (typeof draft[k] === 'number' && isNaN(draft[k])) ? '' : draft[k]; });
  R.SEG_KEYS.forEach(function (k) { d.seg[k] = draft.seg && draft.seg[k] != null && !isNaN(draft.seg[k]) ? draft.seg[k] : ''; d.segPct[k] = draft.segPct && draft.segPct[k] != null && !isNaN(draft.segPct[k]) ? draft.segPct[k] : ''; });
  pendingScan = { draft: d, token: 's' + R.uid(), inboxId: meta.inboxId || null, saving: false };
  var hasSeg = R.SEG_KEYS.some(function (k) { return d.seg[k] !== '' || d.segPct[k] !== ''; });
  function f(key, label, step) { return '<label class="field">' + label + '<input class="inp num" type="number" inputmode="decimal" step="' + step + '" data-sf="' + key + '" value="' + esc(d[key]) + '"></label>'; }
  var html = '<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">INBODY SCAN</div><div class="win-s">' + esc(({ manual: 'Manual', screenshot: 'From screenshots', health: 'From Apple Health' })[d.source] || '') + '</div></div>' +
    (meta.banner ? '<div class="alert violet" style="margin-bottom:12px"><span>ℹ️</span><div>' + esc(meta.banner) + '</div></div>' : '') +
    '<label class="field">Scan date<input class="inp" type="date" data-sf="date" value="' + esc(d.date) + '"></label>' +
    '<div class="grid3" style="margin-top:8px">' + SCAN_FORM.map(function (x) { return f(x[0], x[1], x[2]); }).join('') + '</div>' +
    '<details class="more"' + (hasSeg ? ' open' : '') + '><summary>Segmental lean (kg and % of ideal)</summary>' + R.SEG_KEYS.map(function (k) {
      return '<div class="grid3" style="align-items:end;margin-top:6px"><span style="font-size:13px;padding-bottom:12px">' + R.SEG_NAMES[k] + '</span><label class="field">kg<input class="inp num" type="number" inputmode="decimal" step="0.01" data-sf="seg.' + k + '" value="' + esc(d.seg[k]) + '"></label><label class="field">%<input class="inp num" type="number" inputmode="decimal" step="0.1" data-sf="segPct.' + k + '" value="' + esc(d.segPct[k]) + '"></label></div>';
    }).join('') + '</details>' +
    '<div class="qsub" id="scan-derived" style="margin-top:10px"></div><div class="errs" id="scan-errs"></div>' +
    '<div class="ci-actions"><button class="btn ghost" data-act="scan-cancel"' + (meta.inboxId ? ' style="grid-column:span 2"' : '') + '>' + (meta.inboxId ? 'Skip this import' : 'Cancel') + '</button><button class="btn primary ci-go" id="scan-save" data-act="scan-save">Save scan</button></div>';
  openLayer(html, { sticky: true });
  pendingScan.meta = meta;
  updateScanForm();
}
function scanRaw() {
  var d = pendingScan.draft, o = { date: d.date, source: d.source, note: d.note, seg: {}, segPct: {} };
  R.SCAN_NUM.forEach(function (k) { o[k] = d[k] === '' ? null : d[k]; });
  R.SEG_KEYS.forEach(function (k) { o.seg[k] = d.seg[k] === '' ? null : d.seg[k]; o.segPct[k] = d.segPct[k] === '' ? null : d.segPct[k]; });
  return o;
}
function updateScanForm() {
  if (!pendingScan) return;
  var sc = R.coerceScan(scanRaw()), errs = R.checkScan(sc), btn = $('#scan-save'), dv = $('#scan-derived'), ev = $('#scan-errs');
  if (dv) dv.innerHTML = sc.pbf > 0 && sc.weight > 0 ? 'Body fat <b class="num" style="color:var(--kcal)">' + n1(sc.pbf) + '%</b> · fat <b class="num" style="color:var(--protein)">' + n1(sc.bfm) + 'kg</b> · lean <b class="num" style="color:var(--fibre)">' + n1(sc.lbm) + 'kg</b>' : '';
  if (ev) ev.textContent = errs.join(' · ');
  if (btn) { btn.disabled = errs.length > 0; btn.textContent = errs.length ? 'Fix highlighted values' : 'Save scan'; }
  $$('[data-sf]').forEach(function (inp) {
    var key = inp.dataset.sf, v = key.indexOf('.') > 0 ? sc[key.split('.')[0]][key.split('.')[1]] : sc[key];
    inp.classList.toggle('bad', inp.value !== '' && key !== 'date' && (v == null || isNaN(v)));
  });
}
function onScanInput(e) {
  var t = e.target; if (!pendingScan || !t.dataset || t.dataset.sf == null) return;
  var key = t.dataset.sf, v = t.type === 'number' ? (t.value === '' ? '' : parseFloat(t.value)) : t.value;
  if (key.indexOf('.') > 0) { var p = key.split('.'); pendingScan.draft[p[0]][p[1]] = v; } else pendingScan.draft[key] = v;
  updateScanForm();
}
function saveScan() {
  if (!pendingScan || pendingScan.saving) return;
  var raw0 = scanRaw(), sw = typeof raw0.weight === 'number' && !isNaN(raw0.weight) ? raw0.weight : null, sj = sw != null && R.isKey(raw0.date) ? weighJump(raw0.date, sw) : null;
  if (sj && pendingScan.jumpOk !== sw) { pendingScan.jumpOk = sw; toast(jumpText(sw, sj) + ' If that is right, tap Save again.', { bad: true, ms: 7000 }); return; } // a misread scan weight must not slip through
  pendingScan.saving = true;
  var ps = pendingScan, res = R.addScan(S, raw0, ps.token);
  if (!res.ok) { ps.saving = false; if (res.reason === 'duplicate') { closeLayer(); return; } toast((res.errors || ['Check the values'])[0], { bad: true }); return; }
  var before = R.player(S, today()).xp;
  if (ps.inboxId) ackInbox(ps.inboxId);
  pendingScan = null; closeLayer(); afterChange();
  var gained = R.player(S, today()).xp - before;
  vib([80, 40, 80]); beep('win'); confetti(40);
  if (gained > 0) floatText('+' + gained + ' XP', false);
  var prev = R.prevScan(S, res.scan), dl = R.scanDelta(res.scan, prev), parts = [];
  if (dl.bfm != null) parts.push('fat ' + (dl.bfm <= 0 ? '−' : '+') + n1(Math.abs(dl.bfm)) + 'kg');
  if (dl.smm != null) parts.push('muscle ' + (dl.smm >= 0 ? '+' : '−') + n1(Math.abs(dl.smm)) + 'kg');
  toast('InBody saved' + (parts.length ? ': ' + parts.join(', ') : '') + '.' + (res.keptWeighIn != null ? ' Your ' + n1(res.keptWeighIn) + 'kg weigh-in for that day was kept.' : ''), { icon: '🧪', action: 'Undo', ms: 6000, onAction: function () { R.undoScan(S, res.undo); afterChange(); toast('Scan removed.'); } });
  if (tab !== 'body') setTab('body');
}
function scanHistorySheet() {
  var list = S.inbody.slice().reverse();
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">SCAN HISTORY</div><div class="win-s">' + list.length + ' scans</div></div>' +
    (list.length ? list.map(function (sc) { return '<button class="scanrow" data-act="scan-detail" data-id="' + esc(sc.id) + '"><span class="src">' + esc(R.fmtDate(sc.date)) + '</span><span class="num" style="font-size:13px"><span style="color:var(--holo)">' + n1(sc.weight) + 'kg</span> · <span style="color:var(--kcal)">' + n1(sc.pbf) + '%</span>' + (sc.smm != null ? ' · <span style="color:var(--steps)">' + n1(sc.smm) + ' SMM</span>' : '') + '</span><span class="dim">›</span></button>'; }).join('') : '<p class="muted">No scans yet.</p>') +
    '<div class="row end" style="margin-top:12px"><button class="btn primary" data-act="scan-add">Add scan</button><button class="btn ghost" data-act="close">Close</button></div>');
}
function scanDetailSheet(id) {
  var sc = S.inbody.filter(function (x) { return x.id === id; })[0]; if (!sc) return;
  var rows = R.SCAN_NUM.filter(function (k) { return sc[k] != null; }).map(function (k) { return '<div class="kv"><span>' + R.SCAN_LABELS[k] + '</span><b>' + n1(sc[k]) + '</b></div>'; }).join('');
  rows += R.SEG_KEYS.filter(function (k) { return sc.seg[k] != null || sc.segPct[k] != null; }).map(function (k) { return '<div class="kv"><span>' + R.SEG_NAMES[k] + '</span><b>' + (sc.seg[k] != null ? n1(sc.seg[k]) + 'kg' : '') + (sc.segPct[k] != null ? ' · ' + n1(sc.segPct[k]) + '%' : '') + '</b></div>'; }).join('');
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">' + esc(R.fmtDate(sc.date).toUpperCase()) + '</div><div class="win-s">' + esc(sc.note || sc.source) + '</div></div>' + rows +
    '<div class="row end" style="margin-top:12px"><button class="btn danger" data-act="scan-del" data-id="' + esc(sc.id) + '">Delete</button><button class="btn" data-act="scan-edit" data-id="' + esc(sc.id) + '">Edit</button><button class="btn ghost" data-act="close">Close</button></div>');
}
function shortcutSheet() {
  var url = connected() ? apiBase() + '/inbox' : 'https://winter-arc.<your-name>.workers.dev/inbox';
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--steps)">AUTO-SYNC FROM APPLE HEALTH</div></div>' +
    '<p class="muted" style="margin:0 0 8px;font-size:13.5px">InBody sends weight, body fat % and lean mass to Apple Health. This iPhone Shortcut forwards them to the System, and the app asks you to confirm them next time you open it. Muscle (SMM) and segment numbers aren’t in Apple Health, so add those from a screenshot when you want them.</p>' +
    '<p style="margin:0 0 4px;font-size:13px">One-time setup in InBody: Settings → Apple Health → allow all body data.</p>' +
    '<ol class="steps-ol"><li>Open <b>Shortcuts</b> → <b>+</b> → name it <b>Send InBody</b>.</li>' +
    '<li>Add <b>Find Health Samples</b>: Type <b>Weight</b>, sort by <b>Start Date</b>, latest first, limit <b>1</b>. Repeat for <b>Body Fat Percentage</b> and <b>Lean Body Mass</b>.</li>' +
    '<li>Add <b>Get Contents of URL</b> with this URL:<div class="code" style="margin:6px 0">' + esc(url) + '</div>Method <b>POST</b>. Header <b>X-App-Key</b> = your app key. Request Body <b>JSON</b> with fields <b>weight</b>, <b>pbf</b> and <b>lbm</b> (each set to the matching Health Samples), and <b>date</b> = Current Date.</li>' +
    '<li>Optional: <b>Automation</b> → <b>App</b> → <b>InBody</b> → <b>Is Closed</b> → run <b>Send InBody</b>. Then it happens automatically after every scan.</li></ol>' +
    '<div class="row" style="margin-top:10px">' + (connected() ? '<button class="btn small" data-act="copy-inbox">Copy URL</button><button class="btn small ghost" data-act="inbox-check">Check for data now</button>' : '<button class="btn small" data-act="settings">Connect the System first</button>') + '<button class="btn small ghost" data-act="close">Done</button></div>');
}

/* Apple Health inbox */
function checkInbox(manual) {
  if (HOSTED) return; // the Apple Health inbox needs the Cloudflare Worker
  if (!connected()) { if (manual) toast('Connect the System first.', { bad: true }); return; }
  fetchT(apiBase() + '/inbox', { headers: { 'X-App-Key': conn.key } }, 10000).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok || !Array.isArray(j.items)) { if (manual) toast((j && j.error) || 'Inbox not available.', { bad: true }); return; }
    var added = 0;
    j.items.forEach(function (it) { if (!it || !it.id || S.meta.inboxSeen.indexOf(it.id) >= 0 || inboxQueue.some(function (x) { return x.id === it.id; })) return; inboxQueue.push(it); added++; });
    if (manual && !added) toast('No new body data from Apple Health.');
    if (manual && added) closeLayer();
    nextInbox();
  }).catch(function () { if (manual) toast('Couldn’t reach the System.', { bad: true }); });
}
function nextInbox() {
  if (busy || pending || pendingScan || $('#layer').innerHTML || !inboxQueue.length || $('.ceremony') || $('.notice') || $('#splash')) return;
  var it = inboxQueue.shift(), draft = R.normalizeImport(it.data);
  if (!draft || draft.weight == null) { ackInbox(it.id); nextInbox(); return; }
  if (!draft.date) draft.date = it.at ? R.dayKey(new Date(it.at)) : today();
  scanForm(draft, { inboxId: it.id, banner: 'New body data from Apple Health via your Shortcut. Add muscle and segment numbers from InBody if you have them.' });
}
function ackInbox(id) {
  if (S.meta.inboxSeen.indexOf(id) < 0) S.meta.inboxSeen.push(id);
  if (S.meta.inboxSeen.length > 100) S.meta.inboxSeen = S.meta.inboxSeen.slice(-100);
  persist();
  if (connected()) fetchT(apiBase() + '/inbox/ack', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Key': conn.key }, body: JSON.stringify({ ids: [id] }) }, 10000).catch(function () {});
}

function weightChartHTML(k, tr) {
  var ws = R.weightSeries(S);
  if (!ws.length) return win('WEIGHT', '<p class="muted" style="margin:0">No weigh-ins yet. Type “weighed 89.4” or use Log body below.</p>');
  var W = 320, H = 170, pl = 34, pr = 8, pt = 10, pb = 22;
  var x0 = S.profile.startDate, x1 = ws[ws.length - 1].key > k ? ws[ws.length - 1].key : k; if (R.diffDays(x0, x1) < 14) x1 = R.addDays(x0, 14);
  if (ws[0].key < x0) x0 = ws[0].key;
  var span = R.diffDays(x0, x1) || 1;
  var vals = ws.map(function (w) { return w.kg; }).concat([S.profile.goalKg, S.profile.startKg]);
  var lo = Math.floor(Math.min.apply(null, vals) - 0.5), hi = Math.ceil(Math.max.apply(null, vals) + 0.5);
  function X(key) { return pl + (W - pl - pr) * R.diffDays(x0, key) / span; }
  function Yv(v) { return pt + (H - pt - pb) * (hi - v) / (hi - lo); }
  var grid = '';
  for (var v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 5))) grid += '<line class="ax" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Yv(v) + '" y2="' + Yv(v) + '"/><text class="axl" x="' + (pl - 4) + '" y="' + (Yv(v) + 3) + '" text-anchor="end">' + v + '</text>';
  grid += '<text class="axl" x="' + pl + '" y="' + (H - 6) + '">' + R.fmtDate(x0).slice(4) + '</text><text class="axl" x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">' + R.fmtDate(x1).slice(4) + '</text>';
  var goalL = '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Yv(S.profile.goalKg) + '" y2="' + Yv(S.profile.goalKg) + '" stroke="#6FB4FF" stroke-dasharray="4 4"/><text class="axl" x="' + (W - pr) + '" y="' + (Yv(S.profile.goalKg) - 4) + '" text-anchor="end" fill="#b9dcff">goal ' + S.profile.goalKg + '</text>';
  var cpts = [{ date: S.profile.startDate, kg: S.profile.startKg }].concat(S.plan.checkpoints).filter(function (c) { return c.date >= x0 && c.date <= x1; });
  if (cpts.length && cpts[cpts.length - 1].date < x1) cpts.push({ date: x1, kg: R.planWeightOn(S, x1) });
  var planL = cpts.length > 1 ? '<path d="' + cpts.map(function (c, i) { return (i ? 'L' : 'M') + X(c.date).toFixed(1) + ' ' + Yv(c.kg).toFixed(1); }).join(' ') + '" fill="none" stroke="#FFCF7A" stroke-opacity=".8" stroke-width="1.4" stroke-dasharray="2 4"/>' : '';
  var line = ws.map(function (w, i) { return (i ? 'L' : 'M') + X(w.key).toFixed(1) + ' ' + Yv(w.kg).toFixed(1); }).join(' ');
  var dots = ws.map(function (w) { return '<circle cx="' + X(w.key).toFixed(1) + '" cy="' + Yv(w.kg).toFixed(1) + '" r="2.5" fill="#8FDBFF"/>'; }).join('');
  var avg = R.weeklyAverages(S).filter(function (a) { return a.avg != null; });
  var avgL = avg.length > 1 ? '<path d="' + avg.map(function (a, i) { return (i ? 'L' : 'M') + X(R.addDays(a.monday, 3)).toFixed(1) + ' ' + Yv(a.avg).toFixed(1); }).join(' ') + '" fill="none" stroke="#6FB4FF" stroke-width="2.2"/>' : '';
  var ra = R.rollingAvg(S, k); var info = '<div class="kv"><span>Latest</span><b>' + n1(ws[ws.length - 1].kg) + 'kg</b></div><div class="kv"><span>7-day average</span><b class="holo">' + (ra != null ? n1(ra) + 'kg' : 'needs 2+ weigh-ins') + '</b></div><div class="kv"><span>Plan today</span><b>' + n1(R.planWeightOn(S, k)) + 'kg</b></div>' + (tr ? '<div class="kv"><span>14-day trend</span><b>' + (tr.flat ? 'holding level' : (tr.perWeek <= 0 ? '−' : '+') + n1(Math.abs(tr.perWeek)) + 'kg / week') + '</b></div><div class="kv"><span>Projected goal</span><b>' + (tr.goalDate ? R.fmtDate(tr.goalDate) : 'not trending down') + '</b></div>' : '<div class="kv"><span>Trend</span><b class="dim">needs 3+ weigh-ins over 5+ days</b></div>');
  var bfs = R.bfSeries(S); if (bfs.length) info += '<div class="kv"><span>Body fat (latest)</span><b>' + n1(bfs[bfs.length - 1].bf) + '%</b></div>';
  return win('WEIGHT', '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weight trend chart">' + grid + goalL + planL + '<path d="' + line + '" fill="none" stroke="#8FDBFF" stroke-opacity=".55" stroke-width="1.4"/>' + avgL + dots + '</svg>' +
    '<div class="row" style="gap:14px;font-size:12px;margin:4px 0 8px"><span class="holo">● daily</span><span style="color:' + tc('#b9dcff') + '">━ weekly average</span><span style="color:var(--warn)">┄ plan</span></div>' + info);
}

/* ───────────── STATS ───────────── */
function radarSVG(cur, ghost) {
  var cx = 160, cy = 150, Rr = 108, ids = R.STATS.map(function (s) { return s.id; });
  function pt(i, v) { var a = -Math.PI / 2 + i * 2 * Math.PI / ids.length; return [cx + Math.cos(a) * Rr * v / 100, cy + Math.sin(a) * Rr * v / 100]; }
  function P(p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }
  var grid = '';
  [25, 50, 75, 100].forEach(function (lv) { grid += '<polygon points="' + ids.map(function (_, i) { return P(pt(i, lv)); }).join(' ') + '" fill="none" stroke="rgba(160,210,255,' + (lv === 100 ? .45 : .15) + ')"/>'; });
  ids.forEach(function (id, i) { var e = pt(i, 100); grid += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '" stroke="' + STATCOL[id] + '" stroke-opacity=".25"/>'; });
  var shape = function (o) { return ids.map(function (id, i) { return P(pt(i, Math.max(3, o[id]))); }).join(' '); };
  var g = ghost && ghost.n ? '<polygon points="' + shape(ghost) + '" fill="rgba(111,180,255,.08)" stroke="#6FB4FF" stroke-opacity=".7" stroke-dasharray="4 4"/>' : '';
  var wedges = ids.map(function (id, i) { var j = (i + 1) % ids.length, a = pt(i, Math.max(3, cur[id])), b = pt(j, Math.max(3, cur[ids[j]])); return '<polygon points="' + cx + ',' + cy + ' ' + P(a) + ' ' + P(b) + '" fill="url(#wg' + i + ')"/>'; }).join('');
  var defs = '<defs>' + ids.map(function (id, i) { var j = (i + 1) % ids.length, a = pt(i, 100), b = pt(j, 100); return '<linearGradient id="wg' + i + '" gradientUnits="userSpaceOnUse" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '"><stop offset="0" stop-color="' + STATCOL[id] + '" stop-opacity=".45"/><stop offset="1" stop-color="' + STATCOL[ids[j]] + '" stop-opacity=".45"/></linearGradient>'; }).join('') + '</defs>';
  var outline = '<polygon points="' + shape(cur) + '" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" style="filter:drop-shadow(0 0 6px rgba(255,255,255,.5))"/>';
  var labels = ids.map(function (id, i) { var e = pt(i, 124); return '<text class="lbl" x="' + e[0].toFixed(1) + '" y="' + (e[1] - 2).toFixed(1) + '" text-anchor="middle" fill="' + STATCOL[id] + '">' + id + '</text><text class="val" x="' + e[0].toFixed(1) + '" y="' + (e[1] + 12).toFixed(1) + '" text-anchor="middle">' + cur[id] + '</text>'; }).join('');
  var dots = ids.map(function (id, i) { var e = pt(i, Math.max(3, cur[id])); return '<circle cx="' + e[0].toFixed(1) + '" cy="' + e[1].toFixed(1) + '" r="4.5" fill="' + STATCOL[id] + '" style="filter:drop-shadow(0 0 6px ' + STATCOL[id] + ')"/>'; }).join('');
  return '<svg class="radar" viewBox="0 0 320 300" role="img" aria-label="Stats radar">' + defs + grid + g + wedges + outline + dots + labels + '</svg>';
}
function renderStats() {
  var k = today(), lg = R.strengthLog(S), p = R.player(S, k);
  var html = safe('STATUS WINDOW', function () { var cur = R.statsFor(S, k), ghost = R.statsFor(S, R.addDays(k, -28)); return win('STATUS WINDOW', radarSVG(cur, ghost) + '<div class="row" style="gap:14px;font-size:12px;justify-content:center"><span style="color:' + tc('#ffffff') + '">◆ last 28 days</span>' + (ghost.n ? '<span style="color:' + tc('#cfe8ff') + '">┅ the 28 days before</span>' : '') + '</div>' +
    '<div class="statgrid">' + R.STATS.map(function (s) { var d = cur[s.id] - (ghost.n ? ghost[s.id] : 0); return '<button class="statc lift" style="--c:' + STATCOL[s.id] + '" data-act="stat" data-id="' + esc(s.id) + '"><span class="sid">' + s.id + '</span><b>' + cur[s.id] + (ghost.n && d ? '<em class="' + (d > 0 ? 'good' : 'blood') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + '</em>' : '') + '</b><span>' + s.name + '</span></button>'; }).join('') + '</div>', '', 'Tap a stat'); });
  var bests = Object.keys(lg.best).map(function (key) { return lg.best[key]; });
  html += win('STRENGTH', (bests.length ? '<table class="tbl"><thead><tr><th>Exercise</th><th>Best</th><th>Set</th></tr></thead><tbody>' + bests.map(function (b) { return '<tr><td>' + esc(b.name) + '</td><td>' + n1(b.v) + ' ' + (b.unit === 'reps' ? 'reps' : 'kg') + '</td><td>' + R.fmtDate(b.day).slice(4) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted" style="margin:0">Log a session like “lat pulldown 60kg 3x10” and your bests appear here. Beat them for PRs.</p>') +
    (lg.prs.length ? '<div class="qname" style="margin-top:12px">Recent PRs</div>' + lg.prs.slice(-5).reverse().map(function (pr) { return '<div class="kv"><span>💥 ' + esc(pr.name) + '</span><b>' + n1(pr.from) + ' → ' + n1(pr.to) + '</b></div>'; }).join('') : ''), 'violet', 'Estimated 1RM (Epley)');
  var L = p.lines;
  html += win('XP SOURCES', [['Daily quests', L.quests], ['Daily Clears', L.clears], ['Streak bonus', L.streak], ['Penalty Quests', L.penalties], ['Bosses', L.bosses], ['Trials', L.trials], ['Achievements', L.achievements], ['PRs', L.prs], ['InBody scans', L.inbody || 0], ['Kg milestones', L.milestones]].filter(function (r) { return r[0] !== 'Penalty Quests' || r[1] > 0; }).map(function (r) { return '<div class="kv"><span>' + r[0] + '</span><b>' + n0(r[1]) + '</b></div>'; }).join('') +
    '<div class="kv" style="border-top:1px solid var(--line);padding-top:6px;margin-top:4px"><span>Total XP</span><b class="holo">' + n0(p.xp) + '</b></div>' + (p.floored ? '<p class="dim" style="font-size:12px;margin:6px 0 0">Your level is protected: XP never drops below the level you reached.</p>' : ''));
  html += safe('AWARDS', awardsHTML);
  $('#v-stats').innerHTML = html; bindAwards();
}

/* ───────────── AWARDS (shown at the foot of Stats since v16) ───────────── */
function awardsHTML() {
  var k = today(), lp = R.ladderProgress(S, k).filter(function (l) { return l.metric !== 'penalties' || l.got > 0; }), titles = R.titles(S, k), got = Object.keys(S.player.ach).length, total = lp.reduce(function (n, l) { return n + l.total; }, 0);
  var html = win('TITLE', '<label class="field">Equipped title<select class="inp" id="title-sel"><option value="">None</option>' + titles.map(function (t) { return '<option' + (t === S.player.title ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label><p class="dim" style="font-size:12px;margin:8px 0 0">' + titles.length + ' titles unlocked. Every achievement, boss and rank gives one.</p>', 'violet');
  html += win('ACHIEVEMENTS', lp.map(function (l) {
    var open = !!openLadders[l.series];
    return '<div class="ladder"><button class="ladder-h" data-act="ladder" data-series="' + esc(l.series) + '" aria-expanded="' + open + '"><span class="ic">' + l.icon + '</span><span class="grow"><span class="qname">' + esc(l.series) + '</span> <span class="dim num" style="font-size:12px">' + l.got + '/' + l.total + '</span><span class="qsub" style="display:block">' + (l.next ? 'Next: ' + esc(l.next.name) + ' · ' + esc(l.next.desc) : 'Ladder complete') + '</span><span class="bar ' + (l.next ? '' : 'hit') + '" style="display:block;margin-top:6px"><i style="width:' + Math.round(l.pct * 100) + '%"></i></span></span><span class="dim">' + (open ? '−' : '+') + '</span></button>' +
      (open ? '<div class="ladder-body">' + l.list.map(function (a) { var has = !!S.player.ach[a.id]; return '<div class="badge ' + (has ? 'got' : 'locked') + '"><div class="bi">' + (has ? a.icon : '🔒') + '</div><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
  }).join(''), '', got + ' / ' + total + ' unlocked');
  return html;
}
function bindAwards() { var t = $('#title-sel'); if (t) t.onchange = function (e) { S.player.title = e.target.value; persist(); toast(e.target.value ? 'Title equipped: ' + e.target.value : 'Title removed'); }; }

/* ───────────── AURA: every character met so far ───────────── */
var auraPick = null; // the one chosen in the collection; null = today's
function renderAura() {
  var k = today(), list = R.auraDiscovered(S, k), cur = auraNow(), pick = null;
  list.forEach(function (a) { if (a.n === auraPick) pick = a; });
  if (!pick) { auraPick = null; pick = list.filter(function (a) { return a.n === cur.n; })[0] || list[0]; }
  var isToday = pick.n === cur.n, html = '';
  html += win('AURA', '<div class="aura-stage aura-mount" data-mode="full" data-pick="' + pick.n + '" data-act="aura-burst" role="img" style="' + auraVars(pick) + '" aria-label="' + esc(pick.name) + ' from ' + esc(pick.anime) + ', surrounded by a ' + esc(pick.aura) + ' aura"></div>' +
    '<div class="aura-cap" style="' + auraVars(pick) + '"><i class="aura-sw" aria-hidden="true"></i><div class="grow"><div class="an">' + esc(pick.name) + '</div><div class="as">' + esc(pick.anime) + ' · ' + esc(pick.aura) + ' <span class="hx">' + esc(pick.palette.hex) + '</span></div></div>' +
    '<span class="aura-when">' + (isToday ? 'Today' : 'Day ' + pick.day + '<br>' + esc(R.fmtDate(pick.date).slice(4))) + '</span></div>',
    '', list.length + ' / ' + R.AURA.length + ' met');
  html += win('COLLECTION', '<div class="aura-grid">' + list.map(function (a) {
    var src = (window.RTL_ART || {})[a.art] || '';
    return '<button class="aura-card' + (a.n === pick.n ? ' on' : '') + '" data-act="aura-pick" data-n="' + a.n + '" style="' + auraVars(a) + '" aria-pressed="' + (a.n === pick.n) + '" aria-label="' + esc(a.name) + ', day ' + a.day + '">' +
      '<span class="ac-pic">' + (src ? '<img src="' + src + '" alt="" loading="lazy" decoding="async">' : '') + '</span><b>' + esc(a.short) + '</b><small>' + (a.n === cur.n ? 'Today' : 'Day ' + a.day) + '</small></button>';
  }).join('') + '</div><p class="dim" style="font-size:11.5px;margin:10px 2px 0">A new character joins every day of the arc. The ones still to come stay hidden until their day.</p>', '', 'Newest first');
  $('#v-aura').innerHTML = html;
}

/* ───────────── typed commands + confirmation (no Claude) ───────────── */
/* "drank 750ml", "weighed 88.6, waist 96", "8,000 steps", "football 60", "lat pulldown 60kg 3x10": read here on the phone.
   Anything else is a food: pick it from the search list (or enter it by hand). */
function submitText(text) {
  text = String(text || '').trim();
  if (!text || busy) return;
  var q = R.parseQuick(text);
  if (q.ok && q.items.length) {
    closeLayer(); submitText.last = '';
    openConfirm(q.items, { source: 'quick', text: text });
    if (q.rest.length) toast('Didn’t understand “' + q.rest.join(', ').slice(0, 60) + '”. Search it as a food.', { bad: true, ms: 5000 });
    return;
  }
  submitText.last = text;
  var first = $('#sugg [data-act="pick-food"]');
  if (first) { toast('Tap the food you had in the list.', { ms: 3500 }); first.classList.add('flash'); setTimeout(function () { first.classList.remove('flash'); }, 900); return; }
  closeLayer(); var it = blankItem('food'); it.name = text.slice(0, 80); openConfirm([it], { source: 'manual', editing: true });
}
function blankItem(kind) {
  if (kind === 'food') return { kind: 'food', _id: R.uid(), name: '', qty: '', meal: null, cal: NaN, p: NaN, c: NaN, s: 0, f: NaN, fib: 0, conf: 'high', note: 'Entered manually' };
  if (kind === 'exercise') return { kind: 'exercise', _id: R.uid(), name: '', sets: [{ kg: NaN, reps: NaN }] };
  if (kind === 'activity') return { kind: 'activity', _id: R.uid(), type: 'gym', min: 60, kcal: null };
  if (kind === 'body') return { kind: 'body', _id: R.uid(), weight: NaN };
  return { kind: 'water', _id: R.uid(), ml: 250 };
}
function openConfirm(items, opts) {
  opts = opts || {};
  items.forEach(function (it) { if (it.kind === 'exercise' && !it.ex) { var m = R.matchExercise(it.name); if (m) it.ex = m.key; } it.errors = R.checkItem(it); });
  pending = { items: items, token: 'c' + R.uid(), source: opts.source || 'ai', text: opts.text || '', editing: !!opts.editing, saveFav: false, favName: '', committing: false };
  renderConfirm();
}
function vfmt(v) { return v == null || (typeof v === 'number' && isNaN(v)) ? '' : v; }
function numInput(idx, field, val, step, label, extra) { return '<input class="inp num' + (typeof val === 'number' && !isNaN(val) ? '' : ' bad') + '" type="number" inputmode="decimal" step="' + (step || 'any') + '" data-ci="' + idx + '" data-cf="' + field + '" value="' + esc(vfmt(val)) + '" aria-label="' + esc(label) + '"' + (extra || '') + '>'; }
function itemHTML(it, i) {
  var ed = pending.editing, head = '', body = '';
  var kindName = { food: 'Food', exercise: 'Training', activity: 'Activity', body: 'Body', water: 'Water' }[it.kind];
  if (it.kind === 'food') {
    head = ed ? '<input class="inp" data-ci="' + i + '" data-cf="name" value="' + esc(it.name) + '" placeholder="Food name" aria-label="Food name">' : '<div><div class="qname">' + esc(it.name || 'Food') + '</div><div class="qsub">' + esc(it.qty) + '</div></div>';
    var fields = [['cal', 'kcal', '1'], ['p', 'Protein', '0.1'], ['c', 'Carbs', '0.1'], ['s', 'Sugar', '0.1'], ['f', 'Fat', '0.1'], ['fib', 'Fibre', '0.1']];
    body = '<div class="macros">' + fields.map(function (f) { return '<div>' + (ed ? numInput(i, f[0], it[f[0]], f[2], f[1]) : '<b>' + (isNaN(it[f[0]]) ? '?' : (f[0] === 'cal' ? n0(it[f[0]]) : n1(it[f[0]]))) + '</b>') + f[1] + '</div>'; }).join('') + '</div>';
    if (ed) body += '<div class="grid2" style="margin-top:8px"><label class="field">Quantity<input class="inp" data-ci="' + i + '" data-cf="qty" value="' + esc(it.qty) + '"></label><label class="field">Meal<select class="inp" data-ci="' + i + '" data-cf="meal"><option value="">Auto (' + MEAL_NAME[R.defaultMeal(R.londonTime())] + ')</option>' + MEAL_ORDER.map(function (m) { return '<option value="' + m + '"' + (it.meal === m ? ' selected' : '') + '>' + MEAL_NAME[m] + '</option>'; }).join('') + '</select></label></div>';
    else body += '<div class="qsub" style="margin-top:4px">Meal: ' + (it.meal ? MEAL_NAME[it.meal] : 'auto (' + MEAL_NAME[R.defaultMeal(R.londonTime())] + ')') + '</div>';
    if (it.note) body += '<div class="assume">' + esc(it.note) + '</div>';
  } else if (it.kind === 'exercise') {
    head = ed ? '<input class="inp" data-ci="' + i + '" data-cf="name" value="' + esc(it.name) + '" placeholder="Exercise" aria-label="Exercise name">' : '<div><div class="qname">' + esc(it.display || it.name) + '</div><div class="qsub">' + it.sets.length + ' sets</div></div>';
    body = it.sets.map(function (s, si) { return ed ? '<div class="setrow"><span class="dim num">' + (si + 1) + '</span>' + numInput(i, 'set.' + si + '.kg', s.kg, '0.5', 'Set ' + (si + 1) + ' kg', ' placeholder="kg"') + numInput(i, 'set.' + si + '.reps', s.reps, '1', 'Set ' + (si + 1) + ' reps', ' placeholder="reps"') + '<button class="btn small ghost" data-act="ci-delset" data-i="' + i + '" data-s="' + si + '" aria-label="Remove set">✕</button></div>' : ''; }).join('');
    if (ed) body += '<button class="btn small ghost" style="margin-top:6px" data-act="ci-addset" data-i="' + i + '">+ Set</button>';
    else body += '<div class="num" style="margin-top:6px;font-size:13px">' + it.sets.map(function (s) { return (s.kg ? n1(s.kg) + 'kg × ' : '') + vfmt(s.reps); }).join(' · ') + '</div>';
    if (it.warn) body += '<div class="errs" style="color:var(--warn)">⚠ ' + esc(it.warn) + '</div>';
    if (!it.ex && it.name) body += '<div class="assume">Not in your exercise library. It will still be saved and tracked for PRs.</div>';
  } else if (it.kind === 'activity') {
    if (it.type === 'steps') { head = '<div class="qname">Steps</div>'; body = ed ? numInput(i, 'steps', it.steps, '1', 'Steps') : '<div class="num" style="font-size:18px">' + n0(it.steps) + '</div><div class="assume">Replaces this day’s step count.</div>'; }
    else {
      head = ed ? '<select class="inp" data-ci="' + i + '" data-cf="type">' + ['gym', 'football', 'cardio', 'sprint', 'ballwork', 'abs', 'incline', 'other'].map(function (t) { return '<option value="' + t + '"' + (it.type === t ? ' selected' : '') + '>' + ({ gym: 'Gym session', football: 'Football', cardio: 'Cardio', sprint: 'Sprints', ballwork: 'Ball work', abs: 'Home abs', other: 'Other', incline: 'Incline walk' })[t] + '</option>'; }).join('') + '</select>' : '<div class="qname">' + ({ gym: 'Gym session', football: 'Football', cardio: 'Cardio', sprint: 'Sprints', ballwork: 'Ball work', abs: 'Home abs', other: 'Activity' })[it.type] + '</div>';
      body = ed ? '<div class="grid2" style="margin-top:6px"><label class="field">Minutes' + numInput(i, 'min', it.min, '1', 'Minutes') + '</label><label class="field">kcal (optional)<input class="inp num" type="number" inputmode="decimal" data-ci="' + i + '" data-cf="kcal" value="' + esc(vfmt(it.kcal)) + '"></label></div>' : '<div class="num">' + n0(it.min) + ' min' + (it.kcal ? ' · ' + n0(it.kcal) + ' kcal' : '') + '</div>';
    }
  } else if (it.kind === 'body') {
    head = '<div class="qname">Body</div>';
    var bf = [['weight', 'Weight kg'], ['bf', 'Body fat %'], ['waist', 'Waist cm'], ['chest', 'Chest cm'], ['shoulders', 'Shoulders cm'], ['arms', 'Arms cm']].filter(function (f) { return ed || it[f[0]] != null; });
    body = '<div class="grid3">' + bf.map(function (f) { return '<label class="field">' + f[1] + (ed ? '<input class="inp num" type="number" inputmode="decimal" step="0.1" data-ci="' + i + '" data-cf="' + f[0] + '" value="' + esc(vfmt(it[f[0]])) + '">' : '<b class="num" style="font-size:17px;color:var(--ink)">' + n1(it[f[0]]) + '</b>') + '</label>'; }).join('') + '</div>';
    if (it.weight != null && !ed) body += '<div class="assume">Replaces any weight already logged that day.</div>';
  } else {
    head = '<div class="qname">Water</div>'; body = ed ? numInput(i, 'ml', it.ml, '50', 'Water ml') : '<div class="num" style="font-size:18px">+' + n0(it.ml) + 'ml</div>';
  }
  var conf = it.kind === 'food' ? '<span class="conf ' + it.conf + '">' + (it.conf === 'low' ? '⚠ low confidence' : it.conf + ' confidence') + '</span>' : '<span class="conf">' + kindName + '</span>';
  return '<div class="item ' + (it.errors.length ? 'err' : '') + '" data-item="' + i + '"><div class="item-h"><div class="grow">' + head + '</div>' + conf + '<button class="btn small ghost" data-act="ci-del" data-i="' + i + '" aria-label="Remove item">✕</button></div>' + body + '<div class="errs" data-errs="' + i + '">' + it.errors.map(esc).join(' · ') + '</div></div>';
}
function renderConfirm() {
  if (!pending) return;
  var p = pending, k = targetDay(), anyErr = p.items.some(function (it) { return it.errors.length; });
  var hasFood = p.items.some(function (it) { return it.kind === 'food'; });
  var tot = { cal: 0, p: 0 }; p.items.forEach(function (it) { if (it.kind === 'food') { tot.cal += R.num(it.cal); tot.p += R.num(it.p); } });
  var html = '<div class="win-h"><div class="win-t">SYSTEM CONFIRMATION</div><div class="win-s">' + (k === today() ? 'Today' : R.fmtDate(k)) + '</div></div>' +
    (p.text ? '<p class="dim" style="font-size:12px;margin:-4px 0 10px">“' + esc(p.text) + '”</p>' : '') +
    (p.items.length ? p.items.map(itemHTML).join('') : '<p class="muted">No items. Add one below.</p>') +
    (p.editing ? '<div class="row" style="margin-bottom:10px"><span class="dim" style="font-size:12px">Add:</span>' + ['food', 'exercise', 'activity', 'body', 'water'].map(function (kd) { return '<button class="btn small ghost" data-act="ci-add" data-kind="' + kd + '">' + ({ food: 'Food', exercise: 'Exercise', activity: 'Activity', body: 'Body', water: 'Water' })[kd] + '</button>'; }).join('') + '</div>' : '') +
    (hasFood ? '<div class="kv"><span>This entry</span><b>' + n0(tot.cal) + ' kcal · ' + n1(tot.p) + 'g protein</b></div><div class="toggle"><span class="muted" style="font-size:13px">Save as a saved meal</span><button class="sw" role="switch" aria-checked="' + p.saveFav + '" data-act="ci-fav" aria-label="Save as a saved meal"></button></div>' + (p.saveFav ? '<input class="inp" id="fav-name" placeholder="Saved meal name" value="' + esc(p.favName) + '" style="margin-bottom:10px">' : '') : '') +
    '<div class="ci-actions"><button class="btn ghost" data-act="ci-cancel">Cancel</button>' + '' + '<button class="btn" data-act="ci-edit">' + (p.editing ? 'Done' : 'Edit') + '</button><button class="btn primary ci-go" id="ci-confirm" data-act="ci-confirm"' + (anyErr || !p.items.length ? ' disabled' : '') + '>' + (anyErr ? 'Fix highlighted values' : 'Confirm') + '</button></div>';
  var layer = $('#layer'), sheet = $('.sheet', layer);
  if (sheet && sheet.dataset.confirm) { var st = sheet.scrollTop; sheet.innerHTML = '<span class="br-b"></span>' + html; sheet.scrollTop = st; }
  else { openLayer(html, { sticky: true }); pending = p; $('.sheet', layer).dataset.confirm = '1'; }
  var fav = $('#fav-name'); if (fav) fav.oninput = function () { pending.favName = fav.value; };
}
function onConfirmInput(e) {
  var t = e.target; if (!pending || t.dataset.ci == null) return;
  var it = pending.items[+t.dataset.ci], f = t.dataset.cf; if (!it) return;
  var numeric = t.type === 'number';
  var v = numeric ? (t.value === '' ? NaN : parseFloat(t.value)) : t.value;
  if (f.indexOf('set.') === 0) { var parts = f.split('.'); it.sets[+parts[1]][parts[2]] = v; }
  else if (f === 'kcal') it.kcal = t.value === '' ? null : parseFloat(t.value);
  else if (f === 'meal') it.meal = v || null;
  else if (it.kind === 'body' && numeric) { if (t.value === '') delete it[f]; else it[f] = v; }
  else it[f] = v;
  if (it.kind === 'exercise' && f === 'name') { var m = R.matchExercise(v); it.ex = m ? m.key : null; it.display = m ? m.name : ''; it.warn = R.avoidWarning(v); }
  if (it.kind === 'activity' && f === 'type') { it.type = v; }
  it.errors = R.checkItem(it);
  if (numeric) t.classList.toggle('bad', isNaN(v) && f !== 'kcal');
  var box = $('[data-errs="' + t.dataset.ci + '"]'); if (box) box.textContent = it.errors.join(' · ');
  var card = $('[data-item="' + t.dataset.ci + '"]'); if (card) card.classList.toggle('err', it.errors.length > 0);
  var btn = $('#ci-confirm'); if (btn) { var bad = pending.items.some(function (x) { return x.errors.length; }); btn.disabled = bad || !pending.items.length; btn.textContent = bad ? 'Fix highlighted values' : 'Confirm'; }
}
function commitPending(btn) {
  if (!pending || pending.committing) return;
  var k = targetDay(), wIt = pending.items.filter(function (it) { return it.kind === 'body' && typeof it.weight === 'number' && !isNaN(it.weight); })[0], jmp = wIt ? weighJump(k, wIt.weight) : null;
  if (jmp && pending.jumpOk !== wIt.weight) { pending.jumpOk = wIt.weight; toast(jumpText(wIt.weight, jmp) + ' If that is right, tap Confirm again.', { bad: true, ms: 7000 }); return; } // are you sure?
  pending.committing = true; if (btn) btn.disabled = true;
  var items = pending.items.map(function (it) { var c = Object.assign({}, it); delete c.errors; delete c._id; return c; });
  var res = R.commitItems(S, k, items, pending.token, Date.now(), R.londonTime());
  if (!res.ok) {
    if (res.reason === 'duplicate') { closeLayer(); return; }
    pending.committing = false; if (btn) btn.disabled = false;
    toast(res.reason === 'invalid' ? 'Fix the highlighted values first.' : 'Nothing to save.', { bad: true }); return;
  }
  if (pending.replaceId) R.removeEntry(S, k, 'workouts', pending.replaceId);
  // a product typed in from its label after a barcode scan is remembered with that barcode, so the next scan finds it at once
  pending.items.forEach(function (it) { if (it.kind === 'food' && it.code && it.saveAsFood) R.rememberFood(S, { name: it.name, code: it.code, source: 'custom', serving: { label: it.qty || '1 serving', cal: it.cal, p: it.p, c: it.c, s: it.s, f: it.f, fib: it.fib } }, Date.now()); });
  if (pending.saveFav) {
    var foods = items.filter(function (x) { return x.kind === 'food'; });
    if (foods.length) { S.savedMeals.push({ id: R.uid(), name: (pending.favName || foods.map(function (f) { return f.name; }).join(' + ')).slice(0, 60), items: foods.map(function (f) { return { name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib }; }) }); }
  }
  var n = items.length, undo = res.undo;
  closeLayer();
  afterChange();
  vib([80, 40, 80]); beep('tick');
  toast('Logged ' + n + ' item' + (n > 1 ? 's' : '') + (k !== today() ? ' to ' + R.fmtDate(k) : '') + '.', { action: 'Undo', icon: '✦', onAction: function () { R.undoCommit(S, undo); afterChange(); toast('Undone.'); } });
}
/* quick logs that skip the confirmation (buttons with known values) */
function quickLog(items, msg, anchor) {
  var res = R.commitItems(S, today(), items, 'q' + R.uid(), Date.now(), R.londonTime());
  if (!res.ok) { toast('Couldn’t log that: ' + ((res.errors || [])[0] || res.reason), { bad: true }); return; }
  afterChange(anchor); vib(40);
  toast(msg, { action: 'Undo', onAction: function () { R.undoCommit(S, res.undo); afterChange(); } });
}

/* ───────────── sheets ───────────── */
function savedSheet() {
  var html = '<div class="win-h"><div class="win-t">SAVED MEALS</div><div class="win-s">Tap to log</div></div>' + (S.savedMeals.length ? S.savedMeals.map(function (m) {
    var t = m.items.reduce(function (a, f) { return { cal: a.cal + f.cal, p: a.p + f.p }; }, { cal: 0, p: 0 });
    return '<div class="quest"><div class="qicon">⚡</div><button class="grow" style="background:none;border:0;text-align:left;padding:0;min-height:44px" data-act="saved-use" data-id="' + esc(m.id) + '"><div class="qname">' + esc(m.name) + '</div><div class="qsub num">' + n0(t.cal) + ' kcal · ' + n1(t.p) + 'g protein · ' + m.items.length + ' item' + (m.items.length > 1 ? 's' : '') + '</div></button><button class="btn small ghost" data-act="saved-del" data-id="' + esc(m.id) + '" aria-label="Delete saved meal">✕</button></div>';
  }).join('') : '<p class="muted">No saved meals yet. Turn on “Save as a saved meal” when you confirm food.</p>') + '<div class="row end" style="margin-top:10px"><button class="btn ghost" data-act="close">Close</button></div>';
  openLayer(html);
}
function copySheet() {
  var k = targetDay(), prev = R.addDays(k, -1), d = R.getDay(S, prev), mt = R.mealTotals(d);
  var ms = MEAL_ORDER.filter(function (m) { return mt[m]; });
  openLayer('<div class="win-h"><div class="win-t">COPY FROM ' + esc(R.fmtDate(prev).toUpperCase()) + '</div></div>' + (ms.length ? ms.map(function (m) { return '<div class="quest"><div class="qicon">↺</div><div><div class="qname">' + MEAL_NAME[m] + '</div><div class="qsub">' + mt[m].items.map(function (f) { return esc(f.name); }).join(', ') + '</div></div><button class="btn small" data-act="copy-meal" data-day="' + prev + '" data-meal="' + m + '">Copy</button></div>'; }).join('') : '<p class="muted">Nothing was logged on ' + R.fmtDate(prev) + '.</p>') + '<div class="row end" style="margin-top:10px"><button class="btn ghost" data-act="close">Close</button></div>');
}
function foodItemSheet(id) {
  var k = viewDay || today(), d = R.getDay(S, k), f = d.foods.filter(function (x) { return x.id === id; })[0]; if (!f) return;
  openLayer('<div class="win-h"><div class="win-t">' + esc(f.name.toUpperCase()) + '</div><div class="win-s">' + esc(f.qty) + '</div></div><div class="macros" style="margin-bottom:10px">' + [['cal', 'kcal'], ['p', 'Protein'], ['c', 'Carbs'], ['s', 'Sugar'], ['f', 'Fat'], ['fib', 'Fibre']].map(function (x) { return '<div><b>' + n1(f[x[0]]) + '</b>' + x[1] + '</div>'; }).join('') + '</div>' + (f.note ? '<p class="assume">' + esc(f.note) + '</p>' : '') +
    '<label class="field" style="margin:10px 0">Move to meal<select class="inp" id="fi-meal">' + MEAL_ORDER.map(function (m) { return '<option value="' + m + '"' + (f.meal === m ? ' selected' : '') + '>' + MEAL_NAME[m] + '</option>'; }).join('') + '</select></label>' +
    (opOn(k) ? '<button class="quest treatrow ' + (f.tr ? 'done' : '') + '" style="margin-bottom:10px;width:100%;text-align:left" data-act="op-treat-toggle" data-id="' + esc(id) + '"><div class="qicon">🍫</div><div><div class="qname">' + (f.tr ? 'This is today’s treat' : 'Mark as today’s treat') + '</div><div class="qsub">One a day, ' + OPK.treatMax + ' kcal at most</div></div><div class="qrew">' + (f.tr ? '✓' : '') + '</div></button>' : '') +
    '<div class="row end"><button class="btn ghost" data-act="fi-fav" data-id="' + esc(id) + '">Save as saved meal</button><button class="btn danger" data-act="del" data-list="foods" data-id="' + esc(id) + '">Delete</button><button class="btn" data-act="close">Close</button></div>');
  $('#fi-meal').onchange = function (e) { f.meal = e.target.value; persist(); render(); toast('Moved to ' + MEAL_NAME[f.meal] + '.'); };
}
function shopSheet() {
  var k = today(), p = R.player(S, k);
  openLayer('<div class="win-h"><div class="win-t">REWARD SHOP</div><div class="win-s gold num">◈ ' + n0(p.gold) + ' gold</div></div><p class="dim" style="font-size:12px;margin:-4px 0 10px">Real-life rewards you set yourself. Earn gold from quests, bosses, trials and achievements.</p>' +
    S.shop.rewards.map(function (r) { var can = p.gold >= r.cost; return '<div class="quest"><div class="qicon">🎁</div><div><div class="qname">' + esc(r.name) + '</div><div class="qsub num gold">◈ ' + n0(r.cost) + '</div></div><div class="row"><button class="btn small goldb" data-act="buy" data-id="' + esc(r.id) + '"' + (can ? '' : ' disabled') + '>Claim</button><button class="btn small ghost" data-act="reward-del" data-id="' + esc(r.id) + '" aria-label="Delete reward">✕</button></div></div>'; }).join('') +
    '<div class="grid2" style="margin-top:12px"><input class="inp" id="rw-name" placeholder="New reward (non-food)" maxlength="60"><input class="inp num" id="rw-cost" type="number" inputmode="numeric" placeholder="Gold cost" min="1"></div><div class="row end" style="margin-top:8px"><button class="btn" data-act="reward-add">Add reward</button></div>' +
    (S.shop.purchases.length ? '<div class="qname" style="margin-top:14px">Claimed</div>' + S.shop.purchases.slice(-8).reverse().map(function (x) { return '<div class="kv"><span>' + esc(x.name) + '</span><b class="gold">◈ ' + n0(x.cost) + '</b></div>'; }).join('') : '') +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Close</button></div>');
}
function regionSheet(m) {
  var list = R.muscleExercises(S, m), heat = R.muscleHeat(S, today())[m];
  openLayer('<div class="win-h"><div class="win-t">' + m.toUpperCase() + '</div><div class="win-s">Heat ' + Math.round(heat * 100) + '% this week</div></div>' + list.map(function (e) { return '<div class="kv"><span>' + esc(e.name) + '</span><b>' + (e.best ? n1(e.best.v) + (e.best.unit === 'reps' ? ' reps' : 'kg') : '<span class="dim">no log yet</span>') + '</b></div>'; }).join('') + '<p class="dim" style="font-size:12px">All of these respect your knee and back rules.</p><div class="row end"><button class="btn ghost" data-act="close">Close</button></div>');
}
function statSheet(id) {
  var s = R.STATS.filter(function (x) { return x.id === id; })[0], cur = R.statsFor(S, today()), P = cur.parts;
  var rows = { STR: [['Gym days', P.gymDays], ['PRs', P.prs], ['Muscle kept since start (InBody)', P.smmKeptPct != null ? P.smmKeptPct + '%' : 'scan needed']], AGI: [['Football days', P.footballDays], ['Ball-work / sprint sessions', P.agilitySessions]], END: [['Average steps', n0(P.avgSteps)], ['Cardio sessions', P.cardio]], VIT: [['Lights-out nights', P.lightsNights], ['3L water days', P.waterDays], ['InBody score', P.inbodyScore != null ? P.inbodyScore : 'scan needed']], DISC: [['Calorie target days', P.calorieDays], ['Fat mass lost (InBody)', P.fatLostKg != null ? n1(P.fatLostKg) + 'kg' : 'scan needed']], FOCUS: [['Protein days', P.proteinDays], ['Daily Clears', P.clearDays]] }[id];
  openLayer('<div class="win-h"><div class="win-t">' + id + ' · ' + s.name.toUpperCase() + '</div><div class="win-s num">' + cur[id] + ' / 100</div></div>' + rows.map(function (r) { return '<div class="kv"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '<div class="kv"><span>Days counted</span><b>' + cur.n + '</b></div><p class="muted" style="font-size:13px">' + esc(s.how) + '</p><div class="row end"><button class="btn ghost" data-act="close">Close</button></div>');
}

/* ───────────── food search, portions, barcode scanner (MyFitnessPal-style) ───────────── */
var foodCache = {}, suggTimer = null, suggSeq = 0, scanner = null, zxingP = null;
var SRC_LABEL = { off: 'Open Food Facts', label: 'From label photo', web: 'Found online', custom: 'Your food', history: 'You’ve had this', meal: 'Saved meal', chain: 'Official menu', generic: 'Generic (USDA) · per 100g', fatsecret: 'FatSecret', cofid: 'UK food database (CoFID)', recipe: 'My recipe', mfp: 'From MyFitnessPal' };
var SRC_ICON = { off: '🛒', label: '🏷️', web: '🌐', custom: '★', history: '↺', meal: '⚡', chain: '🍔', generic: '🥗', fatsecret: '🔍', cofid: '🇬🇧', recipe: '🍲', mfp: '📒' };
/* built-in foods: the chains' own published menus (inside the page) and ~7,200 generic foods (foods.json, fetched once and kept offline) */
var BUILTIN = null, genericP = null;
function builtin() { if (!BUILTIN) BUILTIN = R.builtinFoods(window.RTL_CHAINS || [], window.RTL_GENERIC || [], window.RTL_MFP || []); return BUILTIN; }
function loadGeneric() {
  if (window.RTL_GENERIC || genericP || !window.RTL_FOODS_URL || !window.fetch) return genericP;
  genericP = fetch(window.RTL_FOODS_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { var rows = Array.isArray(j) ? j : j && j.g; if (Array.isArray(rows)) { window.RTL_GENERIC = rows; window.RTL_MFP = j && Array.isArray(j.m) ? j.m : []; BUILTIN = null; } else genericP = null; }).catch(function () { genericP = null; });
  return genericP;
}
function cacheFood(it) { var key = 'f' + R.hash(it.id + '|' + it.name + '|' + it.code + '|' + it.brand + '|' + it.source); foodCache[key] = it; return key; }
function kcalHint(it) {
  if (it.serving) return n0(it.serving.cal) + ' kcal · ' + esc(it.serving.label);
  return n0(it.per100.cal) + ' kcal / 100g';
}
function sugRow(it, act) {
  return '<button class="sug" data-act="' + (typeof act === 'string' ? act : 'pick-food') + '" data-key="' + cacheFood(it) + '"><span class="si">' + (SRC_ICON[it.source] || '•') + '</span><span class="sn"><b>' + esc(it.name) + '</b><small>' + esc([it.brand && it.source !== 'meal' ? it.brand : '', it.size || ''].filter(Boolean).join(' · ') || SRC_LABEL[it.source]) + '</small></span><span class="sk">' + kcalHint(it) + '</span></button>';
}
function renderSuggest(q) {
  var box = $('#sugg'), sheet = $('.cmd-sheet'); if (!box) return;
  q = String(q || '').trim(); clearTimeout(suggTimer); var seq = ++suggSeq;
  if (sheet) sheet.classList.toggle('typing', q.length > 0);
  if (!q) { var rec = R.searchLocal(S, '', 6); box.innerHTML = rec.length ? '<div class="sh">Recent & frequent</div>' + rec.map(sugRow).join('') : ''; return; }
  var local = R.searchLocal(S, q, 5), quick = R.parseQuick(q), seen = {};
  local.forEach(function (x) { seen[(x.name + '|' + x.brand).toLowerCase()] = 1; });
  var built = q.length >= 2 ? R.searchBuiltin(builtin(), q, 8).filter(function (x) { return !seen[(x.name + '|' + x.brand).toLowerCase()]; }) : [];
  var online = q.length >= 3 && connected() && !HOSTED;
  var html = (quick.ok && quick.items.length && !quick.rest.length ? '<button class="sug ask" data-act="quick-cmd"><span class="si">✓</span><span class="sn"><b>Log “' + esc(q.slice(0, 50)) + '”</b><small>' + esc(quick.items.map(quickLabel).join(' · ')) + '</small></span><span class="sk">Enter ↵</span></button>' : '') +
    (local.length ? '<div class="sh">Your foods</div>' + local.map(sugRow).join('') : '') +
    (built.length ? '<div class="sh">UK menus & foods</div>' + built.map(sugRow).join('') : '') +
    '<div id="sugg-db">' + (online ? '<div class="sh">Online databases <span class="dots"></span></div>' : '') + '</div>' +
    '<button class="sug" data-act="manual-from-text"><span class="si">✎</span><span class="sn"><b>Enter it manually</b><small>Type the calories and macros yourself</small></span><span class="sk"></span></button>';
  box.innerHTML = html; submitText.last = q;
  if (!window.RTL_GENERIC) { var gp = loadGeneric(); if (gp) gp.then(function () { if (seq === suggSeq && window.RTL_GENERIC) renderSuggest(q); }); }
  if (!online) return;
  suggTimer = setTimeout(function () {
    fetchT(apiBase() + '/food/search?q=' + encodeURIComponent(q), { headers: { 'X-App-Key': conn.key } }, 12000).then(function (r) { return r.json(); }).then(function (j) {
      if (seq !== suggSeq) return; var db = $('#sugg-db'); if (!db) return;
      var items = (j && j.ok && Array.isArray(j.items) ? j.items : []).map(function (x) { var it = R.normalizeLib(x); if (it) it.size = x.size || ''; return it; }).filter(Boolean)
        .filter(function (x) { return !seen[(x.name + '|' + x.brand).toLowerCase()]; }).slice(0, 10);
      var src = j && j.sources || {}, note = src.fatsecret && src.fatsecret !== 'ok' && src.fatsecret !== 'not set up' ? '<p class="dim fs-note" style="font-size:11.5px;margin:2px 4px 6px">' + esc(src.fatsecret) + '</p>' : '';
      db.innerHTML = '<div class="sh">Online databases</div>' + (items.length ? items.map(sugRow).join('') : '<p class="dim" style="font-size:12px;margin:2px 4px 6px">' + esc(j && !j.ok ? j.error : 'No more matches online.') + '</p>') + note;
    }).catch(function () { if (seq !== suggSeq) return; var db = $('#sugg-db'); if (db) db.innerHTML = '<p class="dim" style="font-size:12px;margin:2px 4px 6px">Online databases unavailable right now. The built-in foods above still work.</p>'; });
  }, 450);
}
function quickLabel(it) {
  if (it.kind === 'water') return n0(it.ml) + 'ml water';
  if (it.kind === 'body') return [it.weight != null ? n1(it.weight) + 'kg' : '', it.waist != null ? 'waist ' + n1(it.waist) + 'cm' : '', it.bf != null ? n1(it.bf) + '% fat' : ''].filter(Boolean).join(', ') || 'measurements';
  if (it.kind === 'activity') return it.type === 'steps' ? n0(it.steps) + ' steps' : (({ gym: 'Gym', football: 'Football', cardio: 'Cardio', sprint: 'Sprints', ballwork: 'Ball work', abs: 'Abs', other: 'Activity', incline: 'Incline walk' })[it.type] || 'Activity') + ' ' + it.min + ' min';
  if (it.kind === 'exercise') return it.name + ' ' + it.sets.length + '×' + (it.sets[0] ? it.sets[0].reps : '') + (it.sets[0] && it.sets[0].kg ? ' @ ' + n1(it.sets[0].kg) + 'kg' : '');
  return it.name || 'Food';
}
/* portion picker with live macros */
var portionState = null;
function portionSheet(it, opts) {
  opts = opts || {};
  var mode = it.serving ? 'servings' : 'grams';
  portionState = { it: it, mode: mode, amount: mode === 'servings' ? 1 : 100, meal: opts.recipe ? '' : (cmdMeal || ''), recipe: !!opts.recipe, nameEdit: it.source === 'label' && (!it.name || it.name === 'Scanned food'), token: 'p' + R.uid() };
  renderPortion(opts);
}
function renderPortion(opts) {
  var ps = portionState; if (!ps) return; var it = ps.it, weigh = R.canWeigh(it);
  var pr = R.portion(it, ps.mode === 'grams' ? { grams: ps.amount } : { servings: ps.amount });
  var src = it.source === 'web' && it.url ? 'From ' + R.hostOf(it.url) : SRC_LABEL[it.source];
  var quick = ps.mode === 'servings' ? [0.5, 1, 1.5, 2, 3] : [50, 100, 150, 200, 250];
  var html = '<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">ADD FOOD</div><div class="win-s">' + esc(targetDay() === today() ? 'Today' : R.fmtDate(targetDay())) + '</div></div>' +
    (ps.nameEdit ? '<label class="field">What is it?<input class="inp" id="pf-name" placeholder="e.g. Grenade Carb Killa bar" value="' + esc(it.name === 'Scanned food' ? '' : it.name) + '"></label>' : '<div class="pf-name">' + esc(it.name) + '</div>') +
    '<div class="pf-src"><span class="src">' + esc(src) + '</span>' + (it.brand && it.source !== 'meal' ? '<span class="dim">' + esc(it.brand) + '</span>' : '') + (it.code ? '<span class="dim num">' + esc(it.code) + '</span>' : '') + '</div>' +
    '<div class="row between" style="margin-top:12px"><div class="seg" role="group" aria-label="Unit"><button data-act="pf-mode" data-mode="servings" aria-pressed="' + (ps.mode === 'servings') + '"' + (it.serving || it.per100 ? '' : ' disabled') + '>' + (it.serving ? esc(it.serving.label.length > 18 ? 'Servings' : it.serving.label) : '100g portions') + '</button><button data-act="pf-mode" data-mode="grams" aria-pressed="' + (ps.mode === 'grams') + '"' + (weigh ? '' : ' disabled') + '>Grams</button></div>' +
    '<div class="stepper"><button data-act="pf-step" data-d="-1" aria-label="Less">−</button><input id="pf-amt" class="inp num" type="number" inputmode="decimal" step="' + (ps.mode === 'grams' ? 5 : 0.5) + '" value="' + ps.amount + '" aria-label="Amount"><button data-act="pf-step" data-d="1" aria-label="More">+</button></div></div>' +
    '<div class="qchips" style="margin-top:8px">' + quick.map(function (v) { return '<button class="qchip" style="--c:var(--kcal)' + (v === ps.amount ? ';background:color-mix(in srgb,var(--kcal) 28%,transparent)' : '') + '" data-act="pf-set" data-v="' + v + '">' + (ps.mode === 'grams' ? v + 'g' : ({ 0.5: '½', 1: '1', 1.5: '1½', 2: '2', 3: '3' })[v]) + '</button>'; }).join('') + '</div>' +
    '<div class="macros big" id="pf-macros">' + pfMacros(pr) + '</div>' +
    (it.per100 ? '<p class="dim" style="font-size:12px;margin:6px 2px 0">Per 100g: ' + n0(it.per100.cal) + ' kcal · ' + n1(it.per100.p) + 'g protein · ' + n1(it.per100.c) + 'g carbs · ' + n1(it.per100.f) + 'g fat</p>' : '') +
    (ps.recipe ? '' : '<label class="field" style="margin-top:10px">Meal<select class="inp" id="pf-meal"><option value="">Auto (' + MEAL_NAME[R.defaultMeal(R.londonTime())] + ')</option>' + MEAL_ORDER.map(function (m) { return '<option value="' + m + '"' + (ps.meal === m ? ' selected' : '') + '>' + MEAL_NAME[m] + '</option>'; }).join('') + '</select></label>') +
    (ps.recipe ? '<div class="ci-actions"><button class="btn ghost" data-act="rc-back">Back</button><button class="btn primary ci-go" id="pf-log" data-act="pf-log"' + (pr ? '' : ' disabled') + '>Add to recipe' + (pr ? ' · ' + n0(pr.cal) + ' kcal' : '') + '</button></div>' :
    '<div class="ci-actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="pf-edit">Edit numbers</button><button class="btn primary ci-go" id="pf-log" data-act="pf-log"' + (pr ? '' : ' disabled') + '>Log ' + (pr ? n0(pr.cal) + ' kcal' : '') + '</button></div>');
  var layer = $('#layer'), sheet = $('.sheet', layer);
  if (sheet && sheet.dataset.portion) { var st = sheet.scrollTop; sheet.innerHTML = '<span class="br-b"></span>' + html; sheet.scrollTop = st; }
  else { openLayer(html, { sticky: true }); $('.sheet', layer).dataset.portion = '1'; }
  var amt = $('#pf-amt'); amt.addEventListener('input', function () { var v = parseFloat(amt.value); if (isFinite(v) && v > 0 && v <= (ps.mode === 'grams' ? 3000 : 50)) { ps.amount = v; updatePortionLive(); } });
  var pm = $('#pf-meal'); if (pm) pm.addEventListener('change', function (e) { ps.meal = e.target.value; });
  var nm = $('#pf-name'); if (nm) nm.addEventListener('input', function () { ps.it.name = nm.value.trim() || 'Scanned food'; });
}
function pfMacros(pr) {
  if (!pr) return '<div style="grid-column:1/-1;color:var(--ink-3)">Pick an amount</div>';
  return [['cal', 'kcal', 'var(--kcal)'], ['p', 'Protein', 'var(--protein)'], ['c', 'Carbs', 'var(--carbs)'], ['s', 'Sugar', 'var(--ink-2)'], ['f', 'Fat', 'var(--fat)'], ['fib', 'Fibre', 'var(--fibre)']].map(function (x) { return '<div style="--c:' + x[2] + '"><b>' + (x[0] === 'cal' ? n0(pr[x[0]]) : n1(pr[x[0]])) + '</b>' + x[1] + '</div>'; }).join('');
}
function updatePortionLive() {
  var ps = portionState; if (!ps) return; var pr = R.portion(ps.it, ps.mode === 'grams' ? { grams: ps.amount } : { servings: ps.amount });
  var m = $('#pf-macros'); if (m) m.innerHTML = pfMacros(pr);
  var b = $('#pf-log'); if (b) { b.disabled = !pr; b.textContent = 'Log ' + (pr ? n0(pr.cal) + ' kcal' : ''); }
}
function portionItems() {
  var ps = portionState, it = ps.it, opt = ps.mode === 'grams' ? { grams: ps.amount } : { servings: ps.amount };
  if (it.source === 'meal') {
    var meal = S.savedMeals.filter(function (m) { return m.id === it.mealId; })[0]; if (!meal) return [];
    var n = ps.mode === 'servings' ? ps.amount : 1;
    return R.savedMealItems(meal).map(function (x) { MACRO_KEYS_UI.forEach(function (k) { x[k] = k === 'cal' ? Math.round(x[k] * n) : Math.round(x[k] * n * 10) / 10; }); if (n !== 1) x.qty = (x.qty ? x.qty + ' × ' : '× ') + n; x.meal = ps.meal || null; return x; });
  }
  var pr = R.portion(it, opt); if (!pr) return [];
  var src = it.source === 'web' && it.url ? 'Exact figures from ' + R.hostOf(it.url) : it.source === 'off' ? 'Open Food Facts' + (it.code ? ' · ' + it.code : '') : it.source === 'label' ? 'Read from the label' :
    it.source === 'chain' ? 'Official ' + it.brand + ' figures' + (it.size ? ' (' + it.size.replace(/^Official · /, '') + ')' : '') : it.source === 'generic' ? 'Generic food, USDA figures per 100g' : it.source === 'fatsecret' ? 'FatSecret' + (it.per100 || it.serving ? '' : '') + ' · sugar and fibre not listed' : it.source === 'cofid' ? 'UK food database (CoFID)' : it.source === 'recipe' ? 'Your recipe · makes ' + n1(+(it.serving.label.match(/of ([\d.]+)/) || [0, 1])[1]) + ' portions' : it.source === 'mfp' ? 'MyFitnessPal database (added by its users, so check it looks right)' : '';
  return [{ kind: 'food', name: it.name + (it.brand && it.source !== 'history' ? ' · ' + it.brand : ''), qty: pr.qty, cal: pr.cal, p: pr.p, c: pr.c, s: pr.s, f: pr.f, fib: pr.fib, conf: 'high', note: src, meal: ps.meal || null }];
}
var MACRO_KEYS_UI = ['cal', 'p', 'c', 's', 'f', 'fib'];
function logPortion() {
  var ps = portionState; if (!ps || ps.saving) return;
  if (ps.nameEdit && (!ps.it.name || ps.it.name === 'Scanned food')) { toast('Give it a name so you can find it next time.', { bad: true }); var nm = $('#pf-name'); if (nm) nm.focus(); return; }
  var items = portionItems(); if (!items.length) { toast('Pick an amount first.', { bad: true }); return; }
  ps.saving = true;
  var res = R.commitItems(S, targetDay(), items, ps.token, Date.now(), R.londonTime());
  if (!res.ok) { ps.saving = false; if (res.reason === 'duplicate') { closeLayer(); return; } toast((res.errors || ['Those numbers don’t look right'])[0], { bad: true }); return; }
  var it = ps.it, remembered = null;
  if (it.source === 'recipe') { var rc = (S.recipes || []).filter(function (r) { return r.id === it.recipeId; })[0]; if (rc) { rc.uses = (rc.uses || 0) + 1; rc.last = Date.now(); persist(); } }
  else if (it.source !== 'history' && it.source !== 'meal') remembered = R.rememberFood(S, it, Date.now());
  portionState = null; cmdMeal = ''; closeLayer(); afterChange(); vib([60, 30, 60]);
  toast('Logged ' + items[0].name.split(' · ')[0] + (items.length > 1 ? ' (+' + (items.length - 1) + ')' : '') + ', ' + n0(items.reduce(function (a, b) { return a + b.cal; }, 0)) + ' kcal.', { icon: '🍽️', action: 'Undo', onAction: function () { R.undoCommit(S, res.undo); afterChange(); toast('Undone.'); } });
}
function busyOverlay(title, sub) {
  var d = document.createElement('div'); d.className = 'ceremony busy'; d.style.zIndex = 70;
  d.innerHTML = '<div class="modal">' + win('', '<div class="scan"><div class="scan-line"></div><div class="scan-t"><span>' + esc(title) + '</span><span class="dots"></span></div><div class="scan-s">' + esc(sub) + '</div></div>') + '</div>';
  document.body.appendChild(d); busy = true;
  return function () { busy = false; d.remove(); };
}
/* barcode scanner: live camera (BarcodeDetector where available, ZXing everywhere else, incl. iPhone) + photo + typed fallbacks */
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingP) return zxingP;
  zxingP = new Promise(function (res, rej) {
    var sc = document.createElement('script'); sc.src = 'zxing.min.js'; sc.async = true;
    sc.onload = function () { window.ZXing ? res(window.ZXing) : rej(new Error('Scanner failed to load')); };
    sc.onerror = function () { zxingP = null; rej(new Error('Couldn’t load the scanner. Check your connection.')); };
    document.head.appendChild(sc);
  });
  return zxingP;
}
function zxingDecodeCanvas(Z, canvas) {
  var hints = new Map(); hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]); hints.set(Z.DecodeHintType.TRY_HARDER, true);
  var reader = new Z.MultiFormatReader(); reader.setHints(hints);
  try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); } catch (e) { return null; }
}
function decodeImageFile(file) {
  return loadZXing().then(function (Z) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var best = null;
        [1600, 1000, 700].some(function (max) {
          var sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); best = zxingDecodeCanvas(Z, c); return !!best;
        });
        URL.revokeObjectURL(url); res(best);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Couldn’t open that photo')); };
      img.src = url;
    });
  });
}
function stopScanner() { if (!scanner) return; scanner.stop = true; clearTimeout(scanner.timer); try { scanner.stream && scanner.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} scanner = null; }
function openScanner() {
  closeLayer();
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">SCAN A BARCODE</div><div class="win-s">Food database</div></div>' +
    '<div class="scanbox" id="scanbox"><video id="scan-video" playsinline muted autoplay></video><div class="reticle"><i></i></div><div class="scan-msg" id="scan-msg">Starting camera…</div></div>' +
    '<div class="row" style="margin-top:12px"><label class="btn small tint" style="--c:var(--kcal);position:relative;overflow:hidden">📷 Photo of barcode<input type="file" accept="image/*" capture="environment" id="bc-photo" style="position:absolute;inset:0;opacity:0"></label></div>' +
    '<div class="inrow" style="margin-top:10px;display:flex;gap:8px"><input class="inp num" id="bc-type" inputmode="numeric" placeholder="Or type the barcode number" maxlength="14" style="text-align:left"><button class="btn" data-act="bc-type">Look up</button></div>' +
    '<p class="dim" style="font-size:12px;margin:10px 2px 0">Barcodes you’ve scanned before work offline.</p>', { cls: 'scan-sheet' });
  $('#bc-photo').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return; $('#scan-msg').textContent = 'Reading photo…';
    decodeImageFile(f).then(function (code) { if (code) foundBarcode(code); else $('#scan-msg').textContent = 'No barcode found in that photo. Get closer and keep it flat.'; }, function (err) { $('#scan-msg').textContent = err.message; });
  });
  var st = scanner = { stop: false };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#scan-msg').textContent = 'Live camera isn’t available here. Use a photo or type the number.'; return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (stream) {
    if (st.stop) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    st.stream = stream; var v = $('#scan-video'); v.srcObject = stream; v.play().catch(function () {});
    $('#scan-msg').textContent = 'Point at the barcode';
    var native = null;
    try { if ('BarcodeDetector' in window) native = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] }); } catch (e) { native = null; }
    var canvas = document.createElement('canvas');
    function tick(Z) {
      if (st.stop) return;
      if (!v.videoWidth) { st.timer = setTimeout(function () { tick(Z); }, 200); return; }
      var p = native ? native.detect(v).then(function (r) { return r && r[0] ? r[0].rawValue : null; }).catch(function () { return null; }) : Promise.resolve((function () {
        var w = v.videoWidth, h = v.videoHeight, cw = Math.round(w * 0.8), ch = Math.round(h * 0.5); canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch); return zxingDecodeCanvas(Z, canvas);
      })());
      p.then(function (code) { if (st.stop) return; if (code && /^\d{6,14}$/.test(code)) foundBarcode(code); else st.timer = setTimeout(function () { tick(Z); }, native ? 180 : 250); });
    }
    if (native) tick(null); else loadZXing().then(tick, function (e) { $('#scan-msg').textContent = e.message; });
  }, function () { var m = $('#scan-msg'); if (m) m.textContent = 'Camera access was blocked. Allow the camera for this site (iPhone: Settings → Safari → Camera), or use a photo.'; });
}
function foundBarcode(code) {
  code = String(code).replace(/\D/g, ''); stopScanner(); vib([40, 30, 40]); beep('tick');
  var local = R.findByCode(S, code);
  if (local) { closeLayer(); portionSheet(local); return; }
  if (!connected()) { closeLayer(); errorBox('Barcode ' + code + ' isn’t in your foods yet. Connect the System to look it up.', true); return; }
  closeLayer(); var done = busyOverlay('LOOKING UP BARCODE', code + ' · Open Food Facts');
  fetchT(apiBase() + '/food/barcode/' + code, { headers: { 'X-App-Key': conn.key } }, 12000).then(function (r) { return r.json(); }).then(function (j) {
    done();
    if (j && j.ok && j.found) { var it = R.normalizeLib(j.item); if (it) { portionSheet(it); return; } }
    if (j && !j.ok) { toast(j.error || 'Lookup failed.', { bad: true }); }
    notFoundSheet(code);
  }).catch(function () { done(); notFoundSheet(code); });
}
function notFoundSheet(code) {
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">NOT IN THE DATABASE</div><div class="win-s num">' + esc(code) + '</div></div>' +
    '<p class="muted" style="margin:0 0 12px;font-size:13.5px">Add it once and it’ll come up instantly next time you scan it.</p>' +
    '<button class="opt" style="--c:var(--kcal)" data-act="search-instead"><span class="oi">🔍</span><span><b>Search for it by name</b><span>UK menus, generic foods, FatSecret and Open Food Facts.</span></span></button>' +
    '<button class="opt" style="--c:var(--ink-2)" data-act="manual-code" data-code="' + esc(code) + '"><span class="oi">✎</span><span><b>Enter it from the label</b><span>Type the numbers on the pack once; scanning it again finds it straight away.</span></span></button>');
}
function myFoodsSheet() {
  var lib = S.library.slice().sort(function (a, b) { return b.uses - a.uses || b.last - a.last; });
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">MY FOODS</div><div class="win-s">' + lib.length + ' saved</div></div>' +
    (lib.length ? lib.map(function (it) { return '<div class="sugrow">' + sugRow(it) + '<button class="btn small ghost" data-act="lib-del" data-id="' + esc(it.id) + '" aria-label="Remove">✕</button></div>'; }).join('') : '<p class="muted">Foods you log from a menu, the databases or a barcode are saved here so they come up instantly next time.</p>') +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Close</button></div>');
}

/* ───────────── iPhone reminders (push notifications): water every 2 hours 9am–9pm when behind, protein at 4pm and 8pm ─────────────
   The phone signs up with your Worker; the Worker checks your cloud copy every 30 minutes and only sends when you're behind. */
function pushProblem() {
  if (!connected()) return 'Connect the System above first: the reminders come from your Worker.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone ? 'On iPhone, notifications only work when Ascend is opened from its Home Screen icon (iOS 16.4 or later). In Safari: Share → Add to Home Screen, then open it from there.' : 'This browser can’t receive notifications.';
  }
  if (Notification.permission === 'denied') return 'Notifications are blocked for Ascend. On iPhone: Settings → Notifications → Ascend → Allow Notifications.';
  return '';
}
function remindHTML() {
  var rm = S.settings.remind, why = pushProblem(), on = rm.on && !why && window.Notification && Notification.permission === 'granted';
  return '<div class="qname" style="margin:18px 0 8px">Reminders (iPhone notifications)</div>' +
    '<p class="dim" style="font-size:12.5px;margin:0 0 8px">Water every 2 hours from 9am to 9pm, only when you’re behind on ' + n1(S.targets.waterMl / 1000) + 'L. Protein checks at 4pm and 8pm, and a nudge at 1pm if nothing is logged. Nothing is sent when you’re on track.</p>' +
    (why ? '<p class="warnc" id="push-why" style="font-size:12.5px;margin:0 0 8px">' + esc(why) + '</p>' : '') +
    '<div class="row" id="push-row">' + (on ? '<button class="btn small" data-act="push-test">Send a test</button><button class="btn small ghost" data-act="push-off">Turn off</button>' : '<button class="btn small tint" style="--c:var(--water)" data-act="push-on"' + (why && !/Home Screen|blocked/.test(why) ? ' disabled' : '') + '>🔔 Turn on notifications</button>') + '</div>' +
    '<div class="toggle"><span class="muted">💧 Water reminders</span><button class="sw" role="switch" aria-checked="' + (rm.water !== false) + '" data-act="remind-toggle" data-key="water" aria-label="Water reminders"></button></div>' +
    '<div class="toggle"><span class="muted">🥩 Protein & food reminders</span><button class="sw" role="switch" aria-checked="' + (rm.macros !== false) + '" data-act="remind-toggle" data-key="macros" aria-label="Protein and food reminders"></button></div>' +
    '<div id="push-res" class="qsub" style="margin-top:4px"></div>';
}
function b64uBytes(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); var bin = atob(s + '==='.slice((s.length + 3) % 4)), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function pushCall(path, body) { return fetchT(apiBase() + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'X-App-Key': conn.key }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }, 15000).then(function (r) { return r.json(); }); }
function pushNote(t, bad) { var el = $('#push-res'); if (el) { el.textContent = t; el.className = 'qsub ' + (bad ? 'bad' : 'good'); } }
function pushOn() {
  var why = pushProblem(); if (why) { pushNote(why, true); return; }
  pushNote('Asking the phone…');
  Notification.requestPermission().then(function (p) {
    if (p !== 'granted') throw new Error('Notifications weren’t allowed. You can allow them in iPhone Settings → Notifications → Ascend.');
    return Promise.all([navigator.serviceWorker.ready, pushCall('/push/key')]);
  }).then(function (a) {
    var reg = a[0], k = a[1]; if (!k || !k.ok) throw new Error((k && k.error) || 'The Worker didn’t answer. Paste the new worker.js into Cloudflare first.');
    return reg.pushManager.getSubscription().then(function (old) { return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(k.key) }); });
  }).then(function (sub) { return pushCall('/push/subscribe', { sub: sub.toJSON() }); }).then(function (j) {
    if (!j || !j.ok) throw new Error((j && j.error) || 'The Worker refused the sign-up.');
    S.settings.remind.on = true; persist(true); if (S.settings.cloud) syncCheck(true);
    var box = $('#push-row'); if (box) box.innerHTML = '<button class="btn small" data-act="push-test">Send a test</button><button class="btn small ghost" data-act="push-off">Turn off</button>';
    pushNote('Reminders are on for this phone. Tap “Send a test” to see one.'); vib(40);
  }).catch(function (e) { pushNote(String(e && e.message || e), true); });
}
function pushOff() {
  S.settings.remind.on = false; persist(true); if (S.settings.cloud) syncCheck(true);
  var done = function () { var box = $('#push-row'); if (box) box.innerHTML = '<button class="btn small tint" style="--c:var(--water)" data-act="push-on">🔔 Turn on notifications</button>'; pushNote('Reminders are off.'); };
  if (!('serviceWorker' in navigator)) { done(); return; }
  navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { if (!sub) return; var ep = sub.endpoint; return sub.unsubscribe().then(function () { return pushCall('/push/unsubscribe', { endpoint: ep }).catch(function () {}); }); }).then(done, done);
}
/* a tapped reminder opens the app at the right place */
function notifyOpen(url) {
  var m = /[?&]do=(water|log)/.exec(url || ''); if (!m) return;
  if (m[1] === 'water') { closeLayer(); openCmd(); } else { closeLayer(); setTab('log'); }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'notify') notifyOpen(e.data.url); });

/* ───────────── Quick add (MyFitnessPal-style): just the calories, and the macros if you know them ───────────── */
function quickAddSheet() {
  var td = targetDay(), m = cmdMeal || R.defaultMeal(R.londonTime());
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">QUICK ADD</div><div class="win-s">' + esc(td === today() ? 'Today' : R.fmtDate(td)) + '</div></div>' +
    '<label class="field">Calories<input class="inp num big-in" id="qa-cal" type="number" inputmode="numeric" min="1" max="5000" placeholder="e.g. 450" autofocus></label>' +
    '<div class="grid3" style="margin-top:8px"><label class="field">Protein g<input class="inp num" id="qa-p" type="number" inputmode="decimal" min="0" placeholder="optional"></label><label class="field">Carbs g<input class="inp num" id="qa-c" type="number" inputmode="decimal" min="0" placeholder="optional"></label><label class="field">Fat g<input class="inp num" id="qa-f" type="number" inputmode="decimal" min="0" placeholder="optional"></label></div>' +
    '<label class="field" style="margin-top:8px">Name (optional)<input class="inp" id="qa-name" maxlength="80" placeholder="Quick add"></label>' +
    '<label class="field" style="margin-top:8px">Meal<select class="inp" id="qa-meal">' + MEAL_ORDER.map(function (x) { return '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + MEAL_NAME[x] + '</option>'; }).join('') + '</select></label>' +
    '<div class="ci-actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary ci-go" data-act="qa-save">Add</button></div>', { sticky: true });
}
function quickAddSave() {
  var v = function (id) { var e = $('#' + id); return e ? e.value : ''; };
  var it = R.quickAddItem({ cal: v('qa-cal'), p: v('qa-p'), c: v('qa-c'), f: v('qa-f'), name: v('qa-name'), meal: v('qa-meal') });
  if (!it) { toast('Type the calories first (1 to 5,000).', { bad: true }); var c = $('#qa-cal'); if (c) c.focus(); return; }
  var k = targetDay(), res = R.commitItems(S, k, [it], 'qa' + R.uid(), Date.now(), R.londonTime());
  if (!res.ok) { toast((res.errors || ['Those numbers don’t look right'])[0], { bad: true }); return; }
  cmdMeal = ''; closeLayer(); afterChange(); vib(40);
  toast('Added ' + n0(it.cal) + ' kcal to ' + MEAL_NAME[it.meal || R.defaultMeal(R.londonTime())] + '.', { icon: '＋', action: 'Undo', onAction: function () { R.undoCommit(S, res.undo); afterChange(); toast('Undone.'); } });
}

/* ───────────── My recipes: add the whole pot once, say how many portions, then log a plate in one tap ───────────── */
var recipeDraft = null;
function recipesSheet() {
  var list = (S.recipes || []).slice().sort(function (a, b) { return (b.uses || 0) - (a.uses || 0) || (b.last || 0) - (a.last || 0); });
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">MY RECIPES</div><div class="win-s">' + list.length + ' saved</div></div>' +
    (list.length ? list.map(function (r) { var it = R.recipeAsItem(r), v = it.serving;
      return '<div class="quest rc-row"><div class="qicon">🍲</div><button class="grow" style="background:none;border:0;text-align:left;padding:0;min-height:44px;color:inherit" data-act="rc-log" data-id="' + esc(r.id) + '"><div class="qname">' + esc(r.name) + '</div><div class="qsub num">' + n0(v.cal) + ' kcal · ' + n1(v.p) + 'g protein a portion · makes ' + n1(r.portions) + '</div></button><button class="btn small" data-act="rc-log" data-id="' + esc(r.id) + '">Log</button><button class="btn small ghost" data-act="rc-edit" data-id="' + esc(r.id) + '" aria-label="Edit ' + esc(r.name) + '">✎</button></div>'; }).join('')
      : '<p class="muted">Cook something at home, like a chicken curry or dhal? Add everything that goes in the pot once, say how many plates it makes, and log a plate in one tap from then on.</p>') +
    '<div class="ci-actions"><button class="btn ghost" data-act="close">Close</button><button class="btn primary ci-go" data-act="rc-new">＋ New recipe</button></div>');
}
function recipeEditor() {
  var r = recipeDraft; if (!r) return; var t = R.recipeTotals(r), n = Math.max(0.5, +r.portions || 1);
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">' + (r.id ? 'EDIT RECIPE' : 'NEW RECIPE') + '</div><div class="win-s">' + r.items.length + ' ingredient' + (r.items.length === 1 ? '' : 's') + '</div></div>' +
    '<label class="field">Name<input class="inp" id="rc-name" maxlength="60" placeholder="e.g. Chicken curry" value="' + esc(r.name || '') + '"></label>' +
    '<label class="field" style="margin-top:8px">How many portions does it make?<div class="stepper rc-por"><button data-act="rc-por" data-d="-1" aria-label="Fewer">−</button><input class="inp num" id="rc-portions" type="number" inputmode="decimal" min="0.5" max="50" step="0.5" value="' + n1(n) + '"><button data-act="rc-por" data-d="1" aria-label="More">+</button></div></label>' +
    '<div class="sh" style="margin-top:12px">Ingredients (the whole pot)</div>' +
    (r.items.length ? r.items.map(function (f, i) { return '<div class="kv rc-ing"><span>' + esc(f.name) + (f.qty ? ' <small class="dim">' + esc(f.qty) + '</small>' : '') + '</span><b class="num">' + n0(f.cal) + ' kcal</b><button class="btn small ghost" data-act="rc-ing-del" data-i="' + i + '" aria-label="Remove ' + esc(f.name) + '">✕</button></div>'; }).join('') : '<p class="dim" style="font-size:13px">No ingredients yet.</p>') +
    '<div class="row" style="margin-top:8px"><button class="btn small tint" style="--c:var(--kcal)" data-act="rc-add-ing">＋ Add ingredient</button><button class="btn small ghost" data-act="rc-manual">✎ Type one in</button></div>' +
    '<div class="macros" style="margin-top:12px" id="rc-tot">' + rcTotHTML(t, n) + '</div>' +
    '<div class="ci-actions">' + (r.id ? '<button class="btn danger" data-act="rc-del">Delete</button>' : '<button class="btn ghost" data-act="rc-cancel">Cancel</button>') + '<button class="btn primary ci-go" data-act="rc-save">Save recipe</button></div>', { sticky: true });
  var nm = $('#rc-name'), po = $('#rc-portions');
  nm.addEventListener('input', function () { r.name = nm.value; });
  po.addEventListener('input', function () { var v = parseFloat(po.value); if (v >= 0.5 && v <= 50) { r.portions = v; var tt = $('#rc-tot'); if (tt) tt.innerHTML = rcTotHTML(R.recipeTotals(r), v); } });
}
function rcTotHTML(t, n) { return [['cal', 'kcal / portion', 'var(--kcal)'], ['p', 'Protein', 'var(--protein)'], ['c', 'Carbs', 'var(--carbs)'], ['f', 'Fat', 'var(--fat)']].map(function (x) { var v = t[x[0]] / n; return '<div style="--c:' + x[2] + '"><b>' + (x[0] === 'cal' ? n0(v) : n1(v)) + '</b>' + x[1] + '</div>'; }).join(''); }
function ingredientSearch() {
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">ADD INGREDIENT</div><div class="win-s">' + esc(recipeDraft && recipeDraft.name || 'Recipe') + '</div></div>' +
    '<form class="inrow" id="rc-form" autocomplete="off"><input id="rc-q" type="text" enterkeyhint="search" placeholder="Search, e.g. chicken breast, basmati rice" aria-label="Search ingredients" autofocus></form>' +
    '<div id="rc-res" class="sugg"></div><div class="ci-actions"><button class="btn ghost" data-act="rc-back">Back</button><button class="btn" data-act="rc-manual">✎ Type one in</button></div>', { cls: 'cmd-sheet' });
  var q = $('#rc-q'), box = $('#rc-res');
  function draw() {
    var v = q.value.trim(); if (!v) { box.innerHTML = '<p class="dim" style="font-size:12.5px;margin:6px 4px">Raw ingredients come from the generic foods (per 100g), so you can weigh them. Your own foods are here too.</p>'; return; }
    var local = R.searchLocal(S, v, 5).filter(function (x) { return x.source !== 'meal' && x.source !== 'recipe'; }), built = v.length >= 2 ? R.searchBuiltin(builtin(), v, 10) : [];
    box.innerHTML = (local.length ? '<div class="sh">Your foods</div>' + local.map(function (x) { return sugRow(x, 'rc-pick'); }).join('') : '') + (built.length ? '<div class="sh">UK menus & foods</div>' + built.map(function (x) { return sugRow(x, 'rc-pick'); }).join('') : '') || '<p class="dim" style="font-size:12.5px;margin:6px 4px">Nothing found. Try another word, or type it in.</p>';
  }
  q.addEventListener('input', draw); $('#rc-form').addEventListener('submit', function (e) { e.preventDefault(); }); draw();
  if (!window.RTL_GENERIC) { var gp = loadGeneric(); if (gp) gp.then(draw); }
}
function addIngredient() {
  var items = portionItems(); if (!items.length || !recipeDraft) { toast('Pick an amount first.', { bad: true }); return; }
  var f = items[0]; recipeDraft.items.push({ name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib });
  portionState = null; closeLayer(); recipeEditor(); toast('Added ' + f.name.split(' · ')[0] + '.');
}
function ingredientManual() {
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--kcal)">TYPE AN INGREDIENT</div><div class="win-s">For the whole amount in the pot</div></div>' +
    '<label class="field">Name<input class="inp" id="rm-name" maxlength="80" placeholder="e.g. Coconut milk" autofocus></label>' +
    '<label class="field" style="margin-top:8px">Amount (optional)<input class="inp" id="rm-qty" maxlength="40" placeholder="e.g. 400ml tin"></label>' +
    '<div class="grid2" style="margin-top:8px"><label class="field">Calories<input class="inp num" id="rm-cal" type="number" inputmode="numeric" min="0"></label><label class="field">Protein g<input class="inp num" id="rm-p" type="number" inputmode="decimal" min="0"></label><label class="field">Carbs g<input class="inp num" id="rm-c" type="number" inputmode="decimal" min="0"></label><label class="field">Fat g<input class="inp num" id="rm-f" type="number" inputmode="decimal" min="0"></label></div>' +
    '<div class="ci-actions"><button class="btn ghost" data-act="rc-back">Back</button><button class="btn primary ci-go" data-act="rc-man-save">Add to recipe</button></div>', { sticky: true });
}
function recipeSave() {
  var r = recipeDraft; if (!r) return;
  r.name = String(r.name || '').trim();
  if (!r.name) { toast('Give the recipe a name.', { bad: true }); var nm = $('#rc-name'); if (nm) nm.focus(); return; }
  if (!r.items.length) { toast('Add at least one ingredient.', { bad: true }); return; }
  var clean = R.normalizeRecipe({ id: r.id || 'rc-' + R.uid(), name: r.name, portions: r.portions, items: r.items, uses: r.uses, last: r.last }); if (!clean) { toast('Those numbers don’t look right.', { bad: true }); return; }
  S.recipes = (S.recipes || []).filter(function (x) { return x.id !== clean.id; }).concat([clean]);
  persist(); recipeDraft = null; closeLayer(); recipesSheet(); toast('Saved ' + clean.name + ': ' + n0(R.recipeAsItem(clean).serving.cal) + ' kcal a portion.');
}
/* ───────────── Winter Arc plan: card, today's session, review, plan sheet ───────────── */
var DAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtKg(v) { return v == null ? '—' : n1(v) + 'kg'; }
function planCardHTML(k) {
  var w = R.weekOfPlan(S, k), ps = R.planStatus(S, k), cps = R.checkpoints(S, k), next = cps.filter(function (c) { return !c.past; })[0];
  var pct = Math.round((w.week - 1) / Math.max(1, w.total - 1) * 100);
  // the 7-day average is compared with the plan for the same days, so being exactly on plan reads "On plan"
  var status = ps.state === 'none' ? '<span class="dim">Weigh in on 2+ mornings to see your 7-day average</span>' : ps.state === 'ahead' ? '<span class="good">' + n1(-ps.diff) + 'kg ahead of plan</span>' : ps.state === 'on' ? '<span class="good">On plan</span>' : '<span class="warnc">' + n1(ps.diff) + 'kg behind plan</span>';
  return '<button class="win plancard lift" style="--c:var(--train)" data-act="plan"><div class="win-h"><div class="win-t">WINTER ARC</div><div class="win-s">Week ' + w.week + ' of ' + w.total + (R.isDeload(S, k) ? ' · deload' : '') + '</div></div>' +
    '<div class="bar" style="--c:var(--train)"><i style="width:' + pct + '%"></i></div>' +
    '<div class="plan3"><div><span>Current weight</span><b style="color:var(--holo)">' + fmtKg(R.latestWeight(S, k)) + '</b></div><div><span>Plan today</span><b>' + fmtKg(ps.plan) + '</b></div><div><span>' + (next ? 'Next: ' + R.fmtDate(next.date).slice(4) : 'Finish') + '</span><b style="color:var(--kcal)">' + (next ? fmtKg(next.kg) : fmtKg(S.profile.goalKg)) + '</b></div></div>' +
    '<div class="row between" style="margin-top:8px;font-size:13px"><span id="plan-status">' + status + '</span><span class="holo">Open plan ›</span></div></button>';
}
/* ── the days before the arc ── */
function startCardHTML(k) {
  var P = S.profile, n = R.diffDays(k, P.startDate);
  return '<button class="win plancard lift" id="start-card" style="--c:var(--train)" data-act="plan"><div class="win-h"><div class="win-t">WINTER ARC</div><div class="win-s">Starts ' + startsWhen(k) + '</div></div>' +
    '<div class="bar" style="--c:var(--train)"><i style="width:0%"></i></div>' +
    '<div class="plan3"><div><span>First day</span><b style="color:var(--holo)">' + esc(R.fmtDate(P.startDate).slice(4)) + '</b></div><div><span>Start</span><b>' + fmtKg(P.startKg) + '</b></div><div><span>Goal</span><b style="color:var(--kcal)">' + fmtKg(P.goalKg) + '</b></div></div>' +
    '<div class="row between" style="margin-top:8px;font-size:13px"><span class="muted">' + n + ' day' + (n === 1 ? '' : 's') + ' to go · ends ' + esc(R.fmtDate(P.seasonEnd).slice(4)) + '</span><span class="holo">Open plan ›</span></div></button>';
}
/* ── the end of the arc ── */
function finishCardHTML(k) {
  var f = R.seasonSummary(S, k);
  return '<button class="win plancard finish lift" style="--c:var(--gold)" data-act="finish"><div class="win-h"><div class="win-t">WINTER ARC COMPLETE</div><div class="win-s">' + esc(R.fmtDate(S.profile.startDate).slice(4)) + ' – ' + esc(R.fmtDate(S.profile.seasonEnd).slice(4)) + '</div></div>' +
    '<div class="bar hit" style="--c:var(--gold)"><i style="width:100%"></i></div>' +
    '<div class="plan3"><div><span>Start</span><b>' + fmtKg(f.startKg) + '</b></div><div><span>Finish</span><b style="color:var(--holo)">' + fmtKg(f.endKg) + '</b></div><div><span>' + (f.lostKg >= 0 ? 'Lost' : 'Gained') + '</span><b style="color:var(--good)">' + n1(Math.abs(f.lostKg)) + 'kg</b></div></div>' +
    '<div class="row between" style="margin-top:8px;font-size:13px"><span class="muted">' + f.clears + ' Daily Clears · ' + f.bossesWon + ' bosses · ' + f.heroes + ' heroes</span><span class="holo">See the season ›</span></div></button>';
}
function finishSheet() {
  var k = today(), f = R.seasonSummary(S, k), row = function (a, b) { return '<div class="kv"><span>' + a + '</span><b>' + b + '</b></div>'; };
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--gold)">YOUR WINTER ARC</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<p class="muted" style="margin:-4px 0 10px;font-size:13.5px">' + esc(R.fmtDate(S.profile.startDate)) + ' to ' + esc(R.fmtDate(S.profile.seasonEnd)) + ', ' + f.days + ' days. ' + (f.reachedGoal ? 'You reached your ' + n1(f.goalKg) + 'kg goal.' : 'You finished ' + n1(Math.max(0, f.endKg - f.goalKg)) + 'kg from your ' + n1(f.goalKg) + 'kg goal.') + '</p>' +
    '<div class="qname">Body</div>' + row('Weight', n1(f.startKg) + 'kg → <span class="holo">' + n1(f.endKg) + 'kg</span>') + row(f.lostKg >= 0 ? 'Lost (7-day average)' : 'Gained', n1(Math.abs(f.lostKg)) + 'kg') + row('Body fat', n1(f.bfStart) + '% → ' + n1(f.bfNow) + '%') + row('Checkpoints hit', f.checkpointsHit + ' of ' + f.checkpoints) +
    '<div class="qname" style="margin-top:12px">Habits</div>' + row('Days logged', f.daysLogged + ' of ' + f.days) + row('Daily Clears', f.clears) + row('Best Daily Clear streak', f.bestStreak + ' days') + row('Best protein streak', f.bestProtein + ' days') + row('Calorie target hit', f.calHits + ' days') + row('Lights out on time', f.lights + ' nights') + row('Steps walked', n0(f.steps)) +
    '<div class="qname" style="margin-top:12px">Training</div>' + row('Gym days', f.gymDays) + row('Football sessions', f.football) + row('Personal records', f.prs) +
    '<div class="qname" style="margin-top:12px">The game</div>' + row('Level and rank', f.level + ' · ' + f.rank + '-Rank') + row('Total XP', n0(f.xp)) + row('Daily bosses beaten', f.bossesWon + ' of ' + f.bossesTotal) + row('Weekly bosses beaten', f.weeklyBosses) + row('Secret heroes freed', f.heroes + ' of ' + f.heroesTotal) + row('Awards', f.awards) +
    '<div class="row end" style="margin-top:14px"><button class="btn small ghost" data-act="plan">The plan you followed</button><button class="btn small" data-act="export">Export a backup</button></div>');
}
/* shown once, the first time the app is opened after the last day */
function maybeFinish() {
  var k = today(); if (!R.seasonOver(S, k) || S.player.finishSeen === S.profile.seasonEnd) return;
  if ($('.ceremony') || $('#splash') || $('#layer').innerHTML || evShowing || evQueue.length) { setTimeout(maybeFinish, 700); return; }
  var f = R.seasonSummary(S, k); S.player.finishSeen = S.profile.seasonEnd; persist(true);
  beep('level'); vib([120, 60, 120, 60, 200]); confetti(110);
  ceremony('WINTER ARC COMPLETE', (f.lostKg >= 0 ? '−' : '+') + n1(Math.abs(f.lostKg)) + 'kg', n1(f.startKg) + 'kg to ' + n1(f.endKg) + 'kg in ' + f.days + ' days.\n' + f.clears + ' Daily Clears · ' + f.bossesWon + ' bosses · ' + f.heroes + ' heroes · level ' + f.level + '.\nWell done, ' + S.profile.name + '.', 'rank', function () { finishSheet(); });
}
function planAlertsHTML(k) {
  var d = R.getDay(S, k);
  return alertList([
    function () { var hs = R.heroStatus(S, k), hc = hs.current; return hc && !hs.notStarted && hc.toGo != null && hc.toGo <= 0.6 ? '<button class="alert goldal" style="width:100%;text-align:left;color:var(--ink);font:inherit" data-act="tab" data-tab="bosses"><span>🌟</span><div class="grow">Secret hero ' + hc.n + ' is ' + n2(hc.toGo) + 'kg away: weigh in at ' + n2(hc.need) + 'kg or less to free them.</div><span class="gold">›</span></button>' : ''; },
    function () { if (!R.reviewDue(S, k)) return ''; var adv = R.planAdvice(S, k); return '<div class="alert violet"><span>🧭</span><div class="grow"><b>Fortnightly review</b><br>' + esc(adv.text) + '</div><button class="btn small tint" style="--c:var(--train)" data-act="plan">Review</button></div>'; },
    function () { return d.weight == null ? '<div class="alert cyan"><span>⚖️</span><div class="grow">Morning weigh-in: fasted, after the toilet.</div><button class="btn small tint" style="--c:var(--holo)" data-act="weigh">Log</button></div>' : ''; },
    function () { return R.isDeload(S, k) ? '<div class="alert cyan"><span>🪶</span><div>Deload week: same exercises at 60% of your usual weight. Keep the calories and steps.</div></div>' : ''; },
    function () { var owed = R.stepsOwed(S, k); return owed > 0 ? '<div class="alert"><span>👣</span><div>Yesterday was under ' + n0(S.targets.stepsMin) + ' steps, so today’s target is ' + n0(R.stepsTarget(S, k)) + ' (+' + n0(owed) + ').</div></div>' : ''; },
    function () { return R.stepsNotLogged(S, k) ? '<div class="alert"><span>👣</span><div class="grow">Yesterday’s steps were not logged, so nothing has been carried over. Add them to keep today’s target honest.</div><button class="btn small tint" style="--c:var(--steps)" data-act="steps-yday">Add</button></div>' : ''; },
    function () { var u = R.underFloorNow(S, k, R.londonTime()); return u ? '<div class="alert red" id="under-floor"><span>⛔</span><div>You’ve eaten ' + n0(u.cal) + ' kcal today, under ' + n0(u.floor) + '. Have about ' + n0(u.short) + ' kcal more before bed (a protein shake or yogurt bowl does it). Eating too little costs muscle, and the day doesn’t count as on target.</div></div>' : ''; },
    function () { var fb = R.floorBreach(S, k); return fb != null ? '<div class="alert red"><span>⛔</span><div>Yesterday you ate ' + n0(fb) + ' kcal, under ' + n0(R.dayRules(S, R.addDays(k, -1)).floor) + '. Eat to target today; going lower costs muscle.</div></div>' : ''; },
    function () { var lm = R.leanMassAlert(S, k); return lm ? '<div class="alert red"><span>📉</span><div>Lean mass is ' + n1(lm.lbm) + 'kg on your ' + R.fmtDate(lm.date) + ' scan, down from ' + n1(lm.base) + 'kg. Add 150 kcal and keep protein at ' + S.targets.protein + 'g.</div></div>' : ''; }
  ]);
}
function sessionCardHTML(k) {
  var type = R.dayType(S, k), sp = R.sessionPlan(S, k), d = R.getDay(S, k), html = '';
  if (sp) {
    var doneN = sp.list.filter(function (x) { return x.done; }).length;
    html += win('TODAY: ' + sp.name.toUpperCase(), (sp.deload ? '<div class="alert cyan" style="margin-bottom:8px"><span>🪶</span><div>Deload week: 60% weight, same exercises, stop well short of failure.</div></div>' : '') +
      sp.list.map(function (x) {
        var doneTxt = x.done ? x.done.sets.map(function (s2) { return (s2.kg ? n1(s2.kg) + '×' : '') + s2.reps; }).join(' · ') : '';
        return '<button class="exrow ' + (x.done ? 'done' : '') + '" data-act="ex-log" data-ex="' + x.key + '"><span class="exn"><b>' + esc(x.name) + '</b>' + (x.cue ? '<small>' + esc(x.cue) + '</small>' : '') + '</span><span class="ext num">' + x.sets + ' × ' + x.lo + '–' + x.hi + '<small>' + x.rir + ' left in tank</small></span>' +
          '<span class="exs ' + x.action + '">' + (x.done ? '✓ ' + esc(doneTxt) : esc(x.text)) + '</span></button>';
      }).join('') +
      '<div class="row between" style="margin-top:10px"><span class="dim" style="font-size:12px">' + doneN + '/' + sp.list.length + ' logged' + (sp.note ? ' · ' + esc(sp.note) : '') + '</span><button class="btn small ghost" data-act="ranges">Edit sets & reps</button></div>', 'violet', 'Tap an exercise to log it');
  } else if (type === 'football') {
    html += win('TODAY: FOOTBALL', '<p class="muted" style="margin:0">FootyAddicts, about 1 hour (+675 kcal burned). Eat your ' + n0(R.calTarget(S, k)) + ' kcal with a carb-heavy meal 2–3 hours before, and keep protein at ' + S.targets.protein + 'g.</p>', 'violet');
  } else {
    html += win('TODAY: REST', '<p class="muted" style="margin:0">No lifting. Steps are the job today: ' + n0(R.stepsTarget(S, k)) + '.' + (R.weekday(k) === 0 ? ' Sunday is your higher day at ' + n0(R.calTarget(S, k)) + ' kcal.' : '') + '</p>', 'violet');
  }
  var abs = R.absThisWeek(S, k), absT = S.plan.absPerWeek, absToday = d.activities.some(function (a) { return a.type === 'abs'; });
  html += win('HOME ABS & SUPPLEMENTS', '<div class="quest ' + (abs >= 2 ? 'done' : '') + '" style="--c:var(--fibre)"><div class="qicon">🧱</div><div><div class="qname">Home abs <span class="num dim">' + abs + ' / 2–' + absT + ' this week</span></div><div class="qsub">' + R.ABS_MOVES.join(' · ') + '</div></div><button class="btn small ' + (absToday ? 'done' : 'tint') + '" style="--c:var(--fibre)" data-act="abs-done"' + (absToday ? ' disabled' : '') + '>' + (absToday ? 'Done today' : 'Abs done') + '</button></div>' +
    R.SUPPS.map(function (x) { var on = !!d.supps[x.id]; return '<div class="toggle" style="--c:var(--steps)"><span>' + esc(x.name) + (x.id === 'vitd' ? ' <span class="dim" style="font-size:12px">Oct–Mar</span>' : '') + '</span><button class="sw" role="switch" aria-checked="' + on + '" data-act="supp" data-id="' + esc(x.id) + '" aria-label="' + esc(x.name) + '"></button></div>'; }).join('') +
    '<p class="dim" style="font-size:12px;margin:4px 0 0">Whey isolate is in your yogurt bowl. Caffeine before 2pm.</p>', 'mint');
  return html;
}
function logExercise(key) {
  var k = today(), sp = R.sessionPlan(S, k), x = sp && sp.list.filter(function (e) { return e.key === key; })[0]; if (!x) return;
  var sets = [];
  if (x.done) sets = x.done.sets.map(function (s2) { return { kg: s2.kg, reps: s2.reps }; });
  else for (var i = 0; i < x.sets; i++) sets.push({ kg: x.kg != null ? x.kg : NaN, reps: x.action === 'hold' && x.last && x.last.sets[i] ? x.last.sets[i].reps : (x.action === 'start' ? NaN : x.lo) });
  openConfirm([{ kind: 'exercise', _id: R.uid(), name: x.name, ex: x.key, display: x.name, sets: sets }], { source: 'manual', editing: true, text: x.text });
  if (x.done && pending) pending.replaceId = x.done.id;
}
function weighSheet() {
  var k = today(), d = R.getDay(S, k), avg = R.rollingAvg(S, k);
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t">MORNING WEIGH-IN</div><div class="win-s">' + (avg != null ? '7-day average ' + n1(avg) + 'kg' : 'Fasted, after the toilet') + '</div></div>' +
    '<label class="field">Weight in kg<input class="inp num" id="w-kg" type="number" inputmode="decimal" step="0.1" min="30" max="250" value="' + (d.weight != null ? d.weight : '') + '" placeholder="' + n1(R.latestWeight(S, k)) + '" autofocus style="font-size:22px;min-height:56px"></label>' +
    '<p class="dim" style="font-size:12px;margin:8px 2px 0">One reading means little. The plan judges your 7-day average.</p>' +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="weigh-save">Save</button></div>');
}
function rangesSheet() {
  var html = '<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">SETS & REP RANGES</div><div class="win-s">sets · from · to</div></div>';
  Object.keys(R.PROGRAM).forEach(function (wd) {
    var p = R.PROGRAM[wd]; html += '<div class="qname" style="margin:12px 0 4px">' + DAY_FULL[wd] + ' · ' + p.name + '</div>';
    p.list.forEach(function (e) { var r = R.programRange(S, e), ex = R.exerciseByKey(e[0]); html += '<div class="rgrow"><span>' + esc(ex.name) + '</span>' + ['sets', 'lo', 'hi'].map(function (f, i) { return '<input class="inp num" type="number" inputmode="numeric" min="1" max="' + (i ? 50 : 8) + '" data-rg="' + e[0] + '" data-f="' + i + '" value="' + r[f] + '" aria-label="' + esc(ex.name) + ' ' + f + '">'; }).join('') + '</div>'; });
  });
  openLayer(html + '<p class="dim" style="font-size:12px;margin:10px 2px 0">When every set reaches the top number, the app tells you to add weight.</p><div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="ranges-save">Save</button></div>');
}
function tbl(head, rows) { return '<div class="scroll-x"><table class="tbl ptbl"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr' + (r.hl ? ' class="hl"' : '') + '>' + r.c.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; }
function planSheet() {
  var k = today(), P = S.profile, T = S.targets, w = R.weekOfPlan(S, k), avg = R.rollingAvg(S, k), nowKg = avg != null ? avg : R.latestWeight(S, k), bf = R.currentBf(S, k), lbm = R.leanMass(S, k);
  var adv = R.planAdvice(S, k), due = R.reviewDue(S, k), bud = R.weeklyBudget(S, k), cps = R.checkpoints(S, k), should = R.planWeightOn(S, k), pst = R.planStatus(S, k);
  var startLean = P.startKg * (1 - P.startBf / 100);
  var html = '<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">WINTER ARC PLAN</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<p class="dim" style="font-size:12.5px;margin:-6px 0 10px">' + R.fmtDate(P.startDate).slice(4) + ' – ' + R.fmtDate(P.seasonEnd).slice(4) + ' · ' + (R.notStarted(S, k) ? 'starts ' + startsWhen(k) : 'week ' + w.week + ' of ' + w.total) + '. Fat loss while holding muscle, not a muscle-building phase.</p>';
  html += '<div class="qname">Goal</div>' + tbl(['', 'Start', 'Now', 'Target'], [
    { c: ['Weight', n1(P.startKg) + 'kg', '<b class="holo">' + n1(nowKg) + 'kg</b>', n1(P.goalKg) + '–' + n1(P.goalKg + 1) + 'kg'] },
    { c: ['Body fat', n1(P.startBf) + '%', n1(bf) + '%', (P.goalBf - 1) + '–' + P.goalBf + '%'] },
    { c: ['Fat mass', n1(P.startKg - startLean) + 'kg', n1(nowKg * bf / 100) + 'kg', '~' + n0(P.goalKg * P.goalBf / 100) + 'kg'] },
    { c: ['Lean mass', n1(startLean) + 'kg', n1(lbm) + 'kg', 'hold'] }]);
  var btns = '', nxt = R.nextReview(S, k), rdate = R.reviewDate(S, k);
  if (due) { // one change per review: the buttons are only here while the review is open
    if (adv.kcal) btns += '<button class="btn small primary" data-act="plan-apply" data-kcal="' + adv.kcal + '" data-steps="' + adv.steps + '">Apply ' + (adv.kcal > 0 ? '+' : '−') + Math.abs(adv.kcal) + ' kcal' + (adv.steps ? ' and +' + n0(adv.steps) + ' steps' : '') + '</button>';
    if (adv.code === 'slow') btns += '<button class="btn small" data-act="plan-apply" data-kcal="0" data-steps="1500">+1,500 steps instead</button>';
    btns += '<button class="btn small ghost" data-act="plan-apply" data-kcal="0" data-steps="0">' + (adv.kcal ? 'Change nothing' : 'Mark reviewed') + '</button>';
  }
  html += '<div class="item" id="review-box" style="margin-top:12px;border-color:' + (due ? 'var(--train)' : 'var(--line)') + '"><div class="row between"><b>Fortnightly review' + (due ? ' · ' + R.fmtDate(rdate).slice(4) : '') + '</b><span class="conf ' + (adv.code === 'ok' ? 'high' : adv.code === 'wait' ? '' : 'low') + '">' + (adv.rate != null ? n1(adv.rate) + 'kg / week' : 'not enough data') + '</span></div><p style="margin:6px 0 8px;font-size:13.5px">' + esc(adv.text) + '</p>' + (btns ? '<div class="row">' + btns + '</div>' : '') +
    '<p class="dim" style="font-size:11.5px;margin:8px 0 0">' + (due ? 'This review stays open until you choose. A change starts tomorrow and each review allows one. ' : (isDone(rdate) ? 'The ' + R.fmtDate(rdate).slice(4) + ' review is done. ' : '') + (nxt ? 'Next review ' + R.fmtDate(nxt) + '. ' : 'No more reviews this arc. ')) +
    'Rules: 0.6–0.9kg a week, change nothing · over 1.1kg, +150 kcal · 0.3–0.5kg, −100 kcal or +1,500 steps · under 0.3kg, −150 kcal and +1,500 steps · lifts drop two sessions running, +150 kcal. Never below ' + n0(T.floor) + ' kcal.</p></div>';
  function isDone(r) { return !!r && R.isKey(S.plan.lastReview) && S.plan.lastReview >= r; }
  html += '<div class="qname" style="margin-top:14px">Checkpoints</div>' + tbl(['Date', 'Target', 'Your 7-day avg', ''], cps.map(function (c) { return { c: [R.fmtDate(c.date).slice(4), '~' + n1(c.kg) + 'kg', c.actual != null ? n1(c.actual) + 'kg' : (c.past ? 'no weigh-ins' : 'in ' + c.daysLeft + ' days'), c.hit == null ? '' : c.hit ? '<span class="status hit">hit</span>' : '<span class="status over">missed</span>'] }; }).concat([{ hl: true, c: ['This week', (pst.planAvg != null ? n1(pst.planAvg) : n1(should)) + 'kg', avg != null ? n1(avg) + 'kg' : '—', pst.state === 'none' ? '' : pst.state === 'behind' ? '<span class="status close">+' + n1(pst.diff) + '</span>' : '<span class="status hit">' + (pst.state === 'ahead' ? 'ahead' : 'on plan') + '</span>'] }])) +
    '<p class="dim" style="font-size:12px;margin:6px 0 0">The first week or two can drop faster from glycogen and water. That’s normal.</p>';
  html += '<div class="qname" style="margin-top:14px">Weekly schedule</div>' + tbl(['Day', 'Session', 'kcal', 'Steps'], [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
    var dk = R.addDays(R.mondayOf(k), (wd + 6) % 7), t = R.dayType(S, dk), sp = R.sessionFor(S, dk);
    return { hl: dk === k, c: [DAY_FULL[wd], t === 'gym' ? 'Gym · ' + (sp ? sp.name : '') : t === 'football' ? 'Football' : 'Rest', n0(R.calTarget(S, dk)), n0(R.stepsBase(S, dk))] };
  })) + '<p class="dim" style="font-size:12px;margin:6px 0 0">Week total: eat ' + n0(bud.eat) + ', burn ' + n0(bud.burn) + '. Deficit about <b style="color:var(--good)">' + n0(bud.perDay) + ' kcal a day</b>, roughly ' + bud.kgPerWeek + 'kg of fat a week. Under ' + n0(T.stepsMin) + ' steps? Make it up the next day.</p>';
  html += '<div class="qname" style="margin-top:14px">Daily macros</div>' + tbl(['', 'Target'], [{ c: ['Protein', '<b style="color:var(--protein)">' + T.protein + 'g, non-negotiable</b>'] }, { c: ['Fat', 'under ' + T.fat + 'g'] }, { c: ['Carbs', T.carbsMin + '–' + T.carbsMax + 'g'] }, { c: ['Fibre', T.fibre + 'g'] }, { c: ['Water', T.waterMl / 1000 + 'L'] }, { c: ['Calorie floor', n0(T.floor) + ' kcal'] }]);
  html += '<div class="qname" style="margin-top:14px">Protein rules</div><ul class="plist"><li>Yogurt bowl every day: 250g fat-free Greek yogurt + 65–70g whey isolate (~377 kcal, ~72g protein).</li><li>Fill the rest with lean protein: chicken breast, white fish, lean mince, rotisserie chicken or a shake.</li><li>Keep yogurt and whey stocked. Never run out.</li><li>Fatty cuts, fried food and takeaways: once or twice a week at most.</li></ul>';
  html += '<div class="qname" style="margin-top:14px">Training</div>' + Object.keys(R.PROGRAM).map(function (wd) { var p = R.PROGRAM[wd]; return '<p style="margin:6px 0;font-size:13.5px"><b style="color:var(--train)">' + DAY_FULL[wd] + ' · ' + p.name + '</b>' + (p.note ? ' <span class="dim">(' + esc(p.note.toLowerCase()) + ')</span>' : '') + '<br><span class="muted">' + p.list.map(function (e) { var r = R.programRange(S, e); return esc(R.exerciseByKey(e[0]).name) + ' ' + r.sets + '×' + r.lo + '–' + r.hi; }).join(' · ') + '</span></p>'; }).join('') +
    '<p style="margin:6px 0;font-size:13.5px"><b style="color:var(--steps)">Fri · Football</b> <span class="muted">about 1 hour</span><br><b style="color:var(--fibre)">Home abs 2–3× a week</b> <span class="muted">' + R.ABS_MOVES.join(', ').toLowerCase() + '</span></p>' +
    '<ul class="plist"><li>Effort: compound lifts 2 reps short of failure, isolation lifts 1 short.</li><li>Progression: hit the top of the rep range on every set, then add weight.</li><li>Avoid: barbell squats, conventional deadlifts, bent-over rows, heavy leg extensions.</li><li>Deloads (60% weight, same exercises): ' + S.plan.deloads.map(function (d) { return R.fmtDate(d[0]).slice(4) + ' – ' + R.fmtDate(d[1]).slice(4); }).join(' and ') + '.</li></ul><button class="btn small ghost" data-act="ranges">Edit sets & reps</button>';
  html += '<div class="qname" style="margin-top:14px">Tracking</div><ul class="plist"><li>Weigh in every morning, fasted, after the toilet. Track the 7-day average.</li><li>InBody scan once a month. Lean mass should hold at 67–68kg.</li><li>Log food daily.</li></ul>';
  html += '<div class="qname" style="margin-top:14px">Supplements</div><p class="muted" style="margin:4px 0;font-size:13.5px">Creatine 5g daily · whey isolate · vitamin D3 2,000 IU (Oct–Mar) · caffeine before 2pm.</p>';
  html += '<div class="qname" style="margin-top:14px">Rules</div><ol class="plist">' + R.PLAN_RULES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>';
  if (S.plan.adjustments.length) html += '<div class="qname" style="margin-top:14px">Changes made</div>' + S.plan.adjustments.slice().reverse().map(function (a) { return '<div class="kv"><span>' + R.fmtDate(a.date) + (a.from ? ' <small class="dim">from ' + R.fmtDate(a.from).slice(4) + '</small>' : '') + '</span><b>' + (a.kcal ? (a.kcal > 0 ? '+' : '−') + Math.abs(a.kcal) + ' kcal' : '') + (a.kcal && a.steps ? ' · ' : '') + (a.steps ? '+' + n0(a.steps) + ' steps' : '') + (!a.kcal && !a.steps ? 'no change' : '') + '</b></div>'; }).join('');
  openLayer(html);
}
var PLAN_ACTIONS = {
  plan: function () { closeLayer(); planSheet(); },
  finish: function () { closeLayer(); finishSheet(); },
  weigh: function () { closeLayer(); weighSheet(); },
  'weigh-save': function () {
    var v = parseFloat($('#w-kg').value); var it = { kind: 'body', weight: v }, errs = R.checkItem(it); if (errs.length) { toast(errs[0], { bad: true }); return; }
    function save() { quickLog([it], 'Weighed in at ' + n1(v) + 'kg.'); }
    var j = weighJump(today(), v); closeLayer();
    if (j) confirmBox('Is ' + n1(v) + 'kg right?', jumpText(v, j) + ' A mistyped weigh-in throws off your average, awards and level.', 'Yes, save ' + n1(v) + 'kg', save); else save();
  },
  'ex-log': function (b) { logExercise(b.dataset.ex); },
  'abs-done': function (b) { quickLog([{ kind: 'activity', type: 'abs', min: 10 }], 'Home abs logged.', b); },
  supp: function (b) { var k = today(), d = S.days[k] || (S.days[k] = R.emptyDay()), id = b.dataset.id; if (d.supps[id]) delete d.supps[id]; else d.supps[id] = true; b.setAttribute('aria-checked', !!d.supps[id]); persist(); vib(15); },
  ranges: function () { closeLayer(); rangesSheet(); },
  'ranges-save': function () {
    var next = {}, bad = false;
    $$('[data-rg]').forEach(function (inp) { var a = next[inp.dataset.rg] || (next[inp.dataset.rg] = []); a[+inp.dataset.f] = parseInt(inp.value, 10); });
    Object.keys(next).forEach(function (key) { var r = next[key]; if (!(r[0] >= 1 && r[0] <= 8 && r[1] >= 1 && r[2] >= r[1] && r[2] <= 50)) bad = true; });
    if (bad) { toast('Sets must be 1–8, and the top of each range can’t be below the bottom.', { bad: true }); return; }
    S.plan.ranges = next; persist(); closeLayer(); render(); toast('Sets and rep ranges saved.');
  },
  'plan-apply': function (b) {
    var kcal = +b.dataset.kcal, steps = +b.dataset.steps, k = today();
    function go() { var before = R.clone(S.targets), bp = R.clone(S.plan); var a = R.applyAdjustment(S, kcal, steps, k); if (a.refused) { planSheet(); toast('This review has already been dealt with. The next one is ' + (R.nextReview(S, k) ? R.fmtDate(R.nextReview(S, k)) : 'not this arc') + '.'); return; } afterChange(); planSheet();
      toast(!kcal && !steps ? 'Review done. No change.' : 'Plan updated from tomorrow' + (a.floored ? ', held at your ' + n0(S.targets.floor) + ' kcal floor' : '') + '. Today and every day before it keep their targets.', { action: 'Undo', ms: 7000, onAction: function () { S.targets = before; S.plan = bp; afterChange(); toast('Change undone.'); } }); }
    if (!kcal && !steps) { go(); return; }
    confirmBox('Change the plan?', (kcal ? (kcal > 0 ? 'Add ' : 'Cut ') + Math.abs(kcal) + ' kcal on every day' : '') + (kcal && steps ? ' and ' : '') + (steps ? 'add ' + n0(steps) + ' steps to every day' : '') + ', starting tomorrow. Calories never go below ' + n0(S.targets.floor) + ', and days you have already done are not re-marked.', 'Apply', go);
  }
};

/* ───────────── daily bosses, heroes and their weapons ───────────── */
var ART = window.RTL_ART || {};
var NB = R.DUELS.length; // how many daily bosses there are
function artSrc(k) { return ART[k] || k; }
function artHTML(src, icon, cls, eager, tile) {
  // a picture shown whole ("fit") sits on a blurred, darkened copy of itself instead of black bars (the small tile copy,
  // already loaded for the grid, so it costs nothing extra)
  var bk = /\bfit\b/.test(cls || '') ? '<img class="bk" src="' + tileSrc(src) + '" alt="" aria-hidden="true" decoding="async"' + (eager ? '' : ' loading="lazy"') + ' onerror="this.remove()">' : '';
  return '<span class="art ' + (cls || '') + '" data-k="' + src + '" data-ic="' + icon + '"><img src="' + (tile ? tileSrc(src) : artSrc(src)) + '" alt="" decoding="async"' + (eager ? '' : ' loading="lazy"') + ' onerror="this.remove()">' + bk + '</span>';
}
/* the grid tiles use a copy sized for the tile (sharp on a 3x iPhone), so a tab of 80 pictures opens without decoding 80 full-size ones */
function tileSrc(k) { return ART['art/t/' + k.slice(4)] || artSrc(k); }
/* The Bosses screen holds hundreds of tiles: when nothing on them changed, the screen built last time is kept as it is
   (pictures already decoded, nothing laid out again), so the tab opens at once */
function setView(id, html) { var v = $(id); if (!v) return; if (v._html === html) return; v.innerHTML = html; v._html = html; }
window.addEventListener('online', function () { $$('#v-bosses').forEach(function (v) { v._html = null; }); });
function duelCardHTML(b, k) {
  return '<div class="win duel' + (b.lastChance ? ' last' : '') + '"><div class="win-h"><div class="win-t">' + (b.lastChance ? 'LAST CHANCE' : b.returned ? 'RETURNED · HARDER' : 'TODAY’S BOSS') + '</div><div class="win-s">' + b.no + ' / ' + NB + ' · ' + (b.lastChance ? 'gone at midnight' : 'gone tomorrow night') + '</div></div>' +
    '<div class="duel-top"><button class="duel-pic" data-act="duel-info" data-i="' + b.i + '" aria-label="' + esc(b.name) + ' details"><span class="clip">' + artHTML(b.art, b.icon, '', true) + '<i class="shine"></i></span></button><div class="grow"><div class="duel-n">' + esc(b.name) + '</div><div class="qsub">' + esc(b.anime) + '</div><div class="duel-tt">“' + esc(b.title) + '”</div></div></div>' +
    '<div class="duel-task"><b>' + esc(b.task) + (b.gymTask ? ' · at the gym' : '') + '</b><span>' + esc(b.taskText) + '</span></div>' +
    '<div class="duel-rw"><span>🏷️ Title: <b>' + esc(b.title) + '</b></span><span>' + b.icon + ' Weapon: <b>' + esc(b.weapon) + '</b></span></div>' +
    '<div class="row between" style="margin-top:10px"><span class="dim" style="font-size:11.5px">Swap anything that hurts your knee or back.</span><button class="btn primary" data-act="duel-win" data-i="' + b.i + '">I beat it</button></div></div>';
}
function bossesNotBegun(k) { var d = R.duelDay(S, 0); return !d || k < d; }
function countArriving(k) { var n = 0; for (var i = 0; i < R.DUELS.length; i++) if (R.duelDay(S, i) === k) n++; return n; }
function duelCardsHTML(k, compact) {
  var list = R.duelsToday(S, k); if (!list.length) {
    var sum = R.duelSummary(S, k);
    return compact ? '<button class="alert cyan" style="width:100%;text-align:left;color:var(--ink);font:inherit" data-act="tab" data-tab="bosses"><span>⚔️</span><div class="grow">' + (bossesNotBegun(k) ? 'The first boss arrives on ' + R.fmtDate(R.duelDay(S, 0)) + '.' : sum.upcoming ? (countArriving(k) > 1 ? 'Today’s bosses are beaten.' : 'Today’s boss is beaten.') + ' The next one arrives at midnight.' : R.seasonOver(S, k) ? 'The arc is over. ' + sum.won + ' of ' + NB + ' bosses defeated.' : 'Every boss has arrived. ' + sum.won + ' of ' + NB + ' defeated.') + '</div><span class="holo">' + sum.won + ' / ' + NB + ' ›</span></button>' : '';
  }
  var words = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six'], n = list.length, lastN = list.filter(function (b) { return b.lastChance; }).length, note = '';
  if (n > 1) note = '<div class="alert red" id="boss-count"><span>⚔️</span><div>' + (words[n] || n) + ' bosses today. ' + (lastN === n ? (k >= S.profile.seasonEnd ? 'It is the last day of the arc: every one of them is gone at midnight.' : 'All of them escape at midnight.') : lastN === 0 ? (n === 2 ? 'Both' : 'All of them') + ' arrived today and stay until tomorrow night.' : lastN === 1 ? 'The one marked Last chance escapes at midnight, so take it first.' : 'The ' + (words[lastN] || lastN).toLowerCase() + ' marked Last chance escape at midnight, so take those first.') + '</div></div>';
  return note + list.map(function (b) { return duelCardHTML(b, k); }).join('');
}
/* the boss rule in words, for the arc as it really is */
function bossRuleText() {
  var p = R.duelPlan(S), end = S.profile.seasonEnd, last = R.fmtDate(end).slice(4);
  var base = 'You get the day a boss arrives and the day after to beat its challenge. Win and you take their nickname as a title and their weapon, which you open from the boss itself. Miss both days and the boss escapes for good.';
  if (R.duelOp(S)) { var back = Object.keys(R.duelOp(S).hard || {}).length; return 'OPERATION 79.9 redrew every boss you had not beaten onto a new day up to 30 Dec, at random: one most days, two on some, none in Iceland. ' + (back ? back + ' that had escaped are back with a harder challenge. ' : '') + 'Bosses you beat stay beaten. ' + base; }
  if (!p) return 'One boss a day. ' + base;
  if (!p.doubled) return 'One boss a day for ' + NB + ' days, ' + R.fmtDate(p.start).slice(4) + ' to ' + R.fmtDate(R.duelDay(S, NB - 1)).slice(4) + '. ' + base;
  var close = ' Nothing can be fought after ' + last + ', the last day of the arc.';
  if (p.squeezed) return 'All ' + NB + ' bosses arrive in the ' + p.days + ' day' + (p.days === 1 ? '' : 's') + ' left before the arc ends, several a day. ' + base + close;
  var first = R.addDays(p.start, p.single), span = first === end ? 'on ' + last : 'from ' + R.fmtDate(first).slice(4) + ' to ' + last;
  return NB + ' bosses, ' + p.days + ' days: ' + (p.single ? 'one a day, then two a day ' + span : 'two a day, every day') + ', so the last boss arrives on the last day. ' + base + close;
}
function renderBosses() {
  var k = today(), sum = R.duelSummary(S, k), html = '';
  html += win('BOSS RUSH', '<div class="plan3"><div><span>Defeated</span><b style="color:var(--good)">' + sum.won + '</b></div><div><span>Escaped</span><b style="color:var(--bad)">' + sum.escaped + '</b></div><div><span>Still to come</span><b>' + (sum.upcoming + sum.active) + '</b></div></div>' +
    '<div class="bar" style="--c:var(--good);margin-top:10px"><i style="width:' + Math.round(sum.won / sum.total * 100) + '%"></i></div>' +
    '<p class="dim" id="boss-rule" style="font-size:12px;margin:8px 0 0">' + esc(bossRuleText()) + '</p>', 'danger', sum.won + ' / ' + NB);
  html += safe('TODAY’S BOSS', function () { return duelCardsHTML(k, false) || '<div class="alert cyan" id="boss-none"><span>✓</span><div>' + (bossesNotBegun(k) ? 'The first boss arrives on ' + R.fmtDate(R.duelDay(S, 0)) + '.' : sum.upcoming ? 'No boss waiting. The next one arrives at midnight.' : R.seasonOver(S, k) ? 'The arc is over, so no more bosses can be fought. ' + sum.won + ' of ' + NB + ' defeated.' : 'No boss waiting. All ' + NB + ' have arrived.') + '</div></div>'; });
  html += safe('SECRET HEROES', function () { return heroesHTML(k); });
  html += '<div class="sec-h"><h2>All ' + NB + ' bosses</h2><span>tap one for details</span></div><div class="roster">';
  for (var i = 0; i < R.DUELS.length; i++) {
    var b = R.duelInfo(i, S), st = R.duelStatus(S, i, k);
    html += st === 'upcoming' ? '<button class="rost upcoming" data-act="duel-info" data-i="' + i + '" aria-label="Boss ' + b.no + ', locked until ' + R.fmtDate(R.duelDay(S, i)).slice(4) + '"><span class="chains"></span><span class="rn num">' + b.no + '</span><span class="lockic lk"></span><span class="rt"><b>Locked</b><small>' + R.fmtDate(R.duelDay(S, i)).slice(4) + '</small></span></button>' :
      '<button class="rost ' + st + '" data-act="duel-info" data-i="' + i + '">' + (st === 'active' ? '<span class="clip">' : '') + artHTML(b.art, b.icon, '', false, true) + '<span class="rn num">' + b.no + '</span><span class="rb">' + ({ won: '✓', escaped: '🔒', active: '⚔️' })[st] + '</span><span class="rt"><b>' + esc(b.name) + '</b><small>' + ({ won: 'defeated', escaped: 'escaped', active: 'fight now', upcoming: R.fmtDate(R.duelDay(S, i)).slice(4) })[st] + '</small></span>' + (st === 'active' ? '</span>' : '') + '</button>';
  }
  html += '<div style="height:14px"></div>' + safe('TRIALS', function () { return trialsHTML(); });
  setView('#v-bosses', html + '</div>');
}
/* the weapon or power picture, opened from inside the boss or hero sheet (this replaces the Armoury screen) */
function dropHTML(label, name, art, icon, note) {
  return '<details class="drop"><summary><span class="dsum"><span class="dlab">' + label + '</span><b>' + esc(name) + '</b></span><span class="dcar" aria-hidden="true">▾</span></summary>' +
    '<div class="dropb"><div class="bigart">' + artHTML(art, icon, 'fit', true) + '<i class="shine"></i></div>' + (note ? '<p class="dim" style="font-size:12.5px;margin:8px 0 0">' + esc(note) + '</p>' : '') + '</div></details>';
}
/* the first day a missed boss is gone: two days after it arrived, or the day after the arc ends if that comes first */
function escapeDay(i) { var a = R.addDays(R.duelDay(S, i), 2), b = R.addDays(S.profile.seasonEnd, 1); return a < b ? a : b; }
var LOCK_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="rgba(4,8,15,.9)"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="currentColor"/></svg>';
function duelSheet(i, view) {
  var k = today(), b = R.duelInfo(i, S), st = R.duelStatus(S, i, k); if (!b) return;
  if (st === 'upcoming') { // nothing about a future boss is shown until its day
    openLayer('<div class="grab"></div><div class="win-h"><div class="win-t">BOSS ' + b.no + ' · UPCOMING</div><button class="btn small ghost" data-act="close">Close</button></div>' +
      '<div class="duel-hero locked"><span class="chains"></span><span class="lockic big">' + LOCK_SVG + '</span><div class="dh-t"><div class="duel-n">Locked in chains</div><div class="qsub">Breaks free on ' + R.fmtDate(R.duelDay(S, i)) + '</div></div></div>' +
      '<p class="dim" style="font-size:13px;margin:0">Who it is, the challenge and the rewards stay hidden until that day.</p>');
    return;
  }
  var head = '<div class="grab"></div><div class="win-h"><div class="win-t" style="color:' + (st === 'won' ? 'var(--good)' : st === 'escaped' ? 'var(--bad)' : 'var(--holo)') + '">BOSS ' + b.no + ' · ' + ({ won: 'DEFEATED', escaped: 'ESCAPED', active: 'FIGHT NOW', upcoming: 'UPCOMING' })[st] + '</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<div class="duel-hero ' + st + (view === 'w' && st === 'won' ? ' wview' : '') + '">' + (view === 'w' && st === 'won' ? artHTML(b.wart, b.icon, 'fit', true) + artHTML(b.art, b.icon, 'wp', true) : artHTML(b.art, b.icon, '', true) + (st === 'won' ? artHTML(b.wart, b.icon, 'wp fit', true) : '')) + (st === 'escaped' ? '' : '<i class="shine"></i>') + '<div class="dh-t"><div class="duel-n">' + esc(b.name) + '</div><div class="qsub">' + esc(b.anime) + '</div></div></div>';
  var body = '<div class="kv"><span>Nickname (title)</span><b>' + esc(b.title) + '</b></div><div class="kv"><span>Weapon</span><b>' + esc(b.weapon) + '</b></div><div class="kv"><span>Challenge</span><b>' + esc(b.task) + '</b></div><p class="muted" style="font-size:13px;margin:6px 0 0">' + esc(b.taskText) + '</p>';
  if (st === 'won') body += dropHTML('Weapon taken', b.weapon, b.wart, b.icon, 'Taken from ' + b.name + ' on ' + R.fmtDate(S.duels.won[i]) + '.');
  if (st === 'won') body += '<blockquote class="duel-line">' + esc(b.line) + '</blockquote><div class="kv"><span>Won on</span><b>' + R.fmtDate(S.duels.won[i]) + '</b></div><div class="row end" style="margin-top:12px"><button class="btn ' + (S.player.title === b.title ? 'done' : 'primary') + '" data-act="duel-title" data-i="' + i + '">' + (S.player.title === b.title ? 'Title in use' : 'Use “' + esc(b.title) + '” as my title') + '</button></div>';
  else if (st === 'escaped') body += '<p class="blood" style="font-size:13px;margin:10px 0 0">This boss escaped on ' + R.fmtDate(escapeDay(i)) + '. Its title and weapon stay locked.</p>';
  else if (st === 'active') body += '<div class="row end" style="margin-top:12px"><button class="btn primary" data-act="duel-win" data-i="' + i + '">I beat it</button></div>';
  else body += '<p class="dim" style="font-size:13px;margin:10px 0 0">Arrives ' + R.fmtDate(R.duelDay(S, i)) + '.</p>';
  openLayer(head + body);
}
/* a boss walks in: once per boss, the first time it is waiting for you */
function bossIntro(b, done) {
  var d = document.createElement('div'); d.className = 'ceremony bossfx in' + (b.lastChance ? ' last' : '');
  d.innerHTML = '<div class="bx-rays"></div><div class="bx-slash"></div><div class="cer-in"><div class="cer-k">' + (b.lastChance ? 'LAST CHANCE · BOSS ' : 'A BOSS APPEARS · ') + b.no + ' / ' + NB + '</div>' +
    '<div class="bx-pic">' + artHTML(b.art, b.icon, '', true) + '<i class="shine"></i></div><div class="bx-name">' + esc(b.name) + '</div><div class="bx-sub">' + esc(b.anime) + ' · “' + esc(b.title) + '”</div>' +
    '<div class="duel-task bx-task"><b>' + esc(b.task) + (b.gymTask ? ' · at the gym' : '') + '</b><span>' + esc(b.taskText) + '</span></div><div class="bx-rw">Win: the title <b>' + esc(b.title) + '</b> and <b>' + esc(b.weapon) + '</b></div>' +
    '<button class="btn primary" style="min-width:170px">Fight</button></div>';
  document.body.appendChild(d); beep('level'); vib([30, 60, 120]);
  $('button.btn', d).onclick = function () { d.classList.add('bye'); setTimeout(function () { d.remove(); done && done(); }, calm() ? 0 : 260); };
}
var introBusy = false;
function maybeBossIntro(tries) {
  if (introBusy) return; var k = today(), list = R.duelsToday(S, k).filter(function (b) { return !S.duels.seen[b.i]; }); if (!list.length) return;
  if ($('.notice') || $('.ceremony') || $('#splash') || $('#layer').innerHTML || evShowing || evQueue.length) { if ((tries || 0) < 40) setTimeout(function () { maybeBossIntro((tries || 0) + 1); }, 700); return; }
  introBusy = true; var b = list[0]; S.duels.seen[b.i] = 1; persist();
  bossIntro(b, function () { introBusy = false; setTimeout(maybeBossIntro, 250); });
}
/* the boss falls: slash, split, then the rewards rise */
function bossDefeat(w, done) {
  var d = document.createElement('div'); d.className = 'ceremony bossfx out';
  var pic = '<span class="art" data-ic="' + w.icon + '"><img src="' + artSrc(w.art) + '" alt="" onerror="this.remove()"></span>';
  d.innerHTML = '<div class="bx-flash"></div><div class="cer-in"><div class="cer-k">BOSS DEFEATED · ' + w.no + ' / ' + NB + '</div>' +
    '<div class="bx-pic cut"><div class="half a">' + pic + '</div><div class="half b">' + pic + '</div><i class="cutline"></i><div class="bx-stamp">DEFEATED</div></div>' +
    '<div class="bx-name">' + esc(w.name) + ' falls.</div>' +
    '<div class="bx-loot"><div class="bx-wp"><div class="bx-glow"></div>' + artHTML(w.wart, w.icon, 'fit', true) + '</div><div class="bx-lt"><small>Title unlocked</small><b>“' + esc(w.title) + '”</b><small>Weapon</small><b>' + esc(w.weapon) + '</b></div></div>' +
    '<blockquote class="duel-line bx-line">' + esc(w.line) + '</blockquote>' +
    '<div class="row" style="justify-content:center;flex-direction:row-reverse"><button class="btn primary" style="min-width:140px">Continue</button><button class="btn" data-eq="1">Use title</button></div></div>';
  document.body.appendChild(d);
  function close() { d.classList.add('bye'); setTimeout(function () { d.remove(); done && done(); }, calm() ? 0 : 260); }
  $('button.primary', d).onclick = close;
  $('[data-eq]', d).onclick = function () { S.player.title = w.title; persist(); render(); toast('Title equipped: ' + w.title); close(); };
  if (!calm()) { setTimeout(function () { beep('pr'); vib(40); }, 350); setTimeout(function () { beep('win'); vib([80, 40, 120]); confetti(90); }, 1150); } else { beep('win'); }
}
var DUEL_ACTIONS = {
  'duel-info': function (b) { closeLayer(); duelSheet(+b.dataset.i, b.dataset.v); },
  'duel-title': function (b) { var d = R.duelInfo(+b.dataset.i, S); if (!d || !S.duels.won[d.i]) return; S.player.title = d.title; persist(); closeLayer(); render(); toast('Title equipped: ' + d.title); },
  'duel-win': function (b) {
    var i = +b.dataset.i, k = today(), d = R.duelInfo(i, S); if (!d) return;
    confirmBox('Did you beat ' + d.name + '?', d.task + ': ' + d.taskText + '. Only claim it if you finished the whole thing.', 'Yes, I did it', function () {
      var w = R.defeatDuel(S, i, k); if (!w) { toast('That boss has already gone.', { bad: true }); render(); return; }
      S.duels.seen[i] = 1; persist(); render();
      bossDefeat(w, function () {
        toast(w.weapon + ' is yours. Open the boss to see it.', { action: 'Undo', onAction: function () { R.undoDuel(S, i); if (S.player.title === w.title) S.player.title = ''; persist(); render(); toast('Win removed.'); } });
      });
    });
  }
};

/* ───────────── secret heroes: one for every kg you lose ───────────── */
function heroesHTML(k) {
  var st = R.heroStatus(S, k), c = st.current, msg;
  if (st.notStarted) msg = 'They start breaking free on ' + R.fmtDate(S.profile.startDate) + ': one for every kilogram you lose from ' + n1(S.profile.startKg) + 'kg.';
  else if (st.unlocked >= st.total) msg = 'All 11 freed. Every kilogram, earned.';
  else if (st.over) msg = 'The arc is over. You freed ' + st.unlocked + ' of 11.';
  else msg = 'Hero ' + c.n + ' breaks free when you weigh in at <b class="gold">' + n2(c.need) + 'kg</b> or less.' + (st.lowest != null ? ' Your lowest so far is ' + n2(st.lowest) + 'kg, ' + n2(c.toGo) + 'kg to go.' : ' Weigh in to start.');
  var html = '<div class="win goldw heroes"><div class="win-h"><div class="win-t">SECRET HEROES</div><div class="win-s">' + st.unlocked + ' / 11 freed</div></div>' +
    '<p class="muted" style="margin:0 0 10px;font-size:13px">' + msg + '</p>' +
    '<div class="hpips" aria-label="The 11 kilograms">' + st.milestones.map(function (m) { var cls = m.hit ? 'hit' : c && c.n === m.n ? 'current' : 'future'; return '<i class="' + cls + '" title="' + n2(m.need) + 'kg">' + (m.hit ? '✓' : m.n) + '</i>'; }).join('') + '</div>' +
    '<div class="herogrid">' + st.slots.map(function (h) {
      return h.unlocked ? '<button class="shero won" data-act="hero-info" data-s="' + h.slot + '">' + artHTML(h.art, '🌟', '', false, true) + '<i class="shine"></i><span class="rt"><b>' + esc(h.name) + '</b><small>' + esc(h.power) + '</small></span></button>'
        : '<button class="shero locked' + (h.reachable ? '' : ' gone') + '" data-act="hero-info" data-s="' + h.slot + '" aria-label="Secret hero, locked"><span class="clip"><span class="chains gold"></span><span class="lockic gold lk"></span><span class="rt"><b>Secret hero</b><small>' + (h.reachable ? n2(h.need) + 'kg' : 'out of reach') + '</small></span></span></button>';
    }).join('') + '</div>' +
    '<p class="dim" style="font-size:11.5px;margin:10px 0 0">' + (R.heroOp(S) ? 'OPERATION 79.9: the heroes you had freed stay freed. The rest are spread evenly from 86.5kg, so the last one breaks free at 80.0kg. Only weigh-ins from 13 Nov count.' : 'One hero for every kilogram you lose from your ' + n1(S.profile.startKg) + 'kg start, in a hidden order. It counts the moment you weigh in, and a hero freed stays freed. The eleventh comes at ' + n2(S.profile.startKg - 11) + 'kg.') + '</p></div>';
  return html;
}
function n2(v) { return String(Math.round(R.num(v) * 100) / 100); } // two decimals only when they are needed: 89.65, 90.5, 88
function heroSheet(slot, view) {
  var k = today(), st = R.heroStatus(S, k), h = st.slots[slot]; if (!h) return;
  if (!h.unlocked) {
    var c = st.current;
    openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--gold)">SECRET HERO · SEALED</div><button class="btn small ghost" data-act="close">Close</button></div>' +
      '<div class="duel-hero locked goldh"><span class="chains gold"></span><span class="lockic gold big">' + LOCK_SVG + '</span><div class="dh-t"><div class="duel-n">Bound in gold chains</div><div class="qsub">' + (h.reachable ? 'Breaks free when you weigh in at ' + n2(h.need) + 'kg' : 'Out of reach: the arc is over') + '</div></div></div>' +
      '<p class="dim" style="font-size:13px;margin:0">' + (c && st.lowest != null ? 'Your lowest weigh-in so far is ' + n2(st.lowest) + 'kg. ' : '') + 'Who it is and what power they bring stays hidden until the chains break.' + '</p>');
    return;
  }
  var main = view === 'p' ? artHTML(h.part, '✨', 'fit', true) + artHTML(h.art, '🌟', 'wp', true) : artHTML(h.art, '🌟', 'fit', true) + artHTML(h.part, '✨', 'wp fit', true);
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--gold)">SECRET HERO · FREED</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<div class="duel-hero won goldh' + (view === 'p' ? ' wview' : '') + '">' + main + '<i class="shine"></i><div class="dh-t"><div class="duel-n">' + esc(h.name) + '</div><div class="qsub">' + esc(h.anime) + '</div></div></div>' +
    '<div class="kv"><span>Title</span><b>' + esc(h.title) + '</b></div><div class="kv"><span>Power</span><b>' + esc(h.power) + '</b></div><div class="kv"><span>Freed</span><b>' + R.fmtDate(h.date) + ' · ' + h.kg + 'kg down</b></div>' +
    dropHTML('Power freed', h.power, h.part, '✨', h.name + ' · freed on ' + R.fmtDate(h.date) + ' at ' + h.kg + 'kg down.') +
    '<div class="row end" style="margin-top:12px"><button class="btn ' + (S.player.title === h.title ? 'done' : 'primary') + '" data-act="hero-title" data-s="' + slot + '">' + (S.player.title === h.title ? 'Title in use' : 'Use “' + esc(h.title) + '” as my title') + '</button></div>');
}
function heroReveal(h, done) {
  var d = document.createElement('div'); d.className = 'ceremony bossfx herofx';
  d.innerHTML = '<div class="bx-rays"></div><div class="bx-flash"></div><div class="cer-in"><div class="cer-k">SECRET HERO FREED · ' + h.kg + 'KG DOWN</div>' +
    '<div class="bx-pic">' + artHTML(h.art, '🌟', '', true) + '<i class="shine"></i><span class="chains gold snap"></span></div><div class="bx-name">' + esc(h.name) + '</div><div class="bx-sub">' + esc(h.anime) + ' · “' + esc(h.title) + '”</div>' +
    '<div class="bx-loot"><div class="bx-wp"><div class="bx-glow"></div>' + artHTML(h.part, '✨', 'fit', true) + '</div><div class="bx-lt"><small>Power gained</small><b>' + esc(h.power) + '</b><small>Title unlocked</small><b>“' + esc(h.title) + '”</b></div></div>' +
    '<div class="bx-rw">You are ' + h.kg + 'kg down from where you started. That is what earned this.</div>' +
    '<div class="row" style="justify-content:center;flex-direction:row-reverse"><button class="btn primary" style="min-width:140px">Continue</button><button class="btn" data-eq="1">Use title</button></div></div>';
  document.body.appendChild(d); beep('level'); vib([60, 40, 60, 40, 160]); if (!calm()) setTimeout(function () { confetti(110); }, 500);
  function close() { d.classList.add('bye'); setTimeout(function () { d.remove(); done && done(); }, calm() ? 0 : 260); }
  $('button.primary', d).onclick = close;
  $('[data-eq]', d).onclick = function () { S.player.title = h.title; persist(); render(); toast('Title equipped: ' + h.title); close(); };
}
var heroBusy = false;
function maybeHeroReveal(tries) {
  if (heroBusy) return; var st = R.heroStatus(S, today());
  Object.keys(S.heroes.seen).forEach(function (j) { if (+j >= st.unlocked) delete S.heroes.seen[j]; }); // a weigh-in was removed: chain it again
  var list = st.slots.filter(function (h) { return h.unlocked && !S.heroes.seen[h.slot]; }); if (!list.length) return;
  if ($('.notice') || $('.ceremony') || $('#splash') || $('#layer').innerHTML || evShowing || evQueue.length) { if ((tries || 0) < 40) setTimeout(function () { maybeHeroReveal((tries || 0) + 1); }, 700); return; }
  heroBusy = true; var h = list[0]; S.heroes.seen[h.slot] = 1; persist(); render();
  heroReveal(h, function () { heroBusy = false; setTimeout(maybeHeroReveal, 250); });
}
var HERO_ACTIONS = {
  'hero-info': function (b) { closeLayer(); heroSheet(+b.dataset.s, b.dataset.v); },
  'hero-title': function (b) { var h = R.heroStatus(S, today()).slots[+b.dataset.s]; if (!h || !h.unlocked) return; S.player.title = h.title; persist(); closeLayer(); render(); toast('Title equipped: ' + h.title); }
};

/* ───────────── command orb ───────────── */
var cmdMeal = ''; // the meal a food goes in when it was added from that meal's ＋ Add on the Log tab
function openCmd(meal) {
  cmdMeal = MEAL_NAME[meal] ? meal : '';
  loadGeneric();
  var td = targetDay(), isToday = td === today();
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t">REPORT TO THE SYSTEM</div><div class="win-s">' + (isToday ? 'Today' : R.fmtDate(td)) + (cmdMeal ? ' · ' + MEAL_NAME[cmdMeal] : '') + '</div></div>' +
    (isToday ? '' : '<div class="cmd-ctx" id="cmd-ctx">Logging to ' + R.fmtDate(td) + '</div>') +
    '<form class="inrow" id="cmd-form" autocomplete="off"><input id="cmd-input" type="text" enterkeyhint="send" placeholder="Search a food, or type “drank 500ml”…" maxlength="1200" aria-label="Report to the System" autofocus value="' + esc(submitText.last || '') + '">' + (HOSTED ? '' : '<button class="scanbtn" type="button" data-act="scan-barcode" aria-label="Scan a barcode"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/></svg></button>') + '<button class="send" type="submit" aria-label="Send"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>' +
    '<div id="sugg" class="sugg"></div>' +
    '<div class="qchips">' +
      (HOSTED ? '' : '<button class="qchip" style="--c:var(--kcal)" data-act="scan-barcode">▥ Scan barcode</button>') +
      '<button class="qchip" style="--c:var(--kcal)" data-act="my-foods">★ My foods</button>' +
      '<button class="qchip" style="--c:var(--kcal)" data-act="quick-add">＋ Quick add kcal</button>' +
      '<button class="qchip" style="--c:var(--kcal)" data-act="recipes">🍲 My recipes</button>' +
      '<button class="qchip" style="--c:var(--kcal)" data-act="saved">⚡ Saved meals</button>' +
      // the one-tap buttons always log to today, so they are only offered when today is the day being filled in
      (isToday ? '<button class="qchip" style="--c:var(--water)" data-act="water" data-ml="500">💧 +500ml</button>' +
      '<button class="qchip" style="--c:var(--train)" data-act="gym-done">⚔️ Gym done</button>' +
      '<button class="qchip" style="--c:var(--steps)" data-act="football-done">⚽ Football 60′</button>' +
      '<button class="qchip" style="--c:var(--steps)" data-act="steps-sheet">👣 Steps</button>' : '') +
      '<button class="qchip" style="--c:var(--holo)" data-act="scan-add">🧪 InBody scan</button>' +
      '<button class="qchip" style="--c:var(--fibre)" data-act="copy-yday">↺ Copy ' + (isToday ? 'yesterday' : 'the day before') + '</button>' +
      '<button class="qchip" style="--c:var(--ink-2)" data-act="manual">✎ Manual entry</button>' +
    '</div><div class="examples">' + (isToday ? 'Search any food or menu item, like “kfc hot wing” or “greggs sausage roll”. Or type “lat pulldown 60kg 3x10”, “weighed 88.6, waist 96”, “8,000 steps” or “drank 750ml”.' : 'Everything you add here goes on ' + esc(R.fmtDate(td)) + '. Type it (“11,400 steps”, “drank 750ml”, “weighed 88.6”) or pick a food.') + '</div>', { cls: 'cmd-sheet' });
  $('#cmd-form').addEventListener('submit', function (e) { e.preventDefault(); var v = $('#cmd-input').value; if (!v.trim()) { $('#cmd-input').focus(); return; } submitText(v); });
  var ci = $('#cmd-input'); ci.addEventListener('input', function () { renderSuggest(ci.value); }); renderSuggest(ci.value);
}
var stepsDay = null; // which day the steps sheet is filling in (today, or yesterday when it was missed)
function stepsSheet(k) {
  var td = today(); stepsDay = k && k < td ? k : td;
  var d = R.getDay(S, stepsDay), isToday = stepsDay === td, tgt = R.stepsTarget(S, stepsDay), owed = R.stepsOwed(S, stepsDay);
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--steps)">STEPS' + (isToday ? '' : ' · ' + esc(R.fmtDate(stepsDay).toUpperCase())) + '</div><div class="win-s" id="steps-target">Target ' + n0(tgt) + '</div></div>' +
    (owed > 0 ? '<p class="dim" style="font-size:12.5px;margin:-4px 0 8px">That is ' + n0(R.stepsBase(S, stepsDay)) + ' plus ' + n0(owed) + ' carried over from the day before. A day’s target never goes over ' + n0(R.STEP_CAP) + '.</p>' : '') +
    '<label class="field">' + (isToday ? 'Today’s' : R.fmtDate(stepsDay) + '’s') + ' steps (from your phone’s Health app)<input class="inp num" id="q-steps" type="number" inputmode="numeric" min="0" max="100000" value="' + (d.steps || '') + '" autofocus></label>' +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn tint" style="--c:var(--steps)" data-act="steps-save">Save steps</button></div>');
}

/* ───────────── settings ───────────── */
/* ───────────── profile picture: pick from Photos, crop to a circle (pinch or drag, like Instagram) ───────────── */
function avatarSheet() {
  var p = R.player(S, today()), ph = S.profile.photo;
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t">PROFILE PICTURE</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<div class="av-sheet">' + avatarHTML(p, true) + '<div class="grow"><div class="pname">' + esc(S.profile.name.toUpperCase()) + '</div><div class="dim" style="font-size:13px">' + esc(p.rank) + '-Rank · Level ' + p.level + '</div></div></div>' +
    '<label class="btn primary av-pick">Choose from Photos<input type="file" accept="image/*" id="av-file" class="sr"></label>' +
    (ph ? '<button class="btn ghost" style="width:100%;margin-top:8px" data-act="avatar-remove">Remove picture</button>' : '') +
    '<p class="dim" style="font-size:12px;margin:10px 0 0">Saved with the rest of your data, so it follows you to any device. It stays until you change it.</p>');
  var f = $('#av-file'); if (f) f.addEventListener('change', function () { var file = f.files && f.files[0]; if (file) cropPhoto(file); });
}
function cropPhoto(file) {
  if (!/^image\//.test(file.type || 'image/')) { toast('That file isn’t a picture.', { bad: true }); return; }
  var url = URL.createObjectURL(file), img = new Image();
  img.onerror = function () { URL.revokeObjectURL(url); toast('That picture couldn’t be opened. Try another one.', { bad: true }); };
  img.onload = function () {
    closeLayer();
    openLayer('<div class="win-h"><div class="win-t">MOVE AND SCALE</div></div>' +
      '<div class="crop" id="crop"><img id="crop-img" alt="" draggable="false"><div class="crop-mask" aria-hidden="true"></div></div>' +
      '<input class="range" type="range" id="crop-zoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom">' +
      '<p class="dim" style="font-size:12px;margin:2px 0 10px;text-align:center">Drag to move · pinch or slide to zoom</p>' +
      '<div class="row end"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" id="crop-save">Save</button></div>', { sticky: true, cls: 'crop-sheet' });
    var box = $('#crop'), el = $('#crop-img'), zoom = $('#crop-zoom'); el.src = url;
    var W = img.naturalWidth, H = img.naturalHeight, size = 0, base = 1, z = 1, x = 0, y = 0, pts = {}, pinch = null;
    function measure() { size = box.clientWidth; base = Math.max(size / W, size / H); }
    function clampPos() { var s2 = base * z, w = W * s2, h = H * s2; x = Math.min(0, Math.max(size - w, x)); y = Math.min(0, Math.max(size - h, y)); }
    function draw() { clampPos(); var s2 = base * z; el.style.width = (W * s2) + 'px'; el.style.height = (H * s2) + 'px'; el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
    function zoomTo(nz, cx, cy) { nz = Math.max(1, Math.min(4, nz)); var s1 = base * z, s2 = base * nz; x = cx - (cx - x) * s2 / s1; y = cy - (cy - y) * s2 / s1; z = nz; zoom.value = z; draw(); }
    measure(); x = (size - W * base) / 2; y = (size - H * base) / 2; draw();
    box.addEventListener('pointerdown', function (e) { box.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; var ids = Object.keys(pts); if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: z }; } e.preventDefault(); });
    box.addEventListener('pointermove', function (e) {
      var pr = pts[e.pointerId]; if (!pr) return; var ids = Object.keys(pts), r = box.getBoundingClientRect();
      if (ids.length >= 2 && pinch) { pts[e.pointerId] = { x: e.clientX, y: e.clientY }; var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); zoomTo(pinch.z * d / Math.max(1, pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return; }
      x += e.clientX - pr.x; y += e.clientY - pr.y; pts[e.pointerId] = { x: e.clientX, y: e.clientY }; draw();
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinch = null; }
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', function (e) { e.preventDefault(); var r = box.getBoundingClientRect(); zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    zoom.addEventListener('input', function () { zoomTo(parseFloat(zoom.value), size / 2, size / 2); });
    $('#crop-save').onclick = function () {
      var out = 320, c = document.createElement('canvas'); c.width = out; c.height = out; var g = c.getContext('2d');
      var s2 = base * z, k2 = out / size; g.fillStyle = '#000'; g.fillRect(0, 0, out, out);
      g.drawImage(img, x * k2, y * k2, W * s2 * k2, H * s2 * k2);
      var data = ''; try { data = c.toDataURL('image/jpeg', 0.86); } catch (e2) { data = ''; }
      URL.revokeObjectURL(url);
      if (!R.cleanPhoto(data)) { toast('That picture couldn’t be saved. Try another one.', { bad: true }); return; }
      S.profile.photo = data; persist(); closeLayer(); render(); vib(20); toast('Profile picture saved.');
    };
  };
  img.src = url;
}
/* ───────────── theme ───────────── */
var THEME_NIGHT = { day: '#eef4fb', blossom: '#fdf1f6', matcha: '#eff8f2', lilac: '#f4f1fd', bluelock: '#020713', frost: '#04080f', crimson: '#0c0407', emerald: '#030b08', royal: '#07040f', gold: '#0a0803', sakura: '#0c050a', inferno: '#0c0603', shadow: '#060607' }, themeNow = '';
function applyTheme() {
  var t = S.settings.theme || 'frost', el = document.documentElement, key = t + (S.settings.glass === true ? '+glass' : '');
  if (key === themeNow) return; themeNow = key; // nothing changed: touch nothing (reading styles here made every tap slower)
  if (t === 'frost') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
  el.classList.toggle('glass', S.settings.glass === true);
  el.classList.toggle('light', R.LIGHT_THEMES.indexOf(t) >= 0);
  STATCOL = R.LIGHT_THEMES.indexOf(t) >= 0 ? STATCOL_LIGHT : STATCOL_DARK;
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEME_NIGHT[t] || '#04080f');
  if (window.Puzzle) window.Puzzle.setColor(getComputedStyle(el).getPropertyValue('--acc').replace(/\s/g, '') || '143,219,255');
}
function themePickerHTML() {
  function sw(t) { return '<button class="theme-sw" data-act="theme" data-theme="' + t[0] + '" role="radio" aria-checked="' + (S.settings.theme === t[0]) + '"><i class="tdot t-' + t[0] + '"></i><span>' + esc(t[1]) + '</span></button>'; }
  return '<div class="themes" role="radiogroup" aria-label="Theme">' + R.THEMES.filter(function (t) { return R.LIGHT_THEMES.indexOf(t[0]) < 0; }).map(sw).join('') +
    '<div class="themes-h">Light</div>' + R.THEMES.filter(function (t) { return R.LIGHT_THEMES.indexOf(t[0]) >= 0; }).map(sw).join('') + '</div>';
}
function settingsSheet() {
  var T = S.targets, P = S.profile, at = ''; try { at = localStorage.getItem(CLOUD_AT_KEY) || ''; } catch (e) {}
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], k = today();
  function nf(path, val, label, step) { return '<label class="field">' + label + '<input class="inp num" type="number" inputmode="decimal" step="' + (step || '1') + '" data-set="' + path + '" value="' + esc(val) + '"></label>'; }
  var html = '<div class="grab"></div><div class="win-h"><div class="win-t">SETTINGS</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    (HOSTED ? '<div class="qname" style="margin:4px 0 8px">Where your data lives</div><p class="muted" id="hosted-note" style="margin:0 0 6px;font-size:13.5px">This app runs inside Claude. Everything you log is kept in your Claude account, private to you, and follows you to any device where you open it. Food logging and photo reading use Claude on your own plan, so the first time it asks you to allow it. There is nothing to connect.</p>' +
    '<div class="qname" style="margin:14px 0 8px">Saving</div>' :
    '<div class="qname" style="margin:4px 0 8px">Connection</div><label class="field">System URL (your Cloudflare Worker address)<input class="inp" id="c-url" type="url" inputmode="url" placeholder="https://winter-arc.you.workers.dev" value="' + esc(conn.url) + '"></label>' +
    '<label class="field" style="margin-top:8px">App key<input class="inp" id="c-key" type="password" autocomplete="off" placeholder="Your APP_KEY" value="' + esc(conn.key) + '"></label>' +
    '<div class="row" style="margin-top:8px"><button class="btn" data-act="conn-save">Save</button><button class="btn ghost" data-act="conn-test">Test connection</button></div><div id="conn-res" class="qsub" style="margin-top:6px"></div>' +
    '<div class="qname" style="margin:18px 0 8px">Cloud sync</div><div class="toggle"><span class="muted">Sync every change automatically</span><button class="sw" role="switch" aria-checked="' + S.settings.cloud + '" data-act="toggle" data-key="cloud" aria-label="Automatic cloud backup"></button></div>') +
    '<p class="dim" style="font-size:12px;margin:2px 0 8px">' + esc(syncInfo().text) + '</p><div class="row"><button class="btn small" data-act="cloud-push">Sync now</button><button class="btn small ghost" data-act="restore-sheet">Restore an earlier version</button></div>' +
    '<div class="qname" style="margin:18px 0 8px">Look</div><div class="av-row">' + avatarHTML(R.player(S, k)) + '<div class="grow"><button class="btn small" data-act="avatar">' + (S.profile.photo ? 'Change profile picture' : 'Add profile picture') + '</button></div></div>' +
    '<div class="dim" style="font-size:12px;margin:12px 0 6px">Theme</div>' + themePickerHTML() +
    '<div class="toggle" style="margin-top:12px"><span class="muted">Glass cards<small class="dim" style="display:block;font-size:12px">Extra see-through cards over a brighter background.</small></span><button class="sw" role="switch" aria-checked="' + (S.settings.glass === true) + '" data-act="toggle" data-key="glass" aria-label="Glass cards"></button></div>' +
    '<div class="qname" style="margin:18px 0 8px">Profile & goal</div><div class="grid3"><label class="field">Name<input class="inp" data-set="profile.name" data-text="1" value="' + esc(P.name) + '"></label>' + nf('profile.startKg', P.startKg, 'Start kg', '0.1') + nf('profile.goalKg', P.goalKg, 'Goal kg', '0.1') + nf('profile.startBf', P.startBf, 'Start BF %', '0.1') + nf('profile.goalBf', P.goalBf, 'Goal BF %', '0.1') + nf('profile.heightCm', P.heightCm, 'Height cm') + '</div>' +
    '<div class="qname" style="margin:18px 0 8px">InBody & Apple Health</div><div class="row"><button class="btn small tint" style="--c:var(--train)" data-act="scan-add">Add InBody scan</button>' + (HOSTED ? '' : '<button class="btn small" data-act="shortcut-guide">Set up iPhone auto-sync</button><button class="btn small ghost" data-act="inbox-check">Check for synced data</button>') + '</div>' +
    '<div class="qname" style="margin:18px 0 8px">Calories and steps by day</div><div class="daygrid"><span></span><span class="dim">kcal</span><span class="dim">steps</span>' + [1, 2, 3, 4, 5, 6, 0].map(function (wd) { return '<span>' + dayNames[wd] + '</span><input class="inp num" type="number" inputmode="numeric" step="50" data-set="targets.calDay.' + wd + '" value="' + (T.calDay[wd] || T.cal[S.week.pattern[wd] === 'alt' ? 'rest' : S.week.pattern[wd]]) + '" aria-label="' + dayNames[wd] + ' calories"><input class="inp num" type="number" inputmode="numeric" step="500" data-set="targets.stepsDay.' + wd + '" value="' + (T.stepsDay[wd] || T.steps) + '" aria-label="' + dayNames[wd] + ' steps">'; }).join('') + '</div>' +
    '<div class="qname" style="margin:18px 0 8px">Daily targets</div><div class="grid3">' + nf('targets.floor', T.floor, 'kcal floor (min ' + n0(R.FLOOR_MIN) + ')') + nf('targets.protein', T.protein, 'Protein g') + nf('targets.fat', T.fat, 'Fat g') + nf('targets.fibre', T.fibre, 'Fibre g') + nf('targets.carbsMin', T.carbsMin, 'Carbs min') + nf('targets.carbsMax', T.carbsMax, 'Carbs max') + nf('targets.waterMl', T.waterMl, 'Water ml', '50') + nf('targets.stepsMin', T.stepsMin, 'Steps minimum', '500') + nf('targets.calTol', T.calTol, 'kcal ± range') + nf('targets.fibreQuest', T.fibreQuest, 'Fibre quest g') + '</div>' +
    '<div class="qname" style="margin:18px 0 8px">Burn (TDEE rule)</div><div class="grid2">' + nf('tdee.base', S.tdee.base, 'Baseline kcal') + nf('tdee.perKSteps', S.tdee.perKSteps, 'kcal / 1,000 steps') + nf('tdee.gym', S.tdee.gym, 'kcal / gym session') + nf('tdee.footballPerHour', S.tdee.footballPerHour, 'kcal / football hour') + '</div>' +
    '<div class="qname" style="margin:18px 0 8px">Weekly pattern</div><div class="grid3">' + [1, 2, 3, 4, 5, 6, 0].map(function (i) { var v = S.week.pattern[i]; return '<label class="field">' + dayNames[i] + '<select class="inp" data-week="' + i + '">' + ['gym', 'football', 'rest'].concat(i === 3 ? ['alt'] : []).map(function (t) { return '<option value="' + t + '"' + (v === t ? ' selected' : '') + '>' + ({ gym: 'Gym', football: 'Football', rest: 'Rest', alt: 'Alternate' })[t] + '</option>'; }).join('') + '</select></label>'; }).join('') + '</div>' +
    '<label class="field" style="margin-top:8px">A men’s midweek Wednesday (alternate weeks are gym)<input class="inp" type="date" id="mid-date" value="' + esc(S.week.midweekWed) + '"></label>' +
    '<label class="field" style="margin-top:8px">Today is a…<select class="inp" id="today-type"><option value="">Pattern (' + R.dayType(Object.assign({}, S, { overrides: {} }), k) + ')</option>' + ['gym', 'football', 'rest'].map(function (t) { return '<option value="' + t + '"' + (S.overrides[k] === t ? ' selected' : '') + '>' + t[0].toUpperCase() + t.slice(1) + ' day</option>'; }).join('') + '</select></label>' +
    '<div class="qname" style="margin:18px 0 8px">Feel</div><div class="toggle"><span class="muted">Sound effects</span><button class="sw" role="switch" aria-checked="' + S.settings.sound + '" data-act="toggle" data-key="sound" aria-label="Sound effects"></button></div>' +
    '<div class="toggle"><span class="muted">Reduce motion</span><button class="sw" role="switch" aria-checked="' + (S.settings.motion === 'reduced') + '" data-act="motion" aria-label="Reduce motion"></button></div>' +
    '<div class="toggle"><span class="muted">Puzzle pieces</span><button class="sw" role="switch" aria-checked="' + (S.settings.snow !== false) + '" data-act="toggle" data-key="snow" aria-label="Puzzle pieces"></button></div>' +
    (HOSTED ? '' : remindHTML()) +
    '<div class="toggle"><span class="muted">Intro on open</span><button class="sw" role="switch" aria-checked="' + S.settings.splash + '" data-act="toggle" data-key="splash" aria-label="Intro on open"></button></div>' +
    '<div class="qname" style="margin:18px 0 8px">Your data</div><div class="row"><button class="btn small" data-act="shop">Reward shop</button><button class="btn small" data-act="export">Export backup</button><label class="btn small ghost">Import backup<input type="file" accept="application/json,.json" id="imp" class="sr"></label></div>' +
    '<div class="row" style="margin-top:8px"><button class="btn small ghost" data-act="diag">Diagnostics</button><button class="btn small danger" data-act="reset">Reset everything</button></div>' +
    '<div class="qname" style="margin:18px 0 8px">App version</div><div class="row"><button class="btn small" data-act="app-update">Update the app</button><span class="dim" style="font-size:11.5px;align-self:center">Gets the newest version and reloads</span></div>' +
    '<p class="dim" id="app-ver" style="font-size:11px;margin-top:16px">Ascend V24 · data v' + S.version + ' · stored on this device' + (connected() ? ' + your cloud copy' : '') + '.</p>';
  openLayer(html);
  $$('[data-set]').forEach(function (inp) { inp.addEventListener('change', function () { setPath(inp.dataset.set, inp.dataset.text ? inp.value.trim().slice(0, 30) || 'Pavi' : inp.value, !!inp.dataset.text, inp); }); });
  $$('[data-week]').forEach(function (sel) { sel.addEventListener('change', function () { R.freezeDays(S, today()); S.week.pattern[+sel.dataset.week] = sel.value; persist(); render(); toast('Weekly pattern updated from today.'); }); });
  $('#mid-date').addEventListener('change', function (e) { if (R.isKey(e.target.value) && R.weekday(e.target.value) === 3) { R.freezeDays(S, today()); S.week.midweekWed = e.target.value; persist(); render(); toast('Midweek schedule updated.'); } else { toast('Pick a Wednesday.', { bad: true }); e.target.value = S.week.midweekWed; } });
  $('#today-type').addEventListener('change', function (e) {
    // choosing the type the pattern already gives is not a change (Sunday stays 1,900)
    if (e.target.value && e.target.value !== R.patternType(S, k)) S.overrides[k] = e.target.value; else delete S.overrides[k];
    if (S.days[k] && S.days[k].tg) { var g = R.snapshotTargets(S, k); S.days[k].tg.t = g.t; }
    afterChange(); toast('Today is a ' + R.dayType(S, k) + ' day: ' + n0(R.calTarget(S, k)) + ' kcal.');
  });
  $('#imp').addEventListener('change', importFile);
}
var SET_LIMITS = { 'targets.protein': [50, 400], 'targets.fat': [20, 300], 'targets.fibre': [5, 100], 'targets.fibreQuest': [5, 100], 'targets.carbsMin': [0, 800], 'targets.carbsMax': [20, 800], 'targets.waterMl': [500, 10000], 'tdee.base': [1000, 5000], 'tdee.perKSteps': [0, 200], 'tdee.gym': [0, 2000], 'tdee.footballPerHour': [0, 2500] };
function setPath(path, val, isText, inp) {
  var parts = path.split('.'), o = S; for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  if (parts[0] === 'targets') R.freezeDays(S, today()); // finished days keep the targets they were judged against
  if (isText) { o[parts[parts.length - 1]] = val; }
  else {
    var v = parseFloat(val);
    var bad0 = function (x) { return !isFinite(x) || x < 0 || (path.indexOf('Kg') > 0 && (x < 30 || x > 250)) || (parts[0] === 'tdee' && x > 5000); };
    var bad = bad0(v) || (path.indexOf('Kg') > 0 && (v < 30 || v > 250)) || (path.indexOf('Bf') > 0 && (v < 3 || v > 60)) || (path === 'profile.heightCm' && (v < 120 || v > 230)) || (path.indexOf('targets.calDay') === 0 && (v < S.targets.floor || v > 5000)) || (path === 'targets.floor' && (v < R.FLOOR_MIN || v > 2500)) || (path.indexOf('targets.steps') === 0 && (v < 1000 || v > R.STEP_CAP)) || (path === 'targets.calTol' && (v < 10 || v > 400));
    var lim = SET_LIMITS[path]; // every other number has a sensible range too
    if (!bad && lim && (v < lim[0] || v > lim[1])) { toast('Enter a value from ' + n0(lim[0]) + ' to ' + n0(lim[1]) + '.', { bad: true, ms: 4500 }); inp.value = o[parts[parts.length - 1]]; return; }
    if (!bad && ((path === 'targets.carbsMin' && v > S.targets.carbsMax) || (path === 'targets.carbsMax' && v < S.targets.carbsMin))) { toast('Carbs minimum can’t be above the maximum.', { bad: true, ms: 4500 }); inp.value = o[parts[parts.length - 1]]; return; }
    var cur = o[parts[parts.length - 1]], reworks = !bad0(v) && v !== cur && R.loggedDays(S) > 0 && (path === 'profile.startKg' || parts[0] === 'tdee') && !setPath.ok;
    if (reworks) { askRework(path, v, cur, inp); return; }
    if (bad) { toast(path === 'targets.floor' ? 'The calorie floor can’t go below ' + n0(R.FLOOR_MIN) + ' (or above 2,500).' : path.indexOf('targets.calDay') === 0 ? 'A day’s calories can’t go below your ' + n0(S.targets.floor) + ' floor.' : path.indexOf('targets.steps') === 0 ? 'Steps must be 1,000–' + n0(R.STEP_CAP) + '.' : 'That value isn’t valid.', { bad: true, ms: 4500 }); inp.value = o[parts[parts.length - 1]]; return; }
    o[parts[parts.length - 1]] = v;
    if (path === 'targets.floor') { S.targets.calDay = S.targets.calDay.map(function (c) { return c > 0 ? Math.max(c, v) : c; }); ['gym', 'football', 'rest'].forEach(function (t) { S.targets.cal[t] = Math.max(S.targets.cal[t], v); }); } // raising the floor lifts any day below it
  }
  afterChange(); toast('Saved.');
}
/* Start weight and the burn rule reach back over days already logged, so they are only changed on purpose */
function askRework(path, v, cur, inp) {
  if (askRework.busy) return; askRework.busy = true;
  // the question replaces the Settings sheet, so it opens once the field's own event has finished (a field must never be removed from inside its own change event)
  setTimeout(function () { askRework.busy = false; askReworkNow(path, v, cur, inp); }, 0);
}
function askReworkNow(path, v, cur, inp) {
  var startKg = path === 'profile.startKg';
  openLayer(win(startKg ? 'CHANGE YOUR START WEIGHT?' : 'CHANGE HOW BURN IS WORKED OUT?', '<p class="muted" style="margin:0 0 14px">' +
    (startKg ? 'From ' + n1(cur) + 'kg to ' + n1(v) + 'kg. Kilograms lost, the kg milestones, the plan line and the first hero bar are all measured from your start weight, so they are worked out again for every day so far. Only do this to correct a wrong start weight.'
      : 'From ' + n0(cur) + ' to ' + n0(v) + '. This changes the burn and the deficit shown for every day, including days you have already logged. Awards you have already earned are kept.') +
    '</p><div class="row end"><button class="btn ghost" id="rw-no">Keep ' + (startKg ? n1(cur) + 'kg' : n0(cur)) + '</button><button class="btn primary" id="rw-yes">Change it</button></div>', 'violet'), { center: true, sticky: true });
  $('#rw-no').onclick = function () { closeLayer(); settingsSheet(); };
  $('#rw-yes').onclick = function () {
    closeLayer(); setPath.ok = true; try { setPath(path, String(v), false, inp); } finally { setPath.ok = false; }
    if (startKg) { var rc = R.recalcProgress(S, today()); if (S.player.title && R.titles(S, today()).indexOf(S.player.title) < 0) S.player.title = ''; persist(); render(); if (rc.removed.length) toast(rc.removed.length + ' award' + (rc.removed.length === 1 ? '' : 's') + ' that the old start weight had earned ' + (rc.removed.length === 1 ? 'was' : 'were') + ' taken back.', { ms: 6000 }); }
    settingsSheet();
  };
}
function testConnection() {
  var out = $('#conn-res'); if (!out) return;
  conn.url = $('#c-url').value.trim(); conn.key = $('#c-key').value.trim(); saveConn();
  if (!conn.url) { out.innerHTML = '<span class="blood">Add the System URL first.</span>'; return; }
  out.textContent = 'Testing…';
  fetchT(apiBase() + '/health', {}, 10000).then(function (r) { return r.json(); }).then(function (h) {
    var parts = ['System reachable', h.auth ? 'App key set' : '⚠ APP_KEY missing', h.kv ? 'Cloud backup ready' : 'Cloud backup not set up (optional)',
      h.fatsecret ? 'FatSecret food search set up' : h.version >= 5 ? '⚠ FatSecret not set up: add FATSECRET_ID and FATSECRET_SECRET' : '', h.ai ? 'InBody photo reading ready' : 'InBody photo reading off (optional: ANTHROPIC_API_KEY)'].filter(Boolean);
    if (!(h.version >= 7)) parts.push('⚠ This Worker is an older version: paste the new worker.js into it (it adds ' + (h.version >= 6 ? 'the FatSecret address check' : h.version >= 5 ? 'iPhone reminders' : 'FatSecret food search and iPhone reminders') + ')');
    else parts.push(h.push ? 'Reminders ready (add the Cron Trigger so they run on time)' : '⚠ Reminders need the SYNC KV binding');
    return fetchT(apiBase() + '/sync?meta=1', { headers: { 'X-App-Key': conn.key } }, 10000).then(function (r) {
      parts.push(r.status === 401 ? '⚠ App key doesn’t match the one on your Cloudflare Worker' : r.status === 429 ? '⚠ Locked for 15 minutes after too many wrong keys' : 'App key accepted');
      if (r.status !== 401 && r.status !== 429) cloudState = '';
      // VF: is FatSecret really answering? If not, the address to approve in FatSecret → IP Restrictions
      var chk = h.fatsecret && h.version >= 7 && r.status !== 401 && r.status !== 429 ? fetchT(apiBase() + '/food/check', { headers: { 'X-App-Key': conn.key } }, 15000).then(function (x) { return x.json(); }).catch(function () { return null; }) : Promise.resolve(null);
      return chk.then(function (c) {
        if (c && c.ok) {
          if (c.fatsecret === 'ok') parts.push('FatSecret answering');
          else parts.push('⚠ ' + c.fatsecret + (c.ip ? ' This Worker’s internet address right now: ' + c.ip + ' (add it in FatSecret → IP Restrictions; it can take up to 24 hours).' : ''));
        }
        out.innerHTML = parts.map(function (x) { return '<div class="' + (x.charAt(0) === '⚠' ? 'warnc' : 'holo') + '">' + esc(x) + '</div>'; }).join('');
        render();
      });
    });
  }).catch(function () { out.innerHTML = '<span class="blood">Couldn’t reach the System. Check the URL (it should start with https://) and that your Cloudflare Worker is deployed.</span>'; });
}
function exportFile() {
  if (HOSTED) { window.WA_save('winter-arc-backup-' + today() + '.json', R.exportState(S)).then(function () { toast('Backup saved.'); }, function (e) { toast(e && e.code === 'unavailable' ? 'Saving a file isn’t possible in this view. Your data is still kept in your Claude account.' : 'Backup not saved.', { bad: true, ms: 6000 }); }); return; }
  var blob = new Blob([R.exportState(S)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'winter-arc-backup-' + today() + '.json'; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Backup exported.');
}
function importFile(e) {
  var f = e.target.files && e.target.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    var next; try { next = R.importState(String(rd.result)); } catch (err) { toast(/impossible date/.test(String(err && err.message)) ? err.message + '.' : 'That file isn’t a Winter Arc backup.', { bad: true, ms: 5000 }); return; }
    var sum = R.stateSummary(next);
    confirmBox('Import backup?', 'This replaces everything on this device' + (syncOn() ? ' AND your cloud copy' : '') + ' with the backup (' + sumLine(sum) + '). What you have now is saved first under Settings → Restore an earlier version.', 'Import', function () { restoreVersion(next, 'a backup file'); toast('Backup imported.'); }, true);
  };
  rd.readAsText(f);
}
/* Settings → Restore an earlier version: copies kept on this device and in the cloud */
var cloudVersions = [];
function verRow(icon, title, sub, act, attr) { return '<div class="quest verrow"><div class="qicon">' + icon + '</div><div><div class="qname">' + esc(title) + '</div><div class="qsub">' + esc(sub) + '</div></div><button class="btn small" data-act="' + act + '" ' + attr + '>Restore</button></div>'; }
function restoreSheet() {
  var loc = backups(), now = R.stateSummary(S);
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t">RESTORE AN EARLIER VERSION</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<p class="muted" style="margin:0 0 10px;font-size:13.5px">Restoring swaps what is on this device' + (syncOn() ? ', and your cloud copy,' : '') + ' for the version you pick. What you have now (' + esc(sumLine(now)) + ') is saved here first, so you can always come back to it.</p>' +
    '<div class="qname" style="margin:10px 0 4px">On this device</div>' + (loc.length ? loc.map(function (b, i) { return verRow('📱', fmtWhen(b.at), sumLine(b) + (b.why ? ' · ' + b.why : ''), 'restore-local', 'data-i="' + i + '"'); }).join('') : '<p class="dim" style="font-size:12.5px;margin:0">Nothing yet. The last 3 copies that get replaced on this device are kept here.</p>') +
    '<div class="qname" style="margin:14px 0 4px">In the cloud</div><div id="ver-cloud">' + (connected() ? '<p class="dim" style="font-size:12.5px;margin:0">Looking<span class="dots"></span></p>' : '<p class="dim" style="font-size:12.5px;margin:0">Connect the System in Settings to see the versions kept in the cloud.</p>') + '</div>' +
    '<p class="dim" style="font-size:12px;margin:12px 0 0">The cloud keeps the last copy of each day for 30 days, the 5 most recent earlier versions, and any copy that was deliberately replaced.</p>');
  if (!connected()) return;
  Promise.all([getJSON('/sync?meta=1', 12000), getJSON('/sync/versions', 12000)]).then(function (r) {
    var box = $('#ver-cloud'); if (!box) return;
    if (!r[0].r.ok || !r[0].j.ok) { box.innerHTML = '<p class="blood" style="font-size:12.5px;margin:0">' + esc(r[0].j.error || 'Couldn’t read the cloud copy.') + '</p>'; return; }
    var m = r[0].j, html = '';
    if (m.has || m.data) html += verRow('☁️', 'Current cloud copy · ' + fmtWhen(m.savedAt), m.days != null ? sumLine({ days: m.days, kg: m.kg }) : 'details not recorded', 'restore-cloud', 'data-key="current"');
    cloudVersions = r[1].r.ok && r[1].j.ok && Array.isArray(r[1].j.versions) ? r[1].j.versions : [];
    html += cloudVersions.map(function (v, i) { return verRow(v.kind === 'replaced' ? '♻️' : v.kind === 'daily' ? '📅' : '🕘', ({ replaced: 'Replaced copy', daily: 'End of day', recent: 'Earlier version' })[v.kind] + ' · ' + fmtWhen(v.savedAt), v.days != null ? sumLine({ days: v.days, kg: v.kg }) : 'details not recorded', 'restore-cloud', 'data-i="' + i + '"'); }).join('');
    if (!r[1].r.ok) html += '<p class="dim" style="font-size:12.5px;margin:6px 0 0">Earlier cloud versions need the new worker.js.</p>';
    box.innerHTML = html || '<p class="dim" style="font-size:12.5px;margin:0">No cloud copy yet.</p>';
  }).catch(function () { var box = $('#ver-cloud'); if (box) box.innerHTML = '<p class="blood" style="font-size:12.5px;margin:0">Couldn’t reach the System.</p>'; });
}
function askRestore(next, label) {
  var sum = R.stateSummary(next);
  confirmBox('Restore this version?', label + ' holds ' + sumLine(sum) + '. This device' + (syncOn() ? ' and your cloud copy' : '') + ' will be swapped for it. What you have now is saved first, so you can undo this from the same screen.', 'Restore', function () { restoreVersion(next, label.charAt(0).toLowerCase() + label.slice(1)); toast('Restored. The version you had is under Restore an earlier version.', { ms: 6000 }); }, true);
}
var RESTORE_ACTIONS = {
  'restore-sheet': function () { closeLayer(); restoreSheet(); },
  'restore-local': function (b) { var x = backups()[+b.dataset.i]; if (!x) return; var next; try { next = R.migrate(x.state); } catch (e) { toast('That copy can’t be read.', { bad: true }); return; } askRestore(next, 'The copy from ' + fmtWhen(x.at)); },
  'restore-cloud': function (b) {
    var cur = b.dataset.key === 'current', v = cur ? null : cloudVersions[+b.dataset.i]; if (!cur && !v) return;
    getJSON(cur ? '/sync' : '/sync/version?key=' + encodeURIComponent(v.key), 20000).then(function (x) {
      if (!x.r.ok || !x.j.ok || !x.j.data) { toast((x.j && x.j.error) || 'That version couldn’t be loaded.', { bad: true }); return; }
      var next; try { next = R.migrate(x.j.data); } catch (e) { toast('That version can’t be read.', { bad: true }); return; }
      askRestore(next, cur ? 'The current cloud copy' : 'The cloud version from ' + fmtWhen(v.savedAt));
    }).catch(function () { toast('Couldn’t reach the System.', { bad: true }); });
  }
};
function resetFlow() {
  var cloudOpt = connected() ? '<div class="toggle" style="--c:var(--bad);margin-top:10px"><span class="muted" style="font-size:13px">Also wipe my cloud copy</span><button class="sw" role="switch" aria-checked="false" id="reset-cloud" aria-label="Also wipe my cloud copy"></button></div><p class="dim" style="font-size:12px;margin:2px 0 0">Leave this off and your cloud copy is not touched: switching sync back on later loads it onto this device again.</p>' : '';
  openLayer(win('RESET EVERYTHING', '<p class="muted" style="margin:0 0 10px">This deletes every log, achievement and setting on this device and switches cloud sync off. One copy of what you have now is kept under Settings → Restore an earlier version. Type RESET to confirm.</p><input class="inp" id="reset-in" autocomplete="off" autofocus>' + cloudOpt + '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn danger" id="reset-go" disabled>Reset</button></div>', 'danger'), { center: true });
  var sw = $('#reset-cloud'); if (sw) sw.onclick = function () { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); };
  $('#reset-in').oninput = function (e) { $('#reset-go').disabled = e.target.value.trim() !== 'RESET'; };
  $('#reset-go').onclick = function () {
    if ($('#reset-in').value.trim() !== 'RESET') return;
    var wipe = !!(sw && sw.getAttribute('aria-checked') === 'true'), old = cloudBase();
    closeLayer();
    // anything still on its way to the cloud was sent by the old data: from here on its result is ignored
    syncGen++; pushing = false; syncBusy = false; clearTimeout(cloudTimer); cloudState = '';
    backupLocal('Before Reset everything');
    var fresh = R.migrate(null); fresh.settings.cloud = false; loadState(fresh); persist(true); render();
    lsSet(CLOUD_AT_KEY, null); lsSet(PUSH_KEY, null); setDirty(false);
    if (!wipe) { toast('Everything on this device was reset. Cloud sync is off and your cloud copy is exactly as it was.', { ms: 7000 }); return; }
    fetchT(apiBase() + '/sync?v=2&force=1&id=u' + R.uid() + '&days=0&changed=0' + (old ? '&base=' + encodeURIComponent(old) : ''), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-App-Key': conn.key }, body: JSON.stringify(S) }, 15000)
      .then(function (r) { toast(r.ok ? 'This device and your cloud copy were both reset. The System keeps the replaced cloud copy for 30 days.' : 'This device was reset, but the cloud copy could not be wiped. It is unchanged.', { bad: !r.ok, ms: 8000 }); })
      .catch(function () { toast('This device was reset, but the cloud couldn’t be reached. Your cloud copy is unchanged.', { bad: true, ms: 8000 }); });
  };
}
function runDiagnostics() {
  if (!window.RTLTests) { var ts = document.getElementById('tests-src'); if (ts) { try { (new Function(ts.textContent))(); } catch (e) { reportErr(e, 'self-tests'); } } }
  var res = window.RTLTests ? window.RTLTests.runTests(R) : [];
  // live checks against this device's real storage
  var live = [];
  function chk(name, fn) { try { fn(); live.push({ name: name, pass: true }); } catch (e) { live.push({ name: name, pass: false, error: String(e.message || e) }); } }
  chk('This device’s storage survives a reload', function () {
    if (storageBlocked) throw new Error('this window cannot store anything'); var key = 'rtl_diag_' + Date.now(), st = R.createStore(localStorage, key), s = R.normalize(JSON.parse(JSON.stringify(S)));
    if (!st.save(s)) throw new Error('could not write');
    var back = R.createStore(localStorage, key).load(); localStorage.removeItem(key);
    if (back.status !== 'ok' || JSON.stringify(back.state) !== JSON.stringify(s)) throw new Error('reloaded data differs');
  });
  function canon(v) { return Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce(function (o, k2) { o[k2] = canon(v[k2]); return o; }, {}) : v; } // the same data, whatever order it was written in
  chk('Your current data is valid', function () { var n = R.normalize(JSON.parse(JSON.stringify(S))); if (JSON.stringify(canon(n)) !== JSON.stringify(canon(JSON.parse(JSON.stringify(S))))) throw new Error('data needed repair (it has been repaired on load)'); });
  chk('Today’s character is here, with their picture', function () { var a = auraNow(), art = window.RTL_ART || {}; if (!art[a.art]) throw new Error('no picture for ' + a.name); if (!window.Aura) throw new Error('the aura drawing is missing'); });
  chk('All 85 characters have a picture and an aura colour', function () { var art = window.RTL_ART || {}, miss = R.AURA.map(function (_, i) { return R.auraInfo(i); }).filter(function (a) { return !art[a.art] || !/^#[0-9A-F]{6}$/i.test(a.hex); }); if (R.AURA.length !== 85 || miss.length) throw new Error(miss.length + ' missing'); });
  chk('Export → import of your data is identical', function () { if (JSON.stringify(R.importState(R.exportState(S))) !== JSON.stringify(S)) throw new Error('round trip differs'); });
  var all = res.concat(live), passN = all.filter(function (x) { return x.pass; }).length;
  openLayer('<div class="win-h"><div class="win-t">DIAGNOSTICS</div><div class="win-s num ' + (passN === all.length ? 'holo' : 'blood') + '">' + passN + '/' + all.length + ' passed</div></div><div class="diag">' + all.map(function (x) { return '<div><span class="' + (x.pass ? 'p' : 'f') + '">' + (x.pass ? 'PASS' : 'FAIL') + '</span> ' + esc(x.name) + (x.pass ? '' : '<br><span class="f">' + esc(x.error) + '</span>') + '</div>'; }).join('') + '</div><div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Close</button></div>');
  return { pass: passN, total: all.length, results: all };
}

/* shown once to a save that was moved from the old 1 Oct start to the new one */
function restartNote() {
  if (!S.meta.restarted || S.meta.restartSeen === S.meta.restarted) return;
  S.meta.restartSeen = S.meta.restarted; persist(true);
  toast('Winter Arc now starts on ' + R.fmtDate(S.profile.startDate) + ' at ' + n1(S.profile.startKg) + 'kg. Everything you logged before is kept. XP, bosses and heroes begin from day one.', { icon: '❄️', ms: 12000 });
}

/* ───────────── OPERATION 79.9 (13 Nov – 31 Dec): the tracker, the deficit bank, the checklist sheets, the reviews ───────────── */
QCOL.bowl = 'var(--protein)'; QCOL.treat = 'var(--gold)'; QCOL.weigh = 'var(--holo)';
var OPK = R.OP, opChoice = { lvl: 'moderate', walk: 20, int: 'medium' }, opIntroDue = false;
function opOn(k) { return R.inOp(S, k || today()); }
function sgn(v) { return (v < 0 ? '−' : v > 0 ? '+' : '') + n0(Math.abs(v)); }
function dShort(k) { return esc(R.fmtDate(k).slice(4)); }
/* starts the operation on this save the first time the update opens. A copy of the save as it was is kept first
   (Settings → Restore an earlier version), and nothing logged is changed. */
function opStart() {
  if (R.hasOp(S)) return;
  try { backupLocal('Before OPERATION 79.9'); } catch (e) { reportErr(e, 'operation backup'); }
  if (R.ensureOp(S, today())) { opIntroDue = true; try { persist(); } catch (e2) { reportErr(e2, 'operation save'); } }
}
function opNudgeText() { try { var k = today(), m = R.opMissing(S, k); return m.length ? m.join(' · ') : ''; } catch (e) { return ''; } }
/* ── Home: the 79.9 Tracker ── */
function trackerCardHTML(k) {
  var t = R.opTracker(S, k), day = R.diffDays(OPK.start, k) + 1, total = R.diffDays(OPK.start, OPK.end) + 1, mode = R.opMode(S, k);
  var label = { green: 'ON TRACK', amber: 'BEHIND', red: 'BEHIND', hold: 'HOLD', none: 'WEIGH IN' }[t.state];
  var detail = t.state === 'none' ? 'Log this morning’s weight to start the tracker' : t.state === 'hold' ? 'Iceland: hold your level. Next weigh-in Tue 15 Dec' : t.diff < 0 ? n1(-t.diff) + 'kg ahead of the line' : t.diff === 0 ? 'Exactly on the line' : n1(t.diff) + 'kg behind the line';
  var span = OPK.startKg - OPK.target, ticks = t.checkpoints.slice(0, -1).map(function (c) { return '<i class="tk' + (c.hit === true ? ' hit' : c.hit === false ? ' miss' : '') + '" style="left:' + (100 * (OPK.startKg - c.kg) / span).toFixed(1) + '%"></i>'; }).join('');
  var pos = Math.max(0, Math.min(100, 100 * (OPK.startKg - t.cur) / span));
  return '<button class="win opcard optrack lift st-' + t.state + '" data-act="op-track" aria-label="OPERATION 79.9 tracker: ' + esc(label) + '. ' + esc(detail) + '">' +
    '<div class="win-h"><div class="win-t">OPERATION 79.9</div><div class="win-s">Day ' + day + ' of ' + total + ' · ' + t.daysLeft + ' day' + (t.daysLeft === 1 ? '' : 's') + ' left' + (mode === 'iceland' ? ' · Iceland' : mode === 'off' ? ' · day off' : '') + '</div></div>' +
    '<div class="op-top"><div class="op-big"><b class="num">' + n1(t.cur) + '</b><span>kg' + (t.weighed ? ' · logged ' + (t.age === 0 ? 'today' : t.age === 1 ? 'yesterday' : dShort(t.curDay)) : ' · start weight') + '</span></div>' +
    '<div class="op-state"><span class="op-pill">' + label + '</span><span class="op-detail" id="op-detail">' + esc(detail) + '</span></div></div>' +
    '<div class="op-line" aria-hidden="true"><div class="op-fill" style="width:' + pos.toFixed(1) + '%"></div>' + ticks + '<i class="op-me" style="left:' + pos.toFixed(1) + '%"></i></div><div class="op-ends"><span>' + n1(OPK.startKg) + '</span><span>79.9</span></div>' +
    '<div class="plan3"><div><span>7-day average</span><b>' + (t.avg7 != null ? n1(t.avg7) + 'kg' : '—') + '</b></div><div><span>' + (t.next ? 'Next: ' + dShort(t.next.date) : 'Finish') + '</span><b style="color:var(--kcal)">' + (t.next ? n1(t.next.kg) + 'kg' : '79.9kg') + '</b></div><div><span>To go</span><b style="color:var(--holo)">' + n1(t.toGo) + 'kg</b></div></div>' +
    (t.warn ? '<div class="op-warn" id="op-warn">' + esc(t.warn) + '</div>' : t.stale ? '<div class="op-warn soft">Last weigh-in was ' + t.age + ' days ago. Weigh in tomorrow morning so this is real.</div>' : '') +
    '</button>';
}
function trackerSheet() {
  var k = today(), t = R.opTracker(S, k), hs = R.heroStatus(S, k);
  var rows = t.checkpoints.map(function (c) {
    var st = c.hit === true ? '<span class="status hit">hit</span>' : c.hit === false ? '<span class="status over">+' + n1(c.actual - c.kg) + 'kg</span>' : c.date < k ? '<span class="status under">no weigh-in</span>' : '<span class="dim">' + c.daysLeft + 'd</span>';
    return '<tr><td>' + dShort(c.date) + (c.date === '2026-12-25' ? ' <span class="dim">· hardest</span>' : '') + '</td><td>' + n1(c.kg) + '</td><td>' + (c.actual != null ? n1(c.actual) : '—') + '</td><td>' + st + '</td></tr>';
  }).join('');
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t">OPERATION 79.9</div><div class="win-s">13 Nov – 31 Dec</div></div>' +
    '<p class="muted" style="margin:-4px 0 10px;font-size:13.5px">86.5kg to 79.9kg. Each checkpoint is judged on the weight you log that morning: at or under the line is a hit. On 31 Dec anything above 79.9 is not done.</p>' +
    '<div class="scroll-x"><table class="tbl ptbl"><thead><tr><th>Checkpoint</th><th>Line</th><th>You</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div style="margin-top:12px"><div class="kv"><span>Current weight</span><b>' + n1(t.cur) + 'kg</b></div><div class="kv"><span>The line for that day</span><b>' + n1(t.plan) + 'kg</b></div><div class="kv"><span>7-day average (for context)</span><b>' + (t.avg7 != null ? n1(t.avg7) + 'kg' : '—') + '</b></div><div class="kv"><span>Lost since 13 Nov</span><b>' + n1(Math.max(0, t.lost)) + 'kg of 6.6</b></div>' +
    '<div class="kv"><span>Heroes freed</span><b>' + hs.unlocked + ' of ' + hs.total + (hs.current ? ' · next at ' + n2(hs.current.need) + 'kg' : '') + '</b></div></div>' +
    '<div class="qname" style="margin-top:12px">Rules of the operation</div><div class="qsub" style="line-height:1.5">1,450 kcal is the most you eat on a diet day (under 1,300 is too little). Protein 150–160g. Steps 13k on gym days, 15k on rest days, 10k on football. Iceland 9–13 Dec is maintenance (about 2,250). 21 Dec caps at 1,700 and Christmas Day at 2,100. More than 0.3kg over a checkpoint adds 2,000 steps a day and 20 minutes of incline walk on gym days for the week after; calories never drop.</div>' +
    '<div class="row end" style="margin-top:14px"><button class="btn small ghost" data-act="plan">Full plan</button><button class="btn small tint" style="--c:var(--holo)" data-act="weigh">Weigh in</button></div>');
}
/* ── Home: the deficit bank ── */
function bankCardHTML(k) {
  var b = R.opBank(S, k), mode = R.opMode(S, k);
  var foot = b.dietLeft ? b.dietLeft + ' diet day' + (b.dietLeft === 1 ? '' : 's') + ' left · the plan was ' + n0(b.planPerDay) + ' a day' : 'No diet days left';
  var pace = b.behind > 300 ? '<span class="warnc">' + n0(b.behind) + ' behind pace</span>' : b.behind < -300 ? '<span class="good">' + n0(-b.behind) + ' ahead of pace</span>' : '<span class="good">On pace</span>';
  return '<button class="win opcard opbank lift" style="--c:var(--good)" data-act="op-bank"><div class="win-h"><div class="win-t">DEFICIT BANK</div><div class="win-s num">' + n0(b.banked) + ' / ' + n0(b.need) + ' kcal</div></div>' +
    '<div class="bar bankbar"><i style="width:' + Math.max(0, Math.round(b.pct * 1000) / 10) + '%"></i></div>' +
    '<div class="plan3"><div><span>Left to bank</span><b>' + n0(b.left) + '</b></div><div><span>Needed a day</span><b id="bank-need" style="color:' + (b.perDay != null && b.perDay > b.planPerDay + 150 ? 'var(--warn)' : 'var(--good)') + '">' + (b.perDay != null ? n0(b.perDay) : '—') + '</b></div><div><span>Today so far</span><b>' + (mode !== 'diet' && b.today == null ? '—' : b.today == null ? 'log food' : sgn(b.today)) + '</b></div></div>' +
    '<div class="row between" style="margin-top:8px;font-size:12.5px"><span class="muted">' + foot + '</span>' + pace + '</div></button>';
}
function bankSheet() {
  var k = today(), b = R.opBank(S, k);
  var rows = b.days.slice().reverse().map(function (x) { return '<tr><td>' + dShort(x.day) + (x.mode === 'iceland' ? ' <span class="dim">Iceland</span>' : x.mode === 'off' ? ' <span class="dim">day off</span>' : '') + '</td><td style="text-align:right">' + (x.missing ? '<span class="dim">not logged</span>' : '<b style="color:' + (x.deficit < 0 ? 'var(--bad)' : 'var(--good)') + '">' + sgn(x.deficit) + '</b>') + '</td></tr>'; }).join('');
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--good)">DEFICIT BANK</div><div class="win-s">' + n0(b.banked) + ' of ' + n0(b.need) + '</div></div>' +
    '<p class="muted" style="margin:-4px 0 10px;font-size:13.5px">About 6.1kg of fat is 47,000 kcal. Every day you log food, its deficit (burn minus food) goes in. A surplus comes out, holiday or not. A day with no food logged banks nothing.</p>' +
    '<div class="kv"><span>Banked</span><b>' + n0(b.banked) + ' kcal · about ' + n1(b.kgFat) + 'kg of fat</b></div><div class="kv"><span>Left</span><b>' + n0(b.left) + ' kcal</b></div><div class="kv"><span>Diet days left</span><b>' + b.dietLeft + ' of ' + b.dietTotal + '</b></div><div class="kv"><span>Needed on each of them</span><b>' + (b.perDay != null ? n0(b.perDay) + ' kcal' : '—') + '</b></div><div class="kv"><span>Where the plan says you should be</span><b>' + n0(b.should) + ' kcal</b></div>' +
    (b.missing.length ? '<div class="alert" style="margin-top:10px"><span>📝</span><div>' + b.missing.length + ' diet day' + (b.missing.length === 1 ? ' has' : 's have') + ' no food logged (' + b.missing.slice(-4).map(dShort).join(', ') + '). Log them from the Log tab and they count.</div></div>' : '') +
    '<p class="dim" style="font-size:12px;margin:10px 0 6px">Burn = 1,900 + 35 per 1,000 steps + gym (light 175, moderate 275, high 325) + football (11.2 a minute; low ×0.75, high ×1.2) + incline walk (7 a minute). These are estimates: the scale has the final word.</p>' +
    (rows ? '<div class="scroll-x" style="max-height:240px;overflow:auto"><table class="tbl ptbl"><thead><tr><th>Day</th><th style="text-align:right">Banked</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
    '<div class="row end" style="margin-top:14px"><button class="btn small" data-act="close">Close</button></div>');
}
/* ── Home: the 8pm nudge, the Sunday review, the verse, the finish ── */
function nudgeHTML(k) {
  if (R.opMode(S, k) !== 'diet' || R.londonTime() < '20:00') return '';
  var m = R.opMissing(S, k); if (!m.length) return '<div class="alert cyan" id="op-nudge"><span>🌙</span><div>Everything is in for today. Lights out by 11.</div></div>';
  return '<div class="alert violet" id="op-nudge"><span>🌙</span><div class="grow"><b>Still missing today</b><br>' + m.map(esc).join(' · ') + '</div><button class="btn small tint" style="--c:var(--train)" data-act="tab" data-tab="status">Finish it</button></div>';
}
function reviewDay(k) { var wd = R.weekday(k); return wd === 0 ? k : wd === 1 && R.addDays(k, -1) >= OPK.start ? R.addDays(k, -1) : ''; } // Sunday, and Monday for the week just gone
function reviewCardHTML(k) {
  var rk = reviewDay(k); if (!rk) return ''; var w = R.opWeek(S, rk); if (!w) return '';
  return '<button class="win opcard opreview lift" style="--c:var(--train)" data-act="op-review"><div class="win-h"><div class="win-t">SUNDAY REVIEW</div><div class="win-s">' + dShort(w.from) + ' – ' + dShort(w.to) + '</div></div>' +
    '<div class="plan3"><div><span>Deficit</span><b style="color:' + (w.short <= 0 ? 'var(--good)' : 'var(--warn)') + '">' + n0(w.deficit) + '</b></div><div><span>Perfect days</span><b>' + w.perfect + ' / ' + w.days + '</b></div><div><span>Protein avg</span><b>' + (w.proteinAvg != null ? w.proteinAvg + 'g' : '—') + '</b></div></div>' +
    '<p class="op-verdict" id="op-verdict">' + esc(w.line) + '</p></button>';
}
function reviewSheet() {
  var k = today(), rk = reviewDay(k) || k, w = R.opWeek(S, rk); if (!w) { toast('The first review is on Sunday.'); return; }
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">SUNDAY REVIEW</div><div class="win-s">' + dShort(w.from) + ' – ' + dShort(w.to) + '</div></div>' +
    '<div class="kv"><span>Average weight this week</span><b>' + (w.avg != null ? n1(w.avg) + 'kg' : 'no weigh-ins') + '</b></div>' +
    '<div class="kv"><span>Checkpoint' + (w.checkpoint ? ' ' + dShort(w.checkpoint.date) + ' (' + n1(w.checkpoint.kg) + 'kg)' : '') + '</span><b>' + (!w.checkpoint ? 'first one is 20 Nov' : w.actual == null ? 'no weigh-in' : n1(w.actual) + 'kg · ' + (w.diff <= 0 ? '<span class="good">hit</span>' : '<span class="warnc">' + n1(w.diff) + 'kg over</span>')) + '</b></div>' +
    '<div class="kv"><span>Deficit banked</span><b>' + n0(w.deficit) + ' of ' + n0(w.target) + ' kcal' + (w.full ? '' : ' so far') + '</b></div><div class="kv"><span>Perfect days</span><b>' + w.perfect + ' of ' + w.days + '</b></div><div class="kv"><span>Protein average</span><b>' + (w.proteinAvg != null ? w.proteinAvg + 'g a day' : 'nothing logged') + '</b></div><div class="kv"><span>Days with food logged</span><b>' + w.logged + ' of ' + w.days + '</b></div>' +
    '<p class="op-verdict" style="margin-top:12px">' + esc(w.line) + '</p><p class="dim" style="font-size:12px;margin:8px 0 0">One bad day is one day. The fix is always the next one: 1,450, protein, steps.</p>' +
    '<div class="row end" style="margin-top:14px"><button class="btn small ghost" data-act="op-bank">Deficit bank</button><button class="btn small" data-act="close">Close</button></div>');
}
function verseCardHTML(k) {
  var v = R.opVerse(k); if (!v) return '';
  return '<a class="win opcard opverse lift" style="--c:var(--gold)" href="' + esc(v.url) + '" target="_blank" rel="noopener" id="op-verse"><div class="win-h"><div class="win-t">TODAY’S VERSE</div><div class="win-s">' + v.n + ' of ' + v.total + '</div></div>' +
    '<div class="vref">' + esc(v.ref) + '</div><p class="vline">' + esc(v.line) + '</p><div class="row between" style="font-size:12.5px"><span class="dim">In short, in our own words</span><span class="gold">Read it in the NIV ›</span></div></a>';
}
function opFinishCardHTML(k) {
  var f = R.opFinish(S, k); if (!f) return '';
  if (!f.weighed) return '<div class="win opcard opfinish" style="--c:var(--gold)"><div class="win-h"><div class="win-t">THE FINAL WEIGH-IN</div><div class="win-s">31 Dec</div></div><p class="muted" style="margin:0 0 10px">This is the one that counts. Fasted, after the toilet. 79.9 or under and OPERATION 79.9 is done.</p><button class="btn primary" data-act="weigh">Weigh in</button></div>';
  return '<button class="win opcard opfinish lift ' + (f.done ? 'won' : 'short') + '" style="--c:' + (f.done ? 'var(--gold)' : 'var(--warn)') + '" data-act="op-finish"><div class="win-h"><div class="win-t">' + (f.done ? 'OPERATION 79.9 · DONE' : 'OPERATION 79.9 · NOT DONE') + '</div><div class="win-s">31 Dec</div></div>' +
    '<div class="plan3"><div><span>Final weight</span><b style="color:var(--holo)">' + n1(f.kg) + 'kg</b></div><div><span>Target</span><b>79.9kg</b></div><div><span>Since 13 Nov</span><b style="color:var(--good)">−' + n1(Math.max(0, f.lostOp)) + 'kg</b></div></div>' +
    '<div class="row between" style="margin-top:8px;font-size:13px"><span class="muted">' + (f.confirmed ? 'Confirmed' : 'Tap to confirm your weigh-in') + '</span><span class="holo">See the season ›</span></div></button>';
}
function opFinishSheet() {
  var k = today(), f = R.confirmOpFinish(S, k); if (!f) return; persist();
  var row = function (a, b) { return '<div class="kv"><span>' + a + '</span><b>' + b + '</b></div>'; };
  if (f.done && S.player.opFinishSeen !== f.kg) { S.player.opFinishSeen = f.kg; persist(true); beep('level'); vib([120, 60, 120, 60, 200]); confetti(110, true); }
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:' + (f.done ? 'var(--gold)' : 'var(--warn)') + '">' + (f.done ? 'OPERATION 79.9: DONE' : 'OPERATION 79.9: NOT DONE') + '</div><button class="btn small ghost" data-act="close">Close</button></div>' +
    '<p style="margin:-4px 0 12px;font-size:14px">' + (f.done ? 'You weighed ' + n1(f.kg) + 'kg on 31 Dec. Target met.' : 'You weighed ' + n1(f.kg) + 'kg on 31 Dec, ' + n1(f.over) + 'kg above 79.9. That is not the target, and the app will not call it one. It is still ' + n1(Math.max(0, f.lostOp)) + 'kg lost in ' + f.days + ' days.') + '</p>' +
    '<div class="qname">The weight</div>' + row('Since 13 Nov (86.5kg)', '−' + n1(f.lostOp) + 'kg') + row('Since 14 Sept (90.5kg)', '−' + n1(f.lostSeason) + 'kg') + row('Since the start of the year (100kg)', '<span class="holo">−' + n1(f.lostYear) + 'kg</span>') +
    '<div class="qname" style="margin-top:12px">The season</div>' + row('Perfect days', f.perfect + ' of ' + f.days) + row('Deficit banked', n0(f.banked) + ' of ' + n0(f.need) + ' kcal') + row('Checkpoints hit', f.checkpointsHit + ' of ' + f.checkpoints) + row('Best perfect-day streak', f.bestStreak + ' days') + row('Best protein streak', f.bestProtein + ' days') + row('Bosses beaten', f.bossesWon + ' of ' + f.bossesTotal) + row('Heroes freed', f.heroes + ' of ' + f.heroesTotal) +
    '<div class="row end" style="margin-top:14px"><button class="btn small ghost" data-act="finish">The whole Winter Arc</button><button class="btn small" data-act="export">Export a backup</button></div>');
}
/* ── warnings that belong to the operation ── */
function opAlertsHTML(k) {
  var d = R.getDay(S, k), mode = R.opMode(S, k);
  return alertList([
    function () { return mode === 'iceland' ? '<div class="alert cyan" id="op-iceland"><span>🧊</span><div><b>Iceland mode</b><br>Maintenance, about 2,250 kcal. Protein at every meal (lamb, fish, chicken, skyr), up to 10,000 steps, one treat a day. No weigh-ins until Tue 15 Dec: expect 0.3–0.5kg of travel water when you do.</div></div>' : ''; },
    function () { return mode === 'off' ? '<div class="alert cyan" id="op-off"><span>🎄</span><div><b>Day off</b><br>Cap ' + n0(R.calTarget(S, k)) + ' kcal. Under the cap there is no penalty. Back to 1,450 tomorrow morning.</div></div>' : ''; },
    function () { var o = R.opOver(S, k); return o ? '<div class="alert red" id="op-over"><span>🔥</span><div class="grow"><b>' + n0(o.over) + ' kcal over ' + n0(R.calTarget(S, k)) + '</b><br>' + n0(o.steps) + ' extra steps cover it (or about ' + o.walkMin + ' minutes of incline walk). One day is one day: walk it off and move on.</div><button class="btn small tint" style="--c:var(--steps)" data-act="steps-sheet">Steps</button></div>' : ''; },
    function () { var t = R.opTreats(d); return mode === 'diet' && t.banned.length ? '<div class="alert red" id="op-banned"><span>⛔</span><div class="grow"><b>' + esc(t.banned[0].name) + '</b> is banned until 31 Dec unless it is today’s one treat (150 kcal at most).</div><button class="btn small" data-act="op-treat">Sort it</button></div>' : ''; },
    function () { var t = R.opTreats(d); return mode === 'diet' && !t.banned.length && (t.n > 1 || t.kcal > OPK.treatMax) ? '<div class="alert red" id="op-treat-over"><span>🍫</span><div>' + (t.n > 1 ? t.n + ' treats today. One a day.' : 'Today’s treat is ' + n0(t.kcal) + ' kcal. The limit is ' + OPK.treatMax + '.') + ' It still counts in your calories.</div></div>' : ''; },
    function () { var b = R.opBoost(S, k); return b ? '<div class="alert red" id="op-boost"><span>📈</span><div><b>Behind-schedule rule is on</b><br>You weighed ' + n1(b.weighed.kg) + 'kg against ' + n1(b.cp.kg) + 'kg on ' + dShort(b.cp.date) + ', ' + n1(b.over) + 'kg over. Until ' + dShort(R.addDays(b.cp.date, 7)) + ': +2,000 steps a day and 40 minutes of incline walk on gym days. Calories stay at 1,450.</div></div>' : ''; },
    function () { var m = R.opMuscle(S, k); return m ? '<div class="alert red" id="op-muscle"><span>💪</span><div>' + esc(m.text) + '</div></div>' : ''; }
  ]);
}
/* ── the checklist's sheets ── */
function segHTML(id, opts, cur) { return '<div class="seg segfull" id="' + id + '" role="group">' + opts.map(function (o) { return '<button type="button" data-act="op-seg" data-seg="' + id + '" data-v="' + o[0] + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
function segVal(id) { var b = $('#' + id + ' [aria-pressed="true"]'); return b ? b.dataset.v : null; }
function gymSheet() {
  var k = today(), d = R.getDay(S, k), had = R.gymSessions(d) > 0, need = R.opWalkNeed(S, k), walked = R.inclineMinutes(d), sess = R.sessionFor(S, k);
  opChoice.walk = walked >= need ? 0 : need;
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--train)">GYM SESSION</div><div class="win-s">' + esc(sess ? sess.name : 'Any session') + '</div></div>' +
    (had ? '<p class="muted" style="margin:-4px 0 10px">Gym is already logged today' + (walked ? ', with ' + n0(walked) + ' minutes of incline walk' : '') + '. Add more walk below.</p>' :
      '<div class="qsub" style="margin-bottom:6px">How hard was the lifting?</div>' + segHTML('g-lvl', [['light', 'Light<small>long rests · 175</small>'], ['moderate', 'Moderate<small>60–90s rests · 275</small>'], ['high', 'High<small>heavy, short rests · 325</small>']], opChoice.lvl)) +
    '<div class="qsub" style="margin:12px 0 6px">Incline walk' + (need > OPK.walkMin ? ' (40 minutes this week: you are behind a checkpoint)' : ' (20–30 minutes is today’s tick)') + '</div>' + segHTML('g-walk', [[0, 'None'], [20, '20 min'], [30, '30 min'], [40, '40 min']], opChoice.walk) +
    '<div class="op-burn" id="g-burn"></div>' +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="op-gym-save" data-had="' + (had ? 1 : 0) + '">' + (had ? 'Add walk' : 'Log session') + '</button></div>');
  gymBurn();
}
function gymBurn() { var el = $('#g-burn'); if (!el) return; var lvl = segVal('g-lvl'), walk = +segVal('g-walk') || 0, g = lvl ? R.GYM_LEVELS[lvl] : 0; el.innerHTML = 'Burn added today: <b class="num">' + n0(g + walk * 7) + ' kcal</b>' + (g && walk ? ' <span class="dim">(' + g + ' gym + ' + walk * 7 + ' walk)</span>' : ''); }
function footballSheet() {
  var k = today(), d = R.getDay(S, k), had = R.footballMinutes(d);
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--steps)">FOOTBALL</div><div class="win-s">' + (had ? n0(had) + ' min already logged' : 'About 11 kcal a minute') + '</div></div>' +
    '<label class="field">Minutes you actually played<input class="inp num" id="f-min" type="number" inputmode="numeric" min="1" max="300" value="90" style="font-size:22px;min-height:56px"></label>' +
    '<div class="qsub" style="margin:12px 0 6px">How hard did you go?</div>' + segHTML('f-int', [['low', 'Low<small>×0.75</small>'], ['medium', 'Medium<small>×1</small>'], ['high', 'High<small>×1.2</small>']], opChoice.int) +
    '<div class="op-burn" id="f-burn"></div>' +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="op-foot-save">Log football</button></div>');
  var inp = $('#f-min'); inp.addEventListener('input', footBurn); footBurn();
}
function footBurn() { var el = $('#f-burn'), inp = $('#f-min'); if (!el || !inp) return; var m = Math.max(0, Math.min(300, parseFloat(inp.value) || 0)), it = segVal('f-int') || 'medium'; el.innerHTML = 'Burn: <b class="num">' + n0(m / 60 * S.tdee.footballPerHour * R.FOOT_INT[it]) + ' kcal</b> <span class="dim">(' + n0(m) + ' min × ' + n1(S.tdee.footballPerHour / 60 * R.FOOT_INT[it]) + ')</span>'; }
function bowlSheet() {
  var k = today(), d = R.getDay(S, k), done = R.bowlDone(d), late = R.londonTime() >= '10:00', meal = S.savedMeals.filter(function (m) { return m.id === 'protein-bowl' || /bowl/i.test(m.name); })[0];
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--protein)">YOGURT BOWL</div><div class="win-s">Before 10am</div></div>' +
    '<p class="muted" style="margin:-4px 0 12px">250g fat-free Greek yogurt + 65g whey isolate: 377 kcal, 72g protein. Nearly half the day’s protein before you leave the house.</p>' +
    (done ? '<div class="alert cyan"><span>🥣</span><div class="grow">Ticked for today.</div>' + (d.bowl ? '<button class="btn small ghost" data-act="op-bowl-undo">Undo</button>' : '') + '</div>' :
      (late ? '<div class="alert"><span>⏰</span><div>It is past 10am. Tick it only if you really had it before 10.</div></div>' : '') +
      '<div class="row" style="flex-direction:column;align-items:stretch;gap:8px">' + (meal ? '<button class="btn primary" data-act="op-bowl-log">Log the bowl now (377 kcal, 72g)</button>' : '') + '<button class="btn" data-act="op-bowl-tick">I had it before 10am and it is already logged</button></div>') +
    '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="close">Close</button></div>');
}
function treatSheet() {
  var k = viewDay || today(), d = R.getDay(S, k), t = R.opTreats(d);
  var list = d.foods.map(function (f) { var ban = R.isBannedFood(f.name); return '<button class="quest treatrow ' + (f.tr ? 'done' : '') + '" data-act="op-treat-toggle" data-id="' + esc(f.id) + '"><div class="qicon">' + (f.tr ? '🍫' : ban ? '⛔' : '·') + '</div><div><div class="qname">' + esc(f.name) + '</div><div class="qsub num">' + n0(f.cal) + ' kcal' + (ban && !f.tr ? ' · banned unless it is your treat' : '') + (f.tr && f.cal > OPK.treatMax ? ' · over ' + OPK.treatMax : '') + '</div></div><div class="qrew">' + (f.tr ? 'Treat ✓' : 'Mark') + '</div></button>'; }).join('');
  openLayer('<div class="grab"></div><div class="win-h"><div class="win-t" style="color:var(--gold)">TODAY’S TREAT</div><div class="win-s">' + (t.n ? t.n + ' marked · ' + n0(t.kcal) + ' kcal' : 'None marked') + '</div></div>' +
    '<p class="muted" style="margin:-4px 0 10px">One a day, 150 kcal at most. Mutton rolls, samosas, crêpes and chocolate snacks only count if they are the treat. Tap a food to mark or unmark it.</p>' +
    (list || '<p class="dim" style="margin:0 0 6px">Nothing logged yet today. Log the treat like any food, then mark it here.</p>') +
    '<div class="row end" style="margin-top:12px"><button class="btn small tint" style="--c:var(--kcal)" data-act="open-cmd">Log food</button><button class="btn small" data-act="close">Done</button></div>');
}
/* shown once, the first time the update opens */
function opIntro() {
  if (!opIntroDue) return; if ($('.ceremony') || $('#splash') || $('#layer').innerHTML || $('.notice') || evShowing || evQueue.length) { setTimeout(opIntro, 800); return; }
  opIntroDue = false; var k = today(), ds = R.duelSummary(S, k), hs = R.heroStatus(S, k), back = R.duelOp(S) ? Object.keys(R.duelOp(S).hard).length : 0;
  beep('level'); vib([80, 40, 120]);
  ceremony('A NEW SEASON', '79.9', '86.5kg to 79.9kg by 31 Dec.\n1,450 kcal a day · protein 150–160g · 47,000 kcal to bank.\n' + (ds.total - ds.won) + ' bosses are back in the draw' + (back ? ', ' + back + ' of them harder' : '') + '. ' + (hs.total - hs.unlocked) + ' heroes break free by 80.0kg.\nEverything you logged is kept.', 'rank', function () { try { trackerSheet(); } catch (e) { reportErr(e, 'tracker'); } });
}

/* ───────────── system notice ───────────── */
function showNotice() {
  var k = today(); if (R.seasonOver(S, k)) { maybeFinish(); return; } // after the last day there is nothing to announce except the finish
  if (R.notStarted(S, k)) return; // and nothing is asked before the first day
  if (S.settings.lastNotice === k) return;
  var q = R.questStatus(S, k), lines = R.noticeLines(S, k);
  var d = document.createElement('div'); d.className = 'notice';
  d.innerHTML = win('SYSTEM NOTICE', '<p style="margin:0 0 8px">Daily quests have arrived, ' + esc(S.profile.name) + '.</p>' + lines.map(function (l) { return '<div class="qsub" style="color:' + (l.indexOf('PENALTY') === 0 ? 'var(--blood)' : 'var(--ink-2)') + '">' + esc(l) + '</div>'; }).join('') +
    '<div style="margin:8px 0">' + q.map(function (x) { return '<div class="kv"><span>' + x.icon + ' ' + esc(x.name) + '</span><b class="dim">' + esc(x.label) + '</b></div>'; }).join('') + '</div><div class="row end"><button class="btn primary" id="notice-ok">Accept</button></div>');
  document.body.appendChild(d);
  vib(40);
  $('#notice-ok', d).onclick = function () { S.settings.lastNotice = k; persist(); d.remove(); setTimeout(nextInbox, 300); setTimeout(maybeBossIntro, 350); };
}

/* ───────────── events ───────────── */
var ACTIONS = {
  tab: function (b) { setTab(b.dataset.tab); },
  close: function () { closeLayer(); },
  settings: function () { closeLayer(); settingsSheet(); },
  shop: function () { closeLayer(); shopSheet(); },
  'photo-done': function () { S.settings.lastPhoto = today(); persist(); render(); toast('Photos logged. Next reminder in 2 weeks.'); },
  water: function (b) { quickLog([{ kind: 'water', ml: +b.dataset.ml }], '+' + b.dataset.ml + 'ml water.', b); },
  'steps-save': function (b) {
    var inSheet = $('#layer #q-steps'), v = parseInt((inSheet || $('#q-steps')).value, 10); if (!isFinite(v) || v < 1 || v > 100000) { toast('Steps must be 1–100,000.', { bad: true }); return; }
    var k = inSheet && stepsDay ? stepsDay : today(); closeLayer(); stepsDay = null;
    if (k === today()) { quickLog([{ kind: 'activity', type: 'steps', steps: v }], 'Steps set to ' + n0(v) + '.'); return; }
    var res = R.commitItems(S, k, [{ kind: 'activity', type: 'steps', steps: v }], 'q' + R.uid(), Date.now(), R.londonTime()); if (!res.ok) { toast('Couldn’t save those steps.', { bad: true }); return; }
    afterChange(); toast(R.fmtDate(k) + ': ' + n0(v) + ' steps. Today’s target is ' + n0(R.stepsTarget(S, today())) + '.', { action: 'Undo', ms: 6000, onAction: function () { R.undoCommit(S, res.undo); afterChange(); } });
  },
  'steps-yday': function () { closeLayer(); stepsSheet(R.addDays(today(), -1)); },
  'gym-done': function (b) { if (opOn()) { closeLayer(); gymSheet(); return; } quickLog([{ kind: 'activity', type: 'gym', min: 60 }], 'Gym session logged.', b); },
  'football-done': function (b) { if (opOn()) { closeLayer(); footballSheet(); return; } quickLog([{ kind: 'activity', type: 'football', min: 60 }], 'Football logged.', b); },
  recover: function (b) { var k = today(); var d = S.days[k] || (S.days[k] = R.emptyDay()); d.recover = !d.recover; afterChange(b); },
  lights: function (b) { var k = today(); var d = S.days[k] || (S.days[k] = R.emptyDay()); d.lightsOut = !d.lightsOut; afterChange(b); if (d.lightsOut) toast('Lights out. Sleep well.', { icon: '🌙' }); },
  penalty: function (b) { var k = today(); var d = S.days[k] || (S.days[k] = R.emptyDay()); d.penaltyDone = true; afterChange(b); vib([80, 40, 80]); toast('Penalty cleared. Half your streak is safe.', { icon: '⛓️' }); },
  trial: function (b) { var key = b.dataset.tree, T = R.TRIALS[key], next = T.stages[S.trials[key]]; confirmBox(T.name, 'Did you complete “' + next + '” with good form?', 'Cleared it', function () { if (R.advanceTrial(S, key)) { afterChange(); beep('win'); vib([80, 40, 80]); confetti(30); toast(next + ' cleared. +50 XP · +20 G', { icon: T.icon }); } }); },
  'day-prev': function () { viewDay = R.addDays(viewDay || today(), -1); render(); },
  'day-next': function () { var n = R.addDays(viewDay || today(), 1); viewDay = n >= today() ? null : n; render(); },
  'food-item': function (b) { foodItemSheet(b.dataset.id); },
  del: function (b) {
    var k = viewDay || today(), rem = R.removeEntry(S, k, b.dataset.list, b.dataset.id); if (!rem) return;
    closeLayer(); afterChange();
    toast('Deleted.', { action: 'Undo', onAction: function () { R.restoreEntry(S, rem); afterChange(); } });
  },
  'reset-field': function (b) { var k = viewDay || today(), d = S.days[k]; if (!d) return; var f = b.dataset.field, prev = d[f]; d[f] = 0; afterChange(); toast((f === 'water' ? 'Water' : 'Steps') + ' reset.', { action: 'Undo', onAction: function () { d[f] = prev; afterChange(); } }); },
  saved: function () { savedSheet(); },
  'saved-use': function (b) { var m = S.savedMeals.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!m) return; closeLayer(); openConfirm(R.savedMealItems(m), { source: 'saved' }); },
  'saved-del': function (b) { var m = S.savedMeals.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!m) return; confirmBox('Delete saved meal?', '“' + m.name + '” will be removed. Logged days are not affected.', 'Delete', function () { S.savedMeals = S.savedMeals.filter(function (x) { return x !== m; }); persist(); toast('Saved meal deleted.'); }, true); },
  'copy-yday': function () { copySheet(); },
  'copy-meal': function (b) { var d = R.getDay(S, b.dataset.day), items = d.foods.filter(function (f) { return f.meal === b.dataset.meal; }).map(function (f) { return { kind: 'food', _id: R.uid(), name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib, conf: f.conf, note: 'Copied from ' + R.fmtDate(b.dataset.day), meal: f.meal }; }); closeLayer(); openConfirm(items, { source: 'copy' }); },
  'fi-fav': function (b) { var k = viewDay || today(), f = R.getDay(S, k).foods.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!f) return; S.savedMeals.push({ id: R.uid(), name: f.name, items: [{ name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib }] }); persist(); closeLayer(); toast('Saved: ' + f.name); },
  manual: function () { openConfirm([blankItem('food')], { source: 'manual', editing: true }); },
  'manual-from-text': function () { closeLayer(); var it = blankItem('food'); it.name = (submitText.last || '').slice(0, 80); openConfirm([it], { source: 'manual', editing: true }); },
  'ci-cancel': function () { closeLayer(); },
  'ci-edit': function () { pending.editing = !pending.editing; renderConfirm(); },
  'ci-del': function (b) { pending.items.splice(+b.dataset.i, 1); renderConfirm(); },
  'ci-add': function (b) { pending.items.push(Object.assign(blankItem(b.dataset.kind), {})); pending.items[pending.items.length - 1].errors = R.checkItem(pending.items[pending.items.length - 1]); renderConfirm(); },
  'ci-addset': function (b) { var it = pending.items[+b.dataset.i], last = it.sets[it.sets.length - 1] || { kg: NaN, reps: NaN }; if (it.sets.length >= 20) return; it.sets.push({ kg: last.kg, reps: last.reps }); it.errors = R.checkItem(it); renderConfirm(); },
  'ci-delset': function (b) { var it = pending.items[+b.dataset.i]; it.sets.splice(+b.dataset.s, 1); it.errors = R.checkItem(it); renderConfirm(); },
  'ci-fav': function () { pending.saveFav = !pending.saveFav; renderConfirm(); },
  'ci-confirm': function (b) { commitPending(b); },
  region: function (b) { regionSheet(b.dataset.m); },
  'body-save': function () {
    var it = { kind: 'body' }, any = false;
    ['weight', 'bf', 'waist', 'chest', 'shoulders', 'arms'].forEach(function (f) { var v = $('#b-' + f).value; if (v !== '') { it[f] = parseFloat(v); any = true; } });
    if (!any) { toast('Enter at least one value.', { bad: true }); return; }
    var errs = R.checkItem(it); if (errs.length) { toast(errs[0], { bad: true }); return; }
    var j = it.weight != null ? weighJump(today(), it.weight) : null;
    if (j) confirmBox('Is ' + n1(it.weight) + 'kg right?', jumpText(it.weight, j) + ' A mistyped weigh-in throws off your average, awards and level.', 'Yes, save it', function () { quickLog([it], 'Body logged.'); }); else quickLog([it], 'Body logged.');
  },
  stat: function (b) { statSheet(b.dataset.id); },
  ladder: function (b) { var s = b.dataset.series; openLadders[s] = !openLadders[s]; render(); },
  buy: function (b) {
    var r = S.shop.rewards.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!r) return;
    confirmBox('Claim reward?', '“' + r.name + '” for ' + r.cost + ' gold.', 'Claim', function () {
      if (!R.canBuy(S, today(), r.cost)) { toast('Not enough gold.', { bad: true }); return; }
      S.shop.purchases.push({ id: R.uid(), name: r.name, cost: r.cost, t: Date.now() }); persist(); render(); beep('win'); vib([80, 40, 80]); confetti(40); toast('Reward claimed: ' + r.name + '. Enjoy it.', { icon: '🎁' });
    });
  },
  'reward-add': function () { var nm = $('#rw-name').value.trim(), c = parseInt($('#rw-cost').value, 10); if (!nm || !isFinite(c) || c < 1) { toast('Add a name and a gold cost.', { bad: true }); return; } S.shop.rewards.push({ id: R.uid(), name: nm.slice(0, 60), cost: c }); persist(); shopSheet(); toast('Reward added.'); },
  'reward-del': function (b) { S.shop.rewards = S.shop.rewards.filter(function (x) { return x.id !== b.dataset.id; }); persist(); shopSheet(); },
  'conn-save': function () { conn.url = $('#c-url').value.trim(); conn.key = $('#c-key').value.trim(); saveConn(); cloudState = ''; retryMs = 5000; render(); paintSync(); toast('Connection saved.'); syncCheck(false); },
  'conn-test': function () { testConnection(); },
  toggle: function (b) { var key = b.dataset.key; S.settings[key] = key === 'snow' ? S.settings.snow === false : !S.settings[key]; b.setAttribute('aria-checked', S.settings[key]); if (key === 'cloud') { persist(true); cloudState = ''; paintSync(); if (S.settings.cloud) syncCheck(true); return; } persist(); if (key === 'snow' || key === 'glass') { applyTheme(); snowCtl(); } },
  motion: function (b) { S.settings.motion = S.settings.motion === 'reduced' ? 'auto' : 'reduced'; b.setAttribute('aria-checked', S.settings.motion === 'reduced'); persist(); render(); },
  'cloud-push': function () { closeLayer(); if (stopped()) cloudState = ''; syncCheck(true); },
  export: function () { exportFile(); },
  reset: function () { resetFlow(); },
  diag: function () { runDiagnostics(); }
};
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]'); if (!b) return;
  if (b.disabled) return;
  var fn = ACTIONS[b.dataset.act]; if (!fn) return;
  if (b.closest('.cmd-sheet') && ['water', 'gym-done', 'football-done'].indexOf(b.dataset.act) >= 0) closeLayer();
  e.preventDefault();
  try { fn(b, e); } catch (err) { console.error(err); toast('Something went wrong: ' + (err && err.message || err), { bad: true }); }
});
document.addEventListener('input', onConfirmInput);
document.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onConfirmInput(e); });
$('#btn-settings').onclick = function () { closeLayer(); settingsSheet(); };
$('#syncdot').onclick = function () { var i = syncInfo(); if (i.c === 'off') { toast(i.text, { ms: 5000 }); return; } if (stopped()) { toast(i.text, { bad: true, ms: 7000 }); return; } if (i.c === 'ok') toast(i.text); syncCheck(true); };
$('#orb').addEventListener('click', function () { vib(20); openCmd(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#layer').innerHTML && !busy) closeLayer(); });
window.addEventListener('error', function (e) { try { toast('Error: ' + (e.message || 'unknown'), { bad: true }); } catch (x) {} });

/* day rollover + returning to the app */
function tick() { var k = today(); if (k !== lastToday) { lastToday = k; lastQuestDone = null; viewDay = null; housekeeping(); checkEvents(); persist(true); render(); showNotice(); setTimeout(maybeBossIntro, 900); } }
setInterval(tick, 30000);
document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); checkInbox(); syncCheck(false); } else flushSync(); });
window.addEventListener('pagehide', flushSync);
window.addEventListener('online', function () { paintSync(); syncCheck(false); });
window.addEventListener('offline', paintSync);
window.addEventListener('storage', function (e) { if (e.key === R.STORE_KEY && e.newValue) { try { S = R.migrate(JSON.parse(e.newValue)); render(); } catch (err) {} } });

Object.keys(PLAN_ACTIONS).forEach(function (k) { ACTIONS[k] = PLAN_ACTIONS[k]; });
Object.keys(DUEL_ACTIONS).forEach(function (k) { ACTIONS[k] = DUEL_ACTIONS[k]; });
Object.keys(HERO_ACTIONS).forEach(function (k) { ACTIONS[k] = HERO_ACTIONS[k]; });
Object.keys(RESTORE_ACTIONS).forEach(function (k) { ACTIONS[k] = RESTORE_ACTIONS[k]; });
var FOOD_ACTIONS = {
  'pick-food': function (b) { var it = foodCache[b.dataset.key]; if (!it) return; closeLayer(); portionSheet(it); },
  'quick-cmd': function () { var v = $('#cmd-input') && $('#cmd-input').value; if (v && v.trim()) submitText(v); },
  'search-instead': function () { closeLayer(); openCmd(); },
  'manual-code': function (b) { closeLayer(); var it = blankItem('food'); it.code = b.dataset.code || ''; it.saveAsFood = true; openConfirm([it], { source: 'manual', editing: true }); },
  'pf-mode': function (b) { var ps = portionState; if (!ps || ps.mode === b.dataset.mode) return; ps.mode = b.dataset.mode; ps.amount = ps.mode === 'grams' ? (ps.it.serving && ps.it.serving.g ? ps.it.serving.g : 100) : 1; renderPortion(); },
  'pf-step': function (b) { var ps = portionState; if (!ps) return; var st = ps.mode === 'grams' ? 10 : 0.5, v = Math.round((ps.amount + st * (+b.dataset.d)) * 100) / 100; if (v <= 0) return; ps.amount = v; $('#pf-amt').value = v; updatePortionLive(); },
  'pf-set': function (b) { var ps = portionState; if (!ps) return; ps.amount = parseFloat(b.dataset.v); renderPortion(); },
  'pf-log': function () { if (portionState && portionState.recipe) addIngredient(); else logPortion(); },
  'pf-edit': function () { var items = portionItems(); if (!items.length) return; var it = portionState.it; closeLayer(); if (it.source !== 'history' && it.source !== 'meal' && it.source !== 'recipe') R.rememberFood(S, it, Date.now()); openConfirm(items.map(function (x) { return Object.assign({ _id: R.uid() }, x); }), { source: 'manual', editing: true }); },
  'scan-barcode': function () { openScanner(); },
  'bc-type': function () { var v = ($('#bc-type').value || '').replace(/\D/g, ''); if (v.length < 6) { toast('Barcodes are 8–14 digits.', { bad: true }); return; } foundBarcode(v); },
  'my-foods': function () { closeLayer(); myFoodsSheet(); },
  'lib-del': function (b) { var gone = null; S.library = S.library.filter(function (x) { if (x.id === b.dataset.id) { gone = x; return false; } return true; }); persist(); myFoodsSheet(); if (gone) toast('Removed ' + gone.name + '.', { action: 'Undo', onAction: function () { S.library.push(gone); persist(); } }); },
};
Object.keys(FOOD_ACTIONS).forEach(function (k) { ACTIONS[k] = FOOD_ACTIONS[k]; });
var MORE_ACTIONS = {
  'open-cmd': function () { closeLayer(); openCmd(); },
  'add-to-meal': function (b) { closeLayer(); openCmd(b.dataset.meal); },
  'push-on': function () { pushOn(); },
  'push-off': function () { pushOff(); },
  'push-test': function () { pushNote('Sending…'); pushCall('/push/test', {}).then(function (j) { pushNote(j && j.ok ? 'Sent. It should arrive in a few seconds.' : (j && j.error) || 'Couldn’t send.', !(j && j.ok)); }).catch(function () { pushNote('The Worker didn’t answer.', true); }); },
  'remind-toggle': function (b) { var k = b.dataset.key; S.settings.remind[k] = S.settings.remind[k] === false; b.setAttribute('aria-checked', S.settings.remind[k]); persist(); },
  'quick-add': function () { closeLayer(); quickAddSheet(); },
  'qa-save': function () { quickAddSave(); },
  recipes: function () { closeLayer(); recipesSheet(); },
  'rc-new': function () { recipeDraft = { id: '', name: '', portions: 4, items: [] }; closeLayer(); recipeEditor(); },
  'rc-edit': function (b) { var r = (S.recipes || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!r) return; recipeDraft = JSON.parse(JSON.stringify(r)); closeLayer(); recipeEditor(); },
  'rc-log': function (b) { var r = (S.recipes || []).filter(function (x) { return x.id === b.dataset.id; })[0]; if (!r) return; closeLayer(); portionSheet(R.recipeAsItem(r)); },
  'rc-por': function (b) { var po = $('#rc-portions'); if (!po || !recipeDraft) return; var v = Math.min(50, Math.max(0.5, (parseFloat(po.value) || 1) + (+b.dataset.d))); po.value = v; recipeDraft.portions = v; var tt = $('#rc-tot'); if (tt) tt.innerHTML = rcTotHTML(R.recipeTotals(recipeDraft), v); },
  'rc-add-ing': function () { if (!recipeDraft) return; closeLayer(); ingredientSearch(); },
  'rc-pick': function (b) { var it = foodCache[b.dataset.key]; if (!it) return; closeLayer(); portionSheet(it, { recipe: true }); },
  'rc-back': function () { portionState = null; closeLayer(); if (recipeDraft) recipeEditor(); else recipesSheet(); },
  'rc-manual': function () { if (!recipeDraft) return; closeLayer(); ingredientManual(); },
  'rc-man-save': function () {
    var g = function (id) { var e = $('#' + id); return e ? e.value : ''; }, name = g('rm-name').trim(), cal = Math.round(parseFloat(g('rm-cal')));
    if (!name) { toast('Give the ingredient a name.', { bad: true }); return; } if (!(cal >= 0) || cal > 20000) { toast('Type its calories.', { bad: true }); return; }
    recipeDraft.items.push({ name: name.slice(0, 80), qty: g('rm-qty').trim().slice(0, 40), cal: cal, p: Math.max(0, parseFloat(g('rm-p')) || 0), c: Math.max(0, parseFloat(g('rm-c')) || 0), s: 0, f: Math.max(0, parseFloat(g('rm-f')) || 0), fib: 0 });
    closeLayer(); recipeEditor();
  },
  'rc-ing-del': function (b) { if (!recipeDraft) return; recipeDraft.items.splice(+b.dataset.i, 1); closeLayer(); recipeEditor(); },
  'rc-save': function () { recipeSave(); },
  'rc-cancel': function () { recipeDraft = null; closeLayer(); recipesSheet(); },
  'rc-del': function () { var r = recipeDraft; if (!r || !r.id) return; confirmBox('Delete recipe?', '“' + r.name + '” will be removed. Days you already logged it on are not changed.', 'Delete', function () { S.recipes = (S.recipes || []).filter(function (x) { return x.id !== r.id; }); recipeDraft = null; persist(); closeLayer(); recipesSheet(); toast('Recipe deleted.'); }, true); },
  'steps-sheet': function () { closeLayer(); stepsSheet(); },
  'app-update': function () { closeLayer(); updateNow(true); },
  'op-track': function () { closeLayer(); trackerSheet(); },
  'op-bank': function () { closeLayer(); bankSheet(); },
  'op-review': function () { closeLayer(); reviewSheet(); },
  'op-finish': function () { closeLayer(); opFinishSheet(); },
  'op-bowl': function () { closeLayer(); bowlSheet(); },
  'op-treat': function () { closeLayer(); treatSheet(); },
  'op-seg': function (b) { $$('#' + b.dataset.seg + ' button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); vib(10); try { gymBurn(); footBurn(); } catch (e) {} },
  'op-gym-save': function (b) {
    var had = b.dataset.had === '1', lvl = segVal('g-lvl') || 'moderate', walk = +segVal('g-walk') || 0, items = [];
    if (!had) { items.push({ kind: 'activity', type: 'gym', min: 60, lvl: lvl }); opChoice.lvl = lvl; }
    if (walk > 0) items.push({ kind: 'activity', type: 'incline', min: walk });
    if (!items.length) { closeLayer(); return; }
    closeLayer(); quickLog(items, (had ? '' : 'Gym logged (' + lvl + ', ' + R.GYM_LEVELS[lvl] + ' kcal)' + (walk ? ' + ' : '.')) + (walk ? walk + ' min incline walk (' + walk * 7 + ' kcal).' : ''));
  },
  'op-foot-save': function () {
    var m = Math.round(parseFloat($('#f-min').value)), it = segVal('f-int') || 'medium'; if (!(m >= 1 && m <= 300)) { toast('Minutes must be 1–300.', { bad: true }); return; }
    opChoice.int = it; closeLayer(); quickLog([{ kind: 'activity', type: 'football', min: m, int: it }], 'Football: ' + m + ' min, ' + it + ' effort, ' + n0(m / 60 * S.tdee.footballPerHour * R.FOOT_INT[it]) + ' kcal.');
  },
  'op-bowl-log': function () { var meal = S.savedMeals.filter(function (m) { return m.id === 'protein-bowl' || /bowl/i.test(m.name); })[0]; if (!meal) return; closeLayer(); quickLog(R.savedMealItems(meal).map(function (x) { x.meal = 'breakfast'; return x; }), 'Yogurt bowl logged to breakfast.'); },
  'op-bowl-tick': function () { var k = today(), d = S.days[k] || (S.days[k] = R.emptyDay()); d.bowl = true; closeLayer(); afterChange(); toast('Bowl ticked.', { icon: '🥣' }); },
  'op-bowl-undo': function () { var k = today(), d = S.days[k]; if (d) delete d.bowl; closeLayer(); afterChange(); },
  'op-treat-toggle': function (b) { var k = viewDay || today(), f = R.getDay(S, k).foods.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!f) return; if (f.tr) delete f.tr; else f.tr = 1; vib(15); closeLayer(); afterChange(); treatSheet(); },
  qtile: function (b) {
    var id = b.dataset.q, k = today(), type = R.dayType(S, k), d = R.getDay(S, k), q = R.questStatus(S, k).filter(function (x) { return x.id === id; })[0];
    if (id === 'water') quickLog([{ kind: 'water', ml: 250 }], '+250ml water.', b);
    else if (id === 'steps') stepsSheet();
    else if (id === 'bowl') bowlSheet();
    else if (id === 'treat') treatSheet();
    else if (id === 'weigh') weighSheet();
    else if (id === 'training' && opOn(k) && type !== 'rest' && R.opMode(S, k) === 'diet') ACTIONS[type === 'football' ? 'football-done' : 'gym-done'](b);
    else if (id === 'training') { if (type === 'rest') ACTIONS.recover(b); else if (!q.done) ACTIONS[type === 'football' ? 'football-done' : 'gym-done'](b); else toast('Already logged today. Nice.'); }
    else if (id === 'lights') ACTIONS.lights(b);
    else openCmd();
  },
  'scan-add': function () { closeLayer(); addScanSheet(); },
  'scan-manual': function () { closeLayer(); scanForm(blankScan(), {}); },
  'scan-save': function () { saveScan(); },
  'scan-cancel': function () { var id = pendingScan && pendingScan.inboxId; if (id) ackInbox(id); closeLayer(); },
  'scan-history': function () { closeLayer(); scanHistorySheet(); },
  'scan-detail': function (b) { closeLayer(); scanDetailSheet(b.dataset.id); },
  'scan-edit': function (b) { var sc = S.inbody.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!sc) return; closeLayer(); scanForm(R.clone(sc), { banner: 'Saving replaces the scan on this date.' }); },
  'scan-del': function (b) {
    var id = b.dataset.id; confirmBox('Delete this scan?', 'It will be removed from your history and stats.', 'Delete', function () {
      var gone = R.removeScan(S, id); if (!gone) return; afterChange();
      toast('Scan deleted.', { action: 'Undo', onAction: function () { S.inbody.push(gone); S.inbody.sort(function (a, c) { return a.date < c.date ? -1 : 1; }); afterChange(); } });
    }, true);
  },
  'shortcut-guide': function () { closeLayer(); shortcutSheet(); },
  'copy-inbox': function () { var u = apiBase() + '/inbox'; try { navigator.clipboard.writeText(u).then(function () { toast('URL copied.'); }, function () { toast(u); }); } catch (e) { toast(u); } },
  'inbox-check': function () { checkInbox(true); }
};
Object.keys(MORE_ACTIONS).forEach(function (k) { ACTIONS[k] = MORE_ACTIONS[k]; });
ACTIONS.avatar = function () { closeLayer(); avatarSheet(); };
ACTIONS['avatar-remove'] = function () { confirmBox('Remove your profile picture?', 'You can add one again at any time.', 'Remove', function () { S.profile.photo = ''; persist(); closeLayer(); render(); toast('Profile picture removed.'); }); };
ACTIONS.theme = function (b) { var t = b.dataset.theme; if (!R.THEMES.some(function (x) { return x[0] === t; })) return; S.settings.theme = t; persist(); applyTheme(); render(); $$('[data-act="theme"]').forEach(function (x) { x.setAttribute('aria-checked', x.dataset.theme === t ? 'true' : 'false'); }); };
ACTIONS['aura-pick'] = function (b) { auraPick = +b.dataset.n; render(); var st = $('#v-aura .aura-stage'); if (st && st.scrollIntoView) st.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }); };
ACTIONS['aura-burst'] = function () { if (window.Aura) { window.Aura.burst(); vib(15); } };
ACTIONS.tab = function (b) { closeLayer(); setTab(b.dataset.tab); };
document.addEventListener('input', onScanInput);
document.addEventListener('change', onScanInput);

/* tap ripple */
document.addEventListener('pointerdown', function (e) {
  var b = e.target.closest('.btn,.tile,.qchip,.leg,.opt,.statc'); if (!b || calm()) return;
  var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, sp = document.createElement('span');
  sp.className = 'ripple'; sp.style.width = sp.style.height = s + 'px'; sp.style.left = (e.clientX - r.left - s / 2) + 'px'; sp.style.top = (e.clientY - r.top - s / 2) + 'px';
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  b.style.overflow = 'hidden'; b.appendChild(sp); setTimeout(function () { sp.remove(); }, 650);
}, { passive: true });

/* swipe between tabs */
(function () {
  var sx = 0, sy = 0, st = 0, ok = false, app = $('#app');
  app.addEventListener('touchstart', function (e) { var t = e.target; ok = e.touches.length === 1 && !t.closest('input, textarea, select, .scroll-x, .range, .nodes, [data-noswipe]'); if (!ok) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }, { passive: true });
  app.addEventListener('touchend', function (e) {
    if (!ok) return; ok = false; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - st < 600) { var i = TAB_ORDER.indexOf(tab) + (dx < 0 ? 1 : -1); if (i >= 0 && i < TAB_ORDER.length) { vib(12); setTab(TAB_ORDER[i]); } }
  }, { passive: true });
})();

/* ───────────── boot ───────────── */
function boot() {
  if (loaded.status === 'corrupt') setTimeout(function () { toast('The saved data on this device was damaged. The damaged copy was kept. If you have a cloud copy it loads by itself; otherwise import a backup file in Settings.', { bad: true, ms: 10000 }); }, 600);
  if (loaded.status === 'unavailable') setTimeout(function () { toast('This is a preview, or this browser is blocking storage, so nothing you log here is kept. Open Winter Arc from its web address or your Home Screen icon. (On iPhone: Settings → Safari → turn off “Block All Cookies”. On a laptop: leave private browsing.)', { bad: true, ms: 14000 }); }, 600);
  // nothing in here may stop the opening screen from clearing: each step is guarded
  [housekeeping,
    function () { checkEvents(true); }, // sync seen-state silently; don't replay old celebrations on open
    duelsBegin,
    function () { persist(true); paintSync(); },
    function () { if (navigator.storage && navigator.storage.persist) { var pr = navigator.storage.persist(); if (pr && pr.catch) pr.catch(function () {}); } }, // a preview window refuses this: not an error
    function () { var q = R.questStatus(S, today()); lastQuestDone = {}; q.forEach(function (x) { lastQuestDone[x.id] = x.done; }); },
    function () { render(); }
  ].forEach(function (step, i) { try { step(); } catch (e) { reportErr(e, 'opening step ' + (i + 1)); } });
  afterSplash(function () { syncCheck(false); }, 900);
  afterSplash(function () { try { updateNow(false); } catch (e) {} }, 4000); // a quiet look for a newer version, well after the opening // VF: once the opening is over, so it has the phone to itself
  var sp = $('#splash'), gone = false;
  try { var spd = sp && $('.sp-s', sp); if (spd) spd.textContent = (R.fmtDate(S.profile.startDate).slice(4) + ' – ' + R.fmtDate(S.profile.seasonEnd).slice(4)).toUpperCase(); } catch (e) {} // the dates on the opening screen are the arc's real ones
  var imp = null; try { imp = R.parseImportQuery(location.search); } catch (e) {}
  if (imp || /[?&]nosplash/.test(location.search)) { try { history.replaceState(null, '', location.pathname + (/[?&]nosplash/.test(location.search) && !imp ? '?nosplash' : '')); } catch (e) {} }
  var doParam = (/[?&]do=(water|log)/.exec(location.search) || [])[0] || '';
  if (doParam) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  function afterIntro() { if (doParam) setTimeout(function () { notifyOpen(doParam); }, 500); try { showNotice(); } catch (e) { reportErr(e, 'daily notice'); } try { restartNote(); } catch (e) { reportErr(e, 'restart note'); } if (opIntroDue) { opIntroDue = false; setTimeout(opIntro, 700); } else { setTimeout(maybeBossIntro, 900); setTimeout(maybeHeroReveal, 1600); } if (imp) { if (!imp.date) imp.date = today(); setTimeout(function () { scanForm(imp, { banner: 'Body data from your iPhone Shortcut. Check it, then save.' }); }, 300); } setTimeout(function () { checkInbox(); }, 1200); }
  // VF: the character's aura and the puzzle pieces start again only once the opening has faded away, so the fade is smooth
  function hideSplash() { if (gone) return; gone = true; sp.classList.add('out'); setTimeout(function () { sp.remove(); if (window.Aura) window.Aura.pause(false); if (window.Puzzle) window.Puzzle.hold(false); splashDone(); afterIntro(); }, 650); }
  setTimeout(function () { if (window.Aura) window.Aura.pause(false); splashDone(); }, 15000); // a safety net: never wait longer than this
  if (!sp) { gone = true; splashDone(); setTimeout(afterIntro, 200); }
  else if (!S.settings.splash || calm() || /[?&]nosplash/.test(location.search) || imp || doParam) { sp.remove(); gone = true; splashDone(); setTimeout(afterIntro, 200); }
  else {
    // Ascend: the card intro (full on the first three opens on this device, short after that); a tap skips it
    var intro = null;
    if (window.Aura) window.Aura.pause(true); if (window.Puzzle) window.Puzzle.hold(true); // they wait for the opening to finish
    try { if (window.AscendIntro) intro = window.AscendIntro.play(sp, { art: { sae: artSrc('art/x/sae.webp'), natsu: artSrc('art/x/natsu.webp') }, video: ART['art/intro/hevc.mp4'] ? { hevc: ART['art/intro/hevc.mp4'], h264: ART['art/intro/h264.mp4'] } : null, onDone: hideSplash }); } catch (e) { reportErr(e, 'opening'); }
    var skip = function () { if (intro) intro.end(); hideSplash(); };
    sp.addEventListener('click', skip); sp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') skip(); });
    if (!intro) setTimeout(hideSplash, 3200);
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () { var nw = reg.installing; if (!nw) return; nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready.', { action: 'Reload', ms: 15000, onAction: function () { location.reload(); } }); }); });
    }).catch(function () {});
  }
}
var BUILD = (function () { var m = document.querySelector('meta[name=build]'); return (m && m.content) || ''; })();
/* asks the service worker to fetch the page from the server and say whether it is newer than the stored copy */
function askRefresh(ms) {
  return new Promise(function (res) {
    var sw = navigator.serviceWorker;
    if (!sw || !sw.controller) { res(null); return; }
    var ch, done = false;
    var finish = function (v) { if (done) return; done = true; clearTimeout(t); res(v); };
    var t = setTimeout(function () { finish(null); }, ms || 9000);
    try { ch = new MessageChannel(); ch.port1.onmessage = function (ev) { finish(ev.data || null); }; sw.controller.postMessage({ type: 'refresh' }, [ch.port2]); }
    catch (e) { finish(null); }
  });
}
var updBusy = false;
function updateNow(manual) {
  if (updBusy) return; updBusy = true;
  if (manual) toast('Checking for an update…', { ms: 9000 });
  try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (reg) { if (reg) reg.update(); }).catch(function () {}); } catch (e) {}
  askRefresh().then(function (res) {
    updBusy = false;
    // the page on the server is a different build from the one running here (or the stored copy just changed)
    if (res && ((res.build && BUILD && res.build !== BUILD) || (res.changed && !res.build))) {
      if (manual) { toast('Update found. Reloading…', { icon: '⬆️' }); setTimeout(function () { location.reload(); }, 700); }
      else toast('Update ready.', { action: 'Reload', ms: 20000, onAction: function () { location.reload(); } });
      return;
    }
    if (!manual) return;
    if (res && res.ok) toast('You already have the newest version.', { icon: '✓' });
    else if (res && res.offline) toast('Can’t check while you are offline.', { bad: true });
    else { toast('Reloading…'); setTimeout(function () { location.reload(); }, 600); } // no service worker yet: a plain reload is the update
  });
}
window.RTLApp = { build: BUILD, update: function () { updateNow(true); }, get state() { return S; }, builtinCount: function () { return builtin().length; }, loadGeneric: function () { return loadGeneric(); }, precacheArt: function () { precacheArt(); }, luckPop: function () { luckPop(); }, maybeBossIntro: function () { maybeBossIntro(); }, maybeHeroReveal: function () { maybeHeroReveal(); }, syncCheck: syncCheck, syncInfo: syncInfo, runDiagnostics: runDiagnostics, submitText: submitText, setTab: setTab, openCmd: openCmd, checkInbox: checkInbox, render: render, aura: function () { return window.Aura ? window.Aura.debug() : null; }, auraToday: function () { return auraNow(); }, get errors() { return errLog.slice(); } };
/* ───────────── puzzle pieces (Blue Lock): a few drift up all the time, a burst from every tap ───────────── */
/* VF: background work (sync, the food list, fetching pictures) waits until the opening is over */
var splashGone = false, splashWaiters = [];
function afterSplash(fn, ms) { if (splashGone) setTimeout(fn, ms); else splashWaiters.push([fn, ms]); }
function splashDone() { if (splashGone) return; splashGone = true; splashWaiters.splice(0).forEach(function (w) { setTimeout(w[0], w[1]); }); }
function snowCtl() { if (!window.Puzzle) return; window.Puzzle.calm = calm(); window.Puzzle.setAmbient(S.settings.snow !== false && !calm()); }
if (window.Puzzle) window.Puzzle.init(document.getElementById('fx'));
document.addEventListener('pointerdown', function (e) {
  if (calm() || !window.Puzzle) return; var t = e.target.closest && e.target.closest('button,.tile,.exrow,.rowbtn,.sug,[data-act]'); if (!t || t.disabled) return;
  window.Puzzle.burst(e.clientX, e.clientY, 'tap');
}, { passive: true });
snowCtl();
boot();
/* v17: the pictures are separate files. Once the app is open and quiet, fetch any the phone does not have yet, a few at
   a time, so every boss, hero and character is there offline later. Each is fetched once; the service worker keeps it. */
function precacheArt() {
  if (HOSTED || !window.caches || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  // V21: of the two opening videos only the one this phone plays is kept (first, so the next open has it); pictures after it
  var hevc = false; try { hevc = !!document.createElement('video').canPlayType('video/mp4; codecs="hvc1"'); } catch (e) {}
  var skipVid = hevc ? 'art/intro/h264.mp4' : 'art/intro/hevc.mp4';
  var urls = Object.keys(ART).filter(function (k) { return k !== skipVid; }).sort(function (a, b) { return (b.indexOf('art/intro/') === 0) - (a.indexOf('art/intro/') === 0); })
    .map(function (k) { return ART[k]; }).filter(function (u) { return /^art\//.test(u); }).map(function (u) { return new URL(u, location.href).href; });
  caches.open('rtl-art-3').then(function (c) { return c.keys(); }).then(function (ks) {
    var have = {}; ks.forEach(function (r) { have[r.url] = 1; });
    var todo = urls.filter(function (u) { return !have[u]; }), i = 0;
    (function next() { if (i >= todo.length || document.hidden) return; var batch = todo.slice(i, i + 4); i += 4; Promise.all(batch.map(function (u) { return fetch(u).catch(function () {}); })).then(function () { setTimeout(next, 200); }); })();
  }).catch(function () {});
}
afterSplash(precacheArt, 6000);
afterSplash(loadGeneric, 2500); // the built-in food list, fetched once in the background and then kept offline
})();
