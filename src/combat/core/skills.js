import { SPEC, NUM, SLOTS } from './specs.js';
import { clamp, wrap, bearingTo, dist2d, yawTo, DEG, overlap, overlapY, approachAngle, approach } from './geo.js';

/**
 * Per-action logic of the combat core: timelines, contacts, projectiles, ground wave, delayed water.
 * Every contact happens on the fixed step inside the active window (never on the button press); the
 * moments come from the action's own clock (docs/combat/05 §1).
 */

const COMBO_INDEX = { M_L1: 1, M_L2: 2, M_L3: 3, R_L1: 1, R_L2: 2, R_L3: 3 };
/** Short step of the body during a swing (metres, forward); R_L3 has a half-step back in its recovery. */
const STEP_FWD = { M_L1: 0.3, M_L2: 0.3, M_L3: 0.6, R_L1: 0.25, R_L2: 0.25, R_L3: 0 };
/** Weak enemies are pushed back 0.3 m by the third contact of the series (if the path is free). */
const FINISHER_PUSH = { M_L3: 0.3, R_L3: 0.2 };
const TIERS = ['light', 'medium', 'heavy', 'boss'];

const chestOf = (t) => ({ x: t.pos.x, y: t.pos.y + t.h * 0.6, z: t.pos.z });
const up = (p, d) => ({ x: p.x, y: p.y + d, z: p.z });

// ---------------------------------------------------------------------------------------------------------
// start / run / cancel
// ---------------------------------------------------------------------------------------------------------
function begin(sim, hero, spec, carry) {
  const f = hero.f;
  hero.state = 'action';
  hero.guarding = false;
  hero.queue = null;
  const a = {
    uid: sim.uidNext(), spec, t: 0, hits: new Set(), released: false, emitted: 0, countered: false,
    yaw: hero.camYaw, faceYaw: hero.camYaw, aim: carry || null, point: carry?.point ? { ...carry.point } : null,
    target: carry?.target || null, moved: 0, start: { x: hero.pos.x, z: hero.pos.z },
    funded: true, parryOpened: false, info: {},
  };
  hero.act = a;
  if (spec.kind === 'basic') {
    hero.combo.index = COMBO_INDEX[spec.id];
    assist(sim, hero, a);
  } else {
    hero.combo.next = 1;
    if (spec.kind === 'medium') assist(sim, hero, a);
  }
  if (spec.kind === 'strong') {
    a.yaw = carry?.yaw ?? hero.camYaw;
    a.faceYaw = a.point ? yawTo(hero.pos, a.point) : a.yaw;
  }
  if (spec.id === 'R_E') a.funded = (hero.paidMana ?? 0) > 0;
  if (spec.id === 'R_Q') a.primary = pickPrimary(sim, hero, a, spec);
  if (spec.id === 'M_F') a.fireYaw = carry.yaw;
  sim.emit('action:start', { hero: hero.id, spec, id: spec.id, uid: a.uid, act: a });
}

/** Soft aim assist: up to 25° towards the nearest target, fixed before the active phase starts. */
function assist(sim, hero, a) {
  const max = NUM.movement.melee_aim_assist_max * DEG;
  let best = null, bs = Infinity;
  for (const t of sim.targets()) {
    const d = dist2d(hero.pos, t.pos);
    if (d > 4.5 + t.r) continue;
    const b = Math.abs(bearingTo(hero.pos, hero.camYaw, t.pos));
    if (b > max) continue;
    const sc = d * (1 + b);
    if (sc < bs) { bs = sc; best = t; }
  }
  a.faceYaw = best ? yawTo(hero.pos, best.pos) : hero.camYaw;
  a.assisted = best || null;
}

function stepAction(sim, hero, h) {
  const a = hero.act;
  if (!a) {
    hero.state = 'free';
    return;
  }
  const s = a.spec;
  const t0 = a.t;
  a.t += h;
  const t1 = a.t;
  const out = hero.out;
  out.noSprint = true;
  // Movement allowance and facing during the action.
  if (s.kind === 'strong') {
    const m = s.caster_move_multiplier ?? 0;
    out.moveMul = a.released && s.id === 'M_R' ? 0 : m;
    out.faceYaw = a.point && s.id !== 'M_F' ? yawTo(hero.pos, a.point) : s.id === 'M_F' ? a.fireYaw : a.yaw;
  } else {
    out.moveMul = s.id === 'M_Q' ? 0 : 0.25;
    out.faceYaw = a.faceYaw;
  }
  hero.guardYaw = out.faceYaw ?? hero.yaw;
  const H = HANDLERS[s.id] || HANDLERS.basic;
  H.step?.(sim, hero, a, t0, t1, h);
  if (s.kind === 'strong') strongStep(sim, hero, a, t0, t1, h, H);
  if (t1 >= s.total) finish(sim, hero);
}

