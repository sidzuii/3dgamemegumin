// Build public/models/kits/<kit>.glb from the Kenney kits in model/assets-for-project/assets-kenney
// (CC0). Each output holds the chosen models as top-level nodes named after the source file;
// shared textures/materials are de-duplicated. The game merges these pieces into its static
// batches (world/KitLibrary.js).
//
//   node tools/pack_kits.mjs [kit...]
import { readdirSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, unpartition, weld, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = 'model/assets-for-project/assets-kenney';
const Q = '../'; // Quaternius packs sit next to the Kenney folder
const OUT = 'public/models/kits';

const ALL = null; // every model in the folder
const KITS = {
  town: { dir: 'kenney_fantasy-town-kit_2.0/Models/GLB format', models: ALL },
  castle: {
    dir: 'kenney_castle-kit/Models/GLB format',
    models: /^(wall|tower|gate|door|bridge|flag|stairs|metal-gate|siege-(ballista|catapult|trebuchet)$|tree-log|rocks)/,
  },
  survival: {
    dir: 'kenney_survival-kit/Models/GLB format',
    models: /^(barrel|bedroll|bottle|box|bucket|campfire|chest|fence|fish|resource|signpost|structure(-canvas|-floor|-roof)?$|tent|tool|tree-log|workbench|floor-old|rock-flat)/,
  },
  food: {
    dir: 'kenney_food-kit/Models/GLB format',
    models: /^(apple|bag|barrel|beet|bowl|bread|cabbage|carrot|cheese|cherries|corn$|croissant|cup$|cup-tea|cutting-board$|egg$|eggplant|fish$|fish-bones|frying-pan$|glass$|glass-wine|grapes|honey|leek|lemon$|loaf|meat-(cooked|raw|ribs|sausage)|mincemeat-pie|mortar|mug|mushroom$|onion$|orange$|pan$|pan-stew|pear$|pie|plate|pot$|pot-stew|pot-lid|pumpkin|radish|salad|sausage$|skewer$|strawberry|tomato$|turkey|whole-ham|wine-red|wine-white|watermelon|utensil|rollingPin|whisk|cooking-spoon|knife-block)/,
  },
  nature: {
    dir: 'kenney_nature-kit/Models/GLTF format',
    models: /^(tree_(oak|default|detailed|fat|tall|thin|small|simple|cone|plateau|pine)|plant_bush|grass_large|grass_leafs|flower_|mushroom_|log|stump|rock_(large|tall|small[ABC])|stone_(large|tall)|bridge_(wood|stone)|fence_|crops_|crop_|tent_detailed|campfire_|sign$|statue_|pot_|lily_|hanging_moss|path_stone)/,
  },
  furniture: {
    dir: 'kenney_furniture-kit/Models/GLTF format',
    models: /^(bedSingle|bedDouble|bench$|benchCushion$|bookcaseClosed$|bookcaseClosedWide|bookcaseOpen$|bookcaseOpenLow|books|chair$|chairCushion|coatRackStanding|pottedPlant|plantSmall|rugRectangle|rugRound$|rugRounded|sideTable$|sideTableDrawers|stoolBar$|table$|tableCloth|tableCross$|tableCrossCloth|tableRound|cabinetBedDrawer$|kitchenCabinet$|kitchenCabinetDrawer|kitchenBar$|pillow$|pillowLong$|cardboardBoxClosed|lampRoundTable|trashcan)/,
  },
  graveyard: { dir: 'kenney_graveyard-kit_5.0/Models/GLB format', models: /^(?!character-)/ },
  dungeon: { dir: 'kenney_modular-dungeon-kit_1.0/Models/GLB format', models: /^(gate|stairs|template-(wall|floor|corner|detail))/ },
  // Quaternius MegaKits (textured PBR; textures re-encoded to WebP 1K).
  village: { dir: Q + 'Medieval Village MegaKit[Standard]/glTF', models: ALL, compress: true, size: 1024 },
  wilds: {
    dir: Q + 'Stylized Nature MegaKit[Standard]/glTF',
    models: /^(CommonTree_\d|Pine_\d|TwistedTree_1|DeadTree_[13]|Bush_Common(_Flowers)?|Fern_1|Flower_[34]_Group|Mushroom_Common|Plant_[17]|Rock_Medium_\d|Pebble_Round_[123])$/,
    lod: /Tree|Pine/, lodRatio: 0.25, compress: true, size: 1024,
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Distant-tree copy: solid parts (trunk) simplified; alpha-tested leaf cards are separate
 * little meshes that a simplifier cannot merge, so keep every 2nd card, grown to cover the gap.
 */
async function makeLod(doc, ratio) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMaterial()?.getAlphaMode() === 'OPAQUE') continue;
      decimateCards(prim, 2, 1.32);
    }
  }
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.03, lockBorder: false }));
}

