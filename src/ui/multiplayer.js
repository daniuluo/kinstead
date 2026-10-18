// The Multiplayer window: host the town you are playing and share its invite
// code, or join a friend's town with theirs. The players box in the top bar
// shows who is connected. How the town is kept in step is in src/net/.

import { listen, connect, cleanCode, formatCode } from '../net/peer.js';
import { HostSession, GuestSession, makeLink, MAX_PLAYERS } from '../net/session.js';
import { serialize, downloadJSON, saveFileName, LocalSaves } from '../save/saves.js';

const NAME_KEY = 'hearthvale.mp.name';
const TITLE = 'Multiplayer';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let attempt = null;      // { kind: 'host' | 'join', text } while connecting
let status = null;       // { text, bad } shown under the buttons
let codeDraft = '';

function loadName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
function storeName(n) { try { localStorage.setItem(NAME_KEY, n); } catch {} }
const nameOf = () => loadName().trim() || `Builder ${100 + ((Math.random() * 900) | 0)}`;
const isOpen = (game) => !!(game.ui.windows && game.ui.windows.has(TITLE));
const refresh = (game) => { if (isOpen(game)) showMultiplayer(game); };

function inviteLink(code) { return `${location.origin}${location.pathname}?join=${code}`; }

async function copy(game, text, what) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch {}
    t.remove();
  }
  game.ui.toast(`${what} copied`, 'good', '📋');
}

function playersHTML(net) {
  return `<div class="mp-players">${net.players.map(p => `<div class="mp-player"><i style="background:${esc(p.color)}"></i><b>${esc(p.name)}</b>`
    + `<span>${[p.host ? 'host' : '', p.id === net.me?.id ? 'you' : ''].filter(Boolean).join(' · ')}</span></div>`).join('')}</div>`;
}

