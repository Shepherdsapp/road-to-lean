/* Ascend opening: two playing cards. Sae Itoshi (pink aura) flips in first, then Natsu (fire), then Natsu's flames burst
   into the Rank-up icon and ASCEND. VF: the full version plays every time the app opens; a tap skips it.
   Smooth on a phone: everything that moves is a transform or opacity (the graphics chip does it); the light rays are drawn
   once and only turned; every glow that brightens is a ready-drawn layer that fades in; the sparks are stamped from
   ready-made sprites; the scenes change on the screen's own frame clock; both pictures are decoded before they show. */
(function () {
  'use strict';
  var KEY = 'ascend-intro-opens';
  var SUIT = {
    sae: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 20 12l-8 10.5L4 12Z" fill="currentColor"/><path d="M12 6.5 16 12l-4 5.5L8 12Z" fill="#fff" opacity=".55"/></svg>',
    natsu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 23c-4.6 0-7.8-3.1-7.8-7.4 0-3.8 2.7-5.8 3.8-9.2.9 2 2.1 3.1 3.5 3.5.1-3.2 1.6-6 4.3-8.1-.3 3.6 4.7 6.8 4.7 13.2C20.5 19.6 16.9 23 12 23Z" fill="currentColor"/><path d="M12 23c-2 0-3.4-1.4-3.4-3.3 0-1.8 1.3-2.7 2-4.2.6.8 1.4 1.3 2.1 1.4.1-1.4.7-2.5 1.9-3.6.1 1.7 1.8 2.9 1.8 5.9 0 2.3-1.7 3.8-4.4 3.8Z" fill="#fff" opacity=".6"/></svg>'
  };
  var CARDS = {
    sae: { rank: '10', name: 'SAE ITOSHI', sub: 'THE PRODIGY' },
    natsu: { rank: 'A', name: 'NATSU', sub: 'FIRE DRAGON SLAYER' }
  };
  var BACK = '<svg class="ic-emb" viewBox="0 0 512 512" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"><path d="M146 392 256 312 366 392" stroke="#E2261C"/><path d="M146 296 256 216 366 296" stroke="#FF7A1A"/><path d="M146 200 256 120 366 200" stroke="#FFE08A"/></g></svg>';

  function card(id, src) {
    var c = CARDS[id], corner = '<div class="ic-idx"><b>' + c.rank + '</b>' + SUIT[id] + '</div>';
    return '<div class="ic ic-' + id + '"><div class="ic-in"><div class="ic-glow"></div>' +
      '<div class="ic-f ic-back"><div class="ic-pat"></div>' + BACK + '</div>' +
      '<div class="ic-f ic-front"><img alt="" decoding="async" src="' + src + '"><div class="ic-tint"></div><div class="ic-frame"></div>' +
      corner + corner.replace('ic-idx', 'ic-idx ic-idx2') +
      '<div class="ic-plate"><span>' + c.name + '</span><small>' + c.sub + '</small></div><div class="ic-foil"></div></div>' +
      '</div></div>';
  }
  /* the light rays, drawn once onto a canvas (19 soft rays fading out from the middle); the page only turns it */
  function rays(cv, rgb) {
    if (!cv) return; var g = cv.getContext('2d'), S = cv.width, c = S / 2, n = 19, step = Math.PI * 2 / n;
    g.clearRect(0, 0, S, S);
    for (var i = 0; i < n; i++) {
      var a0 = i * step + step * 5 / 19, a1 = i * step + step * 12 / 19, am = i * step + step * 8 / 19;
      for (var k = 0; k < 6; k++) { // a ray: brightest along its middle, soft at both edges
        var f = k / 6, w0 = am - (am - a0) * (1 - f), w1 = am + (a1 - am) * (1 - f);
        g.fillStyle = 'rgba(' + rgb + ',.085)'; g.beginPath(); g.moveTo(c, c); g.arc(c, c, c, w0, w1); g.closePath(); g.fill();
      }
    }
    g.globalCompositeOperation = 'destination-in'; var fade = g.createRadialGradient(c, c, 0, c, c, c);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.12, 'rgba(0,0,0,1)'); fade.addColorStop(0.40, 'rgba(0,0,0,.6)'); fade.addColorStop(0.92, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
  }
  /* a soft glow drawn onto a small canvas the size of the screen × scale. Each spot: centre (x, y) and, for an oval, its
     radii (rx, ry) as parts of the width and height; a round spot reaches the farthest corner, like CSS radial-gradient */
  function glow(el, scale, spots) {
    if (!el) return; var cv = el.tagName === 'CANVAS' ? el : el.appendChild(document.createElement('canvas'));
    var W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight), w = Math.round(W * scale), h = Math.round(H * scale);
    cv.width = w; cv.height = h; var g = cv.getContext('2d');
    spots.forEach(function (sp) {
      var cx = sp.x * w, cy = sp.y * h, rx, ry;
      if (sp.rx) { rx = sp.rx * w; ry = sp.ry * h; } else { var dx = Math.max(cx, w - cx), dy = Math.max(cy, h - cy); rx = ry = Math.sqrt(dx * dx + dy * dy); }
      g.save(); g.setTransform(rx, 0, 0, ry, cx, cy); var gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      sp.st.forEach(function (x) { gr.addColorStop(x[0], 'rgba(' + x[1] + ')'); });
      g.fillStyle = gr; g.fillRect(-cx / rx, -cy / ry, w / rx, h / ry); g.restore();
    });
  }
  function opens() { try { return +localStorage.getItem(KEY) || 0; } catch (e) { return 0; } }
  function count() { try { localStorage.setItem(KEY, String(opens() + 1)); } catch (e) {} }

  /* ─── sparks, embers and bursts: one canvas, drawn additively ─── */
  function Fx(cv) {
    var ctx = cv.getContext('2d'), P = [], dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, raf = 0, emit = [], last = 0, on = true;
    function size() { W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    var PAL = { sae: ['255,64,200', '255,120,230', '255,200,250', '200,60,255'], fire: ['255,90,20', '255,150,40', '255,220,120', '230,40,20'], gold: ['255,226,140', '255,170,60', '255,255,230'] };
    // one soft glowing dot per colour, drawn once; every spark after that is a quick stamp of it
    var SPR = {};
    function sprite(c) {
      if (SPR[c]) return SPR[c];
      var s = document.createElement('canvas'); s.width = s.height = 64; var g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + c + ',1)'); gr.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return (SPR[c] = s);
    }
    Object.keys(PAL).forEach(function (k) { PAL[k].forEach(sprite); });
    function add(x, y, vx, vy, life, r, col, kind) { if (P.length > 420) return; P.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, r: r, c: col, k: kind || 0, w: Math.random() * 6.28 }); }
    function pick(p) { var a = PAL[p]; return a[(Math.random() * a.length) | 0]; }
    var ticks = [];
    function frame(t) {
      if (!on) return; raf = requestAnimationFrame(frame);
      for (var q = 0; q < ticks.length; q++) ticks[q](t);
      var dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
      if (Math.abs(cv.clientWidth - W) > 1) size();
      emit.forEach(function (e) {
        var n = e.rate * dt; e.acc = (e.acc || 0) + n;
        while (e.acc >= 1) {
          e.acc--; var cx = W / 2, cy = H * 0.46, hw = e.w / 2, hh = e.h / 2, side = Math.random();
          var x = cx + (side < 0.5 ? (Math.random() * 2 - 1) * hw : (side < 0.75 ? -hw : hw) + (Math.random() - 0.5) * 16), y = side < 0.5 ? cy + hh * (0.2 + Math.random() * 0.8) : cy + (Math.random() * 2 - 1) * hh;
          if (e.kind === 'fire') add(x, y, (Math.random() - 0.5) * 40, -120 - Math.random() * 200, 0.7 + Math.random() * 0.8, 3 + Math.random() * 9, pick('fire'), 1);
          else if (Math.random() < 0.4) add(x, y, (Math.random() - 0.5) * 50, -100 - Math.random() * 170, 0.6 + Math.random() * 0.7, 3 + Math.random() * 7, pick('sae'), 1);
          else add(x, y, (Math.random() - 0.5) * 60, -70 - Math.random() * 150, 0.8 + Math.random() * 0.9, 1.5 + Math.random() * 4, pick('sae'), 2);
        }
      });
      ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
      for (var i = P.length - 1; i >= 0; i--) {
        var p = P[i]; p.life -= dt; if (p.life <= 0) { P.splice(i, 1); continue; }
        var k = p.life / p.max; p.w += dt * 6;
        p.x += (p.vx + Math.sin(p.w) * (p.k === 1 ? 26 : 14)) * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= p.k === 3 ? 0.94 : 0.995;
        var r = p.r * (p.k === 1 ? (0.4 + k * 0.9) : (0.5 + k * 0.5));
        ctx.globalAlpha = Math.min(1, k * 1.6);
        if (p.k === 1 || p.k === 3) { var R2 = r * 2.4; ctx.drawImage(sprite(p.c), p.x - R2, p.y - R2, R2 * 2, R2 * 2); }
        else { ctx.fillStyle = 'rgba(' + p.c + ',1)'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill(); if (p.k === 2 && k > 0.5) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.45, 0, 6.283); ctx.fill(); } }
      }
      ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(frame);
    return {
      aura: function (kind, w, h, rate) { emit = [{ kind: kind, w: w, h: h, rate: rate }]; },
      stop: function () { emit = []; },
      burst: function (pal, n, speed) {
        var cx = W / 2, cy = H * 0.46;
        for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = speed * (0.35 + Math.random() * 0.9); add(cx, cy, Math.cos(a) * s, Math.sin(a) * s, 0.45 + Math.random() * 0.7, pal === 'fire' ? 1.5 + Math.random() * 3.5 : 1.5 + Math.random() * 3.5, pick(pal), pal === 'fire' && i % 3 === 0 ? 3 : 2); }
      },
      onFrame: function (f) { ticks.push(f); },
      end: function () { on = false; cancelAnimationFrame(raf); P = []; }
    };
  }

  /* play(splash, { art: {sae, natsu}, onDone, short }) → { skip(), end() } */
  function live(sp, o, counted) {
    o = o || {};
    var full = o.short !== true; if (!counted) count(); // VF: the full intro every time (the short one only if asked for)
    var art = o.art || {};
    // the stage: a nebula of both colours, the canvas, two cards, aura rays, shock rings and a flash
    var z = document.createElement('div'); z.className = 'iz'; z.setAttribute('aria-hidden', 'true');
    z.innerHTML = '<div class="iz-neb"><i></i><i></i><i></i></div><canvas class="iz-rays" width="1024" height="1024"></canvas><canvas class="iz-rays iz-rays2" width="1024" height="1024"></canvas><canvas class="iz-rays iz-rays3" width="1024" height="1024"></canvas>' +
      '<canvas class="iz-fx"></canvas><div class="iz-stage">' + card('sae', art.sae || '') + card('natsu', art.natsu || '') + '</div>' +
      '<div class="zr rp1"></div><div class="zr rp2"></div><div class="zr ro1"></div><div class="zr ro2"></div><div class="zr rg1"></div><div class="zr rg2"></div>' +
      '<div class="iz-flash"><canvas class="fl fl-a"></canvas><canvas class="fl fl-i"></canvas><canvas class="fl fl-r"></canvas><canvas class="fl fl-d"></canvas></div>';
    sp.insertBefore(z, sp.firstChild);
    [['', '255,70,210'], ['2', '255,120,30'], ['3', '255,200,90']].forEach(function (r) { try { rays(z.querySelector('.iz-rays' + (r[0] ? '.iz-rays' + r[0] : ':not(.iz-rays2):not(.iz-rays3)')), r[1]); } catch (e) {} });
    // the soft glows (the nebula behind, and the four flashes) are drawn once at the start onto small canvases, which the
    // page only fades: a smooth gradient looks exactly the same drawn small and stretched, and nothing is redrawn mid-scene
    try {
      var nb = z.querySelectorAll('.iz-neb i');
      glow(nb[0], 0.5, [{ x: .26, y: .30, rx: .55, ry: .40, st: [[0, '255,50,190,.55'], [.7, '255,50,190,0']] }]);
      glow(nb[1], 0.5, [{ x: .76, y: .70, rx: .60, ry: .45, st: [[0, '255,96,20,.55'], [.7, '255,96,20,0']] }]);
      glow(nb[2], 0.5, [{ x: .50, y: .46, rx: .45, ry: .30, st: [[0, '150,40,255,.35'], [.7, '150,40,255,0']] }]);
      glow(z.querySelector('.fl-a'), 0.6, [{ x: .5, y: .46, st: [[0, '255,255,255,1'], [.18, '255,180,240,.9'], [.40, '255,60,200,.5'], [.75, '255,60,200,0']] }]);
      glow(z.querySelector('.fl-i'), 0.6, [{ x: .5, y: .46, st: [[0, '255,230,160,.9'], [.30, '255,110,30,.6'], [.55, '200,30,10,.35'], [.80, '200,30,10,0']] }]);
      glow(z.querySelector('.fl-r'), 0.6, [{ x: .5, y: .46, st: [[0, '255,255,255,1'], [.20, '255,230,160,.95'], [.42, '255,110,30,.6'], [.78, '255,110,30,0']] }]);
      glow(z.querySelector('.fl-d'), 0.6, [{ x: .3, y: .46, st: [[0, '255,80,210,.6'], [.45, '255,80,210,0']] }, { x: .7, y: .46, st: [[0, '255,120,30,.6'], [.45, '255,120,30,0']] }]);
    } catch (e) {}
    // decode both pictures now, so a card never stalls the moment it turns face up
    var decoded = false, tStart = performance.now();
    [].forEach.call(z.querySelectorAll('.ic-front img'), function (im, i) {
      var d = im.decode ? im.decode() : Promise.resolve(); if (i === 0) d.then(function () { decoded = true; }, function () { decoded = true; });
    });
    // the dark stage shows at once; the first card only flies in once its picture is ready and the app has finished
    // starting up behind it (three calm frames in a row), so its very first frames are not lost to that work
    sp.classList.add('intro');
    var fx = null, timers = [], done = false, started = false, t0 = 0, due = [];
    function at(ms, f) { due.push({ ms: ms, f: f, ran: false }); }
    function run(job) { if (job.ran || done) return; job.ran = true; try { job.f(); } catch (e) {} }
    function start() {
      if (started || done) return; started = true; sp.classList.add(full ? 'full' : 'short'); t0 = performance.now();
      try { fx = Fx(z.querySelector('.iz-fx')); } catch (e) {}
      // the scenes change on the screen's frame clock (a timer can fire mid-frame); a timer backs it up if frames stop
      if (fx) fx.onFrame(function (t) { var el = t - t0; for (var i = 0; i < due.length; i++) if (!due[i].ran && el >= due[i].ms) run(due[i]); });
      due.forEach(function (job) { timers.push(setTimeout(function () { run(job); }, job.ms + 120)); });
      timers.push(setTimeout(finish, total));
    }
    var lastF = 0, calmF = 0;
    function gate(t) {
      if (started || done) return;
      if (lastF) calmF = t - lastF < 24 ? calmF + 1 : 0; lastF = t;
      if ((decoded && calmF >= 3) || performance.now() - tStart > 900) start(); else requestAnimationFrame(gate);
    }
    requestAnimationFrame(gate);
    timers.push(setTimeout(start, 1000)); // never wait longer, even if frames are not running
    function ph(c) { sp.classList.add(c); }
    function cw() { var c = z.querySelector('.ic'); return c ? c.getBoundingClientRect() : { width: 260, height: 364 }; }
    var total;
    if (full) {
      at(1150, function () { ph('p-sae'); var r = cw(); if (fx) { fx.burst('sae', 70, 420); fx.aura('sae', r.width, r.height, 120); } });
      at(2650, function () { ph('p-swap'); if (fx) { fx.burst('sae', 120, 700); fx.stop(); } });
      at(3650, function () { ph('p-natsu'); var r = cw(); if (fx) { fx.burst('fire', 60, 480); fx.aura('fire', r.width, r.height, 70); } });
      at(5000, function () { ph('p-ignite'); if (fx) fx.aura('fire', cw().width * 1.3, cw().height * 1.3, 160); });
      at(5450, function () { ph('p-reveal'); if (fx) { fx.stop(); fx.burst('fire', 150, 820); fx.burst('gold', 60, 520); } });
      total = 8100;
    } else {
      at(650, function () { ph('p-dual'); if (fx) { fx.burst('sae', 45, 420); fx.burst('fire', 45, 420); } });
      at(1450, function () { ph('p-reveal'); if (fx) { fx.burst('fire', 90, 700); fx.burst('gold', 30, 420); } });
      total = 3400;
    }
    function finish() { if (done) return; done = true; timers.forEach(clearTimeout); if (fx) fx.end(); if (o.onDone) o.onDone(); }
    return { full: full, total: total, skip: finish, end: function () { done = true; timers.forEach(clearTimeout); if (fx) fx.end(); } };
  }
  // fetch both pictures now, so the cards have them by the time they flip face up
  function preload(art) { ['sae', 'natsu'].forEach(function (k) { if (art && art[k]) { var i = new Image(); i.decoding = 'async'; i.src = art[k]; } }); }
  /* V21: the opening as a video. It is the live opening recorded frame by frame at the iPhone's full resolution, so it
     looks the same, and the phone's video chip plays it, so it is smooth every time. If the video cannot play (Low Power
     Mode stops videos playing by themselves, or it has not downloaded yet on the first open after an update) the live
     opening runs instead, and the video is kept for next time. */
  function pickVideo(v) {
    if (!v || window.__noVideo || typeof fetch !== 'function' || !window.URL || !URL.createObjectURL) return '';
    var t = document.createElement('video'); if (!t.canPlayType) return '';
    if (v.hevc && t.canPlayType('video/mp4; codecs="hvc1"')) return v.hevc;
    if (v.h264 && t.canPlayType('video/mp4; codecs="avc1.640033"')) return v.h264;
    return '';
  }
  function play(sp, o) {
    o = o || {};
    var src = o.short === true ? '' : pickVideo(o.video);
    if (!src) return live(sp, o);
    count(); sp.classList.add('intro', 'full', 'vid');
    var v = document.createElement('video'), done = false, lv = null, url = '', started = false;
    v.className = 'iz iz-vid'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true;
    ['muted', 'playsinline', 'webkit-playsinline', 'aria-hidden'].forEach(function (a) { v.setAttribute(a, a === 'aria-hidden' ? 'true' : ''); });
    sp.insertBefore(v, sp.firstChild);
    function clear() { try { v.pause(); } catch (e) {} if (v.parentNode) v.parentNode.removeChild(v); if (url) { try { URL.revokeObjectURL(url); } catch (e) {} url = ''; } }
    function fallback() { if (done || lv || started) return; clearTimeout(giveUp); clear(); sp.classList.remove('vid', 'full'); lv = live(sp, o, true); }
    function finish() { if (done) return; done = true; clearTimeout(giveUp); if (o.onDone) o.onDone(); }
    var giveUp = setTimeout(fallback, 1500); // not playing within 1.5s: the live opening this time
    v.addEventListener('playing', function () { if (done || lv) { clear(); return; } if (!started) setTimeout(finish, 10000); started = true; clearTimeout(giveUp); sp.classList.add('vplay'); });
    v.addEventListener('ended', finish);
    // first from the copy kept on the phone (works offline); if the phone will not play that, straight from its address
    var direct = false;
    function go(u) { v.src = u; var p = v.play(); if (p && p.catch) p.catch(function (e) { if (e && e.name === 'NotAllowedError') fallback(); else retry(); }); }
    function retry() { if (started || done || lv) return; if (!direct) { direct = true; go(src); } else fallback(); }
    v.addEventListener('error', function () { if (started) finish(); else retry(); });
    fetch(src).then(function (r) { if (!r.ok) throw new Error('video ' + r.status); return r.blob(); }).then(function (b) {
      if (done || lv) return; url = URL.createObjectURL(b); go(url);
      setTimeout(function () { if (!started && !(v.currentTime > 0)) retry(); }, 700); // the stored copy is not starting: try the address
    }).catch(retry);
    return {
      full: true, total: 8100, video: true, skip: function () { if (lv) lv.skip(); else finish(); },
      end: function () { done = true; clearTimeout(giveUp); if (lv) lv.end(); try { v.pause(); } catch (e) {} },
      get live() { return !!lv; }
    };
  }
  window.AscendIntro = { play: play, live: live, preload: preload, opens: opens, KEY: KEY };
})();
