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
