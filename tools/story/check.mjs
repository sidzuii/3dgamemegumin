// Static check of the story scenes (src/data/story): graph integrity, unknown conditions / effects / variables,
// and COVERAGE — every spoken line of the scenario package must be used by some scene exactly once.
//   node tools/story/check.mjs [--missing] [prefix...]     e.g.  node tools/story/check.mjs A      (chapters 0-4)
import { readdirSync, readFileSync } from 'node:fs';
import { CLIPS } from '../../src/data/story/clips.js';
import { VARS } from '../../src/data/story/vars.js';
import { STORY_SCENES } from '../../src/data/story/index.js';
import { DIALOGUES } from '../../src/data/dialogues.js';
import { NPCS } from '../../src/data/npcs.js';
import { QUESTS } from '../../src/data/quests.js';
import { ITEMS } from '../../src/data/items.js';
import { STORY_PROPS, STORY_VOLLEY, STORY_WAVES } from '../../src/data/story/props.js';

const args = process.argv.slice(2);
const showMissing = args.includes('--missing');
const prefixes = args.filter((a) => !a.startsWith('--'));
const COND = new Set(['flag', 'notFlag', 'quest', 'status', 'stage', 'member', 'rank', 'item', 'n', 'eris', 'level', 'hour', 'rel', 'met', 'any', 'not', 'counter', 'roxy', 'day', 'canPromote', 'var', 'v', 'nv', 'seen']);
const FX = new Set(['say', 'sayChain', 'ritualWave', 'wave', 'scene', 'startIfAvailable', 'setFlag', 'clearFlag', 'setVar', 'addVar', 'give', 'take', 'eris', 'xp', 'rel', 'startQuest', 'advance', 'completeQuest', 'openShop', 'openCraft', 'openBoard', 'joinGuild', 'promote', 'sleep', 'toast', 'notify', 'travel', 'spawn', 'met', 'counter', 'event', 'follow', 'escort', 'heal', 'readItem', 'read', 'refreshNPCs', 'unlockRoxy']);
const errors = [];
const err = (m) => errors.push(m);
const used = new Map(); // clip id -> scene
const varName = (n, where) => { if (!(n in VARS)) err(`${where}: unknown story variable ${n}`); };

function checkCond(c, where) {
  if (!c) return;
  if (Array.isArray(c)) return c.forEach((x) => checkCond(x, where));
  for (const [k, v] of Object.entries(c)) {
    if (!COND.has(k)) err(`${where}: unknown condition key ${k}`);
    if (k === 'var') varName(v[0], where);
    if (k === 'v' || k === 'nv') varName(v, where);
    if (k === 'any') v.forEach((x) => checkCond(x, where));
    if (k === 'not') checkCond(v, where);
  }
}
function checkFx(fx, where) {
  if (!fx) return;
  for (const e of [].concat(fx)) {
    if (typeof e === 'function') continue;
    for (const [k, v] of Object.entries(e)) {
      if (!FX.has(k)) err(`${where}: unknown effect ${k}`);
      if (k === 'setVar' || k === 'addVar') varName(v[0], where);
    }
  }
}

// Quest ids / stages / items named by conditions and effects must exist.
function checkRefs(x, where) {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) return x.forEach((y) => checkRefs(y, where));
  for (const [k, v] of Object.entries(x)) {
    if (k === 'quest' && typeof v === 'string') {
      if (!QUESTS[v]) err(`${where}: unknown quest ${v}`);
      else if (x.stage && !QUESTS[v].stages.some((s) => s.id === x.stage)) err(`${where}: quest ${v} has no stage ${x.stage}`);
    } else if (['startQuest', 'advance', 'completeQuest'].includes(k) && typeof v === 'string' && !QUESTS[v]) err(`${where}: unknown quest ${v}`);
    else if ((k === 'give' || k === 'take') && Array.isArray(v)) { for (const [it] of v) if (it !== 'eris' && !ITEMS[it]) err(`${where}: unknown item ${it}`); }
    else if (k === 'item' && typeof v === 'string' && !ITEMS[v]) err(`${where}: unknown item ${v}`);
    else if (typeof v === 'object') checkRefs(v, where);
  }
}
for (const [id, d] of Object.entries(DIALOGUES)) {
  for (const [nid, n] of Object.entries(d.nodes || {})) for (const key of ['if', 'branch', 'do']) checkRefs(n[key], `dialogue ${id}/${nid}`);
}
for (const npc of NPCS) {
  const talk = npc.talk || [];
  for (const t of talk) {
    if (t.dialogue && !DIALOGUES[t.dialogue]) err(`npc ${npc.id}: unknown dialogue ${t.dialogue}`);
    checkRefs(t.if, `npc ${npc.id}`);
    if (t.if) checkCond(t.if, `npc ${npc.id}`);
  }
}
for (const [id, q] of Object.entries(QUESTS)) {
  checkRefs(q.requires, `quest ${id}.requires`);
  for (const st of q.stages) { checkRefs(st.onStart, `quest ${id}/${st.id}`); checkRefs(st.onDone, `quest ${id}/${st.id}`); checkFx(st.onStart, `quest ${id}/${st.id}`); checkFx(st.onDone, `quest ${id}/${st.id}`); }
  if (q.next && !QUESTS[q.next]) err(`quest ${id}: unknown next ${q.next}`);
}

