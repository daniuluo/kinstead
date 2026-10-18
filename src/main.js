import { Game } from './game.js';

function fail(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:99;font:600 16px Nunito,sans-serif;color:#3d2f25;background:#fbf6ea;padding:24px;text-align:center';
  d.textContent = msg;
  document.body.appendChild(d);
}

try {
  const game = new Game();
  window.kinstead = window.hearthvale = game;   // a handle for the console (the old name still works)
  game.startDemo();
  game.showTitle();
  // an invite link (…?join=ABC-DEF) opens the Multiplayer window with the code filled in
  const join = new URLSearchParams(location.search).get('join');
  if (join) game.ui.showMultiplayer({ code: join });
} catch (e) {
  console.error(e);
  fail('Kinstead could not start: ' + (e && e.message ? e.message : e) + ' — it needs a browser with WebGL.');
}
