# Notes for working on this project

Full description, file map and how-to guides: see `README.md` (Russian). The user writes in Russian.

- Run: `npm run dev` (http://127.0.0.1:5173). Check: `npx vite build` and the browser console.
- Debug handle: `window.__game` (`.rpg`, `.npcs`, `.world`, `.travel(spot)`). Game loop: `src/core/Game.js`.
- RPG layer: `src/rpg/` (state, quests, dialogue, guild, economy, gathering, events, clock); content is data
  in `src/data/` (items, quests, dialogues, npcs, shops, resources). Map data: `src/world/MapData.js`;
  builders: `src/world/build/` (Kit, Town, Countryside, Dungeon). NPCs: `src/npc/`.
- Story quests chain through `requires` + `next`; rewards are granted once in `QuestManager.complete`.
- Named places for NPCs/quests are `world.spot(name, pos, yaw)` registered by the builders.
- Map: `HALF = 850` (1.7 km). Axel = walled city at (-330, 20): data `src/world/AxelPlan.js` (local u/v metres
  from the Fountain square; wall, streets, squares, key buildings), house lots `src/world/build/AxelLots.js`
  (GENERATED: `node tools/plan/render_plan.mjs --emit` — checks streets/squares/wall/terrain, writes
  `docs/plan/*`). Builder: `world/build/Town.js`; wall = `cityWall()` in Kit.js (castle-kit geometry, village
  stone via `addKit({ retex })`). Plan doc: `docs/axel-city-plan.md`. Dungeon interior lives at z 1090..1210.
- Interiors are in place (no separate scenes): `house({ interior: true, entrance: 'arch' })` gives an archway,
  a plank floor and a ceiling; `open: 'work'` = open-fronted workshop; furnishing in `world/build/Interiors.js`
  (wrapped in `world.lodMode = 'near'`). Closed houses have a solid door leaf. Walk-in shops register
  `<id>_counter` / `_front` / `_entrance` spots.
- Buildings have LOD: `house()` emits a near model and a far proxy (`world.lodMode`), small parts use
  `detail: true`; distances come from the quality preset (`lod`, `detail`). Terrain is chunked (170 m).
- Saves: `mapRev` (State.MAP_REV) moves the player of an older-map save to a safe spot; placements.json
  carries `"layout": 2` (older layouts are ignored by `Game.loadLayout`).
- Map editor: `?editor` (dev only). Builders wrap places in `world.group(id, pivot, (rng) => …, label)`;
  the layout `public/data/placements.json` (overrides + added objects) moves/deletes them at build time —
  every world sink (addSolid/addKit/spot/addLightSource/addInteractable/addFootprint/camp/addObject)
  applies the group delta, so builders must add live scene objects via `world.addObject()` and transform
  stored positions with `world.xf()`. Give new builder content a group id so it stays editable.
  Placeable types for the editor palette: `world/build/Placements.js`. Save endpoint: `vite.config.js`.
- Raw user models go to `model/` (never loaded by the game); optimised copies go to `public/models/`.
  Convert FBX with FBX2glTF (not three's FBXLoader), optimise with gltf-transform. Blender is NOT
  installed any more (the old 4.5 path is gone) — prefer FBX/glTF sources. Scripts: `tools/`
  (`pack_people.mjs`, `pack_kits.mjs`, `inspect_gltf.mjs`, `inspect_nodes.mjs`).
- User asset packs: `model/assets-for-project` (Quaternius people, Kenney kits). Townsfolk bodies:
  `src/npc/People.js` (+ `model` field in `data/npcs.js`). Kenney pieces: `src/world/KitLibrary.js`,
  placed with `Frame.kit()` / `world.addKit()` into the static batches; palette recolours live there.
  Progress / open items of that integration: `ASSETS_PROGRESS.md`.
  Quaternius kits 'village' (house modules, used by `house()`) and 'wilds' (trees/bushes/rocks) are
  multi-material PBR kits; trees/bushes go through `world.trees` (TreeField, instanced + '__lod' copies),
  not the static batches. Bestiary monsters (puglin, imp) use mocap via `MAPS.ue` (`Enemy.js` MOCAP set).
- Character animation = mocap clips from `public/models/anim/ual.glb` retargeted at runtime
  (`src/character/Retarget.js` + `CharacterAnimator.js`). Bone maps per skeleton are in `MAPS`
  (ual, mixamo, cc, qp = Quaternius people, demon). The library has no sitting clip: NPC `sit` = idle + legs
  posed in `NPC._sitPose` (schedule entry `seat` = seat height).
- Megumin's cloak/hair have a wind blend shape (keep influence driven at runtime, default 0).
- Save game: localStorage key `megumin-save-v2` (v1 is migrated on load).
- Performance: the user's PC has an integrated AMD Radeon (Ryzen APU) — GPU-bound. `core/Quality.js`: presets
  (F9, `megumin-quality`) + dynamic resolution. Foliage: Lambert leaf cards, shadow proxies on layer 2,
  card LOD then solid silhouettes (TreeField). Measure with EXT_disjoint_timer_query (numbers are noisy).
- Testing in the hidden browser pane: frames don't tick by themselves — call `__game._frame()` in a loop.
  Helpers: `eval(await (await fetch('/tools/debug_helpers.js')).text()); await __init();` (`__step`, `__tp`,
  `__goto`, `__look`, `__lookAt`).
  `world.groundAt` raycasts from above, so inside the dungeon/buildings pass an explicit y.
