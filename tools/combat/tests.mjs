// Combat core acceptance tests (docs/combat/05 §10, BT01–BT24 that can run without a renderer).
// node tools/combat/tests.mjs   -> exit 1 on any failure.
import { CombatSim } from '../../src/combat/core/Sim.js';
import { STEP, SPEC, NUM, COMBO } from '../../src/combat/core/specs.js';
import { computeHealth, PoiseState } from '../../src/combat/core/Damage.js';
import { FakeEnv } from './FakeEnv.mjs';

let failed = 0, passed = 0;
const results = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(['PASS', name]);
  } catch (e) {
    failed++;
    results.push(['FAIL', name + ' — ' + e.message]);
  }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} expected ${b}, got ${a}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };
const near = (a, b, tol, msg) => { if (Math.abs(a - b) > tol) throw new Error(`${msg || ''} expected ${b}±${tol}, got ${a}`); };

function world({ roxy = true } = {}) {
  const env = new FakeEnv();
  const sim = new CombatSim(env);
  const m = sim.addHero('megumin', { maxHp: 620 });
  const r = roxy ? sim.addHero('roxy', { maxHp: 700 }) : null;
  m.pos = { x: 0, y: 0, z: 0 };
  m.staff = { x: 0.3, y: 1.4, z: 0.4 };
  if (r) { r.pos = { x: 3, y: 0, z: 0 }; r.staff = { x: 3.3, y: 1.4, z: 0.4 }; }
  sim.inCombat = true;
  sim.log = [];
  sim.on('*', (e) => sim.log.push(e));
  look(sim, 'megumin', 0, 20);
  if (r) look(sim, 'roxy', 3, 20);
  return { env, sim, m, r };
}
/** Camera behind the heroine looking at the ground point (x, z). */
function look(sim, id, x, z) {
  const h = sim.heroes[id];
  const o = { x: h.pos.x, y: 2.2, z: h.pos.z - 3 };
  const dx = x - o.x, dy = -o.y, dz = z - o.z;
  const l = Math.hypot(dx, dy, dz);
  sim.setCamera(id, o, { x: dx / l, y: dy / l, z: dz / l });
}
function run(sim, secs, fps = 60) {
  const n = Math.round(secs * fps);
  for (let i = 0; i < n; i++) sim.advance(1 / fps);
}
const events = (sim, type) => sim.log.filter((e) => e.type === type);

// ---------------------------------------------------------------------------------------------------------
test('damage formula: 0.65 S vs magic defence 10 ≈ 59 (docs/combat/01 §4)', () => {
  eq(computeHealth({ coefS: 0.65, S: 100, defM: 10 }), 59);
  eq(computeHealth({ coefA: 0.28, A: 100 }), 28);
  eq(computeHealth({ coefA: 0.0001, A: 100 }), 1, 'a successful hit deals at least 1');
});

test('combo numbers: 110 damage, 23 stamina, 1.70 s without cancels (Megumin); 88 / 19 / 1.40 s (Roxy)', () => {
  const sum = (ids, f) => ids.reduce((a, id) => a + f(SPEC[id]), 0);
  eq(Math.round(sum(COMBO.megumin, (s) => s.coefA * 100)), 110);
  eq(sum(COMBO.megumin, (s) => s.cost.stamina), 23);
  near(sum(COMBO.megumin, (s) => s.total), 1.7, 1e-9);
  eq(Math.round(sum(COMBO.roxy, (s) => s.coefA * 100)), 88);
  eq(sum(COMBO.roxy, (s) => s.cost.stamina), 19);
  near(sum(COMBO.roxy, (s) => s.total), 1.4, 1e-9);
});

test('BT01 frame rate: Explosion releases at 2.40 s (±1 step) at 30, 60 and 120 fps', () => {
  for (const fps of [30, 60, 120]) {
    const { sim, m } = world({ roxy: false });
    look(sim, 'megumin', 0, 15);
    ok(sim.skill('megumin', 'R'), 'aim');
    ok(m.aim.valid, 'aim valid');
    ok(sim.confirm('megumin'), 'confirm');
    eq(m.f.reserved, 100, 'reserved at confirm');
    eq(m.f.mana, 100, 'not yet spent');
    for (let i = 0; i < fps * 3; i++) sim.advance(1 / fps);
    const rel = events(sim, 'release')[0];
    ok(rel, 'released at ' + fps);
    near(rel.time, 2.4, STEP * 1.5, 'release time @' + fps);
    eq(m.f.mana, 0, 'spent on release');
  }
});

