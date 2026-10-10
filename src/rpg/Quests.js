import { QUESTS } from '../data/quests.js';
import { check } from './State.js';

/**
 * Quest engine. Quest definitions are data (data/quests.js):
 *
 *  { id, title, category: 'story'|'contract'|'side', chapter, giver, rank, requires,
 *    summary, stages: [{ id, text, target, objectives: [...], onStart, onDone, manual }],
 *    rewards: { eris, xp, items, rankPoints, rel, flags } }
 *
 * Objectives: talk (advanced by dialogue effects), collect {item,n}, kill {enemy|camp,n},
 * reach {region|spot,r}, interact {id}, gather {item,n}, craft {item,n}, buy {shop?},
 * escort {npc}, explosion {spot,r}, flag {flag}.
 * A stage whose objectives are all met advances automatically (unless `manual`: then a
 * dialogue must call { advance }). Rewards are granted exactly once when the last stage ends.
 */
export class QuestManager {
  constructor(rpg) {
    this.rpg = rpg;
    this.defs = QUESTS;
    this.tracked = null;
    const ev = rpg.events;
    ev.on('kill', (e) => this._count('kill', (o) => (o.enemy ? o.enemy === e.type : true) && (o.camp ? o.camp === e.camp : true)));
    ev.on('interact', (e) => this._count('interact', (o) => o.id === e.id));
    ev.on('gather', (e) => this._count('gather', (o) => o.item === e.item, e.n));
    ev.on('craft', (e) => this._count('craft', (o) => !o.item || o.item === e.item, e.n));
    ev.on('buy', (e) => this._count('buy', (o) => (!o.shop || o.shop === e.shop) && (!o.item || o.item === e.item)));
    ev.on('region', (e) => this._count('reach', (o) => o.region === e.id));
    ev.on('explosion', (e) => this._count('explosion', (o) => {
      const s = rpg.spotPos(o.spot);
      return s && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < (o.r ?? 12);
    }));
    ev.on('escort', (e) => this._count('escort', (o) => o.npc === e.npc));
    ev.on('item', () => this.evaluateAll());
    ev.on('flag', () => this.evaluateAll());
  }

  get state() {
    return this.rpg.state.quests;
  }

  def(id) {
    return this.defs[id];
  }

  status(id) {
    return this.state[id]?.status || 'none';
  }

  stageId(id) {
    const q = this.state[id];
    return q ? this.def(id).stages[q.stage]?.id : null;
  }

  stage(id) {
    const q = this.state[id];
    return q ? this.def(id).stages[q.stage] : null;
  }

  active() {
    return Object.keys(this.state).filter((id) => this.state[id].status === 'active' && this.def(id));
  }

  done() {
    return Object.keys(this.state).filter((id) => this.state[id].status === 'done' && this.def(id));
  }

  canStart(id) {
    const d = this.def(id);
    if (!d || this.state[id]) return false;
    if (d.rank && !check(this.rpg, { member: true, rank: d.rank })) return false;
    return check(this.rpg, d.requires);
  }

  start(id, silent = false) {
    const d = this.def(id);
    if (!d || this.state[id]) return false;
    this.state[id] = { status: 'active', stage: 0, progress: {}, day: this.rpg.clock.day };
    if (!this.tracked || d.category === 'story') this.tracked = id;
    this._enterStage(id);
    if (!silent) this.rpg.notify('quest', `Новое задание: ${d.title}`, d.category);
    this.rpg.markDirty(true);
    this.rpg.events.emit('questStart', { id });
    this.evaluate(id);
    return true;
  }

  _enterStage(id) {
    const st = this.stage(id);
    if (!st) return;
    const q = this.state[id];
    q.progress = {};
    if (st.onStart) this.rpg.apply(st.onStart);
    if (st.hint) setTimeout(() => this.rpg.notify('hint', st.hint), 1200);
    // Baselines for objectives that count from now on.
    st.objectives?.forEach((o, i) => {
      if (o.type === 'collect' || o.type === 'flag') return;
      q.progress[i] = 0;
    });
  }

  /** Complete the current stage (dialogues call this through { advance }). */
  advance(id) {
    const q = this.state[id];
    if (!q || q.status !== 'active') return;
    const d = this.def(id);
    const st = d.stages[q.stage];
    if (st?.onDone) this.rpg.apply(st.onDone);
    q.stage++;
    if (q.stage >= d.stages.length) {
      this.complete(id);
      return;
    }
    this._enterStage(id);
    this.rpg.notify('stage', d.stages[q.stage].text, d.category);
    this.rpg.markDirty(true);
    this.rpg.events.emit('questStage', { id, stage: d.stages[q.stage].id });
    this.evaluate(id);
  }

