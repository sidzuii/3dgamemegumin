import { Game } from './core/Game.js';
import { MainMenu } from './ui/MainMenu.js';

const game = new Game(document.getElementById('app'));
window.__game = game; // handy for debugging from the console
const menu = new MainMenu(game, document.getElementById('overlay'));
game.mainMenu = menu;

game
  .init((p, msg) => menu.progress(p, msg))
  .then(() => {
    if (game.editorMode) {
      document.getElementById('overlay').style.display = 'none';
      game.startEditor();
      return;
    }
    menu.ready();
  })
  .catch((err) => {
    console.error(err);
    menu.error(err.message);
  });
