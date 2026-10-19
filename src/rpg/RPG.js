import * as THREE from 'three';
import { EventBus, freshState, loadSave, writeSave, check, MAP_REV, STORY_REV } from './State.js';
import { CLIPS as STORY_CLIPS } from '../data/story/clips.js';
import { COMBAT_CLIPS } from '../data/story/combatClips.js';
const CLIPS = { ...STORY_CLIPS, ...COMBAT_CLIPS };
import { VOICE } from '../data/story/dsl.js';
import { TRIGGERS } from '../data/story/triggers.js';
import { STORY_PROPS, STORY_VOLLEY, STORY_WAVES, STORY_BLASTS, STORY_LURES } from '../data/story/props.js';
import { STOPS, STOP_R, STOPS_NEEDED } from '../data/travel.js';
import { CITY_WALL, ORIGIN as AIN_ORIGIN } from '../world/AinstreyPlan.js';
import { Clock } from './Clock.js';
import { QuestManager } from './Quests.js';
import { DialogueRunner } from './Dialogue.js';
import { Economy } from './Economy.js';
import { Guild } from './Guild.js';
import { WorldEvents } from './WorldEvents.js';
import { Gathering } from './Gathering.js';
import { REGIONS, REGION, HALF, ROADS } from '../world/MapData.js';
import { SHEET as AIN_SHEET, EXPLORE as EXPLORE_AIN, inSheet as inAinSheet } from '../world/AinstreyPlan.js';
import { ITEMS } from '../data/items.js';
import { PROP_TEXTS } from '../data/dialogues.js';

/**
 * The RPG layer: owns the persistent state and every gameplay system that is not
 * moment-to-moment action (quests, dialogue, guild, economy, gathering, world events, the
 * clock, discovery, levels, saving). World objects and UI talk to it through a small API:
 *
 *   rpg.apply(effects)          run effects (dialogue / quest data)
 *   rpg.check(cond)             evaluate a condition
 *   rpg.talkTo(npc)             start the right conversation
 *   rpg.onInteract(id, prop)    story props (journals, shards, crystals…)
 *   rpg.onChestOpened(id, loot) chests (one-time loot)
 *   rpg.enterRegion(region)     discovery, banner, checkpoint
 */
export const XP_TABLE = (lvl) => 60 + lvl * 55;
const EXPLORE_N = 96;

