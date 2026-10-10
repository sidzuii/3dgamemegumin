// Web copies of the Quaternius Bestiary monsters (model/assets-for-project/Bestiary…):
// textures re-encoded to WebP 1K, geometry welded. The game animates them with retargeted mocap
// (MAPS.ue), the pack ships no clips.
//
//   node tools/pack_monsters.mjs
import { mkdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = 'model/assets-for-project/Bestiary - Dungeon Monsters Kit[Standard]/Exports/GLB (Godot-Unreal)';
const OUT = 'public/models/enemies';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
mkdirSync(OUT, { recursive: true });

for (const name of ['Imp', 'Puglin']) {
  const doc = await io.read(`${SRC}/${name}.glb`);
  await doc.transform(dedup(), weld(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }));
  await io.write(`${OUT}/${name}.glb`, doc);
  console.log(`${OUT}/${name}.glb`);
}
