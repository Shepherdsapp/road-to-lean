/* ═══════════════════════════════════════════════════════════════════════════
   WINTER ARC — THE SYSTEM · core.js
   Pure logic only. No DOM, no network, no storage side effects.
   Runs in the browser (window.RTL) and in Node (module.exports) for tests.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var STATE_VERSION = 10;
var TZ = 'Europe/London';
var DAY_MS = 86400000;
var FLOOR_MIN = 1450;     // calories never go under this, anywhere
var STEP_CAP = 17000;     // a day's step target (with make-up steps) never goes over this
var TOO_FAST_KG = 1.1;    // the plan's "too fast" line, kg a week

/* ───────────────────────── small helpers ───────────────────────── */
function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function num(x, d) { var n = typeof x === 'string' ? parseFloat(x.replace(/,/g, '')) : x; return (typeof n === 'number' && isFinite(n)) ? n : (d === undefined ? 0 : d); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }
function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clone(x) { return JSON.parse(JSON.stringify(x)); }
/* an item's ID is only ever letters, digits and - _ . : (anything else, e.g. from a tampered backup, gets a fresh one) */
function cleanId(x) { return typeof x === 'string' && /^[A-Za-z0-9_.:\-]{1,64}$/.test(x) ? x : uid(); }
function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ───────────────────────── dates (Europe/London) ───────────────────────── */
var _dkFmt = null, _tFmt = null;
var _dkMin = NaN, _dkVal = '';
function dayKey(date) {
  var d = date instanceof Date ? date : new Date(date === undefined ? Date.now() : date), min = Math.floor(d.getTime() / 60000);
  if (min === _dkMin) return _dkVal; // London's days start on a whole minute, so one answer per minute is exact (and asked for many times a render)
  if (!_dkFmt) _dkFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  var parts = _dkFmt.formatToParts(d), o = {};
  parts.forEach(function (p) { o[p.type] = p.value; });
  if (!isFinite(min)) return o.year + '-' + o.month + '-' + o.day;
  _dkMin = min; _dkVal = o.year + '-' + o.month + '-' + o.day; return _dkVal;
}
function londonTime(date) {
  var d = date instanceof Date ? date : new Date(date === undefined ? Date.now() : date);
  if (!_tFmt) _tFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return _tFmt.format(d).replace(/^24/, '00');
}
function isKey(k) { if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false; var t = keyToUTC(k); return isFinite(t) && +k.slice(0, 4) >= 2000 && utcToKey(t) === k; } // real calendar dates only (no 31 Feb)
function keyToUTC(k) { var p = k.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function utcToKey(ms) { return isFinite(ms) && Math.abs(ms) < 8.6e15 ? new Date(ms).toISOString().slice(0, 10) : ''; }
function addDays(k, n) { return utcToKey(keyToUTC(k) + n * DAY_MS); }
function diffDays(a, b) { return Math.round((keyToUTC(b) - keyToUTC(a)) / DAY_MS); }
function weekday(k) { return new Date(keyToUTC(k)).getUTCDay(); } // 0 Sun … 6 Sat
function mondayOf(k) { var w = weekday(k); return addDays(k, -((w + 6) % 7)); }
function rangeKeys(a, b) { var out = []; if (!isKey(a) || !isKey(b)) return out; for (var k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; }
function fmtDate(k) {
  var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var d = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var p = k.split('-'); return d[weekday(k)] + ' ' + (+p[2]) + ' ' + m[+p[1] - 1];
}

/* ───────────────────────── defaults ───────────────────────── */
/* Pavi's InBody scan, 7 Sept 2026 (InBody app, Detail tab) */
function SEED_SCAN() {
  return { id: 'scan-2026-09-07', date: '2026-09-07', source: 'seed', note: 'InBody 7 Sept 2026', weight: 90.5, smm: 38.6, bfm: 22.6, pbf: 25, lbm: 67.9, score: 77, age: 27.3, visceral: null, bmr: null, whr: null,
    seg: { trunk: 31.1, la: 4.16, ra: 4.09, ll: 9.74, rl: 9.87 }, segPct: { trunk: 108.1, la: 115.2, ra: 113.4, ll: 97.1, rl: 98.3 } };
}
/* the profile picture: a small square JPEG (cropped to a circle when shown), kept with the save so it syncs. Anything
   that is not a picture, or is far too big to be one of ours, is dropped. */
function cleanPhoto(v) { return typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 300000 ? v : ''; }
var THEMES = [
  ['frost', 'Frost'], ['bluelock', 'Blue Lock'], ['crimson', 'Crimson'], ['emerald', 'Emerald'], ['royal', 'Royal'], ['gold', 'Gold'], ['sakura', 'Sakura'], ['inferno', 'Inferno'], ['shadow', 'Shadow'],
  ['day', 'Daylight'], ['blossom', 'Blossom'], ['matcha', 'Matcha'], ['lilac', 'Lilac']
];
var LIGHT_THEMES = ['day', 'blossom', 'matcha', 'lilac']; // light backgrounds; the rest are dark
var THEME_IDS = THEMES.map(function (t) { return t[0]; });
function defaultState() {
  return {
    version: STATE_VERSION,
    profile: { name: 'Pavi', age: 23, heightCm: 178, startKg: 90.5, startBf: 24.6, startDate: '2026-10-08', goalKg: 79, goalBf: 15, seasonEnd: '2026-12-31', photo: '' },
    targets: { cal: { gym: 1600, football: 1600, rest: 1600 }, calDay: [1900, 1600, 1600, 1600, 1600, 1600, 1600], floor: 1450, calTol: 75, protein: 160, fat: 60, carbsMin: 130, carbsMax: 160, fibre: 30, fibreQuest: 25, waterMl: 3000,
      steps: 10000, stepsDay: [15000, 10000, 10000, 15000, 15000, 10000, 10000], stepsMin: 10000, stepsGoal: 12000, lightsOut: '23:00' },
    plan: { checkpoints: [{ date: '2026-11-01', kg: 87.4 }, { date: '2026-12-01', kg: 83.4 }, { date: '2026-12-31', kg: 79.5 }], deloads: [['2026-10-26', '2026-11-01'], ['2026-12-07', '2026-12-13']], reviewEvery: 14, lastReview: '', adjustments: [], ranges: {}, absPerWeek: 3, scanEveryDays: 28 },
    tdee: { base: 1900, perKSteps: 35, gym: 190, footballPerHour: 675 },
    week: { pattern: ['rest', 'gym', 'gym', 'rest', 'rest', 'football', 'gym'], midweekWed: '2026-10-07' },
    duels: { start: '', won: {}, seen: {} },
    heroes: { order: [], seen: {}, locked: {} },
    overrides: {},
    days: {},
    savedMeals: [{ id: 'protein-bowl', name: 'Protein bowl', items: [
      { name: 'Fat-free Greek yogurt', qty: '250g', cal: 143, p: 25, c: 9, s: 9, f: 0.5, fib: 0 },
      { name: 'Whey isolate', qty: '65g', cal: 234, p: 47, c: 2, s: 1, f: 1, fib: 0 }
    ] }],
    trials: { pullups: 0, pushups: 0, dips: 0, core: 0 },
    inbody: [SEED_SCAN()],
    library: [],
    recipes: [],
    shape: { shoulders: 1.15, loveHandles: 1, chest: 0.7, belly: 0.5, chestFloor: 0.35, back: 0.8 },
    shop: { rewards: [
      { id: 'r-game', name: '1 hour gaming', cost: 300 },
      { id: 'r-anime', name: 'Anime binge (3 episodes)', cost: 250 },
      { id: 'r-cinema', name: 'Cinema trip', cost: 900 },
      { id: 'r-gymtop', name: 'New gym top', cost: 1500 }
    ], purchases: [] },
    player: { ach: {}, title: '', maxLevel: 1, seenLevel: 1, seenKgMilestone: 0, msLegacy: 0, msLegacyAt: '', bossLoot: {}, clearSeen: '', prSeen: 0, finishSeen: '' },
    settings: { sound: false, motion: 'auto', lastNotice: '', lastPhoto: '', splash: true, cloud: true, snow: true, theme: 'frost', glass: false, remind: { on: false, water: true, macros: true } },
    meta: { committed: [], created: '', inboxSeen: [], changedAt: 0, restarted: '', restartSeen: '', penaltyEnd: '' }
  };
}

function normalizeFood(f) {
  if (!isObj(f)) return null;
  var o = {
    id: cleanId(f.id),
    meal: ['breakfast', 'lunch', 'dinner', 'snack'].indexOf(f.meal) >= 0 ? f.meal : 'snack',
    name: String(f.name || 'Food').slice(0, 80), qty: String(f.qty == null ? '' : f.qty).slice(0, 40),
    cal: Math.max(0, num(f.cal)), p: Math.max(0, num(f.p)), c: Math.max(0, num(f.c)), s: Math.max(0, num(f.s)), f: Math.max(0, num(f.f)), fib: Math.max(0, num(f.fib)),
    conf: ['high', 'medium', 'low'].indexOf(f.conf) >= 0 ? f.conf : 'medium',
    note: String(f.note || '').slice(0, 200), t: num(f.t, 0)
  };
  if (f.tr) o.tr = 1; // OPERATION 79.9: marked as the day's one treat
  return o;
}
function normalizeWorkout(w) {
  if (!isObj(w)) return null;
  var sets = Array.isArray(w.sets) ? w.sets.filter(isObj).map(function (s) { return { kg: Math.max(0, num(s.kg)), reps: Math.max(0, Math.round(num(s.reps))) }; }).filter(function (s) { return s.reps > 0; }) : [];
  if (!sets.length) return null;
  var ex = matchExercise(w.ex || w.name || '');
  return { id: cleanId(w.id), ex: ex ? ex.key : 'custom:' + String(w.name || 'exercise').toLowerCase().slice(0, 40), name: ex ? ex.name : String(w.name || 'Exercise').slice(0, 60), sets: sets, t: num(w.t, 0) };
}
function normalizeActivity(a) {
  if (!isObj(a)) return null;
  var type = ACTIVITY_TYPES.indexOf(a.type) >= 0 ? a.type : 'other';
  var o = { id: cleanId(a.id), type: type, min: Math.max(0, num(a.min)), kcal: Math.max(0, num(a.kcal)), t: num(a.t, 0) };
  if (type === 'gym' && GYM_LEVELS[a.lvl]) o.lvl = a.lvl;         // light | moderate | high
  if (type === 'football' && FOOT_INT[a.int]) o.int = a.int;      // low | medium | high
  return o;
}
function emptyDay() { return { foods: [], workouts: [], activities: [], water: 0, steps: 0, weight: null, bf: null, meas: {}, lightsOut: false, recover: false, penaltyDone: false, supps: {} }; }
function normalizeDay(d) {
  var o = emptyDay(); if (!isObj(d)) return o;
  o.foods = (Array.isArray(d.foods) ? d.foods : []).map(normalizeFood).filter(Boolean);
  o.workouts = (Array.isArray(d.workouts) ? d.workouts : []).map(normalizeWorkout).filter(Boolean);
  o.activities = (Array.isArray(d.activities) ? d.activities : []).map(normalizeActivity).filter(Boolean);
  o.water = Math.max(0, num(d.water)); o.steps = Math.max(0, Math.round(num(d.steps)));
  o.weight = d.weight == null ? null : (num(d.weight, null) > 0 ? num(d.weight) : null);
  o.bf = d.bf == null ? null : (num(d.bf, null) > 0 ? num(d.bf) : null);
  o.meas = {}; if (isObj(d.meas)) ['waist', 'chest', 'shoulders', 'arms'].forEach(function (k) { if (num(d.meas[k], 0) > 0) o.meas[k] = num(d.meas[k]); });
  o.lightsOut = !!d.lightsOut; o.recover = !!d.recover; o.penaltyDone = !!d.penaltyDone;
  o.supps = {}; if (isObj(d.supps)) Object.keys(d.supps).forEach(function (k) { if (d.supps[k]) o.supps[String(k).slice(0, 20)] = true; });
  var tg = normalizeTg(d.tg); if (tg) o.tg = tg;
  if (d.bowl) o.bowl = true; // OPERATION 79.9: the yogurt bowl, ticked by hand
  return o;
}
/* tg = the targets a day was judged against, stored with the day so later plan changes never re-mark it.
   t type · c kcal · s steps before make-up · p protein · w water ml · fb fibre · tol kcal ± · fl floor · m step minimum
   lg = 1 on days carried over from before v12 (judged by the rules of the time) · st = that day's full step target */
function normalizeTg(g) {
  if (!isObj(g)) return null;
  var o = { t: ['gym', 'football', 'rest'].indexOf(g.t) >= 0 ? g.t : 'rest', c: clamp(Math.round(num(g.c, 1600)), 500, 6000), s: clamp(Math.round(num(g.s, 10000)), 500, 60000),
    p: clamp(num(g.p, 160), 0, 500), w: clamp(num(g.w, 3000), 0, 10000), fb: clamp(num(g.fb, 25), 0, 150), tol: clamp(num(g.tol, 75), 0, 1000), fl: clamp(num(g.fl, FLOOR_MIN), 0, 4000), m: clamp(Math.round(num(g.m, 10000)), 0, 60000) };
  if (g.lg) o.lg = 1; if (num(g.st, 0) > 0) o.st = Math.round(num(g.st));
  if (!o.lg) { o.c = Math.max(o.c, FLOOR_MIN); o.fl = Math.max(o.fl, FLOOR_MIN); o.s = Math.min(o.s, STEP_CAP); if (o.st) o.st = clamp(o.st, o.s, STEP_CAP); } // a v12 day can never hold a target under the floor or over the step cap
  return o;
}
function mergeDefaults(def, val) {
  if (!isObj(def)) return val === undefined ? def : val;
  var out = {}; var v = isObj(val) ? val : {};
  Object.keys(def).forEach(function (k) {
    if (isObj(def[k])) out[k] = mergeDefaults(def[k], v[k]);
    else if (Array.isArray(def[k])) out[k] = Array.isArray(v[k]) ? v[k] : def[k];
    else out[k] = (v[k] === undefined || v[k] === null || typeof v[k] !== typeof def[k]) ? def[k] : v[k];
  });
  Object.keys(v).forEach(function (k) { if (!(k in out)) out[k] = v[k]; });
  return out;
}
/* normalize: never throws. Anything weird is replaced by defaults. */
function normalize(raw) {
  var def = defaultState();
  var s;
  try { s = mergeDefaults(def, isObj(raw) ? raw : {}); } catch (e) { s = def; }
  s.version = STATE_VERSION;
  var days = {};
  if (isObj(s.days)) Object.keys(s.days).forEach(function (k) { if (isKey(k)) days[k] = normalizeDay(s.days[k]); });
  s.days = days;
  var ov = {}; if (isObj(s.overrides)) Object.keys(s.overrides).forEach(function (k) { if (isKey(k) && DAY_TYPES.indexOf(s.overrides[k]) >= 0) ov[k] = s.overrides[k]; });
  s.overrides = ov;
  if (!Array.isArray(s.week.pattern) || s.week.pattern.length !== 7) s.week.pattern = def.week.pattern.slice();
  s.week.pattern = s.week.pattern.map(function (t, i) { return (DAY_TYPES.indexOf(t) >= 0 || t === 'alt') ? t : def.week.pattern[i]; });
  if (!isKey(s.week.midweekWed)) s.week.midweekWed = def.week.midweekWed;
  if (!isKey(s.profile.startDate)) s.profile.startDate = def.profile.startDate;
  if (!isKey(s.profile.seasonEnd)) s.profile.seasonEnd = def.profile.seasonEnd;
  s.savedMeals = (Array.isArray(s.savedMeals) ? s.savedMeals : []).filter(function (m) { return isObj(m) && Array.isArray(m.items) && m.items.length; })
    .map(function (m) { return { id: cleanId(m.id), name: String(m.name || 'Meal').slice(0, 60), items: m.items.map(normalizeFood).filter(Boolean).map(function (f) { return { name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib }; }) }; });
  Object.keys(def.trials).forEach(function (k) { s.trials[k] = clamp(Math.round(num(s.trials[k])), 0, TRIALS[k].stages.length); });
  s.shop.rewards = (Array.isArray(s.shop.rewards) ? s.shop.rewards : []).filter(isObj).map(function (r) { return { id: cleanId(r.id), name: String(r.name || 'Reward').slice(0, 60), cost: Math.max(1, Math.round(num(r.cost, 100))) }; });
  s.shop.purchases = (Array.isArray(s.shop.purchases) ? s.shop.purchases : []).filter(isObj).map(function (p) { return { id: cleanId(p.id), name: String(p.name || ''), cost: Math.max(0, Math.round(num(p.cost))), t: num(p.t) }; });
  if (!isObj(s.heroes)) s.heroes = { order: [], seen: {} };
  var hl = {}; if (isObj(s.heroes.locked)) Object.keys(s.heroes.locked).forEach(function (n) { var x = s.heroes.locked[n]; if (+n >= 1 && +n <= HERO_WEEKS && isObj(x) && num(x.ref, 0) > 0) hl[+n] = { hit: x.hit ? 1 : 0, day: x.hit && isKey(x.day) ? x.day : '', ref: num(x.ref), need: num(x.need, r2(num(x.ref) - HERO_DROP)), best: x.best == null ? null : num(x.best, null), next: x.next == null ? null : num(x.next, null) }; });
  s.heroes.locked = hl;
  var kp = s.heroes.keep; s.heroes.keep = isObj(kp) && +kp.n >= 1 && +kp.n <= HERO_WEEKS && num(kp.ref, 0) > 0 ? { n: +kp.n, ref: num(kp.ref) } : null; // the bar of the week that was open when v12 arrived
  if (!validHeroOrder(s.heroes.order)) s.heroes.order = shuffledHeroes();
  var hs = {}; if (isObj(s.heroes.seen)) Object.keys(s.heroes.seen).forEach(function (i) { if (+i >= 0 && +i < HEROES.length) hs[+i] = 1; }); s.heroes.seen = hs;
  if (!isObj(s.duels)) s.duels = { start: '', won: {}, seen: {} };
  var ds = {}; if (isObj(s.duels.seen)) Object.keys(s.duels.seen).forEach(function (i) { if (DUELS[+i]) ds[+i] = 1; }); s.duels.seen = ds;
  if (!isKey(s.duels.start)) s.duels.start = '';
  var dw = {}; if (isObj(s.duels.won)) Object.keys(s.duels.won).forEach(function (i) { if (DUELS[+i] && isKey(s.duels.won[i])) dw[+i] = s.duels.won[i]; }); s.duels.won = dw;
  s.shape.back = clamp(num(s.shape.back, 0.8), 0, 1);
  // OPERATION 79.9: its switch, the boss days it drew and the hero weights it set (anything malformed is dropped, and ensureOp sets it again)
  if (s.op !== undefined && !(isObj(s.op) && s.op.v === 1)) delete s.op;
  if (isObj(s.op)) { s.op = { v: 1, at: isKey(s.op.at) ? s.op.at : OP.start, final: isObj(s.op.final) && num(s.op.final.kg, 0) > 30 && isKey(s.op.final.day) ? { kg: num(s.op.final.kg), day: s.op.final.day } : undefined }; if (!s.op.final) delete s.op.final; }
  if (s.duels.op !== undefined) { var dop = s.duels.op, sc = {}, hd = {};
    if (isObj(dop) && isObj(dop.sched)) { Object.keys(dop.sched).forEach(function (i) { if (DUELS[+i] && isKey(dop.sched[i])) sc[+i] = dop.sched[i]; }); if (isObj(dop.hard)) Object.keys(dop.hard).forEach(function (i) { if (DUELS[+i] && dop.hard[i]) hd[+i] = 1; }); s.duels.op = { day: isKey(dop.day) ? dop.day : OP.start, sched: sc, hard: hd }; }
    else delete s.duels.op; }
  if (s.heroes.op !== undefined) { var hop = s.heroes.op;
    if (isObj(hop) && Array.isArray(hop.had) && Array.isArray(hop.needs) && hop.had.length + hop.needs.length === HEROES.length && hop.needs.every(function (v) { return num(v, 0) > 30; })) s.heroes.op = { day: isKey(hop.day) ? hop.day : OP.start, from: num(hop.from, OP.startKg), had: hop.had.map(function (d) { return isKey(d) ? d : OP.start; }), needs: hop.needs.map(function (v) { return r2(num(v)); }) };
    else delete s.heroes.op; }
  if (!isObj(s.player.ach)) s.player.ach = {};
  if (!isObj(s.player.bossLoot)) s.player.bossLoot = {};
  s.player.maxLevel = Math.max(1, Math.round(num(s.player.maxLevel, 1))); s.player.msLegacy = clamp(Math.round(num(s.player.msLegacy, 0)), 0, 200); s.player.msLegacyAt = isKey(s.player.msLegacyAt) ? s.player.msLegacyAt : '';
  // only days from before v12 arrived may carry the old rules; anything else is held to the floor and the step cap
  Object.keys(s.days).forEach(function (k) { var g = s.days[k].tg; if (g && g.lg && !(s.player.msLegacyAt && k <= s.player.msLegacyAt)) { delete g.lg; s.days[k].tg = normalizeTg(g); } });
  if (!Array.isArray(s.meta.committed)) s.meta.committed = [];
  if (!Array.isArray(s.meta.inboxSeen)) s.meta.inboxSeen = [];
  s.meta.changedAt = Math.max(0, Math.round(num(s.meta.changedAt, 0)));
  s.meta.restarted = isKey(s.meta.restarted) ? s.meta.restarted : ''; s.meta.restartSeen = isKey(s.meta.restartSeen) ? s.meta.restartSeen : '';
  if (s.meta.before !== undefined) { var bf = null; try { bf = isObj(s.meta.before) && JSON.stringify(s.meta.before).length < 200000 ? s.meta.before : null; } catch (e) { bf = null; } if (bf) s.meta.before = bf; else delete s.meta.before; }
  var byDate = {};
  (Array.isArray(s.inbody) ? s.inbody : []).forEach(function (x) { var sc = normalizeScan(x); if (sc && sc.date && sc.weight != null && sc.pbf != null && !checkScan(sc).length) byDate[sc.date] = sc; });
  s.inbody = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  s.library = (Array.isArray(s.library) ? s.library : []).map(normalizeLib).filter(function (x) { return x && x.source !== 'history' && x.source !== 'meal' && x.source !== 'recipe'; });
  s.recipes = (Array.isArray(s.recipes) ? s.recipes : []).map(normalizeRecipe).filter(Boolean).slice(0, 200);
  ['calDay', 'stepsDay'].forEach(function (key) {
    var a = s.targets[key]; if (!Array.isArray(a) || a.length !== 7) a = def.targets[key].slice();
    s.targets[key] = a.map(function (v, i) { v = num(v, def.targets[key][i]); return v > 0 ? clamp(Math.round(v), key === 'calDay' ? 800 : 1000, key === 'calDay' ? 5000 : STEP_CAP) : 0; });
  });
  // the calorie floor is a hard minimum: no setting, backup or cloud copy can carry a floor or a target under 1,450
  s.targets.floor = clamp(Math.round(num(s.targets.floor, FLOOR_MIN)), FLOOR_MIN, 3000);
  s.targets.calDay = s.targets.calDay.map(function (v) { return v > 0 ? Math.max(v, s.targets.floor) : 0; });
  if (!isObj(s.targets.cal)) s.targets.cal = clone(def.targets.cal);
  ['gym', 'football', 'rest'].forEach(function (t) { s.targets.cal[t] = clamp(Math.round(num(s.targets.cal[t], 1600)), s.targets.floor, 5000); }); s.targets.stepsMin = clamp(num(s.targets.stepsMin, 10000), 1000, STEP_CAP); s.targets.steps = clamp(Math.round(num(s.targets.steps, 10000)), 1000, STEP_CAP);
  var pl = s.plan, dp = def.plan;
  pl.checkpoints = (Array.isArray(pl.checkpoints) ? pl.checkpoints : dp.checkpoints).filter(function (c) { return isObj(c) && isKey(c.date) && num(c.kg, 0) > 30; }).map(function (c) { return { date: c.date, kg: num(c.kg) }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  pl.deloads = (Array.isArray(pl.deloads) ? pl.deloads : dp.deloads).filter(function (d) { return Array.isArray(d) && isKey(d[0]) && isKey(d[1]) && d[0] <= d[1]; }).map(function (d) { return [d[0], d[1]]; });
  pl.adjustments = (Array.isArray(pl.adjustments) ? pl.adjustments : []).filter(function (a) { return isObj(a) && isKey(a.date); }).map(function (a) { var o = { date: a.date, kcal: Math.round(num(a.kcal)), steps: Math.round(num(a.steps)) }; if (isKey(a.from)) o.from = a.from; if (isKey(a.review)) o.review = a.review; return o; });
  if (!isKey(pl.lastReview)) pl.lastReview = '';
  s.player.title = String(s.player.title || '').slice(0, 80); s.profile.name = String(s.profile.name || 'Pavi').slice(0, 30);
  s.profile.photo = cleanPhoto(s.profile.photo); s.settings.theme = THEME_IDS.indexOf(s.settings.theme) >= 0 ? s.settings.theme : 'frost'; s.settings.glass = s.settings.glass === true;
  // VF: bedtime is 10–11pm. The old 9:45pm check-in moves to 11pm; a time you chose yourself is kept
  if (!/^\d\d:\d\d$/.test(String(s.targets.lightsOut || '')) || s.targets.lightsOut === '21:45') s.targets.lightsOut = '23:00';
  var rm = isObj(s.settings.remind) ? s.settings.remind : {}; s.settings.remind = { on: rm.on === true, water: rm.water !== false, macros: rm.macros !== false };
  s.meta.penaltyEnd = isKey(s.meta.penaltyEnd) ? s.meta.penaltyEnd : '';
  s.meta.committed = s.meta.committed.filter(function (x) { return typeof x === 'string'; }).slice(-300); s.meta.inboxSeen = s.meta.inboxSeen.filter(function (x) { return typeof x === 'string'; }).slice(-100);
  pl.reviewEvery = clamp(Math.round(num(pl.reviewEvery, 14)), 7, 28); pl.absPerWeek = clamp(Math.round(num(pl.absPerWeek, 3)), 1, 7); pl.scanEveryDays = clamp(Math.round(num(pl.scanEveryDays, 28)), 7, 60);
  if (!isObj(pl.ranges)) pl.ranges = {};
  Object.keys(pl.ranges).forEach(function (k) { var r = pl.ranges[k]; if (!Array.isArray(r) || r.length !== 3 || !(r[0] >= 1 && r[0] <= 8 && r[1] >= 1 && r[2] >= r[1] && r[2] <= 50)) delete pl.ranges[k]; });
  var sh = s.shape, ds = def.shape;
  sh.shoulders = clamp(num(sh.shoulders, ds.shoulders), 0.85, 1.25);
  ['loveHandles', 'chest', 'belly', 'chestFloor'].forEach(function (k) { sh[k] = clamp(num(sh[k], ds[k]), 0, 1); });
  return s;
}

/* migrate: accepts any old saved shape (v0 = before versioning, v1) and returns current state.
   todayK is only needed when upgrading from before v7 (which days count as "already judged"); it defaults to today.
   opts.keepSeason leaves an old save on the season dates it was made with (used by the tests of the older upgrades). */
function migrate(raw, todayK, opts) {
  if (!isObj(raw)) return normalize({});
  var v = num(raw.version, 0), before7 = v < 7, before9 = v < 9, before10 = v < 10;
  var s = clone(raw);
  if (v < 1) {
    // v0 stored foods with long field names and xp on the root
    if (isObj(s.days)) Object.keys(s.days).forEach(function (k) {
      var d = s.days[k]; if (!isObj(d) || !Array.isArray(d.foods)) return;
      d.foods = d.foods.map(function (f) {
        if (!isObj(f)) return f;
        return { id: f.id, meal: f.meal, name: f.name, qty: f.quantity != null ? f.quantity : f.qty,
          cal: f.calories != null ? f.calories : f.cal, p: f.protein_g != null ? f.protein_g : f.p, c: f.carbs_g != null ? f.carbs_g : f.c,
          s: f.sugar_g != null ? f.sugar_g : f.s, f: f.fat_g != null ? f.fat_g : f.f, fib: f.fibre_g != null ? f.fibre_g : f.fib,
          conf: f.confidence || f.conf, note: f.assumption || f.note, t: f.t };
      });
    });
    if (!isObj(s.player)) s.player = {};
    if (raw.achievements && isObj(raw.achievements)) s.player.ach = raw.achievements;
    v = 1;
  }
  if (v < 2) {
    // v1 had trials as booleans arrays; v2 stores counts
    if (isObj(s.trials)) Object.keys(s.trials).forEach(function (k) { if (Array.isArray(s.trials[k])) s.trials[k] = s.trials[k].filter(Boolean).length; });
    v = 2;
  }
  if (v < 5) {
    // v5 = the Winter Arc plan. Old default targets move to the plan's; anything you changed yourself is kept.
    var T = isObj(s.targets) ? s.targets : null, same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
    if (T) {
      if (isObj(T.cal) && same([T.cal.gym, T.cal.football, T.cal.rest], [1700, 1800, 1600])) T.cal = { gym: 1600, football: 1600, rest: 1600 };
      else if (isObj(T.cal) && !Array.isArray(T.calDay)) T.calDay = [0, 0, 0, 0, 0, 0, 0]; // custom calories: keep using them by day type
      if (T.fat === 55) T.fat = 60;
      if (T.steps === 8000) T.steps = 10000; else if (typeof T.steps === 'number' && !Array.isArray(T.stepsDay)) T.stepsDay = [0, 0, 0, 0, 0, 0, 0];
      if (T.stepsGoal === 10000) T.stepsGoal = 12000;
    }
    if (isObj(s.week) && same(s.week.pattern, ['rest', 'gym', 'gym', 'alt', 'rest', 'football', 'gym'])) s.week.pattern = ['rest', 'gym', 'gym', 'rest', 'rest', 'football', 'gym'];
    if (isObj(s.profile) && s.profile.startBf === 25) s.profile.startBf = 24.6;
    v = 5;
  }
  if (v < 6) {
    // v6 = hologram reshaped to your build (bigger love handles, broader shoulders, strong back). Your own slider changes are kept.
    if (isObj(s.shape)) { if (s.shape.loveHandles === 0.8) s.shape.loveHandles = 1; if (s.shape.shoulders === 1.1) s.shape.shoulders = 1.15; }
    v = 6;
  }
  // v9: seven bosses left the list, so the numbers a save uses for "won" and "seen" bosses are moved to the new list.
  // Only a save that really is from an old season is renumbered: one already on the new start (written back by a device
  // still running an older copy of the app) uses the new numbers, and renumbering those twice would move its wins.
  var newSeason = isObj(s.profile) && s.profile.startDate === SEASON_START;
  if (before9 && !newSeason && isObj(s.duels)) ['won', 'seen'].forEach(function (f) { var old = s.duels[f], next = {}; if (!isObj(old)) return; Object.keys(old).forEach(function (i) { var n = DUEL_OLD_TO_NEW[+i]; if (n !== undefined) next[n] = old[i]; }); s.duels[f] = next; });
  var oldT = before7 && isObj(s.targets) ? clone(s.targets) : null;
  var out = normalize(s);
  if (before7) upgradeToV7(out, oldT, isKey(todayK) ? todayK : dayKey());
  if (before9 && !(opts && opts.keepSeason)) restartSeason(out);
  // v10 (app v16): Penalty Quests are retired. Every one already done keeps its XP, gold and the half-streak it saved;
  // from the day of the upgrade on, a missed day simply ends the streak. Everything else in the save is untouched.
  if (before10 && !isKey(out.meta.penaltyEnd)) out.meta.penaltyEnd = isKey(todayK) ? todayK : dayKey();
  return out;
}
/* v9 (app v14): the Winter Arc starts on Thu 8 Oct 2026 at 90.5kg. A save made for one of the earlier starts (1 Oct, or
   the 7 Oct of v13) is moved to the new one. Everything logged is kept, day for day. What the old season had awarded (XP,
   levels, awards, bosses, heroes, rewards bought, review changes) starts again from day one, and a record of how it
   stood is kept in meta.before. A season whose dates you set yourself is left exactly as it is. */
var OLD_STARTS = ['2026-10-01', '2026-10-07'], SEASON_START = '2026-10-08'; // SEASON_START is the first season that used the 83-boss list
var OLD_CHECKPOINTS = ['[{"date":"2026-11-01","kg":86.5},{"date":"2026-12-01","kg":83},{"date":"2026-12-31","kg":79.5}]', '[{"date":"2026-11-01","kg":87.3},{"date":"2026-12-01","kg":83.4},{"date":"2026-12-31","kg":79.5}]'];
function restartSeason(s) {
  if (OLD_STARTS.indexOf(s.profile.startDate) < 0) return false;
  var def = defaultState();
  var first = !(isObj(s.meta.before) && isKey(s.meta.before.startDate)); // a save already moved once keeps the record of its first season
  if (first) s.meta.before = { startDate: s.profile.startDate, startKg: s.profile.startKg, checkpoints: clone(s.plan.checkpoints), duels: clone(s.duels), heroes: { order: s.heroes.order.slice(), locked: clone(s.heroes.locked), seen: clone(s.heroes.seen), keep: s.heroes.keep ? clone(s.heroes.keep) : null },
    player: clone(s.player), purchases: clone(s.shop.purchases), adjustments: clone(s.plan.adjustments), lastReview: s.plan.lastReview };
  s.profile.startDate = def.profile.startDate;
  s.profile.startKg = def.profile.startKg; // the new season starts from the weight given for it (90.5kg); the old figure is in the record above and Settings can still change it
  if (OLD_CHECKPOINTS.indexOf(JSON.stringify(s.plan.checkpoints)) >= 0) s.plan.checkpoints = clone(def.plan.checkpoints);
  s.duels = { start: '', won: {}, seen: {} };
  if (Object.keys(s.heroes.seen).length || Object.keys(s.heroes.locked).some(function (n) { return s.heroes.locked[n].hit; })) s.heroes.order = shuffledHeroes(); // a line-up you have already seen part of is drawn again
  s.heroes.locked = {}; s.heroes.seen = {}; s.heroes.keep = null;
  s.player = clone(def.player);
  s.shop.purchases = []; s.plan.adjustments = []; s.plan.lastReview = '';
  s.settings.lastNotice = ''; s.meta.restarted = def.profile.startDate; s.meta.restartSeen = '';
  Object.keys(s.days).forEach(function (k) { var g = s.days[k].tg; if (g && g.lg) { delete g.lg; s.days[k].tg = normalizeTg(g); } }); // no day carries the pre-v12 rules into the new season
  return true;
}
/* v7 (app v12) judges days by rules that changed: a calorie floor on the quest, a step cap, targets stored per day.
   So that nothing you already earned moves, every day already logged (up to and including the day of the upgrade) is
   stamped with the targets AND the rules it was judged by at the time (lg = 1). New days use the new rules. */
function upgradeToV7(s, oldT, todayK) {
  var T = s.targets, o = isObj(oldT) ? oldT : {};
  function oldNum(v, lo, hi, d) { v = num(v, NaN); return isFinite(v) && v >= lo && v <= hi ? v : d; }
  var calDay = T.calDay.map(function (v, i) { return Array.isArray(o.calDay) ? Math.round(oldNum(o.calDay[i], 800, 5000, v)) : v; });
  var cal = {}; DAY_TYPES.forEach(function (t) { cal[t] = oldNum(isObj(o.cal) ? o.cal[t] : NaN, 1, 9000, T.cal[t]); });
  var stepsDay = T.stepsDay.map(function (v, i) { return Array.isArray(o.stepsDay) ? Math.round(oldNum(o.stepsDay[i], 1000, 40000, v)) : v; }), steps0 = oldNum(o.steps, 1, 100000, T.steps), min = oldNum(o.stepsMin, 1000, 40000, T.stepsMin);
  function base(k) { var v = stepsDay[weekday(k)]; return v > 0 ? v : steps0; }
  Object.keys(s.days).sort().forEach(function (k) {
    var d = s.days[k];
    d.activities.forEach(function (a) { if (a.type === 'football' && !(a.min > 0)) a.min = 60; }); // an entry with no minutes used to count as an hour: keep what it earned
    if (k > todayK || d.tg) return; // today too, if anything is already logged: what it has earned so far was earned under the old rules
    var type = liveType(s, k), cd = calDay[weekday(k)], ov = s.overrides && s.overrides[k], b = base(k), yk = addDays(k, -1), y = s.days[yk], st = b;
    if (y && y.steps > 0 && y.steps < min && yk >= s.profile.startDate) st = b + Math.min(5000, min - y.steps);
    if (k === todayK) st = Math.max(b, Math.min(st, STEP_CAP)); // today is still being walked: never ask for more than the cap
    d.tg = normalizeTg({ t: type, c: cd > 0 && !ov ? cd : num(cal[type], 1600), s: b, st: Math.round(st), p: T.protein, w: T.waterMl, fb: T.fibreQuest, tol: T.calTol, fl: oldNum(o.floor, 0, 4000, T.floor), m: min, lg: 1 });
  });
  // heroes: every week already over, and any week already won, keeps the result it had (worked out the way v11 did,
  // where a weigh-in from before the arc could set the first bar). Heroes you have freed stay freed.
  var all = weightSeries(s), locked = {}, keep = null;
  for (var n = 1; n <= HERO_WEEKS; n++) {
    var start = addDays(s.profile.startDate, 7 * (n - 1)), end = addDays(start, 6), ref = s.profile.startKg, best = null, hitDay = '', next = s.profile.startKg;
    all.forEach(function (w) { if (w.key < start) ref = w.kg; if (w.key <= end) next = w.kg; });
    var need = r2(ref - HERO_DROP);
    all.forEach(function (w) { if (w.key >= start && w.key <= end && w.key <= todayK) { if (best == null || w.kg < best) best = w.kg; if (!hitDay && w.kg <= need + 1e-9) hitDay = w.key; } });
    if (todayK > end) locked[n] = { hit: hitDay ? 1 : 0, day: hitDay, ref: ref, need: need, best: best, next: next };
    else if (hitDay) locked[n] = { hit: 1, day: hitDay, ref: ref, need: need, best: best, next: null };
    else if (todayK >= start && ref !== s.profile.startKg) keep = { n: n, ref: ref }; // the week in progress keeps the bar it had: no hero is freed or pushed away by the upgrade itself
  }
  s.heroes.locked = locked; s.heroes.keep = keep;
  // kilograms already banked from single readings stay banked; new ones go by the 7-day average
  var low = all.length ? Math.min.apply(null, all.map(function (w) { return w.kg; })) : s.profile.startKg, old = Math.floor(r1(Math.max(0, s.profile.startKg - low)));
  s.player.msLegacy = old > Math.floor(maxKgLost(s)) ? old : 0; s.player.msLegacyAt = todayK;
}

/* ───────────────────────── day types ───────────────────────── */
var DAY_TYPES = ['gym', 'football', 'rest'];
var ACTIVITY_TYPES = ['gym', 'football', 'cardio', 'sprint', 'ballwork', 'abs', 'other', 'incline'];
function tgOf(s, k) { var d = s.days[k]; return d && d.tg ? d.tg : null; }
/* the day type the weekly pattern gives (no "today is a…" override) */
function patternType(s, k) {
  var t = s.week.pattern[weekday(k)];
  if (t === 'alt') { var off = diffDays(s.week.midweekWed, k); return (((off % 14) + 14) % 14 === 0) ? 'rest' : 'gym'; }
  return DAY_TYPES.indexOf(t) >= 0 ? t : 'rest';
}
function liveType(s, k) { return s.overrides && s.overrides[k] ? s.overrides[k] : patternType(s, k); }
function dayType(s, k) { var g = tgOf(s, k); return g ? g.t : liveType(s, k); }
function isMidweekNight(s, k) {
  if (weekday(k) !== 3) return false;
  var off = diffDays(s.week.midweekWed, k); return (((off % 14) + 14) % 14 === 0);
}
/* the weekday's calories (1,900 Sunday, 1,600 otherwise) stay as they are unless the day's type really changes */
function liveCal(s, k) { if (inOp(s, k) && opCap(k)) return opCap(k); var d = s.targets.calDay[weekday(k)], ov = s.overrides && s.overrides[k]; if (d > 0 && (!ov || ov === patternType(s, k))) return d; return num(s.targets.cal[liveType(s, k)], 1600); }
function calTarget(s, k) { var g = tgOf(s, k); return g ? g.c : liveCal(s, k); }
/* the other targets a day is judged against */
function dayRules(s, k) { var r = dayRules0(s, k); if (inOp(s, k)) r.floor = OP.low; return r; } // OPERATION 79.9: 1,450 is the most you eat; under 1,300 is too little
function dayRules0(s, k) { var g = tgOf(s, k), T = s.targets; return g ? { protein: g.p, waterMl: g.w, fibreQuest: g.fb, calTol: g.tol, floor: g.fl, stepsMin: g.m, legacy: !!g.lg } : { protein: T.protein, waterMl: T.waterMl, fibreQuest: T.fibreQuest, calTol: T.calTol, floor: T.floor, stepsMin: T.stepsMin, legacy: false }; }
function liveStepsBase(s, k) { if (inOp(s, k) && isIceland(k)) return OP.icelandSteps; var v = s.targets.stepsDay[weekday(k)]; return v > 0 ? v : s.targets.steps; }
function snapshotTargets(s, k) { var T = s.targets; return { t: liveType(s, k), c: liveCal(s, k), s: liveStepsBase(s, k), p: T.protein, w: T.waterMl, fb: T.fibreQuest, tol: T.calTol, fl: T.floor, m: T.stepsMin }; }
/* store today's targets with every day before `upto` (and `upto` itself when inclusive) that doesn't have them yet.
   Called before anything changes the targets, so the past keeps the result it had. */
function freezeDays(s, upto, inclusive) {
  var n = 0; if (!isKey(upto)) return 0;
  if (inclusive && !s.days[upto]) s.days[upto] = emptyDay();
  // a past day with nothing logged yet still gets its targets, so filling it in later is judged by the plan of that day
  var first = firstLoggedDay(s); if (first && first < s.profile.startDate) first = s.profile.startDate;
  if (first && first < upto && diffDays(first, upto) <= 400) rangeKeys(first, addDays(upto, -1)).forEach(function (k) { if (!s.days[k]) s.days[k] = emptyDay(); });
  Object.keys(s.days).forEach(function (k) {
    if (!(k < upto || (inclusive && k === upto))) return; var d = s.days[k];
    if (!d.tg) { d.tg = normalizeTg(snapshotTargets(s, k)); n++; }
    if (k < upto && !(d.tg.st > 0)) { var st = stepsTarget(s, k); if (st > 0) d.tg.st = st; } // a finished day's step target (with any make-up steps) is fixed too
  });
  return n;
}
function getDay(s, k) { return s.days[k] || emptyDay(); }
/* the arc runs from the start date to the season end. After that nothing new is asked of you and nothing more is scored. */
function seasonOver(s, k) { return k > s.profile.seasonEnd; }
/* the days before the first day: logging works, nothing is asked or scored yet */
function notStarted(s, k) { return k < s.profile.startDate; }
function lastSeasonDay(s, k) { return k > s.profile.seasonEnd ? s.profile.seasonEnd : k; }

/* ───────────────────────── nutrition / energy ───────────────────────── */
function dayTotals(d) {
  var t = { cal: 0, p: 0, c: 0, s: 0, f: 0, fib: 0 };
  (d.foods || []).forEach(function (x) { t.cal += x.cal; t.p += x.p; t.c += x.c; t.s += x.s; t.f += x.f; t.fib += x.fib; });
  Object.keys(t).forEach(function (k) { t[k] = r1(t[k]); });
  return t;
}
function mealTotals(d) {
  var out = {};
  (d.foods || []).forEach(function (x) {
    var m = out[x.meal] || (out[x.meal] = { cal: 0, p: 0, c: 0, s: 0, f: 0, fib: 0, items: [] });
    m.cal += x.cal; m.p += x.p; m.c += x.c; m.s += x.s; m.f += x.f; m.fib += x.fib; m.items.push(x);
  });
  Object.keys(out).forEach(function (k) { ['cal', 'p', 'c', 's', 'f', 'fib'].forEach(function (f) { out[k][f] = r1(out[k][f]); }); });
  return out;
}
function gymSessions(d) {
  var g = (d.activities || []).filter(function (a) { return a.type === 'gym'; }).length;
  if (!g && d.workouts && d.workouts.length) g = 1;
  return g;
}
function footballMinutes(d) { return (d.activities || []).filter(function (a) { return a.type === 'football'; }).reduce(function (a, b) { return a + (b.min > 0 ? b.min : 0); }, 0); } // a 0-minute entry is 0 minutes
function activityKcal(s, d) {
  var steps = (d.steps || 0) / 1000 * s.tdee.perKSteps;
  var gym = gymKcal(s, d);            // a session's effort (light 175, moderate 275, high 325) when you chose one
  var foot = footballKcal(s, d);      // minutes played × the per-minute burn × effort (low 0.75, medium 1, high 1.2)
  var other = (d.activities || []).filter(function (a) { return a.type !== 'gym' && a.type !== 'football' && a.type !== 'incline'; }).reduce(function (a, b) { return a + (b.kcal || 0); }, 0);
  return Math.round(steps + gym + foot + inclineKcal(s, d) + other);
}
function tdeeFor(s, d) { return Math.round(s.tdee.base + activityKcal(s, d)); }
/* what the plan expects a day to burn and to leave as a deficit */
function plannedBurn(s, k) { var t = dayType(s, k); return Math.round(s.tdee.base + stepsBase(s, k) / 1000 * s.tdee.perKSteps + (t === 'gym' ? s.tdee.gym : t === 'football' ? s.tdee.footballPerHour : 0)); }
function plannedDeficit(s, k) { return Math.max(0, plannedBurn(s, k) - calTarget(s, k)); }
var DEFICIT_AMBER = 1100; // a single day's deficit above this is shown as a caution, not as a win
function deficit(s, d) { return Math.round(tdeeFor(s, d) - dayTotals(d).cal); }
function energyBreakdown(s, d) {
  return { base: s.tdee.base, steps: Math.round((d.steps || 0) / 1000 * s.tdee.perKSteps), gym: Math.round(gymKcal(s, d)),
    football: Math.round(footballKcal(s, d)), incline: Math.round(inclineKcal(s, d)), tdee: tdeeFor(s, d), eaten: dayTotals(d).cal, deficit: deficit(s, d) };
}
function macroStatus(val, target, mode) {
  // mode: 'min' (reach it), 'max' (stay under), 'range' handled separately
  if (mode === 'min') return val >= target ? 'hit' : (val >= target * 0.8 ? 'close' : 'under');
  if (mode === 'max') return val <= target ? 'ok' : 'over';
  return 'ok';
}
function fibreWarning(s, k) {
  var today = dayTotals(getDay(s, k)).fib, vals = [];
  for (var i = 1; i <= 7; i++) { var d = s.days[addDays(k, -i)]; if (d && d.foods.length) vals.push(dayTotals(d).fib); }
  if (vals.length < 3) return null;
  var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  return today > avg + 5 ? { today: today, avg: r1(avg) } : null;
}

/* ───────────────────────── exercise library ───────────────────────── */
var EXERCISES = [
  { key: 'db_shoulder_press', name: 'DB Shoulder Press', m: ['shoulders', 'arms'], main: true, kw: ['db shoulder press', 'dumbbell shoulder press', 'seated shoulder press', 'shoulder press', 'ohp db'] },
  { key: 'machine_shoulder_press', name: 'Machine Shoulder Press', m: ['shoulders', 'arms'], main: true, kw: ['machine shoulder press', 'machine press shoulder'] },
  { key: 'lateral_raise', name: 'Lateral Raise', m: ['shoulders'], kw: ['lateral raise', 'lat raise', 'side raise', 'cable lateral'] },
  { key: 'lat_pulldown', name: 'Lat Pulldown', m: ['back', 'arms'], main: true, kw: ['lat pulldown', 'pulldown', 'pull down', 'lat pull'] },
  { key: 'cs_row', name: 'Chest-Supported Row', m: ['back', 'arms'], main: true, kw: ['chest supported row', 'chest-supported row', 'incline row', 'seal row', 't-bar chest'] },
  { key: 'cable_row', name: 'Single-Arm Cable Row', m: ['back', 'arms'], kw: ['single arm cable row', 'single-arm cable row', 'cable row', 'seated row'] },
  { key: 'db_bench', name: 'DB Bench Press', m: ['chest', 'arms', 'shoulders'], main: true, kw: ['db bench', 'dumbbell bench', 'bench press', 'chest press'] },
  { key: 'incline_db_press', name: 'Incline DB Press', m: ['chest', 'shoulders'], main: true, kw: ['incline db', 'incline dumbbell', 'incline press'] },
  { key: 'leg_press', name: 'Leg Press', m: ['quads', 'glutes'], main: true, kw: ['leg press'] },
  { key: 'leg_curl', name: 'Leg Curl', m: ['hamstrings'], kw: ['leg curl', 'hamstring curl', 'lying curl', 'seated curl'] },
  { key: 'hip_thrust', name: 'Hip Thrust', m: ['glutes', 'hamstrings'], main: true, kw: ['hip thrust', 'glute bridge'] },
  { key: 'split_squat', name: 'Split Squat (controlled depth)', m: ['quads', 'glutes'], kw: ['split squat', 'bulgarian'] },
  { key: 'step_up', name: 'Step-Up (controlled depth)', m: ['quads', 'glutes'], kw: ['step up', 'step-up'] },
  { key: 'bicep_curl', name: 'DB Curl', m: ['arms'], kw: ['bicep curl', 'biceps curl', 'db curl', 'dumbbell curl', 'curl'] },
  { key: 'hammer_curl', name: 'Hammer Curl', m: ['arms'], kw: ['hammer curl', 'hammer'] },
  { key: 'machine_chest_press', name: 'Machine Chest Press', m: ['chest', 'arms', 'shoulders'], main: true, kw: ['machine chest press', 'machine press', 'chest press machine'] },
  { key: 'overhead_tricep_ext', name: 'Overhead Tricep Extension', m: ['arms'], kw: ['overhead tricep extension', 'overhead triceps extension', 'overhead extension', 'overhead tricep'] },
  { key: 'db_rdl', name: 'DB RDL', m: ['hamstrings', 'glutes'], main: true, kw: ['db rdl', 'dumbbell rdl', 'romanian deadlift', 'rdl'] },
  { key: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown', m: ['back'], kw: ['straight arm pulldown', 'straight-arm pulldown', 'straight arm'] },
  { key: 'reverse_pec_deck', name: 'Reverse Pec Deck', m: ['shoulders', 'back'], kw: ['reverse pec deck', 'reverse pec', 'rear delt fly', 'reverse fly', 'rear delt'] },
  { key: 'tricep_pushdown', name: 'Tricep Pushdown', m: ['arms'], kw: ['tricep pushdown', 'triceps pushdown', 'pushdown', 'tricep extension'] },
  { key: 'calf_raise', name: 'Calf Raise', m: ['calves'], kw: ['calf raise', 'calves'] },
  { key: 'cable_crunch', name: 'Cable Crunch', m: ['core'], kw: ['cable crunch', 'crunch'] },
  { key: 'push_up', name: 'Push-Up', m: ['chest', 'arms', 'shoulders'], bw: true, kw: ['push up', 'push-up', 'pushup', 'press up', 'press-up'] },
  { key: 'dip', name: 'Dip', m: ['chest', 'arms'], bw: true, kw: ['dip', 'dips'] },
  { key: 'pull_up', name: 'Pull-Up', m: ['back', 'arms'], bw: true, kw: ['pull up', 'pull-up', 'pullup', 'chin up', 'chin-up'] },
  { key: 'hanging_knee_raise', name: 'Hanging Knee Raise', m: ['core'], bw: true, kw: ['hanging knee', 'knee raise'] },
  { key: 'hanging_leg_raise', name: 'Hanging Leg Raise', m: ['core'], bw: true, kw: ['hanging leg', 'leg raise'] }
];
var AVOID = [
  { kw: ['barbell squat', 'back squat', 'front squat', 'deep squat', 'squats', 'squat'], why: 'knees/back — use leg press or split squats to controlled depth' },
  { kw: ['deadlift', 'conventional deadlift'], why: 'back — use hip thrusts or leg curls' },
  { kw: ['bent over row', 'bent-over row', 'barbell row'], why: 'back — use chest-supported rows' },
  { kw: ['leg extension'], why: 'knees — keep leg extensions light or skip them' },
  { kw: ['good morning'], why: 'back' }, { kw: ['jefferson curl'], why: 'back' }
];
function matchExercise(name) {
  var n = String(name || '').toLowerCase().replace(/[_]/g, ' ').trim();
  if (!n) return null;
  for (var i = 0; i < EXERCISES.length; i++) if (EXERCISES[i].key === n.replace(/ /g, '_')) return EXERCISES[i];
  var best = null, bestLen = 0;
  EXERCISES.forEach(function (e) { e.kw.forEach(function (k) { if (n.indexOf(k) >= 0 && k.length > bestLen) { best = e; bestLen = k.length; } }); });
  return best;
}
function avoidWarning(name) {
  var n = String(name || '').toLowerCase();
  if (n.indexOf('split squat') >= 0 || n.indexOf('leg press') >= 0 || n.indexOf('rdl') >= 0 || n.indexOf('romanian') >= 0) return null;
  for (var i = 0; i < AVOID.length; i++) for (var j = 0; j < AVOID[i].kw.length; j++) if (n.indexOf(AVOID[i].kw[j]) >= 0) return 'On your avoid list (' + AVOID[i].why + ')';
  return null;
}
function exerciseByKey(k) { for (var i = 0; i < EXERCISES.length; i++) if (EXERCISES[i].key === k) return EXERCISES[i]; return null; }

/* ───────────────────────── strength ───────────────────────── */
function e1rm(kg, reps) { kg = num(kg); reps = num(reps); if (reps <= 0 || kg < 0) return 0; if (reps === 1) return r1(kg); return r1(kg * (1 + reps / 30)); }
/* walks every logged set in order; returns PR events, bests and muscle-loss alerts */
function strengthLog(s) {
  var keys = Object.keys(s.days).sort(), best = {}, prs = [], last = {}, sessions = {};
  keys.forEach(function (k) {
    var d = s.days[k];
    (d.workouts || []).slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (w) {
      var ex = exerciseByKey(w.ex), bw = ex ? !!ex.bw : false;
      // weighted lifts: best estimated 1RM. Bodyweight moves: best rep-equivalent (added kg counts extra).
      var metric = 0;
      w.sets.forEach(function (st) {
        var v = bw ? r1(st.reps * (1 + st.kg / 80)) : e1rm(st.kg, st.reps);
        if (v > metric) metric = v;
      });
      var unit = bw ? 'reps' : 'kg e1RM';
      var prev = best[w.ex];
      if (prev && metric > prev.v) prs.push({ day: k, ex: w.ex, name: w.name, from: prev.v, to: metric, unit: unit, id: w.id });
      if (!prev || metric > prev.v) best[w.ex] = { v: metric, unit: unit, day: k, name: w.name };
      (sessions[w.ex] = sessions[w.ex] || []).push({ day: k, v: metric, peakBefore: prev ? prev.v : metric, deload: isDeload(s, k) });
      last[w.ex] = { day: k, v: metric };
    });
  });
  var alerts = [];
  Object.keys(sessions).forEach(function (ex) {
    var e = exerciseByKey(ex); if (!e || !e.main) return;
    // a deload week is meant to be light, and one session logged in several entries is one session
    var byDay = {}, peak = best[ex].v; sessions[ex].forEach(function (x) { if (!x.deload) byDay[x.day] = Math.max(byDay[x.day] || 0, x.v); });
    var days = Object.keys(byDay).sort(), latest = days.length ? byDay[days[days.length - 1]] : null;
    if (days.length >= 2 && latest < peak * 0.9) alerts.push({ ex: ex, name: e.name, latest: latest, best: peak, dropPct: Math.round((1 - latest / peak) * 100) });
  });
  return { best: best, prs: prs, alerts: alerts, last: last };
}
/* the PRs that count for XP and awards: those set during the arc (a lift before day one, or after the last day, is only the bar to beat) */
function seasonPRs(s) { return strengthLog(s).prs.filter(function (p) { return p.day >= s.profile.startDate && p.day <= s.profile.seasonEnd; }); }

/* ───────────────────────── quests ───────────────────────── */
var QUESTS = [
  { id: 'protein', name: 'Protein', icon: '🥩', xp: 30, gold: 10 },
  { id: 'calories', name: 'Calorie target', icon: '🔥', xp: 30, gold: 10 },
  { id: 'water', name: 'Water 3L', icon: '💧', xp: 20, gold: 5 },
  { id: 'steps', name: 'Steps', icon: '👣', xp: 20, gold: 5 },
  { id: 'training', name: 'Training', icon: '⚔️', xp: 30, gold: 10 },
  { id: 'lights', name: 'Lights out', icon: '🌙', xp: 20, gold: 5 },
  { id: 'fibre', name: 'Fibre', icon: '🥦', xp: 20, gold: 5 }
];
var CLEAR_XP = 100, CLEAR_GOLD = 30, PENALTY_XP = 40, PENALTY_GOLD = 10;
function trainingDone(s, k, d) {
  var t = dayType(s, k);
  if (t === 'gym') return gymSessions(d) > 0;
  if (t === 'football') return footballMinutes(d) > 0;
  return !!d.recover || gymSessions(d) > 0 || footballMinutes(d) > 0;
}
function questStatus(s, k) {
  if (inOp(s, k)) return opQuests(s, k);
  var d = getDay(s, k), tot = dayTotals(d), T = dayRules(s, k), ct = calTarget(s, k), type = dayType(s, k);
  var map = {
    protein: { done: tot.p >= T.protein, val: tot.p, target: T.protein, unit: 'g', label: Math.round(tot.p) + ' / ' + T.protein + 'g' },
    // a day under the calorie floor never counts as "on target", however close to the target it is
    calories: { done: d.foods.length > 0 && Math.abs(tot.cal - ct) <= T.calTol && (T.legacy || tot.cal >= Math.min(T.floor, ct)), val: tot.cal, target: ct, unit: 'kcal', label: Math.round(tot.cal) + ' / ' + ct + (!T.legacy && ct - T.calTol < T.floor ? ' (not under ' + T.floor + ')' : ' ±' + T.calTol) },
    water: { done: d.water >= T.waterMl, val: d.water, target: T.waterMl, unit: 'ml', label: (d.water / 1000).toFixed(2).replace(/\.?0+$/, '') + ' / ' + (T.waterMl / 1000) + 'L' },
    steps: { done: d.steps >= stepsTarget(s, k), val: d.steps, target: stepsTarget(s, k), unit: '', label: d.steps.toLocaleString('en-GB') + ' / ' + stepsTarget(s, k).toLocaleString('en-GB') },
    training: { done: trainingDone(s, k, d), val: trainingDone(s, k, d) ? 1 : 0, target: 1, unit: '', label: type === 'gym' ? (sessionFor(s, k) ? sessionFor(s, k).name + ' session' : 'Log a gym session') : type === 'football' ? 'Play your FootyAddicts game' : 'Stretch, walk or rest' },
    lights: { done: !!d.lightsOut, val: d.lightsOut ? 1 : 0, target: 1, unit: '', label: lightsLabel(s.targets.lightsOut) },
    fibre: { done: tot.fib >= T.fibreQuest, val: tot.fib, target: T.fibreQuest, unit: 'g', label: Math.round(tot.fib) + ' / ' + T.fibreQuest + 'g' }
  };
  return QUESTS.map(function (q) { var m = map[q.id]; return { id: q.id, name: q.id === 'training' ? (type === 'rest' ? 'Recover' : type === 'football' ? 'Football' : sessionFor(s, k) ? sessionFor(s, k).name : 'Gym') : q.name, icon: q.icon, xp: q.xp, gold: q.gold, done: m.done, val: m.val, target: m.target, unit: m.unit, label: m.label, pct: clamp(m.target ? m.val / m.target : 0, 0, 1) }; });
}
function isClear(s, k) { return questStatus(s, k).every(function (q) { return q.done; }); }

var PENALTIES = [
  { id: 'steps', text: 'Hit ' + '10,000+ steps (2,000 over target)', auto: true },
  { id: 'pushups', text: '20 push-ups (any sets)' },
  { id: 'incline', text: '20-minute incline walk' }
];
function firstLoggedDay(s) {
  var ks = Object.keys(s.days).sort();
  for (var i = 0; i < ks.length; i++) { var d = s.days[ks[i]]; if (d.foods.length || d.workouts.length || d.activities.length || d.water || d.steps || d.weight != null || d.lightsOut || d.recover) return ks[i]; }
  return null;
}
function penaltyFor(s, k) {
  var start = s.profile.startDate, first = firstLoggedDay(s);
  if (!isKey(s.meta && s.meta.penaltyEnd) || k >= s.meta.penaltyEnd) return null; // retired in v16: only days before the upgrade can carry one
  if (k <= start || seasonOver(s, k)) return null; // no penalties before the arc starts or after it ends
  var prev = addDays(k, -1);
  if (!first || prev < first) return null; // no penalties for days before you started using the app
  if (isClear(s, prev)) return null;
  var opt = PENALTIES[hash(k) % PENALTIES.length], d = getDay(s, k);
  if (opt.id === 'steps' && stepsTarget(s, k) + 2000 > STEP_CAP && !dayRules(s, k).legacy) opt = PENALTIES[1]; // never push a day over the step cap: give the push-ups instead
  var target = stepsTarget(s, k) + 2000;
  var text = opt.id === 'steps' ? 'Hit ' + target.toLocaleString('en-GB') + '+ steps (2,000 over target)' : opt.text;
  var done = !!d.penaltyDone || (opt.id === 'steps' && d.steps >= target);
  return { id: opt.id, text: text, auto: !!opt.auto, done: done, missed: prev, xp: PENALTY_XP, gold: PENALTY_GOLD };
}
/* streaks: a missed day breaks the streak. (Before v16 a Penalty Quest done the next day kept half; those are still honoured.) */
function streaks(s, today) {
  var start = s.profile.startDate, cur = 0, best = 0, pcur = 0, pbest = 0, pending = 0, perDay = {};
  if (today < start) return { clear: 0, bestClear: 0, protein: 0, bestProtein: 0, pendingRestore: 0, perDay: perDay };
  rangeKeys(start, lastSeasonDay(s, today)).forEach(function (k) {
    var clear = isClear(s, k), isToday = k === today, hol = opMode(s, k) === 'iceland'; // a holiday day never breaks a streak
    if (clear) { cur += 1; pending = 0; }
    else if (!isToday && !hol) {
      var nk = addDays(k, 1), pen = nk <= today ? penaltyFor(s, nk) : null;
      if (pen && pen.done) cur = Math.floor(cur / 2);
      else { if (nk === today && pen) pending = Math.floor(cur / 2); cur = 0; }
    }
    perDay[k] = clear ? cur : 0;
    if (cur > best) best = cur;
    var pr = dayTotals(getDay(s, k)).p >= dayRules(s, k).protein;
    if (pr) pcur += 1; else if (!isToday && !hol) pcur = 0;
    if (pcur > pbest) pbest = pcur;
  });
  return { clear: cur, bestClear: best, protein: pcur, bestProtein: pbest, pendingRestore: pending, perDay: perDay };
}
function streakBonus(n) { return Math.min(n, 30) * 5; }

/* ───────────────────────── weekly boss ───────────────────────── */
var BOSSES = [
  { id: 'protein-titan', name: 'Protein Titan', icon: '🥩', hp: 6, desc: 'Hit protein on 6 days', test: function (s, k) { return dayTotals(getDay(s, k)).p >= dayRules(s, k).protein; } },
  { id: 'step-colossus', name: 'Step Colossus', icon: '👣', hp: 6, desc: 'Hit your step target on 6 days', test: function (s, k) { return getDay(s, k).steps >= stepsTarget(s, k); } },
  { id: 'iron-warden', name: 'Iron Warden', icon: '🛡️', hp: 4, desc: 'Train (gym or football) on 4 days', test: function (s, k) { var d = getDay(s, k); return gymSessions(d) > 0 || footballMinutes(d) > 0; } },
  { id: 'thirst-hydra', name: 'Thirst Hydra', icon: '💧', hp: 6, desc: 'Drink 3L on 6 days', test: function (s, k) { return getDay(s, k).water >= dayRules(s, k).waterMl; } },
  { id: 'night-wraith', name: 'Night Wraith', icon: '🌙', hp: 5, desc: 'Lights out on time on 5 nights', test: function (s, k) { return !!getDay(s, k).lightsOut; } },
  { id: 'calorie-golem', name: 'Calorie Golem', icon: '🔥', hp: 5, desc: 'Land your calorie target on 5 days', test: function (s, k) { return questStatus(s, k)[1].done; } },
  { id: 'fibre-serpent', name: 'Fibre Serpent', icon: '🥦', hp: 5, desc: 'Hit fibre on 5 days', test: function (s, k) { return dayTotals(getDay(s, k)).fib >= dayRules(s, k).fibreQuest; } },
  { id: 'gatekeeper', name: 'The Gatekeeper', icon: '👑', hp: 4, desc: 'Daily Clear on 4 days', test: function (s, k) { return isClear(s, k); } }
];
var BOSS_XP = 300, BOSS_GOLD = 100;
function bossFor(s, monday, today) {
  var first = mondayOf(s.profile.startDate);
  var idx = (((Math.floor(diffDays(first, monday) / 7)) % BOSSES.length) + BOSSES.length) % BOSSES.length;
  var b = BOSSES[idx];
  var days = rangeKeys(monday, addDays(monday, 6)).filter(function (k) { return k >= s.profile.startDate && k <= s.profile.seasonEnd; });
  var hp = Math.min(b.hp, days.length);
  var hits = days.filter(function (k) { return k <= today && b.test(s, k); });
  var dmg = Math.min(hits.length, hp);
  return { id: b.id, name: b.name, icon: b.icon, desc: b.desc, hp: hp, dmg: dmg, hpLeft: hp - dmg, defeated: hp > 0 && dmg >= hp, monday: monday, loot: 'Slayer of the ' + b.name, hitDays: hits, xp: BOSS_XP, gold: BOSS_GOLD };
}
function bossesUpTo(s, today) {
  var out = [], start = mondayOf(s.profile.startDate);
  if (today < s.profile.startDate) return out;
  for (var m = start; m <= today; m = addDays(m, 7)) out.push(bossFor(s, m, today));
  return out;
}

/* ───────────────────────── calisthenics trials ───────────────────────── */
var TRIALS = {
  pullups: { name: 'Pull-up Trial', icon: '🧗', stages: ['Dead hang 30s', 'Dead hang 60s', '3 slow negatives (5s down)', '5 slow negatives', 'Band-assisted 3×5', '1 full pull-up', '5 pull-ups', '8 pull-ups'] },
  pushups: { name: 'Push-up Trial', icon: '🫸', stages: ['15 unbroken', '20 unbroken', '25 unbroken', '30 unbroken', 'Decline 10', 'Decline 20'] },
  dips: { name: 'Dip Trial', icon: '🪜', stages: ['Bench dips 3×10', 'Bench dips 3×15', '1 bar dip', '5 bar dips', '10 bar dips'] },
  core: { name: 'Core Trial', icon: '🧱', stages: ['Plank 30s', 'Plank 60s', 'Plank 90s', 'Hanging knee raise 3×8', 'Hanging knee raise 3×12', 'Hanging leg raise 3×6'] }
};
var TRIAL_XP = 50, TRIAL_GOLD = 20;
function advanceTrial(s, tree) { if (!TRIALS[tree]) return false; if (s.trials[tree] >= TRIALS[tree].stages.length) return false; s.trials[tree] += 1; return true; }
function trialsDone(s) { return Object.keys(TRIALS).reduce(function (a, k) { return a + (s.trials[k] || 0); }, 0); }

/* ───────────────────────── weight & body ───────────────────────── */
function weightSeries(s) { return Object.keys(s.days).sort().filter(function (k) { return s.days[k].weight != null; }).map(function (k) { return { key: k, kg: s.days[k].weight }; }); }
function bfSeries(s) { return Object.keys(s.days).sort().filter(function (k) { return s.days[k].bf != null; }).map(function (k) { return { key: k, bf: s.days[k].bf }; }); }
function latestWeight(s, upto) { var w = weightSeries(s).filter(function (x) { return !upto || x.key <= upto; }); return w.length ? w[w.length - 1].kg : s.profile.startKg; }
function weekAverage(s, monday) {
  var vals = rangeKeys(monday, addDays(monday, 6)).map(function (k) { return s.days[k] && s.days[k].weight; }).filter(function (x) { return x != null; });
  return vals.length ? r2(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
}
function weeklyAverages(s) {
  var seen = {}, out = [];
  weightSeries(s).forEach(function (w) { var m = mondayOf(w.key); if (!seen[m]) { seen[m] = 1; out.push({ monday: m, avg: weekAverage(s, m) }); } });
  return out;
}
function trend(s, today, windowDays) {
  windowDays = windowDays || 14;
  var from = addDays(today, -(windowDays - 1));
  var pts = weightSeries(s).filter(function (w) { return w.key >= from && w.key <= today; });
  if (pts.length < 3) return null;
  var xs = pts.map(function (p) { return diffDays(from, p.key); }), ys = pts.map(function (p) { return p.kg; });
  if (xs[xs.length - 1] - xs[0] < 5) return null;
  var n = xs.length, mx = xs.reduce(function (a, b) { return a + b; }, 0) / n, my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
  var num_ = 0, den = 0; for (var i = 0; i < n; i++) { num_ += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
  if (!den) return null;
  var slope = num_ / den, nowFit = my + slope * (diffDays(from, today) - mx);
  if (!isFinite(slope) || !isFinite(nowFit)) return null;
  var perWeek = slope * 7, flat = Math.abs(perWeek) < 0.05; // under 50g a week is a level line, not a trend
  if (flat) { slope = 0; perWeek = 0; }
  // "too fast" follows the plan's own limit (1.1kg a week) once the first fortnight's water drop is out of the way
  var res = { slopePerDay: slope, perWeek: r2(perWeek), now: r2(nowFit), flat: flat, tooFast: diffDays(s.profile.startDate, today) >= 14 && -perWeek > TOO_FAST_KG, goalDate: null, daysToGoal: null };
  if (nowFit <= s.profile.goalKg) { res.daysToGoal = 0; res.goalDate = today; }
  else if (slope < 0) { var dd = Math.ceil((nowFit - s.profile.goalKg) / -slope); if (isFinite(dd) && dd > 0 && dd <= 3650) { res.daysToGoal = dd; res.goalDate = addDays(today, dd); } }
  return res;
}
function leanMass(s, upto) {
  var sc = latestScan(s, upto, 'lbm');
  return sc ? sc.lbm : s.profile.startKg * (1 - s.profile.startBf / 100);
}
function estBf(s, kg, upto) { var lbm = leanMass(s, upto); return r1(Math.max(4, (kg - lbm) / kg * 100)); }
/* body-fat %: the newest measurement (logged BF or InBody scan) unless you've weighed in since — then estimate from lean mass */
function bfMeasurements(s, upto) {
  var pts = bfSeries(s).map(function (x) { return { key: x.key, bf: x.bf }; });
  s.inbody.forEach(function (sc) { if (sc.pbf != null) pts.push({ key: sc.date, bf: sc.pbf, scan: true }); });
  return pts.filter(function (x) { return !upto || x.key <= upto; }).sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : (a.scan ? 1 : -1); });
}
function currentBf(s, upto) {
  var m = bfMeasurements(s, upto), w = weightSeries(s).filter(function (x) { return !upto || x.key <= upto; });
  var last = m.length ? m[m.length - 1] : null, lw = w.length ? w[w.length - 1] : null;
  if (last && (!lw || lw.key <= last.key)) return last.bf;
  return estBf(s, latestWeight(s, upto), upto);
}
function latestMeas(s, upto) {
  var out = {}; Object.keys(s.days).sort().forEach(function (k) { if (upto && k > upto) return; var m = s.days[k].meas; Object.keys(m || {}).forEach(function (f) { out[f] = m[f]; }); });
  return out;
}
/* estimated circumferences (cm) at a given weight; logged measurements override and anchor the deltas */
function estCirc(s, bf, lbm) {
  var h = s.profile.heightCm / 178;
  return { waist: (84 + (bf - 15) * 1.6) * h, chest: (98 + (bf - 15) * 0.8 + (lbm - 67.5) * 0.5) * h, shoulders: (118 + (lbm - 67.5) * 0.6) * h,
    arms: (33 + (bf - 15) * 0.25 + (lbm - 67.5) * 0.3) * h, hips: (96 + (bf - 15) * 1.0) * h, thigh: (56 + (bf - 15) * 0.6) * h };
}
function bodyProfile(s, kg, opts) {
  opts = opts || {};
  kg = num(kg, s.profile.startKg); if (kg <= 0) kg = s.profile.startKg;
  var lbm = leanMass(s, opts.upto);
  var bf = opts.bf != null ? opts.bf : estBf(s, kg, opts.upto);
  var est = estCirc(s, bf, lbm);
  var meas = opts.meas || {}, anchorBf = opts.anchorBf;
  var out = {};
  Object.keys(est).forEach(function (k) {
    if (meas[k] != null && anchorBf != null) { var anchorEst = estCirc(s, anchorBf, lbm)[k]; out[k] = r1(meas[k] + (est[k] - anchorEst)); }
    else out[k] = r1(est[k]);
  });
  out.weight = r1(kg); out.bf = r1(bf); out.lbm = r1(lbm);
  out.ratio = r2(out.shoulders / out.waist);
  return out;
}
function currentBody(s, today) {
  var meas = latestMeas(s, today), bf = currentBf(s, today), kg = latestWeight(s, today);
  return bodyProfile(s, kg, { bf: bf, meas: meas, anchorBf: bf, upto: today });
}
function goalBody(s, today) {
  var meas = latestMeas(s, today), bfNow = currentBf(s, today);
  return bodyProfile(s, s.profile.goalKg, { bf: s.profile.goalBf, meas: meas, anchorBf: bfNow, upto: today });
}
function startBody(s) { return bodyProfile(s, s.profile.startKg, { bf: s.profile.startBf }); }
/* pixel widths of a figure from circumferences (from the v6–v14 hologram; the body-proportion tests still use it). Always finite. */
function hologramGeometry(p, heightPx) {
  heightPx = heightPx || 400;
  var sc = heightPx / 178;
  function w(c, k) { var v = num(c, 0) / Math.PI * k * sc; return isFinite(v) && v > 0 ? r1(v) : r1(10 * sc); }
  var g = { heightPx: heightPx, scale: r2(sc),
    shoulderW: w(p.shoulders, 1.28), chestW: w(p.chest, 1.12), waistW: w(p.waist, 1.06), hipW: w(p.hips, 1.08),
    thighW: w(p.thigh, 1.0), armW: w(p.arms, 1.05), neckW: r1(13 * sc), headR: r1(11.5 * sc) };
  return g;
}
/* parameters for the 3D replica: circumferences + Pavi's shape (broad shoulders, love handles, chest) scaled by body fat + InBody segmental lean */
function bodyModel(s, profile, upto) {
  var p = profile, sh = s.shape, scan = latestScan(s, upto, 'seg'), seg = scan ? scan.seg : {};
  var fat = clamp((num(p.bf, 20) - 10) / 15, 0, 1.3);
  function segScale(v, base) { v = num(v, 0); return v > 0 ? r2(clamp(Math.sqrt(v / base), 0.8, 1.25)) : 1; }
  function c(v, d) { v = num(v, d); return v > 0 ? v : d; }
  return {
    heightM: r2(clamp(num(s.profile.heightCm, 178), 120, 230) / 100), weight: num(p.weight, s.profile.startKg), bf: num(p.bf, 20),
    circ: { waist: c(p.waist, 90), chest: c(p.chest, 100), shoulders: c(p.shoulders, 118), arms: c(p.arms, 34), hips: c(p.hips, 98), thigh: c(p.thigh, 57) },
    shoulderBreadth: clamp(num(sh.shoulders, 1), 0.85, 1.25),
    loveHandles: r2(clamp(num(sh.loveHandles, 0), 0, 1) * Math.min(1.2, fat)),
    belly: r2(clamp(num(sh.belly, 0), 0, 1) * Math.min(1.2, fat)),
    chest: r2(clamp(num(sh.chest, 0), 0, 1) * (sh.chestFloor + (1 - sh.chestFloor) * Math.min(1, fat))),
    back: clamp(num(sh.back, 0.8), 0, 1), lean: r2(clamp((20 - num(p.bf, 20)) / 5.5, 0, 1)),
    armL: segScale(seg.la, 4.1), armR: segScale(seg.ra, 4.1), legL: segScale(seg.ll, 9.8), legR: segScale(seg.rl, 9.8), trunk: segScale(seg.trunk, 31),
    ratio: num(p.ratio, 1.3)
  };
}

/* ───────────────────────── InBody scans ───────────────────────── */
var SCAN_NUM = ['weight', 'smm', 'bfm', 'pbf', 'lbm', 'score', 'age', 'visceral', 'bmr', 'whr'];
var SEG_KEYS = ['trunk', 'la', 'ra', 'll', 'rl'];
var SEG_NAMES = { trunk: 'Trunk', la: 'Left arm', ra: 'Right arm', ll: 'Left leg', rl: 'Right leg' };
var SCAN_LIMITS = { weight: [30, 250], smm: [10, 80], bfm: [1, 150], pbf: [3, 60], lbm: [20, 150], score: [0, 100], age: [10, 90], visceral: [1, 30], bmr: [800, 4000], whr: [0.5, 1.5] };
var SCAN_LABELS = { weight: 'Weight', smm: 'Skeletal muscle', bfm: 'Body fat mass', pbf: 'Body fat %', lbm: 'Lean mass', score: 'InBody score', age: 'InBody age', visceral: 'Visceral fat', bmr: 'BMR', whr: 'Waist-hip ratio' };
function scanVal(v) { if (v == null || v === '') return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : NaN; }
/* coerceScan keeps NaN for bad values so the form can flag them; derives the missing body-fat numbers */
function coerceScan(x) {
  if (!isObj(x)) return null;
  var o = { id: typeof x.id === 'string' && x.id ? cleanId(x.id) : 'scan-' + uid(), date: isKey(x.date) ? x.date : null,
    source: ['manual', 'screenshot', 'health', 'seed'].indexOf(x.source) >= 0 ? x.source : 'manual', note: String(x.note || '').slice(0, 120) };
  SCAN_NUM.forEach(function (k) { o[k] = scanVal(x[k]); });
  o.seg = {}; o.segPct = {};
  SEG_KEYS.forEach(function (k) { o.seg[k] = scanVal(isObj(x.seg) ? x.seg[k] : null); o.segPct[k] = scanVal(isObj(x.segPct) ? x.segPct[k] : null); });
  function ok(v) { return v != null && !isNaN(v) && v > 0; }
  if (ok(o.weight) && ok(o.bfm) && o.pbf == null) o.pbf = r1(o.bfm / o.weight * 100);
  if (ok(o.weight) && ok(o.pbf) && o.bfm == null) o.bfm = r1(o.weight * o.pbf / 100);
  if (ok(o.weight) && ok(o.lbm) && o.bfm == null) { o.bfm = r1(o.weight - o.lbm); if (o.pbf == null) o.pbf = r1(o.bfm / o.weight * 100); }
  if (ok(o.weight) && ok(o.bfm) && o.lbm == null) o.lbm = r1(o.weight - o.bfm);
  return o;
}
function normalizeScan(x) {
  var o = coerceScan(x); if (!o) return null;
  SCAN_NUM.forEach(function (k) { if (o[k] != null && isNaN(o[k])) o[k] = null; });
  SEG_KEYS.forEach(function (k) { if (o.seg[k] != null && isNaN(o.seg[k])) o.seg[k] = null; if (o.segPct[k] != null && isNaN(o.segPct[k])) o.segPct[k] = null; });
  return o;
}
function checkScan(o) {
  var e = [];
  if (!isObj(o)) return ['Not a scan'];
  if (!isKey(o.date)) e.push('Pick the scan date');
  if (o.weight == null) e.push('Weight is required');
  if (o.pbf == null) e.push('Body fat % (or body fat mass) is required');
  SCAN_NUM.forEach(function (k) { var v = o[k]; if (v == null) return; if (isNaN(v) || v < SCAN_LIMITS[k][0] || v > SCAN_LIMITS[k][1]) e.push(SCAN_LABELS[k] + ' must be ' + SCAN_LIMITS[k][0] + '–' + SCAN_LIMITS[k][1]); });
  if (o.weight > 0 && o.smm > 0 && o.smm >= o.weight) e.push('Skeletal muscle can’t be more than your weight');
  if (o.weight > 0 && o.bfm > 0 && o.bfm >= o.weight) e.push('Fat mass can’t be more than your weight');
  if (o.weight > 0 && o.bfm > 0 && o.lbm > 0 && Math.abs(o.bfm + o.lbm - o.weight) > 1.5) e.push('Fat mass + lean mass should add up to your weight');
  SEG_KEYS.forEach(function (k) {
    var v = o.seg && o.seg[k], p = o.segPct && o.segPct[k];
    if (v != null && (isNaN(v) || v < 0.5 || v > 60)) e.push(SEG_NAMES[k] + ' lean must be 0.5–60kg');
    if (p != null && (isNaN(p) || p < 40 || p > 200)) e.push(SEG_NAMES[k] + ' % must be 40–200');
  });
  return e;
}
function latestScan(s, upto, need) {
  var list = (s.inbody || []).filter(function (x) {
    if (upto && x.date > upto) return false;
    if (need === 'seg') return x.seg && SEG_KEYS.some(function (k) { return x.seg[k] > 0; });
    if (need) return x[need] != null;
    return true;
  });
  return list.length ? list[list.length - 1] : null;
}
function prevScan(s, scan) { var list = s.inbody.filter(function (x) { return x.date < scan.date; }); return list.length ? list[list.length - 1] : null; }
function scanDelta(a, b) { var d = {}; if (!a || !b) return d; SCAN_NUM.forEach(function (k) { if (a[k] != null && b[k] != null) d[k] = r2(a[k] - b[k]); }); SEG_KEYS.forEach(function (k) { if (a.seg[k] != null && b.seg[k] != null) d['seg.' + k] = r2(a.seg[k] - b.seg[k]); }); return d; }
function scanDue(s, today) { var l = latestScan(s, today); return !l || diffDays(l.date, today) >= s.plan.scanEveryDays; }
/* save a scan: replaces a scan on the same date, records the weigh-in and body fat for that day. Idempotent per token. */
function addScan(s, raw, token) {
  if (token && s.meta.committed.indexOf(token) >= 0) return { ok: false, reason: 'duplicate' };
  var sc = coerceScan(raw); if (!sc) return { ok: false, reason: 'invalid', errors: ['Not a scan'] };
  var errs = checkScan(sc); if (errs.length) return { ok: false, reason: 'invalid', errors: errs };
  sc = normalizeScan(sc);
  var replaced = null;
  s.inbody = s.inbody.filter(function (x) { if (x.date === sc.date) { replaced = x; return false; } return true; });
  s.inbody.push(sc); s.inbody.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var d = s.days[sc.date] || (s.days[sc.date] = emptyDay());
  var undo = { scanId: sc.id, replaced: replaced, day: sc.date, prevWeight: d.weight, prevBf: d.bf };
  // the scan keeps its own weight; your morning weigh-in for that day is never overwritten by it
  var keptWeighIn = d.weight != null && Math.abs(d.weight - sc.weight) > 0.001 && !(replaced && Math.abs(d.weight - replaced.weight) < 0.001);
  if (!keptWeighIn) d.weight = r2(sc.weight);
  d.bf = r1(sc.pbf);
  if (token) { s.meta.committed.push(token); if (s.meta.committed.length > 300) s.meta.committed = s.meta.committed.slice(-300); }
  return { ok: true, scan: sc, undo: undo, keptWeighIn: keptWeighIn ? d.weight : null };
}
function undoScan(s, u) {
  if (!u) return false;
  s.inbody = s.inbody.filter(function (x) { return x.id !== u.scanId; });
  if (u.replaced) { s.inbody.push(u.replaced); s.inbody.sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  var d = s.days[u.day]; if (d) { d.weight = u.prevWeight; d.bf = u.prevBf; }
  return true;
}
function removeScan(s, id) { var hit = null; s.inbody = s.inbody.filter(function (x) { if (x.id === id) { hit = x; return false; } return true; }); return hit; }
/* Claude's reading of InBody screenshots → { ok, scan, errors, error } */
function parseScanReply(text) {
  var o; try { o = extractJSON(text); } catch (e) { return { ok: false, error: 'The System couldn’t read that reply (' + e.message + ').' }; }
  if (!isObj(o)) return { ok: false, error: 'Reply wasn’t a scan.' };
  if (o.found === false) return { ok: false, error: o.message || 'No InBody numbers were found in those screenshots.' };
  function pick() { for (var i = 0; i < arguments.length; i++) if (o[arguments[i]] != null) return o[arguments[i]]; return null; }
  var sl = isObj(o.segmental_lean_kg) ? o.segmental_lean_kg : {}, sp = isObj(o.segmental_lean_pct) ? o.segmental_lean_pct : {};
  var raw = { source: 'screenshot', date: pick('date', 'test_date'), weight: pick('weight_kg', 'weight'), smm: pick('skeletal_muscle_mass_kg', 'smm'), bfm: pick('body_fat_mass_kg', 'bfm'),
    pbf: pick('percent_body_fat', 'body_fat_pct', 'pbf'), lbm: pick('lean_body_mass_kg', 'fat_free_mass_kg', 'lbm'), score: pick('inbody_score', 'score'), age: pick('inbody_age', 'age'),
    visceral: pick('visceral_fat_level', 'visceral'), bmr: pick('bmr_kcal', 'bmr'), whr: pick('waist_hip_ratio', 'whr'),
    seg: { trunk: sl.trunk, la: sl.left_arm, ra: sl.right_arm, ll: sl.left_leg, rl: sl.right_leg },
    segPct: { trunk: sp.trunk, la: sp.left_arm, ra: sp.right_arm, ll: sp.left_leg, rl: sp.right_leg } };
  var sc = coerceScan(raw);
  if (sc.weight == null && sc.smm == null && sc.pbf == null) return { ok: false, error: 'No InBody numbers were found in those screenshots.' };
  return { ok: true, scan: sc, errors: checkScan(sc) };
}
/* Apple Health / iPhone Shortcut values arrive as text like "89.2 kg", "24.9%", "0.249" or "196.7 lb" */
function healthNumber(v, kind) {
  if (v == null || v === '') return null;
  var str = typeof v === 'number' ? String(v) : String(v).trim().toLowerCase();
  if (str.indexOf('.') < 0) str = str.replace(',', '.');
  var m = str.match(/-?\d+(\.\d+)?/); if (!m) return NaN;
  var n = parseFloat(m[0]);
  if (kind === 'pct') { if (str.indexOf('%') < 0 && n > 0 && n <= 1) n = n * 100; return r1(n); }
  if (/\blb|lbs|pound/.test(str)) n = n / 2.20462;
  return r1(n);
}
function healthDate(v) {
  if (v == null || v === '') return null;
  var str = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(str)) return isKey(str.slice(0, 10)) ? str.slice(0, 10) : null;
  var t = Date.parse(str); return isFinite(t) ? dayKey(new Date(t)) : null;
}
function normalizeImport(obj) {
  if (!isObj(obj)) return null;
  function g() { for (var i = 0; i < arguments.length; i++) if (obj[arguments[i]] != null && obj[arguments[i]] !== '') return obj[arguments[i]]; return null; }
  var raw = { source: 'health', date: healthDate(g('date', 'd')), weight: healthNumber(g('weight', 'w', 'body_mass')), pbf: healthNumber(g('pbf', 'bf', 'body_fat', 'body_fat_percentage'), 'pct'),
    lbm: healthNumber(g('lbm', 'lean', 'lean_body_mass')), smm: healthNumber(g('smm')), bfm: healthNumber(g('bfm')), score: healthNumber(g('score')) };
  function real(v) { return v != null && !isNaN(v); } // text with no number in it reads as NaN: that is nothing, not a reading
  if (!real(raw.weight) && !real(raw.pbf) && !real(raw.lbm)) return null;
  return coerceScan(raw);
}
function parseImportQuery(search) {
  var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='), k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' ')), v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); q[k] = v; });
  if (!('inbody' in q)) return null;
  return normalizeImport(q);
}
var SCAN_XP = 100, SCAN_GOLD = 30, SCAN_FAT_XP = 60, SCAN_SMM_XP = 40;
/* one rewarded scan per week (Mon–Sun); bonus XP when fat mass drops and muscle holds */
function scanRewards(s, today) {
  var weeks = {}, xp = 0, gold = 0, n = 0, all = s.inbody;
  all.forEach(function (sc, i) {
    if (sc.date < s.profile.startDate || sc.date > today || sc.date > s.profile.seasonEnd) return;
    var wk = mondayOf(sc.date); if (weeks[wk]) return; weeks[wk] = 1; n++;
    var x = SCAN_XP, prev = all[i - 1];
    if (prev) { if (prev.bfm != null && sc.bfm != null && sc.bfm < prev.bfm - 0.05) x += SCAN_FAT_XP; if (prev.smm != null && sc.smm != null && sc.smm >= prev.smm - 0.2) x += SCAN_SMM_XP; }
    xp += x; gold += SCAN_GOLD;
  });
  return { xp: xp, gold: gold, scans: n };
}
function baselineScan(s) { var pre = s.inbody.filter(function (x) { return x.date < s.profile.startDate; }); return pre.length ? pre[pre.length - 1] : (s.inbody[0] || null); }

function journey(s, today) {
  var cur = latestWeight(s, today), total = s.profile.startKg - s.profile.goalKg;
  var lost = r1(Math.max(0, s.profile.startKg - cur));
  return { start: s.profile.startKg, current: cur, goal: s.profile.goalKg, lost: lost, toGo: r1(Math.max(0, cur - s.profile.goalKg)), pct: total > 0 ? clamp(Math.round((s.profile.startKg - cur) / total * 100), 0, 100) : 0 };
}
/* most weight lost so far, judged by the 7-day average of weigh-ins taken during the arc (one low reading after a sweaty game earns nothing) */
function maxKgLost(s) {
  var best = 0;
  weightSeries(s).forEach(function (w) { if (w.key < s.profile.startDate || w.key > s.profile.seasonEnd) return; var a = avgWindow(s, w.key, s.profile.startDate); if (a && s.profile.startKg - a.avg > best) best = s.profile.startKg - a.avg; });
  return r1(Math.max(0, best));
}
/* whole kilograms banked (each is worth 200 XP) */
function kgMilestones(s) { return Math.max(Math.floor(maxKgLost(s)), Math.round(num(s.player && s.player.msLegacy, 0))); }
function photoDue(s, today) { var l = s.settings.lastPhoto; return !isKey(l) || diffDays(l, today) >= 14; }

/* ───────────────────────── muscle heat map (last 7 days) ───────────────────────── */
var MUSCLES = ['shoulders', 'chest', 'arms', 'back', 'core', 'glutes', 'quads', 'hamstrings', 'calves'];
function muscleHeat(s, today) {
  var heat = {}; MUSCLES.forEach(function (m) { heat[m] = 0; });
  for (var i = 0; i < 7; i++) {
    var k = addDays(today, -i), d = s.days[k]; if (!d) continue;
    var wgt = 1 - i / 7;
    d.workouts.forEach(function (w) { var e = exerciseByKey(w.ex); if (!e) return; e.m.forEach(function (m, j) { heat[m] += w.sets.length * wgt * (j === 0 ? 1 : 0.5); }); });
  }
  MUSCLES.forEach(function (m) { heat[m] = r2(clamp(heat[m] / 10, 0, 1)); });
  return heat;
}
function muscleExercises(s, muscle) {
  var log = strengthLog(s);
  return EXERCISES.filter(function (e) { return e.m.indexOf(muscle) >= 0; }).map(function (e) { return { key: e.key, name: e.name, best: log.best[e.key] || null }; });
}

/* ───────────────────────── stats radar ───────────────────────── */
var STATS = [
  { id: 'STR', name: 'Strength', how: 'Train 3+ times a week, beat your lifts (PRs) and keep your skeletal muscle on InBody.' },
  { id: 'AGI', name: 'Agility', how: 'Play football and add ball-work or sprint sessions.' },
  { id: 'END', name: 'Endurance', how: 'Average 10k steps and add cardio sessions.' },
  { id: 'VIT', name: 'Vitality', how: 'Lights out on time, drink 3L and raise your InBody score.' },
  { id: 'DISC', name: 'Discipline', how: 'Land your calorie target and drop body fat mass on InBody.' },
  { id: 'FOCUS', name: 'Focus', how: 'Hit protein daily and chase Daily Clears.' }
];
function statsFor(s, end) {
  end = lastSeasonDay(s, end);
  var from = addDays(end, -27);
  var keys = rangeKeys(from, end).filter(function (k) { return k >= s.profile.startDate; });
  var N = keys.length;
  var zero = { STR: 0, AGI: 0, END: 0, VIT: 0, DISC: 0, FOCUS: 0, n: 0, parts: {} };
  if (!N) return zero;
  var gym = 0, foot = 0, agi = 0, steps = 0, cardio = 0, lights = 0, water = 0, cal = 0, prot = 0, clear = 0;
  keys.forEach(function (k) {
    var d = getDay(s, k), q = questStatus(s, k);
    gym += gymSessions(d) > 0 ? 1 : 0;
    foot += footballMinutes(d) > 0 ? 1 : 0;
    agi += d.activities.filter(function (a) { return a.type === 'sprint' || a.type === 'ballwork'; }).length;
    cardio += d.activities.filter(function (a) { return a.type === 'cardio'; }).length;
    steps += d.steps; lights += d.lightsOut ? 1 : 0; water += d.water >= dayRules(s, k).waterMl ? 1 : 0;
    cal += q[1].done ? 1 : 0; prot += q[0].done ? 1 : 0; clear += q.every(function (x) { return x.done; }) ? 1 : 0;
  });
  var prs = strengthLog(s).prs.filter(function (p) { return p.day >= from && p.day <= end; }).length;
  var wk = N / 7;
  // InBody: only scans taken during the season count
  var base = baselineScan(s), season = s.inbody.filter(function (x) { return x.date >= s.profile.startDate && x.date <= end && x !== base; });
  var latest = season.length ? season[season.length - 1] : null;
  var smmLatest = season.filter(function (x) { return x.smm != null; }).pop() || null;
  var smmKept = smmLatest && base && base.smm ? smmLatest.smm / base.smm : null;
  var smmScore = smmKept != null ? clamp((smmKept - 0.97) / 0.03, 0, 1) : 0;
  var scoreScan = season.filter(function (x) { return x.score != null && x.date >= from; }).pop() || null;
  var scoreF = scoreScan ? clamp((scoreScan.score - 60) / 40, 0, 1) : 0;
  var goalBfm = s.profile.goalKg * s.profile.goalBf / 100;
  var fatLost = latest && base && latest.bfm != null && base.bfm != null ? base.bfm - latest.bfm : null;
  var fatProg = fatLost != null && base.bfm > goalBfm ? clamp(fatLost / (base.bfm - goalBfm), 0, 1) : 0;
  var o = {
    STR: Math.min(1, gym / (wk * 3)) * 50 + Math.min(25, prs * 6) + smmScore * 25,
    AGI: foot / wk * 30 + agi / wk * 20,
    END: (steps / N) / 10000 * 80 + cardio / wk * 10,
    VIT: lights / N * 45 + water / N * 35 + scoreF * 20,
    DISC: cal / N * 75 + fatProg * 25,
    FOCUS: prot / N * 60 + clear / N * 40
  };
  Object.keys(o).forEach(function (k) { o[k] = Math.round(clamp(isFinite(o[k]) ? o[k] : 0, 0, 100)); });
  o.n = N;
  o.parts = { gymDays: gym, prs: prs, footballDays: foot, agilitySessions: agi, avgSteps: Math.round(steps / N), cardio: cardio, lightsNights: lights, waterDays: water, calorieDays: cal, proteinDays: prot, clearDays: clear, smmKeptPct: smmKept != null ? r1(smmKept * 100) : null, inbodyScore: scoreScan ? scoreScan.score : null, fatLostKg: fatLost != null ? r1(fatLost) : null };
  return o;
}

/* ───────────────────────── anime achievement ladders ───────────────────────── */
function L(series, icon, metric, unit, thresholds, names) { return { series: series, icon: icon, metric: metric, unit: unit, thresholds: thresholds, names: names }; }
var LADDERS = [
  L('Baki', '💪', 'prs', ['PR', 'PRs'], [1, 2, 3, 5, 7, 10, 13, 16, 20, 25, 30, 36, 42, 50, 60, 75],
    ['Arena Rookie', 'Underground Arena', 'Shadow Training', 'Whip Strike', 'Mach Punch', 'Cockroach Dash', 'Image Training', 'Demon Back', 'Grappler', 'Maximum Tournament', 'Raitai Tournament', 'Toughest Grappler', 'Champion of the Arena', 'Strongest Creature', 'Ultimate Grappler', 'Ogre Mode']),
  L('One Piece', '🏴‍☠️', 'kgLost', 'kg lost', [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11],
    ['Set Sail', 'East Blue', 'Gomu Gomu', 'Loguetown', 'Grand Line', 'Gear Second', 'Alabasta', 'Skypiea', 'Enies Lobby', 'Gear Third', 'Haki Awakened', 'Gear Fourth', 'New World', 'Gear Fifth', 'King of the Pirates']),
  L('Blue Lock', '⚽', 'football', ['football session', 'football sessions'], [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40],
    ['First Selection', 'Ego Awakened', 'Direct Shot', 'Spatial Awareness', 'Flow State', 'Second Selection', 'Meta Vision', 'Chemical Reaction', 'Third Selection', 'U-20 Match', 'Devouring', 'Direct Volley', 'Neo Egoist League', 'Ego Rank Up', 'World-Class Striker', 'Number One Striker']),
  L('Inazuma Eleven', '⚡', 'agility', ['ball-work/sprint session', 'ball-work/sprint sessions'], [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32],
    ['Raimon Kick-off', 'Spinning Cut', 'Fire Tornado', 'Dragon Crash', 'Twin Boost', 'God Hand', 'Inazuma Drop', 'Inazuma Break', 'Death Zone', 'Majin The Hand', 'Grand Fire', 'Last Resort', 'Football Frontier', 'Inazuma Japan', 'FFI Champion', 'Legend of Raimon']),
  L('Hunter x Hunter', '🃏', 'bestProtein', 'day protein streak', [1, 2, 3, 5, 7, 10, 14, 18, 21, 28, 35, 42, 50, 60, 75, 90],
    ['Hunter Exam', 'Nen Awakened', 'Ten', 'Zetsu', 'Ren', 'Hatsu', 'Gyo', 'In', 'En', 'Ken', 'Ryu', 'Ko', 'Enhancer', 'Specialist', 'Zodiac', 'Chairman']),
  L('Jujutsu Kaisen', '🟣', 'calHits', ['calorie target hit', 'calorie targets hit'], [1, 3, 5, 7, 10, 14, 18, 22, 26, 30, 35, 40, 50, 60, 75, 90],
    ['Cursed Energy', 'Grade 4', 'Grade 3', 'Grade 2', 'Semi-Grade 1', 'Black Flash', 'Grade 1', 'Reverse Cursed Technique', 'Simple Domain', 'Domain Expansion', 'Divergent Fist', 'Special Grade', 'Infinity', 'Hollow Purple', 'Malevolent Shrine', 'Honored One']),
  L('Fullmetal Alchemist', '⚗️', 'deficit', 'kcal of planned deficit banked', [1000, 2500, 5000, 7700, 10000, 15000, 20000, 25000, 30000, 38500, 46000, 54000, 60000, 66000, 71000, 76000],
    ['Equivalent Exchange', 'Transmutation Circle', 'Alchemist Exam', 'State Alchemist', 'Iron Blood', 'Strong Arm', 'Flame Alchemist', 'Gate of Truth', 'Law of Conservation', 'Promised Day', 'Truth Seen', 'Fullmetal', 'All is One', 'One is All', 'Brotherhood', 'Philosopher’s Will']),
  L('Naruto', '🍥', 'daysLogged', ['day logged', 'days logged'], [1, 3, 5, 7, 10, 14, 21, 30, 40, 50, 60, 70, 80, 90, 100, 120],
    ['Academy Student', 'Genin', 'Shadow Clone', 'Chunin', 'Rasengan', 'Jonin', 'Sage Mode', 'Rasenshuriken', 'Nine Tails Mode', 'Six Paths', 'Kage', 'Hokage', 'Baryon Mode', 'Will of Fire', 'Hidden Leaf Legend', 'Seventh Hokage']),
  L('Beyblade Metal', '🌀', 'bestClear', 'day Daily Clear streak', [1, 2, 3, 4, 5, 7, 10, 14, 18, 21, 28, 35, 42, 50, 60, 75],
    ['Let It Rip', 'Storm Pegasus', 'Rock Leone', 'Earth Eagle', 'Lightning L-Drago', 'Flame Sagittario', 'Dark Bull', 'Galaxy Pegasus', 'Big Bang Pegasis', 'Phantom Orion', 'Star Blast Attack', 'Galaxy Nova', 'Dragon Emperor Soaring', 'Battle Bladers', 'World Champion', 'Legendary Blader']),
  L('Black Clover', '📕', 'penalties', ['Penalty Quest completed', 'Penalty Quests completed'], [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 25, 30, 40, 50],
    ['Grimoire Received', 'Anti-Magic', 'Black Bull', 'Demon-Slayer Sword', 'Black Divider', 'Black Hurricane', 'Demon-Dweller', 'Magic Knight', 'Black Asura', 'Junior Magic Knight', 'Senior Magic Knight', 'Black Meteorite', 'Black Form', 'Union Mode', 'Captain', 'Wizard King']),
  L("Hell's Paradise", '🌸', 'steps', 'total steps', [10000, 25000, 50000, 100000, 150000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1200000],
    ['Shinsenkyo Shore', 'Execution Pardon', 'Tao Sense', 'Tao Flow', 'Yin and Yang', 'Five Elements', 'Wood Tao', 'Fire Tao', 'Water Tao', 'Earth Tao', 'Metal Tao', 'Lord Tensen', 'Horai Palace', 'Elixir of Life', 'Paradise Escaped']),
  L('Fairy Tail', '🔥', 'lights', ['lights-out check-in', 'lights-out check-ins'], [1, 3, 5, 7, 10, 14, 21, 28, 35, 42, 50, 60, 70, 80, 90],
    ['Guild Mark', 'Fire Dragon Roar', 'Requip', 'Dragon Slayer', 'S-Class Trial', 'Dragon Force', 'Unison Raid', 'Fairy Glitter', 'Fairy Law', 'Fairy Sphere', 'Grand Magic Games', 'Wizard Saint', 'Ten Wizard Saints', 'Guild Master', 'Fairy Heart']),
  L('Sakamoto Days', '🏪', 'bfDropped', '% body fat dropped', [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10],
    ['Retired Assassin', 'Shopkeeper', 'Morning Run', 'Slim Form Glimpse', 'Hitman Reflexes', 'Assassin Instinct', 'Lethal Precision', 'Order Candidate', 'JCC Graduate', 'Slim Form', 'Back in Form', 'Legendary Hitman', 'Order Member', 'Peak Condition', 'The Strongest Hitman']),
  L('Dr. Stone', '🧪', 'scans', ['InBody scan', 'InBody scans'], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    ['Revival Fluid', 'Stone World', 'Kingdom of Science', 'Ten Billion Percent', 'Sulfa Drug', 'Glass Lab', 'Radio Waves', 'Steam Engine', 'Iron Smelting', 'Electric Light', 'Medusa Decoded', 'Petrification Cure', 'Treasure Island', 'Science Kingdom', 'Moon Mission'])
];
var ACH_XP = 50, ACH_GOLD = 15;
function slug(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
var ACHIEVEMENTS = [];
LADDERS.forEach(function (lad) {
  lad.names.forEach(function (n, i) {
    if (i >= lad.thresholds.length) return;
    var th = lad.thresholds[i], u = Array.isArray(lad.unit) ? (th === 1 ? lad.unit[0] : lad.unit[1]) : lad.unit;
    ACHIEVEMENTS.push({ id: slug(lad.series) + '_' + i, series: lad.series, icon: lad.icon, name: n, metric: lad.metric, th: th, tier: i + 1, desc: (th >= 1000 ? th.toLocaleString('en-GB') : th) + ' ' + u });
  });
});
function metrics(s, today) {
  var st = streaks(s, today), keys = rangeKeys(s.profile.startDate, lastSeasonDay(s, today));
  var m = { prs: seasonPRs(s).length, kgLost: maxKgLost(s), football: 0, agility: 0, bestProtein: st.bestProtein, calHits: 0, deficit: 0, daysLogged: 0, bestClear: st.bestClear, penalties: 0, steps: 0, lights: 0, bfDropped: 0, scans: scanRewards(s, today).scans };
  keys.forEach(function (k) {
    var d = s.days[k]; if (!d) return;
    m.football += d.activities.filter(function (a) { return a.type === 'football'; }).length;
    m.agility += d.activities.filter(function (a) { return a.type === 'sprint' || a.type === 'ballwork'; }).length;
    // deficit banked: only what the plan asks for, and only on days you ate at least your floor (a bigger hole earns nothing extra)
    if (d.foods.length) { m.daysLogged += 1; if (questStatus(s, k)[1].done) m.calHits += 1; if (k < today && dayTotals(d).cal >= dayRules(s, k).floor) m.deficit += Math.max(0, Math.min(deficit(s, d), plannedDeficit(s, k))); }
    m.steps += d.steps; if (d.lightsOut) m.lights += 1;
    var pen = penaltyFor(s, k); if (pen && pen.done) m.penalties += 1;
  });
  var endK = lastSeasonDay(s, today), bfs = bfMeasurements(s, endK).filter(function (b) { return b.key >= s.profile.startDate; }), minBf = Math.min(bfs.length ? Math.min.apply(null, bfs.map(function (b) { return b.bf; })) : 99, estBf(s, s.profile.startKg - m.kgLost, endK));
  m.bfDropped = r1(Math.max(0, s.profile.startBf - minBf));
  return m;
}
/* returns achievements newly earned (not already in s.player.ach). Never returns one twice. */
function newAchievements(s, today) {
  var m = metrics(s, today);
  return ACHIEVEMENTS.filter(function (a) { return !s.player.ach[a.id] && m[a.metric] >= a.th; });
}
/* a weigh-in was corrected or removed: take back whatever only the wrong number had earned (kg and body-fat awards,
   the kg milestones, and the level if those had lifted it). Everything else you earned stays. */
function recalcProgress(s, today) {
  var m = metrics(s, today), removed = [], at = s.player.msLegacyAt, low = null;
  // what single readings had already banked before v12 arrived stays banked, unless it is one of THOSE readings being corrected
  if (at) weightSeries(s).forEach(function (w) { if (w.key <= at && (low == null || w.kg < low)) low = w.kg; });
  var legacyKg = low == null ? 0 : r1(Math.max(0, s.profile.startKg - low)), wasLegacy = num(s.player.msLegacy, 0);
  var legacyBf = legacyKg > 0 ? r1(Math.max(0, s.profile.startBf - estBf(s, s.profile.startKg - legacyKg, today))) : 0; // the estimated body fat that weight stood for
  ACHIEVEMENTS.forEach(function (a) { if ((a.metric === 'kgLost' || a.metric === 'bfDropped') && s.player.ach[a.id] && !(Math.max(m[a.metric], s.player.ach[a.id] <= at ? (a.metric === 'kgLost' ? legacyKg : legacyBf) : 0) >= a.th)) { delete s.player.ach[a.id]; removed.push(a.name); } });
  s.player.msLegacy = Math.min(wasLegacy, Math.floor(legacyKg)) > Math.floor(maxKgLost(s)) ? Math.min(wasLegacy, Math.floor(legacyKg)) : 0;
  var ms = kgMilestones(s), dropped = removed.length > 0 || s.player.msLegacy < wasLegacy || s.player.seenKgMilestone > ms;
  if (s.player.seenKgMilestone > ms) s.player.seenKgMilestone = ms;
  var lv = levelFor(ledger(s, today).xpEarned);
  if (dropped && s.player.maxLevel > lv) { s.player.maxLevel = lv; if (s.player.seenLevel > lv) s.player.seenLevel = lv; }
  return { removed: removed, level: lv, changed: dropped };
}
function ladderProgress(s, today) {
  var m = metrics(s, today);
  return LADDERS.map(function (lad) {
    var list = ACHIEVEMENTS.filter(function (a) { return a.series === lad.series; });
    var got = list.filter(function (a) { return s.player.ach[a.id]; }).length;
    var next = list.filter(function (a) { return !s.player.ach[a.id]; })[0] || null;
    var prevTh = got > 0 ? list[got - 1].th : 0;
    var pct = next ? clamp((m[lad.metric] - prevTh) / (next.th - prevTh), 0, 1) : 1;
    return { series: lad.series, metric: lad.metric, icon: lad.icon, value: m[lad.metric], unit: Array.isArray(lad.unit) ? lad.unit[1] : lad.unit, got: got, total: list.length, next: next, pct: r2(pct), list: list };
  });
}

/* ───────────────────────── XP, levels, ranks, gold ───────────────────────── */
function xpThreshold(n) { n = Math.max(1, Math.floor(n)); return n <= 1 ? 0 : Math.round(100 * Math.pow(n, 1.5)); }
function levelFor(xp) { var n = 1; xp = num(xp); while (n < 999 && xp >= xpThreshold(n + 1)) n++; return n; }
var RANKS = [{ r: 'E', min: 1 }, { r: 'D', min: 10 }, { r: 'C', min: 20 }, { r: 'B', min: 30 }, { r: 'A', min: 40 }, { r: 'S', min: 50 }];
function rankFor(level) { var out = 'E'; RANKS.forEach(function (x) { if (level >= x.min) out = x.r; }); return out; }
function ledger(s, today) {
  var xp = 0, gold = 0, lines = { quests: 0, clears: 0, streak: 0, penalties: 0, bosses: 0, trials: 0, achievements: 0, prs: 0, milestones: 0, inbody: 0 };
  if (today >= s.profile.startDate) {
    var st = streaks(s, today);
    rangeKeys(s.profile.startDate, lastSeasonDay(s, today)).forEach(function (k) {
      if (!s.days[k] && k !== today) {
        // nothing logged: no quests done; penalty for this day can still exist but requires data → skip
        return;
      }
      var q = questStatus(s, k);
      q.forEach(function (x) { if (x.done) { xp += x.xp; gold += x.gold; lines.quests += x.xp; } });
      if (q.every(function (x) { return x.done; })) { xp += CLEAR_XP; gold += CLEAR_GOLD; lines.clears += CLEAR_XP; var b = streakBonus(st.perDay[k] || 0); xp += b; lines.streak += b; }
      var p = penaltyFor(s, k); if (p && p.done) { xp += PENALTY_XP; gold += PENALTY_GOLD; lines.penalties += PENALTY_XP; }
    });
    bossesUpTo(s, today).forEach(function (b) { if (b.defeated) { xp += BOSS_XP; gold += BOSS_GOLD; lines.bosses += BOSS_XP; } });
  }
  var td = trialsDone(s); xp += td * TRIAL_XP; gold += td * TRIAL_GOLD; lines.trials = td * TRIAL_XP;
  var ac = Object.keys(s.player.ach).length; xp += ac * ACH_XP; gold += ac * ACH_GOLD; lines.achievements = ac * ACH_XP;
  var pr = seasonPRs(s).length; xp += pr * 25; gold += pr * 5; lines.prs = pr * 25;
  var ms = kgMilestones(s); xp += ms * 200; gold += ms * 50; lines.milestones = ms * 200;
  var sr = scanRewards(s, today); xp += sr.xp; gold += sr.gold; lines.inbody = sr.xp;
  var spent = s.shop.purchases.reduce(function (a, b) { return a + b.cost; }, 0);
  return { xpEarned: xp, goldEarned: gold, spent: spent, lines: lines };
}
function player(s, today) {
  var lg = ledger(s, today);
  var floorXp = xpThreshold(s.player.maxLevel || 1);
  var xp = Math.max(lg.xpEarned, floorXp);
  var level = levelFor(xp), rank = rankFor(level);
  var cur = xpThreshold(level), next = xpThreshold(level + 1);
  return { xp: xp, earned: lg.xpEarned, level: level, rank: rank, intoLevel: xp - cur, levelSpan: next - cur, pct: r2((xp - cur) / (next - cur)), nextAt: next,
    gold: Math.max(0, lg.goldEarned - lg.spent), goldEarned: lg.goldEarned, spent: lg.spent, lines: lg.lines, floored: lg.xpEarned < floorXp };
}
function canBuy(s, today, cost) { return player(s, today).gold >= cost; }
function titles(s, today) {
  var out = [];
  var lv = player(s, today).level;
  RANKS.forEach(function (r) { if (lv >= r.min) out.push(r.r + '-Rank Player'); });
  ACHIEVEMENTS.forEach(function (a) { if (s.player.ach[a.id]) out.push(a.name); });
  bossesUpTo(s, today).forEach(function (b) { if (b.defeated && out.indexOf(b.loot) < 0) out.push(b.loot); });
  duelTitles(s).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
  heroStatus(s, today).slots.forEach(function (h) { if (h.unlocked && out.indexOf(h.title) < 0) out.push(h.title); });
  return out;
}

/* ───────────────────────── AI parse validation ───────────────────────── */
var LIMITS = { cal: [0, 5000], p: [0, 400], c: [0, 800], s: [0, 500], f: [0, 400], fib: [0, 150], water: [1, 10000], steps: [1, 100000], weight: [30, 250], bf: [3, 60], meas: [20, 250], kg: [0, 500], reps: [1, 100], sets: [1, 20], min: [1, 300], kcal: [0, 3000] };
function extractJSON(text) {
  if (isObj(text) || Array.isArray(text)) return text;
  if (typeof text !== 'string') throw new Error('Empty reply');
  var t = text.trim(); if (!t) throw new Error('Empty reply');
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  var a = t.indexOf('{'), b = t.lastIndexOf('}'), a2 = t.indexOf('['), b2 = t.lastIndexOf(']');
  var cand = null;
  if (a >= 0 && b > a && (a2 < 0 || a < a2)) cand = t.slice(a, b + 1);
  else if (a2 >= 0 && b2 > a2) cand = t.slice(a2, b2 + 1);
  if (!cand) throw new Error('No JSON found in reply');
  return JSON.parse(cand);
}
var KINDS = ['food', 'exercise', 'activity', 'body', 'water'];
var TYPE_TO_KIND = { food: 'food', training: 'exercise', exercise: 'exercise', workout: 'exercise', activity: 'activity', steps: 'activity', body: 'body', weight: 'body', water: 'water' };
function inRange(v, lim) { return typeof v === 'number' && isFinite(v) && v >= lim[0] && v <= lim[1]; }
/* checks one item, returns array of human-readable errors (empty = valid) */
function checkItem(it) {
  var e = [];
  if (!isObj(it)) return ['Not an item'];
  if (KINDS.indexOf(it.kind) < 0) return ['Unknown type'];
  if (it.kind === 'food') {
    if (!String(it.name || '').trim()) e.push('Name missing');
    [['cal', 'Calories'], ['p', 'Protein'], ['c', 'Carbs'], ['s', 'Sugar'], ['f', 'Fat'], ['fib', 'Fibre']].forEach(function (f) { if (!inRange(it[f[0]], LIMITS[f[0]])) e.push(f[1] + ' must be ' + LIMITS[f[0]][0] + '–' + LIMITS[f[0]][1]); });
    if (inRange(it.s, LIMITS.s) && inRange(it.c, LIMITS.c) && it.s > it.c + 0.5) e.push('Sugar can’t exceed carbs');
    if (inRange(it.cal, LIMITS.cal) && inRange(it.p, LIMITS.p) && inRange(it.c, LIMITS.c) && inRange(it.f, LIMITS.f)) {
      var macroCal = it.p * 4 + it.c * 4 + it.f * 9;
      if (macroCal > it.cal * 1.6 + 60) e.push('Macros don’t add up to the calories');
    }
  } else if (it.kind === 'exercise') {
    if (!String(it.name || '').trim()) e.push('Exercise name missing');
    if (!Array.isArray(it.sets) || !it.sets.length) e.push('No sets');
    else { if (it.sets.length > LIMITS.sets[1]) e.push('Too many sets'); it.sets.forEach(function (st, i) { if (!isObj(st) || !inRange(st.kg, LIMITS.kg)) e.push('Set ' + (i + 1) + ': weight must be 0–500kg'); else if (!inRange(st.reps, LIMITS.reps)) e.push('Set ' + (i + 1) + ': reps must be 1–100'); }); }
  } else if (it.kind === 'activity') {
    if (it.type === 'steps') { if (!inRange(it.steps, LIMITS.steps)) e.push('Steps must be 1–100,000'); }
    else { if (ACTIVITY_TYPES.indexOf(it.type) < 0) e.push('Unknown activity'); if (!inRange(it.min, LIMITS.min)) e.push('Minutes must be 1–300'); if (it.kcal != null && !inRange(it.kcal, LIMITS.kcal)) e.push('kcal must be 0–3000'); }
  } else if (it.kind === 'body') {
    var any = false;
    if (it.weight != null) { any = true; if (!inRange(it.weight, LIMITS.weight)) e.push('Weight must be 30–250kg'); }
    if (it.bf != null) { any = true; if (!inRange(it.bf, LIMITS.bf)) e.push('Body fat must be 3–60%'); }
    ['waist', 'chest', 'shoulders', 'arms'].forEach(function (k) { if (it[k] != null) { any = true; if (!inRange(it[k], LIMITS.meas)) e.push(k + ' must be 20–250cm'); } });
    if (!any) e.push('No measurement given');
  } else if (it.kind === 'water') {
    if (!inRange(it.ml, LIMITS.water)) e.push('Water must be 1–10,000ml');
  }
  return e;
}
function toNum(x) { if (x == null || x === '') return null; var n = num(x, NaN); return isNaN(n) ? NaN : n; }
/* coerce one raw AI item into our shape (no clamping — out-of-range stays visible so checkItem can flag it) */
function coerceItem(raw, fallbackKind) {
  if (!isObj(raw)) return null;
  var kind = raw.kind || raw.type_kind || TYPE_TO_KIND[raw.kind] || fallbackKind;
  if (TYPE_TO_KIND[kind]) kind = TYPE_TO_KIND[kind];
  if (!kind && (raw.calories != null || raw.cal != null)) kind = 'food';
  if (!kind && Array.isArray(raw.sets)) kind = 'exercise';
  if (!kind && raw.ml != null) kind = 'water';
  if (!kind && (raw.weight != null || raw.weight_kg != null)) kind = 'body';
  if (!kind && (raw.steps != null || raw.minutes != null)) kind = 'activity';
  var it = { kind: kind, _id: uid() };
  if (kind === 'food') {
    it.name = String(raw.name || '').trim().slice(0, 80); it.qty = String(raw.quantity != null ? raw.quantity : (raw.qty || '')).slice(0, 40);
    it.cal = toNum(raw.calories != null ? raw.calories : raw.cal); it.p = toNum(raw.protein_g != null ? raw.protein_g : raw.p); it.c = toNum(raw.carbs_g != null ? raw.carbs_g : raw.c);
    it.s = toNum(raw.sugar_g != null ? raw.sugar_g : raw.s); it.f = toNum(raw.fat_g != null ? raw.fat_g : raw.f); it.fib = toNum(raw.fibre_g != null ? raw.fibre_g : (raw.fiber_g != null ? raw.fiber_g : raw.fib));
    if (it.s == null) it.s = 0; if (it.fib == null) it.fib = 0;
    it.conf = ['high', 'medium', 'low'].indexOf(raw.confidence) >= 0 ? raw.confidence : 'medium';
    it.note = String(raw.assumption || raw.note || '').slice(0, 200);
    it.meal = ['breakfast', 'lunch', 'dinner', 'snack'].indexOf(raw.meal) >= 0 ? raw.meal : null;
  } else if (kind === 'exercise') {
    it.name = String(raw.name || raw.exercise || '').trim().slice(0, 60);
    var sets = [];
    if (Array.isArray(raw.sets)) raw.sets.forEach(function (st) { if (isObj(st)) sets.push({ kg: toNum(st.kg != null ? st.kg : (st.weight_kg != null ? st.weight_kg : 0)), reps: toNum(st.reps) }); });
    else if (raw.sets != null && raw.reps != null) { var ns = Math.round(num(raw.sets)); for (var i = 0; i < Math.min(ns, 21); i++) sets.push({ kg: toNum(raw.kg != null ? raw.kg : (raw.weight_kg || 0)), reps: toNum(raw.reps) }); }
    it.sets = sets;
    var m = matchExercise(it.name); it.ex = m ? m.key : null; if (m) it.display = m.name;
    it.warn = avoidWarning(it.name);
  } else if (kind === 'activity') {
    var ty = String(raw.activity || raw.type || '').toLowerCase();
    if (raw.steps != null && (ty === '' || ty === 'steps' || ty === 'activity')) { it.type = 'steps'; it.steps = toNum(raw.steps); }
    else {
      if (/foot|soccer|5.?a.?side|futsal/.test(ty)) ty = 'football'; else if (/\babs\b|core|plank/.test(ty)) ty = 'abs'; else if (/sprint/.test(ty)) ty = 'sprint'; else if (/ball|drill|skill/.test(ty)) ty = 'ballwork';
      else if (/gym|weights|lift/.test(ty)) ty = 'gym'; else if (/walk|incline|run|cardio|cycle|bike|swim|row/.test(ty)) ty = 'cardio';
      it.type = ACTIVITY_TYPES.indexOf(ty) >= 0 ? ty : 'other';
      it.min = toNum(raw.minutes != null ? raw.minutes : (raw.min != null ? raw.min : (raw.hours != null ? num(raw.hours) * 60 : null)));
      it.kcal = raw.kcal != null ? toNum(raw.kcal) : null;
      it.label = String(raw.name || raw.activity || it.type);
    }
  } else if (kind === 'body') {
    it.weight = toNum(raw.weight_kg != null ? raw.weight_kg : raw.weight); it.bf = toNum(raw.body_fat_pct != null ? raw.body_fat_pct : raw.bf);
    ['waist', 'chest', 'shoulders', 'arms'].forEach(function (k) { var v = raw[k + '_cm'] != null ? raw[k + '_cm'] : raw[k]; if (v != null) it[k] = toNum(v); });
    ['weight', 'bf', 'waist', 'chest', 'shoulders', 'arms'].forEach(function (k) { if (it[k] == null) delete it[k]; });
  } else if (kind === 'water') {
    it.ml = toNum(raw.ml != null ? raw.ml : (raw.litres != null ? num(raw.litres) * 1000 : raw.amount_ml));
  }
  return it;
}
/* parseReply: raw Claude text → { ok, items, error } — never throws */
function parseReply(text) {
  var obj;
  try { obj = extractJSON(text); } catch (e) { return { ok: false, items: [], error: 'The System couldn’t read that reply (' + e.message + ').' }; }
  var list, fallback = null;
  if (Array.isArray(obj)) list = obj;
  else if (isObj(obj)) { list = Array.isArray(obj.items) ? obj.items : null; fallback = TYPE_TO_KIND[String(obj.type || '').toLowerCase()] || null; if (obj.type === 'unknown' || obj.type === 'none') return { ok: false, items: [], error: obj.message || 'The System didn’t recognise anything to log.' }; }
  if (!list) return { ok: false, items: [], error: 'Reply had no items.' };
  var items = list.map(function (r) { return coerceItem(r, fallback); }).filter(function (x) { return x && KINDS.indexOf(x.kind) >= 0; });
  if (!items.length) return { ok: false, items: [], error: 'Nothing loggable was found.' };
  items.forEach(function (it) { it.errors = checkItem(it); });
  return { ok: true, items: items, error: null };
}
function defaultMeal(timeStr) {
  var p = String(timeStr || '12:00').split(':'), m = (+p[0]) * 60 + (+p[1] || 0);
  if (m < 11 * 60) return 'breakfast'; if (m < 15 * 60) return 'lunch'; if (m < 17 * 60 + 30) return 'snack'; return 'dinner';
}
/* commitItems: applies confirmed items to a day. Idempotent per token (double-tap safe). Refuses if any item invalid. */
function commitItems(s, k, items, token, nowMs, timeStr) {
  if (!isKey(k)) return { ok: false, reason: 'bad-date' };
  if (token && s.meta.committed.indexOf(token) >= 0) return { ok: false, reason: 'duplicate' };
  if (!Array.isArray(items) || !items.length) return { ok: false, reason: 'empty' };
  for (var i = 0; i < items.length; i++) { var errs = checkItem(items[i]); if (errs.length) return { ok: false, reason: 'invalid', errors: errs }; }
  var d = s.days[k] ? s.days[k] : (s.days[k] = emptyDay());
  var t = num(nowMs, Date.now()), meal = defaultMeal(timeStr), added = [];
  items.forEach(function (it, i) {
    if (it.kind === 'food') { var f = normalizeFood({ id: uid(), meal: it.meal || meal, name: it.name, qty: it.qty, cal: it.cal, p: it.p, c: it.c, s: it.s, f: it.f, fib: it.fib, conf: it.conf, note: it.note, t: t + i, tr: it.tr }); d.foods.push(f); added.push({ list: 'foods', id: f.id }); }
    else if (it.kind === 'exercise') { var w = normalizeWorkout({ id: uid(), ex: it.ex || it.name, name: it.name, sets: it.sets, t: t + i }); if (w) { d.workouts.push(w); added.push({ list: 'workouts', id: w.id }); } }
    else if (it.kind === 'activity') {
      if (it.type === 'steps') { added.push({ field: 'steps', prev: d.steps }); d.steps = Math.round(it.steps); }
      else { var a = normalizeActivity({ id: uid(), type: it.type, min: it.min, kcal: it.kcal || 0, t: t + i, lvl: it.lvl, int: it.int }); d.activities.push(a); added.push({ list: 'activities', id: a.id }); }
    }
    else if (it.kind === 'body') {
      if (it.weight != null) { added.push({ field: 'weight', prev: d.weight }); d.weight = r2(it.weight); }
      if (it.bf != null) { added.push({ field: 'bf', prev: d.bf }); d.bf = r1(it.bf); }
      ['waist', 'chest', 'shoulders', 'arms'].forEach(function (m) { if (it[m] != null) { added.push({ field: 'meas.' + m, prev: d.meas[m] == null ? null : d.meas[m] }); d.meas[m] = r1(it[m]); } });
    }
    else if (it.kind === 'water') { added.push({ field: 'water', prev: d.water }); d.water = Math.round(d.water + it.ml); }
  });
  if (token) { s.meta.committed.push(token); if (s.meta.committed.length > 300) s.meta.committed = s.meta.committed.slice(-300); }
  return { ok: true, undo: { day: k, added: added } };
}
function undoCommit(s, undo) {
  if (!undo || !s.days[undo.day]) return false;
  var d = s.days[undo.day];
  undo.added.slice().reverse().forEach(function (a) {
    if (a.list) d[a.list] = d[a.list].filter(function (x) { return x.id !== a.id; });
    else if (a.field && a.field.indexOf('meas.') === 0) { var m = a.field.slice(5); if (a.prev == null) delete d.meas[m]; else d.meas[m] = a.prev; }
    else if (a.field) d[a.field] = a.prev;
  });
  return true;
}
function removeEntry(s, k, list, id) {
  var d = s.days[k]; if (!d || !Array.isArray(d[list])) return null;
  var idx = -1; d[list].forEach(function (x, i) { if (x.id === id) idx = i; });
  if (idx < 0) return null;
  var item = d[list].splice(idx, 1)[0];
  return { day: k, list: list, item: item, idx: idx };
}
function restoreEntry(s, rem) {
  if (!rem) return false; var d = s.days[rem.day] || (s.days[rem.day] = emptyDay());
  if (d[rem.list].some(function (x) { return x.id === rem.item.id; })) return false;
  d[rem.list].splice(Math.min(rem.idx, d[rem.list].length), 0, rem.item); return true;
}
function savedMealItems(meal) { return (meal.items || []).map(function (f) { return { kind: 'food', _id: uid(), name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib, conf: 'high', note: 'Saved meal: ' + meal.name, meal: null }; }); }

/* ───────────────────────── food library & search (MyFitnessPal-style) ───────────────────────── */
var MACRO_KEYS = ['cal', 'p', 'c', 's', 'f', 'fib'];
var PER100_MAX = { cal: 950, p: 100, c: 100, s: 100, f: 100, fib: 100 };
function macroObj(x) {
  if (!isObj(x)) return null;
  function g() { for (var i = 0; i < arguments.length; i++) { var v = x[arguments[i]]; if (v != null && v !== '') return scanVal(v); } return null; }
  var o = { cal: g('cal', 'kcal', 'calories', 'energy_kcal'), p: g('p', 'protein_g', 'protein'), c: g('c', 'carbs_g', 'carbs', 'carbohydrates_g'), s: g('s', 'sugar_g', 'sugars_g', 'sugar'), f: g('f', 'fat_g', 'fat'), fib: g('fib', 'fibre_g', 'fiber_g', 'fibre', 'fiber') };
  if (o.cal == null || isNaN(o.cal)) return null;
  MACRO_KEYS.forEach(function (k) { if (o[k] == null || isNaN(o[k])) o[k] = 0; o[k] = k === 'cal' ? Math.round(o[k]) : r1(o[k]); });
  return o;
}
function checkMacros(o, per100) {
  var e = [];
  if (!o) return ['Calories missing'];
  MACRO_KEYS.forEach(function (k) {
    var lim = per100 ? [0, PER100_MAX[k]] : LIMITS[k], v = o[k];
    if (!(typeof v === 'number' && isFinite(v) && v >= lim[0] && v <= lim[1])) e.push((per100 ? 'Per 100g ' : '') + ({ cal: 'calories', p: 'protein', c: 'carbs', s: 'sugar', f: 'fat', fib: 'fibre' })[k] + ' must be ' + lim[0] + '–' + lim[1]);
  });
  if (!e.length && o.s > o.c + 0.5) e.push('Sugar can’t exceed carbs');
  if (!e.length && per100 && o.p + o.c + o.f > 101) e.push('Protein + carbs + fat can’t exceed 100g per 100g');
  if (!e.length && o.p * 4 + o.c * 4 + o.f * 9 > o.cal * 1.6 + 60) e.push('Macros don’t add up to the calories');
  return e;
}
function normalizeLib(x) {
  if (!isObj(x)) return null;
  var per100 = macroObj(x.per100), sv = isObj(x.serving) ? x.serving : null, serving = sv ? macroObj(sv) : null;
  if (per100 && checkMacros(per100, true).length) per100 = null;
  var sg = sv ? scanVal(sv.g) : null; if (sg != null && (isNaN(sg) || sg <= 0 || sg > 3000)) sg = null;
  if (!serving && per100 && sg) serving = { cal: Math.round(per100.cal * sg / 100), p: r1(per100.p * sg / 100), c: r1(per100.c * sg / 100), s: r1(per100.s * sg / 100), f: r1(per100.f * sg / 100), fib: r1(per100.fib * sg / 100) };
  if (serving && checkMacros(serving, false).length) serving = null;
  if (!per100 && !serving) return null;
  if (serving) { serving.g = sg; serving.label = String((sv && sv.label) || (sg ? sg + 'g' : '1 serving')).slice(0, 40); }
  var name = String(x.name || '').trim().slice(0, 80); if (!name) return null;
  var code = String(x.code || '').replace(/\D/g, '').slice(0, 14);
  return { id: typeof x.id === 'string' && x.id ? cleanId(x.id) : 'lib-' + uid(), name: name, brand: String(x.brand || '').trim().slice(0, 60), code: code || '',
    source: FOOD_SOURCES.indexOf(x.source) >= 0 ? x.source : 'custom', per100: per100, serving: serving,
    url: String(x.url || '').slice(0, 300), uses: Math.max(0, Math.round(num(x.uses))), last: num(x.last, 0) };
}
var FOOD_SOURCES = ['off', 'label', 'web', 'custom', 'history', 'meal', 'chain', 'generic', 'fatsecret', 'cofid', 'recipe', 'mfp'];
/* ── built-in foods (no internet, no Claude): official UK chain menus and generic foods per 100g ──
   chains: [{ chain, rows: [[name, grams|null, kcal, protein, carbs, sugar, fat, fibre|null], …], date }]
   generic: [[name, kcal, protein, carbs, sugar, fat, fibre], …] (per 100g) */
function stemWord(w) { return w.length > 3 ? w.replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '') : w; }
function foodWords(t) { return String(t || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9%]+/).filter(Boolean).map(stemWord); }
function builtinFoods(chains, generic, mfp) {
  var out = [];
  (chains || []).forEach(function (ch, ci) {
    (ch.rows || []).forEach(function (r, i) {
      var g = r[1] > 0 ? r[1] : null, mac = { cal: r[2], p: r[3], c: r[4], s: r[5], f: r[6], fib: r[7] == null ? 0 : r[7] };
      var it = normalizeLib({ id: 'chain-' + ci + '-' + i, name: r[0], brand: ch.chain, source: 'chain', serving: Object.assign({ label: '1 item' + (g ? ' (' + Math.round(g) + 'g)' : ''), g: g }, mac),
        per100: g ? { cal: Math.round(mac.cal * 100 / g), p: r1(mac.p * 100 / g), c: r1(mac.c * 100 / g), s: r1(mac.s * 100 / g), f: r1(mac.f * 100 / g), fib: r1(mac.fib * 100 / g) } : null });
      if (it) { it.size = ch.date ? 'Official · ' + ch.date : 'Official'; it.words = foodWords(ch.chain + ' ' + r[0]); it.brandWords = foodWords(ch.chain); out.push(it); }
    });
  });
  // foods copied from MyFitnessPal's database: [name, brand, serving label, grams|null, kcal, protein, carbs, sugar, fat, fibre]
  (mfp || []).forEach(function (r, i) {
    var g = r[3] > 0 ? r[3] : null, mac = { cal: r[4], p: r[5], c: r[6], s: r[7], f: r[8], fib: r[9] == null ? 0 : r[9] };
    var it = normalizeLib({ id: 'mfp-' + i, name: r[0], brand: r[1] || '', source: 'mfp', serving: Object.assign({ label: r[2] || '1 serving', g: g }, mac),
      per100: g ? { cal: Math.round(mac.cal * 100 / g), p: r1(mac.p * 100 / g), c: r1(mac.c * 100 / g), s: r1(mac.s * 100 / g), f: r1(mac.f * 100 / g), fib: r1(mac.fib * 100 / g) } : null });
    if (it) { it.size = 'MyFitnessPal'; it.words = foodWords(r[0] + ' ' + (r[1] || '')); it.brandWords = foodWords(r[1] || ''); out.push(it); }
  });
  (generic || []).forEach(function (r, i) {
    var it = normalizeLib({ id: 'gen-' + i, name: r[0], brand: '', source: 'generic', per100: { cal: r[1], p: r[2], c: r[3], s: r[4], f: r[5], fib: r[6] } });
    if (it) { it.words = foodWords(r[0]); it.brandWords = []; out.push(it); }
  });
  return out;
}
/* every word you type must start a word of the food (plurals match: wings → wing); chain names, early words and short names rank first */
function searchBuiltin(list, q, limit) {
  var toks = foodWords(q); if (!toks.length || !list) return [];
  var scored = [];
  for (var i = 0; i < list.length; i++) {
    var x = list[i], w = x.words, sc = 0, ok = true;
    for (var t = 0; t < toks.length && ok; t++) {
      var hit = -1; for (var j = 0; j < w.length; j++) if (w[j].indexOf(toks[t]) === 0) { hit = j; break; }
      if (hit < 0) ok = false; else sc += (w[hit] === toks[t] ? 30 : 18) - Math.min(hit, 8) + (x.brandWords.indexOf(w[hit]) >= 0 ? 25 : 0);
    }
    if (!ok) continue;
    sc += x.source === 'chain' ? 20 : x.source === 'mfp' ? 6 : 0; sc -= Math.min(20, w.length);
    scored.push({ item: x, score: sc });
  }
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit || 8).map(function (s) { return s.item; });
}
/* ── quick commands typed in the box (no Claude): water, weight and measurements, steps, activities, sets ──
   "drank 750ml", "2 glasses of water", "weighed 88.6, waist 96", "8,000 steps", "football 60", "incline walk 30 min",
   "gym done", "lat pulldown 60kg 3x10", "pull ups 3x8". Returns { ok, items } through the same checks as before. */
function parseQuick(text) {
  var parts = String(text || '').toLowerCase().replace(/,(?=\d{3}\b)/g, '').split(/\s*(?:,|;|\n|\+|\band\b|&)\s*/).map(function (x) { return x.trim(); }).filter(Boolean), raw = [], miss = [];
  parts.forEach(function (t) {
    var m, got = false;
    if ((m = /(\d+(?:\.\d+)?)\s*(ml|millilitres?|l|litres?|liters?)\b/.exec(t)) && (/water|drank|drink|\bml\b|litre|liter/.test(t) || /^\d/.test(t))) { var v = +m[1] * (/^m/.test(m[2]) ? 1 : 1000); if (v > 0) { raw.push({ kind: 'water', ml: v }); got = true; } }
    else if ((m = /(\d+(?:\.\d+)?)\s*(glass|glasses|bottle|bottles|cup|cups)\s*(?:of\s*)?water/.exec(t))) { raw.push({ kind: 'water', ml: +m[1] * (/bottle/.test(m[2]) ? 500 : 250) }); got = true; }
    else if (/^(?:a\s+)?(glass|bottle|cup)\s+of\s+water$/.test(t)) { raw.push({ kind: 'water', ml: /bottle/.test(t) ? 500 : 250 }); got = true; }
    else if ((m = /\b(weigh(?:ed|ing)?|weight|wt)\b\s*(?:in\s*)?(?:at\s*)?(\d{2,3}(?:\.\d{1,2})?)\s*(kg)?\b/.exec(t))) { raw.push({ kind: 'body', weight_kg: +m[2] }); got = true; }
    else if ((m = /\b(waist|chest|shoulders?|arms?|body ?fat|bf)\b\s*(?:is\s*)?(\d{1,3}(?:\.\d)?)\s*(cm|%)?/.exec(t))) { var key = /^w/.test(m[1]) ? 'waist_cm' : /^c/.test(m[1]) ? 'chest_cm' : /^s/.test(m[1]) ? 'shoulders_cm' : /^a/.test(m[1]) ? 'arms_cm' : 'body_fat_pct'; var o = { kind: 'body' }; o[key] = +m[2]; raw.push(o); got = true; }
    else if ((m = /(\d{2,6})\s*steps\b/.exec(t))) { raw.push({ kind: 'activity', type: 'steps', steps: +m[1] }); got = true; }
    else if ((m = /^(?:played\s+)?(football|footy|5\s*a\s*side|gym|trained|gym done|sprints?|ball ?work|abs|core|incline walk|walk|run|cycle|cardio)\b(?:\s*(?:for\s*)?(\d{1,3})\s*(?:m|min|mins|minutes)?)?(?:\s*(?:(\d{1,4})\s*kcal))?(?:\s*done)?$/.exec(t))) {
      var w = m[1], type = /foot|5/.test(w) ? 'football' : /gym|train/.test(w) ? 'gym' : /sprint/.test(w) ? 'sprint' : /ball/.test(w) ? 'ballwork' : /abs|core/.test(w) ? 'abs' : 'cardio';
      raw.push({ kind: 'activity', type: type, minutes: m[2] ? +m[2] : type === 'gym' || type === 'football' ? 60 : 30, kcal: m[3] ? +m[3] : null }); got = true;
    }
    else if ((m = /^(.*?[a-z].*?)\s+(?:(\d+(?:\.\d+)?)\s*(kg|lb|lbs)\s+)?(?:(\d{1,2})\s*[x×]\s*(\d{1,3})|[x×]\s*(\d{1,3}))(?:\s*(?:@|at)\s*(\d+(?:\.\d+)?)\s*(kg|lb|lbs)?)?$/.exec(t))) {
      var kg = m[2] != null ? +m[2] * (/lb/.test(m[3]) ? 1 / 2.2046 : 1) : m[7] != null ? +m[7] * (/lb/.test(m[8] || '') ? 1 / 2.2046 : 1) : 0, sets = [], nSets = m[4] ? +m[4] : 1, reps = +(m[5] || m[6]);
      for (var i = 0; i < Math.min(12, nSets); i++) sets.push({ kg: Math.round(kg * 10) / 10, reps: reps });
      if (sets.length) { raw.push({ kind: 'exercise', name: m[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }), sets: sets }); got = true; }
    }
    if (!got) miss.push(t);
  });
  if (!raw.length) return { ok: false, items: [], rest: miss };
  var body = null; raw = raw.filter(function (x) { if (x.kind !== 'body') return true; if (!body) { body = x; return true; } Object.keys(x).forEach(function (k) { body[k] = x[k]; }); return false; }); // one body card for "weighed 88.6, waist 96"
  var r = parseReply(JSON.stringify({ type: 'mixed', items: raw }));
  return { ok: r.ok, items: r.items || [], rest: miss, error: r.error };
}
/* macros for a portion: { grams } or { servings } */
function portion(item, opt) {
  opt = opt || {};
  var base = null, factor = 0, label = '';
  var g = num(opt.grams, NaN), n = num(opt.servings, NaN);
  if (isFinite(g) && g > 0) {
    label = r1(g) + 'g';
    if (item.per100) { base = item.per100; factor = g / 100; }
    else if (item.serving && item.serving.g) { base = item.serving; factor = g / item.serving.g; }
  } else if (isFinite(n) && n > 0) {
    if (item.serving) { base = item.serving; factor = n; label = (n === 1 ? '' : r2(n) + ' × ') + item.serving.label; }
    else if (item.per100) { base = item.per100; factor = n; label = r1(n * 100) + 'g'; }
  }
  if (!base || !(factor > 0)) return null;
  return { cal: Math.round(base.cal * factor), p: r1(base.p * factor), c: r1(base.c * factor), s: r1(base.s * factor), f: r1(base.f * factor), fib: r1(base.fib * factor), qty: label };
}
function defaultPortion(item) { return item.serving ? { servings: 1 } : { grams: 100 }; }
function canWeigh(item) { return !!(item.per100 || (item.serving && item.serving.g)); }
function gramsFromQty(q) { var m = String(q || '').match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i); return m ? parseFloat(m[1]) : null; }
/* foods you've logged before, newest first, with how often */
function recentFoods(s, limit) {
  var map = {}, order = [];
  Object.keys(s.days).sort().reverse().forEach(function (k) {
    s.days[k].foods.slice().reverse().forEach(function (f) {
      var key = f.name.toLowerCase() + '|' + String(f.qty || '').toLowerCase();
      if (!map[key]) { map[key] = { id: 'hist-' + hash(key), name: f.name, brand: '', code: '', source: 'history', per100: null, serving: { cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib, g: gramsFromQty(f.qty), label: f.qty || '1 portion' }, url: '', uses: 0, last: keyToUTC(k) + num(f.t, 0) % DAY_MS }; order.push(key); }
      map[key].uses++;
    });
  });
  return order.slice(0, limit || 50).map(function (k) { return map[k]; });
}
function rememberFood(s, raw, nowMs) {
  var it = normalizeLib(raw); if (!it || it.source === 'history' || it.source === 'meal') return null;
  var nm = (it.name + '|' + it.brand).toLowerCase(), hit = null;
  s.library.forEach(function (x) { if ((it.code && x.code === it.code) || (x.name + '|' + x.brand).toLowerCase() === nm) hit = x; });
  if (hit) { ['name', 'brand', 'code', 'source', 'per100', 'serving', 'url'].forEach(function (k) { if (it[k] != null && it[k] !== '') hit[k] = it[k]; }); hit.uses += 1; hit.last = num(nowMs, Date.now()); return hit; }
  it.uses = 1; it.last = num(nowMs, Date.now()); s.library.push(it);
  if (s.library.length > 500) { s.library.sort(function (a, b) { return (b.uses * 1e13 + b.last) - (a.uses * 1e13 + a.last); }); s.library = s.library.slice(0, 500); }
  return it;
}
function findByCode(s, code) { code = String(code || '').replace(/\D/g, ''); if (!code) return null; for (var i = 0; i < s.library.length; i++) if (s.library[i].code === code) return s.library[i]; return null; }
function mealAsItem(m) {
  var t = { cal: 0, p: 0, c: 0, s: 0, f: 0, fib: 0 }; m.items.forEach(function (f) { MACRO_KEYS.forEach(function (k) { t[k] += num(f[k]); }); });
  return { id: 'meal-' + m.id, mealId: m.id, name: m.name, brand: 'Saved meal', code: '', source: 'meal', per100: null, serving: { cal: Math.round(t.cal), p: r1(t.p), c: r1(t.c), s: r1(t.s), f: r1(t.f), fib: r1(t.fib), g: null, label: m.items.length + ' item' + (m.items.length > 1 ? 's' : '') }, url: '', uses: 0, last: 0 };
}
/* ── My recipes: home cooking made once, logged a plate at a time. The whole pot's ingredients and the number of portions
   it makes; one portion = the pot ÷ portions. { id, name, portions, items: [{ name, qty, cal, p, c, s, f, fib }], uses, last } */
