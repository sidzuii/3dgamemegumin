// Optimises the user's single-object models (model/object/*, Tripo / Blender exports) for the game: weld, simplify to a
// triangle budget (meshoptimizer), textures resized and re-encoded as WebP, pruned. Output: public/models/objects/<id>.glb.
// Usage: node tools/pack_objects.mjs [id ...]   (no ids = all)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, textureCompress, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

// id: [source, triangle budget, texture size]
const OBJECTS = {
  founder_statue: ['model/object/The_founder’s_statue.glb', 19000, 2048],
  academy_dome: ['model/object/dome.glb', 26000, 2048],
  grand_fountain: ['model/object/Anime_Fountain_high_rim_package/Anime_Fountain_high_rim.glb', 32000, 1024],
  watchtower: ['model/object/Watchtower_package/Watchtower.glb', 45000, 512],
  harbor_crane: ['model/object/Harbor_Crane_package/Harbor_Crane.glb', 26000, 512],
  merchant_ship: ['model/object/Merchant_Ship/Merchant_Ship.glb', 30000, 512],
  noble_carriage: ['model/object/Noble_Carriage_package/Noble_Carriage.glb', 18000, 512],
  vendor_cart: ['model/object/Vendor_Cart/Vendor_Cart.glb', 14000, 512],
  book_open: ['model/object/Books/OpenBook/OpenBook.glb', 4000, 512],
  book_closed: ['model/object/Books/ClosedBook/ClosedBook.glb', 2500, 512],
};

const tris = (doc) => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const i = p.getIndices();
    t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
};

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
mkdirSync('public/models/objects', { recursive: true });
const want = process.argv.slice(2);
for (const [id, [src, budget, tex]] of Object.entries(OBJECTS)) {
  if (want.length && !want.includes(id)) continue;
  const doc = await io.read(src);
  const before = tris(doc);
  await doc.transform(dedup(), weld());
  // meshoptimizer with the Prune flag (drops tiny detached shells: rivets, leaves, rope bits that a plain collapse cannot
  // reduce) and a rising error limit until the model fits its budget
  for (const err of [0.003, 0.008, 0.016, 0.03, 0.05]) {
    const now = tris(doc);
    if (now <= budget * 1.1) break;
    const ratio = budget / now;
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
      const ia = p.getIndices(), pa = p.getAttribute('POSITION');
      if (!ia || !pa || p.getMode() !== 4 || ia.getCount() % 3 || ia.getCount() < 24) continue; // triangles only
      const idx = Uint32Array.from(ia.getArray());
      const pos = pa.getArray() instanceof Float32Array ? pa.getArray() : Float32Array.from(pa.getArray());
      const target = Math.min(idx.length, Math.max(3, Math.floor((idx.length * ratio) / 3) * 3));
      const [res] = MeshoptSimplifier.simplify(idx, pos, 3, target, err, ['Prune']);
      if (res.length >= idx.length) continue;
      ia.setArray(pa.getCount() > 65535 ? res : Uint16Array.from(res));
      compactPrimitive(p);
    }
  }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }),
    prune(),
  );
  const out = `public/models/objects/${id}.glb`;
  await io.write(out, doc);
  console.log(id.padEnd(16), String(before).padStart(7), '->', String(tris(doc)).padStart(6), 'tris', out);
}