function strongStep(sim, hero, a, t0, t1, h, H) {
  const s = a.spec;
  if (!a.released) {
    aimTrack(sim, hero, a, h);
    if (s.id !== 'R_R' && t1 >= s.release) {
      a.released = true;
      a.releaseTime = sim.time;
      const f = hero.f;
      f.spendReserved(s.cost.mana);
      if (s.cooldown) f.cd[s.id] = s.cooldown;
      sim.emit('release', { hero: hero.id, spec: s, id: s.id, uid: a.uid, act: a, point: a.point });
      H.release?.(sim, hero, a);
    }
  }
}

function finish(sim, hero) {
  const a = hero.act;
  const s = a.spec;
  hero.act = null;
  hero.state = 'free';
  if (s.kind === 'basic') {
    hero.combo.next = COMBO_INDEX[s.id] >= 3 ? 1 : COMBO_INDEX[s.id] + 1;
    hero.combo.readyAt = sim.time;
  }
  hero.out.moveMul = 1;
  sim.emit('action:end', { hero: hero.id, spec: s, id: s.id, uid: a.uid });
  if (s.id === 'M_R') sim.emit('exhaust:locked', { hero: hero.id });
}

function cancel(sim, hero, reason) {
  const a = hero.act;
  if (!a) return;
  const s = a.spec;
  let refunded = false;
  if (s.kind === 'strong' && !a.released) {
    hero.f.unreserve(s.cost.mana);
    hero.f.retry[s.id] = NUM.strong.retry_delay_on_cancel;
    refunded = true;
  }
  hero.act = null;
  hero.state = 'free';
  hero.combo.next = 1;
  sim.emit('action:cancel', { hero: hero.id, spec: s, id: s.id, uid: a.uid, reason, refunded, emitted: a.emitted });
}

// ---------------------------------------------------------------------------------------------------------
// contacts
// ---------------------------------------------------------------------------------------------------------
/** Sweep the staff through a sector: the swept bearing interval [u0, u1] of the active window meets the target's. */
function sweepSector(sim, hero, a, s, u0, u1, extraFn) {
  const half = (s.arc * DEG) / 2;
  const p = (u) => (s.sweep === 'rl' || s.sweep === 'around' ? -half + 2 * half * u : s.sweep === 'lr' ? half - 2 * half * u : 0);
  let lo, hi;
  if (s.sweep === 'thrust' || s.sweep === 'static') { lo = -half; hi = half; }
  else { lo = Math.min(p(u0), p(u1)); hi = Math.max(p(u0), p(u1)); }
  const yaw = a.faceYaw;
  const origin = hero.pos;
  const hits = [];
  for (const t of sim.targets()) {
    if (a.hits.has(t.id)) continue;
    const d = dist2d(origin, t.pos);
    if (d > s.range + t.r) continue;
    if (!overlapY(t.pos.y, t.h, origin.y - 0.4, origin.y + hero.h)) continue;
    const b = wrap(yawTo(origin, t.pos) - yaw);
    const delta = d > t.r + 0.05 ? Math.asin(Math.min(1, t.r / d)) : Math.PI / 2;
    if (!overlap(lo, hi, b - delta, b + delta)) continue;
    if (!sim.env.los(up(origin, hero.h * 0.62), chestOf(t))) continue;
    a.hits.add(t.id);
    const extra = extraFn ? extraFn(t, d) : {};
    hits.push(sim.strike(hero, s, t, { ...extra }));
  }
  return hits;
}

const tierIdx = (t) => Math.max(0, TIERS.indexOf(t.tier));

