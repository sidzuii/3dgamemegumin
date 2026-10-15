import * as THREE from 'three';
import { SPEC } from '../core/specs.js';

/**
 * Ground contours of the strong spells while they are being aimed and prepared (docs/combat/01 §14):
 *   Explosion  — two rings with a distinct dense centre; targets standing in the centre get their own mark;
 *   Crimson Breach — a strip from the staff, its real length (shortened before walls / drops) and an end mark;
 *   Tidal Collapse — a ring and a dotted arc from the staff to it;
 *   Water Volley — a ring at the chosen target (a thin line if the volley goes straight).
 * Warm amber for Megumin, cool white-blue for Roxy: red stays reserved for the enemies' danger areas. An invalid
 * place turns the contour grey with a cross; the reason is written on the HUD. The contour gets denser when locked.
 */
const _v = new THREE.Vector3();
const AMBER = [2.6, 1.15, 0.28];
const COOL = [0.7, 1.5, 2.3];
const GREY = [0.9, 0.55, 0.5];

function discMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Vector3(...AMBER) }, uA: { value: 1 }, uFill: { value: 0.1 }, uRing: { value: 0.1 }, uT: { value: 0 }, uTicks: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 uC; uniform float uA, uFill, uRing, uT, uTicks; varying vec2 vUv;
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float r = length(q);
        if (r > 1.0) discard;
        float ring = smoothstep(1.0 - uRing, 1.0 - uRing * 0.5, r) * (1.0 - smoothstep(0.985, 1.0, r));
        float a = atan(q.y, q.x);
        float ticks = uTicks * smoothstep(0.78, 0.8, r) * (1.0 - smoothstep(0.88, 0.9, r)) * step(0.5, fract(a * 3.0 + uT * 0.4));
        float fill = uFill * (0.6 + 0.4 * smoothstep(0.0, 1.0, r));
        gl_FragColor = vec4(uC * (ring * 1.2 + fill + ticks * 0.6) * uA, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  });
}

