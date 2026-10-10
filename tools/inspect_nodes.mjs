// Print the node tree of a glTF (names, mesh/skin markers). Usage: node tools/inspect_nodes.mjs <file> [maxDepth]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const maxDepth = Number(process.argv[3] ?? 99);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
const fmt = (a) => a.map((v) => v.toFixed(3)).join(',');
const print = (n, d) => {
  if (d > maxDepth) return;
  const tags = [n.getMesh() ? 'mesh=' + n.getMesh().getName() : '', n.getSkin() ? 'skin' : ''].filter(Boolean).join(' ');
  console.log('  '.repeat(d) + n.getName() + ' t=' + fmt(n.getTranslation()) + ' r=' + fmt(n.getRotation()) + ' s=' + fmt(n.getScale()) + (tags ? ' [' + tags + ']' : ''));
  for (const c of n.listChildren()) print(c, d + 1);
};
for (const n of scene.listChildren()) print(n, 0);
const skins = root.listSkins();
if (skins.length) {
  const a = skins[0].listJoints().map((j) => j.getName()).join(',');
  const same = skins.every((s) => s.listJoints().map((j) => j.getName()).join(',') === a);
  console.log('skins', skins.length, 'same joint order:', same);
  console.log('joints', a);
}