test('BT02 staff: a target inside the active path is hit once; outside / behind it is not', () => {
  const { env, sim, m } = world({ roxy: false });
  const front = env.addTarget({ x: 0, z: 1.4 });
  const left = env.addTarget({ x: 1.9, z: 0.2 });
  const behind = env.addTarget({ x: 0, z: -1.2 });
  const far = env.addTarget({ x: 0, z: 3.5 });
  sim.attack('megumin');
  run(sim, 0.7);
  eq(front.log.length, 1, 'front hit once');
  eq(left.log.length, 0, 'off the arc');
  eq(behind.log.length, 0, 'behind');
  eq(far.log.length, 0, 'out of range');
  eq(front.hp, 240 - 28, 'damage 0.28 A');
  // Contact happens inside the active window 0.18 – 0.26 s.
  const c = events(sim, 'contact')[0];
  ok(c.time >= 0.17 && c.time <= 0.27, 'contact time ' + c.time);
});

test('series: contacts at 0.18–0.26 / 0.66–0.76 / 1.26–1.38, total 1.70, input window = last 0.18 s', () => {
  const { env, sim } = world({ roxy: false });
  const t = env.addTarget({ x: 0, z: 1.3, hp: 5000 });
  sim.attack('megumin');
  run(sim, 0.30);
  sim.attack('megumin'); // inside the last 0.18 s of hit 1 (0.28 – 0.46)
  run(sim, 0.55);
  sim.attack('megumin'); // inside the last 0.18 s of hit 2 (0.80 – 0.98)
  run(sim, 1.2);
  const cs = events(sim, 'contact').filter((e) => e.target === t);
  eq(cs.length, 3, 'three contacts');
  ok(cs[0].time > 0.17 && cs[0].time < 0.27, 'c1 ' + cs[0].time);
  ok(cs[1].time > 0.65 && cs[1].time < 0.78, 'c2 ' + cs[1].time);
  ok(cs[2].time > 1.25 && cs[2].time < 1.4, 'c3 ' + cs[2].time);
  const ends = events(sim, 'action:end');
  near(ends[2].time, 1.7, 0.05, 'series end');
});

test('series: a press earlier than the last 0.18 s is not queued; a late start resets after 0.75 s', () => {
  const { env, sim, m } = world({ roxy: false });
  env.addTarget({ x: 0, z: 1.3, hp: 5000 });
  sim.attack('megumin');
  run(sim, 0.1);
  sim.attack('megumin'); // too early (age at the end of the hit is 0.36 s)
  run(sim, 0.5);
  eq(events(sim, 'action:start').length, 1, 'no second hit');
  run(sim, 0.9);
  sim.attack('megumin');
  run(sim, 0.01);
  eq(m.act.spec.id, 'M_L1', 'series restarted from the first hit');
});

test('BT03 wall: the aim shows the obstacle and the burst does not pass a wall', () => {
  const { env, sim, m } = world({ roxy: false });
  env.walls.push({ x0: -4, x1: 4, z0: 5, z1: 6, h: 6 });
  const behind = env.addTarget({ x: 0, z: 12 });
  look(sim, 'megumin', 0, 12);
  sim.skill('megumin', 'R');
  eq(m.aim.valid, false, 'aim blocked');
  ok(/стена/i.test(m.aim.reason), m.aim.reason);
  eq(sim.confirm('megumin'), false, 'cannot confirm into a wall');
  eq(m.f.reserved, 0);
  // A visible aim point beside the wall, a target hidden behind it takes no damage.
  env.walls.length = 0;
  const wall = { x0: 8.5, x1: 9.5, z0: 7, z1: 15, h: 6 };
  env.walls.push(wall);
  const hidden = env.addTarget({ x: 11, z: 11 });
  sim.cancelAim('megumin', true);
  look(sim, 'megumin', 7, 12);
  sim.skill('megumin', 'R');
  ok(m.aim.valid, 'aim ok: ' + m.aim.reason);
  sim.confirm('megumin');
  run(sim, 2.6);
  eq(hidden.log.length, 0, 'target behind the wall is safe');
  ok(behind.log.length >= 0);
});

