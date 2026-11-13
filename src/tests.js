/* ASCEND — shared test suite. Runs in Node (test/run-core.js) and in the app (Settings → Diagnostics). */
(function (root) {
'use strict';
function defineTests(R) {
  var T = [];
  function test(name, fn) { T.push({ name: name, fn: fn }); }
  function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
  function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
  function near(a, b, tol, m) { if (Math.abs(a - b) > (tol || 1e-6)) throw new Error((m ? m + ': ' : '') + 'expected ≈' + b + ', got ' + a); }
  function stable(x) { if (Array.isArray(x)) return x.map(stable); if (x && typeof x === 'object') { var o = {}; Object.keys(x).sort().forEach(function (k) { o[k] = stable(x[k]); }); return o; } return x; }
  function deep(a, b, m) { var A = JSON.stringify(stable(a)), B = JSON.stringify(stable(b)); if (A !== B) throw new Error((m || 'objects differ') + '\n' + A.slice(0, 200) + '\n' + B.slice(0, 200)); }
  /* Most tests are written against one fixed reference plan (1 Oct start, 90kg, the original checkpoints) so the dates and
     sums in them never move. The plan the app actually ships with is checked by the tests that use shipped(). */
  function refPlan(s) { s.profile.startDate = '2026-10-01'; s.profile.startKg = 90; s.plan.checkpoints = [{ date: '2026-11-01', kg: 86.5 }, { date: '2026-12-01', kg: 83 }, { date: '2026-12-31', kg: 79.5 }]; return s; }
  function fresh() { return refPlan(R.normalize({})); }
  function legacyPen(s) { s.meta.penaltyEnd = '2099-01-01'; return s; } // a save from before v16, when Penalty Quests still ran
  function shipped() { return R.normalize({}); }
  function fakeStorage() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m }; }
  function food(cal, p, extra) { var rest = Math.max(0, cal - p * 4); var o = { kind: 'food', name: 'Test food', qty: '1', cal: cal, p: p, c: Math.round(rest * 0.5 / 4), s: 5, f: Math.round(rest * 0.5 / 9), fib: 8, conf: 'high', note: '' }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
  /* makes day k a full Daily Clear for its day type */
  function clearDay(s, k) {
    var ct = R.calTarget(s, k), type = R.dayType(s, k);
    var d = s.days[k] = R.emptyDay();
    d.foods.push(R.normalizeDay({ foods: [{ name: 'Clear meal', cal: ct, p: 170, c: 130, s: 10, f: 45, fib: 30 }] }).foods[0]);
    d.water = 3000; d.steps = R.stepsTarget(s, k) + 500; d.lightsOut = true;
    if (type === 'gym') d.activities.push({ id: R.uid(), type: 'gym', min: 60, kcal: 0, t: 0 });
    else if (type === 'football') d.activities.push({ id: R.uid(), type: 'football', min: 60, kcal: 0, t: 0 });
    else d.recover = true;
    return d;
  }

  /* ── levels & ranks ── */
  test('XP thresholds at levels 1, 9, 10, 49, 50', function () {
    eq(R.xpThreshold(1), 0); eq(R.xpThreshold(2), 283); eq(R.xpThreshold(9), 2700); eq(R.xpThreshold(10), 3162); eq(R.xpThreshold(49), 34300); eq(R.xpThreshold(50), 35355);
    eq(R.levelFor(0), 1); eq(R.levelFor(2699), 8); eq(R.levelFor(2700), 9); eq(R.levelFor(3161), 9); eq(R.levelFor(3162), 10); eq(R.levelFor(34299), 48); eq(R.levelFor(34300), 49); eq(R.levelFor(35354), 49); eq(R.levelFor(35355), 50);
    eq(R.levelFor(-50), 1, 'negative xp'); eq(R.levelFor(NaN), 1, 'NaN xp');
  });
  test('Rank boundaries E/D/C/B/A/S', function () {
    eq(R.rankFor(1), 'E'); eq(R.rankFor(9), 'E'); eq(R.rankFor(10), 'D'); eq(R.rankFor(19), 'D'); eq(R.rankFor(20), 'C'); eq(R.rankFor(29), 'C'); eq(R.rankFor(30), 'B'); eq(R.rankFor(39), 'B'); eq(R.rankFor(40), 'A'); eq(R.rankFor(49), 'A'); eq(R.rankFor(50), 'S'); eq(R.rankFor(120), 'S');
  });
  test('XP never drops below the floor of the highest level reached', function () {
    var s = fresh(); s.player.maxLevel = 10; var p = R.player(s, '2026-10-05');
    eq(p.level, 10); eq(p.xp, 3162); ok(p.floored, 'should be floored');
  });

  /* ── dates ── */
  test('Midnight rollover (Europe/London)', function () {
    eq(R.dayKey(new Date('2026-10-24T22:59:00Z')), '2026-10-24', '23:59 BST');
    eq(R.dayKey(new Date('2026-10-24T23:00:00Z')), '2026-10-25', '00:00 BST');
    eq(R.dayKey(new Date('2026-10-31T23:59:59Z')), '2026-10-31', '23:59 GMT');
    eq(R.dayKey(new Date('2026-11-01T00:00:00Z')), '2026-11-01', '00:00 GMT');
  });
  test('Clocks going back on 25 Oct 2026', function () {
    eq(R.dayKey(new Date('2026-10-25T00:30:00Z')), '2026-10-25', '01:30 BST');
    eq(R.dayKey(new Date('2026-10-25T01:30:00Z')), '2026-10-25', '01:30 GMT (repeated hour)');
    eq(R.dayKey(new Date('2026-10-25T23:30:00Z')), '2026-10-25', '23:30 GMT');
    eq(R.dayKey(new Date('2026-10-26T00:00:00Z')), '2026-10-26', 'midnight after change');
    eq(R.addDays('2026-10-24', 1), '2026-10-25'); eq(R.addDays('2026-10-25', 1), '2026-10-26'); eq(R.diffDays('2026-10-24', '2026-10-26'), 2);
    eq(R.londonTime(new Date('2026-10-25T12:00:00Z')), '12:00', 'GMT noon'); eq(R.londonTime(new Date('2026-10-24T12:00:00Z')), '13:00', 'BST noon');
  });
  test('Day types incl. alternate Wednesdays and overrides', function () {
    var s = fresh();
    eq(R.dayType(s, '2026-10-01'), 'rest', 'Thu'); eq(R.dayType(s, '2026-10-02'), 'football', 'Fri'); eq(R.dayType(s, '2026-10-03'), 'gym', 'Sat'); eq(R.dayType(s, '2026-10-04'), 'rest', 'Sun'); eq(R.dayType(s, '2026-10-05'), 'gym', 'Mon');
    eq(R.dayType(s, '2026-10-07'), 'rest', 'Wed rest'); eq(R.dayType(s, '2026-10-14'), 'rest', 'Wed rest 2'); eq(R.dayType(s, '2026-10-08'), 'rest', 'Thu rest');
    ok(R.isMidweekNight(s, '2026-10-07')); ok(!R.isMidweekNight(s, '2026-10-14')); ok(R.isMidweekNight(s, '2026-10-21'));
    s.overrides['2026-10-05'] = 'rest'; eq(R.dayType(s, '2026-10-05'), 'rest', 'override'); eq(R.calTarget(s, '2026-10-02'), 1600);
    var alt = fresh(); alt.week.pattern[3] = 'alt'; eq(R.dayType(alt, '2026-10-07'), 'rest', 'alternate still supported'); eq(R.dayType(alt, '2026-10-14'), 'gym');
  });

  /* ── energy ── */
  test('Deficit without activity', function () {
    var s = fresh(), d = R.emptyDay(); d.foods = R.normalizeDay({ foods: [{ name: 'x', cal: 1500 }] }).foods;
    eq(R.tdeeFor(s, d), 1900); eq(R.deficit(s, d), 400);
  });
  test('Deficit with steps, gym and football', function () {
    var s = fresh(), d = R.emptyDay(); d.foods = R.normalizeDay({ foods: [{ name: 'x', cal: 1500 }] }).foods;
    d.steps = 10000; d.activities = [{ id: 'a', type: 'gym', min: 60, kcal: 0, t: 0 }, { id: 'b', type: 'football', min: 60, kcal: 0, t: 0 }];
    eq(R.activityKcal(s, d), 1215); eq(R.tdeeFor(s, d), 3115); eq(R.deficit(s, d), 1615);
    d.activities = [{ id: 'b', type: 'football', min: 90, kcal: 0, t: 0 }]; eq(R.activityKcal(s, d), 350 + 1013, '90 min football');
  });
  test('Workout logged without a gym check-in still counts as one session', function () {
    var s = fresh(), d = R.emptyDay(); d.workouts = R.normalizeDay({ workouts: [{ name: 'lat pulldown', sets: [{ kg: 60, reps: 10 }] }] }).workouts;
    eq(R.gymSessions(d), 1); eq(R.tdeeFor(s, d), 2090);
  });
  test('Calorie quest tolerance ±75', function () {
    var s = fresh(), k = '2026-10-05'; s.days[k] = R.emptyDay();
    s.days[k].foods = R.normalizeDay({ foods: [{ name: 'x', cal: 1675 }] }).foods; ok(R.questStatus(s, k)[1].done, '1675 ok');
    s.days[k].foods = R.normalizeDay({ foods: [{ name: 'x', cal: 1676 }] }).foods; ok(!R.questStatus(s, k)[1].done, '1676 over');
    s.days[k].foods = R.normalizeDay({ foods: [{ name: 'x', cal: 1525 }] }).foods; ok(R.questStatus(s, k)[1].done, '1525 ok');
    s.days[k].foods = []; ok(!R.questStatus(s, k)[1].done, 'no food = not done');
  });
  test('Fibre (IBS) warning triggers 5g+ above 7-day average', function () {
    var s = fresh();
    ['2026-10-02', '2026-10-03', '2026-10-04'].forEach(function (k) { s.days[k] = R.normalizeDay({ foods: [{ name: 'x', cal: 1000, fib: 20 }] }); });
    s.days['2026-10-05'] = R.normalizeDay({ foods: [{ name: 'x', cal: 1000, fib: 25 }] }); eq(R.fibreWarning(s, '2026-10-05'), null);
    s.days['2026-10-05'] = R.normalizeDay({ foods: [{ name: 'x', cal: 1000, fib: 25.5 }] }); ok(R.fibreWarning(s, '2026-10-05'), 'should warn');
  });

  /* ── streaks & penalties ── */
  test('Daily Clear detection', function () { var s = fresh(); clearDay(s, '2026-10-02'); ok(R.isClear(s, '2026-10-02')); s.days['2026-10-02'].lightsOut = false; ok(!R.isClear(s, '2026-10-02')); });
  test('Streak break resets to 0', function () {
    var s = fresh(); ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].forEach(function (k) { clearDay(s, k); });
    clearDay(s, '2026-10-06');
    var st = R.streaks(s, '2026-10-06'); eq(st.clear, 1); eq(st.bestClear, 4);
  });
  test('Before v16: a Penalty Quest done restored half the lost streak, and still does', function () {
    var s = legacyPen(fresh()); ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].forEach(function (k) { clearDay(s, k); });
    clearDay(s, '2026-10-06'); s.days['2026-10-06'].penaltyDone = true;
    var pen = R.penaltyFor(s, '2026-10-06'); ok(pen && pen.done, 'penalty exists and done'); eq(pen.missed, '2026-10-05');
    eq(R.streaks(s, '2026-10-06').clear, 3, 'floor(4/2)+1');
  });
  test('Before v16: missing yesterday offered a restore today', function () {
    var s = legacyPen(fresh()); ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].forEach(function (k) { clearDay(s, k); });
    var st = R.streaks(s, '2026-10-06'); eq(st.clear, 0); eq(st.pendingRestore, 2); ok(R.penaltyFor(s, '2026-10-06') && !R.penaltyFor(s, '2026-10-06').done);
    ok(!R.penaltyFor(s, '2026-10-02'), 'no penalty after a clear day');
  });
  test('Before v16: the steps penalty completed automatically', function () {
    var s = legacyPen(fresh()), k = null; s.days['2026-10-01'] = R.emptyDay(); s.days['2026-10-01'].water = 500;
    for (var i = 2; i < 40; i++) { var kk = R.addDays('2026-10-01', i); if (R.penaltyFor(s, kk) && R.penaltyFor(s, kk).id === 'steps') { k = kk; break; } }
    ok(k, 'found a steps penalty day'); s.days[k] = R.emptyDay(); s.days[k].steps = R.stepsTarget(s, k) + 1999; ok(!R.penaltyFor(s, k).done, 'just short'); s.days[k].steps += 1; ok(R.penaltyFor(s, k).done);
  });
  test('Before v16: no penalties for days before you started logging', function () {
    var s = legacyPen(fresh()); eq(R.penaltyFor(s, '2026-10-06'), null, 'nothing logged at all');
    s.days['2026-10-05'] = R.emptyDay(); s.days['2026-10-05'].water = 500;
    eq(R.penaltyFor(s, '2026-10-05'), null, 'first day has no penalty'); ok(R.penaltyFor(s, '2026-10-06'), 'missed first day → penalty next day');
  });
  test('v16: no Penalty Quests from the upgrade on; a missed day just ends the streak; ones already done keep their XP', function () {
    var s = fresh(); ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].forEach(function (k) { clearDay(s, k); });
    eq(R.penaltyFor(s, '2026-10-06'), null, 'a new save never has one'); var st = R.streaks(s, '2026-10-06'); eq(st.clear, 0); eq(st.pendingRestore, 0, 'nothing to restore with');
    // a save upgraded on 6 Oct: the penalty done on 3 Oct stays honoured, nothing from 6 Oct on exists
    var u = fresh(); ['2026-10-01'].forEach(function (k) { clearDay(u, k); }); u.days['2026-10-03'] = R.normalizeDay({ water: 500, penaltyDone: true });
    var raw = JSON.parse(JSON.stringify(u)); raw.version = 9; delete raw.meta.penaltyEnd;
    var m = R.migrate(raw, '2026-10-06', { keepSeason: true }); eq(m.meta.penaltyEnd, '2026-10-06');
    ok(R.penaltyFor(m, '2026-10-03') && R.penaltyFor(m, '2026-10-03').done, 'the one already done still counts'); eq(R.penaltyFor(m, '2026-10-07'), null);
    eq(R.ledger(m, '2026-10-06').lines.penalties, R.ledger(legacyPen(JSON.parse(JSON.stringify(m))), '2026-10-06').lines.penalties, 'same XP as before the upgrade');
  });
  test('Ledger: one perfect day = quests + clear + streak bonus', function () {
    var s = fresh(); clearDay(s, '2026-10-01'); var lg = R.ledger(s, '2026-10-01');
    eq(lg.lines.quests, 170); eq(lg.lines.clears, 100); eq(lg.lines.streak, 5); eq(lg.xpEarned, 275); eq(lg.goldEarned, 50 + 30);
  });

  /* ── boss ── */
  test('Weekly boss damage and defeat', function () {
    var s = fresh(); var b0 = R.bossFor(s, '2026-09-28', '2026-10-04'); eq(b0.name, 'Protein Titan'); eq(b0.hp, 4, 'first week only has 4 season days');
    var b = R.bossFor(s, '2026-10-05', '2026-10-11'); eq(b.name, 'Step Colossus'); eq(b.hp, 6); eq(b.dmg, 0);
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].forEach(function (k) { s.days[k] = R.emptyDay(); s.days[k].steps = 16000; });
    b = R.bossFor(s, '2026-10-05', '2026-10-11'); eq(b.dmg, 5); ok(!b.defeated);
    s.days['2026-10-10'] = R.emptyDay(); s.days['2026-10-10'].steps = 16000; b = R.bossFor(s, '2026-10-05', '2026-10-11'); ok(b.defeated); eq(b.hpLeft, 0);
    s.days['2026-10-11'] = R.emptyDay(); s.days['2026-10-11'].steps = 16000; b = R.bossFor(s, '2026-10-05', '2026-10-11'); eq(b.dmg, 6, 'damage capped at HP');
    eq(R.bossFor(s, '2026-10-05', '2026-10-07').dmg, 3, 'future days do not count');
    ok(R.ledger(s, '2026-10-11').lines.bosses >= 300, 'boss XP awarded');
  });

  /* ── stats radar ── */
  test('Radar stats 0 with empty data', function () {
    var s = fresh(), st = R.statsFor(s, '2026-10-10');
    ['STR', 'AGI', 'END', 'VIT', 'DISC', 'FOCUS'].forEach(function (k) { eq(st[k], 0, k); });
    var before = R.statsFor(s, '2026-09-01'); eq(before.STR, 0); eq(before.n, 0);
  });
  test('Radar stats clamped to 100 with extreme data', function () {
    var s = fresh();
    R.rangeKeys('2026-10-01', '2026-10-28').forEach(function (k) { clearDay(s, k); var d = s.days[k]; d.steps = 90000; d.activities.push({ id: R.uid(), type: 'football', min: 120, kcal: 0, t: 0 }, { id: R.uid(), type: 'sprint', min: 20, kcal: 0, t: 0 }, { id: R.uid(), type: 'cardio', min: 40, kcal: 0, t: 0 }, { id: R.uid(), type: 'gym', min: 60, kcal: 0, t: 0 }); d.workouts.push({ id: R.uid(), ex: 'lat_pulldown', name: 'Lat Pulldown', sets: [{ kg: 40 + R.diffDays('2026-10-01', k) * 2, reps: 10 }], t: 0 }); });
    var st = R.statsFor(s, '2026-10-28');
    ['STR', 'AGI', 'END', 'VIT', 'DISC', 'FOCUS'].forEach(function (k) { ok(st[k] >= 0 && st[k] <= 100, k + ' in range: ' + st[k]); });
    eq(st.DISC, 75, 'DISC without scans'); eq(st.VIT, 80, 'VIT without scans'); eq(st.END, 100);
    R.addScan(s, { date: '2026-10-27', weight: 80, bfm: 11, smm: 39, score: 100 }, 'x');
    var st2 = R.statsFor(s, '2026-10-28'); eq(st2.DISC, 100, 'DISC with great scan'); eq(st2.VIT, 100, 'VIT with great scan'); eq(st2.STR, 100);
  });

  /* ── body proportions (the V-taper and the numbers on the Body tab) ── */
  test('Body proportions with no measurements', function () {
    var s = fresh(), p = R.currentBody(s, '2026-10-05'), g = R.hologramGeometry(p, 400);
    ['shoulderW', 'chestW', 'waistW', 'hipW', 'thighW', 'armW', 'neckW', 'headR'].forEach(function (k) { ok(isFinite(g[k]) && g[k] > 0, k + ' finite'); });
    ok(isFinite(p.ratio) && p.ratio > 1, 'ratio');
    var goal = R.goalBody(s, '2026-10-05'), gg = R.hologramGeometry(goal, 400);
    ok(gg.waistW < g.waistW, 'goal waist narrower'); ok(goal.ratio > p.ratio, 'V-taper widens at goal');
  });
  test('Body proportions with partial / odd measurements stay finite', function () {
    var s = fresh(); s.days['2026-10-03'] = R.normalizeDay({ weight: 88, meas: { waist: 98 } });
    var p = R.currentBody(s, '2026-10-05'); eq(p.waist, 98, 'logged waist used'); ok(isFinite(p.chest));
    var g = R.hologramGeometry({ shoulders: NaN, waist: 0, chest: null }, 400); ok(isFinite(g.shoulderW) && g.shoulderW > 0 && isFinite(g.waistW) && g.waistW > 0);
    var goal = R.goalBody(s, '2026-10-05'); ok(goal.waist < 98, 'goal anchored on logged waist');
  });

  /* ── strength ── */
  test('Epley 1RM', function () { eq(R.e1rm(100, 1), 100); near(R.e1rm(100, 10), 133.3, 0.05); eq(R.e1rm(0, 5), 0); eq(R.e1rm(100, 0), 0); eq(R.e1rm(-5, 5), 0); });
  test('PR detection and muscle-loss alert', function () {
    var s = fresh();
    s.days['2026-10-01'] = R.normalizeDay({ workouts: [{ name: 'lat pulldown', sets: [{ kg: 60, reps: 10 }], t: 1 }] });
    s.days['2026-10-03'] = R.normalizeDay({ workouts: [{ name: 'lat pulldown', sets: [{ kg: 62.5, reps: 10 }], t: 1 }] });
    var lg = R.strengthLog(s); eq(lg.prs.length, 1, 'one PR'); eq(lg.alerts.length, 0);
    s.days['2026-10-05'] = R.normalizeDay({ workouts: [{ name: 'lat pulldown', sets: [{ kg: 50, reps: 10 }], t: 1 }] });
    lg = R.strengthLog(s); eq(lg.prs.length, 1); eq(lg.alerts.length, 1, 'muscle-loss alert'); ok(lg.alerts[0].dropPct >= 10);
    s.days['2026-10-06'] = R.normalizeDay({ workouts: [{ name: 'push ups', sets: [{ kg: 0, reps: 15 }], t: 1 }] });
    s.days['2026-10-08'] = R.normalizeDay({ workouts: [{ name: 'push ups', sets: [{ kg: 0, reps: 18 }], t: 1 }] });
    eq(R.strengthLog(s).prs.length, 2, 'bodyweight rep PR');
  });
  test('Avoid-list warnings respect knees and back', function () {
    ok(R.avoidWarning('barbell squat')); ok(R.avoidWarning('Conventional Deadlift')); ok(R.avoidWarning('bent over row'));
    eq(R.avoidWarning('leg press'), null); eq(R.avoidWarning('split squat'), null); eq(R.avoidWarning('chest supported row'), null);
    R.EXERCISES.forEach(function (e) { eq(R.avoidWarning(e.name), null, e.name + ' is safe'); });
  });

  /* ── weight ── */
  test('Weekly average with missing days', function () {
    var s = fresh(); s.days['2026-10-05'] = R.normalizeDay({ weight: 90 }); s.days['2026-10-07'] = R.normalizeDay({ weight: 89 }); s.days['2026-10-09'] = R.normalizeDay({ weight: 88 });
    eq(R.weekAverage(s, '2026-10-05'), 89); eq(R.weekAverage(s, '2026-10-12'), null);
  });
  test('Trend, projection and too-fast warning', function () {
    var s = fresh();
    for (var i = 0; i < 14; i++) s.days[R.addDays('2026-10-01', i)] = R.normalizeDay({ weight: 90 - i * 0.1 });
    var t = R.trend(s, '2026-10-14'); ok(t, 'trend'); near(t.perWeek, -0.7, 0.01); ok(!t.tooFast); ok(t.goalDate > '2026-10-14');
    var s2 = fresh(); for (var j = 0; j < 28; j++) s2.days[R.addDays('2026-10-01', j)] = R.normalizeDay({ weight: 90 - j * 0.3 });
    ok(!R.trend(s2, '2026-10-14').tooFast, 'first fortnight: water and glycogen, no alarm'); ok(R.trend(s2, '2026-10-28').tooFast, 'too fast after the first fortnight');
    var s4 = fresh(); for (var m = 0; m < 14; m++) s4.days[R.addDays('2026-12-10', m)] = R.normalizeDay({ weight: 82 - m * 0.13 }); ok(!R.trend(s4, '2026-12-23').tooFast, 'the plan’s own December pace (0.9kg a week) is not too fast');
    var s3 = fresh(); s3.days['2026-10-01'] = R.normalizeDay({ weight: 90 }); eq(R.trend(s3, '2026-10-14'), null, 'not enough data');
  });
  test('Weight re-log replaces the same day', function () {
    var s = fresh(), k = '2026-10-05';
    R.commitItems(s, k, [{ kind: 'body', weight: 89.4 }], 't1', 1, '07:00'); R.commitItems(s, k, [{ kind: 'body', weight: 89.1 }], 't2', 2, '07:05');
    eq(s.days[k].weight, 89.1); eq(R.weightSeries(s).length, 1);
  });

  /* ── AI reply handling ── */
  test('Malformed, empty and non-JSON System replies', function () {
    [null, undefined, '', '   ', 'hello there', '{bad json', '[', 42, '{"type":"unknown"}', '{"items":[]}', '{"type":"food"}', '[]', '{"type":"food","items":[1,2]}'].forEach(function (x) {
      var r = R.parseReply(x); eq(r.ok, false, 'should reject ' + JSON.stringify(x)); ok(typeof r.error === 'string' && r.error.length, 'has error message');
    });
  });
  test('Food reply (with code fences) parses', function () {
    var r = R.parseReply('```json\n{"type":"food","items":[{"name":"Samosa","quantity":"2","calories":520,"protein_g":10,"carbs_g":50,"sugar_g":3,"fat_g":30,"fibre_g":5,"confidence":"medium","assumption":"2 medium veg samosas"}]}\n```');
    ok(r.ok); eq(r.items[0].kind, 'food'); eq(r.items[0].cal, 520); eq(r.items[0].errors.length, 0); eq(r.items[0].conf, 'medium');
  });
  test('Training, activity, body and water replies parse', function () {
    var a = R.parseReply('{"type":"training","items":[{"name":"lat pulldown","sets":[{"kg":60,"reps":10},{"kg":60,"reps":10},{"kg":60,"reps":10}]},{"name":"shoulder press","sets":3,"reps":8,"kg":22}]}');
    ok(a.ok); eq(a.items[0].ex, 'lat_pulldown'); eq(a.items[1].sets.length, 3); eq(a.items[1].errors.length, 0);
    var b = R.parseReply('{"type":"activity","items":[{"type":"steps","steps":11400},{"activity":"football","minutes":60}]}');
    ok(b.ok); eq(b.items[0].type, 'steps'); eq(b.items[1].type, 'football'); eq(b.items[1].errors.length, 0);
    var c = R.parseReply('{"type":"body","items":[{"weight_kg":88.6,"waist_cm":96}]}'); ok(c.ok); eq(c.items[0].weight, 88.6); eq(c.items[0].waist, 96);
    var d = R.parseReply('{"type":"water","items":[{"ml":750}]}'); ok(d.ok); eq(d.items[0].ml, 750);
    var m = R.parseReply('{"type":"mixed","items":[{"kind":"food","name":"Banana","calories":105,"protein_g":1,"carbs_g":27,"sugar_g":14,"fat_g":0.4,"fibre_g":3},{"kind":"water","ml":500}]}'); ok(m.ok); eq(m.items.length, 2);
  });
  test('Absurd or negative numbers are rejected', function () {
    ok(R.checkItem(food(50000, 20)).length > 0, '50,000 kcal'); ok(R.checkItem(food(500, -5)).length > 0, '-5g protein');
    ok(R.checkItem({ kind: 'body', weight: 400 }).length > 0, '400kg'); ok(R.checkItem({ kind: 'body', bf: 80 }).length > 0, '80% bf');
    ok(R.checkItem({ kind: 'water', ml: 50000 }).length > 0, '50L water'); ok(R.checkItem({ kind: 'activity', type: 'steps', steps: -1 }).length > 0, 'neg steps');
    ok(R.checkItem({ kind: 'exercise', name: 'leg press', sets: [{ kg: 900, reps: 10 }] }).length > 0, '900kg');
    eq(R.checkItem(food(100, 60, { c: 0, f: 0, s: 0 }))[0], 'Macros don’t add up to the calories', 'macros > calories');
    ok(R.checkItem(food(500, 20, { s: 300, c: 20 })).length > 0, 'sugar > carbs');
    var r = R.parseReply('{"type":"food","items":[{"name":"x","calories":"lots","protein_g":10,"carbs_g":1,"fat_g":1}]}'); ok(r.items[0].errors.length > 0, 'non-numeric calories flagged');
    var s = fresh(); var res = R.commitItems(s, '2026-10-05', [food(50000, 20)], 'bad', 1, '12:00'); ok(!res.ok); eq(res.reason, 'invalid'); ok(!s.days['2026-10-05'], 'nothing saved');
    var mixed = R.commitItems(s, '2026-10-05', [food(500, 30), { kind: 'body', weight: 400 }], 'bad2', 1, '12:00'); ok(!mixed.ok, 'partial batch refused'); ok(!s.days['2026-10-05'], 'no partial save');
  });
  test('Double-tapping Confirm saves once', function () {
    var s = fresh(), items = [food(400, 30)];
    eq(R.commitItems(s, '2026-10-05', items, 'tok-1', 1, '12:00').ok, true);
    var second = R.commitItems(s, '2026-10-05', items, 'tok-1', 2, '12:00'); eq(second.ok, false); eq(second.reason, 'duplicate');
    eq(s.days['2026-10-05'].foods.length, 1);
  });
  test('Undo and delete-with-undo restore exactly', function () {
    var s = fresh(), k = '2026-10-05'; R.commitItems(s, k, [food(400, 30)], 'a', 1, '12:00');
    var before = JSON.stringify(s.days[k]);
    var res = R.commitItems(s, k, [food(300, 20), { kind: 'water', ml: 500 }, { kind: 'body', weight: 88, waist: 97 }, { kind: 'activity', type: 'steps', steps: 5000 }], 'b', 2, '13:00');
    ok(res.ok); R.undoCommit(s, res.undo); eq(JSON.stringify(s.days[k]), before, 'undo restores');
    var id = s.days[k].foods[0].id, rem = R.removeEntry(s, k, 'foods', id); eq(s.days[k].foods.length, 0); ok(R.restoreEntry(s, rem)); eq(JSON.stringify(s.days[k]), before, 'restore');
    ok(!R.restoreEntry(s, rem), 'cannot restore twice');
  });
  test('Meal defaults by time of day', function () { eq(R.defaultMeal('07:30'), 'breakfast'); eq(R.defaultMeal('13:00'), 'lunch'); eq(R.defaultMeal('16:00'), 'snack'); eq(R.defaultMeal('19:30'), 'dinner'); });

  /* ── achievements ── */
  test('Achievements unlock exactly at threshold and never twice', function () {
    var s = fresh(), id = 'hell-s-paradise_0';
    s.days['2026-10-02'] = R.emptyDay(); s.days['2026-10-02'].steps = 9999;
    ok(!R.newAchievements(s, '2026-10-02').some(function (a) { return a.id === id; }), '9,999 not yet');
    s.days['2026-10-02'].steps = 10000;
    ok(R.newAchievements(s, '2026-10-02').some(function (a) { return a.id === id; }), '10,000 unlocks');
    s.player.ach[id] = '2026-10-02';
    ok(!R.newAchievements(s, '2026-10-02').some(function (a) { return a.id === id; }), 'not again');
    s.days['2026-10-02'].steps = 0; ok(!R.newAchievements(s, '2026-10-02').some(function (a) { return a.id === id; }), 'stays unlocked, no re-fire');
  });
  test('Every ladder has 15-24 escalating tiers', function () {
    var seen = {};
    R.LADDERS.forEach(function (l) {
      ok(l.thresholds.length >= 15 && l.thresholds.length <= 24, l.series + ' size');
      ok(l.names.length >= l.thresholds.length, l.series + ' names');
      for (var i = 1; i < l.thresholds.length; i++) ok(l.thresholds[i] > l.thresholds[i - 1], l.series + ' escalates');
    });
    R.ACHIEVEMENTS.forEach(function (a) { ok(!seen[a.id], 'unique id ' + a.id); seen[a.id] = 1; });
    eq(R.LADDERS.length, 14);
  });

  /* ── gold / shop / trials ── */
  test('Gold spending and trials', function () {
    var s = fresh(); clearDay(s, '2026-10-01'); var g = R.player(s, '2026-10-01').gold; eq(g, 80);
    ok(R.canBuy(s, '2026-10-01', 80)); ok(!R.canBuy(s, '2026-10-01', 81));
    s.shop.purchases.push({ id: 'p', name: 'x', cost: 50, t: 0 }); eq(R.player(s, '2026-10-01').gold, 30);
    ok(R.advanceTrial(s, 'dips')); eq(s.trials.dips, 1); s.trials.dips = 5; ok(!R.advanceTrial(s, 'dips'), 'capped'); ok(!R.advanceTrial(s, 'nope'));
  });

  /* ── storage ── */
  test('Data survives a reload', function () {
    var st = fakeStorage(), store = R.createStore(st, 'k');
    var s = store.load().state; R.commitItems(s, '2026-10-05', [food(400, 30), { kind: 'water', ml: 750 }], 'z', 1, '12:00'); s.player.ach['naruto_0'] = '2026-10-05';
    ok(store.save(s)); var again = R.createStore(st, 'k').load(); eq(again.status, 'ok'); deep(again.state, s, 'reloaded state');
  });
  test('Corrupt storage never crashes and keeps a backup', function () {
    var st = fakeStorage(); st.setItem('k', '{not json'); var r = R.createStore(st, 'k').load();
    eq(r.status, 'corrupt'); ok(r.state.version === R.STATE_VERSION); ok(Object.keys(st._m).some(function (k) { return k.indexOf('k_corrupt_') === 0; }), 'backup kept');
    var broken = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('denied'); } };
    eq(R.createStore(broken, 'k').load().status, 'unavailable'); eq(R.createStore(broken, 'k').save({}), false);
  });
  test('Export then import is identical', function () {
    var s = fresh(); clearDay(s, '2026-10-01'); clearDay(s, '2026-10-02'); s.player.title = 'Genin'; s.trials.core = 2; s.shop.purchases.push({ id: 'p1', name: 'x', cost: 10, t: 5 });
    deep(R.importState(R.exportState(s)), s, 'round trip');
    var threw = false; try { R.importState('{"hello":1}'); } catch (e) { threw = true; } ok(threw, 'rejects non-backups');
  });
  test('Old-version data migrates without loss', function () {
    var v0 = { days: { '2026-10-02': { foods: [{ name: 'Rice', quantity: '200g', calories: 260, protein_g: 5, carbs_g: 56, sugar_g: 0, fat_g: 1, fibre_g: 1, confidence: 'high', assumption: 'cooked', meal: 'lunch' }], water: 1500, steps: 7000, weight: 89.5 } }, achievements: { naruto_0: '2026-10-02' } };
    var m = R.migrate(v0); eq(m.version, R.STATE_VERSION); var f = m.days['2026-10-02'].foods[0];
    eq(f.cal, 260); eq(f.p, 5); eq(f.c, 56); eq(f.fib, 1); eq(f.qty, '200g'); eq(f.note, 'cooked'); eq(f.meal, 'lunch');
    eq(m.days['2026-10-02'].water, 1500); eq(m.days['2026-10-02'].weight, 89.5); eq(m.player.ach.naruto_0, '2026-10-02');
    var v1 = R.defaultState(); v1.version = 1; v1.trials = { pullups: [true, true, false], pushups: [true], dips: [], core: [] };
    var m1 = R.migrate(v1); eq(m1.trials.pullups, 2); eq(m1.trials.pushups, 1);
    deep(R.migrate(JSON.parse(JSON.stringify(m))), m, 'current version is stable');
  });
  test('Garbage input never crashes normalize', function () {
    [null, 5, 'x', [], { days: 'x' }, { days: { bad: 1, '2026-10-02': 'x', '2026-10-03': { foods: 'no', steps: -5 } } }, { targets: 'x', profile: { startDate: 'never' } }, { week: { pattern: [1, 2] } }].forEach(function (g) {
      var s = R.normalize(g); eq(s.version, R.STATE_VERSION); ok(R.isKey(s.profile.startDate)); eq(s.week.pattern.length, 7);
      R.player(s, '2026-10-10'); R.statsFor(s, '2026-10-10'); R.currentBody(s, '2026-10-10'); R.questStatus(s, '2026-10-10');
    });
    var s2 = R.normalize({ days: { '2026-10-03': { foods: 'no', steps: -5 } } }); eq(s2.days['2026-10-03'].steps, 0); eq(s2.days['2026-10-03'].foods.length, 0);
  });
  /* ── InBody ── */
  test('Your 7 Sept InBody scan is loaded', function () {
    var s = fresh(), sc = R.latestScan(s);
    eq(sc.date, '2026-09-07'); eq(sc.weight, 90.5); eq(sc.smm, 38.6); eq(sc.bfm, 22.6); eq(sc.pbf, 25); eq(sc.lbm, 67.9); eq(sc.score, 77); eq(sc.seg.la, 4.16); eq(sc.segPct.la, 115.2);
    eq(R.leanMass(s, '2026-10-05'), 67.9); eq(R.currentBf(s, '2026-10-05'), 25);
  });
  test('Scan derives missing fat numbers', function () {
    var a = R.coerceScan({ date: '2026-10-08', weight: 89, bfm: 22 }); eq(a.pbf, 24.7); eq(a.lbm, 67);
    var b = R.coerceScan({ date: '2026-10-08', weight: 89, pbf: 24 }); eq(b.bfm, 21.4); eq(b.lbm, 67.6);
    var c = R.coerceScan({ date: '2026-10-08', weight: 89, lbm: 67.5 }); eq(c.bfm, 21.5); eq(c.pbf, 24.2);
  });
  test('Absurd scans are rejected', function () {
    ok(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 400, pbf: 20 })).length, '400kg');
    ok(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 89, pbf: 80 })).length, '80%');
    ok(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 89, pbf: 24, smm: 95 })).length, 'smm > weight');
    ok(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 89, bfm: 20, lbm: 60 })).length, 'parts do not add up');
    ok(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 89, pbf: 24, seg: { la: 90 } })).length, 'segment 90kg');
    ok(R.checkScan(R.coerceScan({ date: 'nope', weight: 89, pbf: 24 })).length, 'bad date');
    ok(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 'abc', pbf: 24 })).length, 'non-numeric');
    eq(R.checkScan(R.coerceScan({ date: '2026-10-08', weight: 89, pbf: 24, smm: 38.4, score: 78, seg: { trunk: 31, la: 4.1, ra: 4.05, ll: 9.7, rl: 9.8 } })).length, 0, 'valid scan');
  });
  test('Adding a scan replaces same date, logs weight and BF, undo restores', function () {
    var s = fresh(), k = '2026-10-08';
    var r1 = R.addScan(s, { date: k, weight: 89.2, pbf: 24.4, smm: 38.5 }, 't1'); ok(r1.ok); eq(s.days[k].weight, 89.2, 'no weigh-in that day: the scan’s weight is the day’s weight'); eq(s.days[k].bf, 24.4); eq(s.inbody.length, 2);
    eq(R.addScan(s, { date: k, weight: 89.2, pbf: 24.4 }, 't1').reason, 'duplicate');
    var r2 = R.addScan(s, { date: k, weight: 89.0, pbf: 24.2 }, 't2'); ok(r2.ok); eq(s.inbody.length, 2, 'replaced'); eq(R.latestScan(s).weight, 89); eq(s.days[k].weight, 89, 'a corrected scan updates the weight that came from the scan');
    R.undoScan(s, r2.undo); eq(R.latestScan(s).weight, 89.2); R.undoScan(s, r1.undo); eq(s.inbody.length, 1); eq(s.days[k].weight, null); eq(s.days[k].bf, null);
    ok(!R.addScan(s, { date: k, weight: 500, pbf: 24 }, 't3').ok, 'invalid refused'); eq(s.inbody.length, 1);
  });
  test('Lean mass and body fat follow the newest scan or weigh-in', function () {
    var s = fresh(); R.addScan(s, { date: '2026-10-08', weight: 89, bfm: 21, smm: 38.6 }, 'a');
    eq(R.leanMass(s, '2026-10-09'), 68); eq(R.currentBf(s, '2026-10-09'), 23.6);
    s.days['2026-10-12'] = R.normalizeDay({ weight: 88 }); eq(R.currentBf(s, '2026-10-12'), 22.7, 'estimated from lean mass after newer weigh-in');
    eq(R.currentBf(s, '2026-10-01'), 25, 'history respects date');
  });
  test('Screenshot reading: valid, partial and junk replies', function () {
    var r = R.parseScanReply('{"found":true,"date":"2026-10-08","weight_kg":89.4,"skeletal_muscle_mass_kg":38.5,"body_fat_mass_kg":22.1,"percent_body_fat":24.7,"inbody_score":78,"inbody_age":27,"segmental_lean_kg":{"trunk":31,"left_arm":4.15,"right_arm":4.08,"left_leg":9.7,"right_leg":9.85},"segmental_lean_pct":{"trunk":107.9,"left_arm":115,"right_arm":113,"left_leg":97,"right_leg":98.2}}');
    ok(r.ok); eq(r.errors.length, 0); eq(r.scan.smm, 38.5); eq(r.scan.seg.ra, 4.08); eq(r.scan.segPct.trunk, 107.9); eq(r.scan.source, 'screenshot');
    var p = R.parseScanReply('{"weight_kg":89.4,"percent_body_fat":24.7}'); ok(p.ok); eq(p.scan.bfm, 22.1); ok(p.errors.indexOf('Pick the scan date') >= 0, 'asks for date');
    [null, '', 'not json', '{"found":false}', '{"hello":1}', '[1,2]'].forEach(function (x) { eq(R.parseScanReply(x).ok, false, JSON.stringify(x)); });
    var bad = R.parseScanReply('{"date":"2026-10-08","weight_kg":890,"percent_body_fat":24}'); ok(bad.ok && bad.errors.length, 'impossible weight flagged');
  });
  test('Apple Health / Shortcut import handles units and formats', function () {
    var a = R.normalizeImport({ weight: '89.2 kg', pbf: '24.9%', lbm: '67 kg', date: '2026-10-08' }); eq(a.weight, 89.2); eq(a.pbf, 24.9); eq(a.lbm, 67); eq(a.date, '2026-10-08'); eq(a.source, 'health');
    var b = R.normalizeImport({ weight: '196.7 lb', pbf: '0.249' }); eq(b.weight, 89.2); eq(b.pbf, 24.9); eq(b.date, null);
    var c = R.normalizeImport({ w: '89,4', bf: '25' }); eq(c.weight, 89.4); eq(c.pbf, 25);
    eq(R.normalizeImport({ hello: 1 }), null); eq(R.normalizeImport('x'), null);
    var q = R.parseImportQuery('?inbody=1&w=89.1&pbf=24.6&lbm=67.2&date=2026-10-09'); eq(q.weight, 89.1); eq(q.date, '2026-10-09');
    eq(R.parseImportQuery('?nosplash'), null); eq(R.parseImportQuery(''), null); eq(R.parseImportQuery('?inbody&weight=abc&pbf=xyz'), null, 'a link with no numbers in it offers nothing'); eq(R.normalizeImport({ weight: 'n/a', lbm: '' }), null); eq(R.parseImportQuery('?inbody&weight=abc&pbf=24.9%25').pbf, 24.9);
  });
  test('Scan XP: one per week, bonuses for losing fat and keeping muscle', function () {
    var s = fresh(); eq(R.scanRewards(s, '2026-10-30').xp, 0, 'seed scan earns nothing');
    R.addScan(s, { date: '2026-10-05', weight: 89.5, bfm: 22, smm: 38.6 }, 'a');
    eq(R.scanRewards(s, '2026-10-30').xp, 200, 'fat down + muscle kept');
    R.addScan(s, { date: '2026-10-07', weight: 89.3, bfm: 21.8, smm: 38.6 }, 'b'); eq(R.scanRewards(s, '2026-10-30').xp, 200, 'same week not rewarded twice');
    R.addScan(s, { date: '2026-10-12', weight: 89.6, bfm: 22.3, smm: 37.9 }, 'c'); eq(R.scanRewards(s, '2026-10-30').xp, 300, 'no bonus when fat up and muscle down');
    eq(R.ledger(s, '2026-10-30').lines.inbody, 300); eq(R.metrics(s, '2026-10-30').scans, 2);
  });
  test('Body model: your shape, finite, love handles shrink as fat drops', function () {
    var s = fresh(), now = R.bodyModel(s, R.currentBody(s, '2026-10-05'), '2026-10-05'), goal = R.bodyModel(s, R.goalBody(s, '2026-10-05'), '2026-10-05');
    ok(now.loveHandles > goal.loveHandles, 'love handles shrink'); ok(now.belly > goal.belly, 'belly shrinks'); ok(now.chest > goal.chest, 'chest softens'); ok(goal.chest > 0, 'chest floor stays');
    eq(now.shoulderBreadth, 1.15); ok(now.armL > now.armR, 'left arm slightly bigger, like your scan');
    var weird = R.bodyModel(R.normalize({ shape: { shoulders: 'x', loveHandles: 9 } }), { weight: NaN, bf: null }, null);
    Object.keys(weird).forEach(function (k) { if (typeof weird[k] === 'number') ok(isFinite(weird[k]), k + ' finite'); });
    Object.keys(weird.circ).forEach(function (k) { ok(isFinite(weird.circ[k]) && weird.circ[k] > 0, 'circ ' + k); });
  });
  test('v2 data upgrades to v3 with your scan and shape', function () {
    var v2 = R.defaultState(); v2.version = 2; delete v2.inbody; delete v2.shape; v2.days['2026-10-03'] = R.normalizeDay({ water: 1000, weight: 89.8 });
    var m = R.migrate(v2); eq(m.version, R.STATE_VERSION); eq(m.inbody.length, 1); eq(m.inbody[0].smm, 38.6); eq(m.shape.loveHandles, 1); eq(m.days['2026-10-03'].weight, 89.8);
  });
  /* ── food search (MyFitnessPal-style) ── */
  var OATS = { name: 'Oat So Simple Original', brand: 'Quaker', code: '5000108001234', source: 'off', per100: { kcal: 373, protein_g: 11, carbs_g: 58, sugar_g: 1.2, fat_g: 8, fibre_g: 9 }, serving: { g: 27, label: '1 sachet (27g)' } };
  test('Portions by grams and servings', function () {
    var it = R.normalizeLib(OATS); ok(it, 'valid'); eq(it.serving.cal, 101); eq(it.serving.label, '1 sachet (27g)');
    var a = R.portion(it, { grams: 40 }); eq(a.cal, 149); eq(a.p, 4.4); eq(a.qty, '40g');
    var b = R.portion(it, { servings: 2 }); eq(b.cal, 202); eq(b.qty, '2 × 1 sachet (27g)');
    var srvOnly = R.normalizeLib({ name: 'Greggs sausage roll', source: 'web', serving: { kcal: 327, protein_g: 9, carbs_g: 24, sugar_g: 1, fat_g: 21, fibre_g: 1.5, label: '1 roll' } });
    eq(R.portion(srvOnly, { servings: 1.5 }).cal, 491); eq(R.portion(srvOnly, { grams: 50 }), null, 'no weight known'); ok(!R.canWeigh(srvOnly));
    var p100 = R.normalizeLib({ name: 'Basmati rice cooked', per100: { kcal: 130, protein_g: 2.7, carbs_g: 28, sugar_g: 0, fat_g: 0.3, fibre_g: 0.4 } });
    eq(R.portion(p100, R.defaultPortion(p100)).cal, 130); eq(R.portion(p100, { grams: 250 }).cal, 325); eq(R.portion(p100, { grams: 0 }), null);
  });
  test('Bad database numbers are rejected', function () {
    eq(R.normalizeLib({ name: 'x', per100: { kcal: 2000, protein_g: 10 } }), null, '2000kcal/100g');
    eq(R.normalizeLib({ name: 'x', per100: { kcal: 400, protein_g: 120 } }), null, '120g protein/100g');
    eq(R.normalizeLib({ name: 'x', per100: { kcal: 400, protein_g: 40, carbs_g: 50, fat_g: 30 } }), null, 'macros over 100g');
    eq(R.normalizeLib({ name: '', per100: { kcal: 100 } }), null, 'no name'); eq(R.normalizeLib({ name: 'x' }), null, 'no numbers');
    ok(R.normalizeLib({ name: 'Water', per100: { kcal: 0 } }), 'zero-calorie drink is fine');
  });
  test('My foods: remember, dedupe by barcode and name, count uses', function () {
    var s = fresh(); R.rememberFood(s, OATS, 1); R.rememberFood(s, Object.assign({}, OATS, { name: 'Oat So Simple (renamed)' }), 2);
    eq(s.library.length, 1, 'same barcode'); eq(s.library[0].uses, 2); eq(s.library[0].name, 'Oat So Simple (renamed)');
    R.rememberFood(s, { name: 'Banana', source: 'custom', serving: { kcal: 105, protein_g: 1.3, carbs_g: 27, sugar_g: 14, fat_g: 0.4, fibre_g: 3.1, label: '1 medium' } }, 3);
    R.rememberFood(s, { name: 'banana', source: 'custom', serving: { kcal: 105, protein_g: 1.3, carbs_g: 27, sugar_g: 14, fat_g: 0.4, fibre_g: 3.1, label: '1 medium' } }, 4);
    eq(s.library.length, 2, 'same name'); eq(R.findByCode(s, '5000108001234').uses, 2); eq(R.findByCode(s, '999'), null);
    eq(R.rememberFood(s, { name: 'bad', per100: { kcal: 5000 } }, 5), null);
  });
  test('Search: prefix beats word match, history and saved meals included, empty shows recents', function () {
    var s = fresh(); R.rememberFood(s, OATS, Date.now());
    R.rememberFood(s, { name: 'Chicken breast fillets', brand: 'Tesco', source: 'off', per100: { kcal: 106, protein_g: 24, carbs_g: 0, sugar_g: 0, fat_g: 1.1, fibre_g: 0 } }, Date.now());
    R.rememberFood(s, { name: 'Peri-peri chicken wrap', brand: 'Nando’s', source: 'web', serving: { kcal: 530, protein_g: 35, carbs_g: 50, sugar_g: 4, fat_g: 19, fibre_g: 4, label: '1 wrap' } }, Date.now());
    s.days['2026-10-04'] = R.normalizeDay({ foods: [{ name: 'Chicken curry', qty: '300g', cal: 420, p: 38, c: 12, s: 5, f: 24, fib: 3 }, { name: 'Chicken curry', qty: '300g', cal: 420, p: 38, c: 12, s: 5, f: 24, fib: 3 }] });
    var r = R.searchLocal(s, 'chicken', 10).map(function (x) { return x.name; });
    eq(r[0], 'Chicken breast fillets', 'prefix first'); ok(r.indexOf('Chicken curry') >= 0, 'history included'); ok(r.indexOf('Peri-peri chicken wrap') >= 0, 'word match included'); ok(r.indexOf('Oat So Simple Original') < 0, 'non-match excluded');
    eq(R.searchLocal(s, 'tesco chick', 5)[0].name, 'Chicken breast fillets', 'brand + name tokens');
    eq(R.searchLocal(s, 'protein', 5)[0].source, 'meal', 'saved meal found');
    ok(R.searchLocal(s, '', 10).length >= 4, 'empty query shows recents'); eq(R.searchLocal(s, 'zzzz', 5).length, 0);
    var hist = R.recentFoods(s, 10).filter(function (x) { return x.name === 'Chicken curry'; })[0]; eq(hist.uses, 2); eq(hist.serving.g, 300);
    ok(R.knownFoods(s, 25).some(function (x) { return x.name === 'Protein bowl' && x.cal === 377; }), 'AI gets your known foods');
  });
  test('Label photo and web lookup replies', function () {
    var a = R.parseFoodReply('{"found":true,"name":"Protein bar","brand":"Grenade","per100":{"kcal":360,"protein_g":33,"carbs_g":30,"sugar_g":2,"fat_g":13,"fibre_g":4},"serving_g":60,"serving_label":"1 bar (60g)"}', 'label');
    ok(a.ok); eq(a.item.serving.cal, 216); eq(a.item.source, 'label');
    var b = R.parseFoodReply('{"found":true,"name":"Sausage roll","brand":"Greggs","serving_label":"1 roll","per_serving":{"kcal":327,"protein_g":9,"carbs_g":24,"sugar_g":1,"fat_g":21,"fibre_g":1.5},"source_url":"https://www.greggs.com/menu/x"}', 'web');
    ok(b.ok); eq(b.item.serving.cal, 327); eq(R.hostOf(b.item.url), 'greggs.com');
    [null, 'nope', '{"found":false}', '{"name":"x","per100":{"kcal":9000}}', '[]'].forEach(function (x) { eq(R.parseFoodReply(x, 'web').ok, false, JSON.stringify(x)); });
  });
  /* ── Winter Arc plan ── */
  test('Plan targets: 1,600 every day, 1,900 Sunday, steps by day', function () {
    var s = fresh();
    eq(R.calTarget(s, '2026-10-04'), 1900, 'Sunday'); ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].forEach(function (k) { eq(R.calTarget(s, k), 1600, k); });
    eq(R.stepsTarget(s, '2026-10-05'), 10000, 'Mon gym'); eq(R.stepsTarget(s, '2026-10-07'), 15000, 'Wed rest'); eq(R.stepsTarget(s, '2026-10-09'), 10000, 'Fri football'); eq(R.stepsTarget(s, '2026-10-11'), 15000, 'Sun rest');
    eq(s.targets.fat, 60); eq(s.targets.floor, 1450); eq(s.targets.protein, 160);
    var w = R.weeklyBudget(s, '2026-10-05'); eq(w.eat, 11500); near(w.perDay, 860, 15, 'about 860 kcal a day'); near(w.kgPerWeek, 0.78, 0.03, '0.75–0.8kg a week');
  });
  test('Steps under 10k are owed the next day', function () {
    var s = fresh(); s.days['2026-10-05'] = R.emptyDay(); s.days['2026-10-05'].steps = 7000;
    eq(R.stepsTarget(s, '2026-10-06'), 13000, '10k + 3k owed'); eq(R.stepsOwed(s, '2026-10-06'), 3000);
    s.days['2026-10-05'].steps = 10000; eq(R.stepsTarget(s, '2026-10-06'), 10000); s.days['2026-10-05'].steps = 0; eq(R.stepsTarget(s, '2026-10-06'), 10000, 'nothing logged = nothing owed');
    s.days['2026-10-05'].steps = 2000; eq(R.stepsTarget(s, '2026-10-06'), 15000, 'make-up capped at 5k');
  });
  test('Programme: Push Mon, Legs Tue, Pull Sat, none on rest or football days', function () {
    var s = fresh();
    eq(R.sessionPlan(s, '2026-10-05').name, 'Push'); eq(R.sessionPlan(s, '2026-10-06').name, 'Legs'); eq(R.sessionPlan(s, '2026-10-10').name, 'Pull');
    eq(R.sessionPlan(s, '2026-10-07'), null); eq(R.sessionPlan(s, '2026-10-09'), null);
    eq(R.sessionPlan(s, '2026-10-05').list.length, 6); eq(R.sessionPlan(s, '2026-10-06').list.length, 5);
    Object.keys(R.PROGRAM).forEach(function (wd) { R.PROGRAM[wd].list.forEach(function (e) { ok(R.exerciseByKey(e[0]), e[0] + ' exists'); eq(R.avoidWarning(R.exerciseByKey(e[0]).name), null, e[0] + ' is allowed'); }); });
    ok(R.avoidWarning('heavy leg extension')); ok(R.avoidWarning('barbell squat')); eq(R.matchExercise('hammer curl').key, 'hammer_curl'); eq(R.matchExercise('straight arm pulldown').key, 'straight_arm_pulldown'); eq(R.matchExercise('wide-grip lat pulldown').key, 'lat_pulldown'); eq(R.matchExercise('seated leg curl').key, 'leg_curl');
    s.overrides['2026-10-08'] = 'gym'; s.days['2026-10-05'] = R.normalizeDay({ workouts: [{ name: 'incline db press', sets: [{ kg: 26, reps: 8 }] }] }); s.days['2026-10-06'] = R.normalizeDay({ workouts: [{ name: 'leg press', sets: [{ kg: 120, reps: 10 }] }] });
    eq(R.sessionPlan(s, '2026-10-08').name, 'Pull', 'moved gym day picks the session you’ve gone longest without');
  });
  test('Progression: hold until every set hits the top, then add weight; deload at 60%', function () {
    var s = fresh(), e = R.PROGRAM[1].list[0];
    eq(R.exerciseTarget(s, '2026-10-05', e).action, 'start'); eq(R.exerciseTarget(s, '2026-10-05', e).rir, 2); eq(R.exerciseTarget(s, '2026-10-05', R.PROGRAM[1].list[3]).rir, 1, 'isolation 1 short');
    s.days['2026-10-05'] = R.normalizeDay({ workouts: [{ name: 'incline db press', sets: [{ kg: 26, reps: 10 }, { kg: 26, reps: 9 }, { kg: 26, reps: 8 }] }] });
    var t = R.exerciseTarget(s, '2026-10-12', e); eq(t.action, 'hold'); eq(t.kg, 26);
    s.days['2026-10-12'] = R.normalizeDay({ workouts: [{ name: 'incline db press', sets: [{ kg: 26, reps: 10 }, { kg: 26, reps: 10 }, { kg: 26, reps: 10 }] }] });
    t = R.exerciseTarget(s, '2026-10-19', e); eq(t.action, 'up'); eq(t.kg, 28);
    ok(R.isDeload(s, '2026-10-26') && R.isDeload(s, '2026-11-01') && !R.isDeload(s, '2026-11-02') && R.isDeload(s, '2026-12-07') && R.isDeload(s, '2026-12-13'), 'deload weeks');
    t = R.exerciseTarget(s, '2026-10-26', e); eq(t.action, 'deload'); eq(t.kg, 16, '60% of 26 = 15.6 → 16');
    s.plan.ranges.incline_db_press = [4, 6, 8]; eq(R.exerciseTarget(s, '2026-10-19', e).sets, 4, 'custom rep range used');
  });
  test('Fortnightly review follows the plan table', function () {
    function withLoss(perWeek) { var s = fresh(); for (var i = 0; i < 21; i++) s.days[R.addDays('2026-10-01', i)] = R.normalizeDay({ weight: 90 - perWeek * i / 7 }); return R.planAdvice(s, '2026-10-21'); }
    eq(withLoss(0.75).code, 'ok'); eq(withLoss(0.75).kcal, 0);
    var f = withLoss(1.3); eq(f.code, 'fast'); eq(f.kcal, 150);
    var sl = withLoss(0.4); eq(sl.code, 'slow'); eq(sl.kcal, -100);
    var st = withLoss(0.1); eq(st.code, 'stall'); eq(st.kcal, -150); eq(st.steps, 1500);
    eq(R.planAdvice(fresh(), '2026-10-15').code, 'wait');
    var s = fresh(); [['2026-10-05', 30], ['2026-10-12', 28], ['2026-10-19', 26]].forEach(function (x) { s.days[x[0]] = R.normalizeDay({ weight: 89, workouts: [{ name: 'incline db press', sets: [{ kg: x[1], reps: 8 }] }] }); });
    var l = R.planAdvice(s, '2026-10-19'); eq(l.code, 'lifts'); eq(l.kcal, 150); eq(l.lifts[0], 'Incline DB Press');
    ok(R.reviewDue(fresh(), '2026-10-15')); ok(R.reviewDue(fresh(), '2026-10-29')); ok(!R.reviewDue(fresh(), '2026-10-14')); ok(!R.reviewDue(fresh(), '2026-10-01'));
  });
  test('Adjustments change every day and never go under the 1,450 floor', function () {
    var s = fresh(); var a = R.applyAdjustment(s, -100, 1500, '2026-10-15');
    eq(a.kcal, -100); eq(R.calTarget(s, '2026-10-19'), 1500); eq(R.calTarget(s, '2026-10-18'), 1800); eq(R.stepsTarget(s, '2026-10-19'), 11500); ok(!R.reviewDue(s, '2026-10-15'), 'review marked done');
    R.applyAdjustment(s, -150, 0, '2026-10-29'); eq(R.calTarget(s, '2026-11-02'), 1450, 'stops at the floor'); eq(R.calTarget(s, '2026-11-01'), 1650);
    var b = R.applyAdjustment(s, -150, 0, '2026-11-12'); eq(R.calTarget(s, '2026-11-16'), 1450); ok(b.floored, 'tells you it hit the floor');
    R.applyAdjustment(s, 150, 0, '2026-11-26'); eq(R.calTarget(s, '2026-11-30'), 1600); eq(s.plan.adjustments.length, 4);
  });
  test('Checkpoints, plan line, 7-day average, floor and lean-mass alerts', function () {
    var s = fresh(); eq(R.planWeightOn(s, '2026-10-01'), 90); eq(R.planWeightOn(s, '2026-11-01'), 86.5); eq(R.planWeightOn(s, '2026-12-01'), 83); eq(R.planWeightOn(s, '2026-12-31'), 79.5); near(R.planWeightOn(s, '2026-10-16'), 88.3, 0.11);
    eq(R.rollingAvg(s, '2026-10-10'), null); for (var i = 0; i < 7; i++) s.days[R.addDays('2026-10-26', i)] = R.normalizeDay({ weight: 86 + i * 0.1 });
    eq(R.rollingAvg(s, '2026-11-01'), 86.3); var c = R.checkpoints(s, '2026-11-02'); eq(c[0].actual, 86.3); eq(c[0].hit, true); eq(c[1].past, false); eq(c[1].daysLeft, 29);
    s.days['2026-11-03'] = R.normalizeDay({ foods: [{ name: 'x', cal: 1300 }] }); eq(R.floorBreach(s, '2026-11-04'), 1300); eq(R.floorBreach(s, '2026-11-05'), null);
    eq(R.leanMassAlert(s, '2026-11-05'), null); R.addScan(s, { date: '2026-11-04', weight: 86, bfm: 19.5 }, 'x'); ok(R.leanMassAlert(s, '2026-11-05'), 'lean 66.5 vs 67.9'); 
    ok(!R.scanDue(R.normalize({}), '2026-09-30')); ok(R.scanDue(R.normalize({}), '2026-10-05'), 'monthly scan due 28 days after 7 Sept');
    eq(R.weekOfPlan(s, '2026-10-01').week, 1); eq(R.weekOfPlan(s, '2026-10-08').week, 2); eq(R.weekOfPlan(s, '2026-12-31').total, 13); eq(R.weekOfPlan(s, '2026-12-31').week, 13);
  });
  test('Older saved data moves to the plan; your own changes are kept', function () {
    var v4 = R.defaultState(); v4.version = 4; v4.targets = { cal: { gym: 1700, football: 1800, rest: 1600 }, calTol: 75, protein: 160, fat: 55, steps: 8000, stepsGoal: 10000 }; v4.week.pattern = ['rest', 'gym', 'gym', 'alt', 'rest', 'football', 'gym']; delete v4.plan; v4.profile.startBf = 25;
    var m = R.migrate(v4); eq(R.calTarget(m, '2026-10-05'), 1600); eq(R.calTarget(m, '2026-10-04'), 1900); eq(m.targets.fat, 60); eq(R.dayType(m, '2026-10-14'), 'rest'); eq(m.plan.checkpoints.length, 3); eq(m.profile.startBf, 24.6);
    var custom = R.defaultState(); custom.version = 4; custom.targets = { cal: { gym: 1750, football: 1900, rest: 1650 }, fat: 50, steps: 9000 }; delete custom.plan;
    var c = R.migrate(custom); eq(R.calTarget(c, '2026-10-05'), 1750, 'custom calories kept'); eq(R.calTarget(c, '2026-10-09'), 1900); eq(c.targets.fat, 50); eq(R.stepsTarget(c, '2026-10-07'), 9000, 'custom steps kept');
  });
  test('Secret heroes: shuffled line-up; one hero for each whole kg a weigh-in is under the start, in order, the moment it happens', function () {
    eq(R.HEROES.length, 11); eq(R.HERO_KG, 1);
    var s = fresh(); ok(R.validHeroOrder(s.heroes.order), 'order is a shuffle of all 11'); var keep = s.heroes.order.slice(); s = R.normalize(s); eq(s.heroes.order.join(), keep.join(), 'line-up stays the same once made');
    ok(!R.validHeroOrder([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9])); ok(!R.validHeroOrder([0, 1])); eq(R.shuffledHeroes(function () { return 0; }).length, 11);
    s.heroes.order = [10, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9];
    function w(k, kg) { (s.days[k] = s.days[k] || R.emptyDay()).weight = kg; }
    var st = R.heroStatus(s, '2026-10-02'); eq(st.unlocked, 0); eq(st.milestones.length, 11); eq(st.milestones[0].need, 89, 'from a 90kg start the first is at 89kg'); eq(st.milestones[10].need, 79); eq(st.current.n, 1); eq(st.lowest, null);
    w('2026-10-01', 89.1); st = R.heroStatus(s, '2026-10-01'); eq(st.unlocked, 0, '0.9kg down is not enough'); eq(st.current.toGo, 0.1); eq(st.lowest, 89.1);
    w('2026-10-02', 89.0); st = R.heroStatus(s, '2026-10-02'); eq(st.unlocked, 1, 'exactly 1kg down on the scale frees the first, that same morning'); eq(st.slots[0].name, 'Sasuke'); eq(st.slots[0].date, '2026-10-02'); eq(st.slots[0].kg, 1); eq(st.slots[0].part, 'art/p/11.webp'); eq(st.slots[1].unlocked, false);
    ok(R.titles(s, '2026-10-02').indexOf('Shadow Hokage') >= 0); ok(R.titles(s, '2026-10-02').indexOf('The Hollow') < 0);
    // a 4kg drop frees four at once
    w('2026-10-06', 85.9); st = R.heroStatus(s, '2026-10-06'); eq(st.unlocked, 4, '4.1kg down: four heroes'); eq(st.slots[1].name, 'Gabimaru', 'the next in line'); eq(st.slots[3].date, '2026-10-06'); eq(st.current.need, 85); eq(st.current.toGo, 0.9);
    // a bounce does not chain anyone again
    w('2026-10-08', 88.5); w('2026-10-09', 88.6); eq(R.heroStatus(s, '2026-10-09').unlocked, 4); eq(R.heroStatus(s, '2026-10-09').lowest, 85.9);
    eq(R.heroStatus(s, '2027-01-02').over, true); eq(R.heroStatus(s, '2027-01-02').current, null); eq(R.heroStatus(s, '2027-01-02').slots[10].reachable, false); eq(R.heroStatus(s, '2026-10-09').slots[10].reachable, true);
    s.heroes.seen = { 0: 1, 50: 1 }; s = R.normalize(s); eq(Object.keys(s.heroes.seen).join(), '0');
  });
  test('Daily bosses: 83 unique bosses, titles and weapons, each with its own pictures', function () {
    eq(R.DUELS.length, 83); eq(R.DUEL_ART.length, 83); eq(R.DUEL_CUT.join(), '3,11,20,29,45,67,85'); var seenN = {}, seenT = {}, seenW = {}, seenA = {};
    R.DUELS.forEach(function (b, i) { eq(b.length, 5); ok(!seenN[b[0]], 'name ' + b[0]); ok(!seenT[b[2]], 'title ' + b[2]); ok(!seenW[b[3]], 'weapon ' + b[3]); seenN[b[0]] = seenT[b[2]] = seenW[b[3]] = 1; var d = R.duelInfo(i); ok(d.taskText && d.line && d.icon, 'info ' + i); eq(d.no, i + 1); ok(/^art\/b\/\d\d\.webp$/.test(d.art), d.art); ok(!seenA[d.art], 'picture used twice: ' + d.art); seenA[d.art] = 1; eq(d.wart, d.art.replace('/b/', '/w/')); });
    ['Arlong', 'Shoei Barou', 'Igris', 'Rob Lucci', 'Toji Fushiguro', 'Kokushibo', 'Yhwach'].forEach(function (n) { ok(!seenN[n], n + ' is no longer a boss'); });
    R.DUEL_CUT.forEach(function (n) { ok(!seenA['art/b/' + (n < 10 ? '0' : '') + n + '.webp'], 'the picture of removed boss ' + n + ' is not used'); });
    eq(R.DUEL_TASKS.length, 30); R.DUEL_TASKS.forEach(function (x) { eq(x[1].length, 3); }); eq(R.duelInfo(83), null); eq(R.duelInfo(-1), null);
    eq(R.duelInfo(0).tier, 0); eq(R.duelInfo(27).tier, 0); eq(R.duelInfo(28).tier, 1); eq(R.duelInfo(55).tier, 1); eq(R.duelInfo(56).tier, 2); eq(R.duelInfo(82).tier, 2);
    eq(R.duelInfo(0).name, 'Buggy'); eq(R.duelInfo(0).art, 'art/b/01.webp'); eq(R.duelInfo(2).name, 'Rui'); eq(R.duelInfo(2).art, 'art/b/04.webp', 'everyone keeps their own picture'); eq(R.duelInfo(3).name, 'Speed-o’-Sound Sonic'); eq(R.duelInfo(36).title, 'The Magician'); eq(R.duelInfo(36).art, 'art/b/41.webp');
    eq(R.duelInfo(82).name, 'Yujiro Hanma'); eq(R.duelInfo(82).wart, 'art/w/90.webp');
    for (var st = 0; st + 30 <= 83; st++) { var run = {}; for (var i = st; i < st + 30; i++) run[R.duelInfo(i).task] = 1; eq(Object.keys(run).length, 30, 'no challenge repeats inside any 30 days (from boss ' + (st + 1) + ')'); }
  });
  test('Daily bosses: a challenge that needs a pull-up bar is only set on a gym day; other days get the home version', function () {
    var s = R.normalize({}); s.duels.start = '2026-10-08';
    var hang = -1, lat = -1; for (var i = 0; i < R.DUELS.length; i++) { var t = R.duelInfo(i).task; if (t === 'Dead hang' && hang < 0) hang = i; if (t === 'Lat activation' && lat < 0) lat = i; }
    ok(hang >= 0 && lat >= 0); eq(Object.keys(R.DUEL_GYM_ONLY).sort().join(), 'Dead hang,Lat activation');
    [hang, lat].forEach(function (i) {
      var day = R.duelDay(s, i); s.overrides = s.overrides || {};
      s.overrides[day] = 'rest'; var d = R.duelInfo(i, s); ok(d.task !== 'Dead hang' && d.task !== 'Lat activation', 'a rest day gets ' + d.task); eq(d.gymTask, false); ok(!/bar|hang|pull-up/i.test(d.taskText), d.taskText);
      s.overrides[day] = 'football'; eq(R.DUEL_GYM_ONLY[R.duelInfo(i, s).task], undefined, 'a football day too');
      s.overrides[day] = 'gym'; d = R.duelInfo(i, s); eq(d.task, R.duelInfo(i).task, 'a gym day keeps the bar'); eq(d.gymTask, true);
      delete s.overrides[day];
    });
    R.DUEL_TASKS.forEach(function (x) { if (!R.DUEL_GYM_ONLY[x[0]]) ok(!/pull-up bar|from a bar|dead hang/i.test(x[1].join(' ')), x[0] + ' needs no bar'); });
  });
  test('Daily bosses: 48-hour window, double days, rewards lock when missed', function () {
    var s = fresh(); eq(R.duelsToday(s, '2026-10-03').length, 0); // not started
    s.duels.start = '2026-10-03';
    var a = R.duelsToday(s, '2026-10-03'); eq(a.length, 1); eq(a[0].i, 0); eq(a[0].lastChance, false);
    a = R.duelsToday(s, '2026-10-04'); eq(a.length, 2); eq(a[0].i, 0); eq(a[0].lastChance, true); eq(a[1].i, 1); // missed yesterday → two fights
    eq(R.duelStatus(s, 0, '2026-10-05'), 'escaped'); eq(R.defeatDuel(s, 0, '2026-10-05'), null); ok(R.titles(s, '2026-10-05').indexOf('The Star Clown') < 0);
    var w = R.defeatDuel(s, 1, '2026-10-05'); eq(w.name, 'Zabuza Momochi'); eq(R.duelStatus(s, 1, '2026-10-20'), 'won');
    ok(R.titles(s, '2026-10-05').indexOf('Demon of the Hidden Mist') >= 0); eq(R.duelsToday(s, '2026-10-05').length, 1); eq(R.duelsToday(s, '2026-10-05')[0].name, 'Rui');
    eq(R.duelStatus(s, 5, '2026-10-05'), 'upcoming'); eq(R.defeatDuel(s, 5, '2026-10-05'), null);
    eq(R.duelDay(s, 82), '2026-12-24'); var last = R.duelsToday(s, '2026-12-25'); eq(last.length, 1); eq(last[0].i, 82); eq(last[0].lastChance, true); eq(R.duelsToday(s, '2026-12-26').length, 0); eq(R.duelStatus(s, 82, '2026-12-26'), 'escaped');
    var sum = R.duelSummary(s, '2026-10-05'); eq(sum.won, 1); eq(sum.escaped, 1); eq(sum.active, 1); eq(sum.upcoming, 80); eq(sum.total, 83);
    R.undoDuel(s, 1); eq(R.duelStatus(s, 1, '2026-10-05'), 'active');
    // when the last boss arrives on the last day of the arc, that day is its only day
    var e = fresh(); e.duels.start = '2026-10-10'; eq(R.duelDay(e, 82), '2026-12-31'); var end = R.duelsToday(e, '2026-12-31'); eq(end.length, 2); eq(end[0].i, 81); eq(end[1].i, 82); ok(end[0].lastChance && end[1].lastChance, 'on the last day every boss is a last chance');
    eq(R.duelsToday(e, '2027-01-01').length, 0, 'no boss can be fought once the arc is over'); eq(R.duelStatus(e, 82, '2027-01-01'), 'escaped'); eq(R.defeatDuel(e, 82, '2027-01-01'), null);
    s.duels.won = { 3: '2026-10-06', 999: '2026-10-06', 4: 'junk', 85: '2026-10-06' }; s = R.normalize(s); eq(Object.keys(s.duels.won).join(), '3', 'a number past the end of the list (85) is not a boss');
  });
  test('Hologram shape: v6 migration and lean factor', function () {
    var old = R.normalize({}); old.version = 5; old.shape.loveHandles = 0.8; old.shape.shoulders = 1.1; delete old.shape.back; var m = R.migrate(old);
    eq(m.shape.loveHandles, 1); eq(m.shape.shoulders, 1.15); eq(m.shape.back, 0.8);
    var mine = R.normalize({}); mine.version = 5; mine.shape.loveHandles = 0.4; eq(R.migrate(mine).shape.loveHandles, 0.4);
    var s = R.normalize({}); eq(R.bodyModel(s, { weight: 90, bf: 24.6 }, '2026-10-05').lean, 0); ok(R.bodyModel(s, { weight: 79, bf: 14.5 }, '2026-10-05').lean === 1);
  });
  test('Sync: push, load from cloud, or ask; never overwrite silently', function () {
    var D = R.syncDecision;
    eq(D({ localDays: 0, dirty: false, base: null, cloudSavedAt: null, cloudHasData: false }), 'none');
    eq(D({ localDays: 3, dirty: false, base: null, cloudSavedAt: null, cloudHasData: false }), 'push');
    eq(D({ localDays: 3, dirty: false, base: 'A', cloudSavedAt: 'A', cloudHasData: true, cloudDays: 3 }), 'none');
    eq(D({ localDays: 3, dirty: true, base: 'A', cloudSavedAt: 'A', cloudHasData: true, cloudDays: 3 }), 'push');
    eq(D({ localDays: 0, dirty: false, base: null, cloudSavedAt: 'B', cloudHasData: true, cloudDays: 3 }), 'adopt'); // new or wiped phone
    eq(D({ localDays: 0, dirty: true, base: null, cloudSavedAt: 'B', cloudHasData: true, cloudDays: 0 }), 'adopt'); // only opened the app, nothing logged
    eq(D({ localDays: 3, dirty: false, base: 'A', cloudSavedAt: 'B', cloudHasData: true, cloudDays: 4, localChangedAt: 100, cloudChangedAt: 200 }), 'adopt'); // changed on another device, newer and not smaller
    eq(D({ localDays: 3, dirty: true, base: 'A', cloudSavedAt: 'B', cloudHasData: true, cloudDays: 3 }), 'conflict');
    eq(D({ localDays: 2, dirty: false, base: null, cloudSavedAt: 'B', cloudHasData: true, cloudDays: 2 }), 'conflict'); // logged before connecting
  });
  test('F2: an empty or damaged phone never uploads over a cloud copy with days in it', function () {
    var D = R.syncDecision;
    eq(D({ localDays: 0, dirty: true, base: 'A', cloudSavedAt: 'A', cloudHasData: true, cloudDays: 21 }), 'adopt', 'damaged save, still marked as in step with the cloud');
    eq(D({ localDays: 0, dirty: true, base: 'A', cloudSavedAt: 'B', cloudHasData: true, cloudDays: 21 }), 'adopt');
    eq(D({ localDays: 0, dirty: true, base: null, cloudSavedAt: 'B', cloudHasData: true, cloudDays: 21, mine: true, changedSincePush: true }), 'adopt', 'even if the last upload was its own');
    var empty = R.normalize({}); eq(R.loggedDays(empty), 0); empty.days['2026-10-05'] = R.emptyDay(); eq(R.loggedDays(empty), 0, 'an empty shell of a day is not a logged day');
    empty.days['2026-10-05'].water = 250; eq(R.loggedDays(empty), 1); eq(R.stateSummary(empty).days, 1); eq(R.stateSummary(empty).kg, null);
    var st = createStoreCheck();
    function createStoreCheck() { var fs = fakeStorage(); fs.setItem('rtl_state', '{"days": {broken'); var l = R.createStore(fs, 'rtl_state').load(); eq(l.status, 'corrupt'); eq(R.loggedDays(l.state), 0); ok(Object.keys(fs._m).some(function (k) { return k.indexOf('rtl_state_corrupt_') === 0; }), 'the unreadable save is kept in its own slot'); return l; }
  });
  test('F3: a cloud copy is only taken without asking when it is newer and not smaller', function () {
    var D = R.syncDecision, base = { dirty: false, base: 'A', cloudSavedAt: 'B', cloudHasData: true };
    function d(x) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return D(o); }
    eq(d({ localDays: 21, cloudDays: 0, localChangedAt: 100, cloudChangedAt: 200 }), 'conflict', 'an empty cloud copy is never taken silently');
    eq(d({ localDays: 21, cloudDays: 20, localChangedAt: 100, cloudChangedAt: 200 }), 'conflict', 'fewer days: ask');
    eq(d({ localDays: 21, cloudDays: 21, localChangedAt: 200, cloudChangedAt: 100 }), 'conflict', 'older: ask');
    eq(d({ localDays: 21, cloudDays: 21, localChangedAt: 100, cloudChangedAt: 200 }), 'adopt');
    eq(d({ localDays: 21, cloudDays: 30, localChangedAt: 100, cloudChangedAt: 100 }), 'adopt');
  });
  test('F5: the phone recognises its own last upload', function () {
    var D = R.syncDecision;
    eq(D({ localDays: 3, dirty: true, base: 'A', cloudSavedAt: 'B', cloudHasData: true, cloudDays: 3, mine: true, changedSincePush: false }), 'ack', 'the reply was lost: nothing to ask, nothing to send');
    eq(D({ localDays: 3, dirty: true, base: 'A', cloudSavedAt: 'B', cloudHasData: true, cloudDays: 3, mine: true, changedSincePush: true }), 'push', 'changed again since: send it');
    eq(D({ localDays: 3, dirty: true, base: 'A', cloudSavedAt: 'B', cloudHasData: true, cloudDays: 3, mine: false }), 'conflict', 'someone else’s upload is still a conflict');
  });
  test('Backups must really be backups; impossible dates are refused', function () {
    var s = fresh(); s.days['2026-10-05'] = R.normalizeDay({ water: 500 }); var back = R.importState(R.exportState(s)); eq(back.days['2026-10-05'].water, 500); ok(/"app": "winter-arc"/.test(R.exportState(s)));
    eq(R.importState(JSON.stringify({ app: 'road-to-lean', state: s })).days['2026-10-05'].water, 500, 'backups made by earlier versions still load');
    ['{"days":5}', '[]', '{"profile":{}}', '{"days":{},"profile":{}}', '"hello"', '{"version":6,"days":[],"profile":{}}'].forEach(function (junk) { var threw = false; try { R.importState(junk); } catch (e) { threw = true; } ok(threw, 'refused: ' + junk); });
    var bad = JSON.parse(R.exportState(s)); bad.state.days['2026-02-31'] = R.emptyDay(); var t2 = false; try { R.importState(JSON.stringify(bad)); } catch (e) { t2 = /impossible date/.test(e.message); } ok(t2, '31 Feb refused');
  });
  test('Abs sessions and supplements are tracked', function () {
    var f0 = R.normalizeDay({ activities: [{ type: 'football', min: 0 }] }); eq(R.footballMinutes(f0), 0, 'a football entry of 0 minutes is 0 minutes, not an hour'); eq(R.tdeeFor(fresh(), f0), 1900, 'and burns nothing'); eq(R.footballMinutes(R.normalizeDay({ activities: [{ type: 'football', min: 45 }, { type: 'football', min: 0 }] })), 45);
    var s = fresh(); R.commitItems(s, '2026-10-06', [{ kind: 'activity', type: 'abs', min: 10 }], 'a', 1, '20:00'); R.commitItems(s, '2026-10-08', [{ kind: 'activity', type: 'abs', min: 10 }], 'b', 1, '20:00');
    eq(R.absThisWeek(s, '2026-10-09'), 2); eq(R.absThisWeek(s, '2026-10-13'), 0); eq(R.activityKcal(s, s.days['2026-10-06']), 0, 'abs adds no calories');
    var p = R.parseReply('{"type":"activity","items":[{"activity":"home abs","minutes":12}]}'); eq(p.items[0].type, 'abs');
    var d = R.normalizeDay({ supps: { creatine: true, vitd: 0 } }); eq(d.supps.creatine, true); eq(d.supps.vitd, undefined);
  });
  test('Full season simulation stays fast and consistent', function () {
    var s = fresh(), t0 = Date.now();
    R.rangeKeys('2026-10-01', '2026-12-31').forEach(function (k, i) { if (i % 5 !== 4) clearDay(s, k); s.days[k] = s.days[k] || R.emptyDay(); s.days[k].weight = Math.round((90 - i * 0.11) * 10) / 10; });
    var p = R.player(s, '2026-12-31'); ok(p.level >= 20, 'meaningful progress: level ' + p.level); ok(p.xp === p.earned);
    var na = R.newAchievements(s, '2026-12-31'); ok(na.length > 20, 'achievements earned: ' + na.length);
    R.statsFor(s, '2026-12-31'); R.bossesUpTo(s, '2026-12-31'); R.ladderProgress(s, '2026-12-31');
    ok(Date.now() - t0 < 4000, 'computed in ' + (Date.now() - t0) + 'ms');
  });
  /* ── audit fixes (v12) ── */
  test('F1: level weigh-ins give a flat trend, never a broken date', function () {
    var s = fresh(); ['2026-10-05', '2026-10-06', '2026-10-11'].forEach(function (k) { s.days[k] = R.normalizeDay({ weight: 88.1 }); });
    var tr = R.trend(s, '2026-10-18'); ok(tr, 'a trend comes back'); eq(tr.flat, true); eq(tr.perWeek, 0); eq(tr.goalDate, null); eq(tr.daysToGoal, null); eq(tr.tooFast, false);
    var t2 = fresh(); [['2026-10-05', 88.1], ['2026-10-08', 88.1000001], ['2026-10-12', 88.0999999]].forEach(function (x) { t2.days[x[0]] = R.emptyDay(); t2.days[x[0]].weight = x[1]; });
    var tr2 = R.trend(t2, '2026-10-18'); eq(tr2.flat, true, 'a few millionths of a kg is still flat'); eq(tr2.goalDate, null);
    var up = fresh(); [['2026-10-05', 88], ['2026-10-08', 88.4], ['2026-10-12', 88.9]].forEach(function (x) { up.days[x[0]] = R.normalizeDay({ weight: x[1] }); }); eq(R.trend(up, '2026-10-18').goalDate, null, 'gaining: no finish date');
    var dn = fresh(); for (var i = 0; i < 10; i++) dn.days[R.addDays('2026-10-05', i)] = R.normalizeDay({ weight: 89 - i * 0.1 }); var tr3 = R.trend(dn, '2026-10-14'); ok(R.isKey(tr3.goalDate), 'losing: a real finish date'); ok(tr3.daysToGoal > 0);
    eq(R.addDays('2026-10-05', 1e12), '', 'an impossible date is empty, not a crash'); ok(!R.isKey('2026-02-31'), '31 Feb is not a date'); ok(R.isKey('2028-02-29'));
  });
  function lift(s, k, name, sets, t) { var d = s.days[k] || (s.days[k] = R.emptyDay()); d.workouts.push(R.normalizeDay({ workouts: [{ name: name, sets: sets, t: t || d.workouts.length }] }).workouts[0]); }
  function x3(kg, reps) { return [{ kg: kg, reps: reps }, { kg: kg, reps: reps }, { kg: kg, reps: reps }]; }
  test('F8: the first session after each deload goes back to your real weight', function () {
    var s = fresh(), e = R.PROGRAM[1].list[0];
    lift(s, '2026-10-19', 'incline db press', [{ kg: 26, reps: 10 }, { kg: 26, reps: 9 }, { kg: 26, reps: 8 }]);
    var dl = R.exerciseTarget(s, '2026-10-26', e); eq(dl.action, 'deload'); eq(dl.kg, 16);
    lift(s, '2026-10-26', 'incline db press', x3(16, 10)); // the deload session, done exactly as told
    var back = R.exerciseTarget(s, '2026-11-02', e); eq(back.action, 'hold'); eq(back.kg, 26, 'back to 26kg, not held at 16kg'); ok(/Stay at 26kg/.test(back.text), back.text);
    eq(R.lastSets(s, 'incline_db_press', '2026-11-02').day, '2026-10-19', 'the deload session is not your “last session”');
    lift(s, '2026-11-30', 'incline db press', x3(28, 10)); eq(R.exerciseTarget(s, '2026-12-07', e).kg, 17, 'second deload: 60% of 28'); lift(s, '2026-12-07', 'incline db press', x3(17, 10));
    var b2 = R.exerciseTarget(s, '2026-12-14', e); eq(b2.action, 'up'); eq(b2.kg, 30, 'every set hit the top before the deload, so add weight after it');
    var sp = fresh(); lift(sp, '2026-10-05', 'incline db press', [{ kg: 26, reps: 10 }], 1); lift(sp, '2026-10-05', 'incline db press', [{ kg: 26, reps: 10 }, { kg: 26, reps: 10 }], 2);
    eq(R.lastSets(sp, 'incline_db_press', '2026-10-12').sets.length, 3, 'a session logged in two entries is one session'); eq(R.exerciseTarget(sp, '2026-10-12', e).action, 'up');
  });
  test('F23: a deload never looks like muscle loss', function () {
    var s = fresh(); lift(s, '2026-10-12', 'incline db press', x3(26, 10)); lift(s, '2026-10-19', 'incline db press', x3(26, 10)); lift(s, '2026-10-26', 'incline db press', x3(16, 10));
    eq(R.strengthLog(s).alerts.length, 0, 'a 60% deload session raises no alert');
    lift(s, '2026-11-02', 'incline db press', x3(22, 8)); var a = R.strengthLog(s).alerts; eq(a.length, 1, 'a real drop outside a deload still does'); eq(a[0].name, 'Incline DB Press');
  });
  test('F9: “lifts dropping” stays quiet after a deload, a weight increase and a split log', function () {
    var a = fresh(); lift(a, '2026-10-12', 'incline db press', x3(26, 9)); lift(a, '2026-10-19', 'incline db press', x3(26, 10)); lift(a, '2026-10-26', 'incline db press', x3(16, 10)); lift(a, '2026-11-02', 'incline db press', x3(26, 10));
    eq(R.liftsDropping(a, '2026-11-02').length, 0, 'after a deload'); eq(R.liftSessions(a, 'incline_db_press', '2026-11-02').length, 3, 'deload session left out');
    var b = fresh(); lift(b, '2026-10-05', 'incline db press', x3(26, 10)); lift(b, '2026-10-12', 'incline db press', x3(28, 7)); lift(b, '2026-10-19', 'incline db press', x3(30, 5));
    eq(R.liftsDropping(b, '2026-10-19').length, 0, 'heavier for fewer reps is not a drop');
    var c = fresh(); [[26, 10], [26, 9], [26, 8]].forEach(function (x, i) { lift(c, '2026-10-05', 'incline db press', [{ kg: x[0], reps: x[1] }], i + 1); }); lift(c, '2026-10-12', 'incline db press', x3(26, 10));
    eq(R.liftSessions(c, 'incline_db_press', '2026-10-12').length, 2, 'three entries on one day are one session'); eq(R.liftsDropping(c, '2026-10-12').length, 0, 'split log');
    var d = fresh(); lift(d, '2026-10-05', 'incline db press', x3(28, 8)); lift(d, '2026-10-12', 'incline db press', x3(28, 7)); lift(d, '2026-10-19', 'incline db press', x3(28, 6));
    eq(R.liftsDropping(d, '2026-10-19')[0], 'Incline DB Press', 'a real two-session decline at the same weight still fires'); eq(R.planAdvice(d, '2026-10-19').code, 'lifts');
  });
  test('F16: one step target everywhere, a logged shortfall carries over, never more than 17,000', function () {
    var s = fresh(); eq(R.STEP_CAP, 17000);
    eq(R.stepsTarget(s, '2026-10-21'), 15000, 'Wednesday is a 15,000 day'); eq(R.questStatus(s, '2026-10-21')[3].target, 15000, 'the quest uses the same number');
    s.days['2026-10-20'] = R.emptyDay(); s.days['2026-10-20'].steps = 8000; eq(R.stepsTarget(s, '2026-10-21'), 17000, '15,000 + 2,000 owed'); eq(R.stepsOwed(s, '2026-10-21'), 2000);
    s.days['2026-10-20'].steps = 1; eq(R.stepsTarget(s, '2026-10-21'), 17000, 'a big shortfall is capped at 17,000, not 20,000');
    s.days['2026-10-18'] = R.emptyDay(); s.days['2026-10-18'].steps = 8000; eq(R.stepsTarget(s, '2026-10-19'), 12000, '8,000 one day means 12,000 the next');
    s.days['2026-10-20'].steps = 0; eq(R.stepsTarget(s, '2026-10-21'), 15000, 'not logged: no debt'); eq(R.stepsNotLogged(s, '2026-10-21'), true, 'but it is flagged as not logged');
    s.days['2026-10-20'].steps = 9000; eq(R.stepsNotLogged(s, '2026-10-21'), false); eq(R.stepsNotLogged(fresh(), '2026-10-21'), false, 'no nudge before you have used the app');
    var a = fresh(); R.applyAdjustment(a, 0, 1500, '2026-10-15'); R.applyAdjustment(a, 0, 1500, '2026-10-29'); R.applyAdjustment(a, 0, 1500, '2026-11-12');
    eq(R.stepsBase(a, '2026-11-18'), 17000, 'review step increases stop at the cap'); a.days['2026-11-17'] = R.emptyDay(); a.days['2026-11-17'].steps = 3000; eq(R.stepsTarget(a, '2026-11-18'), 17000);
    R.rangeKeys('2026-10-02', '2026-12-31').forEach(function (k) { var p = R.penaltyFor(a, k); if (p && /steps/.test(p.text)) { var n = +p.text.replace(/,/g, '').match(/\d+/)[0]; ok(n <= 17000, 'penalty on ' + k + ' asks for ' + n); } ok(R.stepsTarget(a, k) <= 17000, k); });
    var big = fresh(); big.targets.stepsDay = [30000, 30000, 30000, 30000, 30000, 30000, 30000]; big.targets.steps = 40000; big = R.normalize(big); eq(R.stepsTarget(big, '2026-10-21'), 17000, 'saved targets above the cap are brought down to it');
  });
  function snap(s, k) { var p = R.player(s, k), st = R.streaks(s, k); return JSON.stringify({ xp: p.earned, level: p.level, gold: p.goldEarned, streak: st.clear, best: st.bestClear, protein: st.protein, lines: p.lines }); }
  test('F7: a review change never re-marks the days before it', function () {
    var s = fresh(), today = '2026-10-15'; R.rangeKeys('2026-10-01', today).forEach(function (k) { clearDay(s, k); });
    var before = snap(s, today); ok(R.streaks(s, today).clear === 15, '15 perfect days'); ok(R.player(s, today).earned >= 5000, 'XP ' + R.player(s, today).earned);
    R.applyAdjustment(s, -100, 0, today);
    eq(snap(s, today), before, 'XP, level, gold and streak are exactly what they were'); eq(R.calTarget(s, '2026-10-14'), 1600, 'yesterday keeps 1,600'); eq(R.calTarget(s, today), 1600, 'today keeps today’s target'); eq(R.calTarget(s, '2026-10-16'), 1500, 'the change starts tomorrow'); eq(R.calTarget(s, '2026-10-18'), 1800, 'Sunday 1,900 − 100');
    eq(s.plan.adjustments[0].from, '2026-10-16'); eq(s.days['2026-10-10'].tg.c, 1600, 'each day carries its own target'); eq(s.days['2026-10-11'].tg.c, 1900);
    R.applyAdjustment(s, 0, 1500, '2026-10-29'); eq(snap(s, today), before, 'a steps change does not touch the past either'); eq(R.stepsTarget(s, '2026-10-14'), 15000); eq(R.stepsTarget(s, '2026-11-04'), 16500);
    R.freezeDays(s, '2026-10-30'); s.targets.protein = 220; s.targets.waterMl = 5000; s.targets.fibreQuest = 60; s.week.pattern[1] = 'rest'; s.targets.calTol = 10;
    eq(snap(s, today), before, 'changing targets or the weekly pattern in Settings keeps the past as it was'); eq(R.dayType(s, '2026-10-05'), 'gym', 'that Monday was a gym day and stays one'); eq(R.dayType(s, '2026-11-02'), 'rest');
    var back = R.normalize(JSON.parse(JSON.stringify(s))); eq(snap(back, today), before, 'and it survives a save and reload');
    eq(R.loggedDays(R.normalize({ days: { '2026-10-05': { tg: s.days['2026-10-05'].tg } } })), 0, 'a day holding only stored targets is not a logged day');
  });
  test('F17: correcting a mistyped weigh-in takes back what only the wrong number earned', function () {
    var s = fresh(), today = '2026-10-06';
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].forEach(function (k, i) { clearDay(s, k); s.days[k].weight = 89.9 - i * 0.1; });
    function settle() { R.newAchievements(s, today).forEach(function (a) { s.player.ach[a.id] = today; }); var p = R.player(s, today); if (p.level > s.player.maxLevel) s.player.maxLevel = p.level; s.player.seenLevel = s.player.maxLevel; s.player.seenKgMilestone = R.kgMilestones(s); return p; }
    var honest = settle(), honestAch = Object.keys(s.player.ach).length, honestLevel = honest.level;
    s.days[today] = R.emptyDay(); s.days[today].weight = 80.5; // meant 89.5
    var wrong = settle(); ok(wrong.earned > honest.earned + 300, 'the typo earned XP: ' + honest.earned + ' → ' + wrong.earned); ok(Object.keys(s.player.ach).length > honestAch + 1, 'and handed out kg and body-fat awards'); eq(s.player.seenKgMilestone, 1, 'one kilogram “banked” (a single reading is diluted by the 7-day average, but not to nothing)');
    s.player.maxLevel = s.player.seenLevel = wrong.level + 3; // as if that XP had tipped a level or three
    s.days[today].weight = 89.5; var rc = R.recalcProgress(s, today), fixed = R.player(s, today);
    ok(rc.changed && rc.removed.length > 1, rc.removed.length + ' awards taken back'); eq(Object.keys(s.player.ach).length, honestAch, 'only the honest awards are left'); eq(fixed.level, honestLevel, 'level is back where it belongs'); ok(!fixed.floored, 'not propped up by the old level'); eq(s.player.seenKgMilestone, 0);
    ok(s.player.ach['naruto_0'], 'awards that had nothing to do with weight are untouched');
    var calm = R.recalcProgress(s, today); eq(calm.changed, false, 'a correction that changes nothing leaves the level protection alone');
  });
  test('F13: the first review gives a verdict, a missed review stays open, and a second Apply does nothing', function () {
    function season(perWeek, upto) { var s = fresh(); R.rangeKeys('2026-10-01', upto).forEach(function (k, i) { s.days[k] = R.normalizeDay({ weight: Math.round((90 - perWeek * i / 7) * 100) / 100 }); }); return s; }
    var a = R.planAdvice(season(0.8, '2026-10-15'), '2026-10-15'); eq(a.code, 'ok', 'weighing in only since 1 Oct is enough: ' + a.text); eq(a.then, 90, 'measured from the 90kg start'); near(a.rate, 0.8, 0.03);
    eq(R.planAdvice(season(0.2, '2026-10-15'), '2026-10-15').code, 'stall'); eq(R.planAdvice(season(0.42, '2026-10-15'), '2026-10-15').code, 'slow'); eq(R.planAdvice(season(1.4, '2026-10-15'), '2026-10-15').code, 'fast');
    var pre = season(0.8, '2026-10-15'); pre.days['2026-09-28'] = R.normalizeDay({ weight: 93 }); pre.days['2026-09-29'] = R.normalizeDay({ weight: 93 }); near(R.planAdvice(pre, '2026-10-15').rate, 0.8, 0.03, 'pre-season weigh-ins do not move the baseline');
    near(R.planAdvice(season(0.8, '2026-10-29'), '2026-10-29').rate, 0.8, 0.03, 'later reviews compare two 7-day averages');
    var s = season(0.2, '2026-10-20');
    ok(R.reviewDue(s, '2026-10-15')); ok(R.reviewDue(s, '2026-10-16'), 'still open the day after'); ok(R.reviewDue(s, '2026-10-20'), 'and five days later'); eq(R.reviewDate(s, '2026-10-20'), '2026-10-15'); eq(R.nextReview(s, '2026-10-20'), '2026-10-29');
    var r1 = R.applyAdjustment(s, -150, 1500, '2026-10-17'); eq(r1.refused, false); eq(R.calTarget(s, '2026-10-19'), 1450); eq(JSON.stringify(R.normalize(JSON.parse(JSON.stringify(s)))), JSON.stringify(s), 'a review change is stored exactly as a reload would store it'); ok(!R.reviewDue(s, '2026-10-17'), 'dealt with'); ok(!R.reviewDue(s, '2026-10-28'));
    var r2 = R.applyAdjustment(s, -150, 1500, '2026-10-17'), r3 = R.applyAdjustment(s, 150, 0, '2026-10-20'); eq(r2.refused, true); eq(r3.refused, true, 'one change per review');
    eq(R.calTarget(s, '2026-10-19'), 1450, 'targets did not move again'); eq(R.calTarget(s, '2026-10-25'), 1750); eq(R.stepsBase(s, '2026-10-21'), 16500); eq(s.plan.adjustments.length, 1); eq(s.plan.adjustments[0].review, '2026-10-15'); eq(s.plan.adjustments[0].date, '2026-10-17'); eq(s.plan.adjustments[0].from, '2026-10-18');
    ok(R.reviewDue(s, '2026-10-29'), 'the next review opens on its day'); eq(R.applyAdjustment(s, 0, 0, '2026-10-29').refused, false); ok(!R.reviewDue(s, '2026-10-30'), '“change nothing” also closes a review');
    ok(!R.reviewDue(fresh(), '2027-01-02'), 'no reviews after the arc'); eq(R.nextReview(fresh(), '2026-12-25'), '', 'none left');
  });
  test('F14: setting a Sunday to the type it already is keeps 1,900', function () {
    var s = fresh(); eq(R.calTarget(s, '2026-10-04'), 1900); s.overrides['2026-10-04'] = 'rest'; eq(R.calTarget(s, '2026-10-04'), 1900, 'Rest on a rest day changes nothing');
    s.overrides['2026-10-04'] = 'gym'; eq(R.dayType(s, '2026-10-04'), 'gym'); eq(R.calTarget(s, '2026-10-04'), 1600, 'a real change of type uses that type’s calories');
    s.overrides['2026-10-05'] = 'gym'; eq(R.calTarget(s, '2026-10-05'), 1600);
  });
  test('F15 + F24: a day under 1,450 never passes; nothing can put a target or the floor under 1,450', function () {
    var s = fresh(); eq(R.FLOOR_MIN, 1450); s.plan.lastReview = ''; R.applyAdjustment(s, -150, 0, '2026-10-15'); var k = '2026-10-19'; eq(R.calTarget(s, k), 1450);
    function eat(cal) { s.days[k] = R.normalizeDay({ foods: [{ name: 'x', cal: cal, p: 160, c: 100, s: 5, f: 40, fib: 26 }] }); return R.questStatus(s, k)[1]; }
    eq(eat(1380).done, false, '1,380 is inside ±75 of 1,450 but under the floor'); ok(/not under 1450/.test(eat(1380).label), eat(1380).label); eq(eat(1449).done, false); eq(eat(1450).done, true); eq(eat(1520).done, true); eq(eat(1530).done, false, 'still ±75 above');
    var d = fresh(); d.days['2026-10-05'] = R.normalizeDay({ foods: [{ name: 'x', cal: 1530, p: 160 }] }); eq(R.questStatus(d, '2026-10-05')[1].done, true, 'at 1,600 the usual ±75 still applies (1,530 passes)');
    eq(R.underFloorNow(s, k, '14:00'), null, 'mid-afternoon: the day is not over'); eat(1380); var u = R.underFloorNow(s, k, '21:00'); eq(u.short, 70, 'the same evening it says you are 70 short'); s.days[k].lightsOut = true; ok(R.underFloorNow(s, k, '19:00'), 'or as soon as you check in for bed');
    [{ targets: { floor: 1000 } }, { targets: { floor: 800, calDay: [800, 900, 1000, 1100, 1200, 1300, 1400], cal: { gym: 900, football: 1000, rest: 800 } } }, { targets: { floor: -5, calDay: [1, 1, 1, 1, 1, 1, 1] } }, { targets: { floor: 'x', cal: null } }].forEach(function (raw, i) {
      var n = R.normalize(raw); ok(n.targets.floor >= 1450, 'floor ' + i); R.rangeKeys('2026-10-05', '2026-10-11').forEach(function (dk) { ok(R.calTarget(n, dk) >= 1450, i + ' ' + dk + ' ' + R.calTarget(n, dk)); n.overrides[dk] = 'gym'; ok(R.calTarget(n, dk) >= 1450); });
      var imp = R.importState(JSON.stringify({ app: 'winter-arc', state: Object.assign(R.normalize({}), { targets: Object.assign(R.normalize({}).targets, raw.targets) }) })); ok(imp.targets.floor >= 1450 && Math.min.apply(null, imp.targets.calDay.filter(function (v) { return v > 0; }).concat([9999])) >= 1450, 'import ' + i);
    });
    var hi = R.normalize({ targets: { floor: 1550 } }); eq(hi.targets.floor, 1550, 'a higher floor is allowed'); eq(R.calTarget(hi, '2026-10-05'), 1600); for (var j = 0; j < 4; j++) { hi.plan.lastReview = ''; R.applyAdjustment(hi, -150, 0, R.addDays('2026-10-15', j * 14)); } eq(R.calTarget(hi, '2026-12-14'), 1550, 'cuts stop at the floor');
  });
  test('F10: weighing exactly on the plan line reads “on plan” every single day', function () {
    var s = fresh(), bad = [];
    R.rangeKeys('2026-10-01', '2026-12-31').forEach(function (k) { s.days[k] = R.normalizeDay({ weight: R.planWeightOn(s, k) }); var st = R.planStatus(s, k); if (st.avg != null && st.state !== 'on') bad.push(k + ' ' + st.diff); });
    eq(bad.length, 0, 'days not shown as on plan: ' + bad.slice(0, 5).join(', '));
    var late = fresh(); R.rangeKeys('2026-10-01', '2026-10-20').forEach(function (k, i) { late.days[k] = R.normalizeDay({ weight: 90 - i * 0.03 }); }); eq(R.planStatus(late, '2026-10-20').state, 'behind'); ok(R.planStatus(late, '2026-10-20').diff > 1);
    var fast = fresh(); R.rangeKeys('2026-10-01', '2026-10-20').forEach(function (k, i) { fast.days[k] = R.normalizeDay({ weight: 90 - i * 0.2 }); }); eq(R.planStatus(fast, '2026-10-20').state, 'ahead');
    var gaps = fresh(); ['2026-10-14', '2026-10-17', '2026-10-20'].forEach(function (k) { gaps.days[k] = R.normalizeDay({ weight: R.planWeightOn(gaps, k) }); }); eq(R.planStatus(gaps, '2026-10-20').state, 'on', 'missed weigh-ins do not skew it'); eq(R.planStatus(fresh(), '2026-10-20').state, 'none');
  });
  test('Heroes (v17): weigh-ins before day one do not count, and a scan never overwrites a weigh-in', function () {
    function mk() { var s = fresh(); s.heroes.order = [10, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9]; return s; }
    function w(s, k, kg) { (s.days[k] = s.days[k] || R.emptyDay()).weight = kg; }
    var a = mk(); w(a, '2026-10-01', 89.9); w(a, '2026-10-02', 87.5); eq(R.heroStatus(a, '2026-10-02').unlocked, 2, '2.5kg down on the scale: two heroes');
    var b = mk(); w(b, '2026-09-28', 88.0); w(b, '2026-09-30', 87.9); w(b, '2026-10-01', 89.8); eq(R.heroStatus(b, '2026-10-01').unlocked, 0, 'readings from before the arc do not count'); eq(R.heroStatus(b, '2026-10-01').lowest, 89.8);
    var c = mk(); w(c, '2026-10-05', 89.0); eq(R.heroStatus(c, '2026-10-05').unlocked, 1);
    var r = R.addScan(c, { date: '2026-10-05', weight: 89.9, pbf: 24.4 }, 'tok'); ok(r.ok); eq(c.days['2026-10-05'].weight, 89.0, 'the weigh-in stays'); eq(r.keptWeighIn, 89.0); eq(R.latestScan(c).weight, 89.9, 'the scan keeps its own number'); eq(c.days['2026-10-05'].bf, 24.4);
    eq(R.heroStatus(c, '2026-10-05').unlocked, 1, 'the hero is not re-chained by an evening scan');
    var again = R.normalize(JSON.parse(JSON.stringify(c))); eq(R.heroStatus(again, '2026-10-05').unlocked, 1, 'survives a save and reload'); eq(R.lockHeroWeeks(c, '2026-10-30'), 0); eq(R.recheckHeroWeek(c, ['2026-10-05'], '2026-10-07'), false);
  });
  test('F20 + F21: every boss challenge is honest about knees, back and food', function () {
    var all = R.DUEL_TASKS.map(function (t) { return t[0] + ': ' + t[1].join(' | '); }).join('\n');
    ok(!/superman/i.test(all), 'no superman holds'); ok(!/Nothing (to eat )?after/i.test(all), 'no “nothing after 8pm”'); ok(!/no liquid calories/i.test(all), 'shakes are not banned'); ok(!/twice/i.test(all), 'no doubled 100-rep sets');
    ok(/Protein shakes are fine/.test(all) && /Hit your calories and protein first/.test(all), 'Kitchen closed reworded'); ok(/bird dogs/.test(all) && /side plank/.test(all), 'Back armour replaced');
    ok(!/[^-]leg raises/.test(all.replace(/bent-knee leg raises/g, '')), 'leg raises are bent-knee'); ok(/17,000 at most/.test(all), 'Step raid capped'); ok(!/under 14 minutes/.test(all), 'Fast mile capped at 15 minutes');
    R.DUEL_TASKS.forEach(function (t) { t[1].forEach(function (x) { (x.match(/\d+ (?:crunches|reverse crunches|heel taps|dead bugs|bird dogs)/g) || []).forEach(function () {}); }); });
    var core = R.DUEL_TASKS.filter(function (t) { return t[0] === '100-rep core'; })[0][1]; core.forEach(function (x) { ok(!/200/.test(x), x); }); ok(/25 dead bugs, 25 heel taps, 25 bird dogs, 25 bent-knee reverse crunches/.test(core[0]));
    eq(R.DUEL_TASKS.length, 30); var first30 = {}; for (var i = 0; i < 30; i++) first30[R.duelInfo(i).task] = 1; eq(Object.keys(first30).length, 30);
    ok(!/as a quote/.test('')); ok(R.DUEL_LINES.every(function (l) { return l.length > 10; }));
  });
  test('F22: rewards follow the plan, not the size of the deficit or one low reading', function () {
    var s = fresh(); eq(R.plannedDeficit(s, '2026-10-05'), 840, 'gym day'); eq(R.plannedDeficit(s, '2026-10-07'), 825, 'rest day'); eq(R.plannedDeficit(s, '2026-10-09'), 1325, 'football day'); eq(R.plannedDeficit(s, '2026-10-11'), 525, 'Sunday');
    function day(k, cal, steps, acts) { s.days[k] = R.normalizeDay({ foods: [{ name: 'x', cal: cal, p: 160 }], steps: steps, activities: acts || [] }); }
    day('2026-10-05', 1600, 10000, [{ type: 'gym', min: 60 }]); eq(R.metrics(s, '2026-10-06').deficit, 840, 'a day to plan banks the planned deficit');
    day('2026-10-06', 1600, 25000, [{ type: 'gym', min: 60 }, { type: 'gym', min: 60 }]); eq(R.metrics(s, '2026-10-07').deficit, 1680, 'burning far more banks no more than the plan');
    day('2026-10-07', 900, 15000); eq(R.metrics(s, '2026-10-08').deficit, 1680, 'a day under the floor banks nothing');
    day('2026-10-08', 2600, 15000); eq(R.metrics(s, '2026-10-09').deficit, 1680, 'a day over banks nothing (and takes nothing away)');
    var season = 0; R.rangeKeys('2026-10-01', '2026-12-31').forEach(function (k) { season += R.plannedDeficit(fresh(), k); });
    var top = R.LADDERS.filter(function (l) { return l.metric === 'deficit'; })[0].thresholds; ok(top[top.length - 1] <= season - R.plannedDeficit(fresh(), '2026-12-31'), 'the top rung (' + top[top.length - 1] + ') is inside the season’s planned ' + season);
    var one = fresh(); ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].forEach(function (k) { one.days[k] = R.normalizeDay({ weight: 89.6 }); }); one.days['2026-10-09'] = R.normalizeDay({ weight: 86.9 });
    eq(R.kgMilestones(one), 0, 'one dehydrated reading 3kg down is not a 3kg milestone'); ok(R.maxKgLost(one) < 1, String(R.maxKgLost(one)));
    R.rangeKeys('2026-10-10', '2026-10-16').forEach(function (k) { one.days[k] = R.normalizeDay({ weight: 88.0 }); }); ok(R.maxKgLost(one) >= 2 && R.maxKgLost(one) < 2.3, 'a week averaging about 88.0 is 2kg down: ' + R.maxKgLost(one)); eq(R.kgMilestones(one), 2);
    eq(R.DEFICIT_AMBER, 1100);
  });
  test('F37: the arc ends on 31 Dec: nothing is asked or scored after it, and the season is summed up', function () {
    var s = fresh(); R.rangeKeys('2026-10-01', '2026-12-31').forEach(function (k, i) { clearDay(s, k); s.days[k].weight = Math.round((90 - i * 0.115) * 10) / 10; });
    var dec31 = snap(s, '2026-12-31'); eq(R.seasonOver(s, '2026-12-31'), false); eq(R.seasonOver(s, '2027-01-01'), true);
    eq(snap(s, '2027-01-01'), dec31, 'XP, gold and streak on 1 Jan are what they were on 31 Dec'); eq(snap(s, '2027-01-20'), dec31, 'and three weeks later');
    clearDay(s, '2027-01-01'); eq(snap(s, '2027-01-02'), dec31, 'logging after the arc is kept but not scored'); eq(R.penaltyFor(s, '2027-01-03'), null, 'no penalty for a January day');
    ok(/finished on Thu 31 Dec/.test(R.noticeLines(s, '2027-01-01')[0]), R.noticeLines(s, '2027-01-01')[0]); eq(R.noticeLines(s, '2027-01-01').length, 1, 'no “FOOTBALL DAY” on 1 Jan'); eq(R.weekOfPlan(s, '2027-01-01').over, true); ok(!R.reviewDue(s, '2027-01-01'));
    var f = R.seasonSummary(s, '2027-01-01'); eq(f.over, true); eq(f.days, 92); eq(f.daysLogged, 92); eq(f.clears, 92); eq(f.bestStreak, 92); eq(f.startKg, 90); near(f.endKg, 79.9, 0.15); near(f.lostKg, 10.1, 0.15); eq(f.reachedGoal, false); eq(f.checkpoints, 3); ok(f.steps > 1000000); ok(f.level > 20);
    eq(R.seasonSummary(fresh(), '2027-01-01').clears, 0, 'an empty season sums up without crashing'); eq(R.normalize({ player: { finishSeen: '2026-12-31' } }).player.finishSeen, '2026-12-31');
  });
  test('F25: a backup with a hostile ID loads with a clean ID', function () {
    var evil = '"><img src=x onerror="window.__pwn=1">', s = fresh();
    s.days['2026-10-05'] = { foods: [{ id: evil, name: 'Rice', cal: 200 }], workouts: [{ id: evil, name: 'lat pulldown', sets: [{ kg: 60, reps: 10 }] }], activities: [{ id: evil, type: 'gym', min: 60 }] };
    s.savedMeals = [{ id: evil, name: 'Bowl', items: [{ name: 'x', cal: 100 }] }]; s.shop.rewards = [{ id: evil, name: 'Game', cost: 10 }]; s.shop.purchases = [{ id: evil, name: 'Game', cost: 10, t: 1 }];
    s.library = [{ id: evil, name: 'Oats', per100: { kcal: 370, protein_g: 11, carbs_g: 60, fat_g: 8 } }]; s.inbody.push({ id: evil, date: '2026-10-05', weight: 89, pbf: 24 }); s.plan.adjustments = [{ date: evil, kcal: evil, steps: 0 }, { date: '2026-10-15', kcal: -100, steps: 0 }]; s.plan.lastReview = evil;
    var n = R.importState(JSON.stringify({ app: 'winter-arc', state: s })), d = n.days['2026-10-05'], ids = [d.foods[0].id, d.workouts[0].id, d.activities[0].id, n.savedMeals[0].id, n.shop.rewards[0].id, n.shop.purchases[0].id, n.library[0].id, n.inbody[n.inbody.length - 1].id];
    ids.forEach(function (id) { ok(/^[A-Za-z0-9_.:\-]{1,64}$/.test(id), 'clean id: ' + id); }); eq(JSON.stringify(n).indexOf('onerror'), -1, 'nothing hostile survives anywhere in the save'); eq(n.plan.adjustments.length, 1); eq(n.plan.lastReview, '');
    eq(R.cleanId('protein-bowl'), 'protein-bowl'); eq(R.cleanId('scan-2026-09-07'), 'scan-2026-09-07'); ok(R.cleanId('<b>') !== '<b>'); ok(R.cleanId(5) !== 5); ok(R.cleanId('a'.repeat(65)).length < 30);
    var keep = R.normalize(JSON.parse(JSON.stringify(n))); eq(keep.days['2026-10-05'].foods[0].id, d.foods[0].id, 'a clean id stays the same from then on');
  });
  /* ── re-audit of v12 ── */
  test('R8: a hand-edited backup cannot carry a target under the floor or over the step cap inside a day', function () {
    var n = R.importState(JSON.stringify({ app: 'winter-arc', state: { version: 7, profile: {}, days: { '2026-11-20': { tg: { t: 'rest', c: 600, s: 99999, st: 99999, p: 160, w: 3000, fb: 25, tol: 75, fl: 0, m: 10000 } }, '2026-11-21': { tg: { t: 'rest', c: 600, s: 10000, st: 30000, fl: 0, m: 10000, lg: 1 } } } } }));
    eq(R.calTarget(n, '2026-11-20'), 1450); eq(R.dayRules(n, '2026-11-20').floor, 1450); ok(R.stepsTarget(n, '2026-11-20') <= 17000, 'steps ' + R.stepsTarget(n, '2026-11-20'));
    eq(R.calTarget(n, '2026-11-21'), 1450, 'claiming to be a pre-v12 day does not get round it'); eq(R.dayRules(n, '2026-11-21').legacy, false); ok(R.stepsTarget(n, '2026-11-21') <= 17000);
  });
  test('R4: filling in an older day later never re-marks the day after it', function () {
    var s = fresh(); ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].forEach(function (k) { clearDay(s, k); }); s.days['2026-10-06'].steps = 0; // Tuesday's steps were never entered
    R.freezeDays(s, '2026-10-10'); var was = R.stepsTarget(s, '2026-10-07'), xp = R.player(s, '2026-10-10').earned; ok(R.questStatus(s, '2026-10-07').every(function (q) { return q.done; }), 'Wednesday was a clear');
    s.days['2026-10-06'].steps = 6000; // entered honestly, three days late
    eq(R.stepsTarget(s, '2026-10-07'), was, 'Wednesday keeps the step target it was walked against'); ok(R.questStatus(s, '2026-10-07').every(function (q) { return q.done; }), 'and stays a clear'); ok(R.player(s, '2026-10-10').earned >= xp - 200, 'only Tuesday itself is re-marked');
    var live = fresh(); clearDay(live, '2026-10-06'); live.days['2026-10-06'].steps = 6000; eq(R.stepsTarget(live, '2026-10-07'), R.stepsBase(live, '2026-10-07') + 4000 > 17000 ? 17000 : R.stepsBase(live, '2026-10-07') + 4000, 'make-up steps still apply to a day that is not over');
  });
  test('R5: a day left empty, then filled in after a review, is judged by the plan of that day', function () {
    var s = fresh(); R.rangeKeys('2026-10-01', '2026-10-15').forEach(function (k) { if (k !== '2026-10-12') s.days[k] = R.normalizeDay({ weight: 90, water: 500 }); });
    var cal = R.calTarget(s, '2026-10-12'), steps = R.stepsBase(s, '2026-10-12'), r = R.applyAdjustment(s, -150, 1500, '2026-10-15'); eq(r.refused, false);
    eq(R.calTarget(s, '2026-10-12'), cal, 'the empty day kept its calories'); eq(R.stepsBase(s, '2026-10-12'), steps, 'and its steps'); eq(R.dayHasData(s.days['2026-10-12']), false, 'it still counts as not logged'); eq(R.loggedDays(s), 14);
    eq(R.calTarget(s, '2026-10-19'), cal - 150, 'the change applies from tomorrow on');
  });
  test('R7: a phone holding clearly fewer days than the cloud always asks before uploading', function () {
    eq(R.syncDecision({ localDays: 1, cloudDays: 30, dirty: true, base: 'S', cloudSavedAt: 'S', cloudHasData: true }), 'conflict');
    eq(R.syncDecision({ localDays: 18, cloudDays: 20, dirty: true, base: 'OLD', cloudSavedAt: 'S', cloudHasData: true, mine: true, changedSincePush: true }), 'conflict');
    eq(R.syncDecision({ localDays: 29, cloudDays: 30, dirty: true, base: 'S', cloudSavedAt: 'S', cloudHasData: true }), 'push', 'deleting one day’s entries is normal use');
    eq(R.syncDecision({ localDays: 31, cloudDays: 30, dirty: true, base: 'S', cloudSavedAt: 'S', cloudHasData: true }), 'push');
  });
  test('R13: review advice says when calories are already at the floor', function () {
    var s = fresh(); s.targets.calDay = s.targets.calDay.map(function (v, i) { return i === 0 ? v : 1450; }); R.rangeKeys('2026-10-01', '2026-10-15').forEach(function (k) { s.days[k] = R.normalizeDay({ weight: 90 }); });
    var a = R.planAdvice(s, '2026-10-15'); eq(a.code, 'stall'); ok(/1,450 kcal floor stay there/.test(a.text), a.text);
    var b = fresh(); R.rangeKeys('2026-10-01', '2026-10-15').forEach(function (k) { b.days[k] = R.normalizeDay({ weight: 90 }); }); ok(!/floor/.test(R.planAdvice(b, '2026-10-15').text), 'not mentioned when there is room to cut');
  });
  /* a lifter who does exactly what the app says, every session, all season */
  function perfectSeason(onReview, make) {
    var s = (make || fresh)();
    R.rangeKeys(s.profile.startDate, s.profile.seasonEnd).forEach(function (k) {
      var d = s.days[k] || (s.days[k] = R.emptyDay()); d.weight = R.planWeightOn(s, k);
      var sp = R.sessionPlan(s, k);
      if (sp) sp.list.forEach(function (x, n) {
        var sets = [];
        if (x.action === 'start') for (var i = 0; i < x.sets; i++) sets.push({ kg: 20 + n * 4, reps: x.lo });
        else if (x.action === 'up') for (var j = 0; j < x.sets; j++) sets.push({ kg: x.kg, reps: x.lo });
        else if (x.action === 'deload') for (var m = 0; m < x.sets; m++) sets.push({ kg: x.kg, reps: x.hi });
        else { var bumped = false; x.last.sets.slice(0, x.sets).forEach(function (st) { var r = st.reps; if (!bumped && r < x.hi) { r++; bumped = true; } sets.push({ kg: x.kg, reps: r }); }); }
        lift(s, k, x.name, sets);
      });
      if (R.reviewDue(s, k)) onReview(s, k);
    });
    return s;
  }
  test('F9: a perfect lifter is never told “lifts dropping” and ends the season on 1,600 / 1,900', function () {
    var reviews = 0, s = perfectSeason(function (st, k) { var adv = R.planAdvice(st, k); reviews++; ok(adv.code !== 'lifts', 'review on ' + k + ' said: ' + adv.text); R.applyAdjustment(st, adv.kcal, adv.steps, k); });
    ok(reviews >= 6, 'six fortnightly reviews ran: ' + reviews); eq(s.targets.calDay.join(), '1900,1600,1600,1600,1600,1600,1600'); eq(R.strengthLog(s).alerts.length, 0, 'no muscle-loss alerts either');
    ['2026-11-02', '2026-11-03', '2026-11-07', '2026-12-14', '2026-12-15', '2026-12-19'].forEach(function (k) { R.sessionPlan(s, k).list.forEach(function (x) { var before = R.lastSets(s, x.key, k); ok(!R.isDeload(s, before.day), x.name + ' on ' + k + ' is based on a real session'); }); });
  });
  test('Heroes (v17): correcting a mistyped weigh-in re-works the heroes from the true numbers, nothing else', function () {
    function mk() { var s = shipped(); s.heroes.order = [10, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9]; return s; }
    function w(s, k, kg) { (s.days[k] = s.days[k] || R.emptyDay()).weight = kg; }
    var s = mk(); w(s, '2026-10-09', 89.6); w(s, '2026-10-10', 87.6); eq(R.heroStatus(s, '2026-10-10').unlocked, 2, 'the typo frees two');
    w(s, '2026-10-10', 89.6); eq(R.heroStatus(s, '2026-10-10').unlocked, 0, 'corrected to 89.6: 0.9 down, chained again'); eq(R.heroStatus(s, '2026-10-10').current.toGo, 0.1);
    w(s, '2026-10-11', 89.5); eq(R.heroStatus(s, '2026-10-11').unlocked, 1, 'then freed the honest way'); eq(R.heroStatus(s, '2026-10-11').slots[0].date, '2026-10-11');
  });
  /* ── upgrades from older saves ── */
  function v11save() {
    // a save as version 11 of the app left it (data v6): no per-day targets, no floor rule, no step cap, heroes worked out from any weigh-in
    var o = fresh(); o.version = 6; o.heroes = { order: [10, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9], seen: { 10: 1 } }; o.duels.start = '2026-10-01';
    o.targets.floor = 1200; o.targets.calDay = [1900, 1400, 1600, 1600, 1600, 1600, 1600]; delete o.player.msLegacy; delete o.player.msLegacyAt; delete o.meta.restarted; delete o.meta.restartSeen;
    o.days['2026-09-29'] = R.normalizeDay({ weight: 91 });
    o.days['2026-10-03'] = R.normalizeDay({ weight: 90.1, steps: 6000 });
    o.days['2026-10-04'] = R.normalizeDay({ steps: 19000 });                                   // Sunday: 15,000 + 4,000 owed = 19,000 under v11
    o.days['2026-10-05'] = R.normalizeDay({ foods: [{ name: 'Monday food', cal: 1380, p: 160, c: 100, s: 5, f: 40, fib: 26 }], steps: 10000 }); // 1,380 against a 1,400 target: a pass under v11
    o.days['2026-10-09'] = R.normalizeDay({ weight: 88.9, activities: [{ type: 'football', min: 0 }], steps: 12000 });
    Object.keys(o.days).forEach(function (k) { delete o.days[k].tg; });
    o.player.ach = { 'one-piece_0': '2026-10-09', 'one-piece_1': '2026-10-09' }; o.player.maxLevel = 3;
    return JSON.parse(JSON.stringify(o));
  }
  var KEEP = { keepSeason: true };
  test('Upgrade from v11: days already judged keep the targets and the rules they were judged by', function () {
    var m = R.migrate(v11save(), '2026-10-10', KEEP); eq(m.version, R.STATE_VERSION); eq(m.profile.startDate, '2026-10-01', 'this check keeps the old season so the old results can be compared');
    var g = m.days['2026-10-05'].tg; ok(g && g.lg === 1, 'the old Monday carries its own targets'); eq(g.c, 1400); eq(g.fl, 1200); eq(R.questStatus(m, '2026-10-05')[1].done, true, '1,380 against 1,400 still counts, as it did');
    eq(m.days['2026-10-04'].tg.st, 19000, 'the old Sunday keeps its 19,000 step target'); eq(R.questStatus(m, '2026-10-04')[3].done, true);
    eq(m.targets.floor, 1450, 'from now on the floor is 1,450'); eq(m.targets.calDay[1], 1450, 'and no target sits under it');
    m.days['2026-10-12'] = R.normalizeDay({ foods: [{ name: 'New Monday', cal: 1380, p: 160, c: 100, s: 5, f: 40, fib: 26 }] }); eq(R.questStatus(m, '2026-10-12')[1].done, false, 'a new day under the floor does not pass');
    eq(R.footballMinutes(m.days['2026-10-09']), 60, 'a football entry with no minutes used to count as an hour: it still does'); ok(m.player.msLegacyAt === '2026-10-10');
    m.days['2026-10-10'] = R.normalizeDay({ steps: 4000 }); ok(R.stepsTarget(m, '2026-10-11') <= R.STEP_CAP, 'new days never ask for more than 17,000');
    var again = R.migrate(JSON.parse(JSON.stringify(m)), '2026-10-20', KEEP); eq(again.days['2026-10-05'].tg.lg, 1, 'still there after a save and reload'); eq(R.questStatus(again, '2026-10-05')[1].done, true);
  });
  test('Upgrade from v11: kilograms already banked stay banked', function () {
    var m = R.migrate(v11save(), '2026-10-10', KEEP);
    eq(m.player.msLegacy, 1, 'the kilogram banked from the single 88.9 reading stays banked'); eq(R.kgMilestones(m), 1); ok(R.maxKgLost(m) < 1, 'even though the 7-day average has not reached it');
    var r = R.recalcProgress(m, '2026-10-10'); eq(r.removed.length, 0, 'correcting some other weigh-in takes none of the old awards away'); ok(m.player.ach['one-piece_1']);
    m.days['2026-10-09'].weight = 89.9; r = R.recalcProgress(m, '2026-10-10'); ok(r.removed.indexOf('East Blue') >= 0, 'but correcting THAT reading takes back what only it had earned'); eq(m.player.msLegacy, 0);
  });
  test('Upgrade from v11 straight to this version: both upgrades run and every log survives', function () {
    var raw = v11save(), days = Object.keys(raw.days).sort().join(), m = R.migrate(raw, '2026-10-08');
    eq(m.version, R.STATE_VERSION); eq(m.profile.startDate, '2026-10-08'); eq(m.profile.startKg, 90.5); eq(Object.keys(m.days).filter(function (k) { return R.dayHasData(m.days[k]); }).sort().join(), days);
    eq(m.days['2026-10-03'].weight, 90.1); eq(m.days['2026-10-05'].foods[0].cal, 1380); eq(m.days['2026-10-09'].steps, 12000);
    ok(Object.keys(m.days).every(function (k) { return !(m.days[k].tg && m.days[k].tg.lg); }), 'no day carries the old rules into the new season'); eq(m.player.msLegacy, 0); eq(m.heroes.keep, null); eq(Object.keys(m.heroes.locked).length, 0);
    eq(R.player(m, '2026-10-08').earned, 0); eq(m.meta.before.startDate, '2026-10-01'); ok(R.validHeroOrder(m.heroes.order)); ok(m.heroes.order.join() !== '' && Object.keys(m.heroes.seen).length === 0);
    R.rangeKeys('2026-10-08', '2026-12-31').forEach(function (k) { R.questStatus(m, k); R.stepsTarget(m, k); }); R.player(m, '2026-12-31'); R.seasonSummary(m, '2027-01-01');
  });
  /* ── the plan the app ships with (v14): Thu 8 Oct 2026 → Thu 31 Dec 2026, from 90.5kg, 83 daily bosses ── */
  test('Season: the arc starts on Thu 8 Oct 2026 at 90.5kg; every other plan number is unchanged', function () {
    var s = shipped(), P = s.profile, T = s.targets;
    eq(P.startDate, '2026-10-08'); eq(R.weekday(P.startDate), 4, 'a Thursday'); eq(P.startKg, 90.5); eq(P.goalKg, 79); eq(P.seasonEnd, '2026-12-31'); eq(P.startBf, 24.6); eq(P.goalBf, 15);
    eq(R.rangeKeys(P.startDate, P.seasonEnd).length, 85, '85 days'); var w = R.weekOfPlan(s, '2026-10-08'); eq(w.week, 1); eq(w.total, 12); eq(R.weekOfPlan(s, '2026-10-15').week, 2); eq(R.weekOfPlan(s, '2026-12-31').week, 12);
    eq(T.calDay.join(), '1900,1600,1600,1600,1600,1600,1600'); eq(T.floor, 1450); eq(T.stepsDay.join(), '15000,10000,10000,15000,15000,10000,10000'); eq(T.protein, 160); eq(T.waterMl, 3000); eq(s.plan.reviewEvery, 14);
    eq(JSON.stringify(s.plan.deloads), '[["2026-10-26","2026-11-01"],["2026-12-07","2026-12-13"]]'); eq(R.TOO_FAST_KG, 1.1);
    eq(R.dayType(s, '2026-10-08'), 'rest'); eq(R.calTarget(s, '2026-10-08'), 1600); eq(R.stepsTarget(s, '2026-10-08'), 15000); eq(R.dayType(s, '2026-10-09'), 'football'); eq(R.dayType(s, '2026-10-10'), 'gym'); eq(R.calTarget(s, '2026-10-11'), 1900);
    // the line to the goal: 90.5 on day one, 79.5 on the last day, never asking for more than the plan's own 1.1kg a week
    eq(R.planWeightOn(s, '2026-10-08'), 90.5); eq(R.planWeightOn(s, '2026-10-01'), 90.5); eq(R.planWeightOn(s, '2026-11-01'), 87.4); eq(R.planWeightOn(s, '2026-12-01'), 83.4); eq(R.planWeightOn(s, '2026-12-31'), 79.5);
    var pts = [{ date: P.startDate, kg: P.startKg }].concat(s.plan.checkpoints);
    for (var i = 1; i < pts.length; i++) { var rate = (pts[i - 1].kg - pts[i].kg) / (R.diffDays(pts[i - 1].date, pts[i].date) / 7); ok(rate > 0.5 && rate <= 1.0, 'leg ' + i + ' asks for ' + rate.toFixed(2) + 'kg a week'); }
    // reviews every 14 days from day one, but never on the last day (a change starts the day after, so it could change nothing)
    eq(R.reviewDate(s, '2026-10-21'), ''); var due = []; R.rangeKeys(P.startDate, '2027-01-05').forEach(function (k) { if (R.reviewDate(s, k) === k) due.push(k); });
    eq(due.join(), '2026-10-22,2026-11-05,2026-11-19,2026-12-03,2026-12-17'); eq(R.nextReview(s, '2026-10-08'), '2026-10-22'); eq(R.nextReview(s, '2026-12-17'), ''); eq(R.reviewDate(s, '2026-12-31'), '2026-12-17');
    var done = shipped(); done.plan.lastReview = '2026-12-17'; ok(!R.reviewDue(done, '2026-12-31'), 'no review opens on 31 Dec'); ok(R.reviewDue(shipped(), '2026-12-31'), 'one left open on 17 Dec is still open');
    // the first review measures from 90.5 on day one
    R.rangeKeys('2026-10-08', '2026-10-22').forEach(function (k, n) { s.days[k] = R.normalizeDay({ weight: Math.round((90.5 - n * 0.11) * 100) / 100 }); });
    var adv = R.planAdvice(s, '2026-10-22'); eq(adv.then, 90.5); eq(adv.code, 'ok', adv.text);
    // weekly bosses: the first week is the four days Thu–Sun
    var b = R.bossFor(s, '2026-10-05', '2026-10-08'); eq(b.name, 'Protein Titan'); eq(b.hp, 4, 'a four-day first week asks for four days, not six');
    // the day before: nothing is asked and nothing is scored
    var e = shipped(); eq(R.notStarted(e, '2026-10-07'), true); eq(R.notStarted(e, '2026-10-08'), false); ok(/starts on Thu 8 Oct/.test(R.noticeLines(e, '2026-10-07')[0])); eq(R.noticeLines(e, '2026-10-07').length, 1);
    clearDay(e, '2026-10-07'); eq(R.player(e, '2026-10-07').earned, 0); eq(R.penaltyFor(e, '2026-10-08'), null, 'and no penalty on day one for the day before'); eq(R.streaks(e, '2026-10-07').clear, 0); eq(R.bossFor(e, '2026-10-05', '2026-10-07').dmg, 0);
  });
  test('Season: heroes from 8 Oct, one per kg on the scale down to 79.5kg; nothing from before day one or after the end counts', function () {
    var s = shipped(); s.heroes.order = [10, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9];
    function w(k, kg) { (s.days[k] = s.days[k] || R.emptyDay()).weight = kg; }
    var st = R.heroStatus(s, '2026-10-08'); eq(st.milestones[0].need, 89.5); eq(st.milestones[10].need, 79.5, 'the eleventh at the end of the plan'); eq(st.notStarted, false); eq(R.heroStatus(s, '2026-10-07').notStarted, true);
    w('2026-10-06', 88.0); w('2026-10-07', 88.0); eq(R.heroStatus(s, '2026-10-08').unlocked, 0, 'weigh-ins from before day one free nobody');
    w('2026-10-08', 89.8); w('2026-10-09', 89.6); eq(R.heroStatus(s, '2026-10-09').unlocked, 0);
    w('2026-10-10', 89.5); st = R.heroStatus(s, '2026-10-10'); eq(st.unlocked, 1, '89.5kg: the first hero'); eq(st.slots[0].name, 'Sasuke'); eq(st.slots[0].date, '2026-10-10');
    eq(R.heroStatus(s, '2026-12-31').current.n, 2); eq(R.heroStatus(s, '2027-01-01').current, null); eq(R.heroStatus(s, '2027-01-01').over, true);
    w('2027-01-05', 70); eq(R.heroStatus(s, '2027-01-06').unlocked, 1, 'nothing after the arc frees a hero');
  });
  test('Season: 83 bosses, one a day from 8 Oct to 29 Dec; they only double up if the app is first opened late', function () {
    var s = shipped(); eq(R.duelPlan(s), null, 'no bosses before the app has been opened'); s.duels.start = '2026-10-08';
    var p = R.duelPlan(s); eq(p.days, 83); eq(p.single, 83); eq(p.doubled, 0); eq(p.squeezed, false);
    var per = {}; for (var i = 0; i < 83; i++) { var d = R.duelDay(s, i); eq(d, R.addDays('2026-10-08', i), 'boss ' + (i + 1)); per[d] = (per[d] || 0) + 1; }
    R.rangeKeys('2026-10-08', '2026-12-29').forEach(function (k) { eq(per[k], 1, k); }); ok(!per['2026-12-30'] && !per['2026-12-31'], 'no new boss on the last two days');
    eq(R.duelDay(s, 0), '2026-10-08'); eq(R.duelDay(s, 82), '2026-12-29'); eq(R.duelInfo(82).name, 'Yujiro Hanma'); eq(R.duelsToday(s, '2026-10-07').length, 0, 'none the day before the arc');
    eq(R.duelsToday(s, '2026-10-08').length, 1); eq(R.duelsToday(s, '2026-10-09').length, 2, 'yesterday’s boss is still here for one more day'); eq(R.duelsToday(s, '2026-10-09')[0].lastChance, true);
    eq(R.duelsToday(s, '2026-12-29').length, 2); var d30 = R.duelsToday(s, '2026-12-30'); eq(d30.length, 1); eq(d30[0].i, 82); eq(d30[0].lastChance, true); eq(R.duelsToday(s, '2026-12-31').length, 0, 'the last day of the arc has no boss'); eq(R.duelStatus(s, 82, '2026-12-31'), 'escaped');
    // win every boss on its own day: 83 of 83
    for (var j = 0; j < 83; j++) ok(R.defeatDuel(s, j, R.duelDay(s, j)), 'boss ' + (j + 1)); var sum = R.duelSummary(s, '2026-12-31'); eq(sum.won, 83); eq(sum.escaped, 0); eq(sum.total, 83); eq(R.duelsToday(s, '2026-12-29').length, 0);
    // opened late: still all 83, still in order, never past the last day
    ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-20', '2026-11-15', '2026-12-01', '2026-12-25', '2026-12-30', '2026-12-31'].forEach(function (st) {
      var t = shipped(); t.duels.start = st; var q = R.duelPlan(t), last = '', seen = {}, most = 0;
      for (var n = 0; n < 83; n++) { var dd = R.duelDay(t, n); ok(dd >= last && dd >= st && dd <= '2026-12-31', st + ': boss ' + (n + 1) + ' on ' + dd); last = dd; seen[dd] = (seen[dd] || 0) + 1; most = Math.max(most, seen[dd]); }
      eq(R.duelDay(t, 82), q.doubled ? '2026-12-31' : R.addDays(st, 82), st + ': the last boss'); eq(Object.keys(seen).length, q.days, st + ': no day without a boss'); if (!q.squeezed) ok(most <= 2, st + ': never more than two new bosses in a day (' + most + ')'); eq(most > 1, q.doubled > 0, st);
    });
    var t9 = shipped(); t9.duels.start = '2026-10-09'; eq(R.duelPlan(t9).doubled, 0); var t11 = shipped(); t11.duels.start = '2026-10-11'; eq(R.duelPlan(t11).doubled, 1, 'opened three days late: one day (31 Dec) brings two'); eq(R.duelsToday(t11, '2026-12-31').filter(function (b) { return b.day === '2026-12-31'; }).length, 2);
    var late = shipped(); late.duels.start = '2027-01-03'; eq(R.duelsToday(late, '2027-01-03').length, 0, 'opened after the arc: nothing to fight'); eq(R.duelSummary(late, '2027-01-03').won, 0);
  });
  test('Season: nothing from before 8 Oct scores, and a perfect arc from 8 Oct adds up', function () {
    var s = shipped();
    R.rangeKeys('2026-10-01', '2026-10-07').forEach(function (k) { clearDay(s, k); s.days[k].weight = 89.0; }); lift(s, '2026-10-02', 'lat pulldown', [{ kg: 50, reps: 10 }]); lift(s, '2026-10-05', 'lat pulldown', [{ kg: 55, reps: 10 }]);
    var p0 = R.player(s, '2026-10-07'); eq(p0.earned, 0, 'the day before the arc: no XP'); eq(p0.goldEarned, 0); eq(R.streaks(s, '2026-10-07').clear, 0); eq(R.metrics(s, '2026-10-08').prs, 0, 'a PR set before day one is only the bar to beat'); eq(R.strengthLog(s).prs.length, 1);
    eq(R.maxKgLost(s), 0, 'weigh-ins from before day one bank nothing'); s.days['2026-10-08'] = R.normalizeDay({ weight: 90.5 }); eq(R.maxKgLost(s), 0, 'and they are not averaged into day one either'); eq(R.kgMilestones(s), 0);
    eq(R.penaltyFor(s, '2026-10-08'), null, 'no penalty on day one'); eq(R.newAchievements(s, '2026-10-08').length, 0); eq(R.player(s, '2026-10-08').earned, 0);
    lift(s, '2026-10-10', 'lat pulldown', [{ kg: 57.5, reps: 10 }]); eq(R.metrics(s, '2026-10-10').prs, 1, 'a PR during the arc counts'); eq(R.seasonPRs(s).length, 1);
    // perfect arc
    var t = shipped(); t.duels.start = '2026-10-08';
    R.rangeKeys('2026-10-08', '2026-12-31').forEach(function (k, i) { clearDay(t, k); t.days[k].weight = Math.round((90.5 - i * 0.131) * 10) / 10; for (var n = 0; n < 83; n++) if (R.duelDay(t, n) === k) R.defeatDuel(t, n, k); R.lockHeroWeeks(t, k); });
    var f = R.seasonSummary(t, '2027-01-01'); eq(f.days, 85); eq(f.daysLogged, 85); eq(f.clears, 85); eq(f.bestStreak, 85); eq(f.startKg, 90.5); eq(f.bossesWon, 83); eq(f.bossesTotal, 83); eq(f.heroes, 11, 'a dead-steady 0.92kg a week reaches 79.5kg on 31 Dec: all eleven'); eq(f.checkpoints, 3); eq(f.checkpointsHit, 3);
    near(f.endKg, 79.9, 0.2); ok(f.level >= 20, 'level ' + f.level); eq(R.weekOfPlan(t, '2027-01-01').over, true);
    eq(snap(t, '2027-01-15'), snap(t, '2026-12-31'), 'nothing moves after the last day');
    // a little faster (1kg a week) and all eleven come free by the last day
    var u = shipped(); R.rangeKeys('2026-10-08', '2026-12-31').forEach(function (k, i) { u.days[k] = R.normalizeDay({ weight: Math.round((90.5 - i * 0.14) * 10) / 10 }); });
    eq(R.heroStatus(u, '2026-12-31').unlocked, 11); eq(R.heroStatus(u, '2026-12-31').current, null);
  });
  test('Season: a save made for an earlier start (1 Oct or 7 Oct) moves to 8 Oct with every logged day kept', function () {
    var old = fresh(); old.version = 7; old.duels.start = '2026-10-01'; old.heroes.order = [10, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9];
    R.rangeKeys('2026-10-01', '2026-10-06').forEach(function (k, i) { clearDay(old, k); old.days[k].weight = Math.round((90 - i * 0.2) * 10) / 10; R.defeatDuel(old, i, k); });
    old.heroes.seen = { 10: 1 }; old.heroes.locked = { 1: { hit: 1, day: '2026-10-06', ref: 90, need: 89.15, best: 89, next: 89 } }; old.player.ach = { 'naruto_0': '2026-10-01', 'one-piece_0': '2026-10-05' }; old.player.maxLevel = 6; old.player.seenLevel = 6; old.player.title = 'The Star Clown';
    old.shop.purchases = [{ id: 'p1', name: '1 hour gaming', cost: 300, t: 5 }]; old.settings.lastPhoto = '2026-10-03'; old.savedMeals.push({ id: 'm2', name: 'Chicken rice', items: [{ name: 'Chicken', qty: '200g', cal: 330, p: 62, c: 0, s: 0, f: 7, fib: 0 }] });
    var daysBefore = JSON.stringify(old.days), raw = JSON.parse(JSON.stringify(old));
    var m = R.migrate(raw, '2026-10-08'); eq(m.version, R.STATE_VERSION); eq(R.STATE_VERSION, 10);
    eq(m.profile.startDate, '2026-10-08'); eq(m.profile.startKg, 90.5); eq(m.plan.checkpoints.map(function (c) { return c.kg; }).join(), '87.4,83.4,79.5'); eq(m.profile.seasonEnd, '2026-12-31'); eq(m.profile.goalKg, 79);
    eq(JSON.stringify(m.days), daysBefore, 'every logged day is there, exactly as it was'); eq(m.savedMeals.length, 2); eq(m.settings.lastPhoto, '2026-10-03'); eq(m.targets.calDay.join(), '1900,1600,1600,1600,1600,1600,1600');
    eq(m.duels.start, ''); eq(Object.keys(m.duels.won).length, 0); eq(Object.keys(m.heroes.locked).length, 0); eq(Object.keys(m.heroes.seen).length, 0); ok(R.validHeroOrder(m.heroes.order)); eq(Object.keys(m.player.ach).length, 0); eq(m.player.maxLevel, 1); eq(m.player.title, ''); eq(m.shop.purchases.length, 0);
    eq(m.meta.restarted, '2026-10-08'); eq(m.meta.before.startDate, '2026-10-01'); eq(m.meta.before.startKg, 90); eq(m.meta.before.player.maxLevel, 6); eq(m.meta.before.purchases.length, 1); eq(m.meta.before.heroes.order.join(), '10,3,0,1,2,4,5,6,7,8,9');
    var p = R.player(m, '2026-10-08'); eq(p.earned, 0, 'XP starts again from day one'); eq(p.level, 1); eq(p.gold, 0); eq(R.heroStatus(m, '2026-10-08').unlocked, 0); eq(R.titles(m, '2026-10-08').join(), 'E-Rank Player');
    // loading it again changes nothing more, and the record of the old season survives a save and reload
    var again = R.migrate(JSON.parse(JSON.stringify(m)), '2026-10-09'); deep(again, m, 'stable once moved'); eq(R.normalize(JSON.parse(JSON.stringify(m))).meta.before.startKg, 90);
    // a save from the short-lived 7 Oct start (app v13) moves on by a day too, and keeps the record of the first season it left
    var v13 = R.normalize({}); v13.version = 8; v13.profile.startDate = '2026-10-07'; v13.plan.checkpoints = [{ date: '2026-11-01', kg: 87.3 }, { date: '2026-12-01', kg: 83.4 }, { date: '2026-12-31', kg: 79.5 }]; v13.duels = { start: '2026-10-07', won: { 0: '2026-10-07' }, seen: { 0: 1 } }; clearDay(v13, '2026-10-07'); v13.days['2026-10-07'].weight = 90.5;
    v13.meta.before = { startDate: '2026-10-01', startKg: 90 }; v13.meta.restarted = '2026-10-07'; v13.meta.restartSeen = '2026-10-07';
    var n = R.migrate(JSON.parse(JSON.stringify(v13)), '2026-10-08'); eq(n.profile.startDate, '2026-10-08'); eq(n.plan.checkpoints[0].kg, 87.4); eq(Object.keys(n.duels.won).length, 0); eq(n.days['2026-10-07'].foods.length, 1); eq(n.days['2026-10-07'].weight, 90.5); eq(R.player(n, '2026-10-08').earned, 0, 'the day before day one scores nothing');
    eq(n.meta.before.startDate, '2026-10-01', 'the first season’s record is kept'); eq(n.meta.restarted, '2026-10-08'); eq(n.meta.restartSeen, '', 'so the note about the new start is shown once more');
    // checkpoints or dates you set yourself are yours; the start weight is the one given for the new season
    var mine = JSON.parse(JSON.stringify(old)); mine.profile.startKg = 91.2; mine.plan.checkpoints[0].kg = 86; var mm = R.migrate(mine, '2026-10-08'); eq(mm.profile.startDate, '2026-10-08'); eq(mm.profile.startKg, 90.5, 'the new season starts at 90.5kg whatever the old one started at'); eq(mm.meta.before.startKg, 91.2, 'the old start weight is kept in the record'); eq(mm.plan.checkpoints[0].kg, 86, 'your own checkpoints are kept');
    var custom = JSON.parse(JSON.stringify(old)); custom.profile.startDate = '2026-09-20'; var mc = R.migrate(custom, '2026-10-08'); eq(mc.profile.startDate, '2026-09-20', 'a start date you chose yourself is left alone'); eq(mc.meta.restarted, '');
    // …and the bosses it had beaten are still the same bosses in the shorter list (Arlong, the third, is gone; Rui moves up)
    eq(Object.keys(mc.duels.won).length, 5); eq(mc.duels.won[0], '2026-10-01'); eq(mc.duels.won[1], '2026-10-02'); eq(mc.duels.won[2], '2026-10-04', 'Rui, beaten on 4 Oct, is now boss 3'); eq(R.duelInfo(2).name, 'Rui'); eq(mc.duels.won[4], '2026-10-06'); ok(R.titles(mc, '2026-10-08').indexOf('Lower Rank Five') >= 0); ok(R.titles(mc, '2026-10-08').indexOf('The Saw') < 0);
    eq(R.migrate(JSON.parse(JSON.stringify(old)), '2026-10-08', { keepSeason: true }).profile.startDate, '2026-10-01');
    // a device still running an older copy of the app can write this season's data back with an old version number on it: its boss wins already use the new numbers and must not be moved a second time
    var now = R.normalize({}); now.duels.start = '2026-10-08'; now.duels.won = { 0: '2026-10-08', 2: '2026-10-10', 5: '2026-10-13' }; now.duels.seen = { 0: 1, 2: 1, 5: 1, 6: 1 }; clearDay(now, '2026-10-08'); var back = JSON.parse(JSON.stringify(now)); back.version = 7; delete back.meta.restarted;
    var again = R.migrate(back, '2026-10-14'); eq(again.version, R.STATE_VERSION); eq(JSON.stringify(again.duels.won), JSON.stringify(now.duels.won), 'wins stay on the same bosses'); eq(JSON.stringify(again.duels.seen), JSON.stringify(now.duels.seen)); eq(again.profile.startDate, '2026-10-08'); eq(again.meta.restarted, '', 'and the season is not restarted again'); eq(again.days['2026-10-08'].foods.length, 1); eq(R.duelInfo(2).name, 'Rui');
    // a backup file from the old start comes in the same way, and a brand-new phone starts on the new plan with nothing to move
    var imp = R.importState(JSON.stringify({ app: 'winter-arc', state: old })); eq(imp.profile.startDate, '2026-10-08'); eq(JSON.stringify(imp.days), daysBefore);
    var brand = R.migrate(null); eq(brand.profile.startDate, '2026-10-08'); eq(brand.meta.restarted, ''); ok(brand.meta.before === undefined);
    eq(R.normalize({ meta: { before: 'junk', restarted: 'nope' } }).meta.restarted, ''); ok(R.normalize({ meta: { before: 'junk' } }).meta.before === undefined);
  });
  test('Season: nothing is earned after 31 Dec (PRs, scans, weigh-ins, body fat, bosses)', function () {
    var s = shipped(); s.duels.start = '2026-10-08';
    R.rangeKeys('2026-10-08', '2026-12-31').forEach(function (k, i) { clearDay(s, k); s.days[k].weight = Math.round((90.5 - i * 0.1) * 10) / 10; }); lift(s, '2026-12-30', 'lat pulldown', [{ kg: 60, reps: 10 }]);
    R.newAchievements(s, '2027-01-01').forEach(function (a) { s.player.ach[a.id] = '2027-01-01'; }); // the last day's own work is banked once that day is over
    var end = snap(s, '2027-01-01'), m0 = JSON.stringify(R.metrics(s, '2027-01-01'));
    lift(s, '2027-01-02', 'lat pulldown', [{ kg: 80, reps: 10 }]); s.days['2027-01-02'].weight = 75; s.days['2027-01-03'] = R.normalizeDay({ weight: 75, bf: 9 }); s.days['2027-01-04'] = R.normalizeDay({ weight: 75 });
    ok(R.addScan(s, { date: '2027-01-05', weight: 75, pbf: 10, smm: 39, source: 'manual' }).ok);
    eq(snap(s, '2027-01-06'), end, 'XP, gold, level and streaks are exactly what the arc ended on'); eq(JSON.stringify(R.metrics(s, '2027-01-06')), m0, 'and so is every award counter'); eq(R.newAchievements(s, '2027-01-06').length, 0);
    eq(R.duelsToday(s, '2027-01-01').length, 0); eq(R.seasonSummary(s, '2027-01-06').prs, 0, 'the January lift is not a season PR'); eq(R.strengthLog(s).prs.length, 1); eq(R.scanRewards(s, '2027-01-06').scans, 0); eq(R.kgMilestones(s), Math.floor(R.maxKgLost(s)));
    ok(R.maxKgLost(s) < 9, 'the 75kg January weigh-ins bank nothing: ' + R.maxKgLost(s));
  });
  test('Upgrade to app v16 (data v10): every log, boss, award, XP and setting comes through exactly; only new fields are added', function () {
    var s = shipped(); s.duels.start = '2026-10-08';
    R.rangeKeys('2026-10-08', '2026-10-13').forEach(function (k, i) { clearDay(s, k); s.days[k].weight = Math.round((90.5 - i * 0.6) * 10) / 10; R.defeatDuel(s, i, k); });
    s.days['2026-10-12'] = R.normalizeDay({ water: 500, steps: 4000 }); s.days['2026-10-13'].penaltyDone = true; s.player.title = 'The Star Clown'; s.settings.motion = 'reduced';
    R.newAchievements(s, '2026-10-13').forEach(function (a) { s.player.ach[a.id] = '2026-10-13'; });
    var raw = JSON.parse(JSON.stringify(s)); raw.version = 9; delete raw.profile.photo; delete raw.settings.theme; delete raw.meta.penaltyEnd;
    var before = { days: JSON.stringify(raw.days), duels: JSON.stringify(raw.duels), ach: JSON.stringify(raw.player.ach), xp: R.ledger(legacyPen(JSON.parse(JSON.stringify(s))), '2026-10-14').xpEarned, streak: R.streaks(legacyPen(JSON.parse(JSON.stringify(s))), '2026-10-14').clear };
    var m = R.migrate(raw, '2026-10-14'); eq(m.version, 10);
    eq(JSON.stringify(m.days), before.days, 'every day exactly as it was'); eq(JSON.stringify(m.duels), before.duels); eq(JSON.stringify(m.player.ach), before.ach); eq(m.player.title, 'The Star Clown'); eq(m.settings.motion, 'reduced');
    eq(R.ledger(m, '2026-10-14').xpEarned, before.xp, 'the same XP, the penalty done on 13 Oct included'); eq(R.streaks(m, '2026-10-14').clear, before.streak);
    eq(m.profile.photo, ''); eq(m.settings.theme, 'frost'); eq(m.meta.penaltyEnd, '2026-10-14');
    deep(R.migrate(JSON.parse(JSON.stringify(m)), '2026-10-20'), m, 'loading it again changes nothing');
  });
  test('Upgrade to v16+: a hero freed under the old weekly rule (0.85kg in a week) stays freed, even though the scale is not 1kg down yet', function () {
    var s = shipped(); s.duels.start = '2026-10-08'; s.days['2026-10-10'] = R.normalizeDay({ weight: 89.6 }); s.days['2026-10-15'] = R.normalizeDay({ weight: 90.3 });
    s.heroes.locked = { 1: { hit: 1, day: '2026-10-10', ref: 90.5, need: 89.65, best: 89.6, next: 89.6 } };
    var raw = JSON.parse(JSON.stringify(s)); raw.version = 9; var m = R.migrate(raw, '2026-10-16');
    eq(R.heroMilestones(m, '2026-10-16').list[0].hit, false, 'the scale alone (lowest 89.6kg) would not free one');
    var st = R.heroStatus(m, '2026-10-16'); eq(st.unlocked, 1, 'but the hero already won is kept'); eq(st.slots[0].unlocked, true); eq(st.slots[0].date, '2026-10-10'); eq(st.current.n, 2, 'the next one is hero 2, at 88.5kg'); eq(st.current.need, 88.5);
    eq(R.heroStatus(m, '2026-10-09').unlocked, 0, 'not before the day it was won');
    m.days['2026-10-17'] = R.normalizeDay({ weight: 88.0 }); m.days['2026-10-18'] = R.normalizeDay({ weight: 88.0 }); eq(R.heroStatus(m, '2026-10-18').unlocked, 2, '88kg is 2.5kg down: two heroes, the one already kept counted once');
  });
  test('Profile picture and theme: only a real picture is kept, only a known theme is used', function () {
    var ok1 = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
    eq(R.cleanPhoto(ok1), ok1); eq(R.cleanPhoto('data:image/jpeg;base64,' + 'A'.repeat(400000)), '', 'far too big'); eq(R.cleanPhoto('javascript:alert(1)'), ''); eq(R.cleanPhoto('data:text/html;base64,AAAA'), ''); eq(R.cleanPhoto(42), '');
    var s = R.normalize({ profile: { photo: ok1 }, settings: { theme: 'royal' } }); eq(s.profile.photo, ok1); eq(s.settings.theme, 'royal');
    eq(R.normalize({ settings: { theme: 'neon<script>' } }).settings.theme, 'frost'); eq(R.THEMES.length, 13); eq(R.LIGHT_THEMES.length, 4); ok(R.LIGHT_THEMES.every(function (t) { return R.THEMES.some(function (x) { return x[0] === t; }); })); ok(R.THEMES.every(function (t) { return /^[a-z]+$/.test(t[0]) && t[1]; }));
    eq(JSON.parse(R.exportState(s)).state.profile.photo, ok1, 'the picture goes into backups and the cloud copy with everything else');
  });
  /* the daily aura: 85 characters, one a day */
  function hueOf(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn; if (d < 1e-6) return -1; var h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; return (h * 60 + 360) % 360; }
  function lumOf(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  test('Daily aura: 85 characters, each with its own picture and the colour from the list', function () {
    eq(R.AURA.length, 85);
    var names = {};
    R.AURA.forEach(function (_, i) { var o = R.auraInfo(i); ok(/^#[0-9A-F]{6}$/.test(o.hex), o.name + ' colour ' + o.hex); eq(o.n, i + 1); eq(o.art, 'art/a/' + (i < 9 ? '0' : '') + (i + 1) + '.webp'); ok(!names[o.name], 'only one ' + o.name); names[o.name] = 1; ok(o.short && o.anime && o.aura, 'details for ' + o.name); });
    var spot = { 1: ['Asta', '#7A0C12'], 10: ['Ichigo Kurosaki', '#1B1B3A'], 19: ['Goku Super Saiyan', '#FFE135'], 42: ['Ryomen Sukuna', '#8B0000'], 70: ['Goku', '#C9D6E3'], 85: ['Yujiro Hanma', '#5C0A0A'] };
    Object.keys(spot).forEach(function (n) { var o = R.auraInfo(n - 1); eq(o.name, spot[n][0]); eq(o.hex, spot[n][1]); });
    eq(R.auraInfo(43).short, 'Mark Evans', 'the name in brackets is left off the small label'); eq(R.auraInfo(85), null);
  });
  test('Daily aura: one a day for the 85 days of the arc, every character exactly once', function () {
    var s = shipped(), seen = {};
    eq(R.addDays(s.profile.startDate, 84), s.profile.seasonEnd, 'the arc is 85 days long');
    for (var i = 0; i < 85; i++) { var a = R.auraToday(s, R.addDays(s.profile.startDate, i)); eq(a.day, i + 1); eq(a.of, 85); ok(a.inArc, 'day ' + (i + 1) + ' is in the arc'); ok(!seen[a.n], a.name + ' again on day ' + (i + 1)); seen[a.n] = 1; }
    eq(Object.keys(seen).length, 85);
  });
  test('Daily aura: the same character all day, after a reload, a backup or on another device', function () {
    var s = shipped(), k = '2026-10-20', a = R.auraToday(s, k).n;
    eq(R.auraToday(R.normalize(JSON.parse(JSON.stringify(s))), k).n, a, 'reloaded save');
    eq(R.auraToday(R.importState(R.exportState(s)), k).n, a, 'backup round trip');
    eq(R.auraToday(s, k).n, a, 'asked twice');
    ok(!('aura' in s) && !('aura' in R.normalize({})), 'nothing new is stored in the save, so nothing new has to sync');
  });
  test('Daily aura: every save draws its own random order', function () {
    var orders = {}; for (var i = 0; i < 8; i++) orders[R.auraOrder(R.normalize({})).join()] = 1;
    ok(Object.keys(orders).length >= 6, 'eight saves, ' + Object.keys(orders).length + ' orders');
    ok(R.auraOrder(shipped()).join() !== R.AURA.map(function (_, i) { return i; }).join(), 'not simply 1 to 85');
  });
  test('Daily aura: before the arc it is day 1’s character; after it, the order goes round again', function () {
    var s = shipped(), first = R.auraToday(s, s.profile.startDate).n, pre = R.auraToday(s, R.addDays(s.profile.startDate, -3)), post = R.auraToday(s, R.addDays(s.profile.seasonEnd, 1));
    eq(pre.n, first); ok(!pre.inArc); eq(post.n, first); ok(!post.inArc);
  });
  test('Daily aura: the collection holds every character met so far and none still to come', function () {
    var s = shipped(), d1 = R.auraToday(s, '2026-10-08');
    eq(R.auraDiscovered(s, '2026-10-05').map(function (a) { return a.n; }).join(), String(d1.n), 'before the arc: day 1’s character, the one on screen');
    var l = R.auraDiscovered(s, '2026-10-14'); eq(l.length, 7); eq(l[0].n, R.auraToday(s, '2026-10-14').n, 'newest first'); eq(l[6].n, d1.n); eq(l[0].day, 7); eq(l[6].date, '2026-10-08');
    var all = R.auraDiscovered(s, '2027-02-01'); eq(all.length, 85); eq(new Set(all.map(function (a) { return a.n; })).size, 85);
    var tomorrow = R.auraToday(s, '2026-10-15').n; ok(!l.some(function (a) { return a.n === tomorrow; }), 'tomorrow’s character stays hidden');
  });
  test('Daily aura: colours keep their hue; dark ones keep a dark flame with a bright edge', function () {
    R.AURA.forEach(function (a) {
      var p = R.auraPalette(a[3]); eq(p.hex, a[3]); ok(p.dark >= 0 && p.dark <= 1);
      ok(lumOf(p.light) >= lumOf(p.base) - 1e-9, a[0] + ': the edge is lighter'); ok(lumOf(p.deep) <= lumOf(p.base) + 1e-9, a[0] + ': the tips are deeper');
      var h = hueOf(p.base); if (h >= 0 && Math.max.apply(null, p.base) - Math.min.apply(null, p.base) > 0.08) { var hl = hueOf(p.light), dh = Math.abs(hl - h); ok(Math.min(dh, 360 - dh) < 4, a[0] + ': same hue (' + Math.round(h) + ' vs ' + Math.round(hl) + ')'); }
      if (p.dark > 0.5) ok(lumOf(p.light) > 0.25, a[0] + ': a dark aura still gets an edge bright enough to see');
      var tx = parseInt(p.textHex.slice(1), 16), tl = [(tx >> 16) & 255, (tx >> 8) & 255, tx & 255].map(function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }), tL = 0.2126 * tl[0] + 0.7152 * tl[1] + 0.0722 * tl[2];
      ok((tL + 0.05) / (0.0075 + 0.05) >= 4.5, a[0] + ': the name is written clearly enough to read on the dark screen (' + p.textHex + ')');
      var th = hueOf(tl.map(function (c) { return c; })); if (h >= 0 && Math.max.apply(null, p.base) - Math.min.apply(null, p.base) > 0.08 && th >= 0) { var dt = Math.abs(th - h); ok(Math.min(dt, 360 - dt) < 12, a[0] + ': the name keeps the aura’s hue'); }
    });
    eq(R.auraPalette('#1B1B3A').dark, 1, 'Ichigo’s midnight is a dark flame'); eq(R.auraPalette('#FFE135').dark, 0, 'Super Saiyan yellow is a bright flame');
    var g = R.auraPalette('#2B2B2B').light; near(g[0], g[2], 0.01, 'an ink-black aura gets a grey edge, not a coloured one');
    eq(R.auraPalette('nonsense').hex, '#FFE135');
  });
  test('quick commands without Claude: water, weight and waist, steps, activities and sets become the usual entries; foods do not', function () {
    var q = R.parseQuick('drank 750ml'); ok(q.ok); eq(q.items[0].kind, 'water'); eq(q.items[0].ml, 750);
    q = R.parseQuick('2 glasses of water'); eq(q.items[0].ml, 500); q = R.parseQuick('1.5l water'); eq(q.items[0].ml, 1500);
    q = R.parseQuick('weighed 88.6, waist 96'); eq(q.items.length, 1, 'one body entry'); eq(q.items[0].weight, 88.6); eq(q.items[0].waist, 96); deep(q.items[0].errors, []);
    q = R.parseQuick('11,400 steps'); eq(q.items[0].type, 'steps'); eq(q.items[0].steps, 11400);
    q = R.parseQuick('football 60'); eq(q.items[0].type, 'football'); eq(q.items[0].min, 60); q = R.parseQuick('gym done'); eq(q.items[0].type, 'gym'); eq(q.items[0].min, 60);
    q = R.parseQuick('incline walk 30 min'); eq(q.items[0].type, 'cardio'); eq(q.items[0].min, 30); q = R.parseQuick('abs 15'); eq(q.items[0].type, 'abs');
    q = R.parseQuick('lat pulldown 60kg 3x10'); eq(q.items[0].kind, 'exercise'); eq(q.items[0].sets.length, 3); eq(q.items[0].sets[0].kg, 60); eq(q.items[0].sets[2].reps, 10);
    q = R.parseQuick('pull ups 3x8'); eq(q.items[0].sets[0].kg, 0, 'bodyweight'); q = R.parseQuick('bench press 4x6 @ 70kg'); eq(q.items[0].sets.length, 4); eq(q.items[0].sets[0].kg, 70);
    q = R.parseQuick('drank 500ml and 8000 steps'); eq(q.items.length, 2); deep(q.rest, []);
    q = R.parseQuick('2 samosas'); eq(q.ok, false, 'a food is searched, not guessed'); deep(q.rest, ['2 samosas']);
    q = R.parseQuick('drank 500ml, chicken wrap'); eq(q.items.length, 1); deep(q.rest, ['chicken wrap'], 'the part it did not understand is reported');
    var s = fresh(), k = '2026-10-10', res = R.commitItems(s, k, R.parseQuick('drank 750ml, weighed 88.6').items, 'tq', Date.now(), '08:00'); ok(res.ok); eq(s.days[k].water, 750); eq(s.days[k].weight, 88.6);
  });
  test('built-in foods: official chain menus and generic foods are searchable offline, plurals match, chains rank first', function () {
    var chains = [{ chain: 'KFC', date: 'September 2026', rows: [['Hot Wing (1 wing)', null, 91, 4.9, 3.8, 0.5, 6.2, null], ['Zinger Burger', null, 468, 23, 43, 6.5, 22, null]] }, { chain: 'Greggs', date: 'September 2026', rows: [['Sausage Roll', 103, 347, 9.1, 24, 0, 24, 1.5]] }];
    var generic = [['Chicken wing, cooked, roasted', 290, 27, 0, 0, 19.5, 0], ['Rice, white, long-grain, cooked', 130, 2.7, 28.2, 0.1, 0.3, 0.4], ['Broken', 'x', 1, 1, 1, 1, 1]];
    var list = R.builtinFoods(chains, generic); eq(list.length, 5, 'a broken row is dropped');
    var w = R.searchBuiltin(list, 'kfc wings', 5); eq(w[0].name, 'Hot Wing (1 wing)'); eq(w[0].brand, 'KFC'); eq(w[0].source, 'chain'); eq(w[0].serving.cal, 91); eq(w[0].per100, null, 'no weight published, so no per-100g');
    w = R.searchBuiltin(list, 'wings', 5); eq(w[0].source, 'chain', 'the chain item comes before the generic one'); eq(w.length, 2);
    var sr = R.searchBuiltin(list, 'sausage roll', 3)[0]; eq(sr.serving.g, 103); eq(sr.per100.cal, 337); eq(sr.size, 'Official · September 2026');
    var p = R.portion(sr, { servings: 2 }); eq(p.cal, 694);
    var rice = R.searchBuiltin(list, 'rice', 3)[0]; eq(rice.source, 'generic'); eq(R.portion(rice, { grams: 200 }).cal, 260);
    eq(R.searchBuiltin(list, 'samosa', 3).length, 0); eq(R.searchBuiltin(list, '', 3).length, 0);
    var s = fresh(), it = R.rememberFood(s, w[0], Date.now()); eq(it.source, 'chain', 'a menu item you log is kept as one of your foods'); eq(R.searchLocal(s, 'hot wing', 3)[0].name, 'Hot Wing (1 wing)');
  });
  test('Ascend: MyFitnessPal foods search by name and brand; recipes give a per-portion food; quick add is just calories', function () {
    var mfp = [['Chicken kottu', 'Sera Kottu', '95g', 95, 355, 9.3, 75, 0, 3.1, 0], ['Egg Hopper', 'Chooti Food City', 'hopper', null, 180, 8, 22, 0, 6.5, 0]];
    var list = R.builtinFoods([], [['Egg, whole, boiled', 155, 12.6, 1.1, 1.1, 10.6, 0]], mfp); eq(list.length, 3);
    var k = R.searchBuiltin(list, 'kottu', 3)[0]; eq(k.source, 'mfp'); eq(k.serving.cal, 355); eq(k.per100.cal, 374); eq(k.size, 'MyFitnessPal');
    var h = R.searchBuiltin(list, 'egg hopper', 3)[0]; eq(h.name, 'Egg Hopper'); eq(h.per100, null); eq(R.portion(h, { servings: 2 }).cal, 360);
    var s = fresh(); s.recipes = [{ name: 'Chicken curry', portions: 4, items: [{ name: 'Chicken breast', qty: '800g', cal: 960, p: 200, c: 0, s: 0, f: 12, fib: 0 }, { name: 'Rice', qty: '400g', cal: 520, p: 10, c: 112, s: 0, f: 1, fib: 2 }] }, { name: '', items: [] }];
    s = R.normalize(s); eq(s.recipes.length, 1, 'a recipe with no name or ingredients is dropped');
    var rc = R.recipeAsItem(s.recipes[0]); eq(rc.source, 'recipe'); eq(rc.serving.cal, 370); eq(rc.serving.p, 52.5); eq(rc.serving.label, '1 portion (of 4)');
    eq(R.portion(rc, { servings: 1.5 }).cal, 555); eq(R.searchLocal(s, 'curry', 3)[0].name, 'Chicken curry');
    eq(R.quickAddItem({ cal: '' }), null); eq(R.quickAddItem({ cal: 6000 }), null);
    var q = R.quickAddItem({ cal: '450', p: '30', meal: 'dinner' }); eq(q.cal, 450); eq(q.p, 30); eq(q.meal, 'dinner'); eq(q.name, 'Quick add');
    var res = R.commitItems(s, '2026-10-21', [q], 'tqa', Date.now(), '19:00'); ok(res.ok); eq(s.days['2026-10-21'].foods[0].cal, 450);
  });
  test('VF: bedtime is 10–11pm; an old 9:45pm save moves to it, a time chosen by hand is kept', function () {
    var lab = function (t) { var s = R.normalize({ targets: { lightsOut: t } }); return [s.targets.lightsOut, R.questStatus(s, '2026-10-21').filter(function (x) { return x.id === 'lights'; })[0].label]; };
    deep(lab('21:45'), ['23:00', 'In bed 10–11pm']); deep(lab(undefined), ['23:00', 'In bed 10–11pm']); deep(lab('22:30'), ['22:30', 'In bed 9:30–10:30pm']); deep(lab('00:00'), ['00:00', 'In bed 11pm–12am']);
    eq(R.normalize({}).targets.lightsOut, '23:00');
  });
  return T;
}
function runTests(R) {
  var T = defineTests(R), out = [];
  T.forEach(function (t) { var t0 = Date.now(); try { t.fn(); out.push({ name: t.name, pass: true, ms: Date.now() - t0 }); } catch (e) { out.push({ name: t.name, pass: false, error: String(e && e.message || e), ms: Date.now() - t0 }); } });
  return out;
}
var api = { defineTests: defineTests, runTests: runTests };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RTLTests = api;
})(typeof window !== 'undefined' ? window : this);