function normalizeRecipe(r) {
  if (!isObj(r)) return null;
  var items = (Array.isArray(r.items) ? r.items : []).map(normalizeFood).filter(Boolean).map(function (f) { return { name: f.name, qty: f.qty, cal: f.cal, p: f.p, c: f.c, s: f.s, f: f.f, fib: f.fib }; });
  var name = String(r.name || '').trim().slice(0, 60); if (!name || !items.length) return null;
  return { id: cleanId(r.id || 'rc-' + uid()), name: name, portions: clamp(r1(num(r.portions, 1)), 0.5, 50), items: items.slice(0, 60), uses: Math.max(0, Math.round(num(r.uses))), last: num(r.last, 0) };
}
function recipeTotals(r) { var t = { cal: 0, p: 0, c: 0, s: 0, f: 0, fib: 0 }; (r.items || []).forEach(function (f) { MACRO_KEYS.forEach(function (k) { t[k] += num(f[k]); }); }); return t; }
function recipeAsItem(r) {
  var t = recipeTotals(r), n = r.portions || 1;
  return { id: 'recipe-' + r.id, recipeId: r.id, name: r.name, brand: 'My recipe', code: '', source: 'recipe', per100: null,
    serving: { cal: Math.round(t.cal / n), p: r1(t.p / n), c: r1(t.c / n), s: r1(t.s / n), f: r1(t.f / n), fib: r1(t.fib / n), g: null, label: '1 portion (of ' + r1(n) + ')' }, url: '', uses: r.uses || 0, last: r.last || 0 };
}
/* MyFitnessPal-style quick add: just the calories (and protein, carbs, fat if you know them) */
function quickAddItem(o) {
  o = o || {}; var cal = Math.round(num(o.cal, NaN)); if (!(cal > 0) || cal > 5000) return null;
  var p = Math.max(0, r1(num(o.p))), c = Math.max(0, r1(num(o.c))), f = Math.max(0, r1(num(o.f)));
  return { kind: 'food', name: String(o.name || '').trim().slice(0, 80) || 'Quick add', qty: '', cal: cal, p: p, c: c, s: 0, f: f, fib: 0, conf: 'high', note: 'Quick add', meal: ['breakfast', 'lunch', 'dinner', 'snack'].indexOf(o.meal) >= 0 ? o.meal : null };
}
/* local search: your foods + saved meals + history. Empty query = most used / recent */
function searchLocal(s, q, limit) {
  limit = limit || 8;
  var meals = s.savedMeals.map(mealAsItem).concat((s.recipes || []).map(recipeAsItem)), lib = s.library.slice(), hist = recentFoods(s, 80);
  var seen = {}; lib.forEach(function (x) { seen[x.name.toLowerCase()] = 1; seen[(x.name + ' · ' + x.brand).toLowerCase()] = 1; }); meals.forEach(function (x) { seen[x.name.toLowerCase()] = 1; });
  var all = meals.concat(lib).concat(hist.filter(function (h) { return !seen[h.name.toLowerCase()]; }));
  var qq = String(q || '').toLowerCase().trim(), toks = qq.split(/\s+/).filter(Boolean);
  var scored = all.map(function (x) {
    var hay = (x.name + ' ' + x.brand).toLowerCase(), words = hay.split(/[^a-z0-9%]+/).filter(Boolean), sc = 0;
    if (toks.length) {
      for (var i = 0; i < toks.length; i++) { var t = toks[i], wp = words.some(function (w) { return w.indexOf(t) === 0; }); if (!wp && hay.indexOf(t) < 0) return null; sc += wp ? 20 : 6; }
      if (x.name.toLowerCase().indexOf(qq) === 0) sc += 60; else if (hay.indexOf(qq) >= 0) sc += 25;
    }
    sc += Math.min(30, x.uses * 3) + (x.source === 'meal' || x.source === 'recipe' ? 8 : x.source !== 'history' ? 5 : 0) + (x.last ? clamp(10 - Math.abs(Date.now() - x.last) / DAY_MS, 0, 10) : 0);
    return { item: x, score: sc };
  }).filter(Boolean);
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit).map(function (x) { return x.item; });
}
/* foods the AI should reuse exact numbers for */
function knownFoods(s, limit) {
  return searchLocal(s, '', limit || 25).filter(function (x) { return x.serving; }).map(function (x) {
    var v = x.serving; return { name: x.name + (x.brand && x.source !== 'meal' ? ' (' + x.brand + ')' : ''), qty: v.label, cal: v.cal, p: v.p, c: v.c, s: v.s, f: v.f, fib: v.fib };
  });
}
/* Claude's reading of a nutrition label photo, or a web lookup → library item */
function parseFoodReply(text, source) {
  var o; try { o = extractJSON(text); } catch (e) { return { ok: false, error: 'The System couldn’t read that reply (' + e.message + ').' }; }
  if (!isObj(o)) return { ok: false, error: 'Reply wasn’t a food.' };
  if (o.found === false) return { ok: false, error: o.message || 'Couldn’t find reliable nutrition information.' };
  var it = normalizeLib({ name: o.name || (source === 'label' ? 'Scanned food' : ''), brand: o.brand, code: o.barcode || o.code, source: source, url: o.source_url || '',
    per100: o.per100 || o.per_100g, serving: isObj(o.per_serving) ? Object.assign({}, o.per_serving, { g: o.serving_g, label: o.serving_label }) : (o.serving_g ? { g: o.serving_g, label: o.serving_label } : null) });
  if (!it) return { ok: false, error: 'The numbers found didn’t look right, so nothing was used.' };
  if (o.source_title) it.sourceTitle = String(o.source_title).slice(0, 80);
  return { ok: true, item: it };
}
function hostOf(url) { var m = String(url || '').match(/^https?:\/\/(?:www\.)?([^\/?#]+)/i); return m ? m[1] : ''; }

/* ───────────────────────── storage (inject any localStorage-like object) ───────────────────────── */
var STORE_KEY = 'rtl_state';
function createStore(storage, key) {
  key = key || STORE_KEY;
  return {
    load: function () { var raw = null; try { raw = storage.getItem(key); } catch (e) { return { state: migrate(null), status: 'unavailable' }; } if (!raw) return { state: migrate(null), status: 'new' }; try { return { state: migrate(JSON.parse(raw)), status: 'ok' }; } catch (e) { try { storage.setItem(key + '_corrupt_' + Date.now(), raw); } catch (e2) {} return { state: migrate(null), status: 'corrupt' }; } },
    save: function (s) { try { storage.setItem(key, JSON.stringify(s)); return true; } catch (e) { return false; } }
  };
}
/* ───────────────────────── secret heroes (11 weeks, 11 heroes) ─────────────────────────
   Each of the first 11 weeks of the arc (the two festive weeks at the end don't count): weigh in at least 0.85kg
   below where you finished the week before and the next hero in your hidden, shuffled line-up breaks free with their power.
   A missed week doesn't skip a hero; it just means the line-up can't be finished. */
var HERO_DROP = 0.85, HERO_WEEKS = 11;
var HEROES = [
  /* name, anime, title, power */
  ['Naruto Uzumaki', 'Naruto', 'Hokage', 'Six Paths Mode'],
  ['Sinbad', 'Magi: Adventure of Sinbad', 'King of the Seven Seas', 'Bararaq Saiqa, the Lightning Sword'],
  ['Baki', 'Baki', 'Strongest Son', 'Triceratops Fist'],
  ['Gabimaru', 'Hell’s Paradise', 'The Hollow', 'Ninja Art: Ascetic Blaze'],
  ['Natsu', 'Fairy Tail', 'Dragon Slayer', 'Roar of the Fire Dragon'],
  ['Luffy', 'One Piece', 'King of the Pirates', 'Fifth Gear'],
  ['Mustang', 'Fullmetal Alchemist', 'Revenge', 'Finger-Snap Flame Alchemy'],
  ['Kenpachi', 'Bleach', 'Aura', 'Kenpachi’s Bankai'],
  ['Yami', 'Black Clover', 'Black Bulls', 'Dark Cloaked Dimension Slash'],
  ['Rin', 'Blue Lock', 'Destroyer', 'Destroyer Eyes'],
  ['Sasuke', 'Naruto Shippuden', 'Shadow Hokage', 'Mangekyō Sharingan']
];
function validHeroOrder(o) { if (!Array.isArray(o) || o.length !== HEROES.length) return false; var seen = {}; for (var i = 0; i < o.length; i++) { if (!(o[i] >= 0 && o[i] < HEROES.length) || o[i] !== Math.floor(o[i]) || seen[o[i]]) return false; seen[o[i]] = 1; } return true; }
function shuffledHeroes(rnd) { rnd = rnd || Math.random; var a = HEROES.map(function (_, i) { return i; }); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function heroInfo(h) { var b = HEROES[h]; if (!b) return null; var nn = (h < 9 ? '0' : '') + (h + 1); return { h: h, name: b[0], anime: b[1], title: b[2], power: b[3], art: 'art/h/' + nn + '.webp', part: 'art/p/' + nn + '.webp' }; }
/* ───────────────────────── the daily aura (85 characters, one a day) ─────────────────────────
   Pavi's own art: 85 characters, each with the aura colour from his list (AA.xlsx, the colour next to the name).
   One a day for the 85 days of the arc, in an order drawn at random for each save. The draw is seeded from the save's
   own hidden hero line-up and start date, so every device holding the same save shows the same character on the same
   day without anything new being stored or synced. Over the 85 days every character appears exactly once. */
var AURA = [
  /* name, anime, aura, colour (exactly as in the list) */
  ["Asta", "Black Clover", "Anti-Magic Crimson", "#7A0C12"],
  ["Yuno", "Black Clover", "Wind Spirit Emerald", "#2ECC71"],
  ["Yami Sukehiro", "Black Clover", "Dark Magic Black-Violet", "#2A1B3D"],
  ["Luck Voltia", "Black Clover", "Lightning Boots Volt", "#F9F871"],
  ["Naruto Uzumaki", "Naruto", "Nine-Tails Orange", "#FF7A00"],
  ["Kakashi Hatake", "Naruto", "Chidori White-Blue", "#A9D6FF"],
  ["Sasuke Uchiha", "Naruto Shippuden", "Susanoo Violet", "#5B2C9E"],
  ["Monkey D. Luffy", "One Piece", "Straw Hat Red", "#E0202A"],
  ["Roronoa Zoro", "One Piece", "Three-Sword Moss", "#3E7C3A"],
  ["Ichigo Kurosaki", "Bleach", "Getsuga Midnight", "#1B1B3A"],
  ["Toshiro Hitsugaya", "Bleach", "Hyorinmaru Ice", "#BFE9FF"],
  ["Natsu Dragneel", "Fairy Tail", "Dragon Slayer Scarlet", "#FF3B1F"],
  ["Gray Fullbuster", "Fairy Tail", "Ice-Make Blue", "#5DADE2"],
  ["Aladdin", "Magi", "Rukh Sunlight", "#FFE98A"],
  ["Alibaba Saluja", "Magi", "Amon Ember", "#FF9A3C"],
  ["Yoichi Isagi", "Blue Lock", "Egoist Blue", "#0057FF"],
  ["Eren Yeager", "Attack on Titan", "Titan Lightning Lime", "#C8E600"],
  ["Levi Ackerman", "Attack on Titan", "Blade Steel Grey", "#7D8A94"],
  ["Goku Super Saiyan", "Dragon Ball", "Nimbus Yellow", "#FFE135"],
  ["Tanjiro Kamado", "Demon Slayer", "Water Breathing Teal", "#1FA6A0"],
  ["Zenitsu Agatsuma", "Demon Slayer", "Thunderclap Amber", "#FFC400"],
  ["Kyojuro Rengoku", "Demon Slayer", "Flame Hashira Blaze", "#FF4E1A"],
  ["Gingka Hagane", "Beyblade Metal Fusion/Masters/Fury", "Pegasus Star Blue", "#3A7BFF"],
  ["Kyoya Tategami", "Beyblade Metal Fusion/Masters/Fury", "Leone Storm Green", "#1E8F4E"],
  ["Ryuga", "Beyblade Metal Fusion/Masters/Fury", "L-Drago Dark Flame", "#B3001B"],
  ["Tyson Granger", "OG Beyblade", "Dragoon Cyan", "#00C2FF"],
  ["Kai Hiwatari", "OG Beyblade", "Dranzer Phoenix Ember", "#F25C05"],
  ["Zyro Kurogane", "Beyblade Samurai (Shogun Steel)", "Ifrit Blaze Peach", "#FF8C42"],
  ["Jotaro Kujo", "JoJo's Bizarre Adventure", "Star Platinum Purple", "#6A4FCF"],
  ["Giorno Giovanna", "JoJo's Bizarre Adventure", "Golden Wind", "#F5C518"],
  ["Koro-sensei", "Assassination Classroom", "Smiley Yellow", "#FFEB3B"],
  ["Nagisa Shiota", "Assassination Classroom", "Serpent Sky Blue", "#6EC6FF"],
  ["Edward Elric", "Fullmetal Alchemist", "Alchemist Coat Red", "#C1121F"],
  ["Alphonse Elric", "Fullmetal Alchemist: Brotherhood", "Armour Steel Blue", "#8FA3B8"],
  ["Roy Mustang", "Fullmetal Alchemist: Brotherhood", "Flame Alchemy Orange", "#FF6A13"],
  ["Gon Freecss", "Hunter x Hunter", "Jajanken Green", "#5FD35F"],
  ["Killua Zoldyck", "Hunter x Hunter", "Godspeed Electric", "#B8F1FF"],
  ["Kurapika", "Hunter x Hunter", "Scarlet Eyes", "#FF1744"],
  ["Yuji Itadori", "Jujutsu Kaisen", "Black Flash Magenta", "#D81B60"],
  ["Satoru Gojo", "Jujutsu Kaisen", "Six Eyes Ice Blue", "#7FDBFF"],
  ["Megumi Fushiguro", "Jujutsu Kaisen", "Ten Shadows Indigo", "#1F2A5A"],
  ["Ryomen Sukuna", "Jujutsu Kaisen", "Malevolent Shrine Blood", "#8B0000"],
  ["Toji Fushiguro", "Jujutsu Kaisen", "Inverted Spear Jade", "#2F4F3E"],
  ["Mark Evans (Endou Mamoru)", "Inazuma Eleven", "God Hand Gold", "#FFB300"],
  ["Axel Blaze (Gouenji Shuuya)", "Inazuma Eleven", "Fire Tornado", "#FF4500"],
  ["Arion Sherwind (Matsukaze Tenma)", "Inazuma Eleven GO", "Pegasus Breeze", "#9AD9FF"],
  ["Sonny Wright (Inamori Asuto)", "Inazuma Eleven Ares", "Sunrise Orange", "#FFA552"],
  ["Sung Jinwoo", "Solo Leveling", "Shadow Monarch Violet", "#4B1FA8"],
  ["Saitama", "One Punch Man", "Hero Suit Yellow", "#F7E017"],
  ["Genos", "One Punch Man", "Incineration Core", "#FF9E00"],
  ["Thorfinn", "Vinland Saga", "Northern Ice", "#A7C7E7"],
  ["Yato", "Noragami", "Stray God Blue", "#3D5AFE"],
  ["Baki Hanma", "Baki", "Demon Back Red", "#A4161A"],
  ["Jack Hanma", "Baki", "Pit Fighter Gold", "#C9A227"],
  ["Light Yagami", "Death Note", "Kira Red", "#D00000"],
  ["L", "Death Note", "Pale Monochrome", "#DADADA"],
  ["Tatsumi", "Akame ga Kill", "Incursio Silver", "#BFC9D9"],
  ["Meliodas", "7 Deadly Sins", "Demon Mark Purple", "#2D0A4E"],
  ["Dan Kuso", "Bakugan", "Pyrus Red", "#E63946"],
  ["Tai Kamiya", "Digimon", "Crest of Courage Orange", "#FF8700"],
  ["Sinbad", "Sinbad (Magi: Adventure of Sinbad)", "Baal Lightning Purple", "#8A2BE2"],
  ["Hojo Tokiyuki", "Elusive Samurai", "Sakura Escape Pink", "#FFB7C5"],
  ["Okarun (Ken Takakura)", "Dan Da Dan", "Turbo Granny Raspberry", "#C2185B"],
  ["Gabimaru", "Hell's Paradise", "Ascetic Blaze", "#FF5733"],
  ["Denji", "Chainsaw Man", "Chainsaw Orange", "#F26B0F"],
  ["Aki Hayakawa", "Chainsaw Man", "Cigarette Smoke Blue-Grey", "#5C6B7A"],
  ["Mash Burnedead", "Mashle", "Cream Puff", "#F3D9A4"],
  ["Adam", "Record of Ragnarok", "Eden Green", "#7BC950"],
  ["Lu Bu", "Record of Ragnarok", "Sky Eater Thunder", "#9C27B0"],
  ["Goku", "Dragon Ball Super", "Ultra Instinct Silver", "#C9D6E3"],
  ["Vegeta", "Dragon Ball Super", "Saiyan Royal Blue", "#1E90FF"],
  ["Yasuke", "Yasuke", "Onyx Bronze", "#8C5A2B"],
  ["Himura Kenshin", "Rurouni Kenshin", "Battousai Auburn", "#B5451B"],
  ["Rudo", "Gachiakuta", "Graffiti Lime", "#B6FF00"],
  ["Kafka Hibino", "Kaiju No. 8", "Kaiju Core Blue", "#00E5FF"],
  ["Taro Sakamoto", "Sakamoto Days", "Shopkeeper Slate", "#607D8B"],
  ["Shin Asakura", "Sakamoto Days", "Esper Lemon", "#FFF176"],
  ["Shiki Ichinose", "Tougen Anki", "Oni Blood Neon", "#FF0033"],
  ["Loid Forger", "Spy x Family", "Twilight Dusk", "#E0A96D"],
  ["Yusuke Urameshi", "Yu Yu Hakusho", "Spirit Gun Aqua", "#5CE1E6"],
  ["Hiei", "Yu Yu Hakusho", "Black Dragon Flame", "#3A0CA3"],
  ["Miyamoto Musashi", "Vagabond (manga)", "Ink Wash Black", "#2B2B2B"],
  ["Shinra Kusakabe", "Fire Force", "Devil's Footprints", "#FF6B00"],
  ["Morihito Otogi", "Witch Watch", "Ogre Guardian Navy", "#2C3E6B"],
  ["Yujiro Hanma", "Baki sword (Baki-Dou)", "Ogre Blood", "#5C0A0A"]
];
function auraInfo(i) { var a = AURA[i]; if (!a) return null; var nn = (i < 9 ? '0' : '') + (i + 1); return { i: i, n: i + 1, name: a[0], short: a[0].replace(/\s*\(.*\)\s*$/, ''), anime: a[1], aura: a[2], hex: a[3], art: 'art/a/' + nn + '.webp' }; }
function seededRandom(seed) { var x = seed >>> 0 || 1; return function () { x = (x + 0x6D2B79F5) >>> 0; var t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function auraOrder(s) {
  var seed = hash('aura|' + (validHeroOrder(s.heroes && s.heroes.order) ? s.heroes.order.join(',') : '') + '|' + s.profile.startDate);
  var rnd = seededRandom(seed), a = AURA.map(function (_, i) { return i; });
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/* today's character: day 1 of the arc shows the first of the draw; before the arc, day 1's; after the 85th day the draw
   simply goes round again, so there is always someone there */
function auraToday(s, k) {
  var d = diffDays(s.profile.startDate, k), day = d < 0 ? 0 : d % AURA.length, o = auraInfo(auraOrder(s)[day]);
  o.day = day + 1; o.of = AURA.length; o.inArc = d >= 0 && k <= s.profile.seasonEnd; o.palette = auraPalette(o.hex);
  return o;
}
/* the characters already met: every day of the arc so far has shown one, newest first. Before the arc, day 1's is the one
   on screen, so it counts as met; once the 85 days have gone round, all 85 have been. */
function auraDiscovered(s, k) {
  var d = diffDays(s.profile.startDate, k), n = d < 0 ? 1 : Math.min(AURA.length, d + 1), order = auraOrder(s), out = [];
  for (var i = n - 1; i >= 0; i--) { var o = auraInfo(order[i]); o.day = i + 1; o.date = addDays(s.profile.startDate, i); o.palette = auraPalette(o.hex); out.push(o); }
  return out;
}
/* the three colours an aura is drawn with, all the same hue as the listed colour: the colour itself (the body of the
   flame), a light version (the bright edge and the white-hot glow) and a deep version (the faint outer flame).
   A very dark colour (navy, black, blood red) keeps its own dark flame and gets a bright edge of the same hue so it
   still shows against the dark screen: "dark" runs from 0 (bright aura) to 1 (dark flame, bright edge). */
function auraPalette(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')), v = m ? parseInt(m[1], 16) : 0xFFE135;
  var rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(function (c) { return c / 255; });
  var lin = rgb.map(function (c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  var lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  var mx = Math.max(rgb[0], rgb[1], rgb[2]), mn = Math.min(rgb[0], rgb[1], rgb[2]), l = (mx + mn) / 2, d = mx - mn, h = 0, sat = 0;
  if (d > 1e-6) {
    sat = d / (1 - Math.abs(2 * l - 1));
    h = mx === rgb[0] ? ((rgb[1] - rgb[2]) / d) % 6 : mx === rgb[1] ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  function hsl(hh, ss, ll) { ss = clamp(ss, 0, 1); ll = clamp(ll, 0, 1); var c = (1 - Math.abs(2 * ll - 1)) * ss, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), q = ll - c / 2, r = [0, 0, 0], seg = Math.floor(hh / 60) % 6;
    r = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg]; return [r[0] + q, r[1] + q, r[2] + q]; }
  var dark = 1 - Math.min(1, Math.max(0, (lum - 0.045) / 0.045)); dark = dark * dark * (3 - 2 * dark);
  var light = dark > 0.5 ? hsl(h, sat > 0.05 ? Math.min(1, sat + 0.15) : 0, 0.7) : hsl(h, sat, l + (1 - l) * 0.55);
  var deep = hsl(h, sat, l * 0.55);
  // two highlight colours either side of the hue (the orange and white-yellow running through a Super Saiyan's gold),
  // so the flame shimmers with close shades of its own colour instead of one flat tone. Greys stay grey.
  var hs = sat > 0.05 ? Math.min(1, sat + 0.18) : 0, hl = dark > 0.5 ? 0.62 : Math.min(0.82, l + (1 - l) * 0.35);
  var hiA = hsl((h + 338) % 360, hs, hl), hiB = hsl((h + 18) % 360, hs, Math.min(0.88, hl + 0.06));
  function toHex(c) { return '#' + c.map(function (x) { var n = Math.round(clamp(x, 0, 1) * 255); return (n < 16 ? '0' : '') + n.toString(16); }).join('').toUpperCase(); }
  // the colour the character's name is written in: the light version, lifted toward white until it reads clearly on the dark screen
  function lumOf(c) { return c.map(function (x) { return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce(function (s, x, i) { return s + x * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  var text = light.slice(); for (var k = 0; k < 20 && lumOf(text) < 0.32; k++) text = text.map(function (x) { return x + (1 - x) * 0.12; });
  return { hex: '#' + (m ? m[1].toUpperCase() : 'FFE135'), base: rgb, light: light, deep: deep, dark: r2(dark), lum: Math.round(lum * 1e4) / 1e4, hue: Math.round(h), lightHex: toHex(light), textHex: toHex(text), hiA: hiA, hiB: hiB };
}
/* secret heroes (v17): one hero for every whole kilogram you are down on the scale. Each weigh-in from the arc's first
   day on is compared with your start weight: the first time a weigh-in is 1kg under it frees the first hero, 2kg under
   the second, and so on. 11 heroes, 11kg: from 90.5kg the last is freed at 79.5kg, the end of the plan. A hero freed
   stays freed, even if a later weigh-in is higher; only correcting the weigh-in that freed it takes it back.
   Heroes come out in the hidden, shuffled order the save was given. (v16 used the 7-day average, which lagged days
   behind the scale.) */
var HERO_KG = 1;
function heroOp(s) { var o = s.heroes && s.heroes.op; return isObj(o) && Array.isArray(o.had) && Array.isArray(o.needs) && isKey(o.day) ? o : null; }
function heroMilestones(s, k) {
  var op = heroOp(s);
  if (op) { // OPERATION 79.9: the heroes already freed stay freed; the rest are spread evenly down to 80.0kg, counted from 13 Nov
    var list = [], low = null, lst = null, lstDay = '', ws = weightSeries(s).filter(function (w) { return w.key >= op.day && w.key <= s.profile.seasonEnd && w.key <= k; });
    ws.forEach(function (w) { var v = r2(w.kg); lst = v; lstDay = w.key; if (low == null || v < low) low = v; });
    op.had.forEach(function (day, j) { list.push({ n: j + 1, need: r2(s.profile.startKg - (j + 1) * HERO_KG), hit: true, hitDay: day, before: true }); });
    op.needs.forEach(function (need, j) { var day = ''; ws.forEach(function (w) { if (!day && r2(w.kg) <= need + 1e-9) day = w.key; }); list.push({ n: op.had.length + j + 1, need: need, hit: !!day, hitDay: day }); });
    return { list: list, avg: lst, avgDay: lstDay, lowest: low == null ? latestWeight(s, k) : low, latest: lst };
  }
  var start = s.profile.startKg, hit = {}, lowest = null, last = null, lastDay = '';
  weightSeries(s).forEach(function (w) {
    if (w.key < s.profile.startDate || w.key > s.profile.seasonEnd || w.key > k) return;
    var v = r2(w.kg); last = v; lastDay = w.key; if (lowest == null || v < lowest) lowest = v;
    for (var m = 1; m <= HEROES.length; m++) if (!hit[m] && r2(start - v) >= m * HERO_KG - 1e-9) hit[m] = w.key;
  });
  var out = [];
  for (var m = 1; m <= HEROES.length; m++) out.push({ n: m, need: r2(start - m * HERO_KG), hit: !!hit[m], hitDay: hit[m] || '' });
  return { list: out, avg: last, avgDay: lastDay, lowest: lowest, latest: last };
}
/* kept so older callers and saves still work: the weekly rule they served is gone, so there is nothing left to fix */
function lockHeroWeeks() { return 0; }
function recheckHeroWeek() { return false; }
/* heroes freed under the old weekly rule (before v16) stay freed: the per-kg count never goes below them */
function heroesKept(s, k) {
  var L = isObj(s.heroes.locked) ? s.heroes.locked : {};
  return Object.keys(L).map(function (n) { return L[n]; }).filter(function (x) { return isObj(x) && x.hit && isKey(x.day) && x.day <= k; }).map(function (x) { return x.day; }).sort();
}
function heroStatus(s, k) {
  var ms = heroMilestones(s, k), kept = heroesKept(s, k);
  ms.list.forEach(function (x, j) { if (!x.hit && j < kept.length) { x.hit = true; x.hitDay = kept[j]; x.kept = true; } });
  var hits = ms.list.filter(function (x) { return x.hit; }), over = k > s.profile.seasonEnd;
  var slots = s.heroes.order.map(function (h, j) { var o = heroInfo(h); o.slot = j; o.unlocked = j < hits.length; o.date = o.unlocked ? hits[j].hitDay : ''; o.kg = j + 1; o.need = ms.list[j] ? ms.list[j].need : null; o.reachable = o.unlocked || !over; return o; });
  var next = ms.list.filter(function (x) { return !x.hit; })[0] || null;
  if (next) { next = clone(next); next.avg = ms.lowest; next.toGo = ms.lowest == null ? null : r2(Math.max(0, ms.lowest - next.need)); }
  return { milestones: ms.list, slots: slots, unlocked: hits.length, total: HEROES.length, current: over ? null : next, avg: ms.avg, avgDay: ms.avgDay, lowest: ms.lowest,
    possible: over ? hits.length : HEROES.length, over: over, notStarted: k < s.profile.startDate };
}
/* ───────────────────────── daily bosses (83 days, 83 antagonists) ─────────────────────────
   One boss a day from the first day of the arc (8 Oct), so the last arrives on 29 Dec. The list had 90 when the arc began
   on 1 Oct; when the start moved to 8 Oct, seven were taken out at random (v14): numbers 3, 11, 20, 29, 45, 67 and 85 of
   the old list. Everyone left keeps their own picture, title and weapon; DUEL_ART is each boss's picture number.
   You have that day and the next (48 hours) to beat its challenge.
   Win → their nickname becomes a title you can equip, and their weapon goes in your Armoury.
   Miss the window → the boss escapes and that reward stays locked. */
var DUELS = [
  /* name, anime, nickname (title), weapon, fallback icon. In order; each one's pictures are art/b/NN.webp and art/w/NN.webp with NN from DUEL_ART */
  ['Buggy', 'One Piece', 'The Star Clown', 'Buggy Ball', '💣'],
  ['Zabuza Momochi', 'Naruto', 'Demon of the Hidden Mist', 'Executioner’s Blade', '🗡️'],
  ['Rui', 'Demon Slayer', 'Lower Rank Five', 'Steel Threads', '🕸️'],
  ['Speed-o’-Sound Sonic', 'One Punch Man', 'Speed-o’-Sound', 'Exploding Shuriken', '✴️'],
  ['Stain', 'My Hero Academia', 'Hero Killer', 'Chipped Katana', '🗡️'],
  ['Katana Man', 'Chainsaw Man', 'Katana Man', 'Katana Arms', '⚔️'],
  ['Jason (Yamori)', 'Tokyo Ghoul', 'Jason of the 13th Ward', 'Torture Pliers', '🔧'],
  ['Annie Leonhart', 'Attack on Titan', 'Female Titan', 'Crystal Hardening', '💎'],
  ['Ryo Mashiba', 'Hajime no Ippo', 'Grim Reaper', 'Flicker Jab', '🥊'],
  ['Lust', 'Fullmetal Alchemist', 'The Ultimate Lance', 'Lance Claws', '🗡️'],
  ['Deep Sea King', 'One Punch Man', 'Deep Sea King', 'Acid Spit', '🌊'],
  ['Scar', 'Fullmetal Alchemist', 'The Scarred Man', 'Arm of Destruction', '✋'],
  ['Jogo', 'Jujutsu Kaisen', 'Disaster Curse', 'Maximum: Meteor', '🌋'],
  ['Kisame Hoshigaki', 'Naruto', 'Tailed Beast Without a Tail', 'Samehada', '🦈'],
  ['Crocodile', 'One Piece', 'Desert King', 'Poison Hook', '🪝'],
  ['Illumi Zoldyck', 'Hunter x Hunter', 'Zoldyck Assassin', 'Needles', '📍'],
  ['Feitan', 'Hunter x Hunter', 'Spider No. 2', 'Umbrella Sword', '☂️'],
  ['Askeladd', 'Vinland Saga', 'Ash Lad', 'Roman Sword', '🗡️'],
  ['Takeshi Sendo', 'Hajime no Ippo', 'Naniwa Tiger', 'Smash', '🥊'],
  ['Gyutaro', 'Demon Slayer', 'Upper Rank Six', 'Blood Sickles', '🩸'],
  ['Reiner Braun', 'Attack on Titan', 'Armored Titan', 'Armour Plating', '🛡️'],
  ['Kenny Ackerman', 'Attack on Titan', 'Kenny the Ripper', 'Anti-Personnel Gear', '🔫'],
  ['Grimmjow', 'Bleach', 'Sexta Espada', 'Pantera', '🐆'],
  ['Dabi', 'My Hero Academia', 'Blueflame', 'Blue Cremation', '🔥'],
  ['Overhaul', 'My Hero Academia', 'Overhaul', 'Quirk-Erasing Bullets', '🧬'],
  ['Reze', 'Chainsaw Man', 'Bomb Devil', 'Detonator Pin', '💥'],
  ['Ryuhei Sawamura', 'Hajime no Ippo', 'Owari Dragon', 'Bullet', '🥊'],
  ['Thorkell', 'Vinland Saga', 'Thorkell the Tall', 'Twin Battle Axes', '🪓'],
  ['Orochimaru', 'Naruto', 'Legendary Sannin', 'Sword of Kusanagi', '🐍'],
  ['Kars', 'JoJo’s Bizarre Adventure', 'Ultimate Life Form', 'Light Blades', '✨'],
  ['Yoshikage Kira', 'JoJo’s Bizarre Adventure', 'Killer Queen', 'Sheer Heart Attack', '💀'],
  ['Mahito', 'Jujutsu Kaisen', 'Curse Born of Humans', 'Idle Transfiguration', '🫳'],
  ['Zeke Yeager', 'Attack on Titan', 'Beast Titan', 'Boulder Throw', '🪨'],
  ['Michael Kaiser', 'Blue Lock', 'The Emperor', 'Kaiser Impact', '⚽'],
  ['Light Yagami', 'Death Note', 'Kira', 'Death Note', '📓'],
  ['Nosferatu Zodd', 'Berserk', 'Zodd the Immortal', 'Great Sabre', '🗡️'],
  ['Hisoka', 'Hunter x Hunter', 'The Magician', 'Bungee Gum Cards', '🃏'],
  ['Ulquiorra', 'Bleach', 'Cuatro Espada', 'Murciélago', '🦇'],
  ['Doflamingo', 'One Piece', 'Heavenly Yaksha', 'Parasite Strings', '🧵'],
  ['Akaza', 'Demon Slayer', 'Upper Rank Three', 'Compass Needle', '🧭'],
  ['Younger Toguro', 'Yu Yu Hakusho', '100% Toguro', '100% Muscle', '💪'],
  ['Beru', 'Solo Leveling', 'Ant King', 'Ant King’s Claws', '🐜'],
  ['Jack Hanma', 'Baki', 'Jack Hammer', 'Goudou Bite', '🦷'],
  ['King Bradley', 'Fullmetal Alchemist', 'Wrath', 'Ultimate Eye Sabres', '⚔️'],
  ['Suguru Geto', 'Jujutsu Kaisen', 'Worst Curse User', 'Playful Cloud', '🥢'],
  ['Coyote Starrk', 'Bleach', 'Primera Espada', 'Los Lobos', '🔫'],
  ['Katakuri', 'One Piece', 'Sweet Commander', 'Mogura', '🔱'],
  ['Itachi Uchiha', 'Naruto', 'Itachi of the Sharingan', 'Totsuka Blade', '🗡️'],
  ['Chrollo Lucilfer', 'Hunter x Hunter', 'Head of the Spider', 'Bandit’s Secret', '📖'],
  ['Esdeath', 'Akame ga Kill', 'The Empire’s Strongest', 'Demon’s Extract', '🧊'],
  ['Doma', 'Demon Slayer', 'Upper Rank Two', 'Golden War Fans', '🪭'],
  ['Tomura Shigaraki', 'My Hero Academia', 'Symbol of Fear', 'Decay', '🖐️'],
  ['Diavolo', 'JoJo’s Bizarre Adventure', 'The Boss', 'King Crimson', '👑'],
  ['Cell', 'Dragon Ball', 'Perfect Cell', 'Solar Kamehameha', '🌞'],
  ['Eto', 'Tokyo Ghoul', 'One-Eyed Owl', 'Kagune Blades', '🦉'],
  ['Pickle', 'Baki', 'The Primeval Man', 'Fangs', '🦴'],
  ['Baran', 'Solo Leveling', 'Monarch of White Flames', 'Demon King’s Longsword', '⚡'],
  ['Neferpitou', 'Hunter x Hunter', 'Royal Guard', 'Terpsichora', '🐈'],
  ['Garou', 'One Punch Man', 'Hero Hunter', 'Water Stream Rock Smashing Fist', '🌊'],
  ['Majin Buu', 'Dragon Ball', 'Majin', 'Chocolate Beam', '🍫'],
  ['Pain', 'Naruto', 'Deva Path', 'Almighty Push', '📍'],
  ['Dio Brando', 'JoJo’s Bizarre Adventure', 'Lord DIO', 'The World', '⏱️'],
  ['Frieza', 'Dragon Ball', 'Emperor of the Universe', 'Death Ball', '☄️'],
  ['Zeref', 'Fairy Tail', 'Black Wizard', 'Death Magic', '🌑'],
  ['Makima', 'Chainsaw Man', 'Control Devil', 'Finger Gun', '👉'],
  ['Blackbeard', 'One Piece', 'Blackbeard', 'Dark-Dark and Quake-Quake', '🕳️'],
  ['All For One', 'My Hero Academia', 'Symbol of Evil', 'All For One', '🖤'],
  ['Father', 'Fullmetal Alchemist', 'Dwarf in the Flask', 'Philosopher’s Stone', '🔴'],
  ['Boros', 'One Punch Man', 'Dominator of the Universe', 'Collapsing Star Roaring Cannon', '🌠'],
  ['Broly', 'Dragon Ball', 'Legendary Super Saiyan', 'Eraser Cannon', '💚'],
  ['Goku Black', 'Dragon Ball', 'Super Saiyan Rosé', 'Ki Scythe', '🌸'],
  ['Kaido', 'One Piece', 'Strongest Creature', 'Hassaikai', '🏏'],
  ['Sosuke Aizen', 'Bleach', 'Lord of Las Noches', 'Kyoka Suigetsu', '🪞'],
  ['Meruem', 'Hunter x Hunter', 'King of the Chimera Ants', 'Tail Stinger', '🦂'],
  ['Acnologia', 'Fairy Tail', 'Dragon King', 'Eternal Flare', '🐉'],
  ['Muzan Kibutsuji', 'Demon Slayer', 'Demon King', 'Flesh Whips', '🩸'],
  ['Griffith', 'Berserk', 'White Hawk', 'Crimson Behelit', '🥚'],
  ['Jiren', 'Dragon Ball', 'Jiren the Gray', 'Power Impact', '👊'],
  ['Antares', 'Solo Leveling', 'Monarch of Destruction', 'Breath of Destruction', '🐲'],
  ['Sukuna', 'Jujutsu Kaisen', 'King of Curses', 'Malevolent Shrine', '⛩️'],
  ['Beerus', 'Dragon Ball', 'God of Destruction', 'Hakai', '🟣'],
  ['Madara Uchiha', 'Naruto', 'Ghost of the Uchiha', 'Gunbai', '🪭'],
  ['Yujiro Hanma', 'Baki', 'The Ogre', 'Demon Back', '👹']
];
var DUEL_CUT = [3, 11, 20, 29, 45, 67, 85], DUEL_WAS = 90; // numbers (1–90) in the old list that are no longer bosses
var DUEL_ART = [], DUEL_OLD_TO_NEW = {};
(function () { for (var o = 1, n = 0; o <= DUEL_WAS; o++) { if (DUEL_CUT.indexOf(o) >= 0) continue; DUEL_OLD_TO_NEW[o - 1] = n++; DUEL_ART.push(o); } })();
/* challenge, three difficulty tiers (the first, middle and last third of the bosses). Every one is chosen to be knee- and back-friendly:
   no loaded spinal extension (no supermans), no straight-leg raises, no more than 100 core reps, walking not running,
   nothing that asks for more than 17,000 steps, and nothing that tells you to eat under your calorie floor. */
var DUEL_TASKS = [
  ['Abs circuit', ['3 rounds: 10 bent-knee leg raises, 15 crunches, 30s plank', '3 rounds: 12 bent-knee leg raises, 20 crunches, 45s plank', '4 rounds: 15 bent-knee leg raises, 25 crunches, 60s plank']],
  ['Dead hang', ['Hang from a bar for 90 seconds in total', 'Hang for 2 minutes in total', 'Hang for 3 minutes in total, in as few sets as you can']],
  ['Push-up count', ['40 push-ups across the day', '60 push-ups across the day', '80 push-ups across the day']],
  ['Ball mastery', ['100 toe taps and 100 sole rolls, then 5 minutes of weak-foot touches', '150 toe taps, 150 sole rolls, 8 minutes weak foot', '200 toe taps, 200 sole rolls, 10 minutes weak foot']],
  ['Keepy-uppies', ['Reach 15 in a row, or 10 honest minutes trying', 'Reach 25 in a row, or 12 minutes trying', 'Reach 40 in a row, or 15 minutes trying']],
  ['Plank bank', ['3 minutes of plank in total', '4 minutes of plank in total', '5 minutes of plank in total']],
  ['Night walk', ['15-minute incline or brisk walk after dinner, on top of your steps', '20 minutes after dinner', '30 minutes after dinner']],
  ['Cold finish', ['End your shower with 30 seconds of cold water', '60 seconds of cold water', '90 seconds of cold water, slow breathing']],
  ['Hip and hamstring mobility', ['10 minutes: hip flexor, hamstring and glute stretches', '12 minutes, 60 seconds each hold', '15 minutes, 90 seconds each hold']],
  ['Shadow boxing', ['3 rounds of 2 minutes, 30s rest', '3 rounds of 3 minutes, 30s rest', '5 rounds of 3 minutes, 30s rest']],
  ['Glute bridges', ['3 × 15, squeeze 2 seconds at the top', '3 × 20, 3-second squeeze', '3 × 20 on two legs, then 2 × 8 single-leg each side']],
  ['Push-up ladder', ['1-2-3-4-5-4-3-2-1 (25 reps), short rests', '1 up to 6 and back down (36 reps)', '1 up to 7 and back down (49 reps)']],
  ['Side planks', ['3 × 30s each side', '3 × 40s each side', '3 × 50s each side, top leg raised on the last set']],
  ['Dead bugs and hollow hold', ['3 × 10 dead bugs each side, 3 × 20s hollow hold (knees bent, lower back flat)', '3 × 12 each side, 3 × 30s (knees bent, lower back flat)', '4 × 12 each side, 4 × 30s (bend the knees the moment your back lifts)']],
  ['Kitchen closed', ['Hit your calories and protein first. After that, no unplanned snacking. Protein shakes are fine', 'Calories and protein hit, then nothing unplanned for the rest of the day. Decide your evening food before 6pm', 'Calories and protein hit by 8pm, then nothing unplanned. A shake still counts as planned']],
  ['Step raid', ['Beat today’s step target by 1,000 (17,000 at most)', 'Beat it by 1,500 (17,000 at most)', 'Beat it by 2,000 (17,000 at most)']],
  ['Weak-foot only', ['10 minutes of dribbling and passing against a wall, weak foot only', '15 minutes weak foot only', '20 minutes weak foot only, including 30 first-time passes']],
  ['Slow push-ups', ['3 × 6 with a 5-second lowering', '3 × 8 with a 5-second lowering', '4 × 8 with a 5-second lowering and 1-second pause']],
  ['Knee raises', ['3 × 10 lying or hanging knee raises, slow', '3 × 12 hanging knee raises (lying if your back or grip says so)', '4 × 12 hanging or lying knee raises, 2-second hold at the top']],
  ['Stomach vacuums', ['5 × 15 seconds, for a tighter waist', '6 × 20 seconds', '8 × 20 seconds']],
  ['Posture reset', ['3 × 12 wall angels and 3 × 10 chin tucks', '3 × 15 wall angels, 3 × 12 chin tucks, 2 minutes doorway chest stretch', '4 × 15 wall angels, 3 × 15 chin tucks, 3 minutes chest stretch']],
  ['Fast mile', ['Walk one mile in under 17 minutes', 'Walk one mile in under 16 minutes', 'Walk one mile in under 15 minutes. Walk, don’t run']],
  ['Pike push-ups', ['3 × 6 for the shoulders', '3 × 8', '4 × 8, feet raised on a step']],
  ['Back armour', ['3 × 8 bird dogs each side and 3 × 20s side plank each side', '3 × 10 bird dogs each side, 3 × 30s side planks', '3 × 12 slow bird dogs each side, 3 × 40s side planks']],
  ['Early lights out', ['Phone away by 10:30pm, in bed by 11pm', 'Phone away by 10:15pm', 'Phone away by 10pm, 10 minutes of stretching before bed']],
  ['Prep the win', ['Tonight, prep tomorrow’s yogurt bowl and lunch', 'Prep tomorrow’s bowl, lunch and gym bag', 'Prep two days of bowls and lunches']],
  ['Lat activation', ['3 × 8 scapular pull-ups, or 3 × 20s active hangs', '3 × 10 scapular pull-ups', '4 × 10 scapular pull-ups, then one max dead hang']],
  ['Diamond push-ups', ['3 × 6', '3 × 8', '4 × 10']],
  ['100-rep core', ['25 dead bugs, 25 heel taps, 25 bird dogs, 25 bent-knee reverse crunches', 'The same 100, then a 45s plank', 'The same 100 at a slow 2-second count, then a 60s plank']],
  ['First touch', ['50 wall passes each foot, control then pass', '75 each foot, two-touch', '100 each foot, then 20 turns with the ball']]
];
var DUEL_LINES = [
  'You showed up when it would have been easy not to. That is the whole game.',
  'One more day stacked. The man in the mirror is changing.',
  'Discipline beat mood today. Remember how this feels.',
  'Small wins, kept daily, become a different body.',
  'You did the thing nobody would have checked. That counts double.',
  'This is what 79kg is built from: days exactly like today.',
  'Run in such a way as to get the prize. (1 Corinthians 9:24)',
  'Another boss down. The scale will catch up with the work.',
  'You are keeping promises to yourself. Keep going.',
  'Hard today, lighter tomorrow. Literally.',
  'I can do all this through him who gives me strength. (Philippians 4:13)',
  'The love handles are losing. Stay on them.',
  'Nobody outworks a man who refuses to skip the small stuff.',
  'Proof, not motivation. You now have proof.',
  'That was extra. Extra is where the taper comes from.',
  'Let us not become weary in doing good. (Galatians 6:9)',
  'Strong back, steady habits. Both are showing.',
  'You beat the version of you who wanted to scroll instead.',
  'Momentum is real. Protect the streak tomorrow.',
  'Discipline is not pleasant while it is happening. The harvest comes later, to those trained by it. (my own words; read Hebrews 12:11)',
  'Day by day. That is how winter arcs are won.',
  'You earned this one. Hang it on the wall.',
  'The work is boring. The result will not be.',
  'Be strong and courageous. (Joshua 1:9)',
  'Shoulders back. You are becoming the goal ghost.',
  'Another weapon for the Armoury, another reason not to quit.',
  'You chose the harder option on purpose. Respect.',
  'Whatever you do, work at it with all your heart. (Colossians 3:23)',
  'Consistency is your superpower. Use it again tomorrow.',
  'One day, one boss, one win. That is how the whole arc gets written.'
];
/* challenges that need gym kit (a pull-up bar). They are only set on a gym day; a boss that lands on a rest or football
   day gets the version you can do at home instead (same muscles, no bar) */
var DUEL_GYM_ONLY = {
  'Dead hang': ['Farmer carry', ['Carry two heavy shopping bags or water packs, standing tall: 4 × 45 seconds', '4 × 60 seconds, standing tall', '5 × 60 seconds, slow steps, shoulders back']],
  'Lat activation': ['Doorway rows', ['Hold a sturdy door frame and lean back: 3 × 10 slow rows', '3 × 12, squeeze 2 seconds at the top', '4 × 12, 2-second squeeze, feet closer to the door']]
};
var DUEL_FINISHERS = ['20 push-ups', 'a 60-second plank', 'a 10-minute brisk walk', '30 bodyweight squats', '15 burpees, steady pace', 'a 45-second hollow hold'];
function duelStart(s) { return isKey(s.duels.start) ? s.duels.start : ''; }
function duelInfo(i, s) {
  var b = DUELS[i]; if (!b) return null;
  var tier = Math.min(2, Math.floor(i * 3 / DUELS.length)), task = DUEL_TASKS[(i * 7) % DUEL_TASKS.length], gym = !!DUEL_GYM_ONLY[task[0]];
  if (gym && s) { var day = duelDay(s, i); if (day && dayType(s, day) !== 'gym') { task = DUEL_GYM_ONLY[task[0]]; gym = false; } }
  var art = DUEL_ART[i], nn = (art < 10 ? '0' : '') + art, text = task[1][tier], back = false;
  // a boss that escaped before OPERATION 79.9 is back, and harder: the next level up of its challenge, plus a finisher
  if (s && duelOp(s) && duelOp(s).hard && duelOp(s).hard[i] && !s.duels.won[i]) { back = true; text = task[1][Math.min(2, tier + 1)] + '. Then ' + DUEL_FINISHERS[i % DUEL_FINISHERS.length]; }
  return { art: 'art/b/' + nn + '.webp', wart: 'art/w/' + nn + '.webp', i: i, no: i + 1, name: b[0], anime: b[1], title: b[2], weapon: b[3], icon: b[4], tier: tier, task: task[0], taskText: text, gymTask: gym, returned: back, line: DUEL_LINES[(i * 11) % DUEL_LINES.length] };
}
/* All 90 bosses arrive, in order, between the day the bosses began and the last day of the arc. With 90 or more days to
   go that is one a day. With fewer, the final days bring two each (and, if the app was first opened very late, more),
   so the last boss always arrives on the last day and none is left out. */
function duelPlan(s) {
  var st = duelStart(s); if (!st) return null;
  var total = DUELS.length, days = Math.max(1, diffDays(st, s.profile.seasonEnd) + 1), dbl = days >= total ? 0 : total - days;
  return { start: st, days: Math.min(days, total), doubled: Math.min(dbl, days), single: days >= total ? total : Math.max(0, days - dbl), squeezed: dbl > days };
}
function duelOffset(s, i) {
  var p = duelPlan(s); if (!p) return -1;
  if (p.squeezed) return Math.min(p.days - 1, Math.floor(i * p.days / DUELS.length));
  return i < p.single ? i : p.single + Math.floor((i - p.single) / 2);
}
function duelOp(s) { var o = s.duels && s.duels.op; return isObj(o) && isObj(o.sched) ? o : null; }
function duelDay(s, i) { var op = duelOp(s); if (op && isKey(op.sched[i]) && !s.duels.won[i]) return op.sched[i]; var o = duelOffset(s, i); return o < 0 ? '' : addDays(duelStart(s), o); }
/* 'won' | 'upcoming' | 'active' | 'escaped'. A boss can be fought on its day and the day after, never after the arc has ended. */
function duelStatus(s, i, k) {
  if (s.duels.won[i]) return 'won';
  var d = duelDay(s, i); if (!d || k < d) return 'upcoming';
  return k <= addDays(d, 1) && !seasonOver(s, k) ? 'active' : 'escaped';
}
/* the bosses you can fight today, oldest first: any from yesterday (last chance), then today's */
function duelsToday(s, k) {
  var out = []; if (!duelStart(s)) return out;
  for (var i = 0; i < DUELS.length; i++) if (duelStatus(s, i, k) === 'active') { var b = duelInfo(i, s); b.day = duelDay(s, i); b.lastChance = b.day < k || k >= s.profile.seasonEnd; out.push(b); }
  return out;
}
function defeatDuel(s, i, k) { if (duelStatus(s, i, k) !== 'active') return null; s.duels.won[i] = k; return duelInfo(i, s); }
function undoDuel(s, i) { delete s.duels.won[i]; }
function duelSummary(s, k) {
  var won = 0, escaped = 0, active = 0, upcoming = 0;
  for (var i = 0; i < DUELS.length; i++) { var st = duelStatus(s, i, k); if (st === 'won') won++; else if (st === 'escaped') escaped++; else if (st === 'active') active++; else upcoming++; }
  return { won: won, escaped: escaped, active: active, upcoming: upcoming, total: DUELS.length };
}
function duelTitles(s) { var out = []; for (var i = 0; i < DUELS.length; i++) if (s.duels.won[i]) out.push(DUELS[i][2]); return out; }
/* does this day hold anything you logged? (an empty shell with only stored targets does not count) */
function dayHasData(d) { return !!(d && ((d.foods && d.foods.length) || (d.workouts && d.workouts.length) || (d.activities && d.activities.length) || d.water || d.steps || d.weight != null || d.bf != null || (d.meas && Object.keys(d.meas).length) || d.lightsOut || d.recover || d.penaltyDone || d.bowl || (d.supps && Object.keys(d.supps).length))); }
function loggedDays(s) { var n = 0; if (isObj(s) && isObj(s.days)) Object.keys(s.days).forEach(function (k) { if (dayHasData(s.days[k])) n++; }); return n; }
/* the few facts needed to compare two copies of your data: how many days, last weight, when it last changed */
function stateSummary(s) { var ws = isObj(s) && isObj(s.days) ? weightSeries(s) : []; return { days: loggedDays(s), kg: ws.length ? ws[ws.length - 1].kg : null, changedAt: Math.max(0, num(s && s.meta && s.meta.changedAt, 0)) }; }
/* what to do when this phone and the cloud copy are compared.
   base = the cloud version this phone last synced with; dirty = this phone has changes not yet sent;
   mine = the cloud copy IS this phone's own last upload (its reply was lost); changedSincePush = changed again since that upload.
   Returns 'none' | 'push' | 'ack' (record our own upload as done) | 'adopt' (take the cloud copy) | 'conflict' (ask). */
function syncDecision(o) {
  var dirty = !!o.dirty || (!o.base && o.localDays > 0), cloudDays = Math.max(0, num(o.cloudDays, 0));
  if (!o.cloudHasData) return dirty ? 'push' : 'none';
  if (!o.localDays && cloudDays > 0) return 'adopt';          // an empty phone never replaces a cloud copy that has days in it
  if (!o.localDays && !o.base) return 'adopt';                 // nothing logged here and never synced: nothing to lose
  var shrunk = cloudDays - num(o.localDays, 0) >= 2;          // this phone holds clearly fewer days than the cloud: always ask first
  if (o.mine) return o.changedSincePush ? (shrunk ? 'conflict' : 'push') : 'ack';
  if (o.base && o.cloudSavedAt === o.base) return o.dirty ? (shrunk ? 'conflict' : 'push') : 'none';
  if (dirty) return 'conflict';
  // the cloud changed somewhere else: take it without asking only if it is newer and holds at least as many days
  return (num(o.cloudChangedAt, 0) >= num(o.localChangedAt, 0) && cloudDays >= o.localDays) ? 'adopt' : 'conflict';
}
function exportState(s) { return JSON.stringify({ app: 'winter-arc', exported: new Date().toISOString(), state: s }, null, 1); }
/* a backup file must really be one: an object with numbered version, a days list and a profile. Anything else is refused. */
function importState(text) {
  var o = JSON.parse(text);
  var st = isObj(o) && isObj(o.state) ? o.state : o;
  if (!isObj(st) || !isObj(st.days) || !isObj(st.profile) || !(num(st.version, -1) >= 0)) throw new Error('This doesn’t look like a Winter Arc backup');
  var bad = Object.keys(st.days).filter(function (k) { return !isKey(k) || !isObj(st.days[k]); });
  if (bad.length) throw new Error('This backup has ' + bad.length + ' day' + (bad.length === 1 ? '' : 's') + ' with an impossible date (' + bad[0].slice(0, 12) + ')');
  return migrate(st);
}

/* ───────────────────────── system notice text ───────────────────────── */
/* ───────────────────────── Winter Arc plan: programme, deloads, checkpoints, fortnightly review ───────────────────────── */
/* [exercise, sets, rep range low, high, c = compound (2 reps short of failure) | i = isolation (1 short), cue] */
var PROGRAM = {
  1: { key: 'push', name: 'Push', list: [['incline_db_press', 3, 8, 10, 'c'], ['db_shoulder_press', 3, 8, 10, 'c', 'seated'], ['machine_chest_press', 3, 10, 12, 'c'], ['lateral_raise', 3, 12, 15, 'i', 'cable'], ['tricep_pushdown', 3, 10, 15, 'i'], ['overhead_tricep_ext', 3, 10, 15, 'i']] },
  2: { key: 'legs', name: 'Legs', note: 'Knee and back safe', list: [['leg_press', 3, 10, 12, 'c', 'stop at 90°'], ['db_rdl', 3, 10, 12, 'c', 'flat back, light to moderate'], ['leg_curl', 3, 10, 15, 'i', 'seated'], ['hip_thrust', 3, 8, 12, 'c'], ['calf_raise', 3, 12, 15, 'i']] },
  6: { key: 'pull', name: 'Pull', list: [['lat_pulldown', 3, 8, 12, 'c', 'wide grip'], ['cs_row', 3, 8, 12, 'c'], ['straight_arm_pulldown', 3, 12, 15, 'i'], ['reverse_pec_deck', 3, 12, 15, 'i'], ['bicep_curl', 3, 10, 12, 'i'], ['hammer_curl', 3, 10, 12, 'i']] }
};
var ABS_MOVES = ['Leg raise', 'Crunch', 'Plank', 'Side plank', 'Dead bug'];
var PLAN_RULES = ['Protein first, every day.', 'One bad day is one day. No “write-off” thinking.', 'No week-long breaks.', 'Steps are non-negotiable on rest days.', 'Judge progress by the 7-day average, never a single weigh-in.'];
var SUPPS = [{ id: 'creatine', name: 'Creatine 5g' }, { id: 'vitd', name: 'Vitamin D3 2,000 IU' }];
function stepsBase(s, k) { var g = tgOf(s, k); return g ? g.s : liveStepsBase(s, k); }
/* today's step target. A day you logged under the minimum (10k) is made up the next day; a day with no steps entered is
   "not logged" and owes nothing. Whatever is owed, one day's target never goes over STEP_CAP (17,000). */
function stepsTarget(s, k) {
  var g = tgOf(s, k); if (g && g.st > 0) return g.st; // a day from before v12 keeps the target it had
  var base = stepsBase(s, k), yk = addDays(k, -1), y = s.days[yk], min = dayRules(s, k).stepsMin, owed = 0;
  if (y && y.steps > 0 && y.steps < min && yk >= s.profile.startDate) owed = Math.min(5000, min - y.steps);
  var b = opBoost(s, k); if (b) owed += b.steps; // behind a checkpoint: +2,000 a day for the week after it
  return Math.round(Math.max(base, Math.min(base + owed, STEP_CAP)));
}
function stepsOwed(s, k) { return stepsTarget(s, k) - stepsBase(s, k); }
/* yesterday has no steps entered (and the app was already in use): worth a nudge, because today's target depends on it */
function stepsNotLogged(s, k) { var yk = addDays(k, -1), first = firstLoggedDay(s), y = s.days[yk]; return yk >= s.profile.startDate && !!first && yk >= first && !(y && y.steps > 0); }
function isDeload(s, k) { return s.plan.deloads.some(function (d) { return Array.isArray(d) && k >= d[0] && k <= d[1]; }); }
function nextDeload(s, k) { var n = s.plan.deloads.filter(function (d) { return d[1] >= k; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; })[0]; return n || null; }
function weekOfPlan(s, k) { var total = Math.max(1, Math.round((diffDays(s.profile.startDate, s.profile.seasonEnd) + 1) / 7)); return { week: clamp(Math.floor(diffDays(s.profile.startDate, k) / 7) + 1, 1, total), total: total, over: seasonOver(s, k) }; }
function programRange(s, e) { var o = s.plan.ranges[e[0]]; return Array.isArray(o) && o.length === 3 ? { sets: o[0], lo: o[1], hi: o[2] } : { sets: e[1], lo: e[2], hi: e[3] }; }
function programDoneOn(s, k, prog) { var d = s.days[k]; return !!d && d.workouts.some(function (w) { return prog.list.some(function (e) { return e[0] === w.ex; }); }); }
/* which session today: the weekday's, or (if you moved a gym day) the one you've gone longest without */
function sessionFor(s, k) {
  if (dayType(s, k) !== 'gym') return null;
  var PR = inOp(s, k) ? OP_PROGRAM : PROGRAM, p = PR[weekday(k)];
  if (!p) {
    var best = null, bestAge = -1;
    Object.keys(PR).forEach(function (wd) { var pr = PR[wd], last = null; Object.keys(s.days).sort().forEach(function (dk) { if (dk < k && programDoneOn(s, dk, pr)) last = dk; }); var age = last ? diffDays(last, k) : 999; if (age > bestAge) { bestAge = age; best = pr; } });
    p = best;
  }
  return p;
}
/* every set of one exercise logged on one day, in the order logged (a session split over several entries is one session) */
function setsOn(d, ex) { var out = []; ((d && d.workouts) || []).slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (w) { if (w.ex === ex) out = out.concat(w.sets); }); return out; }
/* your last REAL session of an exercise: deload weeks are skipped, so after a deload you go back to your working weight */
function lastSets(s, ex, beforeK) {
  var ks = Object.keys(s.days).sort();
  for (var i = ks.length - 1; i >= 0; i--) { if (ks[i] >= beforeK || isDeload(s, ks[i])) continue; var sets = setsOn(s.days[ks[i]], ex); if (sets.length) return { day: ks[i], sets: sets }; }
  return null;
}
function roundKg(v) { return v >= 20 ? Math.round(v / 2.5) * 2.5 : Math.round(v); }
/* what to aim for on one exercise today */
function exerciseTarget(s, k, e) {
  var ex = exerciseByKey(e[0]), rg = programRange(s, e), last = lastSets(s, e[0], k), deload = isDeload(s, k), d = s.days[k];
  var done = d ? d.workouts.filter(function (w) { return w.ex === e[0]; }).pop() || null : null;
  var o = { key: e[0], name: ex ? ex.name : e[0], cue: e[5] || '', sets: rg.sets, lo: rg.lo, hi: rg.hi, rir: e[4] === 'c' ? 2 : 1, compound: e[4] === 'c', last: last, done: done, kg: null, action: 'start', text: '' };
  if (!last) { o.text = 'First time: pick a weight you can do for ' + rg.lo + '–' + rg.hi + ' reps with ' + o.rir + ' left in the tank.'; return o; }
  var top = Math.max.apply(null, last.sets.map(function (x) { return x.kg; })), reps = last.sets.map(function (x) { return x.reps; });
  if (deload) { o.action = 'deload'; o.kg = roundKg(top * 0.6); o.text = 'Deload: ' + o.kg + 'kg (60% of ' + top + 'kg), same reps, easy.'; return o; }
  if (last.sets.length >= rg.sets && last.sets.every(function (x) { return x.kg >= top && x.reps >= rg.hi; })) { o.action = 'up'; o.kg = top > 0 ? top + (top >= 40 ? 2.5 : top >= 12 ? 2 : 1) : 0; o.text = 'You hit ' + rg.hi + ' on every set. Add weight: try ' + o.kg + 'kg for ' + rg.lo + '+.'; return o; }
  o.action = 'hold'; o.kg = top; o.text = 'Stay at ' + top + 'kg and beat ' + reps.join(', ') + '. Add weight once every set hits ' + rg.hi + '.'; return o;
}
function sessionPlan(s, k) { var p = sessionFor(s, k); if (!p) return null; return { key: p.key, name: p.name, note: p.note || '', deload: isDeload(s, k), list: p.list.map(function (e) { return exerciseTarget(s, k, e); }) }; }
function absThisWeek(s, k) { var m = mondayOf(k), n = 0; rangeKeys(m, addDays(m, 6)).forEach(function (d) { if (s.days[d]) n += s.days[d].activities.filter(function (a) { return a.type === 'abs'; }).length; }); return n; }
/* 7-day rolling average weight (needs 2+ weigh-ins) */
function rollingAvg(s, k, n) {
  n = n || 7; var vals = []; for (var i = 0; i < n; i++) { var d = s.days[addDays(k, -i)]; if (d && d.weight != null) vals.push(d.weight); }
  return vals.length >= 2 ? r2(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
}
/* one line per real session of a lift: heaviest weight used and best estimated 1RM (deload weeks left out, split logs merged) */
function liftSessions(s, ex, k) {
  var out = [];
  Object.keys(s.days).sort().forEach(function (dk) {
    if (dk > k || isDeload(s, dk)) return; var sets = setsOn(s.days[dk], ex); if (!sets.length) return;
    out.push({ day: dk, top: Math.max.apply(null, sets.map(function (x) { return x.kg; })), e: Math.max.apply(null, sets.map(function (x) { return e1rm(x.kg, x.reps); })) });
  });
  return out;
}
/* compound lifts that have genuinely dropped two sessions running. Moving up in weight for fewer reps is progress, not a drop. */
function liftsDropping(s, k) {
  var out = [];
  function dropped(a, b) { return b.e < a.e - 0.05 && b.top <= a.top; }
  var seen = {}, PR = inOp(s, k) ? OP_PROGRAM : PROGRAM;
  Object.keys(PR).forEach(function (wd) { PR[wd].list.forEach(function (e) {
    if (e[4] !== 'c' || seen[e[0]]) return; seen[e[0]] = 1; var h = liftSessions(s, e[0], k), n = h.length;
    if (n >= 3 && dropped(h[n - 3], h[n - 2]) && dropped(h[n - 2], h[n - 1])) out.push(exerciseByKey(e[0]).name);
  }); });
  return out;
}
/* the weigh-ins of the 7 days ending on k (none earlier than notBefore, when given): their average and where, on average, they sit in time */
function avgWindow(s, k, notBefore) {
  var sum = 0, off = 0, plan = 0, n = 0;
  for (var i = 0; i < 7; i++) { var dk = addDays(k, -i), d = s.days[dk]; if (notBefore && dk < notBefore) break; if (d && d.weight != null) { sum += d.weight; off += i; plan += planLine(s, dk); n++; } }
  return n >= 2 ? { avg: sum / n, back: off / n, planAvg: plan / n, n: n } : null;
}
/* the plan's "adjust every 2 weeks" table. The first review measures from your start weight on day one. */
function planAdvice(s, k) {
  var w = avgWindow(s, k), now = w ? r2(w.avg) : null, from = addDays(k, -14), then = null, days = 14, drops = liftsDropping(s, k);
  if (from <= s.profile.startDate) { then = s.profile.startKg; days = diffDays(s.profile.startDate, k) - (w ? w.back : 0); }
  else { var w0 = avgWindow(s, from); if (w0) { then = r2(w0.avg); days = 14 + w0.back - (w ? w.back : 0); } }
  var o = { rate: null, now: now, then: then, kcal: 0, steps: 0, code: 'wait', text: 'Needs weigh-ins this week and two weeks ago to judge. Keep weighing in every morning.', lifts: drops };
  if (now != null && then != null && days >= 4) {
    var r = r2((then - now) / (days / 7)); o.rate = r;
    if (r > 1.1) { o.code = 'fast'; o.kcal = 150; o.text = 'Losing ' + r + 'kg a week, which is too fast. Eat 150 kcal more.'; }
    else if (r < 0.3) { o.code = 'stall'; o.kcal = -150; o.steps = 1500; o.text = 'Only ' + r + 'kg a week. Cut 150 kcal and add 1,500 steps.'; }
    else if (r <= 0.5) { o.code = 'slow'; o.kcal = -100; o.text = r + 'kg a week is a bit slow. Cut 100 kcal (or add 1,500 steps instead).'; }
    else { o.code = 'ok'; o.text = r + 'kg a week. On track, change nothing.'; }
  }
  if (o.kcal < 0 && s.targets.calDay.some(function (v) { return v > 0 && v + o.kcal < s.targets.floor; })) o.text += ' Days already at your ' + s.targets.floor.toLocaleString('en-GB') + ' kcal floor stay there.';
  if (drops.length) { o.code = 'lifts'; o.kcal = 150; o.steps = 0; o.text = drops.join(' and ') + ' dropped two sessions in a row. Eat 150 kcal more, whatever the scale says.'; }
  return o;
}
/* review days fall every 14 days from the start (never on the last day). The latest one stays open until you deal with it or the next one arrives. */
function reviewDate(s, k) {
  var e = s.plan.reviewEvery, last = k > s.profile.seasonEnd ? s.profile.seasonEnd : k, m = Math.floor(diffDays(s.profile.startDate, last) / e);
  if (m >= 1 && addDays(s.profile.startDate, m * e) >= s.profile.seasonEnd) m--; // a change starts the day after: a review on the last day would change nothing
  return m >= 1 ? addDays(s.profile.startDate, m * e) : '';
}
/* the whole arc in numbers, for the finish screen */
function seasonSummary(s, k) {
  var end = s.profile.seasonEnd, last = lastSeasonDay(s, k), keys = rangeKeys(s.profile.startDate, last), st = streaks(s, last), m = metrics(s, k), p = player(s, k);
  var w = avgWindow(s, last), endKg = w ? r1(w.avg) : latestWeight(s, last), clears = 0, gym = 0;
  keys.forEach(function (d) { if (s.days[d]) { if (isClear(s, d)) clears++; if (gymSessions(s.days[d]) > 0) gym++; } });
  var cps = checkpoints(s, last).filter(function (c) { return c.past; }), duel = duelSummary(s, k), hero = heroStatus(s, last);
  return { over: seasonOver(s, k), days: keys.length, daysLogged: m.daysLogged, startKg: s.profile.startKg, endKg: endKg, lostKg: r1(s.profile.startKg - endKg), goalKg: s.profile.goalKg, reachedGoal: endKg <= s.profile.goalKg + 0.5,
    clears: clears, bestStreak: st.bestClear, bestProtein: st.bestProtein, calHits: m.calHits, steps: m.steps, gymDays: gym, football: m.football, prs: m.prs, lights: m.lights,
    bossesWon: duel.won, bossesTotal: duel.total, heroes: hero.unlocked, heroesTotal: hero.total, weeklyBosses: bossesUpTo(s, last).filter(function (b) { return b.defeated; }).length,
    level: p.level, rank: p.rank, xp: p.xp, awards: Object.keys(s.player.ach).length, checkpointsHit: cps.filter(function (c) { return c.hit; }).length, checkpoints: cps.length, bfNow: currentBf(s, last), bfStart: s.profile.startBf };
}
function reviewDue(s, k) { if (inOp(s, k)) return false; /* the Sunday review replaces the fortnightly one; calories no longer move */ var r = reviewDate(s, k); return !!r && k <= s.profile.seasonEnd && !(isKey(s.plan.lastReview) && s.plan.lastReview >= r); }
function nextReview(s, k) { var e = s.plan.reviewEvery, n = Math.max(0, diffDays(s.profile.startDate, k)), d = addDays(s.profile.startDate, (Math.floor(n / e) + 1) * e); return d < s.profile.seasonEnd ? d : ''; }
/* apply a review's calorie / step change. It starts tomorrow, never goes below the floor, and each review allows one change. */
function applyAdjustment(s, kcal, steps, k) {
  kcal = Math.round(num(kcal)); steps = Math.round(num(steps));
  if (!reviewDue(s, k)) return { kcal: 0, steps: 0, floored: false, refused: true }; // this review has already been dealt with
  if (kcal || steps) freezeDays(s, k, true); // every day up to and including today keeps the targets it had: the change starts tomorrow
  var fl = s.targets.floor, before = s.targets.calDay.slice();
  s.targets.calDay = s.targets.calDay.map(function (v) { return v > 0 ? Math.max(fl, v + kcal) : v; });
  DAY_TYPES.forEach(function (t) { s.targets.cal[t] = Math.max(fl, s.targets.cal[t] + kcal); });
  if (steps) { s.targets.stepsDay = s.targets.stepsDay.map(function (v) { return v > 0 ? clamp(v + steps, 1000, STEP_CAP) : v; }); s.targets.steps = clamp(s.targets.steps + steps, 1000, STEP_CAP); }
  var diffs = s.targets.calDay.map(function (v, i) { return v - before[i]; }), applied = diffs.filter(function (x) { return x !== 0; });
  var floored = kcal < 0 && before.some(function (v, i) { return v > 0 && diffs[i] !== kcal; });
  var adj = { date: k, kcal: applied.length ? applied[0] : 0, steps: Math.round(num(steps)), from: addDays(k, 1) }, rv = reviewDate(s, k); if (isKey(rv)) adj.review = rv; // written exactly as it is stored, so saved data never needs tidying on the next load
  s.plan.adjustments.push(adj); if (s.plan.adjustments.length > 30) s.plan.adjustments = s.plan.adjustments.slice(-30);
  s.plan.lastReview = k;
  return { kcal: applied.length ? applied[0] : 0, steps: steps, floored: floored, refused: false };
}
function checkpoints(s, k) {
  return s.plan.checkpoints.map(function (c) {
    var past = c.date <= k, avg = past ? (rollingAvg(s, c.date) != null ? rollingAvg(s, c.date) : (s.days[c.date] && s.days[c.date].weight)) : null;
    if (inOp(s, c.date)) { var w = past ? weighNear(s, c.date) : null; return { date: c.date, kg: c.kg, past: past, actual: w ? w.kg : null, hit: w ? w.kg <= c.kg + 1e-9 : null, daysLeft: Math.max(0, diffDays(k, c.date)) }; } // the weight you logged, at or under the line
    return { date: c.date, kg: c.kg, past: past, actual: avg != null ? avg : null, hit: avg != null ? avg <= c.kg + 0.5 : null, daysLeft: Math.max(0, diffDays(k, c.date)) };
  });
}
/* the plan line: a straight line between checkpoints */
function planLine(s, k) {
  var pts = [{ date: s.profile.startDate, kg: s.profile.startKg }].concat(s.plan.checkpoints);
  if (hasOp(s) && s.profile.startDate < OP.start) pts = [pts[0], { date: OP.start, kg: OP.startKg }].concat(s.plan.checkpoints.filter(function (c) { return c.date > OP.start; }));
  if (k <= pts[0].date) return pts[0].kg;
  for (var i = 1; i < pts.length; i++) if (k <= pts[i].date) { var a = pts[i - 1], b = pts[i]; return a.kg + (b.kg - a.kg) * diffDays(a.date, k) / diffDays(a.date, b.date); }
  return pts[pts.length - 1].kg;
}
function planWeightOn(s, k) { return r1(planLine(s, k)); }
/* are you on plan? A 7-day average sits about three days behind today, so it is compared with the plan line
   on the SAME days the weigh-ins were taken, never with today's point on the line. */
function planStatus(s, k) {
  var w = avgWindow(s, k), plan = planWeightOn(s, k);
  if (!w) return { avg: null, plan: plan, planAvg: null, diff: null, state: 'none' };
  var diff = r1(w.avg - w.planAvg);
  return { avg: r2(w.avg), plan: plan, planAvg: r1(w.planAvg), diff: diff, state: diff > 0.3 ? 'behind' : diff < -0.3 ? 'ahead' : 'on' };
}
/* the lights-out quest: in bed in the hour before the time set (default 10–11pm) */
function lightsLabel(t) {
  var m = /^(\d\d):(\d\d)$/.exec(String(t || '')); if (!m) return 'In bed 10–11pm';
  var h = +m[1], mi = m[2] === '00' ? '' : ':' + m[2], a = (h + 23) % 24, ap = function (x) { return x >= 12 ? 'pm' : 'am'; }, h12 = function (x) { return x % 12 || 12; };
  return 'In bed ' + h12(a) + mi + (ap(a) === ap(h) ? '' : ap(a)) + '–' + h12(h) + mi + ap(h);
}
/* same-day prompt: the day looks finished (lights out, or it's late) and you are under the calorie floor */
function underFloorNow(s, k, timeStr) {
  var d = s.days[k]; if (!d || !d.foods.length) return null;
  var c = dayTotals(d).cal, fl = dayRules(s, k).floor, late = String(timeStr || '') >= '20:30';
  return c < fl && (d.lightsOut || late) ? { cal: c, floor: fl, short: Math.round(fl - c) } : null;
}
function floorBreach(s, k) { var yk = addDays(k, -1), y = s.days[yk]; if (!y || !y.foods.length) return null; var c = dayTotals(y).cal; return c < dayRules(s, yk).floor ? c : null; }
function leanMassAlert(s, k) { var sc = latestScan(s, k, 'lbm'), base = baselineScan(s); return sc && base && sc !== base && base.lbm && sc.lbm < base.lbm - 0.9 ? { lbm: sc.lbm, base: base.lbm, date: sc.date } : null; }
function weeklyBudget(s, k) {
  var m = mondayOf(k), eat = 0, burn = 0;
  rangeKeys(m, addDays(m, 6)).forEach(function (d) { var t = dayType(s, d); eat += calTarget(s, d); burn += s.tdee.base + stepsBase(s, d) / 1000 * s.tdee.perKSteps + (t === 'gym' ? s.tdee.gym : t === 'football' ? s.tdee.footballPerHour : 0); });
  return { eat: Math.round(eat), burn: Math.round(burn), deficit: Math.round(burn - eat), perDay: Math.round((burn - eat) / 7), kgPerWeek: r2((burn - eat) / 7700) };
}

function noticeLines(s, k) {
  var t = dayType(s, k), out = [];
  if (seasonOver(s, k)) return ['The Winter Arc finished on ' + fmtDate(s.profile.seasonEnd) + '. Nothing new is asked of you today.'];
  if (notStarted(s, k)) return ['The Winter Arc starts on ' + fmtDate(s.profile.startDate) + '. Nothing is asked or scored before then.'];
  out.push(t === 'gym' ? 'GYM DAY — target ' + calTarget(s, k) + ' kcal' : t === 'football' ? 'FOOTBALL DAY — target ' + calTarget(s, k) + ' kcal' : 'REST DAY — target ' + calTarget(s, k) + ' kcal');
  var sp = sessionPlan(s, k); if (sp) out.push((sp.deload ? 'DELOAD · ' : '') + sp.name.toUpperCase() + ' session · ' + sp.list.length + ' exercises');
  out.push('Steps target ' + stepsTarget(s, k).toLocaleString('en-GB') + (stepsOwed(s, k) > 0 ? ' (includes ' + stepsOwed(s, k).toLocaleString('en-GB') + ' owed from yesterday)' : ''));
  if (isMidweekNight(s, k)) out.push('Men’s midweek tonight.');
  var pen = penaltyFor(s, k); if (pen && !pen.done) out.push('PENALTY: ' + pen.text);
  return out;
}

/* ───────────────────────── OPERATION 79.9 (Fri 13 Nov – Thu 31 Dec 2026) ─────────────────────────
   A season inside the Winter Arc. Everything logged before it is kept and stays judged by the rules of its day; from
   13 Nov the day is judged by the checklist below. Nothing here runs unless the save carries s.op (set by ensureOp). */
var OP = {
  start: '2026-11-13', end: '2026-12-31', startKg: 86.5, target: 79.9, need: 47000,
  cal: 1450, low: 1300, protein: 150, proteinGoal: 160, fat: 50, fibre: 25, treatMax: 150, walkMin: 20,
  iceland: ['2026-12-09', '2026-12-13'], icelandCap: 2250, icelandSteps: 10000, noWeigh: ['2026-12-09', '2026-12-14'],
  caps: { '2026-12-21': 1700, '2026-12-25': 2100 },
  checkpoints: [{ date: '2026-11-20', kg: 84.9 }, { date: '2026-11-27', kg: 83.9 }, { date: '2026-12-04', kg: 82.8 }, { date: '2026-12-07', kg: 82.4 }, { date: '2026-12-16', kg: 82.4 }, { date: '2026-12-21', kg: 81.3 }, { date: '2026-12-25', kg: 80.7 }, { date: '2026-12-31', kg: 79.9 }],
  dayDeficit: { gym: 1090, rest: 975, football: 1800 }, // what the plan expects each kind of diet day to bank
  seasonKg: 90.5, seasonFrom: '2026-09-14', yearKg: 100, heroAt: 80,
  stepsDay: [13000, 13000, 13000, 15000, 15000, 10000, 13000], pattern: ['gym', 'gym', 'gym', 'rest', 'rest', 'football', 'gym']
};
var GYM_LEVELS = { light: 175, moderate: 275, high: 325 };      // kcal for a session of about five exercises
var FOOT_INT = { low: 0.75, medium: 1, high: 1.2 };            // football effort, times the per-minute burn
var OP_QUESTS = [
  { id: 'bowl', name: 'Yogurt bowl', icon: '🥣', xp: 20, gold: 5 },
  { id: 'calories', name: 'Food', icon: '🔥', xp: 40, gold: 15 },
  { id: 'steps', name: 'Steps', icon: '👣', xp: 20, gold: 5 },
  { id: 'training', name: 'Training', icon: '⚔️', xp: 30, gold: 10 },
  { id: 'treat', name: 'Treat', icon: '🍫', xp: 20, gold: 5 },
  { id: 'weigh', name: 'Weigh-in', icon: '⚖️', xp: 20, gold: 5 },
  { id: 'lights', name: 'In bed by 11', icon: '🌙', xp: 20, gold: 5 }
];
/* his split: weekdays two exercises × three sets per muscle group; weekends different exercises × two sets */
var OP_PROGRAM = {
  1: { key: 'cbb', name: 'Chest, back, biceps', list: [['incline_db_press', 3, 8, 10, 'c'], ['machine_chest_press', 3, 10, 12, 'c'], ['lat_pulldown', 3, 8, 12, 'c', 'wide grip'], ['cs_row', 3, 8, 12, 'c'], ['bicep_curl', 3, 10, 12, 'i'], ['hammer_curl', 3, 10, 12, 'i']] },
  2: { key: 'stl', name: 'Shoulders, triceps, legs', list: [['db_shoulder_press', 3, 8, 10, 'c', 'seated'], ['lateral_raise', 3, 12, 15, 'i', 'cable'], ['tricep_pushdown', 3, 10, 15, 'i'], ['overhead_tricep_ext', 3, 10, 15, 'i'], ['leg_press', 3, 10, 12, 'c'], ['leg_curl', 3, 10, 15, 'i', 'seated']] },
  6: { key: 'upper', name: 'Chest, back, arms, shoulders', list: [['db_bench', 2, 8, 10, 'c'], ['dip', 2, 8, 12, 'c'], ['cable_row', 2, 10, 12, 'c'], ['straight_arm_pulldown', 2, 12, 15, 'i'], ['hammer_curl', 2, 10, 12, 'i'], ['tricep_pushdown', 2, 10, 15, 'i'], ['machine_shoulder_press', 2, 8, 10, 'c'], ['reverse_pec_deck', 2, 12, 15, 'i']] },
  0: { key: 'legsabs', name: 'Legs and abs', note: 'After church', list: [['hip_thrust', 3, 8, 12, 'c'], ['db_rdl', 3, 10, 12, 'c', 'flat back'], ['split_squat', 2, 10, 12, 'c'], ['calf_raise', 3, 12, 15, 'i'], ['cable_crunch', 3, 12, 15, 'i'], ['hanging_knee_raise', 3, 10, 15, 'i']] }
};
/* one verse a day. The NIV is a copyrighted translation, so the app carries the reference and a one-line summary in our
   own words, and opens the verse itself in the NIV when tapped. */
var OP_VERSES = [
  ['Hebrews 12:11', 'Discipline stings today and pays you back later.'],
  ['Proverbs 25:28', 'No self-control is a city with its walls down.'],
  ['1 Corinthians 9:27', 'Make your body follow you, not lead you.'],
  ['Galatians 5:22-23', 'Self-control is grown by the Spirit, not forced.'],
  ['Philippians 3:14', 'Keep pushing toward what God has called you to.'],
  ['Philippians 4:13', 'The strength for this is not only yours.'],
  ['1 Corinthians 9:24-25', 'Run to win. Athletes train hard for a prize that fades; yours does not.'],
  ['1 Corinthians 10:13', 'Every temptation comes with a way out.'],
  ['Romans 12:1', 'Your body is something to offer back to God.'],
  ['1 Corinthians 6:19-20', 'Your body is not only yours, so honour God with it.'],
  ['1 Corinthians 10:31', 'Even eating and drinking can be done for God.'],
  ['Romans 5:3-4', 'Hard days build endurance, endurance builds character, character builds hope.'],
  ['Galatians 6:9', 'Do not quit doing good: the harvest is on its way.'],
  ['2 Timothy 1:7', 'Fear is not from God. Power, love and self-discipline are.'],
  ['Hebrews 12:1', 'Drop what slows you down and run your race with endurance.'],
  ['Hebrews 10:36', 'Keep going: the promise is on the far side of perseverance.'],
  ['James 1:2-4', 'Testing produces staying power. Let it finish its work.'],
  ['James 1:12', 'Blessing waits for the one who holds firm under trial.'],
  ['Isaiah 40:31', 'Hope in the Lord and your strength is renewed.'],
  ['Isaiah 41:10', 'Do not be afraid: God holds you up.'],
  ['Joshua 1:9', 'Be brave. God goes with you wherever you go.'],
  ['Proverbs 13:4', 'Wanting is not enough: the diligent are the ones satisfied.'],
  ['Proverbs 16:3', 'Hand your plans to God and they stand firm.'],
  ['Proverbs 16:32', 'Ruling yourself beats conquering a city.'],
  ['Proverbs 21:5', 'Steady, careful work wins; shortcuts cost you.'],
  ['Proverbs 24:16', 'Fall seven times, get up seven times.'],
  ['Psalm 121:8', 'God watches over your going out and your coming home.'],
  ['Psalm 19:1', 'The sky itself tells you how great God is.'],
  ['Psalm 46:1', 'God is your shelter and your strength, close at hand.'],
  ['Matthew 11:28', 'Tired? Come to Jesus and rest.'],
  ['Psalm 37:5', 'Commit your way to God and trust him with it.'],
  ['Lamentations 3:22-23', 'Mercy is fresh every morning.'],
  ['Proverbs 3:5-6', 'Trust God over your own read of things and he straightens the path.'],
  ['Psalm 73:26', 'Body and heart may give out; God does not.'],
  ['Psalm 119:105', 'God’s word lights the next step.'],
  ['Psalm 28:7', 'God is both your strength and your cover.'],
  ['Matthew 6:33', 'Put God’s kingdom first; the rest follows.'],
  ['Matthew 26:41', 'Stay alert and pray: wanting to do right is not the same as having the strength.'],
  ['Matthew 4:4', 'You live on more than food.'],
  ['Luke 16:10', 'Faithful in small things, faithful in big ones.'],
  ['Luke 9:23', 'Following Jesus means saying no to yourself daily.'],
  ['Colossians 3:23', 'Whatever you do, do it wholeheartedly, for the Lord.'],
  ['Luke 2:10-11', 'Good news of great joy: a Saviour is born.'],
  ['1 Timothy 4:8', 'Training the body has value; godliness has more.'],
  ['Titus 2:11-12', 'Grace teaches you to say no.'],
  ['2 Peter 1:5-6', 'Build on your faith: goodness, knowledge, self-control, perseverance.'],
  ['2 Corinthians 12:9', 'Grace is enough, and strength shows up in weakness.'],
  ['Philippians 1:6', 'God finishes what he starts in you.'],
  ['2 Timothy 4:7', 'Fight well, finish the race, keep the faith.']
];
function hasOp(s) { return isObj(s.op) && s.op.v === 1; }
function inOp(s, k) { return hasOp(s) && k >= OP.start && k <= OP.end; }
function isIceland(k) { return k >= OP.iceland[0] && k <= OP.iceland[1]; }
/* '' outside the operation · 'diet' · 'iceland' (maintenance, 9–13 Dec) · 'off' (21 Dec at 1,700, Christmas Day at 2,100) */
function opMode(s, k) { if (!inOp(s, k)) return ''; return isIceland(k) ? 'iceland' : OP.caps[k] ? 'off' : 'diet'; }
function opCap(k) { return isIceland(k) ? OP.icelandCap : OP.caps[k] || 0; }
function opNoWeigh(k) { return k >= OP.noWeigh[0] && k <= OP.noWeigh[1]; }
function opVerse(k) { var i = diffDays(OP.start, k), v = OP_VERSES[i]; if (!v || i < 0) return null; return { ref: v[0].replace(/-/g, '–'), line: v[1], url: 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(v[0]) + '&version=NIV', n: i + 1, total: OP_VERSES.length }; }
/* banned at home until 31 Dec unless it is the day's one treat */
function isBannedFood(name) {
  var n = String(name || '').toLowerCase();
  if (/whey|protein|isolate|shake|skyr|yog/.test(n)) return false; // a chocolate protein shake is not a chocolate snack
  return /mutton\s*roll|samosa|cr[eêe]pe|chocolate|\bchoc\b|brownie|nutella|kit\s?kat|twix|snickers|mars bar|dairy milk|maltesers|bounty|ferrero|kinder|galaxy|oreo|m&m/.test(n);
}
function opTreats(d) {
  var foods = (d && d.foods) || [], tr = foods.filter(function (f) { return f.tr; }), ban = foods.filter(function (f) { return !f.tr && isBannedFood(f.name); });
  return { n: tr.length, kcal: r1(tr.reduce(function (a, f) { return a + f.cal; }, 0)), list: tr, banned: ban };
}
/* the yogurt bowl: ticked by hand, or seen in breakfast (yogurt and whey logged there) */
function bowlDone(d) {
  if (!d) return false; if (d.bowl) return true;
  var b = (d.foods || []).filter(function (f) { return f.meal === 'breakfast'; });
  return b.some(function (f) { return /yog|skyr/i.test(f.name); }) && b.some(function (f) { return /whey|protein/i.test(f.name); });
}
function inclineMinutes(d) { return ((d && d.activities) || []).filter(function (a) { return a.type === 'incline'; }).reduce(function (a, b) { return a + (b.min > 0 ? b.min : 0); }, 0); }
function gymKcal(s, d) {
  var acts = (d.activities || []).filter(function (a) { return a.type === 'gym'; });
  if (!acts.length) return d.workouts && d.workouts.length ? s.tdee.gym : 0;
  return acts.reduce(function (a, x) { return a + (GYM_LEVELS[x.lvl] || s.tdee.gym); }, 0);
}
function footballKcal(s, d) { return (d.activities || []).filter(function (a) { return a.type === 'football'; }).reduce(function (a, x) { return a + (x.min > 0 ? x.min : 0) / 60 * s.tdee.footballPerHour * (FOOT_INT[x.int] || 1); }, 0); }
function inclineKcal(s, d) { return inclineMinutes(d) * num(s.tdee.inclinePerMin, 7); }
/* the weight you logged on a day, or (for a checkpoint) the last one in the two days before it */
function weighNear(s, k, back) {
  for (var i = 0; i <= (back == null ? 2 : back); i++) { var d = s.days[addDays(k, -i)]; if (d && d.weight != null) return { kg: d.weight, day: addDays(k, -i) }; }
  return null;
}
/* the behind-schedule rule: more than 0.3kg over a checkpoint → for the week after it, +2,000 steps a day and +20
   minutes of incline walk on gym days. Calories never move. */
function opBoost(s, k) {
  if (opMode(s, k) !== 'diet') return null;
  var cp = null; OP.checkpoints.forEach(function (c) { if (c.date < k && k <= addDays(c.date, 7)) cp = c; });
  if (!cp) return null; var w = weighNear(s, cp.date); if (!w) return null;
  var over = r1(w.kg - cp.kg); return over > 0.3 ? { steps: 2000, walk: 20, cp: cp, over: over, weighed: w } : null;
}
function opWalkNeed(s, k) { return OP.walkMin + (opBoost(s, k) ? 20 : 0); }
function opQuests(s, k) {
  var d = getDay(s, k), tot = dayTotals(d), mode = opMode(s, k), ct = calTarget(s, k), P = dayRules(s, k).protein, type = dayType(s, k), relaxed = mode !== 'diet';
  var st = stepsTarget(s, k), tr = opTreats(d), logged = d.foods.length > 0, sess = sessionFor(s, k), walk = inclineMinutes(d), need = opWalkNeed(s, k);
  var gymDone = gymSessions(d) > 0, footDone = footballMinutes(d) > 0, nf = function (v) { return Math.round(v).toLocaleString('en-GB'); };
  var foodOk = logged && tot.cal <= ct && (mode === 'off' || tot.p >= P) && (relaxed || tot.cal >= OP.low);
  var trainDone, trainLabel, trainPct, trainName;
  if (relaxed) { trainDone = true; trainPct = 1; trainName = 'Training'; trainLabel = mode === 'iceland' ? 'Holiday: walk and enjoy it' : 'Day off: nothing owed'; }
  else if (type === 'gym') { trainDone = gymDone && walk >= need; trainPct = (gymDone ? 0.5 : 0) + 0.5 * clamp(walk / need, 0, 1); trainName = sess ? sess.name : 'Gym'; trainLabel = (gymDone ? 'Gym ✓' : 'Gym') + ' + incline walk ' + Math.round(walk) + '/' + need + ' min'; }
  else if (type === 'football') { trainDone = footDone; trainPct = footDone ? 1 : 0; trainName = 'Football'; trainLabel = footDone ? Math.round(footballMinutes(d)) + ' min played' : 'Log your minutes after the game'; }
  else { trainDone = !!d.recover || gymDone || footDone; trainPct = trainDone ? 1 : 0; trainName = 'Recover'; trainLabel = 'Rest day: stretch or walk'; }
  var treatDone = mode === 'off' ? true : mode === 'iceland' ? tr.n <= 1 : logged && tr.n <= 1 && tr.kcal <= OP.treatMax && !tr.banned.length;
  var treatLabel = mode === 'off' ? 'Day off' : tr.banned.length ? esc0(tr.banned[0].name) + ' is banned unless it is your treat' : tr.n > 1 ? tr.n + ' treats today, 1 allowed' : tr.n === 1 ? nf(tr.kcal) + ' kcal' + (mode === 'diet' ? ' of ' + OP.treatMax + ' max' : '') : mode === 'iceland' ? 'One a day' : logged ? 'None today' : 'One allowed, ' + OP.treatMax + ' kcal max';
  var map = {
    bowl: { done: relaxed || bowlDone(d), label: relaxed ? 'Not needed today' : bowlDone(d) ? 'Eaten' : 'Before 10am · 377 kcal, 72g protein' },
    calories: { done: foodOk, val: tot.cal, target: ct, unit: 'kcal', label: nf(tot.cal) + ' / ' + nf(ct) + ' max' + (mode === 'off' ? '' : ' · ' + Math.round(tot.p) + '/' + P + 'g protein'), pct: clamp(ct ? tot.cal / ct : 0, 0, 1) },
    steps: { done: mode === 'off' || d.steps >= st, val: d.steps, target: st, unit: '', label: nf(d.steps) + ' / ' + nf(st), pct: clamp(st ? d.steps / st : 0, 0, 1) },
    training: { done: trainDone, label: trainLabel, pct: trainPct, name: trainName },
    treat: { done: treatDone, label: treatLabel },
    weigh: { done: d.weight != null || opNoWeigh(k), label: d.weight != null ? d.weight + 'kg' : opNoWeigh(k) ? 'No weigh-ins until 15 Dec' : 'Morning, fasted, after the toilet' },
    lights: { done: relaxed || !!d.lightsOut, label: mode === 'iceland' ? 'Holiday' : mode === 'off' ? 'Day off' : lightsLabel(s.targets.lightsOut) }
  };
  return OP_QUESTS.map(function (q) { var m = map[q.id]; return { id: q.id, name: m.name || q.name, icon: q.icon, xp: q.xp, gold: q.gold, done: !!m.done, val: m.val == null ? (m.done ? 1 : 0) : m.val, target: m.target == null ? 1 : m.target, unit: m.unit || '', label: m.label, pct: m.pct == null ? (m.done ? 1 : 0) : m.pct }; });
}
function esc0(x) { return String(x == null ? '' : x).slice(0, 40); }
/* the operation's own plan line: 86.5kg on 13 Nov, then checkpoint to checkpoint */
function opLine(k) {
  var pts = [{ date: OP.start, kg: OP.startKg }].concat(OP.checkpoints);
  if (k <= pts[0].date) return pts[0].kg;
  for (var i = 1; i < pts.length; i++) if (k <= pts[i].date) { var a = pts[i - 1], b = pts[i]; return a.kg + (b.kg - a.kg) * diffDays(a.date, k) / diffDays(a.date, b.date); }
  return OP.target;
}
/* the 79.9 Tracker. Judged on the weight you log, against the plan for the day you logged it.
   green = on or under the line · amber = 0.1–0.3kg over · red = more than 0.3kg over */
function opTracker(s, k) {
  if (!hasOp(s)) return null;
  var kk = k > OP.end ? OP.end : k, ws = weightSeries(s).filter(function (w) { return w.key >= OP.start && w.key <= kk; }), last = ws.length ? ws[ws.length - 1] : null;
  var cur = last ? last.kg : OP.startKg, curDay = last ? last.key : OP.start, plan = r1(opLine(curDay)), diff = r1(cur - plan), age = diffDays(curDay, kk);
  var cps = OP.checkpoints.map(function (c) { var w = c.date <= kk ? weighNear(s, c.date) : null; return { date: c.date, kg: c.kg, past: c.date < kk || (c.date === kk && !!w), actual: w ? w.kg : null, hit: w ? w.kg <= c.kg + 1e-9 : null, daysLeft: Math.max(0, diffDays(kk, c.date)) }; });
  var next = cps.filter(function (c) { return c.date >= kk && c.hit == null; })[0] || cps.filter(function (c) { return c.date >= kk; })[0] || null;
  var hold = isIceland(kk) || (opNoWeigh(kk) && age > 0), state = !last ? 'none' : hold ? 'hold' : diff <= 0 ? 'green' : diff <= 0.3 ? 'amber' : 'red';
  var total = OP.startKg - OP.target, lost = r1(OP.startKg - cur);
  return { cur: cur, curDay: curDay, age: age, stale: !hold && !!last && age >= 3, weighed: !!last, avg7: rollingAvg(s, kk), plan: plan, planToday: r1(opLine(kk)), diff: diff, state: state, next: next, checkpoints: cps,
    daysLeft: Math.max(0, diffDays(kk, OP.end)), toGo: r1(Math.max(0, cur - OP.target)), lost: lost, pct: clamp(lost / total, 0, 1), target: OP.target, startKg: OP.startKg,
    // said plainly whenever you are behind: there is almost no slack in this plan
    warn: state === 'amber' || state === 'red' ? 'The margin is about 0.1kg. A few slips from here finishes around 80.3–80.5kg, not 79.9.' : '' };
}
/* the deficit bank: 47,000 kcal to lose the fat. A day counts once its food is logged (a day with nothing logged banks
   nothing); a day in surplus takes out of the bank, whatever kind of day it was. */
function opBank(s, k) {
  if (!hasOp(s)) return null;
  var banked = 0, missing = [], days = [], kk = k > OP.end ? addDays(OP.end, 1) : k;
  rangeKeys(OP.start, addDays(kk, -1)).forEach(function (dk) {
    var d = s.days[dk];
    if (d && d.foods.length) { var v = deficit(s, d); banked += v; days.push({ day: dk, deficit: v, mode: opMode(s, dk) }); }
    else { days.push({ day: dk, deficit: 0, mode: opMode(s, dk), missing: true }); if (opMode(s, dk) === 'diet') missing.push(dk); }
  });
  var td = k <= OP.end ? s.days[k] : null, today = td && td.foods.length ? deficit(s, td) : null, dietLeft = 0, dietTotal = 0, dietDone = 0;
  rangeKeys(OP.start, OP.end).forEach(function (dk) { if (opMode(s, dk) !== 'diet') return; dietTotal++; if (dk >= kk) dietLeft++; else dietDone++; });
  var left = Math.max(0, OP.need - banked), perDay = dietLeft ? Math.ceil(left / dietLeft / 10) * 10 : null, should = Math.round(OP.need * dietDone / Math.max(1, dietTotal));
  return { need: OP.need, banked: Math.round(banked), left: Math.round(left), pct: clamp(banked / OP.need, 0, 1), dietLeft: dietLeft, dietTotal: dietTotal, perDay: perDay, planPerDay: Math.round(OP.need / dietTotal), today: today,
    should: should, behind: Math.round(should - banked), missing: missing, days: days, kgFat: r2(banked / 7700) };
}
/* over the calorie cap today: the steps that cover it (35 kcal per 1,000 steps) */
function opOver(s, k) {
  if (!inOp(s, k)) return null; var d = getDay(s, k), over = dayTotals(d).cal - calTarget(s, k);
  return over > 0 ? { over: Math.round(over), steps: Math.ceil(over / s.tdee.perKSteps * 1000 / 100) * 100, walkMin: Math.ceil(over / num(s.tdee.inclinePerMin, 7) / 5) * 5 } : null;
}
/* what is still missing today (the 8pm nudge and the phone reminder) */
function opMissing(s, k) {
  if (opMode(s, k) !== 'diet') return [];
  var d = getDay(s, k), tot = dayTotals(d), P = dayRules(s, k).protein, ct = calTarget(s, k), st = stepsTarget(s, k), type = dayType(s, k), out = [], nf = function (v) { return Math.round(v).toLocaleString('en-GB'); };
  if (!d.foods.length) out.push('no food logged');
  else { if (tot.p < P) out.push(Math.ceil(P - tot.p) + 'g protein to go'); if (tot.cal < OP.low) out.push(nf(ct - tot.cal) + ' kcal still to eat'); }
  if (d.steps < st) out.push(nf(st - d.steps) + ' steps left');
  if (type === 'gym') { if (!gymSessions(d)) out.push('gym not logged'); var need = opWalkNeed(s, k), w = inclineMinutes(d); if (w < need) out.push(Math.round(need - w) + ' min incline walk'); }
  else if (type === 'football' && !footballMinutes(d)) out.push('football not logged');
  if (d.weight == null && !opNoWeigh(k)) out.push('no weigh-in');
  return out;
}
/* the Sunday review: the week (Mon–Sun) holding k, as far as k */
function opWeek(s, k) {
  if (!hasOp(s)) return null;
  var mon = mondayOf(k), sun = addDays(mon, 6), from = mon < OP.start ? OP.start : mon, to = k < sun ? k : sun; if (to > OP.end) to = OP.end;
  if (to === k && !(s.days[k] && s.days[k].foods.length)) to = addDays(k, -1); // today only counts once its food is logged
  if (from > to) return null;
  var keys = rangeKeys(from, to), def = 0, target = 0, perfect = 0, prot = 0, logged = 0, unlogged = 0, ws = [], diet = 0;
  keys.forEach(function (dk) {
    var d = s.days[dk], mode = opMode(s, dk);
    if (mode === 'diet') { diet++; target += OP.dayDeficit[dayType(s, dk)] || 0; }
    if (d && d.foods.length) { def += deficit(s, d); prot += dayTotals(d).p; logged++; } else if (mode === 'diet') unlogged++;
    if (d && d.weight != null) ws.push(d.weight);
    if (isClear(s, dk)) perfect++;
  });
  var avg = ws.length ? r2(ws.reduce(function (a, b) { return a + b; }, 0) / ws.length) : null, cp = null; OP.checkpoints.forEach(function (c) { if (c.date <= to) cp = c; });
  var w = cp ? weighNear(s, cp.date) : null, pAvg = logged ? Math.round(prot / logged) : null, short = Math.round(target - def), line;
  def = Math.round(def); target = Math.round(target);
  if (!diet) line = 'Holiday week. Hold the line: protein at every meal, walk, one treat a day.';
  else if (!logged) line = 'Nothing was logged this week, so nothing was banked. Log today and the count starts again.';
  else if (short <= 0 && perfect >= Math.min(5, keys.length)) line = 'On the numbers: the deficit is banked and the days were clean. Same again next week.';
  else if (short <= 0) line = 'The deficit is there but only ' + perfect + ' of ' + keys.length + ' days were perfect. The ticks you skip are the ones that slip first.';
  else if (short <= target * 0.15) line = short.toLocaleString('en-GB') + ' kcal short of the week’s deficit, about ' + Math.round(short / 7.7) + 'g of fat still on you. Two incline walks cover it.';
  else line = 'Short by ' + short.toLocaleString('en-GB') + ' kcal, about ' + r1(short / 7700) + 'kg of fat. At this rate 31 Dec lands above 79.9. Hit 1,450 and your steps every day next week.';
  if (pAvg != null && pAvg < OP.protein) line += ' Protein averaged ' + pAvg + 'g: under ' + OP.protein + 'g costs muscle.';
  if (unlogged >= 2) line += ' ' + unlogged + ' days had no food logged, so they banked nothing.';
  return { from: from, to: to, days: keys.length, full: keys.length === 7, deficit: def, target: target, short: short, perfect: perfect, proteinAvg: pAvg, logged: logged, unlogged: unlogged, avg: avg, checkpoint: cp, actual: w ? w.kg : null, diff: cp && w ? r1(w.kg - cp.kg) : null, line: line };
}
/* possible muscle loss: a compound lift down two sessions running, or muscle down on two scans running */
function opMuscle(s, k) {
  if (!inOp(s, k)) return null;
  var lifts = liftsDropping(s, k), sc = s.inbody.filter(function (x) { return x.date <= k && (x.smm != null || x.lbm != null); }), n = sc.length, f = function (x) { return x.smm != null ? x.smm : x.lbm; };
  var scans = n >= 3 && f(sc[n - 1]) < f(sc[n - 2]) - 0.05 && f(sc[n - 2]) < f(sc[n - 3]) - 0.05;
  if (!lifts.length && !scans) return null;
  return { lifts: lifts, scans: scans, text: (lifts.length ? lifts.join(' and ') + ' dropped two sessions in a row. ' : '') + (scans ? 'Muscle is down on your last two scans. ' : '') + 'Possible muscle loss: keep protein at ' + OP.protein + '–' + OP.proteinGoal + 'g, lift heavy and do not cut training volume.' };
}
/* 31 Dec: the weigh-in decides it. Anything above 79.9 is not done. */
function opFinish(s, k) {
  if (!hasOp(s) || k < OP.end) return null;
  var d = s.days[OP.end], kg = d && d.weight != null ? d.weight : null, st = streaks(s, OP.end), bank = opBank(s, addDays(OP.end, 1)), perfect = 0, duel = duelSummary(s, k), hero = heroStatus(s, OP.end), hit = 0;
  rangeKeys(OP.start, OP.end).forEach(function (dk) { if (s.days[dk] && isClear(s, dk)) perfect++; });
  opTracker(s, OP.end).checkpoints.forEach(function (c) { if (c.hit) hit++; });
  return { weighed: kg != null, kg: kg, done: kg != null && kg <= OP.target + 1e-9, over: kg != null ? r1(Math.max(0, kg - OP.target)) : null, confirmed: !!(s.op.final && s.op.final.kg === kg && kg != null),
    lostOp: kg != null ? r1(OP.startKg - kg) : null, lostSeason: kg != null ? r1(OP.seasonKg - kg) : null, lostYear: kg != null ? r1(OP.yearKg - kg) : null,
    perfect: perfect, days: diffDays(OP.start, OP.end) + 1, banked: bank.banked, need: OP.need, bestStreak: st.bestClear, bestProtein: st.bestProtein, bossesWon: duel.won, bossesTotal: duel.total, heroes: hero.unlocked, heroesTotal: hero.total, checkpointsHit: hit, checkpoints: OP.checkpoints.length };
}
function confirmOpFinish(s, k) { var f = opFinish(s, k); if (!f || !f.weighed) return null; s.op.final = { kg: f.kg, day: k }; return opFinish(s, k); }
/* starts the operation on a save (once). Everything logged is kept; days before 13 Nov keep the targets and rules they
   were judged by. Bosses already beaten stay beaten; every other boss is drawn onto a new day between now and 30 Dec
   (no bosses in Iceland), some days two, and a boss that had escaped comes back with a harder challenge. Heroes already
   freed stay freed; the rest are spread evenly from 86.5kg so the last one breaks free at 80.0kg. */
function ensureOp(s, todayK) {
  if (hasOp(s)) return false;
  var k = isKey(todayK) ? todayK : dayKey(); if (k < OP.start) k = OP.start; if (k > OP.end) k = OP.end;
  var hs = heroStatus(s, k), had = hs.milestones.filter(function (x) { return x.hit; }).map(function (x) { return x.hitDay || OP.start; });
  var rest = [], missed = {}; for (var i = 0; i < DUELS.length; i++) if (!s.duels.won[i]) { rest.push(i); if (duelStart(s) && duelStatus(s, i, k) === 'escaped') missed[i] = 1; }
  freezeDays(s, OP.start, false);
  Object.keys(s.days).forEach(function (dk) { if (dk >= OP.start && s.days[dk].tg) delete s.days[dk].tg; }); // from 13 Nov the new checklist judges the day
  var T = s.targets;
  T.calDay = [OP.cal, OP.cal, OP.cal, OP.cal, OP.cal, OP.cal, OP.cal]; T.cal = { gym: OP.cal, football: OP.cal, rest: OP.cal }; T.floor = FLOOR_MIN;
  T.protein = OP.protein; T.fat = OP.fat; T.fibre = OP.fibre; T.fibreQuest = OP.fibre; T.carbsMin = 70; T.carbsMax = 110; T.waterMl = 3000; T.lightsOut = '23:00';
  T.stepsDay = OP.stepsDay.slice(); T.steps = 13000; T.stepsMin = 10000;
  s.week.pattern = OP.pattern.slice();
  s.plan.checkpoints = clone(OP.checkpoints); s.plan.deloads = s.plan.deloads.filter(function (d) { return d[1] < OP.start; });
  s.tdee.base = 1900; s.tdee.perKSteps = 35; s.tdee.footballPerHour = 670; s.tdee.inclinePerMin = 7;
  s.profile.goalKg = OP.target; s.profile.seasonEnd = OP.end;
  rangeKeys(OP.iceland[0], OP.iceland[1]).forEach(function (dk) { s.overrides[dk] = 'rest'; });
  // heroes
  var left = HEROES.length - had.length, needs = []; for (var j = 1; j <= left; j++) needs.push(r2(OP.startKg - j * (OP.startKg - OP.heroAt) / left));
  s.heroes.op = { day: OP.start, from: OP.startKg, had: had, needs: needs };
  // bosses
  if (duelStart(s) && rest.length) {
    var last = addDays(OP.end, -1), days = rangeKeys(k > last ? last : k, last).filter(function (dk) { return !isIceland(dk); }); if (!days.length) days = [OP.end];
    var rnd = seededRandom(hash((Array.isArray(s.heroes.order) ? s.heroes.order.join(',') : '') + '|' + duelStart(s) + '|' + k));
    var sh = function (a) { for (var x = a.length - 1; x > 0; x--) { var y = Math.floor(rnd() * (x + 1)), t = a[x]; a[x] = a[y]; a[y] = t; } return a; };
    sh(rest); var per = Math.floor(rest.length / days.length), extra = rest.length - per * days.length, bonus = {}; sh(days.slice()).slice(0, extra).forEach(function (dk) { bonus[dk] = 1; });
    var sched = {}, at = 0; days.forEach(function (dk) { for (var c = per + (bonus[dk] ? 1 : 0); c > 0 && at < rest.length; c--) sched[rest[at++]] = dk; });
    while (at < rest.length) sched[rest[at++]] = days[days.length - 1];
    s.duels.op = { day: k, sched: sched, hard: missed };
  }
  s.op = { v: 1, at: k };
  return true;
}

var API = {
  STATE_VERSION: STATE_VERSION, TZ: TZ, FLOOR_MIN: FLOOR_MIN, STEP_CAP: STEP_CAP, TOO_FAST_KG: TOO_FAST_KG,
  num: num, clamp: clamp, r1: r1, r2: r2, uid: uid, cleanId: cleanId, clone: clone, hash: hash,
  dayKey: dayKey, londonTime: londonTime, isKey: isKey, addDays: addDays, diffDays: diffDays, weekday: weekday, mondayOf: mondayOf, rangeKeys: rangeKeys, fmtDate: fmtDate,
  defaultState: defaultState, normalize: normalize, migrate: migrate, restartSeason: restartSeason, emptyDay: emptyDay, getDay: getDay, normalizeDay: normalizeDay, seasonOver: seasonOver, notStarted: notStarted, lastSeasonDay: lastSeasonDay, seasonSummary: seasonSummary,
  DAY_TYPES: DAY_TYPES, ACTIVITY_TYPES: ACTIVITY_TYPES, dayType: dayType, patternType: patternType, liveType: liveType, isMidweekNight: isMidweekNight, calTarget: calTarget, dayRules: dayRules, freezeDays: freezeDays, snapshotTargets: snapshotTargets,
  dayTotals: dayTotals, mealTotals: mealTotals, gymSessions: gymSessions, footballMinutes: footballMinutes, activityKcal: activityKcal, tdeeFor: tdeeFor, deficit: deficit, plannedBurn: plannedBurn, plannedDeficit: plannedDeficit, DEFICIT_AMBER: DEFICIT_AMBER, energyBreakdown: energyBreakdown, macroStatus: macroStatus, fibreWarning: fibreWarning,
  EXERCISES: EXERCISES, matchExercise: matchExercise, avoidWarning: avoidWarning, exerciseByKey: exerciseByKey, e1rm: e1rm, strengthLog: strengthLog, seasonPRs: seasonPRs,
  QUESTS: QUESTS, CLEAR_XP: CLEAR_XP, CLEAR_GOLD: CLEAR_GOLD, questStatus: questStatus, isClear: isClear, firstLoggedDay: firstLoggedDay, penaltyFor: penaltyFor, streaks: streaks, streakBonus: streakBonus,
  BOSSES: BOSSES, bossFor: bossFor, bossesUpTo: bossesUpTo, TRIALS: TRIALS, advanceTrial: advanceTrial, trialsDone: trialsDone,
  weightSeries: weightSeries, bfSeries: bfSeries, latestWeight: latestWeight, weekAverage: weekAverage, weeklyAverages: weeklyAverages, trend: trend, estBf: estBf, currentBf: currentBf, latestMeas: latestMeas,
  bodyProfile: bodyProfile, currentBody: currentBody, goalBody: goalBody, startBody: startBody, hologramGeometry: hologramGeometry, journey: journey, maxKgLost: maxKgLost, photoDue: photoDue,
  MUSCLES: MUSCLES, muscleHeat: muscleHeat, muscleExercises: muscleExercises, STATS: STATS, statsFor: statsFor,
  LADDERS: LADDERS, ACHIEVEMENTS: ACHIEVEMENTS, metrics: metrics, newAchievements: newAchievements, ladderProgress: ladderProgress, recalcProgress: recalcProgress, kgMilestones: kgMilestones,
  xpThreshold: xpThreshold, levelFor: levelFor, RANKS: RANKS, rankFor: rankFor, ledger: ledger, player: player, canBuy: canBuy, titles: titles,
  LIMITS: LIMITS, extractJSON: extractJSON, checkItem: checkItem, coerceItem: coerceItem, parseReply: parseReply, defaultMeal: defaultMeal, commitItems: commitItems, undoCommit: undoCommit, removeEntry: removeEntry, restoreEntry: restoreEntry, savedMealItems: savedMealItems,
  SEED_SCAN: SEED_SCAN, SCAN_NUM: SCAN_NUM, SEG_KEYS: SEG_KEYS, SEG_NAMES: SEG_NAMES, SCAN_LIMITS: SCAN_LIMITS, SCAN_LABELS: SCAN_LABELS, coerceScan: coerceScan, normalizeScan: normalizeScan, checkScan: checkScan,
  latestScan: latestScan, prevScan: prevScan, scanDelta: scanDelta, scanDue: scanDue, addScan: addScan, undoScan: undoScan, removeScan: removeScan, parseScanReply: parseScanReply,
  healthNumber: healthNumber, normalizeImport: normalizeImport, parseImportQuery: parseImportQuery, scanRewards: scanRewards, baselineScan: baselineScan, bodyModel: bodyModel, leanMass: leanMass, bfMeasurements: bfMeasurements,
  MACRO_KEYS: MACRO_KEYS, macroObj: macroObj, checkMacros: checkMacros, normalizeLib: normalizeLib, portion: portion, defaultPortion: defaultPortion, canWeigh: canWeigh, gramsFromQty: gramsFromQty,
  recentFoods: recentFoods, rememberFood: rememberFood, findByCode: findByCode, mealAsItem: mealAsItem, normalizeRecipe: normalizeRecipe, recipeTotals: recipeTotals, recipeAsItem: recipeAsItem, quickAddItem: quickAddItem, searchLocal: searchLocal, knownFoods: knownFoods, builtinFoods: builtinFoods, searchBuiltin: searchBuiltin, foodWords: foodWords, parseQuick: parseQuick, FOOD_SOURCES: FOOD_SOURCES, parseFoodReply: parseFoodReply, hostOf: hostOf,
  PROGRAM: PROGRAM, ABS_MOVES: ABS_MOVES, PLAN_RULES: PLAN_RULES, SUPPS: SUPPS, stepsBase: stepsBase, stepsTarget: stepsTarget, stepsOwed: stepsOwed, stepsNotLogged: stepsNotLogged, isDeload: isDeload, nextDeload: nextDeload, weekOfPlan: weekOfPlan,
  programRange: programRange, sessionFor: sessionFor, lastSets: lastSets, setsOn: setsOn, liftSessions: liftSessions, exerciseTarget: exerciseTarget, sessionPlan: sessionPlan, absThisWeek: absThisWeek, rollingAvg: rollingAvg, liftsDropping: liftsDropping,
  planAdvice: planAdvice, reviewDue: reviewDue, reviewDate: reviewDate, nextReview: nextReview, applyAdjustment: applyAdjustment, checkpoints: checkpoints, planWeightOn: planWeightOn, planLine: planLine, planStatus: planStatus, avgWindow: avgWindow, underFloorNow: underFloorNow, floorBreach: floorBreach, leanMassAlert: leanMassAlert, weeklyBudget: weeklyBudget,
  syncDecision: syncDecision, dayHasData: dayHasData, loggedDays: loggedDays, stateSummary: stateSummary, HEROES: HEROES, HERO_KG: HERO_KG, heroMilestones: heroMilestones, THEMES: THEMES, LIGHT_THEMES: LIGHT_THEMES, cleanPhoto: cleanPhoto, AURA: AURA, auraInfo: auraInfo, auraOrder: auraOrder, auraToday: auraToday, auraDiscovered: auraDiscovered, auraPalette: auraPalette, seededRandom: seededRandom, HERO_DROP: HERO_DROP, HERO_WEEKS: HERO_WEEKS, validHeroOrder: validHeroOrder, shuffledHeroes: shuffledHeroes, heroInfo: heroInfo, lockHeroWeeks: lockHeroWeeks, recheckHeroWeek: recheckHeroWeek, heroStatus: heroStatus, DUELS: DUELS, DUEL_ART: DUEL_ART, DUEL_CUT: DUEL_CUT, DUEL_TASKS: DUEL_TASKS, DUEL_GYM_ONLY: DUEL_GYM_ONLY, DUEL_LINES: DUEL_LINES, duelStart: duelStart, duelPlan: duelPlan, duelInfo: duelInfo, duelDay: duelDay, duelStatus: duelStatus, duelsToday: duelsToday, defeatDuel: defeatDuel, undoDuel: undoDuel, duelSummary: duelSummary, duelTitles: duelTitles,
  createStore: createStore, STORE_KEY: STORE_KEY, exportState: exportState, importState: importState, noticeLines: noticeLines,
  OP: OP, GYM_LEVELS: GYM_LEVELS, FOOT_INT: FOOT_INT, OP_QUESTS: OP_QUESTS, OP_PROGRAM: OP_PROGRAM, OP_VERSES: OP_VERSES, hasOp: hasOp, inOp: inOp, isIceland: isIceland, opMode: opMode, opCap: opCap, opNoWeigh: opNoWeigh, opVerse: opVerse,
  isBannedFood: isBannedFood, opTreats: opTreats, bowlDone: bowlDone, inclineMinutes: inclineMinutes, gymKcal: gymKcal, footballKcal: footballKcal, inclineKcal: inclineKcal, weighNear: weighNear, opBoost: opBoost, opWalkNeed: opWalkNeed,
  opQuests: opQuests, opLine: opLine, opTracker: opTracker, opBank: opBank, opOver: opOver, opMissing: opMissing, opWeek: opWeek, opMuscle: opMuscle, opFinish: opFinish, confirmOpFinish: confirmOpFinish, ensureOp: ensureOp, duelOp: duelOp, heroOp: heroOp
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.RTL = API;
})(typeof window !== 'undefined' ? window : this);