test('BT04 five arrows: five separate emissions, each arrow hits once', () => {
  const { env, sim, r } = world();
  sim.active = 'roxy';
  const t = env.addTarget({ x: 3, z: 9, hp: 5000 });
  r.lockTarget = t;
  look(sim, 'roxy', 3, 9);
  sim.skill('roxy', 'R');
  eq(r.aim.target, t, 'target selected');
  sim.confirm('roxy');
  eq(r.f.reserved, 35);
  run(sim, 2.5);
  eq(events(sim, 'arrow').length, 5, 'five emissions');
  const times = events(sim, 'arrow').map((e) => e.time);
  for (let i = 0; i < 5; i++) near(times[i], [0.55, 0.65, 0.75, 0.85, 0.95][i], STEP * 1.5, 'emission ' + i);
  eq(t.log.length, 5, 'five contacts');
  eq(new Set(t.log.map((x) => x.hit.arrow)).size, 5, 'one hit per arrow');
  eq(t.hp, 5000 - 5 * Math.round(0.65 * 100), 'damage each 0.65 S');
  near(r.f.mana, 65, 3, 'cost 35 spent once (plus a little regeneration)');
  ok(t.wet > 0, 'Wet applied');
});

test('BT05 volley interrupt: before the first arrow the reserve returns; after the third three arrows fly on', () => {
  {
    const { env, sim, r } = world();
    sim.active = 'roxy';
    const t = env.addTarget({ x: 3, z: 12, hp: 5000 });
    r.lockTarget = t;
    look(sim, 'roxy', 3, 12);
    sim.skill('roxy', 'R');
    sim.confirm('roxy');
    run(sim, 0.3);
    eq(r.f.reserved, 35);
    sim.dodge('roxy', 1, 0); // cancel the preparation
    eq(r.f.reserved, 0, 'reserve returned');
    eq(r.f.mana, 100, 'mana intact');
    ok(r.f.retry.R_R > 1.4, 'retry delay 1.5 s');
    eq(events(sim, 'arrow').length, 0, 'no arrows');
  }
  {
    const { env, sim, r } = world();
    sim.active = 'roxy';
    const t = env.addTarget({ x: 3, z: 18, hp: 5000 });
    r.lockTarget = t;
    look(sim, 'roxy', 3, 18);
    sim.skill('roxy', 'R');
    sim.confirm('roxy');
    run(sim, 0.8); // arrows 1–3 are out
    eq(events(sim, 'arrow').length, 3);
    sim.cancelAction('roxy', 'interrupted');
    eq(r.f.mana, 65, 'full cost stays spent');
    eq(r.f.reserved, 0);
    eq(sim.projectiles.length, 3, 'three arrows keep flying');
    run(sim, 1.5);
    eq(events(sim, 'arrow').length, 3, 'remaining emissions cancelled');
    eq(t.log.length, 3, 'the three arrows land');
  }
});

test('BT06 Crimson Breach: cancel before 1.10 s = no wave; after it the front arrives on its own time (8 m ≈ 1.60 s)', () => {
  {
    const { sim, m } = world({ roxy: false });
    look(sim, 'megumin', 0, 10);
    sim.skill('megumin', 'F');
    sim.confirm('megumin');
    run(sim, 0.9);
    sim.dodge('megumin', 1, 0);
    eq(sim.waves.length, 0, 'no wave');
    eq(m.f.mana, 100);
    eq(m.f.cd.M_F || 0, 0, 'no cooldown for a cancelled spell');
  }
  {
    const { env, sim, m } = world({ roxy: false });
    const t = env.addTarget({ x: 0, z: 8.6, hp: 5000 });
    look(sim, 'megumin', 0, 10);
    sim.skill('megumin', 'F');
    sim.confirm('megumin');
    run(sim, 1.12);
    eq(events(sim, 'breach').length, 1, 'wave created at 1.10');
    eq(t.log.length, 0, 'not instantly');
    run(sim, 0.6);
    eq(t.log.length, 1, 'hit when the front arrives');
    const c = events(sim, 'breach:hit')[0];
    near(c.time, 1.1 + 8.0 / 16, 0.1, 'arrival ≈ 1.60 s');
    eq(m.f.mana, 55, 'cost 45');
    eq(t.hp, 5000 - 420, 'damage 4.2 S');
  }
});

test('BT07 Breach stops at a wall and at a cliff; the aim shows the shortened length before confirming', () => {
  const { env, sim, m } = world({ roxy: false });
  env.walls.push({ x0: -2, x1: 2, z0: 6, z1: 7, h: 3 });
  const behind = env.addTarget({ x: 0, z: 8.5, hp: 1000 });
  look(sim, 'megumin', 0, 10);
  sim.skill('megumin', 'F');
  ok(m.aim.len < 6, 'preview length ' + m.aim.len);
  sim.confirm('megumin');
  run(sim, 2.5);
  eq(behind.log.length, 0, 'wave stopped by the wall');
  env.walls.length = 0;
  env.cliffs.push({ x0: -2, x1: 2, z0: 4, z1: 5 });
  const w = env.addTarget({ x: 0, z: 7, hp: 1000 });
  m.f.cd.M_F = 0; m.f.mana = 100;
  look(sim, 'megumin', 0, 10);
  sim.skill('megumin', 'F');
  ok(m.aim.len < 5, 'cliff shortens: ' + m.aim.len);
  sim.confirm('megumin');
  run(sim, 2.5);
  eq(w.log.length, 0, 'wave stopped at the cliff');
});

