// Build public/models/people/{men,women}.glb from the Quaternius modular people packs
// (model/assets-for-project/{menpack,womanpack}, "All together" FBX):
//   FBX2glTF -> drop the pack's own animations (the game retargets its mocap library),
//   drop modern outfits that do not fit the setting, restore material colours
//   (FBX2glTF multiplies the diffuse colour by the FBX diffuse factor 0.8), prune, weld.
//
//   node tools/pack_people.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld } from '@gltf-transform/functions';

const FBX2GLTF = 'node_modules/fbx2gltf/bin/Windows_NT/FBX2glTF.exe';
const SRC = 'model/assets-for-project';
const OUT = 'public/models/people';

const PACKS = {
  men: {
    fbx: `${SRC}/menpack/All together/FBX/Humans_Master.fbx`,
    drop: /^(Swat_|SpaceSuit_|Punk_|Worker_(Head|Body)|Suit_(Body|Legs|Feet)|Horse_Head|Pistol)/,
  },
  women: {
    fbx: `${SRC}/womanpack/All together/FBX/All together.fbx`,
    drop: /^(Soldier_(Body|Legs|Feet)|SciFi_|Punk_|Worker_(Head|Body)|Suit_(Body|Legs|Feet)|Pistol)/,
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), 'pack_people');
mkdirSync(tmp, { recursive: true });

for (const [name, pack] of Object.entries(PACKS)) {
  const raw = join(tmp, name);
  execFileSync(FBX2GLTF, ['--binary', '--input', pack.fbx, '--output', raw], { stdio: 'ignore' });
  const doc = await io.read(raw + '.glb');
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh && pack.drop.test(node.getName())) {
      node.setMesh(null).setSkin(null);
      node.dispose();
    }
  }
  for (const m of root.listMaterials()) {
    const c = m.getBaseColorFactor();
    m.setBaseColorFactor([Math.min(1, c[0] * 1.25), Math.min(1, c[1] * 1.25), Math.min(1, c[2] * 1.25), c[3]]);
  }
  await doc.transform(prune(), dedup(), weld());
  const out = `${OUT}/${name}.glb`;
  await io.write(out, doc);
  const meshes = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  console.log(out, meshes.length, 'parts:', meshes.join(', '));
}
rmSync(tmp, { recursive: true, force: true });
