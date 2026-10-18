// Every change a player makes to the town is a command: a small plain object
// such as { t: 'place', type: 'house', x: 10, z: 12 }. In single-player and on
// a multiplayer host, game.cmd() applies it at once; a guest sends it to the
// host, which checks it with the same World rules as its own actions and
// applies it for everyone (see src/net/). Commands carry only what a player
// chose, never rule-bending options, and each one is checked before it runs.

import { BUILDINGS, TECHS, TRANSIT } from './defs.js';
import { STYLES } from './render/buildings.js';

const SPEEDS = [0, 1, 2, 4, 8, 16, 32];
const LOOKS = new Set(STYLES.map(s => s.id));
const SANDBOX = ['infiniteMoney', 'unlockAll', 'freeUpgrades', 'instantBuild'];

const int = (v, lo = -1e9, hi = 1e9) => Number.isInteger(v) && v >= lo && v <= hi;
const opt = (v, lo, hi) => v == null || int(v, lo, hi);
const tile = (w, c) => int(c.x, 0, w.N - 1) && int(c.z, 0, w.N - 1);
const tiles = (w, list, max = 4096) => Array.isArray(list) && list.length > 0 && list.length <= max
  && list.every(p => Array.isArray(p) && p.length === 2 && int(p[0], 0, w.N - 1) && int(p[1], 0, w.N - 1));
const ok = (v, reason) => (v ? { ok: true } : { ok: false, reason });

// t → { check(world, cmd), run(game, cmd), host: only the host may do it }
export const COMMANDS = {
  place: {
    check: (w, c) => !!BUILDINGS[c.type] && !BUILDINGS[c.type].hidden && int(c.x) && int(c.z) && opt(c.variant, 0, 2 ** 31) && opt(c.accessIndex, 0, 1e6),
    run: (g, c) => g.world.placeBuilding(c.type, c.x, c.z, { variant: c.variant ?? undefined, accessIndex: c.accessIndex ?? 0 }),
  },
  roads: {
    check: (w, c) => int(c.level, 1, 3) && tiles(w, c.tiles),
    run: (g, c) => g.world.placeRoads(c.tiles, c.level),
  },
  rails: {
    check: (w, c) => tiles(w, c.tiles),
    run: (g, c) => g.world.placeRails(c.tiles),
  },
  unroad: {
    check: tile,
    run: (g, c) => { const r = g.world.removeRoad(c.x, c.z); return r === true ? { ok: true } : { ok: false, reason: r || 'Cannot remove' }; },
  },
  unrail: {
    check: tile,
    run: (g, c) => ok(g.world.removeRail(c.x, c.z), 'No track there'),
  },
  // demolish whatever stands on each tile (buildings, track, road, trees)
  bulldoze: {
    check: (w, c) => tiles(w, c.tiles, w.N * w.N),
    run: (g, c) => {
      let n = 0, reason = null;
      for (const [x, z] of c.tiles) { const r = g.world.bulldoze(x, z); if (r.ok) n++; else reason ||= r.reason || null; }
      return { ok: n > 0, n, reason };
    },
  },
  terraform: {
    check: (w, c) => tile(w, c) && ['raise', 'lower', 'flatten'].includes(c.mode),
    run: (g, c) => g.world.terraform(c.x, c.z, c.mode),
  },
  plant: {
    check: tile,
    run: (g, c) => g.world.plantTree(c.x, c.z),
  },
  upgrade: {
    check: (w, c) => int(c.id) && (c.to == null || !!BUILDINGS[c.to]) && (c.look === undefined || c.look === null || LOOKS.has(c.look)),
    run: (g, c) => g.world.upgradeBuilding(c.id, c.to || null, c.look),
  },
  expand: {
    check: (w, c) => int(c.id) && int(c.dir, 0, 12) && ['land', 'strip', 'takeover', 'estate'].includes(c.kind),
    run: (g, c) => g.world.expandBuilding(c.id, c.dir, c.kind),
  },
  merge: {
    check: (w, c) => int(c.a) && int(c.b) && c.a !== c.b,
    run: (g, c) => g.world.mergeBuildings(c.a, c.b),
  },
  move: {
    check: (w, c) => int(c.id) && int(c.x) && int(c.z) && opt(c.accessIndex, 0, 1e6),
    run: (g, c) => g.world.moveBuilding(c.id, c.x, c.z, { accessIndex: c.accessIndex ?? 0 }),
  },
  demolish: {
    check: (w, c) => int(c.id),
    run: (g, c) => g.world.demolishBuilding(c.id),
  },
  research: {
    check: (w, c) => typeof c.id === 'string' && !!TECHS[c.id],
    run: (g, c) => ok(g.world.startResearch(c.id), "That project can't be started yet"),
  },
  tax: {
    check: (w, c) => int(c.rate, 0, 20),
    run: (g, c) => { g.world.taxRate = c.rate; g.sim.recompute(); return { ok: true }; },
  },
  rename: {
    check: (w, c) => typeof c.name === 'string' && c.name.trim().length > 0 && c.name.trim().length <= 40,
    run: (g, c) => { g.world.townName = c.name.trim(); return { ok: true }; },
  },
  line: {
    check: (w, c) => !!TRANSIT[c.mode] && Array.isArray(c.stops) && c.stops.length <= 64 && c.stops.every(s => int(s)),
    run: (g, c) => g.transit.createLine(c.mode, c.stops),
  },
  unline: {
    check: (w, c) => int(c.id),
    run: (g, c) => { const had = g.world.lines.some(l => l.id === c.id); g.transit.deleteLine(c.id); return ok(had, 'That line is gone'); },
  },
  vehicles: {
    check: (w, c) => int(c.id) && int(c.n, 0, 10),
    run: (g, c) => g.transit.setVehicles(c.id, c.n),
  },
  speed: {
    check: (w, c) => SPEEDS.includes(c.s),
    run: (g, c) => { g.applySpeed(c.s); return { ok: true }; },
  },
  // the sandbox switches belong to whoever's town it is
  sandbox: {
    host: true,
    check: (w, c) => !!c.opts && typeof c.opts === 'object' && Object.keys(c.opts).every(k => SANDBOX.includes(k) && typeof c.opts[k] === 'boolean'),
    run: (g, c) => { g.world.setSandbox(c.opts); g.sim.recompute(); return { ok: true }; },
  },
};

