/**
 * Graphics quality presets + dynamic resolution.
 *
 * F9 cycles the preset (saved in localStorage). On first run integrated GPUs start on
 * "medium". While playing, the render scale drops step by step when frames take longer than
 * ~26 ms (and climbs back when there is headroom), so a weak GPU keeps a playable frame rate.
 */
export const PRESETS = {
  low: { label: 'Низкое', pixelRatio: 0.85, msaa: 0, shadows: false, shadowSize: 1024, bloom: false, treeNear: 20, treeMid: 36, treeFar: 200, detail: 45, lod: 80 },
  medium: { label: 'Среднее', pixelRatio: 1, msaa: 2, shadows: true, shadowSize: 1024, bloom: true, treeNear: 28, treeMid: 52, treeFar: 260, detail: 65, lod: 105 },
  high: { label: 'Высокое', pixelRatio: 1.5, msaa: 4, shadows: true, shadowSize: 2048, bloom: true, treeNear: 42, treeMid: 75, treeFar: 330, detail: 90, lod: 140 },
};
const ORDER = ['low', 'medium', 'high'];
const KEY = 'megumin-quality';

export class Quality {
  constructor(game) {
    this.game = game;
    this.scale = 1; // dynamic resolution factor
    this.acc = 0;
    this.frames = 0;
    this.timer = 0;
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    this.name = PRESETS[saved] ? saved : this._guess();
  }

  /** Integrated / mobile GPUs start on medium. */
  _guess() {
    try {
      const gl = this.game.renderer.getContext();
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      const r = String(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      if (/Intel|UHD|Iris|Radeon\(TM\) Graphics|Vega|Mali|Adreno|Apple GPU|Microsoft Basic/i.test(r)) return 'medium';
    } catch { /* no info */ }
    return 'high';
  }

  get preset() {
    return PRESETS[this.name];
  }

  /** Apply the current preset (after the world exists). */
  apply() {
    const g = this.game, p = this.preset;
    this._pixelRatio();
    for (const rt of [g.composer.renderTarget1, g.composer.renderTarget2]) {
      if (rt.samples !== p.msaa) {
        rt.samples = p.msaa;
        rt.dispose();
      }
    }
    g.bloom.enabled = p.bloom;
    const sun = g.world?.sun;
    if (sun) {
      sun.castShadow = p.shadows;
      if (sun.shadow.mapSize.x !== p.shadowSize) {
        sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    }
    if (g.world) {
      g.world.detailDistance = p.detail; // window inserts, shutters… (World.update)
      g.world.lodDistance = p.lod; // buildings: full model / proxy
    }
    if (g.world?.trees) {
      g.world.trees.near = p.treeNear;
      g.world.trees.far = p.treeFar;
      g.world.trees.mid = p.treeMid;
      g.world.trees.update(0, g.camera, true);
    }
  }

  _pixelRatio() {
    const g = this.game;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio) * this.scale;
    if (Math.abs(g.renderer.getPixelRatio() - pr) < 0.01) return;
    g.renderer.setPixelRatio(pr);
    g.composer.setPixelRatio(pr);
    g.composer.setSize(window.innerWidth, window.innerHeight);
  }

  cycle() {
    this.name = ORDER[(ORDER.indexOf(this.name) + 1) % ORDER.length];
    try { localStorage.setItem(KEY, this.name); } catch { /* storage blocked */ }
    this.scale = 1;
    this.apply();
    return this.preset.label;
  }

  /** Dynamic resolution: call every frame with the real frame time. */
  update(dt) {
    if (document.hidden || dt <= 0) return;
    this.acc += dt;
    this.frames++;
    this.timer += dt;
    if (this.timer < 1.5) return;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    this.timer = 0;
    const old = this.scale;
    if (avg > 1 / 38) this.scale = Math.max(0.6, this.scale * 0.88);
    else if (avg < 1 / 57 && this.scale < 1) this.scale = Math.min(1, this.scale * 1.06);
    if (this.scale !== old) this._pixelRatio();
  }

  /** Measured frames per second (for the on-screen counter). */
  fps(dt) {
    this._fpsT = (this._fpsT || 0) + dt;
    this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsT >= 0.5) {
      this._fps = Math.round(this._fpsN / this._fpsT);
      this._fpsT = 0;
      this._fpsN = 0;
    }
    return this._fps || 0;
  }
}