function basicStep(sim, hero, a, t0, t1) {
  const s = a.spec;
  const T = s.startup, A = s.active;
  // Short step of the body (forward) towards the end of the preparation; a half-step back in the recovery.
  const fwd = STEP_FWD[s.id] || 0;
  if (fwd > 0 && t1 > T * 0.4 && t0 < T + A) {
    const v = fwd / (T + A - T * 0.4);
    const stop = nearestAhead(sim, hero, a.faceYaw, 0.7);
    if (!stop) hero.out.dash = { vx: Math.sin(a.faceYaw) * v, vz: Math.cos(a.faceYaw) * v };
  }
  if (s.backstep > 0 && t1 > T + A && t0 < T + A + 0.2) {
    const v = s.backstep / 0.2;
    hero.out.dash = { vx: -Math.sin(a.faceYaw) * v, vz: -Math.cos(a.faceYaw) * v };
  }
  if (t1 > T && t0 < T + A) {
    const u0 = clamp((t0 - T) / A, 0, 1), u1 = clamp((t1 - T) / A, 0, 1);
    const push = FINISHER_PUSH[s.id];
    sweepSector(sim, hero, a, s, u0, u1, (t) => ({ push: push && tierIdx(t) === 0 ? { dist: push, dir: 'away' } : null }));
  }
}

