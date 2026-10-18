// World state and the rules for changing it (placing, upgrading, bulldozing).
// Rendering and simulation listen to the events emitted here.

import { CONFIG, ROAD_LEVELS, BRIDGE_MULT, TREE_COST, CLEAR_COST, TERRAFORM_COST } from '../config.js';
import { BUILDINGS, unlockOf, RAIL_COST, workNeeded, TECHS, STYLE_TECH } from '../defs.js';
const STYLE_TECH_OF = (look) => STYLE_TECH[look] || null;
import { generateTerrain } from './terrain.js';
import { RNG, hash2, makeNoise2D, fbm } from '../util/rng.js';

// rot index → direction the building faces (its door side)
export const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// Footprint in tiles along world x / z (merged buildings can be 2×1).
export const fw = (b) => b.w ?? b.size;
export const fd = (b) => b.d ?? b.size;

// A building does its job unless it is a fresh building site or being taken
// down. Upgrades and merges carry on behind the scaffolding.
//   b.con = { kind: 'build' | 'upgrade' | 'merge' | 'dismantle', work, done, ... }
export const isOpen = (b) => !b.con || b.con.kind === 'upgrade' || b.con.kind === 'merge';

// A building that has grown onto a neighbouring plot (see World.expandOptions)
// holds half as many people / jobs again.
export const isExpanded = (b) => !BUILDINGS[b.type].merged && fw(b) * fd(b) > BUILDINGS[b.type].size ** 2;
export function capOf(b, key) {
  const v = BUILDINGS[b.type].levels[b.level][key] || 0;
  return isExpanded(b) ? Math.round(v * 1.5) : v;
}

// Neighbouring buildings that can be joined into one mixed-use building.
const MERGE_SHOPS = ['market', 'bakery', 'tavern'];
const MERGE_COST = [150, 300, 500];
function mergeResult(a, o) {
  const home = (x) => x.type === 'house';
  const shop = (x) => MERGE_SHOPS.includes(x.type) && x.level <= 2;
  let type, base, flavor = null;
  if (home(a) && home(o)) { type = 'terrace'; base = a; }
  else if (home(a) && shop(o)) { type = 'shophouse'; base = a; flavor = o.type; }
  else if (shop(a) && home(o)) { type = 'shophouse'; base = o; flavor = a.type; }
  else return null;
  const level = Math.min(Math.max(a.level, o.level), BUILDINGS[type].levels.length - 1);
  return { type, base, flavor, level, cost: MERGE_COST[level], name: BUILDINGS[type].levels[level].name };
}

// How far a building may come forward into the street in front of it (in
// tiles). Roads are narrower than their tiles, so this is verge, not roadway;
// two buildings facing each other across a street still stay well apart.
export const FRONT = 0.16;

export const TREE = { PINE: 0, ROUND: 1, BIRCH: 2, BUSH: 3, ROCK: 4, PEBBLE: 5 };

export class World {
  constructor(N, seed, terrain) {
    this.N = N;
    this.seed = seed;
    this.terrain = terrain;
    this.roads = new Uint8Array(N * N);
    this.rails = new Uint8Array(N * N);
    this.lines = [];
    this.sandbox = { infiniteMoney: false, unlockAll: false, freeUpgrades: false, instantBuild: false };
    this.buildingAt = new Int32Array(N * N).fill(-1);
    this.connected = new Uint8Array(N * N);
    this.treeCount = new Uint8Array(N * N);
    this.buildings = new Map();
    this.residents = new Map();
    this.trees = [];
    this.money = CONFIG.START_MONEY;
    this.taxRate = 10;
    this.day = 1;
    this.hours = 7;
    this.nextId = 1;
    this.entry = { x: 0, z: 0 };
    this.townName = 'Hearthvale';
    this.history = [];
    this.titleIdx = 0;
    this.stats = { visits: 0, visitIncome: 0, todayVisitIncome: 0, arrivals: 0, departures: 0 };
    this.research = { done: [], current: null, progress: 0, bank: 0 };
    this._listeners = {};
  }

  // ------------------------------------------------------------- events
  on(evt, fn) { (this._listeners[evt] ||= []).push(fn); }
  emit(evt, data) { for (const fn of this._listeners[evt] || []) fn(data); }

  // ------------------------------------------------------------- basics
  idx(x, z) { return z * this.N + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N; }
  roadAt(x, z) { return this.inBounds(x, z) ? this.roads[z * this.N + x] : 0; }
  railAt(x, z) { return this.inBounds(x, z) ? this.rails[z * this.N + x] : 0; }
  buildingOn(x, z) {
    if (!this.inBounds(x, z)) return null;
    const id = this.buildingAt[z * this.N + x];
    return id >= 0 ? this.buildings.get(id) : null;
  }
  get population() { return this.residents.size; }
  // population used for unlocks (sandbox can unlock everything)
  get unlockPop() { return this.sandbox.unlockAll ? Infinity : this.residents.size; }
  setSandbox(opts) {
    Object.assign(this.sandbox, opts);
    if (this.sandbox.infiniteMoney) this.money = Infinity;
    else if (!Number.isFinite(this.money)) this.money = 100000;
  }

  newId() { return this.nextId++; }

  // ------------------------------------------------------------ research
  hasTech(id) { return !id || this.sandbox.unlockAll || this.research.done.includes(id); }
  techName(id) { return TECHS[id] ? TECHS[id].name : id; }
  canResearch(id) {
    const t = TECHS[id];
    return !!t && !this.research.done.includes(id) && t.needs.every(n => this.research.done.includes(n));
  }
  startResearch(id) {
    if (!this.canResearch(id)) return false;
    const R = this.research;
    if (R.current && R.current !== id) R.bank += R.progress;
    R.current = id;
    R.progress = R.current === id ? R.progress : 0;
    // points banked while idle go straight in
    const use = Math.min(R.bank, TECHS[id].cost);
    R.progress += use; R.bank -= use;
    this._checkResearch();
    return true;
  }
  addResearch(points) {
    const R = this.research;
    if (!R.current) { R.bank += points; return; }
    R.progress += points;
    this._checkResearch();
  }
  _checkResearch() {
    const R = this.research;
    if (!R.current || R.progress < TECHS[R.current].cost) return;
    const id = R.current;
    R.bank += R.progress - TECHS[id].cost;
    R.done.push(id);
    R.current = null; R.progress = 0;
    this.emit('research:done', id);
  }