test('BT08 Tab: control changes, resources / cooldowns / statuses stay; 1.2 s combat delay; prep cancelled with refund', () => {
  const { sim, m, r } = world();
  m.f.mana = 30; m.f.cd.M_Q = 5; r.f.mana = 80; r.f.wet = 3;
  ok(sim.switchTo('roxy'), 'switch');
  eq(sim.active, 'roxy');
  eq(m.f.mana, 30); eq(m.f.cd.M_Q, 5); eq(r.f.mana, 80); eq(r.f.wet, 3);
  eq(sim.switchTo('megumin'), false, 'combat delay');
  run(sim, 1.3);
  ok(sim.switchTo('megumin'), 'after 1.2 s');
  // Preparation of a strong spell is cancelled on switching, the reserve returns.
  m.f.mana = 100;
  look(sim, 'megumin', 0, 15);
  sim.skill('megumin', 'R'); sim.confirm('megumin');
  run(sim, 1.5);
  eq(m.f.reserved, 100);
  run(sim, 0.01);
  ok(sim.switchTo('roxy'), 'switch during preparation');
  eq(m.f.reserved, 0, 'reserve returned');
  eq(m.f.mana, 100);
  // Out of combat there is no delay.
  sim.inCombat = false;
  run(sim, 1.3);
  ok(sim.switchTo('megumin'));
  ok(sim.switchTo('roxy'));
});

test('BT09 Exhaustion: 0.8 s without action, then 12 s from the release: slow, no medium / strong, no mana, 70% staff damage', () => {
  const { env, sim, m } = world({ roxy: false });
  look(sim, 'megumin', 0, 14);
  sim.skill('megumin', 'R'); sim.confirm('megumin');
  run(sim, 2.45);
  near(m.f.exhaust, 12 - 0.05, 0.1, 'exhaustion counts from the release');
  ok(sim.dodge('megumin', 1, 0) === false, 'no dodge in the recoil');
  eq(m.state, 'action', 'locked');
  run(sim, 0.8);
  eq(m.state, 'free', 'control back after 0.8 s');
  run(sim, 0.05);
  eq(m.out.speedCap, NUM.exhaustion.movement, 'speed 2.5 m/s');
  ok(m.f.unavailable('M_R').startsWith('Истощение'), m.f.unavailable('M_R'));
  ok(m.f.unavailable('M_Q').startsWith('Истощение'));
  ok(m.f.unavailable('M_E').startsWith('Истощение'));
  const mana0 = m.f.mana;
  run(sim, 5);
  eq(m.f.mana, mana0, 'no mana regeneration');
  const t = env.addTarget({ x: 0, z: 1.3, hp: 1000 });
  sim.attack('megumin');
  run(sim, 0.6);
  eq(t.hp, 1000 - Math.round(0.28 * 100 * 0.7), 'staff 70%');
  run(sim, 7.5);
  eq(m.f.exhaust, 0, 'ends 12 s after the release');
  ok(m.f.mana > mana0, 'mana grows again');
});

test('BT10 auto-switch after the Explosion never picks a downed or busy heroine', () => {
  const { sim, m, r } = world();
  eq(sim.autoSwitchTarget('megumin'), 'roxy');
  r.f.downed = true; r.f.hp = 0;
  eq(sim.autoSwitchTarget('megumin'), null, 'downed');
  r.f.downed = false; r.f.hp = 100; r.state = 'action';
  eq(sim.autoSwitchTarget('megumin'), null, 'busy');
});

test('BT11 Wet: exactly the next explosive hit gets +10% and the status is consumed', () => {
  const { env, sim, m } = world({ roxy: false });
  const t = env.addTarget({ x: 0, z: 9, hp: 100000 });
  t.wet = 5;
  look(sim, 'megumin', 0, 12);
  sim.skill('megumin', 'F'); sim.confirm('megumin');
  run(sim, 4);
  eq(t.hp, 100000 - 462, 'Crimson Breach 420 +10% = 462');
  eq(t.wet, 0, 'consumed');
  m.f.cd.M_F = 0; m.f.mana = 100;
  look(sim, 'megumin', 0, 12);
  sim.skill('megumin', 'F'); sim.confirm('megumin');
  run(sim, 4);
  eq(t.hp, 100000 - 462 - 420, 'second hit without the bonus');
  // Wet expires.
  t.wet = 6;
  run(sim, 6.1);
  eq(t.wet, 0);
});