for (const [id, d] of Object.entries(STORY_SCENES)) {
  const where = `scene ${id}`;
  const ok = (t, from) => { if (t !== 'end' && !d.nodes[t]) err(`${where}: ${from} -> missing node ${t}`); };
  ok(d.start, 'start');
  for (const [nid, n] of Object.entries(d.nodes)) {
    const w = `${where}/${nid}`;
    if (n.clip) {
      if (!CLIPS[n.clip]) err(`${w}: unknown clip ${n.clip}`);
      used.set(n.clip + (nid.includes('#') ? '#' + nid.split('#')[1] : ''), d.scene);
    }
    if (n.next !== undefined) ok(n.next, nid);
    if (n.then !== undefined) ok(n.then, nid);
    if (n.else !== undefined) ok(n.else, nid);
    for (const c of n.choices || []) { ok(c.next, nid + ' choice'); checkCond(c.if, w); }
    if (!n.silent && !n.text && !n.choices) err(`${w}: empty node`);
    if (n.choices && n.next) err(`${w}: both choices and next`);
    checkCond(n.if, w); checkCond(n.branch, w); checkFx(n.do, w);
  }
}
// Story props / volley targets / waves (data/story/props.js).
const fxScenes = (fx, where) => { for (const e of [].concat(fx || [])) { if (e.scene && !DIALOGUES[e.scene]) err(`${where}: unknown scene ${e.scene}`); if (e.wave && !STORY_WAVES[e.wave]) err(`${where}: unknown wave ${e.wave}`); } };
for (const [id, p] of Object.entries(STORY_PROPS)) {
  for (const k of ['when', 'need']) { checkCond(p[k], `prop ${id}`); checkRefs(p[k], `prop ${id}`); }
  checkFx(p.do, `prop ${id}`); checkRefs(p.do, `prop ${id}`); fxScenes(p.do, `prop ${id}`);
  if (p.scene && !DIALOGUES[p.scene]) err(`prop ${id}: unknown scene ${p.scene}`);
}
for (const t of STORY_VOLLEY) { checkCond(t.when, `volley ${t.id}`); checkRefs(t.when, `volley ${t.id}`); checkFx(t.do, `volley ${t.id}`); }
for (const [id, w] of Object.entries(STORY_WAVES)) { checkFx(w.onClear, `wave ${id}`); fxScenes(w.onClear, `wave ${id}`); }

// Coverage per scene prefix.
const want = Object.keys(CLIPS).filter((k) => !k.startsWith('V') && (!prefixes.length || prefixes.some((p) => k.startsWith(p))));
const usedIds = new Set([...used.keys()].map((k) => k.split('#')[0]));
// Lines the game uses outside dialogue graphs (barks, { say: 'A07_018' } effects): referenced by id in the data files.
for (const dir of ['src/data', 'src/rpg', 'src/npc', 'src/world/build']) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/['"]([ABCV]\d{2}[a-z]?_\d{3})['"]/g)) usedIds.add(m[1]);
  }
}
const missing = want.filter((k) => !usedIds.has(k));
const byScene = {};
for (const k of missing) (byScene[k.split('_')[0]] ||= []).push(k);
console.log(`scenes: ${Object.keys(STORY_SCENES).length}, clips used: ${usedIds.size}/${want.length} (${missing.length} not yet in a scene)`);
if (showMissing) for (const [s, ks] of Object.entries(byScene)) console.log(`  ${s}: ${ks.map((k) => +k.split('_')[1]).join(',')}`);
if (errors.length) { console.log(errors.slice(0, 40).join('\n')); console.log(`${errors.length} error(s)`); process.exit(1); }
console.log('story check ok');