/** Is a target within `dist` metres ahead in a narrow cone (the body must not walk into it)? */
function nearestAhead(sim, hero, yaw, gap) {
  for (const t of sim.targets()) {
    const d = dist2d(hero.pos, t.pos);
    if (d > t.r + gap + hero.r) continue;
    if (Math.abs(wrap(yawTo(hero.pos, t.pos) - yaw)) < 0.6) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// handlers by action id
// ---------------------------------------------------------------------------------------------------------
const HANDLERS = {
  basic: { step: basicStep },

  // Megumin — Проламывающий выпад: the body drives 2.4 m, the staff end hits within 1.8 m of the moving body.
  M_Q: {
    step(sim, hero, a, t0, t1) {
      const s = a.spec;
      const from = 0.12, to = s.startup + s.active;
      if (t1 > from && t0 < to && a.moved < s.advance) {
        const v = s.advance / (to - from);
        const blocked = nearestAhead(sim, hero, a.faceYaw, 0.75);
        if (!blocked) {
          hero.out.dash = { vx: Math.sin(a.faceYaw) * v, vz: Math.cos(a.faceYaw) * v };
          a.moved += v * (t1 - t0);
        }
      }
      if (t1 > s.startup && t0 < s.startup + s.active) {
        sweepSector(sim, hero, a, { ...s, range: 1.8, sweep: 'static' }, 0, 1, () => ({ dust: true }));
      }
    },
  },

  // Megumin — Круговой отбив: a wide two-handed arc from the right flank to the left, contacts in order of the path.
  M_E: {
    step(sim, hero, a, t0, t1) {
      const s = a.spec;
      if (t1 > s.startup && t0 < s.startup + s.active) {
        const u0 = clamp((t0 - s.startup) / s.active, 0, 1), u1 = clamp((t1 - s.startup) / s.active, 0, 1);
        sweepSector(sim, hero, a, s, u0, u1, (t) => ({ push: { dist: s.displacement[t.tier] ?? 0, dir: 'away' } }));
      }
    },
  },

  // Megumin — Explosion: instant burst at the release, two zones, highest zone once per target.
  M_R: {
    release(sim, hero, a) {
      const s = a.spec;
      const f = hero.f;
      f.startExhaustion();
      const c = a.point;
      const centre = up(c, 1.0);
      const results = [];
      for (const t of sim.targets()) {
        const d = dist2d(c, t.pos) - t.r;
        let zone = null;
        for (const z of s.zones) if (d <= z.radius && (!zone || z.damage.S > zone.damage.S)) zone = z;
        if (!zone) continue;
        if (Math.abs(t.pos.y - c.y) > 3.5 + t.h) continue; // another floor
        if (!sim.env.los(centre, chestOf(t)) && !sim.env.los(centre, up(t.pos, 0.3))) continue;
        results.push(sim.strike(hero, { ...s, coefS: zone.damage.S, coefA: 0, poise: zone.poise }, t, {
          push: { dist: 0, dir: 'away', blast: true }, zone: zone.radius, from: { x: c.x, z: c.z },
        }));
      }
      sim.emit('explosion', { hero: hero.id, spec: s, id: s.id, tags: s.tags, pos: { ...c }, radius: s.zones[1].radius, inner: s.zones[0].radius, results: results.filter(Boolean), exhaust: NUM.exhaustion.duration_from_release });
      sim.emit('exhaust:start', { hero: hero.id, duration: NUM.exhaustion.duration_from_release });
    },
  },

  // Megumin — Алый пролом: a ground wave along a line; the front reaches each target in its own time.
  M_F: {
    release(sim, hero, a) {
      const s = a.spec;
      const dir = { x: Math.sin(a.fireYaw), z: Math.cos(a.fireYaw) };
      const o = { x: hero.pos.x + dir.x * 0.6, y: hero.pos.y, z: hero.pos.z + dir.z * 0.6 };
      const line = sim.env.groundLine(o.x, o.z, o.x + dir.x * s.length, o.z + dir.z * s.length, o.y);
      const wave = {
        uid: sim.uidNext(), hero: hero.id, spec: s, o, dir, yaw: a.fireYaw, len: Math.min(s.length, line.len), reason: line.reason,
        front: 0, speed: s.wave_speed, hits: new Set(), lastMark: 0, width: s.width,
      };
      sim.waves.push(wave);
      sim.emit('breach', { hero: hero.id, wave, spec: s, tags: s.tags, pos: o, yaw: a.fireYaw, len: wave.len, stopped: wave.len < s.length ? line.reason : '' });
    },
  },

  // Roxy — Водяной хлыст: a loop unrolls; the tip and the thick part make the contact, the wall cuts it.
  R_Q: {
    step(sim, hero, a, t0, t1) {
      const s = a.spec;
      const t = s.startup;
      if (t1 <= t || t0 >= s.startup + s.active) return;
      const u1 = clamp((t1 - t) / s.active, 0, 1), u0 = clamp((t0 - t) / s.active, 0, 1);
      const half = (s.arc * DEG) / 2;
      const origin = up(hero.pos, hero.h * 0.7);
      const tip = (u) => {
        const ang = a.faceYaw + (half - 2 * half * u) * -1; // right -> left
        const ext = s.range * Math.min(1, u / 0.75);
        let r = ext;
        const wall = sim.env.rayWall(origin, { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, ext);
        if (wall < r) r = Math.max(0, wall - 0.1);
        return { x: origin.x + Math.sin(ang) * r, y: origin.y, z: origin.z + Math.cos(ang) * r, ang, r };
      };
      const p0 = tip(u0), p1 = tip(u1);
      a.info.tip = p1;
      const thick = (p) => ({ x: origin.x + (p.x - origin.x) * 0.62, z: origin.z + (p.z - origin.z) * 0.62 });
      for (const tg of sim.targets()) {
        if (a.hits.has(tg.id)) continue;
        if (!overlapY(tg.pos.y, tg.h, origin.y - 1.2, origin.y + 0.9)) continue;
        // The thick end part sweeps a band between the previous and the current positions.
        const w = 0.45 + tg.r;
        const segs = [[p0, p1], [thick(p0), thick(p1)], [thick(p1), p1]];
        let ok = false;
        for (const [A0, B0] of segs) {
          if (pointSegDist(tg.pos, A0, B0) <= w) { ok = true; break; }
        }
        if (!ok) continue;
        if (!sim.env.los(origin, chestOf(tg))) continue;
        a.hits.add(tg.id);
        const primary = a.primary === tg;
        const pullD = primary ? (s.pull[tg.tier] ?? 0) : 0;
        const stand = hero.r + tg.r + 0.55;
        const res = sim.strike(hero, s, tg, {
          wet: s.wet, push: pullD > 0 ? { dist: pullD, dir: 'toward', stopAt: stand, to: { x: hero.pos.x, z: hero.pos.z } } : null,
        });
        if (primary && pullD <= 0) sim.emit('pull:refused', { hero: hero.id, target: tg });
        if (res) res.pulled = pullD > 0;
      }
    },
  },

  // Roxy — Встречный укол: a counter window first (handled in hitHero), then the poke.
  R_E: {
    step(sim, hero, a, t0, t1) {
      const s = a.spec;
      const [w0, w1] = s.parry_window;
      if (!a.parryOpened && t1 >= w0) {
        a.parryOpened = true;
        sim.emit('parry:window', { hero: hero.id, open: true });
      }
      if (a.parryOpened && !a.parryClosed && t1 > w1) {
        a.parryClosed = true;
        sim.emit('parry:window', { hero: hero.id, open: false, countered: a.countered });
      }
      if (t1 > s.startup && t0 < s.startup + s.active) {
        const funded = a.funded;
        const counter = a.countered;
        sweepSector(sim, hero, a, { ...s, sweep: 'static', range: s.range }, 0, 1, () => ({
          coefA: counter ? s.counter_damage.A : s.damage.A,
          coefS: funded ? (counter ? s.counter_damage.S : s.damage.S) : 0,
          poise: counter ? s.counter_poise : s.poise,
          wet: funded ? s.wet_only_with_mana : 0,
          counter,
        }));
      }
    },
  },

  // Roxy — Water Volley: five homing arrows, one per emission.
  R_R: {
    step(sim, hero, a, t0, t1) {
      const s = a.spec;
      while (a.emitted < s.emissions.length && t1 >= s.emissions[a.emitted]) {
        const i = a.emitted++;
        if (i === 0) {
          // The first arrow is the "release": the reserve turns into spending, the cooldown starts.
          hero.f.spendReserved(s.cost.mana);
          hero.f.cd[s.id] = s.cooldown;
          a.released = true;
          sim.emit('release', { hero: hero.id, spec: s, id: s.id, uid: a.uid, act: a, point: a.point });
        }
        spawnArrow(sim, hero, a, i);
      }
    },
  },

  // Roxy — Приливный обвал: the mass flies to the aimed point and arrives later.
  R_F: {
    release(sim, hero, a) {
      const s = a.spec;
      const dist = dist2d(hero.pos, a.point);
      const z = {
        uid: sim.uidNext(), hero: hero.id, spec: s, point: { ...a.point }, arrive: sim.time + s.travel_formula.base + dist / s.travel_formula.distance_divisor,
        launched: sim.time, radius: s.radius,
      };
      sim.zones.push(z);
      sim.emit('tidal', { hero: hero.id, zone: z, spec: s, pos: z.point, from: up(hero.pos, 1.6), arrive: z.arrive, travel: z.arrive - sim.time });
    },
  },
};

function pickPrimary(sim, hero, a, spec) {
  const lock = hero.lockTarget;
  if (lock?.alive && dist2d(hero.pos, lock.pos) <= spec.range + lock.r) return lock;
  let best = null, bs = Infinity;
  const half = (spec.arc * DEG) / 2;
  for (const t of sim.targets()) {
    const d = dist2d(hero.pos, t.pos);
    if (d > spec.range + t.r) continue;
    const b = Math.abs(wrap(yawTo(hero.pos, t.pos) - a.faceYaw));
    if (b > half + 0.2) continue;
    const sc = b * 4 + d * 0.2;
    if (sc < bs) { bs = sc; best = t; }
  }
  return best;
}

function pointSegDist(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  const t = l2 < 1e-9 ? 0 : clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}

// ---------------------------------------------------------------------------------------------------------
// Volley arrows
// ---------------------------------------------------------------------------------------------------------
function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function spawnArrow(sim, hero, a, i) {
  const s = a.spec;
  const from = { ...hero.staff };
  const tgt = a.target?.alive ? a.target : null;
  let dir;
  if (tgt) dir = norm({ x: tgt.pos.x - from.x, y: chestOf(tgt).y - from.y, z: tgt.pos.z - from.z });
  else if (a.point) dir = norm({ x: a.point.x - from.x, y: a.point.y - from.y, z: a.point.z - from.z });
  else dir = norm({ x: Math.sin(a.yaw), y: 0.04, z: Math.cos(a.yaw) });
  // A small fan so the five arrows read as five events; homing pulls them together.
  const spread = (i - 2) * 0.05;
  const cs = Math.cos(spread), sn = Math.sin(spread);
  dir = norm({ x: dir.x * cs + dir.z * sn, y: dir.y + (i % 2 ? 0.03 : -0.01), z: -dir.x * sn + dir.z * cs });
  const p = {
    uid: sim.uidNext(), hero: hero.id, spec: s, index: i, pos: from, dir, speed: s.projectile_speed, turn: s.turn_speed * DEG,
    life: s.projectile_life, path: 0, maxPath: s.projectile_max_path, target: tgt, last: tgt ? chestOf(tgt) : null, homing: !!tgt, dead: false,
  };
  sim.projectiles.push(p);
  sim.emit('arrow', { hero: hero.id, arrow: p, index: i, pos: from, dir });
}

export function stepProjectiles(sim, h) {
  const list = sim.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    // Homing: turn towards the target's chest at a limited rate; a dead target is not replaced.
    if (p.homing) {
      if (p.target?.alive) p.last = chestOf(p.target);
      if (p.last && p.target?.alive) {
        const want = norm({ x: p.last.x - p.pos.x, y: p.last.y - p.pos.y, z: p.last.z - p.pos.z });
        p.dir = rotateToward(p.dir, want, p.turn * h);
      }
    }
    const len = p.speed * h;
    const wall = sim.env.rayWall(p.pos, p.dir, len);
    let hitT = null, hitAt = Infinity;
    for (const t of sim.targets()) {
      const c = chestOf(t);
      const d = segPoint(p.pos, p.dir, len, c);
      if (d.dist <= t.r * 0.8 + 0.3 && d.t < hitAt) { hitAt = d.t; hitT = t; }
    }
    if (hitT && hitAt <= (wall === Infinity ? Infinity : wall) + 1e-6) {
      p.pos = { x: p.pos.x + p.dir.x * hitAt, y: p.pos.y + p.dir.y * hitAt, z: p.pos.z + p.dir.z * hitAt };
      const hero = sim.heroes[p.hero];
      const res = sim.strike(hero, p.spec, hitT, {
        coefA: 0, coefS: p.spec.damage_each.S, poise: p.spec.poise_each, wet: p.spec.wet, arrow: p.index, from: { x: p.pos.x - p.dir.x, z: p.pos.z - p.dir.z },
      });
      sim.emit('arrow:hit', { arrow: p, target: hitT, result: res, pos: p.pos, dir: p.dir });
      list.splice(i, 1);
      continue;
    }
    if (wall < len) {
      p.pos = { x: p.pos.x + p.dir.x * wall, y: p.pos.y + p.dir.y * wall, z: p.pos.z + p.dir.z * wall };
      sim.emit('arrow:end', { arrow: p, pos: p.pos, dir: p.dir, why: 'wall' });
      list.splice(i, 1);
      continue;
    }
    p.pos = { x: p.pos.x + p.dir.x * len, y: p.pos.y + p.dir.y * len, z: p.pos.z + p.dir.z * len };
    p.path += len;
    p.life -= h;
    if (p.life <= 0 || p.path >= p.maxPath) {
      sim.emit('arrow:end', { arrow: p, pos: p.pos, dir: p.dir, why: 'range' });
      list.splice(i, 1);
    }
  }
}

function segPoint(o, d, len, c) {
  const vx = c.x - o.x, vy = c.y - o.y, vz = c.z - o.z;
  const t = clamp(vx * d.x + vy * d.y + vz * d.z, 0, len);
  const px = o.x + d.x * t - c.x, py = o.y + d.y * t - c.y, pz = o.z + d.z * t - c.z;
  return { t, dist: Math.hypot(px, py, pz) };
}

function rotateToward(cur, want, maxAngle) {
  const dot = clamp(cur.x * want.x + cur.y * want.y + cur.z * want.z, -1, 1);
  const ang = Math.acos(dot);
  if (ang <= maxAngle || ang < 1e-5) return want;
  const k = maxAngle / ang;
  return norm({ x: cur.x + (want.x - cur.x) * k, y: cur.y + (want.y - cur.y) * k, z: cur.z + (want.z - cur.z) * k });
}

// ---------------------------------------------------------------------------------------------------------
// ground wave (Алый пролом) and delayed water (Приливный обвал)
// ---------------------------------------------------------------------------------------------------------
export function stepWaves(sim, h) {
  const list = sim.waves;
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    const prev = w.front;
    w.front = Math.min(w.len, w.front + w.speed * h);
    const hero = sim.heroes[w.hero];
    for (const t of sim.targets()) {
      if (w.hits.has(t.id)) continue;
      const dx = t.pos.x - w.o.x, dz = t.pos.z - w.o.z;
      const along = dx * w.dir.x + dz * w.dir.z;
      const side = Math.abs(dx * w.dir.z - dz * w.dir.x);
      if (side > w.width / 2 + t.r * 0.8) continue;
      if (along < -t.r || along - t.r * 0.5 > w.front) continue;
      if (along > w.len + t.r) continue;
      const gy = sim.env.groundAt(t.pos.x, t.pos.z, t.pos.y + 1);
      if (t.pos.y - gy > 1.0) continue; // a flying target is above the wave
      w.hits.add(t.id);
      const res = sim.strike(hero, w.spec, t, { from: { x: w.o.x, z: w.o.z }, push: { dist: 0, dir: 'away' }, wave: w.uid, at: along });
      sim.emit('breach:hit', { wave: w, target: t, result: res, along });
    }
    // Marks for the effect every metre of the front.
    while (w.lastMark + 1 <= w.front) {
      w.lastMark += 1;
      sim.emit('breach:mark', { wave: w, dist: w.lastMark, pos: { x: w.o.x + w.dir.x * w.lastMark, y: w.o.y, z: w.o.z + w.dir.z * w.lastMark } });
    }
    if (w.front >= w.len) {
      sim.emit('breach:end', { wave: w, stopped: w.len < w.spec.length ? w.reason : '' });
      list.splice(i, 1);
    }
    void prev;
  }
}

export function stepZones(sim, h) {
  const list = sim.zones;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i];
    if (sim.time < z.arrive) continue;
    list.splice(i, 1);
    const hero = sim.heroes[z.hero];
    const s = z.spec;
    const c = z.point;
    const results = [];
    for (const t of sim.targets()) {
      const d = dist2d(c, t.pos) - t.r;
      if (d > z.radius) continue;
      if (Math.abs(t.pos.y - c.y) > 3.5 + t.h) continue;
      // The mass comes from above: it is blocked by a ceiling over the target, not by a wall.
      if (!sim.env.los(up(c, 3), chestOf(t)) && !sim.env.los(up(t.pos, 3), up(t.pos, 0.2))) continue;
      results.push(sim.strike(hero, s, t, { wet: s.wet, from: { x: c.x, z: c.z }, push: { dist: s.displacement[t.tier] ?? 0, dir: 'away', from: { x: c.x, z: c.z } } }));
    }
    sim.emit('tidal:impact', { zone: z, pos: c, radius: z.radius, results: results.filter(Boolean), decorative: s.decorative_wet_ground_life });
  }
}