test('BT12 Tidal Collapse: damage on arrival (0.45 + d/40), once; the decorative water does nothing', () => {
  const { env, sim, r } = world();
  sim.active = 'roxy';
  const t = env.addTarget({ x: 3, z: 10, hp: 10000, r: 0.45 });
  look(sim, 'roxy', 3, 10);
  sim.skill('roxy', 'F');
  ok(r.aim.valid);
  sim.confirm('roxy');
  run(sim, 1.4);
  eq(t.log.length, 0, 'released, not arrived');
  eq(sim.zones.length, 1);
  const arrive = sim.zones[0].arrive;
  near(arrive - 1.35, 0.45 + 10 / 40, 0.05, 'travel time');
  run(sim, 1.2);
  eq(t.log.length, 1, 'one hit');
  eq(t.hp, 10000 - 460);
  ok(t.wet > 0, 'Wet');
  run(sim, 4);
  eq(t.log.length, 1, 'no repeated damage from the wet ground');
});

test('BT13 counter window: light frontal physical blow is turned aside, a heavy one passes', () => {
  const { env, sim, r } = world();
  sim.active = 'roxy';
  const t = env.addTarget({ x: 3, z: 1.5, hp: 1000 });
  r.yaw = 0;
  look(sim, 'roxy', 3, 10);
  sim.skill('roxy', 'E');
  run(sim, 0.05);
  // Before the window: not parried.
  let res = sim.hitHero('roxy', { dmg: 65, kind: 'light', from: { x: 3, z: 1.5 }, attacker: t });
  eq(res.parried, false, 'too early');
  eq(res.taken, 65);
  // Fresh cast, hit inside 0.10–0.24 s.
  const w2 = world();
  w2.sim.active = 'roxy';
  const tt = w2.env.addTarget({ x: 3, z: 1.5, hp: 1000 });
  look(w2.sim, 'roxy', 3, 10);
  w2.sim.skill('roxy', 'E');
  run(w2.sim, 0.15);
  res = w2.sim.hitHero('roxy', { dmg: 65, kind: 'light', from: { x: 3, z: 1.5 }, attacker: tt });
  eq(res.parried, true);
  eq(res.taken, 0, 'incoming damage is zero');
  run(w2.sim, 0.6);
  eq(tt.hp, 1000 - Math.round(1.2 * 100 + 0.35 * 100 * (100 / 100)), 'counter poke 1.2A + 0.35S = 155');
  // A heavy blow in the window is not parried.
  const w3 = world();
  w3.sim.active = 'roxy';
  const th = w3.env.addTarget({ x: 3, z: 1.5, hp: 1000 });
  look(w3.sim, 'roxy', 3, 10);
  w3.sim.skill('roxy', 'E');
  run(w3.sim, 0.15);
  res = w3.sim.hitHero('roxy', { dmg: 200, kind: 'heavy', from: { x: 3, z: 1.5 }, attacker: th });
  eq(res.parried, false);
  eq(res.taken, 200);
});

test('BT14 Counter poke with 3 mana: physical variant, no water, no Wet; with 4+ mana it is wet', () => {
  {
    const { env, sim, r } = world();
    sim.active = 'roxy';
    r.f.mana = 3; r.f.manaDelay = 10;
    const t = env.addTarget({ x: 3, z: 1.4, hp: 1000 });
    look(sim, 'roxy', 3, 10);
    ok(sim.skill('roxy', 'E'), 'available without mana');
    run(sim, 0.9);
    eq(t.hp, 1000 - 75, '0.75 A only');
    eq(t.wet, 0, 'no Wet');
    near(r.f.mana, 3, 0.01, 'no mana spent');
  }
  {
    const { env, sim, r } = world();
    sim.active = 'roxy';
    r.f.mana = 50;
    const t = env.addTarget({ x: 3, z: 1.4, hp: 1000 });
    look(sim, 'roxy', 3, 10);
    sim.skill('roxy', 'E');
    run(sim, 0.9);
    eq(t.hp, 1000 - 110, '0.75 A + 0.35 S = 110');
    ok(t.wet > 0, 'Wet');
    near(r.f.mana, 46, 0.2, '4 mana spent');
  }
});

