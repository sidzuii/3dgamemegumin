import { RANKS, RANK_POINTS, check } from './State.js';

/**
 * Adventurers' Guild: membership, rank points from contracts, promotions (each rank also
 * needs a story milestone, checked when talking to Luna), contract history.
 */
const PROMOTION = {
  E: { flag: 'guild_tested' },
  D: { flag: 'dungeon_cleared' },
  C: { flag: 'roxy_companion' },
  B: { flag: 'never' },
  A: { flag: 'never' },
};

export const RANK_TITLES = { F: 'F — новичок', E: 'E — младший искатель', D: 'D — искатель', C: 'C — опытный искатель', B: 'B — ветеран', A: 'A — герой' };

export class Guild {
  constructor(rpg) {
    this.rpg = rpg;
  }

  get g() {
    return this.rpg.state.guild;
  }

  get member() { return this.g.member; }
  get rank() { return this.g.rank; }
  get points() { return this.g.points; }

  join() {
    this.g.member = true;
    this.g.rank = 'F';
    this.rpg.setFlag('guild_member');
    this.rpg.notify('guild', 'Вы вступили в Гильдию искателей приключений! Ранг F.');
  }

  addPoints(n) {
    this.g.points += n;
    this.rpg.notify('guild', `Очки гильдии +${n} (всего ${this.g.points})`);
    this.rpg.events.emit('custom', { name: 'contract_points' });
  }

  nextRank() {
    const i = RANKS.indexOf(this.g.rank);
    return RANKS[i + 1] || null;
  }

  /** Can Luna promote the player right now? */
  canPromote() {
    const next = this.nextRank();
    if (!next || !this.g.member) return false;
    return this.g.points >= RANK_POINTS[next] && check(this.rpg, PROMOTION[next]);
  }

  promotionHint() {
    const next = this.nextRank();
    if (!next) return 'Выше ранга не бывает.';
    const need = RANK_POINTS[next] - this.g.points;
    const req = PROMOTION[next];
    const parts = [];
    if (need > 0) parts.push(`ещё ${need} очк. гильдии`);
    if (!check(this.rpg, req)) parts.push(req.flag === 'guild_tested' ? 'пройти практическое испытание' : req.flag === 'dungeon_cleared' ? 'проявить себя в настоящем подземелье' : 'особое поручение');
    return parts.length ? `До ранга ${next}: ${parts.join(', ')}.` : `Можно получить ранг ${next}!`;
  }

  /** A story promotion (docs/story: C11, C30): straight to `rank` regardless of points. */
  promoteTo(rank) {
    if (RANKS.indexOf(rank) <= RANKS.indexOf(this.g.rank)) return false;
    this.g.rank = rank;
    this.g.points = Math.max(this.g.points, RANK_POINTS[rank] || 0);
    this.rpg.notify('rank', `Ранг гильдии повышен: ${RANK_TITLES[rank]}!`);
    this.rpg.events.emit('rank', { rank });
    this.rpg.markDirty(true);
    return true;
  }

  promote() {
    if (!this.canPromote()) return false;
    this.g.rank = this.nextRank();
    this.rpg.notify('rank', `Ранг гильдии повышен: ${RANK_TITLES[this.g.rank]}!`);
    this.rpg.events.emit('rank', { rank: this.g.rank });
    this.rpg.markDirty(true);
    return true;
  }
}