// Check and apply one command. `from` is the remote player who sent it
// (null for the local player). Returns the World's own result object.
export function runCommand(game, cmd, from = null) {
  const def = cmd && typeof cmd === 'object' ? COMMANDS[cmd.t] : null;
  if (!def) return { ok: false, reason: 'Unknown action' };
  if (!game.world || game.demo) return { ok: false, reason: 'No town is open' };
  if (from && def.host) return { ok: false, reason: 'Only the host can change that' };
  let valid = false;
  try { valid = def.check(game.world, cmd); } catch { valid = false; }
  if (!valid) return { ok: false, reason: "That action isn't valid" };
  const r = def.run(game, cmd) || { ok: false };
  game.emit?.('command', { cmd, r, from });
  return r;
}

// Results travel back to a guest as plain data: building and line objects
// become ids (the guest looks them up in its own copy of the town, which has
// already been updated by the time the result arrives).
const PLAIN = ['ok', 'reason', 'instant', 'kind', 'placed', 'spent', 'failed', 'cost', 'what', 'n'];
export function packResult(r) {
  if (!r || typeof r !== 'object') return { ok: !!r };
  const out = {};
  for (const k of PLAIN) if (r[k] !== undefined && (typeof r[k] !== 'object' || r[k] === null)) out[k] = r[k];
  if (out.ok === undefined && r.placed === undefined) out.ok = false;
  if (r.building) out.building = r.building.id;
  if (r.old) out.old = r.old.id;
  if (r.line) out.line = { id: r.line.id, name: r.line.name, mode: r.line.mode };
  return out;
}

export function unpackResult(r, world) {
  const out = { ...r };
  if (r.building != null) out.building = world.buildings.get(r.building) || null;
  if (r.old != null) out.old = world.buildings.get(r.old) || null;
  return out;
}

// A few actions are worth telling the other players about.
export function describeCommand(cmd, r, world) {
  if (!r || r.ok === false) return null;
  switch (cmd.t) {
    case 'speed': return cmd.s === 0 ? 'paused the game' : `set the speed to ${cmd.s}×`;
    case 'research': return TECHS[cmd.id] ? `started researching ${TECHS[cmd.id].name}` : null;
    case 'tax': return `set taxes to ${cmd.rate}%`;
    case 'rename': return `renamed the town ${world.townName}`;
    case 'line': return r.line ? `opened ${r.line.name}` : null;
    case 'unline': return 'closed a transit line';
    case 'sandbox': return 'changed the sandbox switches';
    default: return null;
  }
}
