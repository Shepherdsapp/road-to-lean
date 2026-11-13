/* ═══════════════════════════════════════════════════════════════════════════
   WINTER ARC · puzzle.js
   Glowing 3D puzzle pieces, after the Blue Lock art (each has depth, a bevelled face, turns over as it flies and
   shimmers through three tints of the theme colour): a few drift up through the app all the time (Settings → Look →
   Puzzle pieces), a handful burst from your finger on every tap, a stream bursts out when you finish something, and
   gold ones pour out for a level-up. One canvas over the app (taps go straight through it), drawn as fast as the
   screen refreshes (up to 120 times a second on a ProMotion screen) and at the phone's own sharpness. Each piece is a
   picture drawn once and then only moved, so hundreds cost almost nothing. It stops completely when there is nothing
   to draw, when the app is in the background, and with reduced motion.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';
var P = { on: false, calm: false, color: '143,219,255', light: false }, cv = null, g = null, W = 0, H = 0, dpr = 1, parts = [], raf = 0, last = 0, ambient = 0, held = false, seeded = false, prev = [];
var sprites = {}; // colour key → [4 shapes]

/* a jigsaw piece in a 100×100 box, with a knob out (1), a hole in (-1) or a flat side (0) on each edge */
function pieceDraw(c, e) {
  var L = 20, R = 80, T = 20, B = 80;
  function edge(x0, y0, x1, y1, k) {
    if (!k) { c.lineTo(x1, y1); return; }
    var dx = x1 - x0, dy = y1 - y0, nx = dy / 60 * k, ny = -dx / 60 * k; // outward normal (for clockwise drawing)
    function p(t, n) { return [x0 + dx * t + nx * n, y0 + dy * t + ny * n]; }
    var a = p(0.36, 0), b = p(0.40, 9), cc = p(0.30, 19), d = p(0.5, 20), ee = p(0.70, 19), f = p(0.60, 9), h = p(0.64, 0);
    c.lineTo(a[0], a[1]);
    c.bezierCurveTo(a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2, b[0], b[1], (b[0] + cc[0]) / 2, (b[1] + cc[1]) / 2);
    c.bezierCurveTo(cc[0], cc[1], d[0] - dx * 0.1, d[1] - dy * 0.1, d[0], d[1]);
    c.bezierCurveTo(d[0] + dx * 0.1, d[1] + dy * 0.1, ee[0], ee[1], (ee[0] + f[0]) / 2, (ee[1] + f[1]) / 2);
    c.bezierCurveTo(f[0], f[1], h[0] + (f[0] - h[0]) * 0.2, h[1] + (f[1] - h[1]) * 0.2, h[0], h[1]);
    c.lineTo(x1, y1);
  }
  c.beginPath(); c.moveTo(L, T);
  edge(L, T, R, T, e[0]); edge(R, T, R, B, e[1]); edge(R, B, L, B, e[2]); edge(L, B, L, T, e[3]);
  c.closePath();
}
var SHAPES = [[1, -1, 1, -1], [-1, 1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]];
var SP = 112; // sprite size in device pixels (drawn smaller)
/* colour helpers: the shimmer shifts the piece's own colour round the colour wheel as it turns */
function hsl(rgb) { var c = rgb.split(',').map(function (v) { return +v / 255; }), mx = Math.max.apply(0, c), mn = Math.min.apply(0, c), l = (mx + mn) / 2, d = mx - mn, h = 0, s2 = 0;
  if (d) { s2 = d / (1 - Math.abs(2 * l - 1)); h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; h *= 60; } return [(h + 360) % 360, s2, l]; }
function rgbOf(h, s2, l) { var C = (1 - Math.abs(2 * l - 1)) * s2, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2, r = [0, 0, 0], i = Math.floor(h / 60) % 6;
  r = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][i]; return r.map(function (v) { return Math.round((v + m) * 255); }).join(','); }
/* one piece, drawn as a solid tile with depth: a darker side wall below it, a bevelled face lit from the top left, a
   bright rim and a specular glint. "back" is the face seen from behind as the piece tumbles. */
