import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../core/math.js';
import { SUN_DIR } from './World.js';

/**
 * Day/night lighting driven by the game clock (hours 0..24): sun/moon direction and colour,
 * hemisphere + IBL intensity, fog and sky colours, glowing windows and street lamps.
 * Underground (`indoor`) the sky light is replaced by dim torch-lit ambience. An active
 * Explosion darkens the world through `spellDim` (0..1).
 */
const C = (h) => new THREE.Color(h);
const SKY = {
  dayTop: C(0x3d7fd6), dayHorizon: C(0xcfe4f4), dayBottom: C(0x8fa08a),
  duskTop: C(0x3a4f8a), duskHorizon: C(0xf2a070), duskBottom: C(0x6a5a5a),
  nightTop: C(0x050914), nightHorizon: C(0x16213a), nightBottom: C(0x0a0d14),
};
const FOG = { day: C(0xcfe4f4), dusk: C(0xd8a888), night: C(0x0c1322), cave: C(0x0b0a10) };
const SUN = { day: C(0xfff0dc), dusk: C(0xffa060), moon: C(0x8fa8ff) };

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export class DayNight {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.indoor = 0; // 0..1 (smoothed)
    this.spellDim = 0;
    this.night = 0;
    this.dusk = 0;
  }

  /** hour: 0..24 (fractional). indoorTarget: 0|1. */
  update(dt, hour, indoorTarget) {
    const W = this.world;
    this.indoor = damp(this.indoor, indoorTarget, 3, dt);
    const a = ((hour - 6) / 12) * Math.PI; // 0 at sunrise, PI at sunset
    const el = Math.sin(a); // >0 day
    const day = smoothstep(-0.08, 0.22, el);
    const dusk = (1 - smoothstep(0.05, 0.35, Math.abs(el))) * smoothstep(-0.25, 0.0, el + 0.2);
    this.night = 1 - day;
    this.dusk = dusk;
    // Light direction: the sun by day, the moon at night (keeps shadows readable).
    if (el > -0.02) SUN_DIR.set(Math.cos(a), Math.max(0.12, el * 0.9 + 0.1), 0.35).normalize();
    else SUN_DIR.set(-Math.cos(a) * 0.6, 0.55 + Math.abs(el) * 0.3, -0.45).normalize();
    // Quantise the direction a little so shadow texel snapping stays stable.
    SUN_DIR.set(Math.round(SUN_DIR.x * 200) / 200, Math.round(SUN_DIR.y * 200) / 200, Math.round(SUN_DIR.z * 200) / 200).normalize();

    const dim = 1 - this.spellDim * 0.55;
    const inside = this.indoor;
    // Sun / moon light.
    const sunI = day * (2.2 + 0.9 * smoothstep(0.1, 0.6, el)) + this.night * 0.5;
    W.sun.intensity = sunI * dim * (1 - inside);
    _c.copy(SUN.day).lerp(SUN.dusk, dusk * 0.8);
    W.sun.color.copy(_c.lerp(SUN.moon, this.night));
    W.sunBaseIntensity = W.sun.intensity;
    // Ambient.
    W.hemi.intensity = (0.55 * day + 0.22 * this.night) * (1 - this.spellDim * 0.6) * (1 - inside * 0.75);
    W.hemi.color.copy(_c.set(0xcfe3ff).lerp(_c2.set(0x5a6aa8), this.night));
    W.hemi.groundColor.copy(_c.set(0x5b4a33).lerp(_c2.set(0x1a1820), this.night));
    this.scene.environmentIntensity = (0.55 * day + 0.12 * this.night) * (1 - this.spellDim * 0.5) * (1 - inside * 0.85);
    W.rim.intensity = (1.15 * day + 0.35 * this.night) * (1 - inside * 0.7);
    // Sky.
    const u = W.sky.material.uniforms;
    u.uTop.value.copy(SKY.dayTop).lerp(SKY.duskTop, dusk).lerp(SKY.nightTop, this.night);
    u.uHorizon.value.copy(SKY.dayHorizon).lerp(SKY.duskHorizon, dusk).lerp(SKY.nightHorizon, this.night);
    u.uBottom.value.copy(SKY.dayBottom).lerp(SKY.duskBottom, dusk).lerp(SKY.nightBottom, this.night);
    u.uSunDir.value.copy(SUN_DIR);
    u.uNight.value = this.night;
    u.uDim.value = this.spellDim * 0.8;
    // Fog.
    const fog = this.scene.fog;
    _c.copy(FOG.day).lerp(FOG.dusk, dusk).lerp(FOG.night, this.night);
    fog.color.copy(_c.lerp(FOG.cave, inside));
    // Open country of the Ainstrey sheet is seen far (the capital must show from the chalk slopes): `viewTarget` is set by
    // the region the player is in (MapData `view`), the scale eases in.
    W.viewScale += ((W.viewTarget ?? 1) - W.viewScale) * Math.min(1, dt * 1.2);
    const vs = W.viewScale;
    fog.near = 90 * vs * (1 - inside) + 6 * inside;
    fog.far = 420 * vs * (1 - inside) + 60 * inside;
    // Windows + lamps glow at night (and stay warm underground).
    const glow = clamp(this.night * 1.2 + dusk * 0.4, 0, 1);
    W.mats.window.emissiveIntensity = glow * 1.3;
    W.mats.lampGlass.emissiveIntensity = 0.15 + glow * 1.6 + inside * 1.2;
    W.nightFactor = Math.max(glow, inside);
    return { night: this.night, dusk };
  }
}