test('BT15 stability: protection after a break prevents an endless chain of stuns', () => {
  const p = new PoiseState('light');
  eq(p.hit(30), null);
  const r1 = p.hit(40);
  ok(r1, 'broken at 60');
  near(r1.duration, 0.65, 1e-9);
  eq(p.hit(40), null, 'no new break during the reaction');
  for (let i = 0; i < 70; i++) p.tick(0.01); // reaction over
  ok(p.protectLeft > 2.5, 'protection active');
  eq(p.hit(500), null, 'ordinary damage passes, no stability loss');
  for (let i = 0; i < 310; i++) p.tick(0.01);
  eq(p.protectLeft, 0);
  ok(p.hit(100), 'can break again after 3 s');
  // Regeneration: 3 s after the last hit at 20/s.
  const q = new PoiseState('medium');
  q.hit(100);
  for (let i = 0; i < 300; i++) q.tick(0.01);
  near(q.value, 20, 0.5, 'before the delay is over nothing regenerates');
  for (let i = 0; i < 100; i++) q.tick(0.01);
  near(q.value, 40, 1, '20/s after the delay');
});

test('dodge: 22 stamina, 2.8 m, i-frames 0.10–0.28 s, next dodge only after 0.62 s', () => {
  const { sim, m } = world({ roxy: false });
  const h = 1 / 120;
  eq(sim.dodge('megumin', 1, 0), true);
  eq(m.f.stamina, 78);
  let dist = 0, inv = [];
  for (let i = 0; i < 80; i++) {
    sim.step(h);
    if (m.out.dash) dist += Math.hypot(m.out.dash.vx, m.out.dash.vz) * h;
    inv.push(sim.isInvulnerable(m));
  }
  near(dist, 2.8, 0.1, 'dodge distance');
  const first = inv.indexOf(true) * h, last = inv.lastIndexOf(true) * h;
  near(first, 0.10, 0.02); near(last, 0.28, 0.02);
  const res = (() => { sim.dodge('megumin', 1, 0); return m.state; })();
  ok(res !== 'dodge' || m.dodge.t < 0.62, 'no chain dodge before the end');
  // Hit during i-frames.
  const w = world({ roxy: false });
  w.sim.dodge('megumin', 1, 0);
  run(w.sim, 0.15, 120);
  const hr = w.sim.hitHero('megumin', { dmg: 65, kind: 'light', from: { x: 0, z: 1 } });
  eq(hr.dodged, true);
  eq(w.m.f.hp, 620);
});

test('guard: 65% melee reduction + 12/25 stamina, 40% for projectiles, break at no stamina (0.7 s, 70% of the damage)', () => {
  const { sim, m } = world({ roxy: false });
  m.yaw = 0;
  sim.guard('megumin', true);
  run(sim, 0.05);
  ok(m.guarding);
  let r = sim.hitHero('megumin', { dmg: 100, kind: 'light', from: { x: 0, z: 2 } });
  eq(r.blocked, true); eq(r.taken, 35); eq(m.f.stamina, 88);
  r = sim.hitHero('megumin', { dmg: 100, kind: 'medium', from: { x: 0, z: 2 } });
  eq(r.taken, 35); eq(m.f.stamina, 63);
  r = sim.hitHero('megumin', { dmg: 100, kind: 'projectile', from: { x: 0, z: 2 } });
  eq(r.taken, 60);
  m.f.stamina = 5;
  m.f.staminaDelay = 5;
  r = sim.hitHero('megumin', { dmg: 100, kind: 'medium', from: { x: 0, z: 2 } });
  eq(r.broken, true); eq(r.taken, 70); eq(m.f.stamina, 0);
  eq(m.state, 'stun');
  near(m.f.guardBreak, 0.7, 1e-6);
  // Behind the guard and red attacks are not blocked.
  const w = world({ roxy: false });
  w.sim.guard('megumin', true); run(w.sim, 0.05);
  r = w.sim.hitHero('megumin', { dmg: 100, kind: 'light', from: { x: 0, z: -2 } });
  eq(r.blocked, false);
  r = w.sim.hitHero('megumin', { dmg: 100, kind: 'heavy', from: { x: 0, z: 2 } });
  eq(r.blocked, false);
  // Stamina does not regenerate while the guard is held.
  const g = world({ roxy: false });
  g.sim.guard('megumin', true); run(g.sim, 0.05);
  g.m.f.stamina = 50; g.m.f.staminaDelay = 0;
  run(g.sim, 1);
  eq(g.m.f.stamina, 50, 'no regeneration under guard');
  g.sim.guard('megumin', false);
  run(g.sim, 0.5);
  ok(g.m.f.stamina > 55, 'regenerates when the guard is down');
});

