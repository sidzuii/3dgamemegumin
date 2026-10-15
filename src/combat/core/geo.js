/**
 * Flat geometry helpers of the combat core (no THREE: the core runs in node tests too).
 * Points are plain `{ x, y, z }`; yaw `a` faces `(sin a, cos a)`; a positive relative bearing = to the left.
 */
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
/** Bearing of `to` relative to a body at `from` facing `yaw` (radians, + = left). */
export const bearingTo = (from, yaw, to) => wrap(yawTo(from, to) - yaw);
/** Move angle `cur` towards `target` by at most `step`. */
export const approachAngle = (cur, target, step) => cur + clamp(wrap(target - cur), -step, step);
/** Move `cur` towards `target` by at most `step`. */
export const approach = (cur, target, step) => cur + clamp(target - cur, -step, step);

/** Distance from p to the segment ab in the XZ plane; also returns the parameter t of the closest point. */
export function segDist2d(a, b, p, out) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  const t = l2 < 1e-9 ? 0 : clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
  if (out) out.t = t;
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}

/** Do the angular intervals [a0, a1] and [b0, b1] (radians, in the same frame, a0 <= a1) overlap? */
export const overlap = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;

/** Vertical overlap of a body (feet y, height h) with a slab [y0, y1]. */
export const overlapY = (feetY, h, y0, y1) => feetY <= y1 && feetY + h >= y0;
