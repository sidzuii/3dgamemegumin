// KayKit Skeletons (CC0): copies the rigged characters and packs their hand-held gear into one GLB.
//   node tools/pack_skeletons.mjs
// Output: public/models/enemies/Skeleton_<Name>.glb (rig 'Rig_Medium', no clips) and
// Skeleton_Gear.glb (top-level nodes named after the source file, grip at the origin).
import { copyFileSync, mkdirSync } from 'node:fs';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, unpartition } from '@gltf-transform/functions';

const SRC = 'model/assets-for-project/KayKit_Skeletons_1.1_FREE';
const OUT = 'public/models/enemies';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
mkdirSync(OUT, { recursive: true });

for (const n of ['Warrior', 'Minion', 'Rogue']) copyFileSync(`${SRC}/characters/gltf/Skeleton_${n}.glb`, `${OUT}/Skeleton_${n}.glb`);

const GEAR = ['Blade', 'Axe', 'Staff', 'Shield_Small_A', 'Shield_Small_B', 'Shield_Large_A', 'Shield_Large_B', 'Crossbow', 'Quiver'];
const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('gear');
doc.getRoot().setDefaultScene(scene);
for (const g of GEAR) {
  const src = await io.read(`${SRC}/assets/gltf/Skeleton_${g}.gltf`);
  const map = mergeDocuments(doc, src);
  const merged = map.get(src.getRoot().getDefaultScene() || src.getRoot().listScenes()[0]);
  const holder = doc.createNode(g);
  for (const c of merged.listChildren()) { merged.removeChild(c); holder.addChild(c); }
  scene.addChild(holder);
  merged.dispose();
}
await doc.transform(unpartition(), dedup(), prune({ keepLeaves: true }));
for (const t of doc.getRoot().listTextures()) t.setURI('skeleton_texture.png');
await io.write(`${OUT}/Skeleton_Gear.glb`, doc);
console.log('skeletons packed:', GEAR.length, 'gear pieces');
