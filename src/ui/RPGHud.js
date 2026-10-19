import * as THREE from 'three';
import { XP_TABLE } from '../rpg/RPG.js';

/**
 * RPG HUD layer: tracked-quest panel, notification feed, NPC name tags with quest markers
 * ("!" new quest, "?" someone waits for you), quest target on the compass, clock, mana and
 * experience. DOM is only touched when a displayed value changes.
 */
const NOTE_TITLES = {
  quest: 'Новое задание', stage: 'Задание обновлено', complete: 'Выполнено', level: 'Новый уровень',
  rank: 'Гильдия', guild: 'Гильдия', event: 'Событие', loot: 'Находка', hint: 'Подсказка', info: '',
};
const _v = new THREE.Vector3();

export class RPGHud {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      tracker: $('tracker'), notify: $('notify'), clock: $('clock'), lvl: $('lvl'), xp: $('xp-fill'),
      mpFill: $('mp-fill'), mpTrail: $('mp-trail'), mpValue: $('mp-value'), worldUI: $('world-ui'),
      strip: $('compass-strip'),
    };
    this.cache = {};
    this.tags = [];
    for (let i = 0; i < 10; i++) {
      const el = document.createElement('div');
      el.className = 'npc-tag';
      el.innerHTML = '<span class="mk"></span><span class="nm"></span><span class="tt"></span>';
      this.el.worldUI.appendChild(el);
      this.tags.push({ el, mk: el.children[0], nm: el.children[1], tt: el.children[2], key: '' });
    }
    // Quest marker on the compass.
    this.qMark = document.createElement('span');
    this.qMark.className = 'quest';
    this.qMark.textContent = '◆';
    this.el.strip.appendChild(this.qMark);
    this.mpTrail = 1;
  }

  notify(kind, text) {
    const n = document.createElement('div');
    n.className = 'note k-' + kind;
    const t = NOTE_TITLES[kind];
    n.innerHTML = t ? '<b></b><span></span>' : '<span></span>';
    if (t) n.firstChild.textContent = t;
    n.lastChild.textContent = text;
    this.el.notify.prepend(n);
    const life = kind === 'hint' ? 9000 : kind === 'stage' || kind === 'quest' ? 6500 : 5000;
    setTimeout(() => n.classList.add('out'), life);
    setTimeout(() => n.remove(), life + 700);
    while (this.el.notify.children.length > 5) this.el.notify.lastChild.remove();
  }

  _set(key, fn, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  update(dt) {
    const g = this.game, rpg = g.rpg, p = g.player;
    // Clock, level, xp, mana.
    this._set('clock', (v) => (this.el.clock.textContent = v), `${rpg.clock.label()} · ${rpg.clock.partOfDay}`);
    this._set('lvl', (v) => (this.el.lvl.textContent = v), `Ур. ${p.level}`);
    this._set('xp', (v) => (this.el.xp.style.transform = `scaleX(${v})`), (p.xp / XP_TABLE(p.level)).toFixed(3));
    const mp = p.mana / p.maxMana;
    this.mpTrail = mp > this.mpTrail ? mp : this.mpTrail + (mp - this.mpTrail) * (1 - Math.exp(-3 * dt));
    this._set('mp', (v) => (this.el.mpFill.style.transform = `scaleX(${v})`), mp.toFixed(3));
    this._set('mpT', (v) => (this.el.mpTrail.style.transform = `scaleX(${v})`), this.mpTrail.toFixed(3));
    this._set('mpV', (v) => (this.el.mpValue.textContent = v), String(Math.floor(p.mana)));

    // Tracker.
    const Q = rpg.quests;
    const id = Q.tracked && Q.state[Q.tracked]?.status === 'active' ? Q.tracked : (Q.tracked = Q.active()[0] || null);
    let html = '';
    let target = null;
    if (id) {
      const d = Q.def(id), st = Q.stage(id);
      target = Q.targetOf(id);
      const objs = (st.objectives || []).map((o, i) => {
        if (o.type === 'talk' && !o.label) return '';
        const ok = Q.objectiveDone(id, i);
        return `<div class="t-obj${ok ? ' done' : ''}">${Q.objectiveText(id, i)}</div>`;
      }).join('');
      let dist = '';
      if (target && (!g.inDungeon || g.inHouse)) {
        const m = Math.round(Math.hypot(target.x - p.position.x, target.z - p.position.z));
        dist = m > 6 ? `<div class="t-dist">${m} м</div>` : '';
      }
      html = `<div class="t-title">${esc(d.title)} <small>${d.category === 'story' ? 'сюжет' : d.category === 'contract' ? 'заказ' : 'поручение'}</small></div><div class="t-stage">${esc(st.text)}</div>${objs}${dist}`;
    }
    this._set('tracker', (v) => (this.el.tracker.innerHTML = v), html);

    // Quest marker on the compass.
    const cam = g.cameraRig;
    if (target && (!g.inDungeon || g.inHouse)) {
      const heading = Math.atan2(-Math.sin(cam.yawS), Math.cos(cam.yawS));
      const b = Math.atan2(target.x - p.position.x, -(target.z - p.position.z));
      let rel = Math.atan2(Math.sin(b - heading), Math.cos(b - heading));
      const fov = Math.PI * 0.75;
      const vis = Math.abs(rel) < fov / 2;
      const width = this.el.strip.clientWidth || 400;
      this.qMark.style.display = 'block';
      rel = Math.max(-fov / 2 + 0.02, Math.min(fov / 2 - 0.02, rel));
      this.qMark.style.left = ((rel / fov + 0.5) * width).toFixed(1) + 'px';
      this.qMark.style.opacity = vis ? '1' : '0.5';
    } else this.qMark.style.display = 'none';

    // NPC name tags + quest markers.
    const cands = [];
    for (const n of rpg.npcs.list) {
      if (!n.visible || !n.root.visible) continue;
      const d = n.position.distanceTo(p.position);
      const mk = Q.markerFor(n.id);
      if (d < (mk ? 40 : 9)) cands.push([d, n, mk]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.tags.length; i++) {
      const T = this.tags[i];
      const c = cands[i];
      if (!c) {
        if (T.key) { T.el.style.display = 'none'; T.key = ''; }
        continue;
      }
      const [d, n, mk] = c;
      n.head(_v).setY(_v.y + 0.15);
      _v.project(g.camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { T.el.style.display = 'none'; T.key = ''; continue; }
      const sx = (_v.x * 0.5 + 0.5) * window.innerWidth, sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
      const showName = d < 9;
      const key = `${n.id}|${mk}|${showName}`;
      if (T.key !== key) {
        T.key = key;
        T.mk.textContent = mk || '';
        T.mk.className = 'mk' + (mk === '?' ? ' turnin' : '');
        T.nm.textContent = showName ? n.def.name : '';
        T.tt.textContent = showName ? n.def.title : '';
        T.el.style.display = 'block';
      }
      const s = Math.max(0.6, Math.min(1, 10 / Math.max(d, 1)));
      T.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
    }
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