export class RPG {
  constructor(game) {
    this.game = game;
    this.events = new EventBus();
    this.state = freshState();
    this.clock = new Clock(this.state);
    this.quests = new QuestManager(this);
    this.dialogue = new DialogueRunner(this);
    this.economy = new Economy(this);
    this.guild = new Guild(this);
    this.dirty = false;
    this.saveTimer = 0;
    this.autosave = 30;
    this.explored = new Uint8Array(EXPLORE_N * EXPLORE_N);
    this.exploredAin = new Uint8Array(EXPLORE_AIN.nx * EXPLORE_AIN.nz); // the map page of the Ainstrey sheet
    this.ui = null; // set by Game (dialogue, shop, menu, notify)
    this.events.on('custom', (e) => this.quests._count('custom', (o) => o.name === e.name, e.n ?? 1));
    // Audio feedback for story progress and loot (the player's own pickups, not shop restock).
    this.events.on('questStart', () => this.game.audio?.play('questStart'));
    this.events.on('questStage', () => this.game.audio?.play('questStage'));
    this.events.on('questDone', () => this.game.audio?.play('questDone'));
    this.events.on('item', () => this.game.audio?.play('pickup'));
    for (const ev of ['questStart', 'questDone', 'questStage']) this.events.on(ev, () => { this._syncProps(); this.npcs?.refresh(); });
    // Roxy's condition (A22): no explosion inside the ruins before the ritual. During the ritual the far sector
    // behind the white stone is allowed; a blast anywhere else damages the circle's sector (A25: one more line).
    this.events.on('explosion', (e) => {
      const A = REGION.astrarium;
      if (this.quests.status('roxy_trust') !== 'active' || Math.hypot(e.pos.x - A.center.x, e.pos.z - A.center.z) > A.r + 10) return;
      const st = this.quests.stageId('roxy_trust');
      if ((st === 'crystals' || st === 'return') && this.getVar('ROXY_PROMISE') && !this.getVar('ROXY_EXPLOSION')) {
        this.setVar('ROXY_EXPLOSION', true);
        this.notify('event', 'Измерительная стойка в западной галерее упала. Рокси это не понравится.');
      } else if (st === 'defend') {
        const far = this.spotPos('astrarium_far');
        if (far && Math.hypot(e.pos.x - far.x, e.pos.z - far.z) < 14) this._sayChain(['A25_009', 'A25_010']);
        else this.setFlag('ritual_sector_hit');
      }
    });
    // The first delivered contract opens the sweep (the short exercise at Bran's dummies).
    this.events.on('custom', (e) => {
      if (e.name === 'contract_done' && !this.state.flags.skill_M_E) {
        this.setFlag('skill_M_E');
        this.notify('info', 'Открыт Круговой отбив (R): широкая дуга 240°, 26 выносливости. Потренируйся на манекенах у Брана.');
      }
    });
    this.events.on('volley', (e) => { this._volleyStory(e); this._combatBark('V02_001', 0.35, 6); });
    this.events.on('explosion', (e) => { if (e.kind === 'explosion') this._combatBark('V01_003', 0.5, 8); });
    this.events.on('explosion', (e) => {
      if (!e.tags?.includes('story_demolition')) return; // directed story blasts need the big Explosion
      for (const t of STORY_BLASTS) {
        const s = this.spotPos(t.spot);
        if (s && !this.state.flags[t.flag] && check(this, t.when) && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) <= t.r) this.setFlag(t.flag);
      }
    });
    // C03: Roxy's volley flies where she aims; a latch in the cone (about 20 degrees, 32 m) is knocked off.
    this.events.on('volley', (e) => {
      if (this.quests.stageId('ch5_crypt') !== 'water') return;
      const F = this.state.flags;
      let any = false;
      for (let i = 0; i < 3; i++) {
        const s = this.spotPos('crypt_latch_' + i);
        if (!s || F['crypt_latch_' + i]) continue;
        const dx = s.x - e.from.x, dz = s.z - e.from.z, L = Math.hypot(dx, dz);
        if (L > 32 || L < 1) continue;
        const dot = (dx * e.dir.x + dz * e.dir.z) / (L * (Math.hypot(e.dir.x, e.dir.z) || 1));
        if (dot < Math.cos(0.36)) continue;
        this.setFlag('crypt_latch_' + i);
        this.game.vfx.burst('waterSplash', s.clone(), 24);
        any = true;
      }
      if (!any) return;
      const n = [0, 1, 2].filter((i) => F['crypt_latch_' + i]).length;
      if (n >= 3) {
        this.setFlag('crypt_gate_open');
        this.notify('event', 'Все три защёлки сбиты: решётка галереи поднялась.');
      } else this.notify('info', `Защёлка сбита (${n}/3).`);
    });
    // The ritual: the second pair of guardians comes when the first two are down (A25).
    this.events.on('kill', (e) => {
      this._waveKill(e.camp);
      if (e.camp !== 'rift_wave' || this.quests.stageId('roxy_trust') !== 'defend') return;
      this._ritualKills = (this._ritualKills || 0) + 1;
      if (this._ritualKills === 2) this._effect('ritualWave', 2);
    });
  }

  get inventory() {
    return this.game.inventory;
  }

  /** World-bound systems (resource nodes, event props). Called during loading. */
  setupWorld() {
    this.gathering = new Gathering(this);
    this.worldEvents = new WorldEvents(this);
  }

  /** Start a new game or load the save. Called when the player presses Play. */
  begin({ newGame }) {
    let migrated = false, corrupted = false;
    if (!newGame) {
      const r = loadSave();
      if (r.data) {
        this.state = r.data;
        migrated = !!r.migrated;
      }
      corrupted = !!r.corrupted;
    } else this.state = freshState();
    this.clock.state = this.state;
    this._fixups();
    this._applyStateToWorld();
    this._migrateCapital();
    this.gathering.syncFromState();
    this.npcs?.refresh(true);
    this._resumeEscort();
    this._resumeRitual();
    this._resumeWaves();
    this.loaded = { migrated, corrupted, fresh: newGame || !this.state.player || !!this._storyReset };
    this._storyReset = false;
    if (migrated) this.notify('info', 'Сохранение со старой карты перенесено: эрисы и предметы на месте, история начинается заново.');
    if (corrupted) this.notify('info', 'Сохранение повреждено — начата новая игра.');
    this.markDirty(true);
    return this.loaded;
  }

  /**
   * Version 2.0 (the road to Ainstrey, the capital): a save that had finished the crypt (chapter 5) before the update gets the new chapters quietly.
   * Not yet on the way to the post behind the ridge: the road quest is the next story step. Already further (ch6_relay and later): the road quest waits
   * in the journal and does not take the pointer. The saved world, levels, bag, flags and decisions are kept; the old ENDING variable decides nothing.
   */
  _migrateCapital() {
    const Q = this.quests;
    if (Q.status('ch5_crypt') !== 'done' || Q.status('ainstrey_road') !== 'none') return;
    const late = Q.status('ch6_relay') !== 'none';
    const keep = Q.tracked;
    Q.start('ainstrey_road', true);
    if (late) Q.tracked = keep;
    this.setFlag('ainstrey_migrated');
    this.notify('info', late ? 'Открыта новая ветка: дорога к Айнстрею. Письмо для Селии Морн лежит у Луны; задание ждёт в журнале и не мешает основному.' : 'Открыта новая глава: дорога к Айнстрею. Поговори с Луной в гильдии.');
  }

  _fixups() {
    const S = this.state;
    // Saved on an older map (Axel was rebuilt): the old position means nothing here. The fog of
    // war only before rev 2 (the new terrain); later revisions moved houses inside Axel.
    if (S.mapRev !== MAP_REV) {
      // Keep the pre-migration save (the player may want it back).
      if (S.player) try { localStorage.setItem(`megumin-save-v2.mapRev${S.mapRev ?? 1}.bak`, JSON.stringify(S)); } catch { /* storage full */ }
      if (!(S.mapRev >= 2)) S.explored = '';
      this._relocate = !!S.player;
      S.mapRev = MAP_REV;
    }
    S.quests = S.quests || {};
    if (S.storyRev !== STORY_REV) {
      // A save of the previous story: keep the character (level, bag, discoveries), start the new story.
      if (S.player || Object.keys(S.quests).length) {
        try { localStorage.setItem(`megumin-save-v2.story${S.storyRev ?? 0}.bak`, JSON.stringify(S)); } catch { /* storage full */ }
        Object.assign(S, { quests: {}, flags: {}, vars: {}, counters: {}, rel: {}, met: {}, props: {}, events: {}, kills: {}, log: [], guild: { member: false, rank: 'F', points: 0, completed: [] } });
        const inv = S.inventory;
        if (inv?.items) inv.items = inv.items.filter((it) => ITEMS[it.id]?.kind !== 'quest');
        this._storyReset = !!S.player;
        this._relocate = !!S.player;
      }
      S.storyRev = STORY_REV;
    }
    for (const id of Object.keys(S.quests)) if (!this.quests.def(id)) delete S.quests[id];
    if (S.exploredAin) {
      try {
        const bin = atob(S.exploredAin);
        for (let i = 0; i < this.exploredAin.length; i++) this.exploredAin[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
      } catch {
        /* corrupted fog map of the sheet: start blank */
      }
    }
    if (S.explored) {
      try {
        const bin = atob(S.explored);
        for (let i = 0; i < this.explored.length; i++) this.explored[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
      } catch {
        /* corrupted fog map: start blank */
      }
    }
  }

  /** Push saved state into world objects (chests, props, player, inventory). */
  _applyStateToWorld() {
    const g = this.game;
    const S = this.state;
    for (const it of g.world.interactables) if (it.id && S.chests.includes(it.id)) it.looted = true;
    if (S.inventory) g.inventory.deserialize(S.inventory);
    else {
      // The scenario starts with an empty purse: Marta returns the road deposit (A00).
      g.inventory.deserialize({ eris: 0, items: [{ id: 'bread', count: 2 }, { id: 'book_explosion', count: 1 }], equipment: {} });
    }
    const P = S.player;
    const pl = g.player;
    if (P && this._relocate) {
      // Old map: start again at the caravan yard (prologue) or on the Fountain square.
      const s = this.spot(this.quests.status('prologue_arrival') === 'done' ? 'square' : 'caravan_arrival');
      P.x = s.pos.x; P.y = s.pos.y; P.z = s.pos.z; P.yaw = s.yaw;
      this._relocate = false;
      this.notify('info', this._storyReset ? 'История обновлена: она начинается заново. Уровень, вещи и открытая карта сохранены; старое сохранение лежит в резервной копии.' : 'Аксель отстроен заново: вы снова на улицах города. Задания и вещи сохранены.');
    }
    if (P) {
      pl.level = P.level || 1;
      pl.xp = P.xp || 0;
      pl.applyStats();
      // Older saves had one 100-point health value for the active heroine (and a shared pool).
      for (const id of ['megumin', 'roxy']) {
        const f = pl.fighters[id], sv = P.party?.[id];
        if (sv) {
          f.hp = Math.min(f.maxHp, Math.max(1, sv.hp));
          f.mana = Math.min(f.maxMana, sv.mana ?? f.maxMana);
          f.stamina = Math.min(f.maxStamina, sv.stamina ?? f.maxStamina);
        } else {
          const frac = Math.min(1, Math.max(0.2, (P.hp ?? 100) / (100 + ((P.level || 1) - 1) * 12 + 20)));
          f.hp = id === (P.character || 'megumin') ? Math.max(1, Math.round(f.maxHp * frac)) : f.maxHp;
          f.mana = Math.min(f.maxMana, P.mana ?? f.maxMana);
        }
      }
      const pos = new THREE.Vector3(P.x, P.y, P.z);
      // Saved where there is water now (the reed pond on the Olkhovka road): onto the road.
      if (g.world.surfaceAt(pos) === 'water' || g.world.surfaceAt(pos.clone().setY(g.world.heightAt(pos.x, pos.z) + 0.3)) === 'water') {
        const q = nearestRoadPoint(pos);
        pos.set(q[0], g.world.heightAt(q[0], q[1]) + 0.05, q[1]);
      }
      pl.controller.teleport(pos, P.yaw || 0);
      pl.setCheckpoint(pos, P.yaw || 0);
      g.cameraRig.snapBehind((P.yaw || 0) + Math.PI);
      if (P.character === 'roxy' && S.flags.roxy_companion) pl.switchCharacter('roxy', true);
    } else {
      // New game: the caravan has just arrived at the south gate of Axel.
      pl.level = 1;
      pl.xp = 0;
      pl.applyStats();
      pl.restoreParty(true);
      const s = this.spot('caravan_arrival');
      pl.controller.teleport(s.pos.clone(), s.yaw);
      pl.setCheckpoint(s.pos.clone(), s.yaw);
      g.cameraRig.snapBehind(s.yaw + Math.PI);
    }
    if (!S.quests.prologue_arrival) this.quests.start('prologue_arrival', true);
    for (const id of S.discovered) g.discovered.add(id);
    this._syncProps();
    if (g.world.rubble) {
      g.world.rubble.setCleared(!!S.flags.rubble_cleared);
      g.world.rubble.onCleared = () => {
        this.setFlag('rubble_cleared');
        this.say('A19_007');
        this.notify('event', 'Завал разлетелся в пыль внутри бокового тупика. Каменная арка защитила путь назад.');
      };
    }
  }

  /** Story props: hide taken shards, etc. */
  _syncProps() {
    const F = this.state.flags;
    this.game.world.crypt?.sync(F);
    this.game.world.relay?.sync(F);
    this.game.world.drain?.sync(F);
    this.game.world.pump?.sync(F, this.state.vars);
    this.game.world.port?.sync(F, this.state.vars || {});
    this.game.world.core?.sync(F);
    const led = this.game.world.ledge;
    if (led) { led.rpg ||= this; led.sync(F, this.state.vars || {}); }
    for (const it of this.game.world.interactables) {
      if (!it.setActive) continue;
      const sp = STORY_PROPS[it.id];
      if (sp) it.setActive(!!check(this, sp.when) && !(sp.once && F[sp.once]));
      if (it.id === 'glade_shard') it.setActive(!F.glade_shard_taken);
      if (it.id === 'deep_shard') it.setActive(!F.deep_shard_taken);
      if (it.id?.startsWith('rift_crystal_')) it.setActive(!F[it.id] && this.quests.stageId('roxy_trust') === 'crystals');
      if (it.id === 'astra_lever') it.setActive(this.quests.stageId('roxy_trust') === 'repair');
      if (it.id === 'crypt_gate') it.setActive(!!F.crypt_open);
      if (it.id === 'temple_room') it.setActive(this.quests.stageId('ch5_crypt') === 'prep' && !F.C00_ROOM);
      if (it.id?.startsWith('crypt_lamp_')) it.setActive(!F[it.id + '_hung'] && this.quests.status('ch5_crypt') === 'active');
      if (it.id?.startsWith('crypt_latch_')) it.setActive(this.quests.stageId('ch5_crypt') === 'water' && !F[it.id]);
      if (it.id === 'crypt_winch') it.setActive(this.quests.stageId('ch5_crypt') === 'water' && !F.crypt_drained);
      if (it.id === 'crypt_pedestal') it.setActive(this.quests.stageId('ch5_crypt') === 'shard' && !F.crypt_projection);
      if (it.id === 'return_camp') it.setActive(this.quests.stageId('ch4_return') === 'camp');
      if (it.id === 'cave_in') it.setActive(!F.rubble_cleared);
      if (it.id === 'cat_ugolek') it.setActive(this.quests.status('c_lost_cat') === 'active' && !F.cat_found);
      if (it.id === 'cat_home') it.setActive(!!F.cat_returned);
      if (it.id?.startsWith('caravan_bag_')) it.setActive(this.quests.status('a00_bags') === 'active' && !F[it.id + '_taken']);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Spots & targets
  // ---------------------------------------------------------------------------------------
  spot(name) {
    return this.game.world.npcSpots[name] || null;
  }

  spotPos(name) {
    return this.game.world.npcSpots[name]?.pos || null;
  }

  spotYaw(name) {
    return this.game.world.npcSpots[name]?.yaw || 0;
  }

  /** 'npc:id' | 'spot:name' | 'region:id' -> world position. */
  resolveTarget(t) {
    if (!t) return null;
    const [kind, id] = t.split(':');
    if (kind === 'npc') {
      const n = this.npcs?.get(id);
      if (n?.visible) return n.position;
      const def = this.npcs?.def(id);
      const sched = def && (typeof def.schedule === 'function' ? def.schedule(this) : def.schedule);
      const first = sched?.find((e) => !e.hidden);
      return first ? this.spotPos(first.spot) : null;
    }
    if (kind === 'spot') return this.spotPos(id);
    if (kind === 'region') return REGION[id]?.center || null;
    return null;
  }

  // ---------------------------------------------------------------------------------------
  // Flags / relations / xp
  // ---------------------------------------------------------------------------------------
  setFlag(name, value = true) {
    if (!!this.state.flags[name] === !!value) return;
    if (value) this.state.flags[name] = true;
    else delete this.state.flags[name];
    this.events.emit('flag', { name, value });
    this._syncProps();
    this.markDirty();
  }

  /** Story variable (scenario package: ROXY_TRUST, KHARZ_ROUTE...). Emits 'flag' so quests re-evaluate. */
  setVar(name, value) {
    const V = (this.state.vars ||= {});
    if (V[name] === value) return;
    V[name] = value;
    this.events.emit('flag', { name, value });
    this._syncProps();
    this.markDirty();
  }

  /** Numeric story variable += delta, clamped to [min, max] when given. */
  addVar(name, delta, min = -Infinity, max = Infinity) {
    const have = typeof this.state.vars?.[name] === 'number' ? this.state.vars[name] : 0;
    this.setVar(name, Math.max(min, Math.min(max, have + delta)));
  }

  getVar(name) {
    return this.state.vars?.[name];
  }

  changeRel(npc, delta) {
    const r = this.state.rel;
    r[npc] = Math.max(-100, Math.min(100, (r[npc] || 0) + delta));
    this.markDirty();
  }

  gainXp(n) {
    const pl = this.game.player;
    pl.xp += n;
    while (pl.xp >= XP_TABLE(pl.level)) {
      pl.xp -= XP_TABLE(pl.level);
      pl.level++;
      pl.applyStats();
      pl.restoreParty(false);
      this.notify('level', `Уровень ${pl.level}! Здоровье и мана выросли.`);
      this.game.audio?.play('levelup');
      this.game.vfx.burst('magicPop', pl.position.clone().setY(pl.position.y + 1), 50);
    }
    this.markDirty();
  }

  check(cond) {
    return check(this, cond);
  }

  // ---------------------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------------------
  apply(effects, npc) {
    if (!effects) return;
    const list = Array.isArray(effects) ? effects : [effects];
    // A turn-in is all or nothing: if the items to hand over are no longer in the bag (sold,
    // used), none of the effects happen.
    const inv = this.inventory;
    const short = list.flatMap((e) => (e && e.take ? e.take : [])).filter(([id, n]) => inv.count(id) < n);
    if (short.length) {
      this.game.hud.toast('Не хватает: ' + short.map(([id, n]) => `${ITEMS[id]?.name || id} ×${n}`).join(', '), 3);
      return false;
    }
    for (const e of list) {
      if (typeof e === 'function') { e(this, npc); continue; }
      for (const [k, v] of Object.entries(e)) this._effect(k, v, npc);
    }
  }

  _effect(k, v, npc) {
    const inv = this.inventory;
    switch (k) {
      case 'setFlag': for (const f of [].concat(v)) this.setFlag(f); break;
      case 'clearFlag': for (const f of [].concat(v)) this.setFlag(f, false); break;
      case 'setVar': this.setVar(v[0], v[1]); break;
      case 'addVar': this.addVar(v[0], v[1], v[2], v[3]); break;
      case 'give': for (const [id, n] of v) inv.add(id, n, false, true); break;
      case 'take': for (const [id, n] of v) inv.remove(id, n); break;
      case 'eris': if (v > 0) inv.add('eris', v); else inv.spend(-v); break;
      case 'xp': this.gainXp(v); break;
      case 'rel': this.changeRel(v[0], v[1]); break;
      case 'startQuest': this.quests.start(v); break;
      case 'advance': this.quests.advance(v); break;
      case 'completeQuest': this.quests.complete(v); break;
      case 'openShop': this.dialogue.current && this.dialogue.end(); this.ui.shop.openShop(v); break;
      case 'openCraft': this.dialogue.current && this.dialogue.end(); this.ui.shop.openCraft(v); break;
      case 'openBoard': this.dialogue.current && this.dialogue.end(); this.ui.menu.show('guild'); break;
      case 'joinGuild': this.guild.join(); break;
      case 'promote': if (typeof v === 'string') this.guild.promoteTo(v); else this.guild.promote(); break;
      case 'sleep': this.sleep(v); break;
      case 'toast': this.game.hud.toast(v, 4); break;
      case 'notify': this.notify('info', v); break;
      case 'travel': this.dialogue.current && this.dialogue.end(); this.game.travel(v); break;
      case 'spawn': {
        const p = this.spotPos(v.spot);
        if (p) for (let i = 0; i < (v.n || 1); i++) {
          const a = (i / (v.n || 1)) * Math.PI * 2;
          const e = this.game.enemies.spawn(v.type, new THREE.Vector3(p.x + Math.cos(a) * (v.r || 4), p.y, p.z + Math.sin(a) * (v.r || 4)), v.camp);
          e.noRespawn = true;
        }
        break;
      }
      case 'met': this.state.met[v] = true; break;
      case 'counter': this.state.counters[v[0]] = (this.state.counters[v[0]] || 0) + (v[1] ?? 1); break;
      case 'event': this.events.emit('custom', { name: v }); break;
      case 'follow': { const n = this.npcs.get(v[0]); n?.setFollow(v[1] ? { pos: () => this.game.player.position, keep: 2.4 } : null); if (!v[1]) n?.refresh(true); break; }
      case 'escort': this.startEscort(v); break;
      case 'heal': this.game.player.restoreParty(true); break;
      case 'say': this.say(v); break;
      case 'sayChain': this._sayChain(v); break;
      case 'wave': this._startWave(v); break;
      case 'cart': this.game.world.ledge?.runCart(v, () => this.apply(v === 'empty' ? [{ setFlag: 'cart_empty_ok' }, { scene: 'D09a' }] : [{ setFlag: 'cart_loaded_ok' }, { scene: 'D09b' }])); break;
      case 'save': this.save(); break;
      case 'scene': setTimeout(() => { if (!this.dialogue.active) this.dialogue.start(v, null); }, 400); break;
      case 'startIfAvailable': if (this.quests.canStart(v)) this.quests.start(v); break;
      case 'ritualWave': {
        const p = this.spotPos('astrarium_center');
        if (p) for (let i = 0; i < 2; i++) {
          const a = (i / 2) * Math.PI * 2 + (v === 2 ? 1.2 : 0);
          const e = this.game.enemies.spawn('guardian', new THREE.Vector3(p.x + Math.cos(a) * 11, p.y, p.z + Math.sin(a) * 11), 'rift_wave');
          e.noRespawn = true;
        }
        this._ritualKills = v === 1 ? 0 : this._ritualKills;
        this._sayChain(v === 1 ? ['A25_006', 'A25_007'] : ['A25_008']);
        break;
      }
      case 'readItem': this.game.hud.readBook(ITEMS[v]); break;
      case 'read': this.game.hud.readBook({ icon: v.icon || '📜', name: v.title, text: v.text }); break;
      case 'refreshNPCs': this.npcs?.refresh(); break;
      case 'unlockRoxy': this.setFlag('roxy_companion'); this.game.hud.setCompanion(true); break;
      default: console.warn('Unknown effect', k);
    }
    this.markDirty();
  }

  // ---------------------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------------------
  talkTo(npc) {
    const def = npc.def;
    this.state.met[npc.id] = true;
    // Story quests offered by this person start as soon as you talk to them.
    for (const [id, d] of Object.entries(this.quests.defs)) {
      if (d.giver === npc.id && d.category === 'story' && !d.noAuto && this.quests.canStart(id)) this.quests.start(id);
    }
    for (const t of talkOrder(def)) {
      if (!t.if || this.check(t.if)) {
        if (t.dialogue) {
          npc.startTalk();
          this.game.beginTalk?.(npc);
          this.dialogue.start(t.dialogue, npc);
          return;
        }
        if (t.bark) {
          this._bark(npc, t.bark);
          return;
        }
      }
    }
    if (def.barks?.length) this._bark(npc, def.barks);
  }

  /** One recorded line of the package outside a conversation (a cast cry, a thought): shown as a toast. */
  say(clipId) {
    const c = CLIPS[clipId];
    if (!c) return;
    const who = VOICE[c[0]];
    const name = who === 'megumin' ? 'Мегумин' : this.npcs?.def(who)?.name || c[0];
    this.game.hud.toast(`${name}: «${c[1]}»`, 4);
    if (!this.dialogue.current) this.game.voice?.play(clipId); // a bark never cuts a conversation
    this.events.emit('say', { id: clipId });
  }

  /** Recorded lines one after another (toasts, 2.6 s apart). */
  _sayChain(ids, gap = 2.6) {
    ids.forEach((id, i) => setTimeout(() => this.say(id), i * gap * 1000));
  }

  /** New game: the cutscene-like first conversation with Marta (A00); the player moves after it. */
  autoIntro() {
    if (this.state.quests.prologue_arrival?.stage !== 0) return;
    // After ~1 s AND some real game frames: the first frames place the heroine and Marta (a slow first frame - shaders
    // compiling - must not open the scene with nobody on screen yet)
    const g = this.game, t0 = performance.now(), f0 = g.frames;
    const tick = () => {
      if (g.frames - f0 < 15 || performance.now() - t0 < 900) { setTimeout(tick, 100); return; }
      const marta = this.npcs?.get('marta');
      if (marta && !this.dialogue.active) this.talkTo(marta);
    };
    setTimeout(tick, 100);
  }

  _bark(npc, lines) {
    const arr = typeof lines === 'function' ? lines(this) : lines;
    const i = (this._barkIdx = ((this._barkIdx || 0) + 1)) % arr.length;
    this.game.hud.toast(`${npc.def.name}: «${arr[i]}»`, 4);
  }

  onInteract(id, prop) {
    this.events.emit('interact', { id });
    const F = this.state.flags;
    const text = PROP_TEXTS[id];
    switch (id) {
      case 'glade_shard':
        // A16: Megumin's own lines at the stump; the shard is taken at the end of the scene.
        if (!F.glade_shard_taken && !this.dialogue.active) this.dialogue.start('A16', null);
        break;
      case 'deep_shard':
        if (!F.deep_shard_taken && !this.dialogue.active) this.dialogue.start('A19:after', null);
        break;
      case 'cave_in':
        if (F.rubble_cleared) this.game.hud.toast('Проход расчищен.', 4);
        else if (!F.A19_SEEN && this.quests.status('ch3_lights') === 'active' && !this.dialogue.active) this.dialogue.start('A19', null);
        else this.game.hud.toast('Завал. Игла показывает за него. Отойти к каменной арке и ударить взрывом (X).', 5);
        break;
      case 'tower_logbook':
        // B07b: Megumin reads the old logbook aloud (a dialogue while the order is open, the plain text afterwards).
        if (this.quests.stageId('c_watchtower') === 'log' && !this.dialogue.active) this.dialogue.start('B07b', null);
        else if (text) this.apply({ read: text });
        break;
      case 'temple_room':
        if (this.quests.stageId('ch5_crypt') === 'prep' && !F.C00_ROOM) {
          this.setFlag('C00_ROOM');
          this.notify('info', 'Нижняя комната пуста: работница сказала, что все ушли в западный зал.');
        } else this.game.hud.toast('Служебная комната под лестницей. Пусто.', 3);
        break;
      case 'crypt_lamp_a':
      case 'crypt_lamp_b':
        if (!F[id + '_hung'] && this.inventory.count('crypt_lamp') > 0) {
          this.inventory.remove('crypt_lamp', 1);
          this.setFlag(id + '_hung');
          const p = prop.root.getWorldPosition(new THREE.Vector3());
          this.game.player.setCheckpoint(new THREE.Vector3(p.x, 0.05, p.z), this.game.player.controller.yaw);
          this.game.vfx.burst('magicPop', p, 24);
          this.notify('info', 'Лампа повешена: это отметка на обратном пути.');
        } else this.game.hud.toast(F[id + '_hung'] ? 'Лампа уже висит.' : 'Нужна лампа гильдии.', 3);
        break;
      case 'crypt_latch_0':
      case 'crypt_latch_1':
      case 'crypt_latch_2':
        this.game.hud.toast(F[id] ? 'Защёлка сбита.' : 'Защёлка высоко над полом. Руками не достать: нужен водяной залп Рокси (Tab, затем Q).', 4);
        break;
      case 'crypt_winch':
        if (F.crypt_drained) this.game.hud.toast('Вода ушла в сток.', 3);
        else if (!F.crypt_gate_open) this.game.hud.toast('Галерея заперта: сначала три защёлки.', 3);
        else if (this.game.player.character !== 'megumin') this.game.hud.toast('Рукоять заедает. Тут нужен посох Мегумин (Tab).', 4);
        else {
          this.setFlag('crypt_drained');
          this.notify('event', 'Рукоять провернулась: вода уходит в сток.');
          this._sayChain(['C03_013', 'C03_014']);
        }
        break;
      case 'crypt_pedestal':
        if (this.quests.stageId('ch5_crypt') === 'shard' && !F.crypt_projection && !this.dialogue.active) {
          this.inventory.add('star_shard', 1, false, true);
          this.setFlag('crypt_projection');
          this.game.vfx.burst('magicPop', prop.root.getWorldPosition(new THREE.Vector3()), 60);
          this.dialogue.start('C04', null);
        } else this.game.hud.toast(F.C04_DONE ? 'Постамент пуст. Осколки у вас.' : 'Постамент для осколков: подойди, когда спустишься до ниши.', 4);
        break;
      case 'return_camp':
        if (this.quests.stageId('ch4_return') === 'camp' && !this.dialogue.active) this.dialogue.start('A27', null);
        else this.game.hud.toast('Костёр. Здесь можно присесть.', 3);
        break;
      case 'astra_lever':
        this.notify('info', 'Стойка поднимается на место.');
        break;
      case 'cat_ugolek':
        if (!F.cat_found) {
          this.setFlag('cat_found');
          this.notify('info', 'Уголёк недовольно мяукнул, но позволил взять себя на руки.');
        }
        break;
      case 'guild_board':
        if (this.state.guild.member) this.ui.menu.show('guild');
        else this.game.hud.toast('«Заказы — только для членов гильдии. Регистрация у стойки.»', 4);
        break;
      case 'town_board': {
        const notes = [
          '«Гильдия искателей приключений приглашает новичков! Регистрация у Луны.»',
          '«Пропал чёрный кот, отзывается на Уголька. Мия, дом у южного переулка.»',
          '«Срочно: руда! Кузница Гаррета.»',
          F.olkhovka_route ? '«По чётным дням на восточной дороге торгует странствующий купец Сайрус.»' : '«Ищу охрану до Ольховки. Тобиас, у восточных ворот.»',
          '«Храм Эрис: исцеление для всех, кто приходит с миром.»',
          F.ch5_hook ? '«Крипта под храмом временно закрыта. — сестра Клара»' : '«Ночные огни над хребтом — это болотные газы. — Капитан стражи»',
        ];
        this.apply({ read: { icon: '📌', title: 'Городская доска объявлений', text: notes.join('\n\n') } });
        break;
      }
      case 'cat_home':
        this.game.hud.toast('Уголёк: «Мрррр…» Кажется, он вас запомнил.', 3);
        break;
      default:
        if (STORY_PROPS[id]) this._storyProp(STORY_PROPS[id], id, prop);
        else if (id.startsWith('caravan_bag_')) {
          this.setFlag(id + '_taken');
          this.notify('info', 'Мешок тяжёлый. Складываю у телеги Марты.');
        } else if (id.startsWith('rift_crystal_')) {
          if (!F[id]) {
            this.setFlag(id);
            this.inventory.add('resonance_crystal', 1);
            this.game.vfx.burst('magicPop', prop.root.getWorldPosition(new THREE.Vector3()), 30);
            // A23: one line at each crystal; the third depends on the promise.
            const n = this.inventory.count('resonance_crystal');
            this.say(n <= 1 ? 'A23_001' : n === 2 ? 'A23_002' : this.getVar('ROXY_EXPLOSION') ? 'A23_004' : 'A23_003');
          }
        } else if (text) this.apply({ read: text });
    }
    this._syncProps();
  }

  onChestOpened(id, loot) {
    if (!this.state.chests.includes(id)) this.state.chests.push(id);
    loot.forEach(([item, n], i) => setTimeout(() => this.inventory.add(item, n), 250 + i * 220));
    this.gainXp(15);
    this.notify('loot', 'Сундук открыт!');
    this.markDirty(true);
  }

  enterRegion(R) {
    const g = this.game;
    const first = !g.discovered.has(R.id);
    if (first) {
      g.discovered.add(R.id);
      this.state.discovered = [...g.discovered];
      if (R.spawn) g.player.setCheckpoint(R.spawn.clone().setY(g.world.heightAt(R.spawn.x, R.spawn.z)), R.spawnYaw || 0);
      if (R.tier !== undefined && first && R.id !== 'axel' && !R.interior) this.gainXp(R.secret ? 40 : 15);
      this.markDirty(true);
    }
    this.events.emit('region', { id: R.id, first });
    return first;
  }

  startEscort(v, ambushed = false) {
    const n = this.npcs.get(v.npc);
    if (!n) return;
    this.escort = { npc: n, to: this.spotPos(v.to), quest: v.quest, ambush: v.ambush, ambushed, def: v, cowering: false, barkT: 0 };
    n.setFollow(null);
    n._goTo(this.escort.to, v.road ? roadRoute(v.road, n.position) : v.route);
    n.escorting = true;
    n.escortSpeed = 3.0;
  }


  /** V01 / V02: a short cry of the heroine, now and then (not in dialogues, never twice within `gap` seconds). */
  _combatBark(clip, chance, gap) {
    const t = performance.now() / 1000;
    if (this.dialogue.active || t - (this._cbT?.[clip] ?? -99) < gap || Math.random() > chance) return;
    (this._cbT ||= {})[clip] = t;
    this.say(clip);
  }

  /**
   * A spoken line of the combat description (CB_M* / CB_R*), rare and never over a conversation: one global gap
   * of 3 s, a per-line gap, and never the same line twice in a row (docs/combat/05 §6).
   */
  combatBark(clip, hero) {
    const t = performance.now() / 1000;
    if (this.dialogue.active || t - (this._cbAny ?? -99) < 3 || this._lastBark === clip) return;
    const gap = /CB_M001|CB_R001|CB_R002/.test(clip) ? 12 : 20;
    if (t - (this._cbT?.[clip] ?? -99) < gap) return;
    if (/CB_M001|CB_R001|CB_R002|CB_M003/.test(clip) && Math.random() > 0.5) return;
    (this._cbT ||= {})[clip] = t;
    this._cbAny = t;
    this._lastBark = clip;
    void hero;
    this.say(clip);
  }

  /** Story / zone rules for explosive spells (Explosion and Crimson Breach both carry the `explosive` tag). */
  explosiveAllowed(heroId, spec, pos) {
    const A = REGION.astrarium;
    if (pos && this.quests.status('roxy_trust') === 'active' && Math.hypot(pos.x - A.center.x, pos.z - A.center.z) <= A.r + 10) {
      const st = this.quests.stageId('roxy_trust');
      if ((st === 'crystals' || st === 'return') && this.getVar('ROXY_PROMISE')) return { ok: true, warn: 'Рокси просила не взрывать в руинах: это нарушит обещание.' };
      if (st === 'defend') {
        const far = this.spotPos('astrarium_far');
        if (far && Math.hypot(pos.x - far.x, pos.z - far.z) > 14) return { ok: true, warn: 'Ритуал: взрыв разрешён только в дальнем секторе.' };
      }
    }
    return { ok: true };
  }

  /** V03 / V04: on the road, Megumin and Roxy talk now and then (by the level of trust). */
  _roadBark(dt) {
    if (!this.state.flags.roxy_companion || this.game.inDungeon || this.dialogue.active) return;
    this._roadT = (this._roadT ?? 120 + Math.random() * 120) - dt;
    if (this._roadT > 0) return;
    this._roadT = 180 + Math.random() * 180;
    const hi = (this.getVar('ROXY_TRUST') ?? 0) >= 3;
    const groups = hi ? [[1, 2, 3, 4], [5, 6, 7], [8, 9, 10]] : [[1, 2], [3, 4, 5], [6, 7]];
    const g = groups[Math.floor(Math.random() * groups.length)];
    this._sayChain(g.map((n) => `${hi ? 'V03' : 'V04'}_${String(n).padStart(3, '0')}`));
  }

  /** A story prop from data/story/props.js used by the player. */
  _storyProp(sp, id, prop) {
    const hud = this.game.hud;
    if (this.dialogue.active) return;
    if (sp.char && this.game.player.character !== sp.char) { hud.toast(sp.wrong || 'Сейчас нужна другая героиня (Tab).', 4); return; }
    if (sp.need && !check(this, sp.need)) { hud.toast(sp.locked || 'Пока не получится.', 4); return; }
    if (sp.once) this.setFlag(sp.once);
    if (sp.vfx && prop?.root) this.game.vfx.burst(sp.vfx, prop.root.getWorldPosition(new THREE.Vector3()), 24);
    if (sp.toast) hud.toast(sp.toast, 4);
    if (sp.do) this.apply(sp.do);
    if (sp.say) this._sayChain(sp.say);
    if (sp.scene) this.dialogue.start(sp.scene, null);
  }

  /** Roxy's volley at the targets of STORY_VOLLEY (a cone of about 20 degrees, 32 m). */
  _volleyStory(e) {
    const F = this.state.flags;
    for (const t of STORY_VOLLEY) {
      if (F[t.flag] || !check(this, t.when)) continue;
      const s = this.spotPos(t.spot);
      if (!s) continue;
      const dx = s.x - e.from.x, dz = s.z - e.from.z, L = Math.hypot(dx, dz);
      if (L > 32 || L < 1) continue;
      if ((dx * e.dir.x + dz * e.dir.z) / (L * (Math.hypot(e.dir.x, e.dir.z) || 1)) < Math.cos(0.36)) continue;
      this.setFlag(t.flag);
      this.game.vfx.burst('waterSplash', s.clone(), 24);
      if (t.toast) this.notify('event', t.toast);
      if (t.do) this.apply(t.do);
    }
  }

  /** Enemy waves of STORY_WAVES: started by the effect { wave: id }, closed by the last kill (onClear). */
  _startWave(id) {
    if (!STORY_WAVES[id] || this.state.flags['wv_' + id]) return;
    this.setFlag('wv_' + id);
    this._spawnWave(id);
    if (STORY_WAVES[id].say) this._sayChain(STORY_WAVES[id].say);
  }

  _spawnWave(id, fromLoad = false) {
    const W = STORY_WAVES[id];
    const p = this.spotPos(W.spot);
    if (!p) return;
    const killed = this.state.counters['wk_' + id] || 0;
    const rest = W.enemies.slice(killed);
    const put = (type, dx, dz, o) => {
      const at = o?.at ? this.spotPos(o.at) : null; // a wave can stand on several named marks
      const base = at || p;
      const e = this.game.enemies.spawn(type, new THREE.Vector3(base.x + dx, base.y, base.z + dz), W.camp);
      e.noRespawn = true;
      if (o?.shield) e.shieldFlags = o.shield; // immune until these flags are set (the side posts of C24)
    };
    if (W.delay && !fromLoad) {
      // The marks light up first; the enemies rise on them a moment later (never a hit from behind a tired heroine).
      for (const [, dx, dz, o] of rest) { const b = (o?.at && this.spotPos(o.at)) || p; this.game.vfx.burst('magicPop', new THREE.Vector3(b.x + dx, b.y + 0.2, b.z + dz), 18); }
      setTimeout(() => { for (const [type, dx, dz, o] of rest) put(type, dx, dz, o); }, W.delay * 1000);
    } else for (const [type, dx, dz, o] of rest) put(type, dx, dz, o);
  }

  _waveKill(camp) {
    const F = this.state.flags;
    for (const [id, W] of Object.entries(STORY_WAVES)) {
      if (W.camp !== camp || !F['wv_' + id] || F['wd_' + id]) continue;
      const n = (this.state.counters['wk_' + id] = (this.state.counters['wk_' + id] || 0) + 1);
      this.markDirty();
      if (n >= W.enemies.length) {
        this.setFlag('wd_' + id);
        if (W.onClear) this.apply(W.onClear);
      }
    }
  }

  /** Loaded in the middle of a wave: the enemies that were still alive are back. */
  _resumeWaves() {
    const F = this.state.flags;
    for (const id of Object.keys(STORY_WAVES)) if (F['wv_' + id] && !F['wd_' + id]) this._spawnWave(id, true);
  }

  /** After a load: an escort that was under way goes on from where it was saved. */
  /** Loaded in the middle of the ritual fight (A25): the guardians that were still alive are back. */
  _resumeRitual() {
    if (this.quests.stageId('roxy_trust') !== 'defend') return;
    const done = this.state.quests.roxy_trust.progress?.[0] || 0;
    const p = this.spotPos('astrarium_center');
    if (!p || done >= 4) return;
    this._ritualKills = done;
    for (let i = 0; i < 4 - done; i++) {
      const a = (i / (4 - done)) * Math.PI * 2;
      const e = this.game.enemies.spawn('guardian', new THREE.Vector3(p.x + Math.cos(a) * 11, p.y, p.z + Math.sin(a) * 11), 'rift_wave');
      e.noRespawn = true;
    }
  }

  _resumeEscort() {
    if (this.escort || this.quests.stageId('c_escort_tobias') !== 'escort') return;
    const E = this.state.escort;
    const v = E?.def || { npc: 'tobias', to: 'olkhovka_tobias', road: 'east_road', ambush: { spot: 'ambush_point', type: 'mushroom', n: 3 } };
    const n = this.npcs?.get(v.npc);
    if (!n) return;
    if (E && Number.isFinite(E.x)) {
      n.pos.set(E.x, 0, E.z);
      n.pos.y = n._ground(E.x, E.z);
    }
    n._setVisible(true);
    this.startEscort(v, !!E?.ambushed);
  }

  _updateEscort(dt = 1 / 60) {
    const e = this.escort;
    if (!e) return;
    const n = e.npc;
    const pp = this.game.player.position;
    e.barkT -= dt;
    // Tobias walks at the player's pace: waits when she falls behind (> 14 m), keeps up when she
    // is ahead, and complains if she runs off.
    const gap = n.position.distanceTo(pp);
    const nxt = n.path?.[0];
    let ahead = false;
    if (nxt) {
      const hx = nxt.x - n.position.x, hz = nxt.z - n.position.z, L = Math.hypot(hx, hz) || 1;
      ahead = ((pp.x - n.position.x) * hx + (pp.z - n.position.z) * hz) / L > 1;
    }
    n.paused = gap > 14;
    n.escortSpeed = ahead ? 3.4 : gap > 6 ? 2.2 : 3.0;
    if (ahead && gap > 12 && e.barkT <= 0) { this._bark(n, ['Не так быстро! Мул за тобой не успевает!']); e.barkT = 12; }
    // Ambush: he hides while the mushrooms are alive.
    const foes = this.game.enemies.list?.filter?.((x) => x.camp === 'ambush' && x.hp > 0 && x.position.distanceTo(n.position) < 25) || [];
    const cower = foes.length > 0;
    if (cower !== e.cowering) {
      e.cowering = cower;
      // B06b: Tobias hides, Megumin tells him to stay; after the fight she calls the road clear.
      this._sayChain(cower ? ['B06b_001', 'B06b_002', 'B06b_003'] : ['B06b_004', 'B06b_005', 'B06b_006']);
    }
    n.cower = cower;
    if (e.ambush && !e.ambushed) {
      const a = this.spotPos(e.ambush.spot) || new THREE.Vector3(...e.ambush.pos);
      if (n.position.distanceTo(a) < 14) {
        e.ambushed = true;
        for (let i = 0; i < e.ambush.n; i++) {
          const en = this.game.enemies.spawn(e.ambush.type, new THREE.Vector3(a.x + Math.cos(i * 2.1) * 6, a.y, a.z + Math.sin(i * 2.1) * 6), 'ambush');
          en.noRespawn = true;
        }
        this.notify('event', 'Засада! Защити Тобиаса!');
        this.markDirty(true);
      }
    }
    if (e.to && n.position.distanceTo(e.to) < 2.5) {
      this.escort = null;
      n.escorting = false;
      n.cower = false;
      this.state.escort = null;
      this.events.emit('escort', { npc: n.id });
    }
  }

  sleep(hour = 7) {
    this.clock.advanceTo(hour);
    const pl = this.game.player;
    pl.restoreParty(true);
    this.game.hud.fade?.(1.2);
    this.notify('info', `Вы хорошо выспались. ${this.clock.label()}`);
    if (this.quests.stageId('ch5_crypt') === 'rest') this.setFlag('C_RESTED');
    if (this.getVar('RANN_NESTS')) this.setFlag('rann_slept'); // B19: the note in the camp box appears after a rest
    this.npcs?.refresh();
    this.gathering?.update();
    this.markDirty(true);
  }

  notify(kind, text) {
    this.ui?.notify?.(kind, text);
    this.state.log.unshift({ day: this.clock.day, text });
    if (this.state.log.length > 40) this.state.log.length = 40;
  }

  // ---------------------------------------------------------------------------------------
  // Fog of war for the map.
  // ---------------------------------------------------------------------------------------
  _explore(p) {
    if (inAinSheet(p.x, p.z)) {
      const c = EXPLORE_AIN.cell, ci = Math.floor((p.x - AIN_SHEET.x0) / c), cj = Math.floor((p.z - AIN_SHEET.z0) / c), R = 5;
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
        if (i < 0 || j < 0 || i >= EXPLORE_AIN.nx || j >= EXPLORE_AIN.nz || (i - ci) ** 2 + (j - cj) ** 2 > R * R) continue;
        this.exploredAin[j * EXPLORE_AIN.nx + i] = 1;
      }
      return;
    }
    const cell = (HALF * 2) / EXPLORE_N;
    const ci = Math.floor((p.x + HALF) / cell), cj = Math.floor((p.z + HALF) / cell);
    const R = 4;
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= EXPLORE_N || j >= EXPLORE_N) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > R * R) continue;
      this.explored[j * EXPLORE_N + i] = 1;
    }
  }

  isExplored(x, z) {
    if (inAinSheet(x, z)) {
      const c = EXPLORE_AIN.cell, i = Math.floor((x - AIN_SHEET.x0) / c), j = Math.floor((z - AIN_SHEET.z0) / c);
      return i >= 0 && j >= 0 && i < EXPLORE_AIN.nx && j < EXPLORE_AIN.nz && !!this.exploredAin[j * EXPLORE_AIN.nx + i];
    }
    const cell = (HALF * 2) / EXPLORE_N;
    const i = Math.floor((x + HALF) / cell), j = Math.floor((z + HALF) / cell);
    return i >= 0 && j >= 0 && i < EXPLORE_N && j < EXPLORE_N && !!this.explored[j * EXPLORE_N + i];
  }

  // ---------------------------------------------------------------------------------------
  /** Story place triggers (data/story/triggers.js): once per save, when the condition holds and the player is near. */
  _updateTriggers(dt) {
    this._trgT = (this._trgT || 0) - dt;
    if (this._trgT > 0 || this.dialogue.active) return;
    this._trgT = 0.6;
    const pp = this.game.player.position;
    for (const t of TRIGGERS) {
      const key = 'trg_' + t.id;
      if (this.state.flags[key] || !check(this, t.if)) continue;
      const s = this.spotPos(t.spot);
      if (!s || Math.hypot(pp.x - s.x, pp.z - s.z) > (t.r ?? 10)) continue;
      this.setFlag(key);
      if (t.say) this._sayChain(t.say);
      if (t.do) this.apply(t.do);
      if (t.dialogue) this.dialogue.start(t.dialogue, null);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Fast travel in the capital: the carts of the city and the river ferry between the safe stops (data/travel.js)
  // ---------------------------------------------------------------------------------------
  /** A stop opens when the player has been at it. */
  _updateStops() {
    if (!this.getVar('AINSTRAY_ENTERED')) return;
    const pp = this.game.player.position;
    for (const st of STOPS) {
      if (this.state.flags['stop_' + st.id]) continue;
      const s = this.spotPos(st.spot);
      if (s && Math.hypot(pp.x - s.x, pp.z - s.z) < STOP_R) {
        this.setFlag('stop_' + st.id);
        const n = STOPS.filter((x) => this.state.flags['stop_' + x.id]).length;
        this.notify('info', `Остановка открыта: ${st.name}.` + (n === STOPS_NEEDED ? ' Повозки и речной перевозчик теперь возят между известными остановками (карта, лист «Айнстрей»).' : ''));
      }
    }
  }

  knownStops() {
    return STOPS.filter((st) => this.state.flags['stop_' + st.id]);
  }

  /** { ok, reason }: may the carts leave now? */
  canFastTravel() {
    const g = this.game;
    if (!this.getVar('AINSTRAY_ENTERED')) return { ok: false, reason: 'Повозки столицы начинают возить после первого входа в город.' };
    if (this.knownStops().length < STOPS_NEEDED) return { ok: false, reason: `Повозки возят между остановками, которые вы уже видели (нужно ${STOPS_NEEDED}, открыто ${this.knownStops().length}).` };
    if (g.inDungeon || this.dialogue.active) return { ok: false, reason: 'Сейчас недоступно.' };
    if (g.enemies.list.some((e) => e.alive && e.aggroed && e.position.distanceTo(g.player.position) < 40)) return { ok: false, reason: 'Рядом враги: повозка не подъедет.' };
    const pp = g.player.position;
    if (!inAinSheet(pp.x, pp.z) || !this._nearCity(pp)) return { ok: false, reason: 'Повозки ходят только внутри городских стен.' };
    return { ok: true };
  }

  _nearCity(pp) {
    const u = pp.x - AIN_ORIGIN.x, v = pp.z - AIN_ORIGIN.z;
    let inside = false;
    for (let i = 0, j = CITY_WALL.length - 1; i < CITY_WALL.length; j = i++) {
      const a = CITY_WALL[i], b = CITY_WALL[j];
      if (a.v > v !== b.v > v && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
    }
    return inside;
  }

  fastTravel(id) {
    const st = STOPS.find((x) => x.id === id);
    const can = this.canFastTravel();
    if (!st || !can.ok) { if (!can.ok) this.game.hud.toast(can.reason, 3); return false; }
    if (!this.state.flags['stop_' + id]) { this.game.hud.toast('Эту остановку вы ещё не видели.', 3); return false; }
    this.game.travel(st.spot);
    // the ride takes a quarter of an hour of the day
    const t = this.state.time;
    t.minutes += 15;
    if (t.minutes >= 1440) { t.minutes -= 1440; t.day += 1; }
    this.notify('info', `${st.ride[0].toUpperCase()}${st.ride.slice(1)}: ${st.name}.`);
    this.npcs?.refresh();
    this.markDirty(true);
    return true;
  }

  /** Pits of STORY_LURES: an enemy of the camp that walks into one falls and is out of the fight (it counts as a kill of the wave). */
  _updateLures() {
    for (const L of STORY_LURES) {
      if (!check(this, L.when)) continue;
      const s = this.spotPos(L.spot);
      if (!s) continue;
      for (const e of this.game.enemies.list) {
        if (!e.alive || e.camp !== L.camp) continue;
        if (Math.hypot(e.position.x - s.x, e.position.z - s.z) <= L.r && e.position.y < s.y + 1.2) e.takeHit(1e6, s, 0);
      }
    }
  }

  update(dt) {
    const newDay = this.clock.update(dt);
    if (newDay) {
      this.notify('info', `Наступил день ${this.clock.day}.`);
      this.markDirty(true);
    }
    this._t = (this._t || 0) - dt;
    if (this._t <= 0) {
      this._t = 0.5;
      const pp = this.game.player.position;
      this._explore(pp);
      this.quests.update(pp);
      this._updateTriggers(0.5);
      this._updateLures();
      this._updateStops();
      this.gathering.update();
      // Schedules change on the hour.
      const hour = Math.floor(this.clock.hour);
      if (hour !== this._hour) {
        this._hour = hour;
        this.npcs?.refresh();
      }
    }
    this.worldEvents.update(dt);
    this._roadBark(dt);
    this._updateEscort(dt);
    // Saving.
    this.autosave -= dt;
    if (this.dirty) this.saveTimer -= dt;
    if ((this.dirty && this.saveTimer <= 0) || this.autosave <= 0) this.save();
  }

  markDirty(soon = false) {
    if (!this.dirty) this.saveTimer = soon ? 0.4 : 8;
    else if (soon) this.saveTimer = Math.min(this.saveTimer, 0.4);
    this.dirty = true;
  }

  save() {
    const g = this.game;
    const pl = g.player;
    if (!pl.controller || this.game.inDungeonTransition) return;
    const S = this.state;
    // Don't save a position in mid-air or while dead: use the checkpoint instead.
    const pos = pl.hp > 0 && pl.controller.grounded ? pl.position : pl.spawnPoint;
    const party = {};
    for (const id of ['megumin', 'roxy']) {
      const f = pl.fighters[id];
      party[id] = { hp: Math.max(1, f.hp), mana: f.mana, stamina: f.stamina, present: pl.slots[id]?.present || false };
    }
    S.player = { x: pos.x, y: pos.y, z: pos.z, yaw: pl.controller.yaw, hp: Math.max(1, pl.hp), mana: pl.mana, level: pl.level, xp: pl.xp, character: pl.character, party };
    S.inventory = g.inventory.serialize();
    S.discovered = [...g.discovered];
    let bin = '';
    for (let i = 0; i < this.explored.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= (this.explored[i + k] || 0) << k;
      bin += String.fromCharCode(b);
    }
    S.explored = btoa(bin);
    let bin2 = '';
    for (let i = 0; i < this.exploredAin.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= (this.exploredAin[i + k] || 0) << k;
      bin2 += String.fromCharCode(b);
    }
    S.exploredAin = btoa(bin2);
    const e = this.escort;
    S.escort = e ? { def: e.def, ambushed: e.ambushed, x: e.npc.position.x, z: e.npc.position.z } : null;
    S.savedAt = Date.now(); // the save card of the main menu
    if (!writeSave(S)) {
      // Storage full / blocked: keep the progress dirty and retry soon; tell the player once.
      this.saveTimer = 10;
      if (!this._saveWarned) this.notify('info', 'Не удалось сохранить игру (хранилище браузера переполнено?). Повторю попытку.');
      this._saveWarned = true;
      return;
    }
    this._saveWarned = false;
    this.dirty = false;
    this.autosave = 30;
  }
}

/** Nearest point on any road (MapData ROADS): [x, z]. */
function nearestRoadPoint(p) {
  let best = [p.x, p.z], bd = Infinity;
  for (const r of ROADS) {
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
      const x = ax + dx * t, z = az + dz * t, d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = [x, z]; }
    }
  }
  return best;
}

