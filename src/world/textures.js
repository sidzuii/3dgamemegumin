import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';

/** Small tileable grey-scale noise used as a subtle detail map (128 px, ~no memory). */
export function makeNoiseTexture(size = 128, seed = 1, contrast = 0.35) {
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  // Tileable value noise: sum of wrapped octaves.
  const octave = (cells) => {
    const g = Array.from({ length: cells * cells }, () => rng());
    return (x, y) => {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  };
  const o = [octave(4), octave(8), octave(16), octave(32)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = o[0](x, y) * 0.4 + o[1](x, y) * 0.3 + o[2](x, y) * 0.2 + o[3](x, y) * 0.1;
      const c = Math.round(255 * (1 - contrast + contrast * v * 1.15));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, c);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft radial sprite (used by particles). */
export function makeSoftSprite(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Puffy smoke sprite: several overlapping soft blobs with noise. */
export function makeSmokeSprite(size = 128, seed = 5) {
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const r = size * (0.12 + rng() * 0.2);
    const a = rng() * Math.PI * 2;
    const d = rng() * size * 0.22;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const al = 0.18 + rng() * 0.2;
    g.addColorStop(0, `rgba(255,255,255,${al})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fade the square's edges.
  ctx.globalCompositeOperation = 'destination-in';
  const m = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = m;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Magic circle texture (white on transparent, tinted in shader):
 * concentric rings, procedural rune glyphs, hexagram and inner star.
 */
export function makeMagicCircleTexture(size = 512, seed = 3, variant = 0) {
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.translate(c, c);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = size * 0.012;

  const ring = (r, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const R = c * 0.96;
  ring(R, size * 0.012);
  ring(R * 0.93, size * 0.005);
  ring(R * 0.78, size * 0.008);
  ring(R * 0.72, size * 0.004);

  // Rune band between 0.78R and 0.93R.
  const runes = 34;
  for (let i = 0; i < runes; i++) {
    const a = (i / runes) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -R * 0.855);
    ctx.lineWidth = size * 0.0045;
    const s = R * 0.05;
    ctx.beginPath();
    const strokes = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < strokes; k++) {
      const x0 = (rng() - 0.5) * s * 1.4, y0 = (rng() - 0.5) * s * 1.8;
      const x1 = (rng() - 0.5) * s * 1.4, y1 = (rng() - 0.5) * s * 1.8;
      ctx.moveTo(x0, y0);
      if (rng() < 0.3) ctx.arc(x0, y0, s * 0.35, 0, Math.PI * (1 + rng()));
      else ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    if (rng() < 0.3) {
      ctx.beginPath();
      ctx.arc(0, s * 0.9, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Star polygons.
  const star = (r, n, step, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = ((i * step) % n) / n * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  if (variant === 0) {
    star(R * 0.72, 6, 2, size * 0.007); // hexagram (two triangles via step 2 twice)
    ctx.rotate(Math.PI / 6);
    star(R * 0.72, 6, 2, size * 0.007);
    ctx.rotate(-Math.PI / 6);
    ring(R * 0.42, size * 0.006);
    star(R * 0.42, 5, 2, size * 0.005);
  } else {
    star(R * 0.72, 8, 3, size * 0.006);
    ring(R * 0.5, size * 0.006);
    ring(R * 0.46, size * 0.003);
  }
  // Small satellite circles.
  const sats = variant === 0 ? 6 : 8;
  for (let i = 0; i < sats; i++) {
    const a = (i / sats) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -R * 0.72);
    ring(R * 0.06, size * 0.004);
    ctx.restore();
  }
  ring(R * 0.14, size * 0.006);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.05, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** Radial scorch mark for the ground after an explosion. */
export function makeScorchTexture(size = 256, seed = 9) {
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(10,6,4,0.95)');
  g.addColorStop(0.45, 'rgba(25,14,8,0.85)');
  g.addColorStop(0.75, 'rgba(40,24,14,0.45)');
  g.addColorStop(1, 'rgba(40,24,14,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Radial streaks.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = c * (0.55 + rng() * 0.3);
    ctx.strokeStyle = `rgba(0,0,0,${0.2 + rng() * 0.4})`;
    ctx.lineWidth = 2 + rng() * 6;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Paving textures (tileable, procedural): a colour map and a bump map.
 *  'cobble' — rounded cobblestones in staggered rows with dark mortar (streets);
 *  'flag'   — large dressed slabs with thin joints, wear and the odd crack (squares).
 * Both repeat every 2 m (World planar UVs, 0.5 per metre) and are drawn lit from the top left.
 */
export function makePavingTextures(kind = 'cobble', size = 512, seed = 11) {
  const rng = mulberry32(seed);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const col = mk(), hgt = mk();
  const C = col.getContext('2d'), Hh = hgt.getContext('2d');
  C.fillStyle = kind === 'cobble' ? '#4a443c' : '#6a645a';
  C.fillRect(0, 0, size, size);
  Hh.fillStyle = '#000';
  Hh.fillRect(0, 0, size, size);
  const palette = kind === 'cobble'
    ? [[150, 144, 132], [168, 160, 146], [136, 134, 130], [158, 148, 130], [124, 122, 120], [176, 168, 150], [142, 136, 122]]
    : [[186, 178, 164], [176, 170, 160], [196, 188, 172], [168, 164, 156], [182, 174, 158]];
  const pick = () => palette[Math.floor(rng() * palette.length)];
  const stone = (x, y, w, h, r, base) => {
    const j = 0.88 + rng() * 0.24;
    const [R, G, B] = base.map((v) => Math.min(255, v * j));
    // Wrap-around copies keep the tile seamless.
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const X = x + ox, Y = y + oy;
      if (X + w < 0 || Y + h < 0 || X > size || Y > size) continue;
      const g = C.createLinearGradient(X, Y, X + w, Y + h);
      g.addColorStop(0, `rgb(${R * 1.12 | 0},${G * 1.12 | 0},${B * 1.1 | 0})`);
      g.addColorStop(1, `rgb(${R * 0.84 | 0},${G * 0.84 | 0},${B * 0.84 | 0})`);
      C.fillStyle = g;
      C.beginPath(); C.roundRect(X, Y, w, h, r); C.fill();
      // Height: a soft dome (bright centre, falling to the edges).
      const hg = Hh.createRadialGradient(X + w / 2, Y + h / 2, 1, X + w / 2, Y + h / 2, Math.max(w, h) * 0.62);
      hg.addColorStop(0, '#fff'); hg.addColorStop(0.55, '#c8c8c8'); hg.addColorStop(1, '#383838');
      Hh.fillStyle = hg;
      Hh.beginPath(); Hh.roundRect(X, Y, w, h, r); Hh.fill();
    }
    // Speckle / wear on the stone face.
    for (let k = 0; k < Math.round(w * h / 90); k++) {
      const sx = x + rng() * w, sy = y + rng() * h, v = rng() < 0.5 ? 255 : 0;
      C.fillStyle = `rgba(${v},${v},${v},${0.05 + rng() * 0.07})`;
      C.fillRect(((sx % size) + size) % size, ((sy % size) + size) % size, 1 + rng() * 2, 1 + rng() * 2);
    }
  };
  if (kind === 'cobble') {
    const rows = 8, rh = size / rows, gap = 5;
    for (let r = 0; r < rows; r++) {
      const n = 5 + Math.floor(rng() * 2);
      const wts = Array.from({ length: n }, () => 0.7 + rng() * 0.7);
      const sum = wts.reduce((a, b) => a + b, 0);
      let x = rng() * size;
      for (let i = 0; i < n; i++) {
        const w = (wts[i] / sum) * size;
        stone(x + gap / 2, r * rh + gap / 2 + (rng() - 0.5) * 2, w - gap, rh - gap - rng() * 3, 11 + rng() * 5, pick());
        x += w;
      }
    }
  } else {
    // Slabs: rows of 128 px height, slab widths 128 / 192 / 256, staggered; thin joints.
    const rows = 4, rh = size / rows, gap = 3;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * 64;
      const ws = [];
      let acc = 0;
      while (acc < size) { const w = [128, 192, 128, 256][Math.floor(rng() * 4)]; const ww = Math.min(w, size - acc); ws.push(ww); acc += ww; }
      for (const w of ws) {
        stone(x + gap / 2, r * rh + gap / 2, w - gap, rh - gap, 4, pick());
        // The odd hairline crack.
        if (rng() < 0.18) {
          C.strokeStyle = 'rgba(40,36,30,0.45)'; C.lineWidth = 1.2;
          C.beginPath(); const cx = x + rng() * w, cy = r * rh + rng() * rh; C.moveTo(cx, cy); C.lineTo(cx + (rng() - 0.5) * 50, cy + (rng() - 0.5) * 50); C.stroke();
        }
        x += w;
      }
    }
  }
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(hgt);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, bump };
}
