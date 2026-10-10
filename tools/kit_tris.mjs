import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const k of process.argv.slice(2)) {
  const doc = await io.read(`public/models/kits/${k}.glb`);
  const rows = [];
  for (const h of doc.getRoot().getDefaultScene().listChildren()) {
    let tris = 0;
    h.traverse((n) => { const m = n.getMesh(); if (m) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; });
    rows.push(`${h.getName()}:${tris}`);
  }
  console.log(k, rows.join(' '));
}