// ---------------------------------------------------------------------------------------------------------
// aiming (strong spells): selection and tracking during the preparation
// ---------------------------------------------------------------------------------------------------------
function camPoint(sim, hero) {
  const { origin, dir } = hero.cam;
  const hit = sim.env.pickGround(origin, dir, 120);
  if (hit) return { x: hit.x, y: hit.y, z: hit.z };
  // Looking at the sky: a point on the ground far ahead along the view.
  const f = Math.hypot(dir.x, dir.z) || 1;
  const x = hero.pos.x + (dir.x / f) * 30, z = hero.pos.z + (dir.z / f) * 30;
  return { x, y: sim.env.groundAt(x, z, hero.pos.y + 40), z };
}

function clampRange(hero, p, min, max) {
  let dx = p.x - hero.pos.x, dz = p.z - hero.pos.z;
  let d = Math.hypot(dx, dz);
  if (d < 1e-4) { dx = Math.sin(hero.camYaw); dz = Math.cos(hero.camYaw); d = 1; }
  const k = clamp(d, min, max) / d;
  return { x: hero.pos.x + dx * k, z: hero.pos.z + dz * k, clamped: k !== 1 };
}

/** Desired aim for the strong spell of `spec` (point / yaw / target) and whether it is valid and why not. */
function evalAim(sim, hero, spec, into) {
  const r = into || {};
  r.valid = true;
  r.reason = '';
  if (spec.id === 'M_R' || spec.id === 'R_F') {
    const raw = camPoint(sim, hero);
    const min = spec.range_min ?? 1.5, max = spec.range_max ?? spec.range;
    const c = clampRange(hero, raw, min, max);
    const y = sim.env.groundAt(c.x, c.z, raw.y + 2);
    r.desired = { x: c.x, y, z: c.z };
    // Two segments (docs/combat/01 §13): the staff to the point must be free; the point must be on this floor.
    if (!sim.env.los(hero.staff, up(r.desired, 1.0))) { r.valid = false; r.reason = spec.id === 'R_F' ? 'Обвал упрётся в препятствие' : 'Здесь стена'; r.why = 'wall'; }
    else if (Math.abs(y - hero.pos.y) > 6) { r.valid = false; r.reason = 'Другой этаж'; r.why = 'floor'; }
    else {
      const g = sim.env.allowed?.(hero.id, spec, r.desired);
      if (g && !g.ok) { r.valid = false; r.reason = g.reason || 'Здесь нельзя применять взрыв'; r.why = 'forbidden'; }
      else if (g?.warn) r.warn = g.warn;
    }
    r.yaw = yawTo(hero.pos, r.desired);
  } else if (spec.id === 'M_F') {
    r.yaw = hero.camYaw;
    const o = { x: hero.pos.x + Math.sin(r.yaw) * 0.6, z: hero.pos.z + Math.cos(r.yaw) * 0.6 };
    const line = sim.env.groundLine(o.x, o.z, o.x + Math.sin(r.yaw) * spec.length, o.z + Math.cos(r.yaw) * spec.length, hero.pos.y);
    r.len = Math.min(spec.length, line.len);
    r.stopReason = line.reason;
    if (r.len < 1.5) { r.valid = false; r.reason = 'Здесь стена. Выберу другой угол.'; r.why = 'wall'; }
    else {
      const g = sim.env.allowed?.(hero.id, spec, hero.pos);
      if (g && !g.ok) { r.valid = false; r.reason = g.reason || 'Здесь нельзя применять взрыв'; r.why = 'forbidden'; }
    }
  } else if (spec.id === 'R_R') {
    r.yaw = hero.camYaw;
    let tgt = hero.lockTarget?.alive && dist2d(hero.pos, hero.lockTarget.pos) <= spec.selection_range ? hero.lockTarget : null;
    if (!tgt) {
      let bs = Infinity;
      for (const t of sim.targets()) {
        const d = dist2d(hero.pos, t.pos);
        if (d > spec.selection_range) continue;
        const b = Math.abs(wrap(yawTo(hero.pos, t.pos) - hero.camYaw));
        if (b > 0.7) continue;
        if (!sim.env.los(hero.staff, chestOf(t))) continue;
        const sc = b * 12 + d * 0.15;
        if (sc < bs) { bs = sc; tgt = t; }
      }
    }
    r.target = tgt;
    if (tgt) {
      if (!sim.env.los(hero.staff, chestOf(tgt))) { r.valid = false; r.reason = 'Залп упрётся в стену'; r.why = 'wall'; }
    } else {
      // No target: a straight volley into the crosshair if the line from the staff is free.
      const dir = norm({ x: Math.sin(hero.camYaw), y: 0, z: Math.cos(hero.camYaw) });
      if (sim.env.rayWall(hero.staff, dir, 3) < 1.2) { r.valid = false; r.reason = 'Залп упрётся в стену'; r.why = 'wall'; }
      r.desired = { x: hero.pos.x + dir.x * 22, y: hero.staff.y, z: hero.pos.z + dir.z * 22 };
    }
  }
  return r;
}