function drawPiece(c, e, face, deep, glow, gold, back) {
  c.save(); c.translate(SP / 2, SP / 2); c.scale(SP / 156, SP / 156); c.translate(-50, -50);
  // the glow behind, then the thickness
  pieceDraw(c, e); c.shadowColor = glow; c.shadowBlur = gold ? 24 : 30; c.fillStyle = 'rgba(' + deep + ',.9)'; c.fill(); c.shadowBlur = 0;
  c.save(); c.translate(0, 5.5); pieceDraw(c, e); c.fillStyle = 'rgba(' + deep + ',1)'; c.fill(); c.restore();
  // the face
  pieceDraw(c, e);
  var g1 = c.createLinearGradient(18, 12, 82, 92);
  if (back) { g1.addColorStop(0, 'rgba(' + face + ',.55)'); g1.addColorStop(1, 'rgba(' + deep + ',.95)'); }
  else { g1.addColorStop(0, 'rgba(255,255,255,1)'); g1.addColorStop(0.3, 'rgba(' + face + ',1)'); g1.addColorStop(0.85, 'rgba(' + face + ',.92)'); g1.addColorStop(1, 'rgba(' + deep + ',.9)'); }
  c.fillStyle = g1; c.fill();
  // bevel: a light edge top-left and a dark edge bottom-right, inside the outline
  c.save(); pieceDraw(c, e); c.clip();
  c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,' + (back ? .25 : .55) + ')'; c.save(); c.translate(2.2, 2.2); pieceDraw(c, e); c.stroke(); c.restore();
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.save(); c.translate(-2.2, -2.2); pieceDraw(c, e); c.stroke(); c.restore();
  if (!back) { var gl = c.createRadialGradient(36, 32, 1, 36, 32, 22); gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(0, 0, 100, 100); }
  c.restore();
  pieceDraw(c, e); c.lineWidth = 1.6; c.strokeStyle = gold ? 'rgba(255,248,214,.95)' : 'rgba(255,255,255,.85)'; c.stroke();
  c.restore();
}
function makeSprites(rgb, gold) {
  var key = gold ? 'gold' : rgb; if (sprites[key]) return sprites[key];
  var H0 = gold ? null : hsl(rgb), tints = gold ? ['255,214,94', '255,232,150', '232,170,40'] : [rgb, rgbOf((H0[0] + 40) % 360, Math.max(0.55, H0[1]), Math.min(0.7, Math.max(0.5, H0[2]))), rgbOf((H0[0] + 320) % 360, Math.max(0.55, H0[1]), Math.min(0.72, Math.max(0.52, H0[2])))];
  var deep = gold ? '120,74,6' : rgbOf(H0[0], Math.max(0.5, H0[1]), 0.22), glow = gold ? 'rgba(255,200,80,.9)' : 'rgba(' + rgb + ',.95)';
  function mk(e, t, back) { var s = document.createElement('canvas'); s.width = s.height = SP; drawPiece(s.getContext('2d'), e, t, deep, glow, gold, back); return s; }
  var list = SHAPES.map(function (e) { return { front: tints.map(function (t) { return mk(e, t, false); }), back: mk(e, tints[0], true) }; });
  sprites[key] = list; return list;
}