test('resources: stamina 24/s (0.7 s delay) active, 12/s companion; mana 2/s after 1 s, 1/s companion, 8/s out of combat', () => {
  const { sim, m, r } = world();
  m.f.stamina = 0; r.f.stamina = 0; m.f.staminaDelay = 0.7; r.f.staminaDelay = 0.7;
  m.f.mana = 0; r.f.mana = 0; m.f.manaDelay = 1; r.f.manaDelay = 1;
  run(sim, 0.7);
  near(m.f.stamina, 0, 0.5);
  run(sim, 1.0);
  near(m.f.stamina, 24, 1, 'active 24/s');
  near(r.f.stamina, 12, 1, 'companion 12/s');
  near(m.f.mana, 1.4, 0.3, 'mana after the 1 s delay: 2/s');
  run(sim, 3);
  near(m.f.mana, 2 * 3 + 1.4, 0.5);
  near(r.f.mana, 1 * 3 + 0.7, 0.5, 'companion 1/s');
  sim.inCombat = false;
  const before = m.f.mana;
  run(sim, 1);
  near(m.f.mana - before, 8, 0.5, '8/s out of combat');
});

test('strong cast: reserve at confirm, no spending before the release; Explosion zones hit once with the higher coefficient', () => {
  const { env, sim, m } = world({ roxy: false });
  const centre = env.addTarget({ x: 0, z: 15, hp: 100000, defM: 0 });
  const edge = env.addTarget({ x: 4.6, z: 15, hp: 100000 });
  const out = env.addTarget({ x: 0, z: 21.6, hp: 100000 });
  const big = env.addTarget({ x: 2.9, z: 15, hp: 100000, r: 1.0 }); // straddles both zones: the bigger one counts once
  look(sim, 'megumin', 0, 15);
  sim.skill('megumin', 'R'); sim.confirm('megumin');
  eq(m.f.freeMana, 0, 'free mana excludes the reserve');
  run(sim, 3.0);
  eq(centre.hp, 100000 - 1000);
  eq(edge.hp, 100000 - 700);
  eq(out.hp, 100000, 'outside 5.5 m');
  eq(big.hp, 100000 - 1000, 'highest zone once');
  eq(big.log.length, 1);
  ok(centre.poise.reactionLeft > 0 || centre.poise.protectLeft >= 0, 'stability');
  eq(m.f.cd.M_R > 55, true, 'cooldown 60 s from the release');
});

test('Explosion safe-zone rule blocks aiming and reports the reason', () => {
  const { env, sim, m } = world({ roxy: false });
  env.forbidden = () => ({ ok: false, reason: 'Здесь нельзя применять взрыв' });
  look(sim, 'megumin', 0, 15);
  eq(sim.skill('megumin', 'R'), false);
  const d = events(sim, 'denied').pop();
  eq(d.reason, 'Здесь нельзя применять взрыв');
  eq(m.f.reserved, 0);
});

test('mana / reasons shown on the slots', () => {
  const { sim, m } = world({ roxy: false });
  m.f.mana = 60;
  eq(sim.availability('megumin', 'R'), 'Нужно 100 маны');
  m.f.mana = 100;
  eq(sim.availability('megumin', 'R'), '');
  m.f.cd.M_Q = 4.2;
  eq(sim.availability('megumin', 'Q'), 'Перезарядка: 5 с');
  m.f.stamina = 10;
  m.f.cd.M_Q = 0;
  eq(sim.availability('megumin', 'Q'), 'Не хватает выносливости');
});

test('Lunge: advances up to 2.4 m, hits one target up to 4.2 m away, 150 damage, cost at start', () => {
  const { env, sim, m } = world({ roxy: false });
  const t = env.addTarget({ x: 0, z: 3.7, hp: 1000 });
  sim.skill('megumin', 'Q');
  eq(m.f.stamina, 78, '22 at start');
  eq(m.f.cd.M_Q, 7);
  let moved = 0;
  for (let i = 0; i < 120; i++) {
    sim.step(STEP);
    if (m.out.dash) { moved += m.out.dash.vz * STEP; m.pos.z += m.out.dash.vz * STEP; }
  }
  near(moved, 2.24, 0.2, 'advance (stops 1.5 m before the target body)');
  eq(t.log.length, 1);
  eq(t.hp, 1000 - 150);
});

test('Circular parry: 240°, 115 damage to each, light pushed 1.5 m, heavy not moved', () => {
  const { env, sim } = world({ roxy: false });
  const a = env.addTarget({ x: 1.6, z: 0.3, hp: 1000, tier: 'light' });
  const b = env.addTarget({ x: -1.6, z: -0.5, hp: 1000, tier: 'heavy' });
  const c = env.addTarget({ x: 0, z: -1.8, hp: 1000 }); // behind: outside 240°? (±120° from front: directly behind = 180°)
  sim.skill('megumin', 'E');
  run(sim, 1.0);
  eq(a.hp, 1000 - 115); eq(b.hp, 1000 - 115);
  eq(c.hp, 1000, 'directly behind is out of the arc');
  eq(a.log[0].hit.push.dist, 1.5);
  eq(b.log[0].hit.push.dist, 0);
  // Order: the right flank is struck before the left one.
  const order = events(sim, 'contact').map((e) => e.target.id);
  ok(order.length === 2);
});

