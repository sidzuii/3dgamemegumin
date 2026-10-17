# Notes for working on this project

Full description, file map and how-to guides: see `README.md` (Russian). The user writes in Russian.

- Run: `npm run dev` (http://127.0.0.1:5173). Check: `npx vite build` and the browser console.
  Portable desktop build for Windows: `npm run portable` -> release/Megumin (Play.bat makes «Мегумин» shortcuts; app/serve.ps1 =
  PowerShell HttpListener on localhost:4173 on a runspace thread + Edge/Chrome `--app` window with its own profile, exits when the
  window closes; app/megumin.ico; app/game = vite build; release/ is gitignored). Keep serve.ps1 Windows PowerShell 5.1 compatible.
- Debug handle: `window.__game` (`.rpg`, `.npcs`, `.world`, `.travel(spot)`). Game loop: `src/core/Game.js`.
- Main menu = `src/ui/MainMenu.js` + `menu.css` (`game.mainMenu`): loading screen, title (live flight over Axel = `Game.attract()`), pause on
  Esc / pointer release (`pauseOpen` is part of `uiBlocking`; `_blockedAt` tells a window's own release from Esc), settings
  (`megumin-settings`: fov, mouse sens, invertY, dynamic res, fps; quality/sound/combat keep their keys), controls, credits, `ask()` modal.
  `tools/debug_helpers.js` `__init` clicks the primary menu button. New game: A00 at the caravan camp OUTSIDE the south gate
  (spots `caravan_arrival`, `marta_road`, sacks there); `RPG.autoIntro` waits for 15 game frames; `npcs.refresh(true)` on load.
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
- Megumin uses `retarget: 'rest'` (bind pose = neutral, only limbs re-aimed, hips at bind height); others use 'dir'.
  CapsLock = walk mode (`MOVE.strollSpeed` 1.5); W = 3.4 m/s pure jog; Shift = sprint; gait thresholds `GAIT` in CharacterAnimator.
- Axel lots are checked against `AxelPlan.ENVELOPE` + key-building `annex` rects; street centre lines = `streetLine()` /
  `ringLine()` (not raw STREETS.pts); paving layer heights `PAVE_LIFT`. `tools/city_audit.js` = geometry regression audit
  (page script; all counts must be 0). MAP_REV is 3. Never run two headless SwiftShader browsers at once (OOM).
  `src/world/AxelLayoutCheck.js` = layout geometry check (houses inside each other / on a street vs the generated plan);
  editor button «Проверить дома» (tab Слои) and `node tools/layout_check.mjs [layout.json]` (exit 1 on problems).
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
  Parts: a `world.group()` inside another group (or `world.part(name, x, z, rot, fn)`) is a part with id
  'parent/child'; its override lives in the parent's builder space and composes with the parent's move. Streets,
  squares, wall sides, door leaves, steps, barrels, crates, benches and `prop()` furniture are parts. A deleted
  part still runs its builder with all sinks muted (`world._mute`) so the parent's rng stays stable. Editor:
  Alt+click picks a part, Shift+click multi-select, gizmo (TransformControls) 1/2/3, [ ] fine rotation.
  Every object is editable: wild vegetation (trees, bushes, rocks, stumps, mushrooms, flowers) is RECORDED by Kit.js
  (`world.veg`, stable id `kind:Model@x,z`) and built in `World._realizeVegetation` with `layout.vegetation` overrides
  and `layout.erase` circles; named spots / enemy spawn points take `layout.spots[name]` / `layout.camps['camp#n']`
  (World.spot / World.camp). Signs, bridges, fields and the training field are groups. `src/editor/layers.js` has the
  layers and `validateLayout` (used on save, import, draft restore). Local draft: localStorage `megumin-editor-draft`.
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
  Kit 'props' (Fantasy Props MegaKit, real metres: use `prop(F, 'props/Name', …, { s: 1 })`; interiors fall back to
  primitives when it is absent) and kit 'bits' (KayKit ResourceBits). KayKit Skeletons (warrior/rogue/minion) use
  `MAPS.kk` (GLTFLoader strips the dots: `upperarm.l` → `upperarml`); gear from `Skeleton_Gear.glb` is parented to the
  `handslotr/l` bones in `EnemyAssets.instance`. `tools/pack_skeletons.mjs` rebuilds them. NOTE: node_modules and dist
  are tracked in git here — never run `npm install` in the repo (it rewrites tracked files); `git checkout -- node_modules`.
- Story = the scenario package in `docs/story/` (read `00_start.md`, `05_implementation_notes.md` for variables and
  checks). Spoken lines live in `src/data/story/clips.js` (GENERATED from the package's Реплики.json by
  `tools/story/gen_clips.mjs`; ids `A00_001`… are the future voice-over ids — never renumber). Scenes are programs
  over those ids (`story/dsl.js`: `$.L` lines, `$.CH` answers, `$.IF`, `$.DO`, `$.MENU`…; draft a scene from the
  markdown with `tools/story/draft.mjs`, list its ids with `tools/story/outline.mjs`). Dialogue ids = scene ids
  (`A00`, entry points `A00:join`); NPC `talk` entries in `data/npcs.js` route to them by quest stage. Story variables:
  `state.vars` (`{ setVar }` / `{ addVar }` / `{ var: [name, op, value] }`, names declared in `story/vars.js`).
  `node tools/story/check.mjs [A|B|C]` = static check + coverage (run it after every change). The WHOLE package is ported (A00-A29, B01-B23,
  C00-C33; the voice-over is still not touched: `Озвучка/` of the package and core/Audio.js stay as they are). Story props / Water Volley
  targets / enemy waves / directed blasts are DATA in `story/props.js` (`STORY_PROPS`, `STORY_VOLLEY`, `STORY_WAVES` with optional shields,
  `STORY_BLASTS`; effects `{ wave }`, `{ scene }`, `{ save }`, `{ credits }`); side-story places/props/camps are DATA in `story/sideprops.js`
  (built by `world/build/SideProps.js`, after every other builder). Interiors beyond the map edge: zones in `build/Dungeon.js` (mine, crypt,
  relay, drain, pump + core), builders Crypt/Relay/Drain/Pump/Core (helpers `hall()`/`passage()` in Crypt.js); `world.<level>.sync(flags, vars)`
  applies story state, called from `RPG._syncProps`. Quest stages: a stage whose objectives are flags advances by itself — use `manual: true`
  when a scene's `{ advance }` must do it; `onDone` effects run with the quest locked against re-entrant advance. Main chain:
  ch4_return -> ch5_crypt -> ch6_relay -> ch7_gorge -> ch8_city -> ch9_capsule -> ch10_finale (credits, `game_complete`).
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
- Combat = the package in `docs/combat/` (+ `Параметры_боевки.json` → `src/combat/params.js`, generated by `tools/combat/gen_params.mjs`).
  Renderer-independent core `src/combat/core/*` (fixed step 1/120 s, event bus; `node tools/combat/tests.mjs` must stay green), game side
  `src/combat/{Combat,Env,Companion,unlocks}.js`, view `src/combat/fx/*` (events → animation/particles; `vfx.density` from the quality preset).
  Two heroines have separate hp/mana/stamina (`player.fighters`); Megumin skills unlock through the story (`unlocks.js`), Roxy is the companion
  (AI + orders on T). Enemy types/attacks: `enemies/Enemy.js` TYPES (`joint` = weak spot open while the swing recovers / staggered). Spoken
  combat lines `CB_*`: `data/story/combatClips.js` (generated by `tools/combat/gen_clips.mjs`). Settings: menu tab «Бой» (K), `megumin-combat`.
  Headless checks: step with `g.update(1/30); g.input.endFrame()` (not the real loop), take canvas shots via `composer.render()`; for a page
  screenshot hide the canvas first (`style.visibility='hidden'`) or SwiftShader times out; CSS transitions need a few seconds to settle.
- Ainstrey v2.0 (docs/ainstrey/: TZ_capital.md, ledge.md, report.md, shots/). Region sheet `world/AinstreyPlan.js`, city plan
  `world/AinstreyCityPlan.js` (check `node tools/plan/ainstrey_plan.mjs`), builders `build/Ainstrey*.js` (City, Buildings — lightHouse with
  hollow `interior`, Interiors, Pump = port pump hall `world.port.sync`, Ledge). Story D00–D28 `story/chD*.js`, N01–N05 `story/chN.js`, quests
  `data/quests_capital.js` (ainstrey_road → ainstrey_city → ch6_relay), NPCs `cityAt()` in data/npcs.js, dialogues `dialogues_capital.js`,
  townsfolk `data/citizens.js`, fast travel `data/travel.js` (spots `stop_*`, `RPG.fastTravel`), pit lures `STORY_LURES`. Old saves past ch5
  get the road via `RPG._migrateCapital`. Citadel and north intake are closed future parts (gate props only).
  Ainstrey houses: `lightHouse()` = collision + an always-drawn far proxy set inside the kit shell; the village-kit near model
  (`AinstreyFacade.kitHouse`, keys: `keySkin`) is built on demand by `world/CityStream.js` (64 m cells, NEAR_MAX 90 m, `W._streamSink`, never
  collides; disabled in the editor). Dressing: `build/AinstreyDecor.js` (parterres, boulevards, statues, goods) runs last and keeps clear
  of spots, streets, keys. City statics use `W._bigChunk = 256`. Dense lots (~4860: frontage + lane + back rows round courtyards,
  sheds; STYLE fw/fd/fgap/pass/vac, segment hash `onStreet`); `lot.simple` (back/inner) = kit house without shutters/balconies/chimneys
  + `lightRoof`; far body = `facadeBox` with the canvas facade tile (`W.mats.facade`, night glow from DayNight). Staff series: 2/2/3 stamina, a press during a swing chains at `cancel_at`.
- User assets (2026-10): Mixamo clips -> `tools/pack_mixamo_anims.mjs` -> public/models/anim/mixamo.glb, loaded as a second retarget
  source (`AnimationLibrary.addSource`, clip names 'mx:<name>'; idle/talk/wave/sit of heroines and townsfolk). Rigged Mixamo
  characters -> `tools/pack_body.mjs` -> public/models/bodies/<id>.glb, worn by a named NPC via `body` in data/npcs.js
  (People BODIES; Edmund = Astrey). Single objects -> `tools/pack_objects.mjs` -> public/models/objects/<id>.glb, kit pieces
  'obj/<id>' (KitLibrary OBJECTS, vertex colours kept), placed with `Kit.heroKit()` (Ainstrey statue, fountains, dome, towers,
  cranes, ships, carriages, carts, books). Raw sources stay in model/ (FBX2glTF unpacks .fbm folders there: delete them).