function size() { if (!cv) return; prev = [[0, 0, Math.max(root.innerWidth, root.innerHeight) + 10]]; dpr = Math.min(root.devicePixelRatio || 1, 2); W = root.innerWidth; H = root.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function add(p) { if (parts.length > 420) { var o = parts.shift(); if (o.kind === 'amb') ambient--; } parts.push(p); kick(); }
function mkAmbient(fresh) {
  return { kind: 'amb', x: rnd(0, W), y: fresh ? rnd(0, H) : H + rnd(10, 40), vx: rnd(-6, 6), vy: rnd(-34, -14), rot: rnd(0, 6.28), vr: rnd(-0.6, 0.6), s: rnd(12, 24), t: fresh ? rnd(0, 6) : 0, life: rnd(10, 16), a: rnd(0.4, 0.75), sh: (Math.random() * 4) | 0, sw: rnd(0, 6.28), ry: rnd(0, 6.28), vry: rnd(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1), gold: false };
}
function wantAmbient() { return P.on && !P.calm && !held && !document.hidden; }
function kick() { if (!raf && cv && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
function frame(ms) {
  raf = 0; var dt = last ? Math.min(0.05, (ms - last) / 1000) : 0.016; last = ms;
  // keep the gentle drift topped up
  var want = wantAmbient() ? Math.round(Math.min(12, Math.max(6, W * H / 40000))) : 0; // a few, never a crowd
  if (want && !seeded) { seeded = true; while (ambient < want) { add(mkAmbient(true)); ambient++; } } // first time on: spread across the screen
  if (!want) seeded = false;
  if (ambient < want && Math.random() < dt * 3) { add(mkAmbient(false)); ambient++; }
  // only the spots where pieces were last frame are wiped, not the whole screen (a few small squares instead of a
  // full-screen clear every frame keeps it light even at 120 frames a second)
  if (prev.length > 90) g.clearRect(0, 0, W, H); else for (var q = 0; q < prev.length; q++) g.clearRect(prev[q][0], prev[q][1], prev[q][2], prev[q][2]);
  prev = [];
  var sp = makeSprites(P.color), gp = null, live = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i]; p.t += dt;
    if (p.kind === 'amb') {
      if (!wantAmbient()) p.life = Math.min(p.life, p.t + 0.6); // fade out quickly when switched off or behind a sheet
      p.sw += dt * 0.8; p.x += (p.vx + Math.sin(p.sw) * 8) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    } else {
      var drag = Math.pow(p.drag, dt * 60); p.vx *= drag; p.vy = p.vy * drag + p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    var k = p.t / p.life; if (k >= 1 || p.y < -40 || p.x < -60 || p.x > W + 60) { if (p.kind === 'amb') ambient--; continue; }
    live.push(p);
    var fade = p.kind === 'amb' ? Math.min(1, p.t / 1.2, (p.life - p.t) / 1.6) : (k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 1.6));
    // the piece turns over in 3D as it flies: its width follows the turn, the back shows when it faces away, and its
    // colour shimmers through three tints as it catches the light
    p.ry += p.vry * dt; var cy = Math.cos(p.ry), set = (p.gold ? (gp || (gp = makeSprites(null, true))) : sp)[p.sh];
    var tint = ((Math.floor(((p.ry % 6.2832) + 6.2832) % 6.2832 / 2.0944)) % 3), img = cy >= 0 ? set.front[tint] : set.back;
    var s = p.s * (p.kind === 'amb' ? 1 : (0.7 + 0.5 * Math.sin(Math.min(1, k * 3) * 1.57))) * 1.6;
    g.globalAlpha = Math.max(0, Math.min(1, p.a * fade));
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(Math.max(0.14, Math.abs(cy)), 1); g.drawImage(img, -s / 2, -s / 2, s, s); g.restore();
    var rr = Math.ceil(s * 0.78) + 2; prev.push([Math.floor(p.x - rr), Math.floor(p.y - rr), rr * 2]);
  }
  g.globalAlpha = 1; parts = live;
  if (parts.length || want) raf = requestAnimationFrame(frame);
  P.frames = (P.frames || 0) + 1;
}

/* a burst of pieces from a point: tap (small), done (a stream rising out of what you finished), gold (level-up) */
P.burst = function (x, y, kind) {
  if (!cv || P.calm) return; kind = kind || 'tap';
  var n = kind === 'tap' ? 4 : kind === 'done' ? 10 : 18, gold = kind === 'gold';
  for (var i = 0; i < n; i++) {
    var ang = kind === 'tap' ? rnd(0, 6.28) : rnd(-2.6, -0.54), sp = kind === 'tap' ? rnd(90, 210) : rnd(160, 460);
    add({ kind: 'b', x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, grav: kind === 'tap' ? -40 : -120, drag: kind === 'tap' ? 0.9 : 0.94,
      rot: rnd(0, 6.28), vr: rnd(-7, 7), s: kind === 'tap' ? rnd(10, 16) : rnd(14, 28), t: 0, life: kind === 'tap' ? rnd(0.5, 0.8) : rnd(1.0, 1.8), a: 1, sh: (Math.random() * 4) | 0, ry: rnd(0, 6.28), vry: rnd(3, 8) * (Math.random() < 0.5 ? -1 : 1), gold: gold });
  }
};
/* pieces pour up from the bottom of the screen, like the Blue Lock awakening (replaces the old confetti) */
P.shower = function (n, gold) {
  if (!cv || P.calm) return;
  for (var i = 0; i < (n || 40); i++) {
    var x = rnd(0, W), fromMid = Math.random() < 0.5;
    add({ kind: 'b', x: fromMid ? W / 2 + rnd(-40, 40) : x, y: H + rnd(0, 60), vx: fromMid ? rnd(-260, 260) : rnd(-40, 40), vy: rnd(-900, -420), grav: 260, drag: 0.975,
      rot: rnd(0, 6.28), vr: rnd(-5, 5), s: rnd(14, 30), t: -rnd(0, 0.5), life: rnd(1.8, 2.8), a: 1, sh: (Math.random() * 4) | 0, ry: rnd(0, 6.28), vry: rnd(2, 6) * (Math.random() < 0.5 ? -1 : 1), gold: !!gold && Math.random() < 0.85 });
  }
};
P.setAmbient = function (on) { P.on = !!on; kick(); };
P.setColor = function (rgb) { if (rgb && rgb !== P.color) { P.color = rgb; } };
P.hold = function (on) { held = !!on; kick(); };
P.count = function () { return parts.length; };
P.init = function (canvas) {
  cv = canvas; if (!cv || !cv.getContext) { cv = null; return; } g = cv.getContext('2d'); size();
  root.addEventListener('resize', size);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else kick(); });
  kick();
};
root.Puzzle = P;
})(typeof window !== 'undefined' ? window : this);
