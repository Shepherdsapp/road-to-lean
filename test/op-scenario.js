// builds a save like Pavi's (season from 8 Oct, weigh-ins, some bosses beaten, some missed) and starts OPERATION 79.9 on it
const R = require('../src/core.js');
function make() {
  const s = R.normalize({}); s.duels.start = '2026-10-08';
  let kg = 90.5;
  R.rangeKeys('2026-10-08', '2026-11-12').forEach((k, i) => {
    const d = s.days[k] = R.emptyDay(); kg -= 0.11; if (i % 2 === 0) d.weight = Math.round(kg * 10) / 10;
    d.foods.push(R.normalizeDay({ foods: [{ name: 'Meal', meal: 'lunch', cal: 1600, p: 160, c: 130, s: 10, f: 45, fib: 28 }] }).foods[0]);
    d.steps = 11000; d.water = 3000; d.lightsOut = true;
    if (i % 3 !== 2) s.duels.won[i] = k; // two in three bosses beaten, the rest escaped
  });
  s.days['2026-11-12'].weight = 86.5;
  return s;
}
module.exports = { make };
if (require.main === module) {
  const s = make(), before = JSON.stringify(s.days), xp0 = R.player(s, '2026-11-12').xp, h0 = R.heroStatus(s, '2026-11-13').unlocked, won0 = Object.keys(s.duels.won).length;
  R.housekeeping && 0; R.freezeDays(s, '2026-11-13');
  const xpA = R.player(s, '2026-11-12').xp;
  console.log('ensureOp:', R.ensureOp(s, '2026-11-13'), 'again:', R.ensureOp(s, '2026-11-13'));
  const s2 = R.normalize(JSON.parse(JSON.stringify(s)));
  console.log('survives save/load:', JSON.stringify(s2.op), Object.keys(s2.duels.op.sched).length, 'bosses rescheduled,', Object.keys(s2.duels.op.hard).length, 'returned harder');
  console.log('XP before/after for the days already played:', xp0, xpA, R.player(s2, '2026-11-12').xp);
  console.log('heroes freed before/after:', h0, R.heroStatus(s2, '2026-11-13').unlocked, 'new weights:', s2.heroes.op.needs.join(', '));
  console.log('bosses won before/after:', won0, R.duelSummary(s2, '2026-11-13'));
  const perDay = {}; Object.values(s2.duels.op.sched).forEach(d => perDay[d] = (perDay[d] || 0) + 1);
  console.log('boss days:', Object.keys(perDay).length, 'two-a-day days:', Object.values(perDay).filter(n => n === 2).length, 'max a day:', Math.max(...Object.values(perDay)), 'in Iceland:', Object.keys(perDay).filter(R.isIceland).length, 'first/last:', Object.keys(perDay).sort()[0], Object.keys(perDay).sort().pop());
  const hard = +Object.keys(s2.duels.op.hard)[0]; console.log('returned boss:', R.duelInfo(hard, s2).name, '|', R.duelInfo(hard, s2).taskText, '| was:', R.duelInfo(hard).taskText);
  console.log('today bosses:', R.duelsToday(s2, '2026-11-13').map(b => b.name + (b.returned ? ' (returned)' : '')).join(', '));
  ['2026-11-13', '2026-11-15', '2026-11-18', '2026-12-08', '2026-12-10', '2026-12-14', '2026-12-21', '2026-12-25', '2026-12-31'].forEach(k => console.log(k, R.fmtDate(k), R.opMode(s2, k).padEnd(7), R.dayType(s2, k).padEnd(8), 'kcal', R.calTarget(s2, k), 'steps', R.stepsTarget(s2, k), '|', R.questStatus(s2, k).map(q => q.id + (q.done ? '✓' : '')).join(' '), '|', (R.sessionFor(s2, k) || {}).name || ''));
  // a perfect gym day
  const k = '2026-11-14', d = s2.days[k] = R.emptyDay();
  R.commitItems(s2, k, [{ kind: 'food', meal: 'breakfast', name: 'Fat-free Greek yogurt', qty: '250g', cal: 143, p: 25, c: 9, s: 9, f: 0.5, fib: 0 }, { kind: 'food', meal: 'breakfast', name: 'Whey isolate', qty: '65g', cal: 234, p: 47, c: 2, s: 1, f: 1, fib: 0 }, { kind: 'food', meal: 'dinner', name: 'Chicken and rice', qty: '1', cal: 950, p: 85, c: 90, s: 5, f: 20, fib: 10 }, { kind: 'food', meal: 'snack', name: 'Mutton roll', qty: '1', cal: 120, p: 5, c: 12, s: 1, f: 6, fib: 1 },
    { kind: 'activity', type: 'gym', min: 60, lvl: 'high' }, { kind: 'activity', type: 'incline', min: 25 }, { kind: 'activity', type: 'steps', steps: 13200 }, { kind: 'body', weight: 86.1 }], 't1', Date.parse('2026-11-14T09:00:00Z'), '09:00');
  s2.days[k].lightsOut = true;
  console.log('14 Nov:', R.questStatus(s2, k).map(q => q.id + (q.done ? '✓' : '✗') + ' [' + q.label + ']').join('\n        '));
  s2.days[k].foods[3].tr = 1; console.log('  mutton roll marked as the treat → clear:', R.isClear(s2, k), '| burn', JSON.stringify(R.energyBreakdown(s2, s2.days[k])));
  console.log('tracker:', JSON.stringify(R.opTracker(s2, '2026-11-15'), (key, v) => key === 'checkpoints' ? undefined : v));
  console.log('bank:', JSON.stringify(R.opBank(s2, '2026-11-15'), (key, v) => key === 'days' ? undefined : v));
  console.log('week:', JSON.stringify(R.opWeek(s2, '2026-11-15')));
  console.log('missing 13th:', R.opMissing(s2, '2026-11-13').join(' · '));
  console.log('football 90 min high:', Math.round(R.footballKcal(s2, { activities: [{ type: 'football', min: 90, int: 'high' }] })), '10 min medium:', Math.round(R.footballKcal(s2, { activities: [{ type: 'football', min: 10 }] })));
  console.log('verse 13 Nov / 31 Dec:', R.opVerse('2026-11-13').ref, '/', R.opVerse('2026-12-31').ref, '| verses:', R.OP_VERSES.length, 'unique:', new Set(R.OP_VERSES.map(v => v[0])).size);
  s2.days['2026-11-20'] = R.emptyDay(); s2.days['2026-11-20'].weight = 85.4; console.log('behind on 20 Nov →', JSON.stringify(R.opBoost(s2, '2026-11-23')), 'steps Mon 23rd', R.stepsTarget(s2, '2026-11-23'), 'walk', R.opWalkNeed(s2, '2026-11-23'), '| tracker', R.opTracker(s2, '2026-11-20').state, R.opTracker(s2, '2026-11-20').diff);
  s2.days['2026-12-31'] = R.emptyDay(); s2.days['2026-12-31'].weight = 79.8; console.log('finish:', JSON.stringify(R.opFinish(s2, '2026-12-31')));
  s2.days['2026-11-24'] = R.emptyDay(); s2.days['2026-11-24'].weight = 83.6; console.log('heroes after 83.6kg:', R.heroStatus(s2, '2026-11-24').unlocked, 'next needs', R.heroStatus(s2, '2026-11-24').current.need);
}