export function aimInitial(sim, hero) {
  const aim = hero.aim;
  evalAim(sim, hero, aim.spec, aim);
  aim.point = aim.desired ? { ...aim.desired } : null;
}

/** Selection mode: the preview follows the camera freely. */
export function aimUpdate(sim, hero) {
  const aim = hero.aim;
  if (!aim) return;
  evalAim(sim, hero, aim.spec, aim);
  aim.point = aim.desired ? { ...aim.desired } : aim.point;
}

/** During the preparation the aim may still move, at a limited speed, until it locks. */
function aimTrack(sim, hero, a, h) {
  const s = a.spec;
  const info = evalAim(sim, hero, s, a.track || (a.track = {}));
  if (s.id === 'M_R') {
    if (a.t < s.aim_move_until && info.desired) {
      a.point.x = approach(a.point.x, info.desired.x, s.aim_point_speed * h);
      a.point.z = approach(a.point.z, info.desired.z, s.aim_point_speed * h);
      a.point.y = sim.env.groundAt(a.point.x, a.point.z, a.point.y + 3);
    }
    a.locked = a.t >= s.aim_move_until;
  } else if (s.id === 'R_F') {
    if (a.t < s.aim_lock_at && info.desired) {
      a.point.x = approach(a.point.x, info.desired.x, s.aim_point_speed * h);
      a.point.z = approach(a.point.z, info.desired.z, s.aim_point_speed * h);
      a.point.y = sim.env.groundAt(a.point.x, a.point.z, a.point.y + 3);
    }
    a.locked = a.t >= s.aim_lock_at;
  } else if (s.id === 'M_F') {
    if (a.t < s.aim_lock_at) a.fireYaw = approachAngle(a.fireYaw, info.yaw, s.aim_rotation_speed * DEG * h);
    a.locked = a.t >= s.aim_lock_at;
  } else if (s.id === 'R_R') {
    if (a.target && !a.target.alive) a.target = null; // a dead target is not replaced
    a.locked = a.t >= s.startup * 0.7;
    a.yaw = hero.camYaw;
  }
}

export const SKILLS = { begin, stepAction, cancel };
void SLOTS; void SPEC;
