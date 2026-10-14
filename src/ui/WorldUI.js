import * as THREE from 'three';

/**
 * World-anchored DOM overlays: enemy HP bars, floating damage numbers, alert marks
 * and the boss bar. All elements are pooled; positions are projected every frame and
 * written with transforms only (no layout thrash).
 */
const _v = new THREE.Vector3();

export class WorldUI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('world-ui');
    this.bars = [];
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'ehp';
      el.innerHTML = '<div class="ehp-trail"></div><div class="ehp-fill"></div>';
      this.root.appendChild(el);
      this.bars.push({ el, fill: el.lastChild, trail: el.firstChild, enemy: null, trailV: 1 });
    }
    this.numbers = [];
    for (let i = 0; i < 28; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      this.root.appendChild(el);
      this.numbers.push({ el, t: 1, pos: new THREE.Vector3(), dx: 0 });
    }
    this.alerts = [];
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'alert-mark';
      el.textContent = '!';
      this.root.appendChild(el);
      this.alerts.push({ el, t: 1, enemy: null });
    }
    this.boss = {
      root: document.getElementById('boss-bar'),
      name: document.getElementById('boss-name'),
      fill: document.getElementById('boss-fill'),
      trail: document.getElementById('boss-trail'),
      trailV: 1,
      current: null,
    };
  }

  damage(pos, amount, big = false) {
    const n = this.numbers.find((x) => x.t >= 1) || this.numbers[0];
    n.t = 0;
    n.pos.copy(pos);
    n.dx = (Math.random() - 0.5) * 40;
    n.el.textContent = amount;
    n.el.className = 'dmg' + (big ? ' big' : '');
  }

  /** Short floating word over a point ('Уклон!', 'Контратака!'). */
  text(pos, label) {
    const n = this.numbers.find((x) => x.t >= 1) || this.numbers[0];
    n.t = 0;
    n.pos.copy(pos).setY(pos.y + 1.9);
    n.dx = 0;
    n.el.textContent = label;
    n.el.className = 'dmg word';
  }

  alert(enemy) {
    const a = this.alerts.find((x) => x.t >= 1) || this.alerts[0];
    a.t = 0;
    a.enemy = enemy;
  }

  _project(p) {
    _v.copy(p).project(this.game.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight };
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera.position;
    // --- enemy HP bars ---
    const candidates = [];
    for (const e of g.enemies.list) {
      if (!e.alive || e.isBoss) continue;
      if (!(e.aggroed || e.hp < e.maxHp)) continue;
      const d = e.position.distanceTo(cam);
      if (d < 32) candidates.push([d, e]);
    }
    candidates.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.bars.length; i++) {
      const b = this.bars[i];
      const c = candidates[i];
      if (!c) {
        if (b.enemy) b.el.style.display = 'none';
        b.enemy = null;
        continue;
      }
      const e = c[1];
      if (b.enemy !== e) {
        b.enemy = e;
        b.trailV = e.hp / e.maxHp;
      }
      const s = this._project(e.head(_v));
      if (!s) {
        b.el.style.display = 'none';
        continue;
      }
      const f = Math.max(0, e.hp / e.maxHp);
      b.trailV = f > b.trailV ? f : b.trailV + (f - b.trailV) * (1 - Math.exp(-3 * dt));
      b.el.style.display = 'block';
      const scale = Math.max(0.55, Math.min(1, 14 / c[0]));
      b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      b.fill.style.transform = `scaleX(${f.toFixed(3)})`;
      b.trail.style.transform = `scaleX(${b.trailV.toFixed(3)})`;
    }
    // --- damage numbers ---
    for (const n of this.numbers) {
      if (n.t >= 1) {
        if (n.el.style.opacity !== '0') n.el.style.opacity = '0';
        continue;
      }
      n.t += dt / 0.9;
      const s = this._project(_v.copy(n.pos).setY(n.pos.y + n.t * 0.9));
      if (!s) {
        n.el.style.opacity = '0';
        continue;
      }
      const pop = n.t < 0.12 ? 1 + (0.12 - n.t) * 5 : 1;
      n.el.style.opacity = String(Math.max(0, 1 - Math.max(0, n.t - 0.55) / 0.45));
      n.el.style.transform = `translate(${s.x + n.dx * n.t}px, ${s.y}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
    }
    // --- alert marks ---
    for (const a of this.alerts) {
      if (a.t >= 1 || !a.enemy) {
        if (a.el.style.opacity !== '0') a.el.style.opacity = '0';
        continue;
      }
      a.t += dt / 0.9;
      const s = this._project(a.enemy.head(_v).setY(_v.y + 0.35));
      if (!s) continue;
      const k = a.t < 0.15 ? a.t / 0.15 : 1;
      a.el.style.opacity = String(1 - Math.max(0, a.t - 0.6) / 0.4);
      a.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%) scale(${(0.6 + 0.5 * k).toFixed(2)})`;
    }
    // --- boss bar ---
    const bossE = g.enemies.activeBoss();
    const B = this.boss;
    if (bossE !== B.current) {
      B.current = bossE;
      B.root.classList.toggle('show', !!bossE);
      if (bossE) {
        B.name.textContent = bossE.type.name;
        B.trailV = bossE.hp / bossE.maxHp;
      }
    }
    if (bossE) {
      const f = Math.max(0, bossE.hp / bossE.maxHp);
      B.trailV = f > B.trailV ? f : B.trailV + (f - B.trailV) * (1 - Math.exp(-2.5 * dt));
      B.fill.style.transform = `scaleX(${f.toFixed(3)})`;
      B.trail.style.transform = `scaleX(${B.trailV.toFixed(3)})`;
    }
  }
}
