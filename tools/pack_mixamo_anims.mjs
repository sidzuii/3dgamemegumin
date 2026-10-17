// Packs Mixamo animation FBX files ("Without Skin", one clip each, all downloaded for the same character) into one GLB
// for the runtime retargeter (character/Retarget.js AnimationLibrary.addSource): the skeleton of the first file, every clip
// renamed after its file, plus a one-frame 'TPose' clip = the skeleton's rest pose (the Mixamo T-pose), used as the reference.
// Usage: node tools/pack_mixamo_anims.mjs [srcDir] [out.glb]
//   default: model/characters/Astrey/anim -> public/models/anim/mixamo.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { execFileSync } from 'node:child_process';
import { readdirSync, copyFileSync, chmodSync, mkdtempSync, accessSync, constants } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, basename } from 'node:path';

const srcDir = process.argv[2] || 'model/characters/Astrey/anim';
const out = process.argv[3] || 'public/models/anim/mixamo.glb';
// Clips the game uses (the locomotion stays on the main library: its foot-locked gait tuning).
const WANT = ['Standing Idle', 'Happy Idle', 'Looking Around', 'Talking', 'Talking2', 'Waving', 'Sitting Idle', 'Stand To Sit', 'Sit To Stand'];

const tmp = mkdtempSync(join(tmpdir(), 'mxpack-'));
const osDir = { linux: 'Linux', darwin: 'Darwin', win32: 'Windows_NT' }[platform()];
let bin = join('node_modules/fbx2gltf/bin', osDir, platform() === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
try { accessSync(bin, constants.X_OK); } catch { const c = join(tmp, 'FBX2glTF'); copyFileSync(bin, c); chmodSync(c, 0o755); bin = c; } // tracked without +x

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = readdirSync(srcDir).filter((f) => f.endsWith('.fbx') && WANT.includes(basename(f, '.fbx')));
files.sort((a, b) => WANT.indexOf(basename(a, '.fbx')) - WANT.indexOf(basename(b, '.fbx')));
if (!files.length) throw new Error('no clips in ' + srcDir);

let base = null;
const byName = new Map();
for (const f of files) {
  const name = basename(f, '.fbx');
  const glb = join(tmp, name.replace(/\W+/g, '_') + '.glb');
  execFileSync(bin, ['--binary', '-i', join(srcDir, f), '-o', glb.slice(0, -4)], { stdio: 'ignore' });
  const doc = await io.read(glb);
  const anim = doc.getRoot().listAnimations()[0];
  if (!anim) { console.warn('no animation in', f); continue; }
  if (!base) {
    base = doc;
    for (const n of doc.getRoot().listNodes()) byName.set(n.getName(), n);
    anim.setName(name);
    // the rest pose as a one-frame clip (the reference of the retargeter)
    const t = base.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1 / 30]));
    const pose = base.createAnimation('TPose');
    for (const n of base.getRoot().listNodes()) {
      if (!n.getName().startsWith('mixamorig')) continue;
      for (const [path, val, type] of [['rotation', n.getRotation(), 'VEC4'], ['translation', n.getTranslation(), 'VEC3']]) {
        if (path === 'translation' && !/Hips$/.test(n.getName())) continue;
        const o = base.createAccessor().setType(type).setArray(new Float32Array([...val, ...val]));
        const s = base.createAnimationSampler().setInput(t).setOutput(o).setInterpolation('LINEAR');
        pose.addSampler(s).addChannel(base.createAnimationChannel().setTargetNode(n).setTargetPath(path).setSampler(s));
      }
    }
    // the meshless skeleton only: drop anything else FBX2glTF made
    for (const m of base.getRoot().listMeshes()) m.dispose();
    continue;
  }
  // copy the clip onto the base skeleton (nodes matched by name)
  const a = base.createAnimation(name);
  for (const ch of anim.listChannels()) {
    const node = byName.get(ch.getTargetNode()?.getName());
    if (!node) continue;
    const s = ch.getSampler();
    const inp = base.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice());
    const outp = base.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice());
    const ns = base.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
    a.addSampler(ns).addChannel(base.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
}
// scale tracks of Mixamo clips are constant 1: drop them
for (const a of base.getRoot().listAnimations()) for (const ch of a.listChannels()) if (ch.getTargetPath() === 'scale') { const s = ch.getSampler(); ch.dispose(); s.dispose(); }
const buf = base.getRoot().listBuffers()[0];
for (const acc of base.getRoot().listAccessors()) acc.setBuffer(buf);
for (const b of base.getRoot().listBuffers().slice(1)) b.dispose();
await base.transform(resample(), dedup(), prune({ keepLeaves: true }));
await io.write(out, base);
console.log(out, 'clips:', base.getRoot().listAnimations().map((a) => a.getName()).join(', '));