  complete(id) {
    const q = this.state[id];
    const d = this.def(id);
    if (!q || q.status === 'done') return;
    q.status = 'done';
    q.doneDay = this.rpg.clock.day;
    const r = d.rewards || {};
    const parts = [];
    if (r.eris) { this.rpg.inventory.add('eris', r.eris); parts.push(`${r.eris} эрис`); }
    for (const [item, n] of r.items || []) this.rpg.inventory.add(item, n);
    if (r.xp) { this.rpg.gainXp(r.xp); parts.push(`${r.xp} опыта`); }
    if (r.rankPoints) this.rpg.guild.addPoints(r.rankPoints);
    for (const [npc, delta] of r.rel || []) this.rpg.changeRel(npc, delta);
    for (const f of r.flags || []) this.rpg.setFlag(f);
    if (d.category === 'contract') {
      this.rpg.state.guild.completed.push(id);
      this.rpg.events.emit('custom', { name: 'contract_done' });
    }
    this.rpg.notify('complete', `Задание выполнено: ${d.title}${parts.length ? ' · ' + parts.join(', ') : ''}`, d.category);
    if (this.tracked === id) this.tracked = this.active().find((a) => this.def(a).category === 'story') || this.active()[0] || null;
    if (d.onComplete) this.rpg.apply(d.onComplete);
    this.rpg.markDirty(true);
    this.rpg.events.emit('questDone', { id });
    // Chained quests start immediately (story flow).
    if (d.next && this.canStart(d.next)) this.start(d.next);
  }

  _count(type, match, n = 1) {
    for (const id of this.active()) {
      const st = this.stage(id);
      const q = this.state[id];
      st?.objectives?.forEach((o, i) => {
        if (o.type !== type || !match(o)) return;
        q.progress[i] = (q.progress[i] || 0) + n;
      });
      this.evaluate(id);
    }
  }

  /** Is objective i of the current stage satisfied? */
  objectiveDone(id, i) {
    const st = this.stage(id);
    const o = st.objectives[i];
    const q = this.state[id];
    switch (o.type) {
      case 'collect': return this.rpg.inventory.count(o.item) >= (o.n ?? 1);
      case 'flag': return !!this.rpg.state.flags[o.flag];
      case 'talk': return false;
      default: return (q.progress[i] || 0) >= (o.n ?? 1);
    }
  }

  objectiveText(id, i) {
    const st = this.stage(id);
    const o = st.objectives[i];
    const q = this.state[id];
    const n = o.n ?? 1;
    const have = o.type === 'collect' ? Math.min(n, this.rpg.inventory.count(o.item)) : Math.min(n, q.progress[i] || 0);
    const label = o.label || '';
    return n > 1 ? `${label} ${have}/${n}` : label;
  }

  evaluate(id) {
    const q = this.state[id];
    if (!q || q.status !== 'active') return;
    const st = this.stage(id);
    if (!st || st.manual || !st.objectives?.length) return;
    if (st.objectives.some((o) => o.type === 'talk')) return;
    if (st.objectives.every((_, i) => this.objectiveDone(id, i))) this.advance(id);
  }

  evaluateAll() {
    for (const id of this.active()) this.evaluate(id);
  }

  /** Per-frame: 'reach' objectives with a spot/position. */
  update(playerPos) {
    for (const id of this.active()) {
      const st = this.stage(id);
      st?.objectives?.forEach((o, i) => {
        if (o.type !== 'reach' || !o.spot) return;
        const s = this.rpg.spotPos(o.spot);
        if (s && Math.hypot(playerPos.x - s.x, playerPos.z - s.z) < (o.r ?? 4) && Math.abs(playerPos.y - s.y) < 4) {
          const q = this.state[id];
          if (!(q.progress[i] >= 1)) {
            q.progress[i] = 1;
            this.evaluate(id);
          }
        }
      });
    }
  }

  /** Where the tracked quest points (world position) — for compass / map. */
  targetOf(id) {
    const st = this.stage(id);
    if (!st?.target) return null;
    return this.rpg.resolveTarget(st.target);
  }

  /** Marker over an NPC: '!' (has a quest to give), '?' (quest stage waits for them). */
  markerFor(npcId) {
    for (const id of this.active()) {
      const st = this.stage(id);
      if (st?.target === 'npc:' + npcId) return '?';
    }
    for (const [id, d] of Object.entries(this.defs)) {
      // Luna's contracts live on the board; other people offer theirs in person.
      if (d.giver === npcId && !(d.category === 'contract' && d.giver === 'luna') && this.canStart(id) && !d.hidden) return '!';
    }
    return null;
  }

  /** Contracts available on the guild board. */
  boardContracts() {
    return Object.values(this.defs).filter((d) => d.category === 'contract' && !this.state[d.id] && check(this.rpg, d.requires));
  }
}
