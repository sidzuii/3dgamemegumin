// Packs a rigged Mixamo character (FBX, "With Skin") into a game body for the townsfolk (npc/NPCManager.js BODIES):
// FBX2glTF, the FBX's own animations dropped (the game retargets its clip library), textures re-encoded as WebP —
// the base colour of the body at `bodyTex`, the head at `headTex`, every other map at 1024.
// Usage: node tools/pack_body.mjs [in.fbx] [out.glb] [bodyTex] [headTex]
//   default: model/characters/Astrey/Astrey_Full.fbx -> public/models/bodies/astrey.glb 4096 2048
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdtempSync, accessSync, constants, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';

const [src = 'model/characters/Astrey/Astrey_Full.fbx', out = 'public/models/bodies/astrey.glb', bodyTex = '4096', headTex = '2048'] = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'body-'));
const osDir = { linux: 'Linux', darwin: 'Darwin', win32: 'Windows_NT' }[platform()];
let bin = join('node_modules/fbx2gltf/bin', osDir, platform() === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
try { accessSync(bin, constants.X_OK); } catch { const c = join(tmp, 'FBX2glTF'); copyFileSync(bin, c); chmodSync(c, 0o755); bin = c; } // tracked without +x
execFileSync(bin, ['--binary', '-i', src, '-o', join(tmp, 'body')], { stdio: 'ignore' });
// FBX2glTF unpacks the embedded textures next to the source (<name>.fbm): not wanted in the repository
rmSync(src.replace(/\.fbx$/i, '.fbm'), { recursive: true, force: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(join(tmp, 'body.glb'));
for (const a of doc.getRoot().listAnimations()) a.dispose();
// FBX2glTF repeats the base colour as a faint emissive map (FBX ambient): drop the copy, the game sets emissiveMap = map
for (const m of doc.getRoot().listMaterials()) if (m.getEmissiveTexture() && m.getEmissiveTexture().getName() === m.getBaseColorTexture()?.getName()) { m.setEmissiveTexture(null); m.setExtras({ ...m.getExtras(), emissiveFromBase: m.getEmissiveFactor()[0] }); m.setEmissiveFactor([0, 0, 0]); }
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!baseColor)/, resize: [1024, 1024], quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, pattern: /Body/i, resize: [+bodyTex, +bodyTex], quality: 86 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, pattern: /Head/i, resize: [+headTex, +headTex], quality: 86 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, pattern: /Eye|Iris/i, resize: [1024, 1024], quality: 86 }),
  dedup(),
  prune({ keepLeaves: true }),
);
mkdirSync(dirname(out), { recursive: true });
await io.write(out, doc);
const r = doc.getRoot();
console.log(out, 'meshes', r.listMeshes().length, 'skins', r.listSkins().length, 'textures', r.listTextures().map((t) => `${t.getName()} ${t.getSize()}`).join(', '));
