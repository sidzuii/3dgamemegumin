import { Game } from './core/Game.js';
import { hasSave, deleteSave } from './rpg/State.js';

const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('play-btn');
const newBtn = document.getElementById('new-btn');
const pct = document.getElementById('load-pct');
const bar = document.getElementById('load-bar');
const sub = document.getElementById('overlay-sub');
const note = document.getElementById('overlay-note');

const game = new Game(document.getElementById('app'));
window.__game = game; // handy for debugging from the console

game
  .init((p, msg) => {
    const v = Math.round(p * 100);
    if (msg) sub.innerHTML = `${msg} <span id="load-pct">${v}%</span>`;
    else (document.getElementById('load-pct') || pct).textContent = v + '%';
    bar.style.width = v + '%';
  })
  .then(() => {
    bar.style.width = '100%';
    if (game.editorMode) {
      overlay.classList.add('hidden');
      game.startEditor();
      return;
    }
    const saved = hasSave();
    sub.textContent = saved ? 'Мир готов. Продолжить путь?' : 'Мир готов. Аксель ждёт новую искательницу приключений.';
    playBtn.textContent = saved ? 'Продолжить' : 'Начать путь';
    playBtn.disabled = false;
    newBtn.disabled = false;
    newBtn.style.display = saved ? '' : 'none';
    playBtn.focus();
  })
  .catch((err) => {
    console.error(err);
    sub.textContent = 'Ошибка загрузки: ' + err.message;
  });

// Map editor entry (dev server only: saving needs its endpoint).
if (import.meta.env.DEV && !game.editorMode) {
  const ed = document.createElement('button');
  ed.className = 'play-btn secondary';
  ed.textContent = 'Редактор карты';
  ed.addEventListener('click', () => { location.search = '?editor'; });
  newBtn.parentElement?.appendChild(ed);
}

let started = false;
function begin(newGame) {
  if (playBtn.disabled) return;
  overlay.classList.add('hidden');
  game.input.requestLock();
  if (!started) {
    started = true;
    game.start(newGame);
  }
}
playBtn.addEventListener('click', () => {
  if (started) return begin(false);
  begin(!hasSave());
});
newBtn.addEventListener('click', () => {
  if (started) return begin(false);
  if (hasSave() && !window.confirm('Начать новую игру? Текущее сохранение будет удалено.')) return;
  deleteSave();
  note.textContent = '';
  begin(true);
});

// Show the overlay again when the pointer lock is released with Esc (game keeps running).
document.addEventListener('pointerlockchange', () => {
  if (!started) return;
  const locked = document.pointerLockElement === game.renderer.domElement;
  if (locked) overlay.classList.add('hidden');
});