function decimateCards(prim, keepEvery, grow) {
  const idx = prim.getIndices();
  const pos = prim.getAttribute('POSITION');
  if (!idx || !pos) return;
  const I = idx.getArray();
  // Union-find over vertices: connected triangles = one card.
  const parent = new Int32Array(pos.getCount()).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]);
    parent[find(I[t + 1])] = a;
    parent[find(I[t + 2])] = a;
  }
  const comps = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const r = find(I[t]);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(t);
  }
  const keep = [];
  const P = pos.getArray().slice();
  let k = 0;
  for (const tris of comps.values()) {
    if (k++ % keepEvery) continue;
    const verts = new Set();
    for (const t of tris) for (let j = 0; j < 3; j++) verts.add(I[t + j]);
    const c = [0, 0, 0];
    for (const v of verts) for (let j = 0; j < 3; j++) c[j] += P[v * 3 + j] / verts.size;
    for (const v of verts) for (let j = 0; j < 3; j++) P[v * 3 + j] = c[j] + (P[v * 3 + j] - c[j]) * grow;
    for (const t of tris) keep.push(I[t], I[t + 1], I[t + 2]);
  }
  pos.setArray(P);
  idx.setArray(new (I.constructor)(keep));
}
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

for (const [kit, spec] of Object.entries(KITS)) {
  if (only.length && !only.includes(kit)) continue;
  const dir = join(ROOT, spec.dir);
  const files = readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f))
    .filter((f) => !spec.models || spec.models.test(basename(f).replace(/\.(glb|gltf)$/i, '')));
  const doc = new (await import('@gltf-transform/core')).Document();
  doc.createBuffer();
  const scene = doc.createScene(kit);
  doc.getRoot().setDefaultScene(scene);
  const add = async (srcDoc, name) => {
    const map = mergeDocuments(doc, srcDoc);
    const srcScene = srcDoc.getRoot().getDefaultScene() || srcDoc.getRoot().listScenes()[0];
    const merged = map.get(srcScene);
    const holder = doc.createNode(name);
    for (const n of merged.listChildren()) {
      merged.removeChild(n);
      holder.addChild(n);
    }
    scene.addChild(holder);
    merged.dispose();
  };
  for (const f of files) {
    const name = f.replace(/\.(glb|gltf)$/i, '');
    await add(await io.read(join(dir, f)), name);
    // Low-detail copy for distant instances (trees): '<name>__lod'.
    if (spec.lod?.test(name)) {
      const lo = await io.read(join(dir, f));
      await makeLod(lo, spec.lodRatio ?? 0.2);
      await add(lo, name + '__lod');
    }
  }
  await doc.transform(unpartition(), dedup(), prune({ keepLeaves: true }));
  if (spec.compress) {
    // Web-sized textures: WebP, at most `size` px.
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.size ?? 1024, spec.size ?? 1024], quality: 82 }));
    for (const t of doc.getRoot().listTextures()) t.setURI(`${kit}_${t.getName() || 'tex'}.webp`);
  } else {
    // One texture per kit at most: give it a stable name.
    for (const t of doc.getRoot().listTextures()) t.setURI(`${kit}_${t.getName() || 'colormap'}.png`);
  }
  const out = `${OUT}/${kit}.glb`;
  await io.write(out, doc);
  console.log(out, files.length, 'models,', doc.getRoot().listTextures().length, 'textures,', doc.getRoot().listMaterials().length, 'materials');
}
