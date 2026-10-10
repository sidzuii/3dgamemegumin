// Usage: node inspect.mjs <file.gltf|glb> [--bones]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file = process.argv[2];
const doc = await io.read(file);
const root = doc.getRoot();
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const idx = p.getIndices();
  tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
}
console.log('file', file);
console.log('meshes', root.listMeshes().map(m => m.getName() + '(' + m.listPrimitives().map(p => p.getMaterial()?.getName()).join('|') + ')').join(', '));
console.log('tris', tris);
console.log('materials', root.listMaterials().map(m => `${m.getName()} col=${m.getBaseColorFactor().map(v => v.toFixed(2))} tex=${!!m.getBaseColorTexture()}`).join('; '));
console.log('textures', root.listTextures().map(t => `${t.getName() || t.getURI()} ${t.getSize()}`).join(', '));
console.log('skins', root.listSkins().map(s => s.getName() + ':' + s.listJoints().length).join(', '));
console.log('anims', root.listAnimations().map(a => a.getName()).join(', '));
const scene = root.getDefaultScene() || root.listScenes()[0];
const b = getBounds(scene);
console.log('bounds', b.min.map(v => v.toFixed(2)), b.max.map(v => v.toFixed(2)));
if (process.argv.includes('--bones')) {
  const s = root.listSkins()[0];
  const print = (n, d) => { console.log('  '.repeat(d) + n.getName() + ' t=' + n.getTranslation().map(v => v.toFixed(3)) + ' r=' + n.getRotation().map(v => v.toFixed(3)) + ' s=' + n.getScale().map(v=>v.toFixed(2))); for (const c of n.listChildren()) print(c, d + 1); };
  for (const n of scene.listChildren()) print(n, 0);
}
