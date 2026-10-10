/**
 * Game clock: minutes since midnight + day counter, stored in the save.
 * 1 real second = RATE game minutes (a full day ≈ 20 real minutes).
 */
export const RATE = 1.2;

export class Clock {
  constructor(state) {
    this.state = state; // state.time = { day, minutes }
    this.paused = false;
  }

  get minutes() { return this.state.time.minutes; }
  get day() { return this.state.time.day; }
  get hour() { return this.state.time.minutes / 60; }
  /** Absolute game minutes (for respawn timers). */
  get total() { return (this.state.time.day - 1) * 1440 + this.state.time.minutes; }

  update(dt) {
    if (this.paused) return false;
    const t = this.state.time;
    t.minutes += dt * RATE;
    if (t.minutes >= 1440) {
      t.minutes -= 1440;
      t.day += 1;
      return true; // new day
    }
    return false;
  }

  /** Skip forward to the next occurrence of `hour` (sleeping). */
  advanceTo(hour) {
    const t = this.state.time;
    const target = hour * 60;
    if (t.minutes >= target) t.day += 1;
    t.minutes = target;
  }

  label() {
    const m = Math.floor(this.state.time.minutes);
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `День ${this.state.time.day}, ${hh}:${mm}`;
  }

  get partOfDay() {
    const h = this.hour;
    if (h < 5) return 'ночь';
    if (h < 11) return 'утро';
    if (h < 17) return 'день';
    if (h < 21) return 'вечер';
    return 'ночь';
  }
}