export class AimOverlay {
  constructor(game) {
    this.game = game;
    this.discs = [];
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, discMaterial());
      m.visible = false;
      m.renderOrder = 9;
      game.scene.add(m);
      this.discs.push(m);
    }
    this.strip = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
      new THREE.ShaderMaterial({
        uniforms: { uC: { value: new THREE.Vector3(...AMBER) }, uA: { value: 1 }, uT: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 uC; uniform float uA, uT; varying vec2 vUv;
          void main(){
            float side = abs(vUv.x - 0.5) * 2.0;
            float edge = smoothstep(0.82, 1.0, side);
            float dash = 0.55 + 0.45 * step(0.5, fract(vUv.y * 24.0 - uT * 1.5));
            float endcap = smoothstep(0.93, 1.0, vUv.y);
            gl_FragColor = vec4(uC * (0.14 * dash + edge * 0.9 + endcap * 0.8) * uA, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
      }),
    );
    this.strip.visible = false;
    this.strip.renderOrder = 9;
    game.scene.add(this.strip);
    // Dotted arc (Tidal Collapse): a line with a handful of points.
    const lg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()));
    this.arc = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0x9fd8ff, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arc.visible = false;
    this.arc.frustumCulled = false;
    game.scene.add(this.arc);
    this.used = 0;
    this.hint = '';
  }

  _disc(center, radius, color, alpha, fill, ring, ticks = 0) {
    const m = this.discs[this.used++];
    if (!m) return null;
    m.visible = true;
    m.position.set(center.x, this.game.world.groundAt(center.x, center.z, center.y + 2.5) + 0.07, center.z);
    m.scale.setScalar(radius);
    const u = m.material.uniforms;
    u.uC.value.set(...color);
    u.uA.value = alpha;
    u.uFill.value = fill;
    u.uRing.value = ring;
    u.uT.value = this.game.time;
    u.uTicks.value = ticks;
    return m;
  }

  hide() {
    for (const d of this.discs) d.visible = false;
    this.strip.visible = false;
    this.arc.visible = false;
    this.used = 0;
    this.hint = '';
  }

  /** Draw the contour for the controlled heroine (aim mode or the preparation of a strong spell). */
  update(combat) {
    const hero = combat.active;
    this.used = 0;
    for (const d of this.discs) d.visible = false;
    this.strip.visible = false;
    this.arc.visible = false;
    this.hint = '';
    if (!hero || hero.absent) return;
    const act = hero.state === 'action' && hero.act.spec.kind === 'strong' && !hero.act.released ? hero.act : null;
    const aim = hero.aim;
    if (!aim && !act) return;
    const spec = aim ? aim.spec : act.spec;
    const valid = aim ? aim.valid : true;
    const locked = !!act?.locked;
    const point = aim ? aim.point : act.point;
    const alpha = locked ? 1 : 0.8;
    const col = valid ? (hero.id === 'megumin' ? AMBER : COOL) : GREY;
    if (aim && !valid) this.hint = aim.reason;
    else if (aim?.warn) this.hint = aim.warn;
    const g = this.game;
    if (spec.id === 'M_R' && point) {
      // Outer contour 5.5 m, dense centre 2.5 m.
      this._disc(point, spec.zones[1].radius, col, alpha * 0.8, locked ? 0.05 : 0.025, 0.035, 1);
      this._disc(point, spec.zones[0].radius, col, alpha, locked ? 0.2 : 0.11, 0.06, 0);
      if (valid) {
        for (const t of combat.env.hostiles()) {
          if (t.isDummy) continue;
          const d = Math.hypot(t.pos.x - point.x, t.pos.z - point.z);
          if (d - t.r <= spec.zones[0].radius) this._disc(t.pos, t.r + 0.35, [2.8, 0.5, 0.2], 0.9, 0.05, 0.12, 0);
        }
      }
    } else if (spec.id === 'R_F' && point) {
      this._disc(point, spec.radius, col, alpha, locked ? 0.1 : 0.05, 0.05, 1);
      this._disc(point, 0.5, col, alpha, 0.4, 0.3, 0);
      this._arcTo(hero, point);
    } else if (spec.id === 'M_F') {
      const yaw = aim ? aim.yaw : act.fireYaw;
      const len = aim ? aim.len : act.track?.len ?? spec.length;
      this.strip.visible = true;
      const p = hero.pos;
      this.strip.position.set(p.x + Math.sin(yaw) * 0.6, g.world.groundAt(p.x, p.z, p.y + 2) + 0.08, p.z + Math.cos(yaw) * 0.6);
      this.strip.rotation.y = yaw + Math.PI;
      this.strip.scale.set(spec.width, 1, Math.max(0.2, len));
      const u = this.strip.material.uniforms;
      u.uC.value.set(...col);
      u.uA.value = alpha;
      u.uT.value = g.time;
      // Where the wave stops (end mark on the ground).
      const ex = p.x + Math.sin(yaw) * (0.6 + len), ez = p.z + Math.cos(yaw) * (0.6 + len);
      this._disc({ x: ex, y: p.y, z: ez }, spec.width * 0.75, col, alpha, 0.2, 0.2, 0);
    } else if (spec.id === 'R_R') {
      const t = aim ? aim.target : act?.target;
      if (t && t.alive) {
        this._disc(t.pos, t.r + 0.55, col, alpha, 0.08, 0.12, 1);
      } else if (aim?.desired) {
        this.hint = aim.valid ? 'Прямой залп' : this.hint;
      }
    }
  }

  _arcTo(hero, point) {
    const pos = this.arc.geometry.attributes.position;
    const from = _v.set(hero.staff.x, hero.staff.y, hero.staff.z);
    const n = pos.count;
    const h = 2.2 + from.distanceTo(new THREE.Vector3(point.x, point.y, point.z)) * 0.18;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      pos.setXYZ(i, from.x + (point.x - from.x) * k, from.y + (point.y - from.y) * k + Math.sin(k * Math.PI) * h, from.z + (point.z - from.z) * k);
    }
    pos.needsUpdate = true;
    this.arc.computeLineDistances();
    this.arc.visible = true;
  }
}
void SPEC;
