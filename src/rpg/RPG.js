import * as THREE from 'three';
import { EventBus, freshState, loadSave, writeSave, check, MAP_REV } from './State.js';
import { Clock } from './Clock.js';
import { QuestManager } from './Quests.js';
import { DialogueRunner } from './Dialogue.js';
import { Economy } from './Economy.js';
import { Guild } from './Guild.js';
import { WorldEvents } from './WorldEvents.js';
import { Gathering } from './Gathering.js';
import { REGIONS, REGION, HALF, ROADS } from '../world/MapData.js';
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
    this.ui = null; // set by Game (dialogue, shop, menu, notify)
    this.events.on('custom', (e) => this.quests._count('custom', (o) => o.name === e.name, e.n ?? 1));
    // Audio feedback for story progress and loot (the player's own pickups, not shop restock).
    this.events.on('questStart', () => this.game.audio?.play('questStart'));
    this.events.on('questStage', () => this.game.audio?.play('questStage'));
    this.events.on('questDone', () => this.game.audio?.play('questDone'));
    this.events.on('item', () => this.game.audio?.play('pickup'));
    for (const ev of ['questStart', 'questDone', 'questStage']) this.events.on(ev, () => { this._syncProps(); this.npcs?.refresh(); });
    // Roxy's condition: no Explosion inside the Astrarium while she works.
    this.events.on('explosion', (e) => {
      const A = REGION.astrarium;
      if (this.quests.status('roxy_trust') === 'active' && Math.hypot(e.pos.x - A.center.x, e.pos.z - A.center.z) < A.r + 10 && !this.state.flags.roxy_angry) {
        this.setFlag('roxy_angry');
        this.notify('event', 'Рокси: «Я же просила — БЕЗ ВЗРЫВОВ!» Похоже, придётся извиняться.');
      }
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
    this.gathering.syncFromState();
    this.npcs?.refresh();
    this._resumeEscort();
    this.loaded = { migrated, corrupted, fresh: newGame || !this.state.player };
    if (migrated) this.notify('info', 'Сохранение со старой карты перенесено: эрисы и предметы на месте, история начинается заново.');
    if (corrupted) this.notify('info', 'Сохранение повреждено — начата новая игра.');
    this.markDirty(true);
    return this.loaded;
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
    for (const id of Object.keys(S.quests)) if (!this.quests.def(id)) delete S.quests[id];
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
      g.inventory.deserialize({ eris: 40, items: [{ id: 'bread', count: 2 }, { id: 'book_explosion', count: 1 }], equipment: {} });
    }
    const P = S.player;
    const pl = g.player;
    if (P && this._relocate) {
      // Old map: start again at the caravan yard (prologue) or on the Fountain square.
      const s = this.spot(this.quests.status('prologue_arrival') === 'done' ? 'square' : 'caravan_arrival');
      P.x = s.pos.x; P.y = s.pos.y; P.z = s.pos.z; P.yaw = s.yaw;
      this._relocate = false;
      this.notify('info', 'Аксель отстроен заново: вы снова на улицах города. Задания и вещи сохранены.');
    }
    if (P) {
      pl.level = P.level || 1;
      pl.xp = P.xp || 0;
      pl.applyStats();
      pl.hp = Math.min(pl.maxHp, P.hp ?? pl.maxHp);
      pl.mana = Math.min(pl.maxMana, P.mana ?? pl.maxMana);
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
      pl.hp = pl.maxHp;
      pl.mana = pl.maxMana;
      const s = this.spot('caravan_arrival');
      pl.controller.teleport(s.pos.clone(), s.yaw);
      pl.setCheckpoint(s.pos.clone(), s.yaw);
      g.cameraRig.snapBehind(s.yaw + Math.PI);
      this.quests.start('prologue_arrival', true);
    }
    for (const id of S.discovered) g.discovered.add(id);
    this._syncProps();
    if (g.world.rubble) {
      g.world.rubble.setCleared(!!S.flags.rubble_cleared);
      g.world.rubble.onCleared = () => {
        this.setFlag('rubble_cleared');
        this.notify('event', 'Завал разлетелся в пыль! Путь вглубь шахты открыт.');
      };
    }
  }

  /** Story props: hide taken shards, etc. */
  _syncProps() {
    const F = this.state.flags;
    for (const it of this.game.world.interactables) {
      if (!it.setActive) continue;
      if (it.id === 'glade_shard') it.setActive(!F.glade_shard_taken);
      if (it.id === 'deep_shard') it.setActive(!F.deep_shard_taken);
      if (it.id?.startsWith('rift_crystal_')) it.setActive(!F[it.id] && this.quests.status('roxy_trust') === 'active');
      if (it.id === 'cave_in') it.setActive(!F.rubble_cleared);
      if (it.id === 'cat_ugolek') it.setActive(this.quests.status('c_lost_cat') === 'active' && !F.cat_found);
      if (it.id === 'cat_home') it.setActive(!!F.cat_returned);
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
      pl.heal(pl.maxHp);
      pl.restoreMana(pl.maxMana);
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
      case 'promote': this.guild.promote(); break;
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
      case 'heal': this.game.player.heal(9999); this.game.player.restoreMana(9999); this.game.player.restoreStamina(100); break;
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
      if (d.giver === npc.id && d.category === 'story' && this.quests.canStart(id)) this.quests.start(id);
    }
    for (const t of def.talk || []) {
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
        if (!F.glade_shard_taken) {
          this.setFlag('glade_shard_taken');
          this.inventory.add('star_shard', 1);
          this.apply({ read: text });
        }
        break;
      case 'deep_shard':
        if (!F.deep_shard_taken) {
          this.setFlag('deep_shard_taken');
          this.setFlag('dungeon_cleared');
          this.inventory.add('star_shard', 1);
          this.apply({ read: text });
        }
        break;
      case 'cave_in':
        this.game.hud.toast(F.rubble_cleared ? 'Проход расчищен.' : 'Огромный завал. Руками не разобрать… Но если отойти подальше и как следует ВЗОРВАТЬ…', 5);
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
        if (id.startsWith('rift_crystal_')) {
          if (!F[id]) {
            this.setFlag(id);
            this.inventory.add('resonance_crystal', 1);
            this.game.vfx.burst('magicPop', prop.root.getWorldPosition(new THREE.Vector3()), 30);
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

  /** After a load: an escort that was under way goes on from where it was saved. */
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
      this._bark(n, cower ? ['Помогите! Грибы!'] : ['Фух… Идём дальше.']);
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
    pl.heal(9999);
    pl.restoreMana(9999);
    pl.restoreStamina(100);
    this.game.hud.fade?.(1.2);
    this.notify('info', `Вы хорошо выспались. ${this.clock.label()}`);
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
    const cell = (HALF * 2) / EXPLORE_N;
    const i = Math.floor((x + HALF) / cell), j = Math.floor((z + HALF) / cell);
    return i >= 0 && j >= 0 && i < EXPLORE_N && j < EXPLORE_N && !!this.explored[j * EXPLORE_N + i];
  }

  // ---------------------------------------------------------------------------------------
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
      this.gathering.update();
      // Schedules change on the hour.
      const hour = Math.floor(this.clock.hour);
      if (hour !== this._hour) {
        this._hour = hour;
        this.npcs?.refresh();
      }
    }
    this.worldEvents.update(dt);
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
    S.player = { x: pos.x, y: pos.y, z: pos.z, yaw: pl.controller.yaw, hp: Math.max(1, pl.hp), mana: pl.mana, level: pl.level, xp: pl.xp, character: pl.character };
    S.inventory = g.inventory.serialize();
    S.discovered = [...g.discovered];
    let bin = '';
    for (let i = 0; i < this.explored.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= (this.explored[i + k] || 0) << k;
      bin += String.fromCharCode(b);
    }
    S.explored = btoa(bin);
    const e = this.escort;
    S.escort = e ? { def: e.def, ambushed: e.ambushed, x: e.npc.position.x, z: e.npc.position.z } : null;
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
