import { portraitSVG } from './portrait.js';

/**
 * Conversation box: portrait, speaker, typewriter text, numbered choices.
 * Keys: 1–6 pick a choice, E / Space / Enter continue (or finish the typewriter), Esc leaves.
 */
export class DialogueUI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = { root: $('dialogue'), portrait: $('dlg-portrait'), name: $('dlg-name'), title: $('dlg-title'), text: $('dlg-text'), choices: $('dlg-choices') };
    this.open = false;
    this.full = '';
    this.shown = 0;
    this.view = null;
    this.el.root.addEventListener('click', (e) => {
      if (e.target.closest('.dlg-choice')) return;
      this._advance();
    });
  }

  get runner() {
    return this.game.rpg.dialogue;
  }

  show(view) {
    this.view = view;
    if (!this.open) {
      this.open = true;
      this.el.root.classList.add('show');
      document.exitPointerLock?.();
    }
    this.el.root.className = 'dialogue show ' + view.who;
    this.el.name.textContent = view.name;
    this.el.title.textContent = view.title ? '· ' + view.title : '';
    if (view.portrait) {
      this.el.portrait.classList.remove('none');
      this.el.portrait.innerHTML = portraitSVG(view.portrait);
    } else this.el.portrait.classList.add('none');
    this.full = view.text || '';
    this.shown = 0;
    this.el.text.textContent = '';
    this.el.choices.innerHTML = '';
    this._choicesShown = false;
  }

  _renderChoices() {
    this._choicesShown = true;
    const c = this.el.choices;
    c.innerHTML = '';
    const v = this.view;
    if (v.choices.length) {
      v.choices.forEach((ch, k) => {
        const b = document.createElement('button');
        b.className = 'dlg-choice';
        b.innerHTML = `<kbd>${k + 1}</kbd><span></span>`;
        b.lastChild.textContent = ch.text;
        b.addEventListener('click', () => this.runner.choose(ch.i));
        c.appendChild(b);
      });
    } else {
      const n = document.createElement('div');
      n.className = 'dlg-next';
      n.innerHTML = '<kbd>E</kbd> далее';
      c.appendChild(n);
    }
  }

  _advance() {
    if (!this.open) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.el.text.textContent = this.full;
      this._renderChoices();
      return;
    }
    if (!this.view.choices.length) this.runner.choose(-1);
  }

  hide() {
    this.open = false;
    this.el.root.classList.remove('show');
    // The conversation may have opened a shop or a menu: only re-capture the mouse if not.
    setTimeout(() => { if (!this.game.uiBlocking) this.game.input.requestLock(); }, 0);
  }

  /** Called every frame while open (game paused). */
  update(dt, input) {
    if (!this.open) return;
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + dt * 75);
      this.el.text.textContent = this.full.slice(0, Math.floor(this.shown));
      if (this.shown >= this.full.length) this._renderChoices();
    }
    if (input.wasPressed('KeyE') || input.wasPressed('Space') || input.wasPressed('Enter')) this._advance();
    if (this._choicesShown && this.view.choices.length) {
      for (let k = 0; k < Math.min(6, this.view.choices.length); k++) {
        if (input.wasPressed('Digit' + (k + 1))) {
          this.runner.choose(this.view.choices[k].i);
          return;
        }
      }
    }
    if (input.wasPressed('Escape')) this.runner.end();
  }
}
