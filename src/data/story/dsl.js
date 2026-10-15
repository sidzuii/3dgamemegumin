import { CLIPS } from './clips.js';

/**
 * Story scenes of the scenario package (docs/story) as dialogue graphs.
 *
 * A scene is a PROGRAM over recording ids (clips.js): spoken lines are never copied, only referenced
 * (`$.L(7, 9)` = lines 7..9 of the scene's clip prefix), so text and ids stay exactly those of the
 * package. The compiler turns a program into the dialogue format of rpg/Dialogue.js:
 *
 *   $.L(a, b?)             spoken lines a..b (node id = clip id; speaker from the clip)
 *   $.CH(id, [options])    answers shown after the previous line; options = $.O(clipNo, program, { if, do })
 *   $.IF(cond, then, else) silent branch (conditions: rpg/State.js `check`, incl. { var: [name, op, value] })
 *   $.DO(effects)          silent effects (quest steps, rewards, variables...)
 *   $.MENU(id, options, exit) like CH, but every answer returns to the menu (answered ones disappear) until an
 *                          `exit` ($.O, or $.X(label, program) for a button that is not a line of the package; one or a
 *                          list, each with its own { if }) is picked
 *   $.N(text)              narrator line that is not part of the package (game glue)
 *   $.T(who, text)         line of an npc id that is not part of the package (game glue, not voiced)
 *   $.JUMP(sceneId)        end this scene and start another one with the same NPC
 *   $.END                  close the conversation
 *
 * `S(id, build, { prefix, entries })` registers `id` (and `id:name` for every extra entry point: a clip
 * number to start from). The picked answer is also spoken by Megumin as the first node of the option
 * (clip = the option's id), so the future voice-over plays it there.
 */

/** Speaker (role name in the package) -> npc id used by the dialogue UI. */
export const VOICE = {
  МЕГУМИН: 'megumin', МАРТА: 'marta', БЕРНАРД: 'bernard', ЛИНА: 'lina', ГАРРЕТ: 'garret', ЛУНА: 'luna', ВИСС: 'wiss', БРАН: 'bran',
  МИЯ: 'mia', БОРИС: 'boris', ТОБИАС: 'tobias', ФЕНРИК: 'fenrik', КЛАРА: 'clara', РАНН: 'rann', ЭДМУНД: 'edmund', ИВО: 'ivo',
  САЙРУС: 'caravan_trader', РОКСИ: 'roxy', ВЕЙР: 'veyr', ХАРЗ: 'kharz', АГАТА: 'agata', ДАН: 'dan', ОСА: 'osa', ТЕРА: 'tera',
  ВОЗЧИК: 'carter', ДЕТИ: 'kids',
};

const pad3 = (n) => String(n).padStart(3, '0');

class Compiler {
  constructor(sceneId, prefix) {
    this.sceneId = sceneId;
    this.prefix = prefix;
    this.nodes = {};
    this.n = 0; // generated ids
  }

  clip(no, prefix = this.prefix) {
    const id = `${prefix}_${pad3(no)}`;
    const c = CLIPS[id];
    if (!c) throw new Error(`story ${this.sceneId}: no clip ${id}`);
    return [id, c];
  }

  put(id, node) {
    let key = id;
    for (let k = 2; this.nodes[key]; k++) key = `${id}#${k}`;
    this.nodes[key] = node;
    return key;
  }

  gen(kind) {
    return `${this.sceneId}.${kind}${++this.n}`;
  }

  /** Compile a program; `next` = node id the program continues with ('end' closes). Returns the start. */
  seq(items, next) {
    let tail = next; // string id | { host: choices }
    for (let i = items.length - 1; i >= 0; i--) tail = this.item(items[i], tail);
    return tail;
  }

