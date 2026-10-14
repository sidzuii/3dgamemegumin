import * as THREE from 'three';
import { Audio } from './Audio.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Input } from './Input.js';
import { World } from '../world/World.js';
import { DayNight } from '../world/DayNight.js';
import { DUNGEON } from '../world/build/Dungeon.js';
import { Player } from '../character/Player.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { VFX } from '../vfx/VFX.js';
import { ExplosionAbility } from '../abilities/ExplosionAbility.js';
import { WaterVolley } from '../abilities/WaterVolley.js';
import { Interaction } from '../systems/Interaction.js';
import { HUD } from '../ui/HUD.js';
import { MOVE } from '../character/CharacterController.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareChestModel } from '../world/Interactables.js';
import { EnemyAssets } from '../enemies/EnemyAssets.js';
import { EnemyManager } from '../enemies/EnemyManager.js';
import { Projectiles } from '../enemies/Projectiles.js';
import { Combat } from '../combat/Combat.js';
import { WorldUI } from '../ui/WorldUI.js';
import { AnimationLibrary } from '../character/Retarget.js';
import { PeopleLibrary } from '../npc/People.js';
import { KitLibrary } from '../world/KitLibrary.js';
import { Quality } from './Quality.js';

/** Revision of the map the layout was made for (the old compact Axel had none). */
const LAYOUT_REV = 2;

/**
 * Map layout edited with the map editor (public/data/placements.json). A layout made for another
 * map revision is ignored: its overrides are absolute positions on the old map
 * (the previous file is kept as public/data/placements.v1.json).
 */
async function loadLayout() {
  const empty = { version: 1, layout: LAYOUT_REV, overrides: {}, added: [] };
  try {
    const r = await fetch('/data/placements.json', { cache: 'no-store' });
    if (!r.ok) return empty;
    const data = await r.json();
    if (data.layout !== LAYOUT_REV) {
      console.warn('[layout] placements.json is for another map revision — ignored');
      return empty;
    }
    return { ...empty, ...data, overrides: data.overrides || {}, added: data.added || [] };
  } catch (e) {
    console.warn('[layout] placements.json not loaded', e);
    return empty;
  }
}
import { Inventory } from '../systems/Inventory.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { RPG } from '../rpg/RPG.js';
import { NPCManager } from '../npc/NPCManager.js';
import { DialogueUI } from '../ui/DialogueUI.js';
import { ShopUI } from '../ui/ShopUI.js';
import { GameMenu } from '../ui/GameMenu.js';
import { RPGHud } from '../ui/RPGHud.js';

/**
 * Owns the renderer, the single update/render loop and every subsystem.
 * Frame: UI windows (pause) -> player / combat / abilities -> enemies -> RPG (clock, quests,
 * events) -> NPCs -> regions -> day/night -> world -> camera -> interaction -> VFX -> HUD.
 */
