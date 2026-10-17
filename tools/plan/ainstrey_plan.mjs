// The plan of Ainstrey: statistics, checks and a picture.
//   node tools/plan/ainstrey_plan.mjs            counts + checks (exit code 1 on a problem)
//   node tools/plan/ainstrey_plan.mjs --svg      also writes docs/plan/ainstrey_plan.svg
import { writeFileSync } from 'node:fs';
import { cityPlan, planStats, CLASS, rectCorners, rectsOverlap, polyDist, insideCity, STYLE } from '../../src/world/AinstreyCityPlan.js';
import { CITY_WALL, DISTRICTS, TERRACES, CITADEL, BIG_RIVER, toLocal } from '../../src/world/AinstreyPlan.js';

const P = cityPlan();
const S = planStats();
console.log(JSON.stringify(S, null, 1));
let problems = 0;
const bad = (m) => { problems++; if (problems < 40) console.log('PROBLEM', m); };

// lots: inside the walls, off every street, off the squares and the key plots, off each other
for (const l of P.lots) {
  for (const [x, z] of rectCorners(l, 0)) if (!insideCity(x, z, 8)) { bad(`lot ${l.id} outside the wall margin`); break; }
  for (const st of P.streets) {
    if (st.cls === 'stair') continue;
    if (st.kind === 'lane' && st.block === l.block) { /* own lane */ }
    const need = st.width / 2 + 0.1;
    for (const [x, z] of rectCorners(l, 0)) if (polyDist(st.pts, x, z) < need) { bad(`lot ${l.id} (${l.district}) on street ${st.name}`); break; }
  }
}
for (let i = 0; i < P.lots.length; i++) for (let j = i + 1; j < P.lots.length; j++) {
  const a = P.lots[i], b = P.lots[j];
  if (Math.hypot(a.u - b.u, a.v - b.v) > 60) continue;
  if (rectsOverlap(a, b, 0.2)) bad(`lots ${a.id} and ${b.id} overlap`);
}
for (const o of [...P.squares, ...P.keys]) for (const l of P.lots) if (Math.hypot(o.u - l.u, o.v - l.v) < 90 && rectsOverlap(o, l, 0)) bad(`lot ${l.id} on ${o.id}`);
for (const k of P.keys) for (const st of P.streets) { if (st.cls === 'stair') continue; for (const [x, z] of rectCorners(k, 0)) if (polyDist(st.pts, x, z) < st.width / 2) { bad(`key ${k.id} on street ${st.name}`); break; } }
// terrace bands stay free of buildings
for (const l of P.lots) for (const T of TERRACES) for (const [x, z] of rectCorners(l, 0)) if (Math.abs(z - T.edge(x)) < T.half + 3) { bad(`lot ${l.id} on terrace ${T.id}`); break; }
// counts against the task
const inRange = (n, a, b) => n >= a && n <= b;
const want = [['quarters', S.quarters, 25, 35], ['streets and lanes (lines)', S.streetLines, 60, 90], ['squares', S.squares, 8, 10], ['courtyards', S.yards, 30, 40], ['buildings', S.lots + S.keys, 3000, 6000]];
for (const [n, v, a, b] of want) console.log(`${inRange(v, a, b) ? 'ok  ' : 'OUT '} ${n}: ${v} (task ${a}-${b})`);
console.log(problems ? problems + ' problem(s)' : 'plan ok');

if (process.argv.includes('--svg')) {
  const X = (u) => (u + 900).toFixed(1), Z = (v) => (v + 1200).toFixed(1);
  const pts = (a) => a.map(([u, v]) => `${X(u)},${Z(v)}`).join(' ');
  const col = { posad: '#e0b99a', steps: '#e8dcb8', guilds: '#b8c4d4', port: '#a8c4cc', old: '#d8c8a4', academy: '#b4cce0', garden: '#b8d4a8' };
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 3500" width="1000" height="1750"><rect width="2000" height="3500" fill="#f4efe4"/>`;
  o += `<polygon points="${pts(BIG_RIVER.points.map((p) => toLocal(p[0], p[1])).concat(BIG_RIVER.points.map((p) => toLocal(p[0], p[1])).reverse().map(([u, v]) => [u + 230, v])))}" fill="#a8cdd6"/>`;
  o += `<polygon points="${pts(CITY_WALL.map((n) => [n.u, n.v]))}" fill="#efe6d0" stroke="#7a8a7a" stroke-width="6"/>`;
  o += `<polygon points="${pts(CITADEL.pts)}" fill="#c8ccc8" stroke="#7a8a7a" stroke-width="3"/>`;
  for (const T of TERRACES) { const e = []; for (let u = -780; u <= 780; u += 20) e.push([u, T.edge(u)]); o += `<polyline points="${pts(e)}" fill="none" stroke="#c0b090" stroke-width="${T.half * 2}" opacity="0.5"/>`; }
  for (const s of P.streets) o += `<polyline points="${pts(s.pts)}" fill="none" stroke="${s.cls === 'axis' ? '#d8c9a0' : s.cls === 'lane' ? '#e6dcc0' : '#ddd0aa'}" stroke-width="${s.width}" stroke-linejoin="round"/>`;
  for (const q of P.squares) o += `<polygon points="${pts(rectCorners(q, 0))}" fill="#f0e6c8" stroke="#a09070" stroke-width="2"/><text x="${X(q.u)}" y="${Z(q.v)}" font-size="16" fill="#334" text-anchor="middle">${q.name}</text>`;
  for (const l of P.lots) o += `<polygon points="${pts(rectCorners(l, 0))}" fill="${col[l.district] || '#ccc'}" stroke="#665" stroke-width="0.8"/>`;
  for (const k of P.keys) o += `<polygon points="${pts(rectCorners(k, 0))}" fill="#7a5a6a" stroke="#223" stroke-width="1.5"/><text x="${X(k.u)}" y="${Z(k.v + 3)}" font-size="13" fill="#fff" text-anchor="middle">${k.name}</text>`;
  o += '</svg>';
  writeFileSync(new URL('../../docs/plan/ainstrey_plan.svg', import.meta.url), o);
  console.log('docs/plan/ainstrey_plan.svg written');
}
process.exit(problems ? 1 : 0);