/** Waypoints along a road (MapData ROADS) from the point nearest to `from` to the road's end. */
function roadRoute(id, from) {
  const pts = ROADS.find((r) => r.id === id)?.points;
  if (!pts) return null;
  // Nearest segment; walk on from its far end.
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((from.x - ax) * dx + (from.z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(from.x - ax - dx * t, from.z - az - dz * t);
    if (d < bd) { bd = d; best = i; }
  }
  return pts.slice(best + 1);
}

export { REGIONS };

const _talkOrder = new WeakMap();
/** An offer of a side contract (`status: 'available'`) never hides a story step of the same person: the offers move behind
 *  the last conversation that belongs to a quest stage; everything else keeps the order of data/npcs.js. */
function talkOrder(def) {
  let list = _talkOrder.get(def);
  if (!list) {
    const talk = def.talk || [];
    const offer = (t) => !!t.dialogue && JSON.stringify(t.if || '').includes('"status":"available"');
    const step = (t) => !!t.dialogue && !offer(t) && JSON.stringify(t.if || '').includes('"stage"');
    const rest = talk.filter((t) => !offer(t));
    let at = -1;
    rest.forEach((t, i) => { if (step(t)) at = i; });
    list = at < 0 ? talk : [...rest.slice(0, at + 1), ...talk.filter(offer), ...rest.slice(at + 1)];
    _talkOrder.set(def, list);
  }
  return list;
}