export function showMultiplayer(game, { code = null } = {}) {
  const ui = game.ui, net = game.net;
  if (code != null) codeDraft = code;
  const inTown = !!(game.world && !game.demo);
  let h = `<h2>${TITLE}</h2>`;
  if (net && net.isHost) {
    h += `<p class="lead">You're hosting <b>${esc(game.world.townName)}</b>. Send this code to the people you'd like to build with:</p>
      <div class="mp-code">${formatCode(net.code)}</div>
      <div class="actions"><button class="btn primary" id="mpCopy">📋 Copy code</button><button class="btn" id="mpLink">🔗 Copy invite link</button></div>
      <h5>Players · ${net.players.length} of ${MAX_PLAYERS}</h5>${playersHTML(net)}
      <div class="note">Your computer runs the town for everyone, so keep this tab open. Everything the others do comes to you and is checked against the same rules as your own building.</div>
      <div class="actions"><button class="btn danger" id="mpStop">Stop hosting</button></div>`;
  } else if (net && net.isGuest) {
    const host = net.host;
    h += `<p class="lead">You're in ${host ? `<b>${esc(host.name)}</b>'s` : 'a shared'} town, <b>${esc(game.world.townName)}</b>. Everything you do goes to the host, whose computer runs the town.</p>
      <h5>Players · ${net.players.length}</h5>${playersHTML(net)}
      <div class="actions"><button class="btn" id="mpSave">💾 Save a copy here</button><button class="btn danger" id="mpLeave">Leave the town</button></div>`;
  } else {
    h += `<p class="lead">Build a town together, live. One player hosts: their computer runs the town, and the others join with its invite code.</p>
      <div class="field"><label>Your name</label><input id="mpName" maxlength="24" placeholder="Builder" value="${esc(loadName())}"></div>
      <div class="grid2 mp-cols">
        <div><h5>Host</h5>${inTown
          ? `<p class="mp-p">Open <b>${esc(game.world.townName)}</b> to other players and get a code to send them.</p><button class="btn primary" id="mpHost" ${attempt ? 'disabled' : ''}>🏡 Host this town</button>`
          : `<p class="mp-p">Start a village or continue your latest save, then share its code.</p><button class="btn primary" id="mpHostNew" ${attempt ? 'disabled' : ''}>🏡 New village and host</button>${LocalSaves.list().length ? `<button class="btn" id="mpHostLast" ${attempt ? 'disabled' : ''}>Continue and host</button>` : ''}`}</div>
        <div><h5>Join</h5><p class="mp-p">Enter the code from the host.${inTown ? ' Your own town is saved first.' : ''}</p>
          <div class="inline"><input id="mpCode" class="mp-code-in" maxlength="9" placeholder="ABC-DEF" value="${esc(codeDraft)}" autocomplete="off" spellcheck="false"><button class="btn primary" id="mpJoin" ${attempt ? 'disabled' : ''}>Join</button></div></div>
      </div>`;
    if (attempt) h += `<div class="mp-status"><span class="ms spin">progress_activity</span>${esc(attempt.text)}${attempt.loading ? '' : ' <button class="btn small" id="mpCancel">Cancel</button>'}</div>`;
    else if (status) h += `<div class="mp-status ${status.bad ? 'bad' : ''}">${esc(status.text)}</div>`;
    h += `<div class="note">Players find each other through the free PeerJS server; the town itself then travels directly between your browsers. When the host leaves, everyone else can keep a copy of the town.</div>`;
  }
  ui.openModal(h, (c) => {
    c.classList.add('mp-win');
    const $ = (id) => c.querySelector('#' + id);
    const name = $('mpName');
    if (name) name.oninput = () => storeName(name.value.trim());
    const code = $('mpCode');
    if (code) {
      code.oninput = () => { codeDraft = code.value; };
      code.onkeydown = (e) => { if (e.key === 'Enter') $('mpJoin')?.click(); };
      if (!attempt && !net) code.focus();
    }
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('mpHost', () => startHosting(game));
    on('mpHostNew', () => ui.showNewGame((o) => { game.newGame(o); startHosting(game); }));
    on('mpHostLast', () => {
      const latest = [...LocalSaves.list()].sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1))[0];
      if (!latest) return;
      try { game.loadData(LocalSaves.load(latest.id)); startHosting(game); } catch (e) { ui.toast(e.message, 'bad'); }
    });
    on('mpJoin', () => startJoining(game, codeDraft));
    on('mpCancel', () => { attempt = null; status = null; refresh(game); });
    on('mpCopy', () => copy(game, formatCode(net.code), 'Invite code'));
    on('mpLink', () => copy(game, inviteLink(net.code), 'Invite link'));
    on('mpStop', () => {
      const b = $('mpStop');
      if (!b.dataset.confirm && net.players.length > 1) { b.dataset.confirm = '1'; b.textContent = 'Stop? Everyone else is disconnected'; return; }
      game.endNet();
      ui.toast('Stopped hosting. The town is yours alone again.', 'info', '🏡');
      refresh(game);
    });
    on('mpSave', () => { if (game.saveLocal('s' + Date.now().toString(36))) ui.toast(`Saved a copy of ${game.world.townName} in this browser`, 'good', '💾'); });
    on('mpLeave', () => {
      const s = game.net;
      if (!s) return;
      game.net = null;
      s.close();
      showNetEnded(game, 'left');
    });
  });
}

async function startHosting(game) {
  if (attempt || game.net || !game.world || game.demo) return;
  const ui = game.ui, w = game.world, me = { kind: 'host', text: 'Connecting to the PeerJS server…' };
  attempt = me; status = null;
  showMultiplayer(game);
  const session = new HostSession(game, { name: nameOf() });
  try {
    const t = await listen({ onLink: (raw) => session.addLink(makeLink(raw)), onTrouble: (msg) => ui.toast(msg, 'bad') });
    if (attempt !== me || game.world !== w || game.demo || game.net) { t.close(); session.close(); return; }
    session.code = t.code;
    session.transport = t;
    session.onChange = () => { renderNetBox(game); refresh(game); };
    game.net = session;
    attempt = null;
    ui.toast(`Hosting ${w.townName}: invite code ${formatCode(t.code)}`, 'good', '🏡');
    game.sfx('upgrade');
  } catch (e) {
    session.close();
    if (attempt === me) { attempt = null; status = { text: e.message, bad: true }; }
  }
  renderNetBox(game);
  refresh(game);
}

async function startJoining(game, input) {
  if (attempt || game.net) return;
  const code = cleanCode(input);
  if (!code) {
    status = { text: "That isn't an invite code. Codes are six letters and numbers, like K7Q-M2P (there's no O, 0, I, 1 or L).", bad: true };
    refresh(game);
    return;
  }
  const ui = game.ui, me = { kind: 'join', text: `Looking for the town ${formatCode(code)}…` };
  attempt = me; status = null;
  refresh(game);
  let t = null;
  try {
    t = await connect(code);
    if (attempt !== me) { t.channel.close(); return; }
    me.text = 'Connected. Loading the town…';
    me.loading = true;
    refresh(game);
    const session = new GuestSession(game, makeLink(t.channel), {
      name: nameOf(), transport: t,
      onEnd: (why) => showNetEnded(game, why),
      onChange: () => { renderNetBox(game); refresh(game); },
    });
    await session.join();
    attempt = null;
    const host = session.host;
    ui.toast(`Welcome to ${game.world.townName}${host ? `, ${host.name}'s town` : ''}!`, 'big', '👪');
    game.sfx('upgrade');
  } catch (e) {
    if (t) t.channel.close();
    if (attempt === me) { attempt = null; status = { text: e.message, bad: true }; }
  }
  renderNetBox(game);
  refresh(game);
}

// The host closed the town, the connection dropped, or we left: keep a copy?
export function showNetEnded(game, why) {
  const ui = game.ui, town = game.world ? game.world.townName : 'the town';
  if (game.net && game.net.closed) game.net = null;
  game.cursors.clear();
  game.applySpeed(0);
  renderNetBox(game);
  const win = ui.windows && ui.windows.get(TITLE);
  if (win) ui.closeWindow(win);
  const head = why === 'ended' ? 'Town closed' : why === 'left' ? 'You left the town' : 'Connection lost';
  const msg = why === 'ended' ? `The host has closed <b>${esc(town)}</b>.` : why === 'left' ? `You left <b>${esc(town)}</b>.` : `The connection to the host of <b>${esc(town)}</b> was lost.`;
  ui.openModal(`<h2>${head}</h2><p class="lead">${msg} The town as it was is still here on your screen. Would you like to keep it as your own copy?</p>
    <div class="actions col">
      <button class="btn primary" id="neKeep">🏡 Keep playing it on my own</button>
      <button class="btn" id="neSave">💾 Save a copy in this browser</button>
      <button class="btn" id="neDl">⬇ Download a copy (.json)</button>
      <button class="btn" id="neTitle">Back to the title screen</button>
    </div>`, (c) => {
    c.querySelector('#neKeep').onclick = () => {
      const data = serialize(game.world);
      ui.closeModal();
      game.loadData(data);
      ui.toast(`${town} is yours now: it carries on here on its own.`, 'good', '🏡');
    };
    c.querySelector('#neSave').onclick = (e) => { if (game.saveLocal('s' + Date.now().toString(36), true)) { e.target.textContent = '✓ Saved in this browser'; e.target.disabled = true; } };
    c.querySelector('#neDl').onclick = () => downloadJSON(serialize(game.world), saveFileName(game.world));
    c.querySelector('#neTitle').onclick = () => { ui.closeModal(); game.toTitle(); };
  }, true);
}

// The players box in the top bar.
export function renderNetBox(game) {
  const el = document.getElementById('netBox');
  if (!el) return;
  const n = game.net;
  if (!n || !n.players || (n.isGuest && !n.me)) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const dots = n.players.map(p => `<i style="background:${esc(p.color)}" title="${esc(p.name)}${p.host ? ' (host)' : ''}">${esc((p.name[0] || '?').toUpperCase())}</i>`).join('');
  el.innerHTML = `<span class="ms">${n.isHost ? 'podcasts' : 'group'}</span><span class="mp-dots">${dots}</span>${n.isHost && n.code ? `<b>${formatCode(n.code)}</b>` : ''}`;
  el.title = `${n.isHost ? `Hosting · code ${formatCode(n.code)}` : 'In a shared town'} · ${n.players.map(p => p.name).join(', ')} (M)`;
}
