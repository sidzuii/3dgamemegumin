import * as THREE from 'three';
import { check } from './State.js';

/**
 * World events: small happenings with start conditions, a lifetime and reward guards.
 * At most MAX_ACTIVE run at once; none of them blocks a road or a story step.
 *
 *  caravan_trader   every other day 9:00–17:00 a merchant's wagon stands on the east road
 *                   (after the road to Olkhovka is known). Trade only, no rewards to farm.
 *  injured_traveler once per save: a wounded traveller on the west road asks for a potion.
 *  mushroom_raid    at night (every 2+ days) mushrooms raid Boris's fields; clearing them
 *                   pays once per raid; at dawn the survivors wander off.
 */
const MAX_ACTIVE = 2;

export class WorldEvents {
  constructor(rpg) {
    this.rpg = rpg;
    this.timer = 0;
    this.raid = null; // { enemies: [], day }
    this._buildWagon();
    rpg.events.on('kill', (e) => this._onKill(e));
  }

  get S() {
    return this.rpg.state.events;
  }

  _ev(id) {
    return (this.S[id] = this.S[id] || {});
  }

  active() {
    return ['event_caravan', 'event_traveler', 'event_raid'].filter((f) => this.rpg.state.flags[f]).length;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    const rpg = this.rpg;
    const h = rpg.clock.hour, day = rpg.clock.day;
    const pp = rpg.game.player.position;
    let changed = false;

    // --- caravan trader ---
    const caravanOn = check(rpg, { flag: 'olkhovka_route' }) && day % 2 === 0 && h >= 9 && h < 17;
    if (caravanOn !== !!rpg.state.flags.event_caravan && (!caravanOn || this.active() < MAX_ACTIVE)) {
      rpg.setFlag('event_caravan', caravanOn);
      this.wagon.visible = caravanOn;
      changed = true;
    }
    if (caravanOn) {
      const e = this._ev('caravan_trader');
      const spot = rpg.spotPos('caravan_trader');
      if (e.toldDay !== day && spot && pp.distanceTo(spot) < 70) {
        e.toldDay = day;
        rpg.notify('event', 'На восточной дороге остановилась повозка странствующего торговца.');
      }
    }

    // --- injured traveller ---
    const tr = this._ev('injured_traveler');
    if (!tr.started && check(rpg, [{ member: true }, { day: 2 }]) && this.active() < MAX_ACTIVE) {
      tr.started = day;
      rpg.setFlag('event_traveler');
      changed = true;
    }
    if (tr.started && !tr.done && rpg.state.flags.event_traveler) {
      const spot = rpg.spotPos('injured_traveler');
      if (!tr.told && spot && pp.distanceTo(spot) < 45) {
        tr.told = true;
        rpg.notify('event', 'У обочины западной дороги кто-то сидит, держась за ногу…');
      }
      if (day - tr.started >= 2 && !rpg.state.flags.traveler_helped) {
        // He limped on to town by himself.
        tr.done = true;
        rpg.setFlag('event_traveler', false);
        changed = true;
      }
    }
    if (rpg.state.flags.traveler_helped && !tr.done) {
      tr.done = true;
      rpg.setFlag('event_traveler', false);
      changed = true;
    }

    // --- mushroom raid ---
    const raid = this._ev('mushroom_raid');
    const night = h >= 20 || h < 4;
    const farms = rpg.spotPos('field_0');
    if (!this.raid && night && farms && pp.distanceTo(farms) < 140 && this.active() < MAX_ACTIVE
      && check(rpg, { quest: 'c_mushroom_field', status: 'done' }) && (raid.lastDay === undefined || day - raid.lastDay >= 2)) {
      this._startRaid(day);
      changed = true;
    }
    if (this.raid && !night && h >= 6 && h < 12) {
      // Dawn: the raiders that are left wander back to the river.
      for (const e of this.raid.enemies) if (e.alive) rpg.game.enemies.remove(e);
      rpg.notify('event', 'С рассветом грибы ушли с полей. Борис будет ворчать.');
      this.raid = null;
      rpg.setFlag('event_raid', false);
      changed = true;
    }
    if (changed) rpg.npcs?.refresh();
  }

  _startRaid(day) {
    const rpg = this.rpg;
    const raid = this._ev('mushroom_raid');
    raid.lastDay = day;
    const enemies = [];
    for (let i = 0; i < 4; i++) {
      const p = rpg.spotPos('raid_' + i);
      if (!p) continue;
      const e = rpg.game.enemies.spawn('mushroom', p, 'farm_raid');
      e.noRespawn = true;
      enemies.push(e);
    }
    this.raid = { enemies, day };
    rpg.setFlag('event_raid');
    rpg.notify('event', 'Тревога! Грибы напали на поля Бориса!');
  }

  _onKill(e) {
    if (!this.raid || e.camp !== 'farm_raid') return;
    if (this.raid.enemies.every((x) => !x.alive)) {
      const raid = this._ev('mushroom_raid');
      if (raid.rewardDay !== this.raid.day) {
        raid.rewardDay = this.raid.day;
        this.rpg.inventory.add('eris', 50);
        this.rpg.inventory.add('pumpkin_pie', 1);
        this.rpg.changeRel('boris', 5);
        this.rpg.notify('event', 'Поля спасены! Борис передал 50 эрис и тыквенный пирог.');
      }
      const list = this.raid.enemies;
      this.raid = null;
      this.rpg.setFlag('event_raid', false);
      setTimeout(() => list.forEach((x) => this.rpg.game.enemies.remove(x)), 6000);
    }
  }

  _buildWagon() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.85 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xd8b060, roughness: 0.95, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.6).translate(0, 0.95, 0), wood);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.2, 12, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 1.3, 0), cloth);
    g.add(body, cover);
    for (const sz of [-1.2, 1.2]) for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12).rotateZ(Math.PI / 2).translate(sx * 1.0, 0.55, sz), wood);
      g.add(w);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const spot = this.rpg.spotPos('caravan_trader_wagon');
    if (spot) {
      g.position.copy(spot);
      g.rotation.y = 1.2;
    }
    g.visible = false;
    this.wagon = g;
    this.rpg.game.scene.add(g);
  }
}
