import { DIALOGUES } from '../data/dialogues.js';
import { check } from './State.js';

/**
 * Dialogue runner. A dialogue is a graph of nodes (data/dialogues.js):
 *
 *   { start: 'a', nodes: { a: { who, text, choices: [{ text, next, if, do }], next, do, if } } }
 *
 * `who`: 'npc' (default, the speaker), 'megumin', 'narrator' or an npc id. `text` may be a
 * function (rpg) => string for lines that depend on state. Nodes / choices with an `if` that
 * fails are skipped / hidden. `do` effects run when the node is shown (node.do) or the choice
 * is picked (choice.do). `next: 'end'` (or no next) closes the conversation.
 */
export class DialogueRunner {
  constructor(rpg) {
    this.rpg = rpg;
    this.current = null; // { def, nodeId, npc }
  }

  get active() {
    return !!this.current;
  }

  start(id, npc) {
    const def = DIALOGUES[id];
    if (!def) {
      console.warn('No dialogue', id);
      return false;
    }
    this.current = { id, def, npc, nodeId: null, seen: new Set() };
    this._go(def.start || 'start');
    return true;
  }

  _go(nodeId) {
    const c = this.current;
    if (!c) return;
    if (!nodeId || nodeId === 'end') return this.end();
    const node = c.def.nodes[nodeId];
    if (!node) {
      console.warn('Missing node', c.id, nodeId);
      return this.end();
    }
    if (node.if && !check(this.rpg, node.if)) return this._go(node.else || node.next);
    // Silent nodes (story programs, data/story/dsl.js): a branch on a condition, a jump to another
    // scene, or effects that run between two lines without being shown.
    if (node.branch) return this._go(check(this.rpg, node.branch) ? node.then : node.else);
    if (node.jump) {
      const npc = c.npc;
      this.current = null;
      return this.start(node.jump, npc);
    }
    c.nodeId = nodeId;
    c.seen.add(nodeId);
    if (node.do) this.rpg.apply(node.do, c.npc);
    // An effect may have closed the dialogue (e.g. opening a shop).
    if (!this.current) return;
    if (node.silent) return this._go(node.next);
    this.rpg.ui.dialogue.show(this.view());
  }

  view() {
    const c = this.current;
    const node = c.def.nodes[c.nodeId];
    const who = node.who || 'npc';
    const speaker = who === 'npc' ? c.npc?.def : who === 'megumin' || who === 'narrator' ? null : this.rpg.npcs.def(who);
    const text = typeof node.text === 'function' ? node.text(this.rpg) : node.text;
    const choices = (node.choices || [])
      .map((ch, i) => ({ ...ch, i }))
      .filter((ch) => !ch.if || check(this.rpg, ch.if))
      .map((ch) => ({ text: typeof ch.text === 'function' ? ch.text(this.rpg) : ch.text, i: ch.i, tag: ch.tag }));
    return {
      who,
      name: who === 'megumin' ? 'Мегумин' : who === 'narrator' ? '' : speaker?.name || '',
      title: who === 'megumin' ? 'Архимаг' : who === 'narrator' ? '' : speaker?.title || '',
      portrait: who === 'megumin' ? 'megumin' : who === 'narrator' ? null : speaker?.portrait || speaker?.look,
      text,
      choices,
    };
  }

  /** Continue (no choices) or pick choice index (original index in the node). */
  choose(i) {
    const c = this.current;
    if (!c) return;
    const node = c.def.nodes[c.nodeId];
    if (node.choices?.length) {
      const ch = node.choices[i];
      if (!ch || (ch.if && !check(this.rpg, ch.if))) return;
      if (ch.do) this.rpg.apply(ch.do, c.npc);
      if (!this.current) return;
      this._go(ch.next);
    } else {
      this._go(node.next);
    }
  }

  end() {
    const c = this.current;
    this.current = null;
    this.rpg.ui.dialogue.hide();
    if (c?.npc) c.npc.endTalk?.();
    this.rpg.game.endTalk?.();
    this.rpg.events.emit('dialogueEnd', { id: c?.id, npc: c?.npc?.id });
  }
}