  item(it, next) {
    switch (it.t) {
      case 'L': {
        let tail = next;
        for (let k = it.ids.length - 1; k >= 0; k--) {
          const [id, c] = this.clip(it.ids[k], it.prefix);
          const node = { clip: id, who: VOICE[c[0]] ?? 'narrator', text: c[1] };
          if (tail && typeof tail === 'object') node.choices = tail.host;
          else node.next = tail;
          if (k === it.ids.length - 1 && it.opts?.do) node.do = it.opts.do;
          tail = this.put(id, node);
        }
        return tail;
      }
      case 'N': {
        const node = { who: 'narrator', text: it.text };
        if (next && typeof next === 'object') node.choices = next.host; else node.next = next;
        return this.put(this.gen('n'), node);
      }
      case 'T': {
        const node = { who: it.who, text: it.text };
        if (next && typeof next === 'object') node.choices = next.host; else node.next = next;
        return this.put(this.gen('t'), node);
      }
      case 'MENU': {
        const cont = this.resolve(next);
        const choices = [];
        const host = { host: choices };
        for (const o of it.options) {
          const [oid, oc] = this.clip(o.no);
          const body = this.seq(o.prog, host);
          const say = this.put(oid, { clip: oid, who: 'megumin', text: oc[1], next: this.resolve(body), do: o.opts?.do });
          choices.push({ text: oc[1], clip: oid, next: say, if: o.opts?.if ? [{ not: { seen: oid } }, o.opts.if] : { not: { seen: oid } } });
        }
        for (const x of [].concat(it.exit)) {
          if (x.label) {
            // Not a line of the package: the player simply ends the questions.
            choices.push({ text: x.label, next: this.resolve(this.seq(x.prog, cont)), if: x.opts?.if });
          } else {
            const [xid, xc] = this.clip(x.no);
            const out = this.put(xid, { clip: xid, who: 'megumin', text: xc[1], next: this.resolve(this.seq(x.prog, cont)), do: x.opts?.do });
            choices.push({ text: xc[1], clip: xid, next: out, if: x.opts?.if });
          }
        }
        return host;
      }
      case 'DO': {
        const node = { silent: true, do: it.fx, next: this.resolve(next) };
        return this.put(this.gen('do'), node);
      }
      case 'JUMP': return this.put(this.gen('jump'), { silent: true, jump: it.to });
      case 'END': return 'end';
      case 'IF': {
        const cont = this.resolve(next);
        const node = { silent: true, branch: it.cond, then: this.seq(it.then, cont), else: it.else ? this.seq(it.else, cont) : cont };
        return this.put(this.gen('if'), node);
      }
      case 'CH': {
        const cont = this.resolve(next);
        const choices = it.options.map((o) => {
          const [oid, oc] = this.clip(o.no);
          // The picked answer is spoken by Megumin first, then the program of the option runs.
          const body = this.seq(o.prog, cont);
          const say = this.put(oid, { clip: oid, who: 'megumin', text: oc[1], next: body, do: o.opts?.do });
          return { text: oc[1], clip: oid, next: say, if: o.opts?.if };
        });
        return { host: choices };
      }
      default: throw new Error('story: bad item ' + JSON.stringify(it));
    }
  }

  /** A pending choice that follows no line gets its own host node (narrator, no text). */
  resolve(next) {
    if (next && typeof next === 'object') return this.put(this.gen('h'), { who: 'narrator', text: '…', choices: next.host });
    return next;
  }
}

const L = (a, b = a) => ({ t: 'L', ids: Array.from({ length: b - a + 1 }, (_, i) => a + i) });
/** Lines of ANOTHER scene of the package (prefix 'A11', clip numbers a..b) inside this program. */
const LX = (prefix, a, b = a) => ({ t: 'L', prefix, ids: Array.from({ length: b - a + 1 }, (_, i) => a + i) });
const helpers = {
  L,
  LX,
  CH: (id, options) => ({ t: 'CH', id, options }),
  O: (no, prog = [], opts) => ({ no, prog, opts }),
  MENU: (id, options, exit) => ({ t: 'MENU', id, options, exit }),
  /** Menu exit that is not a spoken answer of the package: a button label and the program that follows. */
  X: (label, prog = []) => ({ label, prog }),
  T: (who, text) => ({ t: 'T', who, text }),
  IF: (cond, then, otherwise) => ({ t: 'IF', cond, then, else: otherwise }),
  DO: (fx) => ({ t: 'DO', fx }),
  N: (text) => ({ t: 'N', text }),
  JUMP: (to) => ({ t: 'JUMP', to }),
  END: { t: 'END' },
};

/** Registers one scene (and its entry points); returns { [id]: dialogue } to spread into a chapter table. */
export function S(id, build, { prefix = id, entries = {} } = {}) {
  const c = new Compiler(id, prefix);
  const prog = build(helpers);
  let start = c.seq(prog, 'end');
  if (start && typeof start === 'object') start = c.resolve(start);
  const out = { [id]: { start, nodes: c.nodes, scene: prefix } };
  for (const [name, no] of Object.entries(entries)) out[`${id}:${name}`] = { start: `${prefix}_${pad3(no)}`, nodes: c.nodes, scene: prefix };
  return out;
}

/** Lines of one scene as plain text (barks): clip numbers -> "who: text" records. */
export function lines(prefix, ...nos) {
  return nos.map((no) => {
    const c = CLIPS[`${prefix}_${pad3(no)}`];
    return { who: VOICE[c[0]], text: c[1], clip: `${prefix}_${pad3(no)}` };
  });
}
