// Peer-to-peer links between browsers, set up through PeerJS and its free
// public signalling server (0.peerjs.com). The host registers a peer id made
// from a short invite code; a guest connects to that id. Game data then flows
// directly between the two browsers over a WebRTC data channel, or through
// PeerJS's public TURN relay when no direct route can be found. The signalling
// server only introduces the peers. PeerJS is loaded from jsDelivr (pinned,
// with a checksum) the first time someone hosts or joins.

const PEERJS_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const PEERJS_SRI = 'sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu';
const PREFIX = 'hearthvale-';   // the game's old name: an internal id only, kept so the peer ids don't change
// no 0/O, 1/I/L: easy to read out and type
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const OPEN_TIMEOUT = 15000, CONNECT_TIMEOUT = 25000;

let lib = null;
export function loadPeerJS() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  return (lib ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_SRC;
    s.integrity = PEERJS_SRI;
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload = () => {
      const P = globalThis.Peer || globalThis.peerjs?.Peer;
      if (P) resolve(P); else { lib = null; reject(new Error('The multiplayer library loaded but did not start.')); }
    };
    s.onerror = () => { lib = null; s.remove(); reject(new Error("Couldn't load the multiplayer library from cdn.jsdelivr.net. Check your internet connection and try again.")); };
    document.head.appendChild(s);
  }));
}

export function newCode() {
  const a = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(a);
  let s = '';
  for (const v of a) s += ALPHABET[v % ALPHABET.length];
  return s;
}

// What the player typed → a code, or null. Dashes, spaces and case don't matter.
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === CODE_LENGTH && [...c].every(ch => ALPHABET.includes(ch)) ? c : null;
}

export const formatCode = (c) => `${c.slice(0, 3)}-${c.slice(3)}`;

function friendly(e) {
  switch (e && e.type) {
    case 'timeout': return "Couldn't reach the PeerJS signalling server (0.peerjs.com). Check your internet connection and try again.";
    case 'browser-incompatible': return "This browser can't make peer-to-peer (WebRTC) connections.";
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed': case 'disconnected':
      return "Couldn't reach the PeerJS signalling server (0.peerjs.com). Check your internet connection and try again.";
    case 'ssl-unavailable': return 'The signalling server needs a secure connection.';
    case 'webrtc': case 'negotiation-failed': return "Couldn't open a direct connection between the two computers. A strict firewall may be in the way.";
    default: return (e && e.message) || 'The connection failed.';
  }
}

function whenOpen(peer) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject({ type: 'timeout' }), OPEN_TIMEOUT);
    peer.once('open', (id) => { clearTimeout(t); resolve(id); });
    peer.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

// A PeerJS data connection as a raw string channel (see session.js makeLink).
function channel(conn, peer = null) {
  const closers = [];
  let closed = false;
  const fire = () => { if (closed) return; closed = true; for (const f of closers) f(); };
  conn.on('close', fire);
  conn.on('error', (e) => { if (!e || e.type !== 'message-too-big') fire(); });
  const pc = conn.peerConnection;
  pc?.addEventListener?.('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') fire(); });
  return {
    send: (s) => { if (conn.open) conn.send(s); },
    onData: (fn) => conn.on('data', fn),
    onClose: (fn) => closers.push(fn),
    close: () => {
      fire();
      try { conn.close(); } catch {}
      if (peer) setTimeout(() => { try { peer.destroy(); } catch {} }, 200);
    },
  };
}

// Host: claim a fresh invite code and hand every guest that connects to onLink.
// onTrouble(message) reports problems that don't end the session.
export async function listen({ onLink, onTrouble = null }) {
  const Peer = await loadPeerJS();
  for (let tries = 0; ; tries++) {
    const code = newCode();
    const peer = new Peer(PREFIX + code, { debug: 0 });
    try { await whenOpen(peer); } catch (e) {
      try { peer.destroy(); } catch {}
      if (e && e.type === 'unavailable-id' && tries < 4) continue;
      throw new Error(friendly(e));
    }
    peer.on('connection', (conn) => conn.on('open', () => onLink(channel(conn))));
    // already-connected guests carry on without the signalling server; new ones need it back
    peer.on('disconnected', () => {
      if (peer.destroyed) return;
      onTrouble?.('Lost touch with the PeerJS server. Players already here can keep playing; reconnecting so others can join…');
      setTimeout(() => { try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch {} }, 2000);
    });
    peer.on('error', (e) => { if (e && e.type !== 'peer-unavailable') console.warn('Multiplayer:', e.type, e.message); });
    return { code, close: () => { try { peer.destroy(); } catch {} } };
  }
}

// Guest: connect to the town with this invite code.
export async function connect(code) {
  const Peer = await loadPeerJS();
  const peer = new Peer({ debug: 0 });
  try { await whenOpen(peer); } catch (e) { try { peer.destroy(); } catch {} throw new Error(friendly(e)); }
  const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try { peer.destroy(); } catch {}
      reject(new Error(msg));
    };
    const t = setTimeout(() => fail(`Couldn't connect to the town ${formatCode(code)}. The host's network may block direct connections; try again in a moment.`), CONNECT_TIMEOUT);
    peer.on('error', (e) => fail(e && e.type === 'peer-unavailable'
      ? `No town is open with the code ${formatCode(code)}. Check the code, and that the host still has Kinstead open.`
      : friendly(e)));
    conn.on('error', (e) => fail(friendly(e)));
    conn.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve({ channel: channel(conn, peer), close: () => { try { peer.destroy(); } catch {} } });
    });
  });
}