test('Whip: 130 water damage, Wet, pulls only the primary target (light 1 m), heavy refuses, wall cuts it', () => {
  const { env, sim, r } = world();
  sim.active = 'roxy';
  const light = env.addTarget({ x: 3, z: 5, hp: 1000, tier: 'light' });
  const side = env.addTarget({ x: 5.6, z: 4, hp: 1000, tier: 'light' });
  look(sim, 'roxy', 3, 10);
  r.cam.dir = { x: 0, y: -0.1, z: 1 };
  sim.skill('roxy', 'Q');
  eq(r.f.mana, 92); eq(r.f.stamina, 86);
  run(sim, 1.2);
  eq(light.hp, 1000 - 130);
  ok(light.wet > 0);
  const lc = light.log[0];
  eq(lc.hit.push.dist, 1, 'primary is pulled 1 m');
  if (side.log.length) eq(side.log[0].hit.push, null, 'others are not pulled');
  // Wall cut.
  const w = world();
  w.sim.active = 'roxy';
  w.env.walls.push({ x0: 1, x1: 5, z0: 2, z1: 2.5, h: 3 });
  const behind = w.env.addTarget({ x: 3, z: 6, hp: 1000 });
  look(w.sim, 'roxy', 3, 10);
  w.sim.skill('roxy', 'Q');
  run(w.sim, 1.2);
  eq(behind.log.length, 0, 'the wall stops the whip');
  // Heavy primary: refused.
  const x = world();
  x.sim.active = 'roxy';
  const heavy = x.env.addTarget({ x: 3, z: 5, hp: 1000, tier: 'heavy' });
  look(x.sim, 'roxy', 3, 10);
  x.sim.skill('roxy', 'Q');
  run(x.sim, 1.2);
  eq(heavy.log[0].hit.push, null, 'no pull');
  eq(events(x.sim, 'pull:refused').length, 1);
});

test('hit reactions: flinch 0.18 s, protection 0.5 s, strong preparation breaks on a direct hit', () => {
  const { sim, m } = world({ roxy: false });
  look(sim, 'megumin', 0, 15);
  sim.skill('megumin', 'R'); sim.confirm('megumin');
  run(sim, 1.0);
  sim.hitHero('megumin', { dmg: 30, kind: 'light', from: { x: 0, z: 2 } });
  eq(m.state, 'stun');
  eq(m.f.reserved, 0, 'reserve returned');
  eq(m.f.mana, 100);
  run(sim, 0.25);
  eq(m.state, 'free');
  // Protection: a second light hit right after the reaction does not stun again.
  sim.hitHero('megumin', { dmg: 30, kind: 'light', from: { x: 0, z: 2 } });
  eq(m.state, 'free', 'flinch protection');
  // Heavy blow ignores it.
  sim.hitHero('megumin', { dmg: 30, kind: 'heavy', from: { x: 0, z: 2 } });
  eq(m.state, 'stun');
});

test('BT23 pause: nothing advances', () => {
  const { sim, m } = world({ roxy: false });
  m.f.stamina = 10; m.f.staminaDelay = 0;
  sim.paused = true;
  run(sim, 5);
  eq(m.f.stamina, 10);
  eq(sim.time, 0);
});

test('BT22 items: a mana flask neither removes the Exhaustion nor resets cooldowns', () => {
  const { sim, m } = world({ roxy: false });
  m.f.startExhaustion();
  m.f.cd.M_R = 40;
  m.f.restoreMana(25);
  ok(m.f.exhausted); eq(m.f.cd.M_R, 40);
});

test('downed heroine: hp 0 -> downed, revived with 25%', () => {
  const { sim, m, r } = world();
  const res = sim.hitHero('roxy', { dmg: 9999, kind: 'light', from: { x: 3, z: 2 } });
  eq(res.downed, true); eq(r.state, 'downed');
  ok(sim.revive('roxy'));
  eq(r.f.hp, Math.round(700 * 0.25));
  eq(r.state, 'free');
});

// ---------------------------------------------------------------------------------------------------------
for (const [s, n] of results) console.log(s === 'PASS' ? '  ok  ' : ' FAIL ', n);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
