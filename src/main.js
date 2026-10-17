import { Game } from './game.js';

function fail(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:99;font:600 16px Nunito,sans-serif;color:#3d2f25;background:#fbf6ea;padding:24px;text-align:center';
  d.textContent = msg;
  document.body.appendChild(d);
}

try {
  const game = new Game();
  window.hearthvale = game;
  game.startDemo();
  game.showTitle();
} catch (e) {
  console.error(e);
  fail('Hearthvale could not start: ' + (e && e.message ? e.message : e) + ' — it needs a browser with WebGL.');
}