  // Walkable surface height (roads hover slightly, bridges float over water,
  // and the road ramps up or down to meet a bridge deck).
  walkHeight(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (this.inBounds(tx, tz) && this.roads[tz * this.N + tx]) {
      if (this.terrain.isWater(tx, tz)) return bridgeDeckY();
      const r = this.rampHeight(x, z);
      if (r != null) return r + 0.02;
    }
    return Math.max(this.terrain.heightAt(x, z) + 0.03, CONFIG.WATER_LEVEL - 0.05);
  }

  // Within RAMP of a bridge, a land road climbs (or drops) smoothly from the
  // bank to the deck. Surface height there, or null off any ramp.
  rampHeight(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!this.inBounds(tx, tz) || !this.roads[this.idx(tx, tz)] || this.terrain.isWater(tx, tz)) return null;
    const deck = bridgeDeckY();
    let best = null;
    for (const [dx, dz] of DIRS) {
      const nx = tx + dx, nz = tz + dz;
      if (!this.inBounds(nx, nz) || !this.roads[this.idx(nx, nz)] || !this.terrain.isWater(nx, nz)) continue;
      const d = dx > 0 ? tx + 1 - x : dx < 0 ? x - tx : dz > 0 ? tz + 1 - z : z - tz;
      if (d >= RAMP) continue;
      const fx = dx ? (dx > 0 ? tx + 1 - RAMP : tx + RAMP) : x, fz = dz ? (dz > 0 ? tz + 1 - RAMP : tz + RAMP) : z;
      const bank = this.terrain.heightAt(fx, fz) + 0.012;
      const k = Math.max(0, d) / RAMP, s = k * k * (3 - 2 * k);
      const y = deck + (bank - deck) * s;
      best = best == null ? y : Math.max(best, y);
    }
    return best;
  }

  // ------------------------------------------------------------ buildings
  findAccess(x, z, w, d = w) {
    const out = [];
    const push = (ax, az, rot) => {
      if (this.roadAt(ax, az)) out.push({ x: ax, z: az, rot, conn: this.connected[this.idx(ax, az)] });
    };
    for (let k = 0; k < w; k++) { push(x + k, z + d, 0); push(x + k, z - 1, 2); }
    for (let k = 0; k < d; k++) { push(x + w, z + k, 1); push(x - 1, z + k, 3); }
    // connected roads first; then prefer facing the street along the long side
    const long = (rot) => (rot % 2 === 0 ? w : d);
    out.sort((a, b) => (b.conn - a.conn) || (long(b.rot) - long(a.rot)));
    return out;
  }

  checkBuild(type, x, z, opts = {}) {
    const def = BUILDINGS[type];
    const W = opts.w ?? def.size, D = opts.d ?? def.size;
    const t = this.terrain;
    let reason = null;
    if (!opts.ignoreUnlock && this.unlockPop < unlockOf(type, 0)) reason = `Unlocks at ${unlockOf(type, 0)} villagers`;
    if (!reason && !opts.ignoreUnlock && !this.hasTech(def.tech)) reason = `Research ${this.techName(def.tech)} first`;
    if (def.unique && !opts.ignoreUnique) for (const b of this.buildings.values()) if (b.type === type) { reason = 'Only one allowed'; break; }
    let minH = Infinity, maxH = -Infinity, trees = 0;
    for (let dz = 0; dz < D && !reason; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const tx = x + dx, tz = z + dz;
        if (!this.inBounds(tx, tz)) { reason = 'Out of bounds'; break; }
        const i = this.idx(tx, tz);
        if (t.isWater(tx, tz)) { reason = "Can't build on water"; break; }
        if (this.roads[i]) { reason = 'A road is in the way'; break; }
        if (this.rails[i]) { reason = 'Railway track is in the way'; break; }
        if (this.buildingAt[i] >= 0) { reason = 'Occupied'; break; }
        minH = Math.min(minH, t.tileMin(tx, tz));
        maxH = Math.max(maxH, t.tileMax(tx, tz));
        trees += this.treeCount[i];
      }
    }
    if (!reason && maxH - minH > (Math.max(W, D) === 1 ? 0.9 : 1.1)) reason = 'Too steep here';
    const access = reason ? [] : this.findAccess(x, z, W, D);
    if (!reason && !def.park && !access.length) reason = 'Needs a road next to it';
    if (!reason && def.needsWater) {
      const ring = [];
      for (let k = -1; k <= W; k++) ring.push([x + k, z - 1], [x + k, z + D]);
      for (let k = 0; k < D; k++) ring.push([x - 1, z + k], [x + W, z + k]);
      if (!ring.some(([ax, az]) => this.inBounds(ax, az) && t.isWater(ax, az))) reason = 'Must be next to water';
    }
    const rail = !reason && def.needsRail ? this.findRail(x, z, W, D) : null;
    if (!reason && def.needsRail && !rail) reason = 'Needs railway track next to it';
    const cost = (opts.baseCost ?? def.levels[0].cost) + trees * CLEAR_COST;
    if (!reason && !opts.ignoreMoney && this.money < cost) reason = 'Not enough coins';
    return { ok: !reason, reason, cost, access, minH, maxH, trees, rail };
  }

  findRail(x, z, w, d = w) {
    const cand = [];
    for (let k = 0; k < w; k++) cand.push([x + k, z + d, 0], [x + k, z - 1, 2]);
    for (let k = 0; k < d; k++) cand.push([x + w, z + k, 1], [x - 1, z + k, 3]);
    for (const [ax, az, dir] of cand) if (this.railAt(ax, az)) return { x: ax, z: az, dir };
    return null;
  }

  // New buildings start as a building site (see Construction) unless placed
  // with opts.instant (world generation) or the instant-build sandbox switch.
  placeBuilding(type, x, z, opts = {}) {
    const chk = this.checkBuild(type, x, z, opts);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const def = BUILDINGS[type];
    const b = this._record(type, x, z, chk, opts);
    this._occupy(b);
    if (!opts.free) this.money -= chk.cost;
    if (!opts.instant && !this.sandbox.instantBuild) b.con = { kind: 'build', work: workNeeded(def.levels[b.level].cost), done: 0 };
    this.buildings.set(b.id, b);
    this._updateFronts(b);
    if (chk.trees) this.emit('trees');
    this.emit('building:add', b);
    return { ok: true, building: b, cost: chk.cost };
  }

  _record(type, x, z, chk, o = {}) {
    const def = BUILDINGS[type];
    const w = o.w ?? def.size, d = o.d ?? def.size;
    const variant = o.variant ?? ((Math.random() * 1e9) | 0);
    const pick = chk.access.length ? chk.access[(o.accessIndex || 0) % chk.access.length] : null;
    return {
      id: this.newId(), type, level: o.level || 0, x, z, size: Math.max(w, d), w, d, flavor: o.flavor || null, look: o.look || null,
      rot: pick ? pick.rot : variant % 4,
      variant,
      access: pick ? { x: pick.x, z: pick.z } : null,
      rail: chk.rail ? { x: chk.rail.x, z: chk.rail.z, dir: chk.rail.dir } : null,
      baseY: chk.maxH, minY: chk.minH,
      built: this.day,
      residents: [], workers: [],
      connected: !!(pick && this.connected[this.idx(pick.x, pick.z)]),
      happiness: o.happiness ?? 60, factors: o.factors ?? null,
      con: null,
    };
  }

  // A building comes forward into the street when every tile along its
  // front is road.
  _frontTiles(b) {
    const [dx, dz] = DIRS[b.rot];
    const W = fw(b), D = fd(b), tiles = [];
    if (dz) for (let k = 0; k < W; k++) tiles.push([b.x + k, dz > 0 ? b.z + D : b.z - 1]);
    else for (let k = 0; k < D; k++) tiles.push([dx > 0 ? b.x + W : b.x - 1, b.z + k]);
    return tiles;
  }

  _frontOf(b) {
    if (!b.access) return 0;
    const tiles = this._frontTiles(b);
    if (!tiles.every(([x, z]) => this.roadAt(x, z))) return 0;
    // two buildings on a street corner facing the same road tile would meet
    // in its corner, so neither of them comes forward there
    const [dx, dz] = DIRS[b.rot];
    for (const [x, z] of tiles) for (const s of [-1, 1]) {
      const o = this.buildingOn(x + (dz ? s : 0), z + (dx ? s : 0));
      if (o && o !== b && o.access && this._frontTiles(o).some(([fx, fz]) => fx === x && fz === z)) return 0;
    }
    return FRONT;
  }

  // Re-decide every building's street front (after building, demolishing or
  // re-laying roads). The new building itself, if any, is not refitted.
  _updateFronts(except = null) {
    const refit = [];
    for (const b of this.buildings.values()) {
      const f = this._frontOf(b);
      if (f !== (b.front || 0)) { b.front = f; if (b !== except) refit.push(b); }
    }
    for (const b of refit) this.emit('building:refit', b);
  }

  _occupy(b) {
    for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) {
      this.buildingAt[this.idx(b.x + dx, b.z + dz)] = b.id;
      this._clearTrees(b.x + dx, b.z + dz);
    }
    this._clearTreesNear(b.x, b.z, b.w, b.d, 0.22);
  }

  // Take a building off the map without refunds or rehousing (its people
  // and line stops have already been pointed elsewhere).
  _detach(b) {
    this._dissolveLeases(b);
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) this.buildingAt[this.idx(b.x + dx, b.z + dz)] = -1;
    this.buildings.delete(b.id);
    this.emit('building:remove', b);
    this._updateFronts();
  }

  // Point everyone and everything that refers to one building at another.
  _retarget(from, to) {
    for (const r of this.residents.values()) {
      if (r.home === from) r.home = to;
      if (r.job === from) r.job = to;
      if (r.at === from) r.at = to;
      if (r.site === from) r.site = null;
      if (r.plan) for (const p of r.plan) if (p.dest === from) p.dest = to;
    }
    let lines = false;
    for (const l of this.lines) {
      const i = l.stops.indexOf(from);
      if (i >= 0) { l.stops[i] = to; lines = true; }
    }
    if (lines) this.emit('lines');
  }

  buildValue(b) {
    const def = BUILDINGS[b.type];
    let v = 0;
    for (let l = 0; l <= b.level; l++) v += def.levels[l].cost;
    return v;
  }

  // Called by Construction when the builders have done all the work.
  finishConstruction(b) {
    const con = b.con;
    if (!con) return;
    if (con.kind === 'demolish') { this.removeBuilding(b.id); return; }
    if (con.kind === 'dismantle') {
      const dest = this.buildings.get(con.dest);
      this._detach(b);
      if (dest && dest.con && dest.con.wait === 'dismantle') {
        dest.con.wait = 'haul';
        this.emit('building:dismantled', { from: b, to: dest });
      }
      return;
    }
    if (con.kind === 'upgrade') {
      if (con.toType && BUILDINGS[con.toType]) b.type = con.toType;
      if (con.look !== undefined) b.look = con.look;
      b.level = Math.min(con.to, BUILDINGS[b.type].levels.length - 1);
    }
    if (con.kind === 'build') b.built = this.day;
    b.con = null;
    // a cottage rebuilt as something grander takes its garden back
    if (b.type !== 'house') this._dissolveLeases(b, true);
    this.emit('building:change', b);
    this.emit('building:done', { building: b, kind: con.kind, moved: !!con.moved });
    if (BUILDINGS[b.type].spacious) this.tryEncroach(b);
  }

  // ---------------------------------------------------------- land deals
  // A big home (def.spacious) can buy a strip of garden from a cottage or
  // family house next door. Its plot grows by LAND tiles on that side and the
  // seller's shrinks by the same amount, so the two never overlap. The buyer's
  // household pays the seller's household (not the town).
  tryEncroach(b) {
    const LAND = 0.25;
    if (!b || !BUILDINGS[b.type].spacious || b.con || fw(b) !== 1 || fd(b) !== 1) return [];
    b.leases ||= [];
    const ext = this._ext(b);
    const sold = [];
    const sides = [['x1', 1, 0, 'x0'], ['x0', -1, 0, 'x1'], ['z1', 0, 1, 'z0'], ['z0', 0, -1, 'z1']];
    for (const [side, dx, dz, opp] of sides) {
      if (b.leases.length >= 2) break;
      if (ext[side]) continue;
      const o = this.buildingOn(b.x + dx, b.z + dz);
      if (!o || o.type !== 'house' || o.con || fw(o) !== 1 || fd(o) !== 1) continue;
      const oe = this._ext(o);
      // a seller gives up at most one strip on each axis, and keeps its street side
      if (oe[side[0] + '0'] < 0 || oe[side[0] + '1'] < 0) continue;
      if (o.access && o.access.x === b.x && o.access.z === b.z) continue;
      const price = 60 + 40 * b.level + (b.type === 'villa' ? 30 : 0);
      ext[side] = LAND;
      oe[opp] = -LAND;
      b.leases.push({ with: o.id, side, amt: LAND, price, buyer: true });
      (o.leases ||= []).push({ with: b.id, side: opp, amt: LAND, price, buyer: false });
      sold.push(o);
      this.emit('building:refit', o);
      this.emit('land:sold', { buyer: b, seller: o, price });
    }
    if (sold.length) this.emit('building:refit', b);
    return sold;
  }

  _ext(b) { return (b.ext ||= { x0: 0, x1: 0, z0: 0, z1: 0 }); }

  // Undo every land deal a building is part of (it was demolished, moved,
  // joined or rebuilt as something that no longer fits the deal).
  _dissolveLeases(b, onlySold = false) {
    if (!b.leases || !b.leases.length) return;
    const keep = [];
    for (const l of b.leases) {
      if (onlySold && l.buyer) { keep.push(l); continue; }
      this._ext(b)[l.side] = 0;
      const o = this.buildings.get(l.with);
      if (!o || !o.leases) continue;
      const opp = { x0: 'x1', x1: 'x0', z0: 'z1', z1: 'z0' }[l.side];
      o.leases = o.leases.filter(x => x.with !== b.id);
      this._ext(o)[opp] = 0;
      if (o !== b) this.emit('building:refit', o);
    }
    b.leases = keep;
  }

  // Each morning a few big homes look for garden land to buy.
  encroachPass(rng = Math.random) {
    for (const b of [...this.buildings.values()]) {
      if (BUILDINGS[b.type].spacious && !b.con && (b.leases || []).length < 2 && rng() < 0.3) this.tryEncroach(b);
    }
  }

  // ----------------------------------------------------------- expansion
  // Grow a 1×1 building onto the plot beside or behind it. Empty land is
  // simply taken; a small neighbour is either squeezed (it sells a garden
  // strip and keeps its house) or bought out and demolished.
  expandOptions(b) {
    const out = [];
    const def = BUILDINGS[b.type];
    if (!b || b.con || def.merged || def.park || def.stop || fw(b) !== 1 || fd(b) !== 1 || def.size !== 1) return out;
    const base = Math.round(80 + 0.35 * def.levels[b.level].cost);
    const front = DIRS[b.rot];
    const sideOf = (k) => (k === b.rot ? 'in front' : (k + 2) % 4 === b.rot ? 'behind' : 'beside');
    const names = { 0: 'z1', 1: 'x1', 2: 'z0', 3: 'x0' };
    DIRS.forEach(([dx, dz], k) => {
      const x = b.x + dx, z = b.z + dz;
      if (!this.inBounds(x, z) || this.roadAt(x, z) || this.railAt(x, z) || this.terrain.isWater(x, z)) return;
      const lo = Math.min(this.terrain.tileMin(x, z), this.terrain.tileMin(b.x, b.z)), hi = Math.max(this.terrain.tileMax(x, z), this.terrain.tileMax(b.x, b.z));
      if (hi - lo > 1.1) return;
      const o = this.buildingOn(x, z);
      const where = sideOf(k);
      const trees = this.treeCount[this.idx(x, z)] * CLEAR_COST;
      if (!o) { out.push({ dir: k, x, z, kind: 'land', where, cost: base + trees, label: `Take the empty plot ${where}` }); return; }
      if (o.con || BUILDINGS[o.type].unique || fw(o) !== 1 || fd(o) !== 1) return;
      const oname = BUILDINGS[o.type].levels[o.level].name;
      // squeeze: buy a strip of a cottage's garden (it keeps its house)
      const side = names[k], opp = names[(k + 2) % 4];
      const be = b.ext || {}, oe = o.ext || {};
      if (o.type === 'house' && !be[side] && !(oe[side[0] + '0'] < 0 || oe[side[0] + '1'] < 0)) {
        out.push({ dir: k, x, z, kind: 'strip', where, other: o, side, opp, cost: 60 + 40 * b.level, label: `Buy a strip of the ${oname}'s garden ${where}`, warn: `The ${oname} next door gets a smaller garden (its owners are paid)` });
      }
      const comp = Math.round(this.buildValue(o) * 0.5);
      out.push({ dir: k, x, z, kind: 'takeover', where, other: o, cost: base + comp, comp, label: `Take over the ${oname} ${where}`,
        warn: `The ${oname} will be demolished${o.residents.length ? ` and its ${o.residents.length} resident${o.residents.length > 1 ? 's' : ''} rehoused` : ''} (🪙 ${comp} compensation included)` });
    });
    return out;
  }

  expandBuilding(id, dir, kind) {
    const b = this.buildings.get(id);
    const opt = b && this.expandOptions(b).find(o => o.dir === dir && o.kind === kind);
    if (!opt) return { ok: false, reason: "Can't expand that way" };
    if (this.money < opt.cost) return { ok: false, reason: 'Not enough coins' };
    if (opt.kind === 'strip') {
      const LAND = 0.25;
      this.money -= opt.cost;
      this._ext(b)[opt.side] = LAND;
      this._ext(opt.other)[opt.opp] = -LAND;
      (b.leases ||= []).push({ with: opt.other.id, side: opt.side, amt: LAND, price: opt.cost, buyer: true });
      (opt.other.leases ||= []).push({ with: b.id, side: opt.opp, amt: LAND, price: opt.cost, buyer: false });
      this.emit('building:refit', opt.other);
      this.emit('building:refit', b);
      this.emit('land:sold', { buyer: b, seller: opt.other, price: opt.cost });
      return { ok: true, building: b, kind: 'strip' };
    }
    if (opt.other) this.removeBuilding(opt.other.id, 0);
    this.money -= opt.cost;
    this._dissolveLeases(b);
    this._clearTrees(opt.x, opt.z);
    this.buildingAt[this.idx(opt.x, opt.z)] = b.id;
    const x0 = Math.min(b.x, opt.x), z0 = Math.min(b.z, opt.z);
    b.w = b.x !== opt.x ? 2 : 1; b.d = b.z !== opt.z ? 2 : 1;
    b.x = x0; b.z = z0; b.size = 2;
    let minH = Infinity, maxH = -Infinity;
    for (let dz = 0; dz < b.d; dz++) for (let dx = 0; dx < b.w; dx++) {
      minH = Math.min(minH, this.terrain.tileMin(b.x + dx, b.z + dz));
      maxH = Math.max(maxH, this.terrain.tileMax(b.x + dx, b.z + dz));
    }
    b.baseY = maxH; b.minY = minH;
    this._updateFronts(b);
    this._clearTreesNear(b.x, b.z, b.w, b.d, 0.22);
    if (!this.sandbox.instantBuild) b.con = { kind: 'upgrade', to: b.level, toType: b.type, work: workNeeded(opt.cost, 'upgrade'), done: 0, expand: true };
    this.emit('trees');
    this.emit('building:change', b);
    return { ok: true, building: b, kind: opt.kind };
  }

  // ---------------------------------------------------------- demolition
  // A demolition crew (builders, or hired hands) pulls the building down
  // over time. People move out at once; plots that are still only pegged
  // out, and anything in instant-build sandbox, are cleared straight away.
  demolishBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return { ok: false };
    if (b.con && b.con.kind === 'demolish') return { ok: false, reason: 'Already being demolished' };
    if (this.sandbox.instantBuild || (b.con && (b.con.kind === 'build' || b.con.kind === 'dismantle'))) {
      this.removeBuilding(id);
      return { ok: true, instant: true };
    }
    this._dissolveLeases(b);
    b.con = { kind: 'demolish', work: workNeeded(this.buildValue(b), 'demolish'), done: 0 };
    this.emit('building:vacate', b);
    this.emit('building:change', b);
    return { ok: true, building: b };
  }

  // ------------------------------------------------------------- moving
  moveCost(b) { return Math.round(40 + this.buildValue(b) * 0.3); }

  moveCheck(b, x, z) {
    if (b.con) return { ok: false, reason: 'Construction under way', access: [], cost: 0 };
    return this.checkBuild(b.type, x, z, { w: fw(b), d: fd(b), ignoreUnlock: true, ignoreUnique: true, baseCost: this.moveCost(b) });
  }

  // Moving = builders take the building down, a cart hauls the materials
  // over, and it goes back up on the new plot. People and line stops move
  // to the new plot straight away.
  moveBuilding(id, x, z, opts = {}) {
    const b = this.buildings.get(id);
    if (!b) return { ok: false, reason: 'That building is gone' };
    const chk = this.moveCheck(b, x, z);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const nb = this._record(b.type, x, z, chk, {
      w: fw(b), d: fd(b), level: b.level, variant: b.variant, flavor: b.flavor, look: b.look, accessIndex: opts.accessIndex,
      happiness: b.happiness, factors: b.factors,
    });
    this._occupy(nb);
    this.money -= chk.cost;
    this._retarget(b.id, nb.id);
    this.buildings.set(nb.id, nb);
    this._updateFronts(nb);
    if (this.sandbox.instantBuild) {
      this._detach(b);
      if (chk.trees) this.emit('trees');
      this.emit('building:add', nb);
      return { ok: true, building: nb, cost: chk.cost, instant: true };
    }
    const value = this.buildValue(b);
    nb.con = { kind: 'build', work: workNeeded(value, 'rebuild'), done: 0, wait: 'dismantle', from: b.id, moved: true };
    b.con = { kind: 'dismantle', work: workNeeded(value, 'dismantle'), done: 0, dest: nb.id };
    if (chk.trees) this.emit('trees');
    this.emit('building:add', nb);
    this.emit('building:change', b);
    return { ok: true, building: nb, old: b, cost: chk.cost };
  }

  // ------------------------------------------------------------ merging
  mergeOptions(b) {
    const out = [];
    if (!b || b.con || fw(b) !== 1 || fd(b) !== 1) return out;
    for (const [dx, dz] of DIRS) {
      const o = this.buildingOn(b.x + dx, b.z + dz);
      if (!o || o.con || fw(o) !== 1 || fd(o) !== 1) continue;
      const m = mergeResult(b, o);
      if (m && this.hasTech(BUILDINGS[m.type].tech)) out.push({ other: o, ...m, ok: this.money >= m.cost });
    }
    return out;
  }

  mergeBuildings(aId, bId) {
    const a = this.buildings.get(aId), o = this.buildings.get(bId);
    const opt = this.mergeOptions(a).find(m => m.other === o);
    if (!opt) return { ok: false, reason: "These two can't be joined" };
    if (this.money < opt.cost) return { ok: false, reason: 'Not enough coins' };
    const x = Math.min(a.x, o.x), z = Math.min(a.z, o.z), w = a.x !== o.x ? 2 : 1, d = a.z !== o.z ? 2 : 1;
    let minH = Infinity, maxH = -Infinity;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      minH = Math.min(minH, this.terrain.tileMin(x + dx, z + dz));
      maxH = Math.max(maxH, this.terrain.tileMax(x + dx, z + dz));
    }
    if (maxH - minH > 1.1) return { ok: false, reason: 'The ground is too uneven to join them' };
    const access = this.findAccess(x, z, w, d);
    if (!access.length) return { ok: false, reason: 'Needs a road alongside' };
    const nb = this._record(opt.type, x, z, { access, rail: null, minH, maxH }, {
      w, d, level: opt.level, variant: opt.base.variant, flavor: opt.flavor, look: opt.base.look, happiness: opt.base.happiness, factors: opt.base.factors,
    });
    this.money -= opt.cost;
    this._retarget(a.id, nb.id);
    this._retarget(o.id, nb.id);
    this._detach(a);
    this._detach(o);
    this._occupy(nb);
    if (!this.sandbox.instantBuild) nb.con = { kind: 'merge', work: workNeeded(opt.cost * 3, 'merge'), done: 0 };
    this.buildings.set(nb.id, nb);
    this._updateFronts(nb);
    this.emit('building:add', nb);
    return { ok: true, building: nb, cost: opt.cost };
  }

  // Restore a building from a save without any checks.
  restoreBuilding(rec) {
    const def = BUILDINGS[rec.type];
    if (!def) return;
    const w = rec.w || def.size, d = rec.d || def.size;
    let minH = Infinity, maxH = -Infinity;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      minH = Math.min(minH, this.terrain.tileMin(rec.x + dx, rec.z + dz));
      maxH = Math.max(maxH, this.terrain.tileMax(rec.x + dx, rec.z + dz));
    }
    const b = {
      id: rec.id, type: rec.type, level: Math.min(rec.level, def.levels.length - 1), x: rec.x, z: rec.z, size: Math.max(w, d), w, d,
      flavor: rec.flavor || null, look: rec.look || null, con: rec.con && typeof rec.con === 'object' ? { ...rec.con } : null,
      rot: rec.rot, variant: rec.variant, access: null, rail: null, baseY: maxH, minY: minH, built: rec.built || 1,
      residents: [], workers: [], connected: false, happiness: 60, factors: null,
    };
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) this.buildingAt[this.idx(rec.x + dx, rec.z + dz)] = b.id;
    if (Array.isArray(rec.leases) && rec.leases.length) {
      b.leases = rec.leases.map(l => ({ ...l }));
      const e = this._ext(b);
      for (const l of b.leases) e[l.side] = l.buyer ? l.amt : -l.amt;
    }
    this.buildings.set(b.id, b);
  }

  // What a building can become next: its next level, or at the top level
  // the first level of each branch type (e.g. Family House → Villa / Flats).
  upgradeOptions(b) {
    const def = BUILDINGS[b.type];
    if (def.levels[b.level + 1]) return [{ type: b.type, level: b.level + 1 }];
    return (def.branches || []).map(type => ({ type, level: 0 }));
  }

  upgradeCheck(b, toType = null) {
    const opts = this.upgradeOptions(b);
    const target = opts.find(o => o.type === toType) || opts[0];
    if (!target) return { ok: false, reason: 'Fully upgraded', max: true };
    const next = BUILDINGS[target.type].levels[target.level];
    if (b.con) return { ok: false, reason: 'Construction under way', busy: true, next, target, reqs: [] };
    const unlock = unlockOf(target.type, target.level);
    const tech = next.tech || (target.type !== b.type ? BUILDINGS[target.type].tech : null);
    const reqs = [];
    const free = this.sandbox.freeUpgrades;
    if (free) reqs.push({ label: 'Sandbox: no requirements', met: true });
    if (unlock && !free) reqs.push({ label: `${unlock} villagers`, met: this.unlockPop >= unlock });
    if (next.req && !free) {
      if (next.req.happiness) reqs.push({ label: `Happiness ${next.req.happiness}%`, met: (b.happiness || 0) >= next.req.happiness });
      for (const s of ['water', 'health', 'education', 'safety', 'culture']) {
        if (next.req[s]) reqs.push({ label: `${s[0].toUpperCase() + s.slice(1)} coverage`, met: !!(b.factors && b.factors[s]) });
      }
      if (next.req.power) reqs.push({ label: 'Electricity', met: !!b.powered });
    }
    if (tech) reqs.unshift({ label: `Research: ${this.techName(tech)}`, met: this.hasTech(tech), tech });
    reqs.push({ label: `${next.cost} coins`, met: this.money >= next.cost });
    const ok = reqs.every(r => r.met);
    return { ok, next, target, reqs, reason: ok ? null : 'Requirements not met' };
  }

  upgradeBuilding(id, toType = null, look = undefined) {
    if (look && !this.hasTech(STYLE_TECH_OF(look))) look = undefined;
    const b = this.buildings.get(id);
    if (!b) return { ok: false };
    const chk = this.upgradeCheck(b, toType);
    if (!chk.ok) return chk;
    this.money -= chk.next.cost;
    const { type, level } = chk.target;
    if (this.sandbox.instantBuild) {
      b.type = type;
      b.level = level;
      if (look !== undefined) b.look = look;
      this.emit('building:change', b);
      return { ok: true, building: b, instant: true };
    }
    b.con = { kind: 'upgrade', to: level, toType: type, work: workNeeded(chk.next.cost, 'upgrade'), done: 0 };
    if (look !== undefined) b.con.look = look;
    this.emit('building:change', b);
    return { ok: true, building: b };
  }

  removeBuilding(id, refund = 0.25) {
    const b = this.buildings.get(id);
    if (!b) return;
    // demolishing a building that was being taken down for a move: the new
    // plot gets on with it using fresh materials
    if (b.con && b.con.kind === 'dismantle') {
      const dest = this.buildings.get(b.con.dest);
      if (dest && dest.con && dest.con.wait) dest.con.wait = null;
    }
    this._dissolveLeases(b);
    for (let dz = 0; dz < fd(b); dz++) for (let dx = 0; dx < fw(b); dx++) this.buildingAt[this.idx(b.x + dx, b.z + dz)] = -1;
    this.buildings.delete(id);
    const def = BUILDINGS[b.type];
    let value = 0;
    for (let l = 0; l <= b.level; l++) value += def.levels[l].cost;
    this.money += Math.round(value * refund);
    this.emit('building:remove', b);
    this._updateFronts();
    if (def.stop) {
      let changed = false;
      for (const line of this.lines) {
        const n = line.stops.length;
        line.stops = line.stops.filter(s => s !== id);
        if (line.stops.length !== n) changed = true;
      }
      if (changed) this.emit('lines');
    }
  }

  // ---------------------------------------------------------------- rails
  checkRail(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const i = this.idx(x, z);
    const t = this.terrain;
    if (this.buildingAt[i] >= 0) return { ok: false, reason: 'A building is in the way' };
    if (this.rails[i]) return { ok: true, cost: 0, noop: true };
    const water = t.isWater(x, z);
    if (!water && t.slope(x, z) > 0.6) return { ok: false, reason: 'Too steep for track' };
    if (water && t.tileAvg(x, z) < -0.9) return { ok: false, reason: 'Water too deep' };
    if (this.unlockPop < 25) return { ok: false, reason: 'Railways unlock at 25 villagers' };
    if (!this.hasTech('railways')) return { ok: false, reason: 'Research Railways first' };
    let cost = RAIL_COST * (water ? BRIDGE_MULT : 1) + this.treeCount[i] * CLEAR_COST;
    return { ok: true, cost, water };
  }

  placeRails(tiles) {
    let placed = 0, spent = 0, failed = null;
    for (const [x, z] of tiles) {
      const c = this.checkRail(x, z);
      if (!c.ok) { failed ||= c.reason; continue; }
      if (c.noop) continue;
      if (this.money < c.cost) { failed = 'Not enough coins'; break; }
      this.money -= c.cost; spent += c.cost; placed++;
      this.rails[this.idx(x, z)] = 1;
      this._clearTrees(x, z);
      this._clearTreesNear(x, z, 1, 1, 0.2);
    }
    if (placed) { this.updateRailLinks(); this.emit('trees'); }
    return { placed, spent, failed };
  }

  removeRail(x, z) {
    if (!this.railAt(x, z)) return false;
    this.rails[this.idx(x, z)] = 0;
    this.updateRailLinks();
    return true;
  }

  updateRailLinks() {
    for (const b of this.buildings.values()) {
      if (!BUILDINGS[b.type].needsRail) continue;
      const r = this.findRail(b.x, b.z, fw(b), fd(b));
      const changed = !!r !== !!b.rail || (r && b.rail && (r.x !== b.rail.x || r.z !== b.rail.z));
      b.rail = r ? { x: r.x, z: r.z, dir: r.dir } : null;
      if (changed) this.emit('building:change', b);
    }
    this.emit('rails');
  }

  // ---------------------------------------------------------------- roads
  checkRoad(x, z, level, opts = {}) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const i = this.idx(x, z);
    const t = this.terrain;
    if (this.buildingAt[i] >= 0) return { ok: false, reason: 'A building is in the way' };
    const water = t.isWater(x, z);
    if (!water && t.slope(x, z) > 0.85) return { ok: false, reason: 'Too steep for a road' };
    if (water && t.tileAvg(x, z) < -0.9) return { ok: false, reason: 'Water too deep' };
    if (!opts.ignoreUnlock && this.unlockPop < ROAD_LEVELS[level].unlock) return { ok: false, reason: `Unlocks at ${ROAD_LEVELS[level].unlock} villagers` };
    const cur = this.roads[i];
    if (cur >= level) return { ok: true, cost: 0, noop: true };
    let cost = ROAD_LEVELS[level].cost - (cur ? ROAD_LEVELS[cur].cost : 0);
    if (water) cost *= BRIDGE_MULT;
    if (!cur) cost += this.treeCount[i] * CLEAR_COST;
    return { ok: true, cost, water };
  }

  placeRoads(tiles, level) {
    let placed = 0, spent = 0, failed = null;
    for (const [x, z] of tiles) {
      const c = this.checkRoad(x, z, level);
      if (!c.ok) { failed ||= c.reason; continue; }
      if (c.noop) continue;
      if (this.money < c.cost) { failed = 'Not enough coins'; break; }
      this.money -= c.cost; spent += c.cost; placed++;
      this.roads[this.idx(x, z)] = level;
      this._clearTrees(x, z);
    }
    if (placed) { this.updateRoadNetwork(); this.emit('trees'); }
    return { placed, spent, failed };
  }

  removeRoad(x, z) {
    if (!this.roadAt(x, z)) return false;
    if (x === this.entry.x && z === this.entry.z) return 'The road to the outside world must stay';
    this.roads[this.idx(x, z)] = 0;
    this.updateRoadNetwork();
    return true;
  }

  updateRoadNetwork() {
    const N = this.N;
    this.connected.fill(0);
    const q = [];
    const e = this.idx(this.entry.x, this.entry.z);
    if (this.roads[e]) { this.connected[e] = 1; q.push(e); }
    while (q.length) {
      const i = q.pop();
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!this.inBounds(nx, nz)) continue;
        const ni = nz * N + nx;
        if (this.roads[ni] && !this.connected[ni]) { this.connected[ni] = 1; q.push(ni); }
      }
    }
    for (const b of this.buildings.values()) {
      const acc = this.findAccess(b.x, b.z, fw(b), fd(b));
      const keep = b.access && acc.find(a => a.x === b.access.x && a.z === b.access.z && (a.conn || !acc[0].conn));
      const pick = keep || acc[0] || null;
      b.access = pick ? { x: pick.x, z: pick.z } : null;
      b.connected = !!(pick && pick.conn);
    }
    this.emit('roads');
    this._updateFronts();
  }

  // -------------------------------------------------------------- terrain
  checkTerraform(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    for (let tz = z - 1; tz <= z + 1; tz++) for (let tx = x - 1; tx <= x + 1; tx++) {
      if (this.inBounds(tx, tz) && this.buildingAt[this.idx(tx, tz)] >= 0) return { ok: false, reason: 'Too close to a building' };
    }
    if (this.money < TERRAFORM_COST) return { ok: false, reason: 'Not enough coins' };
    return { ok: true, cost: TERRAFORM_COST };
  }

  terraform(x, z, mode) {
    const c = this.checkTerraform(x, z);
    if (!c.ok) return c;
    const t = this.terrain;
    const corners = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (mode === 'flatten') {
      const avg = corners.reduce((s, [cx, cz]) => s + t.ch(cx, cz), 0) / 4;
      for (const [cx, cz] of corners) t.setCh(cx, cz, avg);
    } else {
      const d = mode === 'raise' ? 0.25 : -0.25;
      for (const [cx, cz] of corners) t.setCh(cx, cz, Math.max(-1.2, Math.min(4.5, t.ch(cx, cz) + d)));
    }
    this.money -= c.cost;
    this.updateRoadNetwork();
    this.emit('terrain', { x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 });
    return { ok: true, cost: c.cost };
  }

  // ---------------------------------------------------------------- trees
  _clearTrees(x, z) {
    const i = this.idx(x, z);
    if (!this.treeCount[i]) return 0;
    const n = this.treeCount[i];
    this.trees = this.trees.filter(tr => tr.t !== i);
    this.treeCount[i] = 0;
    return n;
  }

  // Trees growing right up against a new wall or track would poke through it.
  _clearTreesNear(x, z, w, d, margin) {
    const x0 = x - margin, x1 = x + w + margin, z0 = z - margin, z1 = z + d + margin;
    const before = this.trees.length;
    this.trees = this.trees.filter((tr) => {
      if (tr.x < x0 || tr.x > x1 || tr.z < z0 || tr.z > z1) return true;
      this.treeCount[tr.t] = Math.max(0, this.treeCount[tr.t] - 1);
      return false;
    });
    return before - this.trees.length;
  }

  addTree(x, z, k, s, r) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!this.inBounds(tx, tz)) return;
    const i = this.idx(tx, tz);
    if (this.treeCount[i] >= 250) return;
    this.trees.push({ x, z, k, s, r, t: i });
    this.treeCount[i]++;
  }

  checkPlant(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const i = this.idx(x, z);
    if (this.terrain.isWater(x, z)) return { ok: false, reason: "Trees don't grow in water" };
    if (this.roads[i] || this.buildingAt[i] >= 0) return { ok: false, reason: 'Occupied' };
    if (this.treeCount[i] >= 4) return { ok: false, reason: 'No room for more trees' };
    if (this.money < TREE_COST) return { ok: false, reason: 'Not enough coins' };
    return { ok: true, cost: TREE_COST };
  }

  plantTree(x, z) {
    const c = this.checkPlant(x, z);
    if (!c.ok) return c;
    const r = Math.random;
    const h = this.terrain.tileAvg(x, z);
    const k = h > 1.6 ? (r() < 0.7 ? TREE.PINE : TREE.ROUND) : [TREE.ROUND, TREE.ROUND, TREE.BIRCH, TREE.PINE][(r() * 4) | 0];
    this.addTree(x + 0.2 + r() * 0.6, z + 0.2 + r() * 0.6, k, 0.75 + r() * 0.5, r() * Math.PI * 2);
    this.money -= c.cost;
    this.emit('trees');
    return { ok: true, cost: c.cost };
  }

  // ---------------------------------------------------------- bulldozing
  bulldoze(x, z) {
    if (!this.inBounds(x, z)) return { ok: false };
    const b = this.buildingOn(x, z);
    if (b) { const r = this.demolishBuilding(b.id); return { ok: r.ok, what: 'building', building: b, reason: r.reason }; }
    if (this.railAt(x, z)) { this.removeRail(x, z); return { ok: true, what: 'rail' }; }
    if (this.roadAt(x, z)) {
      const r = this.removeRoad(x, z);
      if (r !== true) return { ok: false, reason: r };
      return { ok: true, what: 'road' };
    }
    const i = this.idx(x, z);
    if (this.treeCount[i]) {
      const cost = this.treeCount[i] * CLEAR_COST;
      if (this.money < cost) return { ok: false, reason: 'Not enough coins' };
      this.money -= cost;
      this._clearTrees(x, z);
      this.emit('trees');
      return { ok: true, what: 'trees', cost };
    }
    return { ok: false };
  }

  // ------------------------------------------------------------ creation
  static createNew({ N = 48, seed, name, sandbox = null }) {
    const { terrain, start, entryPath } = generateTerrain(N, seed);
    const w = new World(N, seed, terrain);
    w.townName = name || 'Hearthvale';
    if (sandbox) w.setSandbox(sandbox);
    for (const [x, z] of entryPath) w.roads[w.idx(x, z)] = 1;
    const last = entryPath[entryPath.length - 1];
    w.entry = { x: last[0], z: last[1] };
    w._layFoundingStreets(start, entryPath);
    w.updateRoadNetwork();
    w.generateNature(start);
    w._placeFoundingBuildings(start, entryPath);
    w.updateRoadNetwork();
    return w;
  }

  _layFoundingStreets(start, path) {
    const t = this.terrain;
    const first = path[1] || [start.x + 1, start.z];
    const dir = [Math.sign(first[0] - start.x), Math.sign(first[1] - start.z)];
    const perp = [dir[1], dir[0]];
    const extend = (d, len) => {
      for (let k = 1; k <= len; k++) {
        const x = start.x + d[0] * k, z = start.z + d[1] * k;
        if (!this.inBounds(x, z) || t.isWater(x, z) || t.slope(x, z) > 0.6) break;
        this.roads[this.idx(x, z)] = 1;
      }
    };
    extend(perp, 4);
    extend([-perp[0], -perp[1]], 4);
    extend([-dir[0], -dir[1]], 3);
  }

  _placeFoundingBuildings(start) {
    const spots = [];
    for (let z = start.z - 7; z <= start.z + 7; z++) for (let x = start.x - 7; x <= start.x + 7; x++) {
      if (this.inBounds(x, z)) spots.push([x, z, Math.hypot(x - start.x, z - start.z)]);
    }
    spots.sort((a, b) => a[2] - b[2]);
    const opts = { free: true, ignoreMoney: true, ignoreUnlock: true, instant: true };
    const place = (type, extra = {}) => {
      for (const [x, z] of spots) {
        const r = this.placeBuilding(type, x, z, { ...opts, ...extra });
        if (r.ok) return r.building;
      }
      return null;
    };
    place('townhall');
    place('well');
    place('builder');
    place('house');
    place('house');
    place('market');
  }

  generateNature(start) {
    const N = this.N, t = this.terrain;
    const rng = new RNG(this.seed + 404);
    const nF = makeNoise2D(this.seed + 303);
    const nK = makeNoise2D(this.seed + 505);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, z);
        if (this.roads[i] || this.buildingAt[i] >= 0 || t.isWater(x, z)) continue;
        const h = t.tileAvg(x, z), slope = t.slope(x, z);
        const forest = fbm(nF, x * 0.085, z * 0.085, 3);
        const dStart = start ? Math.hypot(x - start.x, z - start.z) : 99;
        const nearStart = dStart < 8;
        let p = forest > 0.12 ? 0.5 + forest : 0.035;
        if (nearStart) p *= dStart < 5 ? 0 : 0.2;
        if (rng.chance(p)) {
          const count = forest > 0.35 && !nearStart ? rng.int(2, 3) : 1;
          for (let k = 0; k < count; k++) {
            const pinePref = h > 1.6 ? 0.8 : (nK(x * 0.1, z * 0.1) > 0.2 ? 0.6 : 0.15);
            const kind = rng.chance(pinePref) ? TREE.PINE : (rng.chance(0.2) ? TREE.BIRCH : TREE.ROUND);
            this.addTree(x + rng.float(0.15, 0.85), z + rng.float(0.15, 0.85), kind, rng.float(0.7, 1.25), rng.float(0, 6.28));
          }
        } else if (!nearStart && h < 0.35 && rng.chance(0.18)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), TREE.BUSH, rng.float(0.7, 1.2), rng.float(0, 6.28));
        }
        if ((slope > 0.45 || h > 2.2) && rng.chance(0.3)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), TREE.ROCK, rng.float(0.6, 1.4), rng.float(0, 6.28));
        } else if (!nearStart && rng.chance(0.02)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), rng.chance(0.5) ? TREE.ROCK : TREE.PEBBLE, rng.float(0.5, 1), rng.float(0, 6.28));
        }
        if (!nearStart && rng.chance(0.05)) {
          this.addTree(x + rng.float(0.2, 0.8), z + rng.float(0.2, 0.8), TREE.BUSH, rng.float(0.6, 1), rng.float(0, 6.28));
        }
      }
    }
  }
}

export function bridgeDeckY() { return CONFIG.WATER_LEVEL + 0.2; }
// length of the approach ramp onto a bridge, in tiles
export const RAMP = 0.5;

// Point on the shared edge between a building's footprint and its access road.
export function doorPoint(b) {
  if (!b.access) return { x: b.x + fw(b) / 2, z: b.z + fd(b) / 2 };
  const ax = b.access.x, az = b.access.z;
  const cx = Math.min(Math.max(ax, b.x), b.x + fw(b) - 1);
  const cz = Math.min(Math.max(az, b.z), b.z + fd(b) - 1);
  return { x: (ax + cx) / 2 + 0.5, z: (az + cz) / 2 + 0.5 };
}

export function buildingCenter(b) {
  return { x: b.x + fw(b) / 2, z: b.z + fd(b) / 2 };
}