export class Game {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    // Far plane just beyond the fog: nothing past it would be visible anyway.
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.08, 480);
    this.clock = new THREE.Clock(false);
    this.input = new Input(renderer.domElement);
    this.hud = new HUD();
    this.paused = true;
    this.time = 0;
    this.inDungeon = false;
    this.discovered = new Set();
    // Map editor (dev): ?editor builds every editable group as its own movable object.
    this.editorMode = new URLSearchParams(location.search).has('editor');
    this._focus = new THREE.Vector3();
    this._lookAhead = new THREE.Vector3();

    this._setupComposer();
    this.quality = new Quality(this);
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('beforeunload', () => this.started && this.rpg?.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.started && this.rpg?.save());
  }

  _setupComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.5, 1.15);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  /** Any window that pauses the game (dialogue, shop, menu, book). */
  get uiBlocking() {
    return !!(this.dialogueUI?.open || this.shopUI?.open || this.menu?.open || this.invUI?.bookOpen);
  }

  async init(onProgress) {
    const parts = { player: 0, enemies: 0, chest: 0, anim: 0, people: 0, kits: 0 };
    const report = (extra = 0) => onProgress?.(Math.min(0.99, (parts.player * 0.24 + parts.enemies * 0.16 + parts.chest * 0.03 + parts.anim * 0.1 + parts.people * 0.1 + parts.kits * 0.12) + extra));
    const step = (msg, frac) => {
      onProgress?.(frac, msg);
      return new Promise((r) => setTimeout(r, 0)); // let the loading screen repaint
    };
    this.animLib = new AnimationLibrary();
    const animP = this.animLib.load().then(() => { parts.anim = 1; report(); });
    this.player = new Player(this);
    this.enemyAssets = new EnemyAssets();
    const chestP = new GLTFLoader().loadAsync('/models/chest/chest.glb', (e) => {
      if (e.lengthComputable) { parts.chest = e.loaded / e.total; report(); }
    });
    const enemiesP = this.enemyAssets.load((f) => { parts.enemies = f; report(); });
    let pm = 0, rm = 0;
    const playerModelP = Promise.all([
      this.player.models.megumin.load((f) => { pm = f; parts.player = (pm + rm) / 2; report(); }),
      this.player.models.roxy.load((f) => { rm = f; parts.player = (pm + rm) / 2; report(); }),
    ]);
    this.people = new PeopleLibrary();
    const peopleP = this.people.load((f) => { parts.people = f; report(); });
    this.kits = new KitLibrary();
    const kitsP = this.kits.load((f) => { parts.kits = f; report(); });
    const layoutP = loadLayout();
    const [chest, , , , , , layout] = await Promise.all([chestP, enemiesP, playerModelP, animP, peopleP, kitsP, layoutP]);

    await step('Строим Аксель и окрестности…', 0.76);
    this.enemyAssets.prepare(this.animLib);
    this.world = new World(this.renderer, this.scene, this.kits);
    this.world.layout = layout;
    this.world.editorMode = this.editorMode;
    this.world.assets.chest = prepareChestModel(chest.scene);
    this.world.build();
    this.dayNight = new DayNight(this.world, this.scene);
    this.vfx = new VFX(this.scene);
    this.cameraRig = new ThirdPersonCamera(this.camera, this.world);
    this.player.finishLoad();
    this.playerCollider = { x: 0, y: 0, z: 0, r: 0.3, h: 1.6, enabled: true };
    this.player.controller.owner = this.playerCollider;
    this.world.dynamicColliders.push(this.playerCollider);

    await step('Будим жителей…', 0.88);
    this.combat = new Combat(this);
    this.audio = new Audio();
    this.projectiles = new Projectiles(this);
    this.enemies = new EnemyManager(this);
    for (const s of this.world.campSpawns) this.enemies.spawn(s.type, new THREE.Vector3(s.x, s.y ?? 0, s.z), s.camp);
    this.worldUI = new WorldUI(this);
    this.inventory = new Inventory(this);
    this.interaction = new Interaction(this);
    this.rpg = new RPG(this);
    this.rpg.setupWorld();
    this.npcs = new NPCManager(this);
    this.rpg.npcs = this.npcs;
    // UI.
    this.invUI = new InventoryUI(this);
    this.hud.invUI = this.invUI;
    this.dialogueUI = new DialogueUI(this);
    this.shopUI = new ShopUI(this);
    this.menu = new GameMenu(this);
    this.rpgHud = new RPGHud(this);
    this.rpg.ui = { dialogue: this.dialogueUI, shop: this.shopUI, menu: this.menu, notify: (k, t) => this.rpgHud.notify(k, t) };
    this.hud.setupCompass(this.world.regions, this.discovered);
    this.currentLocation = null;
    this.hitStopTimer = 0;

    this.abilities = { megumin: new ExplosionAbility(this), roxy: new WaterVolley(this) };
    this.ability = this.abilities.megumin;
    this.hud.setCharacter('megumin');

    await step('Готовим шейдеры…', 0.95);
    this.quality.apply();
    this._prewarm();
  }

  /** Compile every material before the first visible frame (no hitches later). */
  _prewarm() {
    this.cameraRig.snapBehind(0);
    this.player.getFocus(this._focus);
    this.cameraRig.update(1 / 60, null, this._focus);
    this.world.followShadow(this._focus);
    this.dayNight.update(0, 12, 0);
    this.world.trees.update(0, this.camera, true);
    this.abilities.megumin.prewarm(this.composer, this.camera);
    this.scene.add(this.player.models.roxy.root);
    this.player.models.roxy.root.position.copy(this.player.position).add(new THREE.Vector3(2, 0, 0));
    const tg = this.combat.telegraph(this._focus, 2, 1);
    this.renderer.setRenderTarget(this.composer.readBuffer);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.composer.render();
    tg.cancel();
    this.scene.remove(this.player.models.roxy.root);
  }

  /** Apply the save (or start a new story) and run the loop. */
  start(newGame = false) {
    const info = this.rpg.begin({ newGame });
    this.hud.setCompanion(!!this.rpg.state.flags.roxy_companion);
    this._checkLocation(true);
    this.paused = false;
    this.started = true;
    this.input.enabled = true;
    this.hud.show();
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
    return info;
  }

  /** On-screen frame counter (F8). */
  _toggleFps() {
    if (this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; return; }
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:44px;transform:translateX(-50%);font:12px system-ui;color:#fff;background:rgba(0,0,0,.45);padding:2px 8px;border-radius:6px;z-index:40;pointer-events:none';
    document.body.appendChild(el);
    this.fpsEl = el;
  }

  /** Map editor instead of the game (`?editor`). */
  async startEditor() {
    const { Editor } = await import('../editor/Editor.js');
    this.editor = new Editor(this);
    this.started = false;
    this.input.enabled = false;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.editor.frame(Math.min(this.clock.getDelta(), 1 / 20)));
  }

  /** Teleport to a named spot (doors, scrolls, sleeping…). */
  travel(spotName) {
    const s = this.rpg.spot(spotName);
    if (!s) return;
    this.hud.fade(0.6);
    this.inDungeonTransition = true;
    setTimeout(() => {
      const p = s.pos.clone();
      p.y = this.world.groundAt(p.x, p.z, p.y + 2) + 0.05;
      this.player.controller.teleport(p, s.yaw);
      this.player.controller.velocity.set(0, 0, 0);
      this.cameraRig.snapBehind(s.yaw + Math.PI);
      this.cameraRig.initialized = false;
      this.inDungeonTransition = false;
      this._checkLocation(true);
      this.rpg.markDirty(true);
    }, 280);
  }

  /** Conversation framing: Megumin turns to the speaker, the camera looks over her shoulder. */
  beginTalk(npc) {
    const p = this.player.position, n = npc.position;
    const dx = n.x - p.x, dz = n.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    this.player.controller.yaw = Math.atan2(dx, dz);
    this.player.model.root.rotation.y = this.player.controller.yaw;
    const rig = this.cameraRig;
    this._talkCam = { yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance };
    rig.yaw = Math.atan2(-dx / len, -dz / len) - 0.35;
    rig.pitch = 0.1;
    rig.distance = Math.min(rig.distance, 3.4);
  }

  endTalk() {
    const s = this._talkCam;
    if (!s) return;
    this.cameraRig.pitch = s.pitch;
    this.cameraRig.distance = s.distance;
    this._talkCam = null;
  }

  /** Window hotkeys; returns true while a window pauses the game. */
  _uiInput(dt) {
    const input = this.input;
    if (this.dialogueUI.open) {
      this.dialogueUI.update(dt, input);
      return true;
    }
    if (this.invUI.bookOpen) {
      if (input.wasPressed('Escape') || input.wasPressed('KeyE')) this.invUI.closeBook();
      return true;
    }
    if (this.shopUI.open) {
      this.shopUI.update(input);
      return true;
    }
    if (this.menu.open) {
      this.menu.update(dt, input);
      return true;
    }
    if (input.wasPressed('KeyI') || input.wasPressed('KeyB')) this.menu.show('inv');
    else if (input.wasPressed('KeyJ')) this.menu.show('journal');
    else if (input.wasPressed('KeyM')) this.menu.show('map');
    else if (input.wasPressed('KeyC')) this.menu.show('char');
    else if (input.wasPressed('KeyG')) this.menu.show('guild');
    if (input.wasPressed('Digit3')) this.inventory.use('hp_potion');
    if (input.wasPressed('Digit4')) this.inventory.use('st_potion');
    if (input.wasPressed('Digit5')) this.inventory.use('mana_potion');
    return this.uiBlocking;
  }

  /** Brief slow-motion freeze on impactful hits. */
  hitStop(t) {
    this.hitStopTimer = Math.max(this.hitStopTimer, t);
  }

  /** Slow motion for `t` seconds at time `scale` (perfect dodge, last kill). */
  slowMo(t, scale = 0.35) {
    this.slowMoTimer = Math.max(this.slowMoTimer || 0, t);
    this.slowMoScale = scale;
  }

  _frame() {
    const now = performance.now();
    const raw = this._lastFrame ? (now - this._lastFrame) / 1000 : 0;
    this._lastFrame = now;
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (!this.uiBlocking) this.quality.update(raw);
    if (this.fpsEl) this.fpsEl.textContent = this.quality.fps(raw) + ' FPS · ' + this.quality.preset.label + (this.quality.scale < 1 ? ' · ' + Math.round(this.quality.scale * 100) + '%' : '');
    if (this._uiInput(dt)) {
      // Paused (window open): keep the HUD alive, freeze the world.
      if (this._talkCam && this.dialogueUI.open) {
        this.player.getFocus(this._focus);
        this.cameraRig.update(dt, null, this._focus, {});
        this.rpg.dialogue.current?.npc?.updateTalking?.(dt, this.player.position);
        // Megumin settles into her idle while listening.
        const pl = this.player;
        pl.anim.set('Idle');
        pl.anim.update(dt, { speed: 0, localVel: _zero, localAccel: _zero, turnRate: 0, grounded: true });
        pl.model.root.rotation.y = pl.controller.yaw;
      }
      this.hud.update(0, this);
      this.rpgHud.update(0);
      this.composer.render();
      this.input.endFrame();
      return;
    }
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      dt *= 0.08;
    } else if (this.slowMoTimer > 0) {
      this.slowMoTimer -= dt;
      dt *= this.slowMoScale;
    }
    this.time += dt;
    this.update(dt);
    this.composer.render();
    this.input.endFrame();
  }

  update(dt) {
    const input = this.input;

    if (input.wasPressed('KeyH')) this.hud.toggleHelp();
    if (input.wasPressed('F9')) this.hud.toast('Графика: ' + this.quality.cycle());
    if (input.wasPressed('F8')) this._toggleFps();
    if (this.player.companionUnlocked) {
      if (input.wasPressed('Tab')) this.player.switchCharacter();
      if (input.wasPressed('Digit1')) this.player.switchCharacter('megumin');
      if (input.wasPressed('Digit2')) this.player.switchCharacter('roxy');
    }
    if (input.wasPressed('KeyQ')) {
      if (this.combat.attacking || !this.ability.tryCast()) this.hud.denyAbility();
    }
    if (input.wasMousePressed(0) || input.wasPressed('KeyF')) this.combat.request();
    if (input.wasMousePressed(2) || input.wasPressed('KeyV')) this.player.tryDodge();

    // Player (controller + animation), ability timeline, combat.
    this._surfaceEffects(dt);
    this.player.update(dt, input, this.cameraRig);
    this.combat.update(dt);
    for (const k in this.abilities) this.abilities[k].update(dt);
    const pp = this.player.position;
    Object.assign(this.playerCollider, { x: pp.x, y: pp.y, z: pp.z, enabled: this.player.hp > 0 });

    // Enemies & projectiles.
    this.enemies.update(dt);
    this.projectiles.update(dt);

    // RPG systems and townsfolk.
    this.rpg.update(dt);
    this.npcs.update(dt);
    this._checkLocation();

    // Lighting for the time of day (or the dark of the mine).
    const dn = this.dayNight.update(dt, this.rpg.clock.hour, this.inDungeon ? 1 : 0);

    // World props (grass, water, interactables, dummies, lights).
    this.world.update(dt, { playerPos: pp, playerSpeed: this.player.controller.horizontalSpeed, vfx: this.vfx, night: dn.night, camera: this.camera });

    // Camera follows; slight look-ahead in the movement direction.
    const c = this.player.controller;
    this._lookAhead.set(c.velocity.x * 0.08, 0, c.velocity.z * 0.08);
    this.player.getFocus(this._focus);
    const running = c.grounded && c.horizontalSpeed > MOVE.walkSpeed + 0.6;
    let fovBoost = running ? 6 : 0;
    if (this.ability.casting) fovBoost = -4 * this.player.castCharge;
    this.cameraRig.update(dt, input, this._focus, { airborne: !c.grounded, lookAhead: this._lookAhead, fovBoost });

    this.interaction.update();

    this.world.followShadow(this._focus);
    this.world.sky.mesh.position.copy(this.camera.position);
    this.world.sky.material.uniforms.uTime.value = this.time;

    this.vfx.ambientCenter.copy(pp);
    const size = this.renderer.getDrawingBufferSize(_size);
    this.vfx.update(dt, this.camera, size.x, size.y);

    this.worldUI.update(dt);
    this.hud.update(dt, this);
    this.rpgHud.update(dt);
  }

  /** Region discovery: banner, checkpoint, quest "reach" events; dungeon mode. */
  _checkLocation(force = false) {
    const pp = this.player.position;
    this.inDungeon = DUNGEON.contains(pp.x, pp.z);
    const L = this.world.locationAt(pp);
    if (L === this.currentLocation && !force) return;
    this.currentLocation = L;
    if (!L) return;
    const first = this.rpg.enterRegion(L);
    if (first || this.time - (L._lastBanner || -99) > 60) {
      this.hud.banner(L.name, first && L.spawn ? L.sub + ' · контрольная точка' : L.sub);
      L._lastBanner = this.time;
    }
  }

  /** Water slows and splashes, lava burns. */
  _surfaceEffects(dt) {
    const p = this.player;
    const surf = this.world.surfaceAt(p.position);
    p.envSpeedMul = surf === 'water' ? 0.62 : 1;
    if (surf === 'water' && p.controller.horizontalSpeed > 1 && Math.random() < dt * 14) {
      this.vfx.emit('splash', _tmp.set(p.position.x, p.position.y + 1.0, p.position.z));
    }
    if (surf === 'lava' && p.hp > 0 && p.action !== 'exhausted') {
      this._lavaAcc = (this._lavaAcc || 0) + 26 * dt;
      if (this._lavaAcc >= 6) {
        p.damage(6);
        this._lavaAcc -= 6;
      }
      if (Math.random() < dt * 12) this.vfx.emit('fireBurst', _tmp.copy(p.position));
      if (p.controller.grounded && Math.random() < dt * 3) p.controller.addImpulse(_tmp.set(0, 6, 0));
    }
    for (const e of this.enemies.list) {
      if (e.alive && e.state !== 'dead' && this.world.surfaceAt(e.position) === 'lava') {
        e.hp -= 40 * dt;
        e.flash = 0.6;
        if (e.hp <= 0 && e.alive) {
          e.alive = false;
          this.enemies.onKilled(e);
          e.setState('airborne');
        }
      }
    }
  }
}

const _tmp = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _size = new THREE.Vector2();
